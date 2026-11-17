import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';

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

/**
 * GET /api/leaves/my-balance?year=YYYY
 *
 * Leave entitlement for the logged-in employee (mobile Home → Leave tab,
 * design #05: "Total Leaves / Leaves Used"). Aggregates the LeaveBalance
 * rows for the current (or requested) year:
 *   { year, total, used, remaining, pending, rows: [{ leaveType, total, used, remaining }] }
 * - total/used/remaining = sums across leave types.
 * - pending = the employee's own pending leave REQUEST days for the year
 *   (so the app can show "requested, awaiting approval" separately).
 * - No employee row → 200 with `linked: false` + zeroed numbers so the
 *   client shows a friendly explanation instead of an error (admins
 *   without an employee profile still get a usable response).
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    }

    let employeeId: string | null = scope.ownEmployeeId;
    if (!employeeId && scope.scope === 'all' && scope.userId) {
      // Admin accounts are often linked to an Employee row (Task 107 pattern).
      const selfEmp = await db.employee
        .findFirst({ where: { userId: scope.userId, status: 'active' }, select: { id: true } })
        .catch(() => null);
      if (selfEmp) employeeId = selfEmp.id;
    }
    if (!employeeId) {
      return NextResponse.json(
        { linked: false, year: null, total: 0, used: 0, remaining: 0, pending: 0, rows: [], message: 'No employee record is linked to this account.' },
        { headers: corsHeaders() }
      );
    }

    const { searchParams } = new URL(request.url);
    const yearParam = parseInt(searchParams.get('year') || '', 10);
    const year = Number.isFinite(yearParam) && yearParam > 2000 ? yearParam : new Date().getFullYear();

    const rows = await db.leaveBalance
      .findMany({
        where: { employeeId, year },
        select: {
          total: true, used: true, remaining: true, carryForward: true,
          leaveType: { select: { name: true } },
        },
      })
      .catch(() => []);

    const balanceRows = (rows as any[]).map((r) => ({
      leaveType: r.leaveType?.name || 'Leave',
      total: Number(r.total) || 0,
      used: Number(r.used) || 0,
      remaining: Number(r.remaining) || 0,
    }));

    let pending = 0;
    try {
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
      const pendingLeaves = await db.leaveRequest.findMany({
        where: { employeeId, status: 'pending', startDate: { gte: yearStart, lte: yearEnd } },
        select: { startDate: true, endDate: true },
      });
      for (const l of pendingLeaves) {
        const days = Math.max(1, Math.round((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1);
        pending += days;
      }
    } catch {/* pending stays 0 — non-fatal */}

    const sum = (k: 'total' | 'used' | 'remaining') => balanceRows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);

    return NextResponse.json(
      {
        linked: true,
        year,
        total: sum('total'),
        used: sum('used'),
        remaining: sum('remaining'),
        pending,
        rows: balanceRows,
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('Get my leave balance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
