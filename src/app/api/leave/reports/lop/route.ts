/**
 * GET /api/leave/reports/lop
 *
 * Returns LOP (Loss of Pay) report: employees who took unpaid leave,
 * days count, deduction amount, filters by dept/branch.
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

    // Fetch all approved leave requests for unpaid leave types
    const leaveRequests = await db.leaveRequest.findMany({
      where: { status: 'approved', startDate: { gte: yearStart }, endDate: { lte: yearEnd }, employee: empFilter,
        leaveType: { isPaid: false } },
      select: { id: true, employeeId: true, leaveTypeId: true, startDate: true, endDate: true, halfDay: true,
        employee: { select: { employeeId: true, firstName: true, lastName: true, department: { select: { name: true } }, branch: { select: { name: true } }, designation: { select: { title: true } }, salary: true } },
        leaveType: { select: { name: true, code: true } },
      },
      orderBy: { startDate: 'desc' },
    }).catch(() => []);

    // Build rows
    const rows = leaveRequests.map((l: any) => {
      const days = l.halfDay ? 0.5 : Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1;
      const monthlySalary = l.employee?.salary || 0;
      const dailyRate = monthlySalary > 0 ? (monthlySalary * 12) / 365 : 0;
      const deduction = Math.round(dailyRate * days * 100) / 100;
      return {
        employeeId: l.employee?.employeeId || '—',
        employeeName: `${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`.trim(),
        department: l.employee?.department?.name || '—',
        branch: l.employee?.branch?.name || '—',
        designation: l.employee?.designation?.title || '—',
        leaveType: l.leaveType?.name || 'LOP',
        leaveTypeCode: l.leaveType?.code || 'LOP',
        startDate: l.startDate,
        endDate: l.endDate,
        days,
        deduction,
        monthlySalary,
      };
    });

    // Summary
    const totalDays = rows.reduce((s, r) => s + r.days, 0);
    const totalDeduction = rows.reduce((s, r) => s + r.deduction, 0);
    const empCount = new Set(rows.map(r => r.employeeName)).size;

    // By employee
    const byEmp: Record<string, { name: string; dept: string; days: number; deduction: number }> = {};
    for (const r of rows) {
      if (!byEmp[r.employeeName]) byEmp[r.employeeName] = { name: r.employeeName, dept: r.department, days: 0, deduction: 0 };
      byEmp[r.employeeName].days += r.days;
      byEmp[r.employeeName].deduction += r.deduction;
    }
    const empSummary = Object.values(byEmp).sort((a, b) => b.days - a.days);

    return NextResponse.json({
      rows,
      summary: { totalDays, totalDeduction, employeeCount: empCount, requestCount: rows.length },
      byEmployee: empSummary,
    }, { headers: cors() });
  } catch (error: any) {
    console.error('LOP report error:', error);
    return NextResponse.json({ error: error?.message }, { status: 500, headers: cors() });
  }
}
