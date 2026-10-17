import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { computeMyAttendanceSummary } from '@/lib/attendance-summary';

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
 * GET /api/attendance/my-summary?month=YYYY-MM
 *
 * Returns the logged-in employee's attendance summary for the requested month
 * (default: the current month in the tenant/employee timezone).
 *
 * Response:
 *   {
 *     month: 'YYYY-MM',
 *     timezone: 'Asia/Kolkata',
 *     periodStart: 'YYYY-MM-DD',
 *     periodEnd:   'YYYY-MM-DD',
 *     workingDays, present, late, halfDay, absent, onLeave, holidays, weekend,
 *     attendedDays,
 *     attendanceRate: number | null,   // null when workingDays === 0
 *     timezoneSource, weekendDowUsed
 *   }
 *
 * SECURITY: an employee can NEVER read another employee's data. The
 * `employeeId` query param is IGNORED for scope 'self' — we always use the
 * logged-in user's own Employee row. Returns 401 when unauthenticated.
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const scope = await resolveCompanyScope(request);
    if (!scope) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders() },
      );
    }

    // Only employees (scope 'self') use this endpoint. Managers and admins
    // have their own dashboards. If an admin calls it, scope.ownEmployeeId
    // is null and we return a 404 rather than fabricate data.
    const employeeId: string | null = scope.ownEmployeeId;
    const companyId: string | null = scope.ownCompanyId;

    // If the user is an admin without an Employee row, we cannot compute
    // a personal attendance summary — return 404 with a clear message.
    if (!employeeId) {
      return NextResponse.json(
        {
          error: 'No active employee record found for the logged-in user.',
          month: null,
          workingDays: 0,
          attendanceRate: null,
        },
        { status: 404, headers: corsHeaders() },
      );
    }

    // Parse the month param (YYYY-MM). Default to null → current month.
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month'); // 'YYYY-MM' or null
    // employeeId param is intentionally ignored — see SECURITY note above.

    const summary = await computeMyAttendanceSummary({
      db,
      employeeId,
      companyId,
      tenantId: scope.tenantId,
      month: monthParam,
    });

    // Include the resolved employee identity so mobile clients can use this
    // endpoint as the canonical punch target resolver (employeeId for
    // /api/attendance/punch) without a second lookup.
    try {
      const emp = await db.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, firstName: true, lastName: true, employeeId: true, email: true },
      });
      if (emp) (summary as Record<string, unknown>).employee = emp;
    } catch {
      // non-fatal — summary already computed
    }

    return NextResponse.json(summary, { headers: corsHeaders() });
  } catch (error) {
    console.error('Get attendance my-summary error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    if (/column .* does not exist|does not exist in the current database|table .* does not exist/i.test(errMsg)) {
      // Schema drift — return an empty summary instead of a 500 so the card
      // shows "—" gracefully rather than crashing the whole Home page.
      return NextResponse.json(
        {
          month: null,
          workingDays: 0,
          present: 0,
          late: 0,
          halfDay: 0,
          absent: 0,
          onLeave: 0,
          holidays: 0,
          weekend: 0,
          attendedDays: 0,
          attendanceRate: null,
          timezone: 'Asia/Kolkata',
          timezoneSource: 'fallback',
          weekendDowUsed: [0, 6],
          periodStart: null,
          periodEnd: null,
        },
        { headers: corsHeaders() },
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders() },
    );
  }
}
