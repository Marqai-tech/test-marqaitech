import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';

/**
 * GET /api/dashboard — aggregate stats for the mobile home screen (and any
 * other consumer).
 *
 * ROBUSTNESS CONTRACT (Task 107):
 *  - Queries run against the REQUEST-SCOPED tenant DB (getDb(req)) exactly
 *    like every other module API — previously this route imported the
 *    platform DB client directly, so on tenant deployments it read the wrong
 *    database and returned zeros.
 *  - Correct Prisma models/fields: leaveRequest (not `leave`), jobPosting
 *    (not `job`), dateOfJoining (not `joiningDate`). The previous names
 *    referenced models/fields that do not exist, so the route ALWAYS threw
 *    and fell into the catch-branch zeros.
 *  - Every metric is independently fault-tolerant (allSettled): one failing
 *    count degrades to its fallback instead of blanking the whole dashboard.
 *
 * DATE-RANGE SUPPORT (Task — Employee Dashboard date filter):
 *  - Accepts `fromDate` / `toDate` (YYYY-MM-DD) query params. When supplied,
 *    `newHires` is recomputed to count employees who joined inside the
 *    window, `exitsThisPeriod` counts terminated/resigned employees whose
 *    updatedAt falls inside the window, and `onLeaveEmployees` counts
 *    distinct employees holding an APPROVED leave overlapping the window.
 *  - When omitted, the route behaves exactly as before (today / first of
 *    month) so existing consumers continue to work.
 */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scope: dataScope, companyId, ownCompanyId, userId } = scope;
    const isSelfOnly = dataScope === 'self';

    const db = await getDb(req);

    const effectiveCompanyId = companyId || ownCompanyId;
    const companyFilter = effectiveCompanyId ? { companyId: effectiveCompanyId } : {};

    let employeeFilter: Record<string, unknown> = { ...companyFilter, status: 'active' };

    if (isSelfOnly && userId) {
      employeeFilter = { userId, status: 'active' };
    } else if (dataScope === 'team' && userId) {
      const ownEmp = await db.employee.findFirst({
        where: { userId, status: 'active' },
        select: { departmentId: true },
      });
      if (ownEmp) {
        employeeFilter = { ...companyFilter, departmentId: ownEmp.departmentId, status: 'active' };
      }
    }

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const url = new URL(req.url);
    const reqUserId = url.searchParams.get('userId') || userId;

    // ─── Date range (Task — Employee Dashboard date filter) ───
    // `fromDate` / `toDate` (YYYY-MM-DD). When both are present the
    // date-sensitive KPIs are recalculated for the window. Defaults preserve
    // the legacy behavior (today + first of month).
    const fromDateParam = url.searchParams.get('fromDate');
    const toDateParam = url.searchParams.get('toDate');
    const validDate = (s: string | null): s is string =>
      !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime());

    let rangeStart = firstOfMonth;
    let rangeEnd = today;
    let hasCustomRange = false;
    if (validDate(fromDateParam) && validDate(toDateParam)) {
      rangeStart = new Date(`${fromDateParam}T00:00:00.000Z`);
      rangeEnd = new Date(`${toDateParam}T23:59:59.999Z`);
      hasCustomRange = true;
    }

    // ─── Employee filters by date window ───
    // Total / Active counts are HEAD-COUNT snapshots (not affected by the
    // date range — they answer "how many employees are on the books right
    // now within scope"). New hires / exits are the date-sensitive ones.
    const newHireFilter = {
      ...employeeFilter,
      dateOfJoining: { gte: rangeStart, lte: rangeEnd },
    };

    const exitsFilter = {
      ...companyFilter,
      status: { in: ['terminated', 'resigned'] },
      updatedAt: { gte: rangeStart, lte: rangeEnd },
    };
    if (isSelfOnly && userId) {
      // Self-scope employees can only see their own exit history
      (exitsFilter as Record<string, unknown>).userId = userId;
      delete (exitsFilter as Record<string, unknown>).companyId;
    }

    // Approved leaves overlapping the selected range (start ≤ rangeEnd AND
    // end ≥ rangeStart) — same overlap rule the Leave API uses.
    const leaveOverlapFilter: Record<string, unknown> = {
      status: 'approved',
      startDate: { lte: rangeEnd },
      endDate: { gte: rangeStart },
      employee: isSelfOnly && userId
        ? { userId }
        : { ...companyFilter, status: { in: ['active', 'on_leave'] } },
    };

    // Each metric resolves independently — a failure yields the fallback
    // value rather than rejecting the whole batch.
    const [totalEmployeesR, newHiresR, openPositionsR, attendanceTodayR, pendingLeavesR, pendingExpensesR, pendingTravelR, unreadR, activitiesR, recentNotifsR, deptDistR, departmentsR, exitsR, onLeaveR] =
      await Promise.allSettled([
        db.employee.count({ where: employeeFilter }),
        db.employee.count({ where: newHireFilter }),
        isSelfOnly ? Promise.resolve(0) : db.jobPosting.count({ where: { ...companyFilter, status: 'open' } }),
        db.attendance.count({ where: { date: { gte: today }, status: 'present', employee: employeeFilter } }),
        db.leaveRequest.count({ where: { status: 'pending', employee: employeeFilter } }),
        db.expenseClaim.count({ where: { status: 'pending', employee: employeeFilter } }),
        db.travelRequest.count({ where: { status: 'pending', employee: employeeFilter } }),
        reqUserId ? db.notification.count({ where: { userId: reqUserId, isRead: false } }) : Promise.resolve(0),
        db.auditLog.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true, email: true, avatar: true } } },
        }),
        reqUserId ? db.notification.findMany({ where: { userId: reqUserId }, take: 5, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
        db.employee.groupBy({ by: ['departmentId'], where: employeeFilter, _count: { id: true } }),
        db.department.findMany({ where: companyFilter, select: { id: true, name: true } }),
        // ─── Task: Employee Dashboard date filter — exits + on-leave ───
        db.employee.count({ where: exitsFilter }),
        db.leaveRequest.findMany({
          where: leaveOverlapFilter,
          select: { employeeId: true },
          distinct: ['employeeId'],
        }).then((rows: Array<{ employeeId: string }>) => rows.length),
      ]);

    const pick = <T>(r: PromiseSettledResult<T>, fallback: T): T => (r.status === 'fulfilled' ? r.value : fallback);
    const metricList = [totalEmployeesR, newHiresR, openPositionsR, attendanceTodayR, pendingLeavesR, pendingExpensesR, pendingTravelR, unreadR, activitiesR, recentNotifsR, deptDistR, departmentsR, exitsR, onLeaveR];
    const metricNames = ['totalEmployees', 'newHires', 'openPositions', 'attendanceToday', 'pendingLeaves', 'pendingExpenses', 'pendingTravel', 'unreadNotifications', 'recentActivities', 'recentNotifications', 'departmentDistribution', 'departments', 'exitsThisPeriod', 'onLeaveEmployees'];
    metricList.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[Dashboard] ${metricNames[i]} failed:`, (r as PromiseRejectedResult).reason?.message ?? (r as PromiseRejectedResult).reason);
    });

    const totalEmployees = pick(totalEmployeesR, 0);
    const newHires = pick(newHiresR, 0);
    const openPositions = pick(openPositionsR, 0);
    const totalAttendanceToday = pick(attendanceTodayR, 0);
    const pendingLeaves = pick(pendingLeavesR, 0);
    const pendingExpenses = pick(pendingExpensesR, 0);
    const pendingTravel = pick(pendingTravelR, 0);
    const unreadNotifications = pick(unreadR, 0);
    const recentActivities = pick(activitiesR, [] as unknown[]);
    const recentNotifications = pick(recentNotifsR, [] as unknown[]);
    const departmentDistribution = pick(deptDistR, [] as Array<{ departmentId: string; _count: { id: number } }>);
    const departments = pick(departmentsR, [] as Array<{ id: string; name: string }>);
    const exitsThisPeriod = pick(exitsR, 0);
    const onLeaveEmployees = pick(onLeaveR, 0);

    const attendanceRate = totalEmployees > 0 ? Math.round((totalAttendanceToday / totalEmployees) * 100) : 0;
    const pendingApprovals = pendingLeaves + pendingExpenses + pendingTravel;

    const deptMap = new Map(departments.map((d) => [d.id, d.name]));
    const departmentStats = departmentDistribution.map((d) => ({
      departmentId: d.departmentId,
      departmentName: deptMap.get(d.departmentId) || 'Unknown',
      count: d._count.id,
    }));

    return NextResponse.json({
      stats: {
        totalEmployees,
        newHires,
        openPositions,
        attendanceRate,
        pendingApprovals,
        unreadNotifications,
        dataScope,
        // ─── Task: Employee Dashboard date filter — surface the windowed
        //     metrics + the range itself so the client can show "Last 30 Days"
        //     prominently next to the KPIs. ───
        exitsThisPeriod,
        onLeaveEmployees,
        activeEmployees: totalEmployees, // snapshot (head-count of active)
        dateRange: hasCustomRange
          ? { fromDate: fromDateParam!, toDate: toDateParam!, applied: true }
          : { fromDate: null, toDate: null, applied: false },
      },
      recentActivities,
      recentNotifications,
      departmentStats,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({
      stats: {
        totalEmployees: 0,
        newHires: 0,
        openPositions: 0,
        attendanceRate: 0,
        pendingApprovals: 0,
        unreadNotifications: 0,
        dataScope: 'unknown',
        exitsThisPeriod: 0,
        onLeaveEmployees: 0,
        activeEmployees: 0,
        dateRange: { fromDate: null, toDate: null, applied: false },
      },
      recentActivities: [],
      recentNotifications: [],
      departmentStats: [],
    });
  }
}
