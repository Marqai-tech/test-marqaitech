import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const [
      totalEmployees,
      newHires,
      separated,
      deptGroups,
      pendingLeaves,
      approvedLeaves,
      totalLeaves,
      attendanceGroups,
      payrollGroups,
      openPositions,
      totalApplications,
      interviewStage,
      offered,
      hired,
    ] = await Promise.all([
      db.employee.count({ where: { status: 'active' } }),
      db.employee.count({ where: { dateOfJoining: { gte: thirtyDaysAgo } } }),
      db.employee.count({ where: { status: { in: ['terminated', 'resigned'] } } }),
      db.employee.groupBy({
        by: ['departmentId'],
        where: { status: 'active' },
        _count: { _all: true },
      }),
      db.leaveRequest.count({ where: { status: 'pending' } }),
      db.leaveRequest.count({ where: { status: 'approved' } }),
      db.leaveRequest.count(),
      db.attendance.groupBy({
        by: ['status'],
        where: { date: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
      db.payroll.groupBy({
        by: ['status'],
        where: { month: currentMonth, year: currentYear },
        _sum: { netSalary: true },
        _count: { _all: true },
      }),
      db.jobPosting.count({ where: { status: 'open' } }),
      db.jobApplication.count(),
      db.jobApplication.count({ where: { status: 'interview' } }),
      db.jobApplication.count({ where: { status: 'offered' } }),
      db.jobApplication.count({ where: { status: 'hired' } }),
    ]);

    // Bug 3 fix — Attrition Rate uses the standard HR formula:
    //   attritionRate = (separated in period) / averageHeadcount × 100
    // where averageHeadcount = (startHeadcount + endHeadcount) / 2
    //
    // The previous formula divided `separated` by `totalEmployees` (the
    // CURRENT active count), which is incorrect because:
    //   1. It doesn't account for new hires during the period.
    //   2. As headcount grows, the rate falsely shrinks even if exits stay flat.
    //   3. It can exceed 100% if many employees left in a small org.
    //
    // We approximate "average headcount" as (active now + active+separated)
    // — i.e. the average of start-of-period and end-of-period headcount.
    //
    // NOTE: Since the Employee table has no `dateOfExit` column, we use
    // `updatedAt` as a proxy for "when the exit happened". This may
    // over-count exits (anyone whose status was changed to terminated/
    // resigned for any reason this year counts as an exit). To avoid
    // rates > 100% in the UI display, we cap the displayed rate at 100%.
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const exitedThisYear = await db.employee.count({
      where: {
        status: { in: ['terminated', 'resigned'] },
        updatedAt: { gte: startOfYear },
      },
    }).catch(() => 0);
    const endHeadcount = totalEmployees; // active now
    const startHeadcount = totalEmployees + exitedThisYear; // active + exited (approx start-of-year)
    const averageHeadcount = (startHeadcount + endHeadcount) / 2;
    const rawAttritionRate = averageHeadcount > 0
      ? (exitedThisYear / averageHeadcount) * 100
      : 0;
    // Cap at 100% for display — anything above indicates data quality issues
    // (e.g. exits recorded without proper dates) rather than a real rate.
    const attritionRate = Math.min(rawAttritionRate, 100).toFixed(1);

    const deptIds = deptGroups.map((g) => g.departmentId).filter((id): id is string => !!id);
    const departments = deptIds.length
      ? await db.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
      : [];
    const deptNameById = new Map(departments.map((d) => [d.id, d.name]));
    const departmentDistribution = deptGroups.map((g) => ({
      name: (g.departmentId && deptNameById.get(g.departmentId)) || 'Unknown',
      count: g._count._all,
    }));

    const presentCount = attendanceGroups
      .filter((a) => ['present', 'late'].includes(a.status))
      .reduce((sum, a) => sum + a._count._all, 0);
    const attendanceTotal = attendanceGroups.reduce((sum, a) => sum + a._count._all, 0);
    const attendanceRate = attendanceTotal > 0 ? ((presentCount / attendanceTotal) * 100).toFixed(1) : '0';

    const totalPayroll = payrollGroups.reduce((sum, p) => sum + (p._sum.netSalary || 0), 0);
    const paidPayroll = payrollGroups
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + (p._sum.netSalary || 0), 0);
    const recordCount = payrollGroups.reduce((sum, p) => sum + p._count._all, 0);

    return NextResponse.json({
      employees: {
        total: totalEmployees,
        newHires,
        attritionRate: parseFloat(attritionRate),
        // Bug 3 fix: expose the inputs so the UI can show the breakdown
        // (e.g. "12 exits / 50 avg headcount = 24%").
        attrition: {
          rate: parseFloat(attritionRate),
          totalExited: exitedThisYear,
          averageHeadcount: Math.round(averageHeadcount),
          period: `${new Date().getFullYear()}`,
        },
      },
      departmentDistribution,
      leave: { pending: pendingLeaves, approved: approvedLeaves, total: totalLeaves },
      attendance: { rate: parseFloat(attendanceRate), present: presentCount, total: attendanceTotal },
      payroll: { total: totalPayroll, paid: paidPayroll, pending: totalPayroll - paidPayroll, currency: 'INR', month: currentMonth, year: currentYear, recordCount },
      recruitment: { openPositions, totalApplications, interviewStage, offered, hired },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
