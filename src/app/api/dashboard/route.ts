import { NextRequest, NextResponse } from 'next/server';

// Demo data fallback when database is unavailable
function getDemoDashboardData() {
  return {
    stats: {
      totalEmployees: 10,
      newHires: 2,
      openPositions: 3,
      attendanceRate: 94,
      pendingApprovals: 5,
      unreadNotifications: 3,
    },
    recentActivities: [
      { id: '1', action: 'LOGIN', entity: 'User', details: 'Rajesh Kumar logged in', createdAt: new Date().toISOString(), user: { name: 'Rajesh Kumar', email: 'rajesh.kumar@nexustech.com', avatar: null } },
      { id: '2', action: 'CREATE', entity: 'Leave', details: 'Ananya Gupta requested casual leave', createdAt: new Date(Date.now() - 3600000).toISOString(), user: { name: 'Priya Sharma', email: 'priya.sharma@nexustech.com', avatar: null } },
      { id: '3', action: 'APPROVE', entity: 'ExpenseClaim', details: 'Expense claim approved for ₹8,500', createdAt: new Date(Date.now() - 7200000).toISOString(), user: { name: 'Meera Joshi', email: 'meera.joshi@nexustech.com', avatar: null } },
      { id: '4', action: 'CREATE', entity: 'Employee', details: 'New employee Vikram Singh onboarded', createdAt: new Date(Date.now() - 86400000).toISOString(), user: { name: 'Priya Sharma', email: 'priya.sharma@nexustech.com', avatar: null } },
      { id: '5', action: 'UPDATE', entity: 'Attendance', details: 'Check-out recorded for Deepa Iyer', createdAt: new Date(Date.now() - 90000000).toISOString(), user: { name: 'Deepa Iyer', email: 'deepa.iyer@nexustech.com', avatar: null } },
    ],
    recentNotifications: [
      { id: 'notif-1', title: 'Leave Request', message: 'Ananya Gupta requested leave for June 1-5', type: 'leave', category: 'approval', isRead: false, createdAt: new Date(Date.now() - 1800000).toISOString() },
      { id: 'notif-2', title: 'Expense Claim', message: 'Rajesh Kumar submitted an expense claim of ₹12,500', type: 'expense', category: 'approval', isRead: false, createdAt: new Date(Date.now() - 5400000).toISOString() },
      { id: 'notif-3', title: 'Attendance Alert', message: 'Amit Patel checked in late today', type: 'attendance', category: 'alert', isRead: true, createdAt: new Date(Date.now() - 7200000).toISOString() },
    ],
    departmentStats: [
      { departmentId: 'dept-1', departmentName: 'Engineering', count: 3 },
      { departmentId: 'dept-2', departmentName: 'Human Resources', count: 1 },
      { departmentId: 'dept-3', departmentName: 'Design', count: 1 },
      { departmentId: 'dept-4', departmentName: 'Finance', count: 2 },
      { departmentId: 'dept-5', departmentName: 'Marketing', count: 1 },
      { departmentId: 'dept-6', departmentName: 'Sales', count: 1 },
      { departmentId: 'dept-7', departmentName: 'Operations', count: 1 },
    ],
  };
}

export async function GET(req: NextRequest) {
  try {
    const { db } = await import('@/lib/db');
    const url = new URL(req.url);
    const companyId = url.searchParams.get('companyId');

    const companyFilter = companyId ? { companyId } : {};

    // Total employees
    const totalEmployees = await db.employee.count({
      where: { ...companyFilter, status: 'active' },
    });

    // New hires this month
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newHires = await db.employee.count({
      where: {
        ...companyFilter,
        joiningDate: { gte: firstOfMonth },
      },
    });

    // Open positions
    const openPositions = await db.job.count({
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
        employee: companyFilter,
      },
    });
    const expectedAttendance = totalEmployees || 1;
    const attendanceRate = Math.round((totalAttendanceToday / expectedAttendance) * 100);

    // Pending approvals (leaves, expenses, travel)
    const pendingLeaves = await db.leave.count({
      where: {
        status: 'pending',
        employee: companyFilter,
      },
    });
    const pendingExpenses = await db.expenseClaim.count({
      where: {
        status: 'pending',
        employee: companyFilter,
      },
    });
    const pendingTravel = await db.travelRequest.count({
      where: {
        status: 'pending',
        employee: companyFilter,
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
    const userId = url.searchParams.get('userId');
    let unreadNotifications = 0;
    let recentNotifications: unknown[] = [];
    if (userId) {
      unreadNotifications = await db.notification.count({
        where: { userId, isRead: false },
      });
      recentNotifications = await db.notification.findMany({
        where: { userId },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
    }

    // Department distribution
    const departmentDistribution = await db.employee.groupBy({
      by: ['departmentId'],
      where: { ...companyFilter, status: 'active' },
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
      },
      recentActivities,
      recentNotifications,
      departmentStats,
    });
  } catch (error) {
    console.error('Dashboard error - returning demo data:', error);
    // Return demo data instead of 500 error
    return NextResponse.json(getDemoDashboardData());
  }
}
