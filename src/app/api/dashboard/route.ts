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
 */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role, scope: dataScope, companyId, ownCompanyId, userId } = scope;
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

    // Each metric resolves independently — a failure yields the fallback
    // value rather than rejecting the whole batch.
    const [totalEmployeesR, newHiresR, openPositionsR, attendanceTodayR, pendingLeavesR, pendingExpensesR, pendingTravelR, unreadR, activitiesR, recentNotifsR, deptDistR, departmentsR] =
      await Promise.allSettled([
        db.employee.count({ where: employeeFilter }),
        db.employee.count({ where: { ...employeeFilter, dateOfJoining: { gte: firstOfMonth } } }),
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
      ]);

    const pick = <T>(r: PromiseSettledResult<T>, fallback: T): T => (r.status === 'fulfilled' ? r.value : fallback);
    const metricList = [totalEmployeesR, newHiresR, openPositionsR, attendanceTodayR, pendingLeavesR, pendingExpensesR, pendingTravelR, unreadR, activitiesR, recentNotifsR, deptDistR, departmentsR];
    const metricNames = ['totalEmployees', 'newHires', 'openPositions', 'attendanceToday', 'pendingLeaves', 'pendingExpenses', 'pendingTravel', 'unreadNotifications', 'recentActivities', 'recentNotifications', 'departmentDistribution', 'departments'];
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
      },
      recentActivities: [],
      recentNotifications: [],
      departmentStats: [],
    });
  }
}
