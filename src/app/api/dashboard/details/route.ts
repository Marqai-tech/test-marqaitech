import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';

/**
 * GET /api/dashboard/details?type=<cardKey>&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
 *
 * Drives the "click a KPI card to drill into the underlying records" UX on
 * the Employee Dashboard. Each card type returns a list of rows shaped for
 * the DetailTable component — same field names for every type so the client
 * can render dynamic columns from a config object.
 *
 * Supported card types:
 *
 *   ORG-WIDE  (admin / HR scope):
 *     - total           → every employee in scope (headcount snapshot)
 *     - active          → employees with status='active'
 *     - onLeave         → approved leave requests overlapping the range
 *     - exits           → terminated/resigned employees whose updatedAt
 *                         falls in [fromDate, toDate]
 *
 *   PERSONAL  (scope='self' or role='employee'):
 *     - myLeaveBalance  → leave balance rows for the logged-in employee
 *     - myPendingRequests → own leave requests with status='pending'
 *     - myAttendance    → own attendance records in [fromDate, toDate]
 *     - myRecentLeaves  → own leave requests in [fromDate, toDate]
 *
 * All queries are role-scoped via resolveCompanyScope — employees always
 * resolve to their own Employee row (dataScope='self'), managers see their
 * team (dataScope='team'), admins see their company/tenant.
 *
 * SECURITY: the `employeeId` query param is IGNORED for self-scope users so
 * an employee can NEVER read another employee's records.
 */

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

const INACTIVE_EXIT_STATUSES = ['terminated', 'resigned'];

function validDate(s: string | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime());
}

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function prettyDate(value: unknown): string {
  if (!value) return '—';
  try {
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

export async function GET(req: NextRequest) {
  try {
    const scope = await resolveCompanyScope(req);
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const type = (url.searchParams.get('type') || '').toLowerCase();
    const fromDateParam = url.searchParams.get('fromDate');
    const toDateParam = url.searchParams.get('toDate');

    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;
    if (validDate(fromDateParam) && validDate(toDateParam)) {
      rangeStart = new Date(`${fromDateParam}T00:00:00.000Z`);
      rangeEnd = new Date(`${toDateParam}T23:59:59.999Z`);
    }

    const db = await getDb(req);

    const { scope: dataScope, companyId, ownCompanyId, userId, ownEmployeeId } = scope;
    const effectiveCompanyId = companyId || ownCompanyId;
    const companyFilter = effectiveCompanyId ? { companyId: effectiveCompanyId } : {};

    const isSelfOnly = dataScope === 'self';
    // Resolve the user's own Employee row — used by personal cards AND by
    // self-scope drilldowns of org cards (so an employee clicking "Total
    // Employees" still gets a meaningful one-row answer rather than empty).
    let selfEmployeeId: string | null = ownEmployeeId;
    if (!selfEmployeeId && userId) {
      const selfEmp = await db.employee
        .findFirst({ where: { userId, status: 'active' }, select: { id: true } })
        .catch(() => null);
      if (selfEmp) selfEmployeeId = selfEmp.id;
    }

    // ──────────────────────────────────────────────────────────────────
    // ORG-WIDE CARDS — admins / managers / HR
    // ──────────────────────────────────────────────────────────────────
    if (type === 'total' || type === 'active') {
      // For self-scope users, return only their own row (so the click still
      // shows something useful — "Total Employees → me" — rather than empty).
      const where: Record<string, unknown> = isSelfOnly && selfEmployeeId
        ? { id: selfEmployeeId }
        : isSelfOnly
          ? { id: 'none' /* no row, no leak */ }
          : { ...companyFilter, ...(type === 'active' ? { status: 'active' } : {}) };

      try {
        const rows = await db.employee.findMany({
          where,
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            dateOfJoining: true,
            status: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
            branch: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        });

        const data = rows.map((r) => ({
          employeeId: r.employeeId || '—',
          name: `${r.firstName || ''} ${r.lastName || ''}`.trim() || '—',
          department: r.department?.name || '—',
          designation: r.designation?.title || '—',
          branch: r.branch?.name || '—',
          joiningDate: prettyDate(r.dateOfJoining),
          status: r.status || '—',
        }));
        return NextResponse.json({ type, rows: data, total: data.length }, { headers: corsHeaders() });
      } catch (err) {
        console.error('[dashboard/details] total/active error:', err);
        return NextResponse.json({ type, rows: [], total: 0, error: 'Failed to load employees' }, { status: 500, headers: corsHeaders() });
      }
    }

    if (type === 'onLeave') {
      // Approved leave requests overlapping [fromDate, toDate]. For
      // self-scope, this becomes the user's OWN approved leaves in the
      // window (same logic the dashboard's KPI uses).
      const overlapWhere: Record<string, unknown> = {
        status: 'approved',
        startDate: { lte: rangeEnd || new Date() },
        endDate: { gte: rangeStart || new Date(0) },
      };
      if (isSelfOnly && selfEmployeeId) {
        overlapWhere.employeeId = selfEmployeeId;
      } else if (isSelfOnly) {
        overlapWhere.employeeId = 'none';
      } else {
        overlapWhere.employee = { ...companyFilter, status: { in: ['active', 'on_leave'] } };
      }

      try {
        const leaves = await db.leaveRequest.findMany({
          where: overlapWhere,
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            halfDay: true,
            employee: {
              select: { employeeId: true, firstName: true, lastName: true },
            },
            leaveType: { select: { name: true } },
          },
          orderBy: { startDate: 'desc' },
          take: 500,
        });

        const data = leaves.map((l) => ({
          employeeId: l.employee?.employeeId || '—',
          name: `${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`.trim() || '—',
          leaveType: l.leaveType?.name || '—',
          fromDate: prettyDate(l.startDate),
          toDate: prettyDate(l.endDate),
          days: daysBetween(new Date(l.startDate), new Date(l.endDate)),
          leaveStatus: l.status || '—',
        }));
        return NextResponse.json({ type, rows: data, total: data.length }, { headers: corsHeaders() });
      } catch (err) {
        console.error('[dashboard/details] onLeave error:', err);
        return NextResponse.json({ type, rows: [], total: 0, error: 'Failed to load leave records' }, { status: 500, headers: corsHeaders() });
      }
    }

    if (type === 'exits') {
      // Employees with status in [terminated, resigned] whose updatedAt
      // falls inside [fromDate, toDate]. Falls back to "any exit" if no
      // range is supplied.
      const exitsWhere: Record<string, unknown> = {
        status: { in: INACTIVE_EXIT_STATUSES },
      };
      if (rangeStart && rangeEnd) {
        exitsWhere.updatedAt = { gte: rangeStart, lte: rangeEnd };
      }
      if (isSelfOnly && selfEmployeeId) {
        exitsWhere.id = selfEmployeeId;
      } else if (isSelfOnly) {
        exitsWhere.id = 'none';
      } else {
        Object.assign(exitsWhere, companyFilter);
      }

      try {
        const rows = await db.employee.findMany({
          where: exitsWhere,
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            dateOfJoining: true,
            updatedAt: true,
            status: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 500,
        });

        const data = rows.map((r) => ({
          employeeId: r.employeeId || '—',
          name: `${r.firstName || ''} ${r.lastName || ''}`.trim() || '—',
          department: r.department?.name || '—',
          designation: r.designation?.title || '—',
          joiningDate: prettyDate(r.dateOfJoining),
          exitDate: prettyDate(r.updatedAt),
          exitType: r.status === 'terminated' ? 'Termination' : r.status === 'resigned' ? 'Resignation' : '—',
          exitStatus: r.status ? r.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : '—',
        }));
        return NextResponse.json({ type, rows: data, total: data.length }, { headers: corsHeaders() });
      } catch (err) {
        console.error('[dashboard/details] exits error:', err);
        return NextResponse.json({ type, rows: [], total: 0, error: 'Failed to load exits' }, { status: 500, headers: corsHeaders() });
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // PERSONAL CARDS — employees / self scope
    // ──────────────────────────────────────────────────────────────────
    if (!selfEmployeeId) {
      // No linked employee record — return empty rows with a friendly note.
      return NextResponse.json(
        { type, rows: [], total: 0, message: 'No employee record is linked to this account.' },
        { headers: corsHeaders() },
      );
    }

    if (type === 'myLeaveBalance') {
      try {
        const year = rangeStart ? rangeStart.getFullYear() : new Date().getFullYear();
        const balances = await db.leaveBalance.findMany({
          where: { employeeId: selfEmployeeId, year },
          select: {
            total: true,
            used: true,
            remaining: true,
            carryForward: true,
            leaveType: { select: { name: true } },
          },
        });
        const data = balances.map((b) => ({
          leaveType: b.leaveType?.name || '—',
          total: Number(b.total) || 0,
          used: Number(b.used) || 0,
          remaining: Number(b.remaining) || 0,
          carryForward: Number(b.carryForward) || 0,
          year,
        }));
        return NextResponse.json({ type, rows: data, total: data.length }, { headers: corsHeaders() });
      } catch (err) {
        console.error('[dashboard/details] myLeaveBalance error:', err);
        return NextResponse.json({ type, rows: [], total: 0, error: 'Failed to load leave balance' }, { status: 500, headers: corsHeaders() });
      }
    }

    if (type === 'myPendingRequests') {
      try {
        const leaves = await db.leaveRequest.findMany({
          where: { employeeId: selfEmployeeId, status: 'pending' },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            createdAt: true,
            leaveType: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        });
        const data = leaves.map((l) => ({
          leaveType: l.leaveType?.name || '—',
          fromDate: prettyDate(l.startDate),
          toDate: prettyDate(l.endDate),
          days: daysBetween(new Date(l.startDate), new Date(l.endDate)),
          status: l.status || '—',
          appliedOn: prettyDate(l.createdAt),
        }));
        return NextResponse.json({ type, rows: data, total: data.length }, { headers: corsHeaders() });
      } catch (err) {
        console.error('[dashboard/details] myPendingRequests error:', err);
        return NextResponse.json({ type, rows: [], total: 0, error: 'Failed to load pending requests' }, { status: 500, headers: corsHeaders() });
      }
    }

    if (type === 'myAttendance') {
      try {
        // Use the selected range, defaulting to the current month.
        const start = rangeStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end = rangeEnd || new Date();
        const records = await db.attendance.findMany({
          where: { employeeId: selfEmployeeId, date: { gte: start, lte: end } },
          select: { id: true, date: true, status: true, checkIn: true, checkOut: true, workedHours: true },
          orderBy: { date: 'desc' },
          take: 500,
        });
        const data = records.map((a) => ({
          date: prettyDate(a.date),
          status: a.status || '—',
          checkIn: a.checkIn
            ? new Date(a.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—',
          checkOut: a.checkOut
            ? new Date(a.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—',
          workedHours: a.workedHours ? `${Number(a.workedHours).toFixed(1)}h` : '—',
        }));
        return NextResponse.json({ type, rows: data, total: data.length }, { headers: corsHeaders() });
      } catch (err) {
        console.error('[dashboard/details] myAttendance error:', err);
        return NextResponse.json({ type, rows: [], total: 0, error: 'Failed to load attendance' }, { status: 500, headers: corsHeaders() });
      }
    }

    if (type === 'myRecentLeaves') {
      try {
        const start = rangeStart || new Date(0);
        const end = rangeEnd || new Date();
        const leaves = await db.leaveRequest.findMany({
          where: {
            employeeId: selfEmployeeId,
            OR: [
              { startDate: { gte: start, lte: end } },
              { endDate: { gte: start, lte: end } },
            ],
          },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            createdAt: true,
            leaveType: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        });
        const data = leaves.map((l) => ({
          leaveType: l.leaveType?.name || '—',
          fromDate: prettyDate(l.startDate),
          toDate: prettyDate(l.endDate),
          days: daysBetween(new Date(l.startDate), new Date(l.endDate)),
          status: l.status || '—',
          appliedOn: prettyDate(l.createdAt),
        }));
        return NextResponse.json({ type, rows: data, total: data.length }, { headers: corsHeaders() });
      } catch (err) {
        console.error('[dashboard/details] myRecentLeaves error:', err);
        return NextResponse.json({ type, rows: [], total: 0, error: 'Failed to load recent leaves' }, { status: 500, headers: corsHeaders() });
      }
    }

    return NextResponse.json(
      { error: 'Unknown detail type. Supported: total | active | onLeave | exits | myLeaveBalance | myPendingRequests | myAttendance | myRecentLeaves' },
      { status: 400, headers: corsHeaders() },
    );
  } catch (error) {
    console.error('Dashboard details error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() },
    );
  }
}
