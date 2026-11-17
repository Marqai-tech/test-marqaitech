/**
 * GET /api/payroll/attendance-reconciliation
 *
 * Payroll ↔ attendance reconciliation for one month: for every employee that
 * has a Payroll row for the month, compare the LOP stored on the payroll row
 * (frozen at process time) with the LIVE attendance rows of the same month
 * window. Mismatches mean payroll was processed before later attendance
 * changes (regularizations, HR corrections) — HR should fix the days and
 * reprocess payroll.
 *
 * Query params:
 *   month      — YYYY-MM (default: current month)
 *   companyId  — optional company scope (admins; also honored from the
 *                standard company-context query used by the UI)
 *
 * LOP formula mirrors src/lib/payroll-engine.ts summarizeAttendance:
 *   lop = absent × 1 + half_day × 0.5
 * The month window mirrors the engine's monthWindow() convention (UTC month
 * start → exclusive month end, engine queries rows with date <= end - 1ms).
 */
import { requireUser, isAdminRole, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { monthWindow } from '@/lib/payroll-engine';

export { OPTIONS };

interface ReconciliationRow {
  employeeId: string; // the employee CODE (e.g. MARQ015)
  employeeName: string;
  payrollLopDays: number;
  liveLopDays: number;
  absentDays: number;
  halfDayDays: number;
  payrollPaidDays: number;
  match: boolean;
  payrollStatus: string;
}

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  if (!isAdminRole(user.role)) return fail('Only HR/Admin can view payroll-attendance reconciliation', 403);

  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthParam = (searchParams.get('month') || defaultMonth).trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {
      return fail('month must be in YYYY-MM format', 422);
    }
    const year = parseInt(monthParam.slice(0, 4), 10);
    const month = parseInt(monthParam.slice(5, 7), 10);

    // Company scope: same convention as the other /api/payroll routes —
    // explicit companyId param wins, otherwise the company selected in the
    // company context switcher (resolveCompanyScope).
    const scope = await resolveCompanyScope(request);
    if (!scope) return fail('Unauthorized', 401);
    const companyId = searchParams.get('companyId') || scope.companyId || null;

    // Every employee with a Payroll row for this month (in the tenant /
    // selected company).
    const payrollWhere: Record<string, unknown> = { month, year };
    if (companyId) payrollWhere.employee = { companyId };

    const payrolls = await db.payroll.findMany({
      where: payrollWhere,
      select: {
        employeeId: true,
        lopDays: true,
        paidDays: true,
        totalDays: true,
        attendanceJson: true,
        status: true,
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
    });

    const employeeIds = [...new Set(payrolls.map(p => p.employeeId))];

    // Live attendance for the same month window (engine convention: UTC month
    // start gte, last millisecond of the month lte).
    const { start, end } = monthWindow(month, year);
    const monthEnd = new Date(end.getTime() - 1);
    const liveRows = employeeIds.length > 0
      ? await db.attendance.findMany({
          where: { employeeId: { in: employeeIds }, date: { gte: start, lte: monthEnd } },
          select: { employeeId: true, status: true },
        })
      : [];

    const liveByEmployee = new Map<string, { absent: number; halfDay: number }>();
    for (const row of liveRows) {
      const s = (row.status || '').toLowerCase();
      if (s !== 'absent' && s !== 'half_day') continue;
      const agg = liveByEmployee.get(row.employeeId) || { absent: 0, halfDay: 0 };
      if (s === 'absent') agg.absent += 1; else agg.halfDay += 1;
      liveByEmployee.set(row.employeeId, agg);
    }

    const rows: ReconciliationRow[] = payrolls.map(p => {
      const live = liveByEmployee.get(p.employeeId) || { absent: 0, halfDay: 0 };
      const liveLopDays = Math.round((live.absent + live.halfDay * 0.5) * 100) / 100;
      const payrollLopDays = p.lopDays || 0;
      return {
        employeeId: p.employee.employeeId,
        employeeName: `${p.employee.firstName || ''} ${p.employee.lastName || ''}`.trim(),
        payrollLopDays,
        liveLopDays,
        absentDays: live.absent,
        halfDayDays: live.halfDay,
        payrollPaidDays: p.paidDays || 0,
        match: Math.abs(payrollLopDays - liveLopDays) < 0.01,
        payrollStatus: p.status,
      };
    });

    // Mismatches first, then alphabetical for a stable report.
    rows.sort((a, b) => {
      if (a.match !== b.match) return a.match ? 1 : -1;
      return a.employeeName.localeCompare(b.employeeName) || a.employeeId.localeCompare(b.employeeId);
    });

    return ok({
      month: monthParam,
      rows,
      summary: {
        mismatchCount: rows.filter(r => !r.match).length,
        checkedCount: rows.length,
      },
    });
  } catch (error: unknown) {
    console.error('Payroll-attendance reconciliation error:', error);
    return fail(error instanceof Error ? error.message : 'Reconciliation failed', 500);
  }
}
