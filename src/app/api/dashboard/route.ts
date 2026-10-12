import { NextRequest, NextResponse } from 'next/server';
import { resolveCompanyScope } from '@/lib/companyScope';

export async function GET(req: NextRequest) {
  try {
    // ─── Company-scoped dashboard data ───
    // Use resolveCompanyScope to enforce that non-admins only see their own company's data.
    // Admins with a specific company selected see that company's data.
    // Admins with no company selected see all data.
    const scope = await resolveCompanyScope(req);
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role, scope: dataScope, companyId, ownCompanyId, userId } = scope;
    const isSelfOnly = dataScope === 'self';

    // The effective company filter — if an admin selected a specific company in the
    // CompanySwitcher, use that; otherwise fall back to the user's own company for
    // non-admins. For admins with no company selected, we show all data.
    const effectiveCompanyId = companyId || ownCompanyId;
    const companyFilter = effectiveCompanyId ? { companyId: effectiveCompanyId } : {};

    const { db } = await import('@/lib/db');

    // For self-only access (employee), find the user's own employee record
    let employeeFilter: Record<string, unknown> = { ...companyFilter, status: 'active' };

    if (isSelfOnly && userId) {
      // Employee can only see their own data
      employeeFilter = { userId, status: 'active' };
    } else if (dataScope === 'team' && userId) {
      // Manager: find employees in the same department
      const ownEmp = await db.employee.findFirst({
        where: { userId, status: 'active' },
        select: { departmentId: true },
      });
      if (ownEmp) {
        employeeFilter = { ...companyFilter, departmentId: ownEmp.departmentId, status: 'active' };
      }
    }

    // New hires this month
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Notifications count
    const url = new URL(req.url);
    const reqUserId = url.searchParams.get('userId') || userId;
    const [
      totalEmployees,
      newHires,
      openPositions,
      totalAttendanceToday,
      pendingLeaves,
      pendingExpenses,
      pendingTravel,
      recentActivities,
      unreadNotifications,
      recentNotifications,
      departmentDistribution,
      departments,
    ] = await Promise.all([
      db.employee.count({ where: employeeFilter }),
      db.employee.count({ where: { ...employeeFilter, joiningDate: { gte: firstOfMonth } } }),
      isSelfOnly ? Promise.resolve(0) : db.job.count({ where: { ...companyFilter, status: 'open' } }),
      db.attendance.count({ where: { date: { gte: today }, status: 'present', employee: employeeFilter } }),
      db.leave.count({ where: { status: 'pending', employee: employeeFilter } }),
      db.expenseClaim.count({ where: { status: 'pending', employee: employeeFilter } }),
      db.travelRequest.count({ where: { status: 'pending', employee: employeeFilter } }),
      db.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true, avatar: true } } },
      }),
      reqUserId ? db.notification.count({ where: { userId: reqUserId, isRead: false } }) : Promise.resolve(0),
      reqUserId ? db.notification.findMany({ where: { userId: reqUserId }, take: 5, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
      db.employee.groupBy({ by: ['departmentId'], where: employeeFilter, _count: { id: true } }),
      db.department.findMany({ where: companyFilter, select: { id: true, name: true } }),
    ]);

    const attendanceRate = Math.round((totalAttendanceToday / (totalEmployees || 1)) * 100);
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
    // Return minimal data instead of demo fallback — demo data is misleading
    return NextResponse.json({
      stats: {
        totalEmployees: 0,
        newHires: 0,
        openPositions: 0,
        attendanceRate: 0,
        pendingApprovals: 0,
        unreadNotifications: 0,
        dataScope: 'self',
      },
      recentActivities: [],
      recentNotifications: [],
      departmentStats: [],
    });
  }
}
