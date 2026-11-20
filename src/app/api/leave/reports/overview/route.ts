/**
 * GET /api/leave/reports/overview
 *
 * Returns organization-wide leave overview: total days taken, type distribution,
 * monthly trend, top takers, pending/approved/rejected counts.
 *
 * Query params: companyId, departmentId, branchId, year
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }; }
export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

export async function GET(req: NextRequest) {
  const db: any = await getDb(req);
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    const url = new URL(req.url);
    const departmentId = url.searchParams.get('departmentId');
    const branchId = url.searchParams.get('branchId');
    const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
    const effectiveCompanyId = scope.companyId || scope.ownCompanyId;

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const empFilter: Record<string, unknown> = {};
    if (effectiveCompanyId) empFilter.companyId = effectiveCompanyId;
    if (departmentId) empFilter.departmentId = departmentId;
    if (branchId) empFilter.branchId = branchId;

    // Fetch all leave requests for the year
    const leaveRequests = await db.leaveRequest.findMany({
      where: { startDate: { gte: yearStart }, endDate: { lte: yearEnd }, employee: empFilter },
      select: { id: true, employeeId: true, leaveTypeId: true, startDate: true, endDate: true, halfDay: true, status: true, reason: true,
        employee: { select: { firstName: true, lastName: true, employeeId: true, department: { select: { name: true } }, branch: { select: { name: true } } } },
        leaveType: { select: { name: true, code: true, isPaid: true } },
      },
      orderBy: { startDate: 'desc' },
    }).catch(() => []);

    // Compute KPIs
    const approved = leaveRequests.filter(l => l.status === 'approved');
    const pending = leaveRequests.filter(l => l.status === 'pending');
    const rejected = leaveRequests.filter(l => l.status === 'rejected');
    const totalDaysTaken = approved.reduce((sum: number, l: any) => sum + (l.halfDay ? 0.5 : Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1), 0);
    const lopDays = approved.filter((l: any) => l.leaveType?.isPaid === false).reduce((sum: number, l: any) => sum + (l.halfDay ? 0.5 : Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1), 0);

    // Type distribution
    const typeDist: Record<string, { days: number; count: number }> = {};
    for (const l of approved) {
      const name = l.leaveType?.name || 'Unknown';
      const days = l.halfDay ? 0.5 : Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1;
      if (!typeDist[name]) typeDist[name] = { days: 0, count: 0 };
      typeDist[name].days += days;
      typeDist[name].count += 1;
    }

    // Monthly trend
    const monthlyTrend: Record<string, number> = {};
    for (const l of approved) {
      const d = new Date(l.startDate);
      const key = d.toLocaleDateString('en', { month: 'short' });
      monthlyTrend[key] = (monthlyTrend[key] || 0) + (l.halfDay ? 0.5 : Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1);
    }

    // Top takers
    const byEmp: Record<string, { name: string; days: number; dept: string }> = {};
    for (const l of approved) {
      const name = `${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`.trim();
      const days = l.halfDay ? 0.5 : Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1;
      if (!byEmp[name]) byEmp[name] = { name, days: 0, dept: l.employee?.department?.name || '—' };
      byEmp[name].days += days;
    }
    const topTakers = Object.values(byEmp).sort((a, b) => b.days - a.days).slice(0, 10);

    // Department distribution
    const deptDist: Record<string, number> = {};
    for (const l of approved) {
      const dept = l.employee?.department?.name || 'Unknown';
      deptDist[dept] = (deptDist[dept] || 0) + 1;
    }

    return NextResponse.json({
      summary: {
        totalRequests: leaveRequests.length,
        approved: approved.length,
        pending: pending.length,
        rejected: rejected.length,
        totalDaysTaken,
        lopDays,
        employeeCount: new Set(leaveRequests.map(l => l.employeeId)).size,
      },
      typeDist,
      monthlyTrend,
      topTakers,
      deptDist,
      recentLeaves: leaveRequests.slice(0, 20).map((l: any) => ({
        employeeName: `${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`.trim(),
        leaveType: l.leaveType?.name || '—',
        startDate: l.startDate,
        endDate: l.endDate,
        days: l.halfDay ? 0.5 : Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1,
        status: l.status,
        department: l.employee?.department?.name || '—',
      })),
    }, { headers: cors() });
  } catch (error: any) {
    console.error('Leave overview report error:', error);
    return NextResponse.json({ error: error?.message }, { status: 500, headers: cors() });
  }
}
