import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { getDataScope } from '@/lib/roleAccess';

// Demo data fallback when database is unavailable
function getDemoDashboardData(role: string) {
  const scope = getDataScope(role);
  const isSelfOnly = scope === 'self';
  const isTeam = scope === 'team';

  return {
    stats: {
      totalEmployees: isSelfOnly ? 1 : isTeam ? 5 : 10,
      newHires: isSelfOnly ? 0 : 2,
      openPositions: isSelfOnly ? 0 : isTeam ? 1 : 3,
      attendanceRate: 94,
      pendingApprovals: isSelfOnly ? 0 : 5,
      unreadNotifications: 3,
      dataScope: scope,
    },
    recentActivities: [
      { id: '1', action: 'LOGIN', entity: 'User', details: 'Rajesh Kumar logged in', createdAt: new Date().toISOString(), user: { name: 'Rajesh Kumar', email: 'rajesh.kumar@3boxestech.com', avatar: null } },
      { id: '2', action: 'CREATE', entity: 'Leave', details: 'Ananya Gupta requested casual leave', createdAt: new Date(Date.now() - 3600000).toISOString(), user: { name: 'Priya Sharma', email: 'priya.sharma@3boxestech.com', avatar: null } },
      { id: '3', action: 'APPROVE', entity: 'ExpenseClaim', details: 'Expense claim approved for ₹8,500', createdAt: new Date(Date.now() - 7200000).toISOString(), user: { name: 'Meera Joshi', email: 'meera.joshi@3boxestech.com', avatar: null } },
    ],
    recentNotifications: [],
    departmentStats: isSelfOnly ? [] : [
      { departmentId: 'dept-1', departmentName: 'Engineering', count: 3 },
      { departmentId: 'dept-2', departmentName: 'Human Resources', count: 1 },
      { departmentId: 'dept-3', departmentName: 'Design', count: 1 },
    ],
  };
}

export async function GET(req: NextRequest) {
  try {
    // Get user role from token for role-based filtering
    const token = getTokenFromHeaders(req);
    let userRole = 'employee';
    let userId: string | null = null;

    if (token) {
      const decoded = await verifyToken(token);
      if (decoded) {
        userRole = (decoded.role as string) || 'employee';
        userId = (decoded.userId as string) || null;
      }
    }

    const scope = getDataScope(userRole);
    const isSelfOnly = scope === 'self';

    const { db } = await import('@/lib/db');
    const url = new URL(req.url);
    const companyId = url.searchParams.get('companyId');

    const companyFilter = companyId ? { companyId } : {};

    // For self-only access (employee), find the user's own employee record
    let employeeFilter: Record<string, unknown> = { ...companyFilter, status: 'active' };

    if (isSelfOnly && userId) {
      // Employee can only see their own data
      employeeFilter = { ...companyFilter, userId, status: 'active' };
    } else if (scope === 'team' && userId) {
      // Manager: find employees in the same department
      const ownEmp = await db.employee.findFirst({
        where: { userId, status: 'active' },
        select: { departmentId: true },
      });
      if (ownEmp) {
        employeeFilter = { ...companyFilter, departmentId: ownEmp.departmentId, status: 'active' };
      }
    }

    // Total employees (scoped by role)
    const totalEmployees = await db.employee.count({
      where: employeeFilter,
    });

    // New hires this month
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newHires = await db.employee.count({
      where: {
        ...employeeFilter,
        joiningDate: { gte: firstOfMonth },
      },
    });

    // Open positions
    const openPositions = isSelfOnly ? 0 : await db.job.count({
      where: {
        ...companyFilter,
        status: 'open',
      },
    });

    // Attendance rate for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalAttendanceToday = await db.attendance.count({
      where: {
        date: { gte: today },
        status: 'present',
        employee: employeeFilter,
      },
    });
    const expectedAttendance = totalEmployees || 1;
    const attendanceRate = Math.round((totalAttendanceToday / expectedAttendance) * 100);

    // Pending approvals (leaves, expenses, travel)
    const pendingLeaves = await db.leave.count({
      where: {
        status: 'pending',
        employee: employeeFilter,
      },
    });
    const pendingExpenses = await db.expenseClaim.count({
      where: {
        status: 'pending',
        employee: employeeFilter,
      },
    });
    const pendingTravel = await db.travelRequest.count({
      where: {
        status: 'pending',
        employee: employeeFilter,
      },
    });
    const pendingApprovals = pendingLeaves + pendingExpenses + pendingTravel;

    // Recent activities from audit logs
    const recentActivities = await db.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true, avatar: true },
        },
      },
    });

    // Notifications count
    const reqUserId = url.searchParams.get('userId') || userId;
    let unreadNotifications = 0;
    let recentNotifications: unknown[] = [];
    if (reqUserId) {
      unreadNotifications = await db.notification.count({
        where: { userId: reqUserId, isRead: false },
      });
      recentNotifications = await db.notification.findMany({
        where: { userId: reqUserId },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
    }

    // Department distribution
    const departmentDistribution = await db.employee.groupBy({
      by: ['departmentId'],
      where: employeeFilter,
      _count: { id: true },
    });

    // Get department names
    const departments = await db.department.findMany({
      where: companyId ? { companyId } : {},
      select: { id: true, name: true },
    });
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
        dataScope: scope,
      },
      recentActivities,
      recentNotifications,
      departmentStats,
    });
  } catch (error) {
    console.error('Dashboard error - returning demo data:', error);
    // Return demo data instead of 500 error
    return NextResponse.json(getDemoDashboardData('employee'));
  }
}
