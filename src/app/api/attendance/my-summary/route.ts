import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { resolveCompanyScope } from '@/lib/companyScope';
import { computeMyAttendanceSummary } from '@/lib/attendance-summary';
import { ensureEmployeeRemoteColumns } from '@/lib/employee-remote-columns';

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

    // Only 'self'-scope users resolve through resolveCompanyScope; admins
    // get a best-effort self lookup below (Task 107).
    const employeeId: string | null = scope.ownEmployeeId;
    const companyId: string | null = scope.ownCompanyId;

    // Task 107: admin roles (scope 'all') skip the employee lookup inside
    // resolveCompanyScope for performance — but tenant admins / HR heads
    // often ARE linked to an Employee row (e.g. hr@marqaitech.com). Do a
    // best-effort lookup so their personal summary + mobile punch identity
    // resolve; only 404 when no linked row exists.
    let effectiveEmployeeId = employeeId;
    let effectiveCompanyId = companyId;
    if (!effectiveEmployeeId && scope.scope === 'all' && scope.userId) {
      try {
        const selfEmp = await db.employee.findFirst({
          where: { userId: scope.userId, status: 'active' },
          select: { id: true, companyId: true },
        });
        if (selfEmp) {
          effectiveEmployeeId = selfEmp.id;
          effectiveCompanyId = selfEmp.companyId || effectiveCompanyId;
        }
      } catch (e) {
        console.error('[my-summary] admin self-employee lookup failed:', e);
      }
    }

    // If the user has no Employee row at all, we cannot compute
    // a personal attendance summary — return 404 with a clear message.
    if (!effectiveEmployeeId) {
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
      employeeId: effectiveEmployeeId,
      companyId: effectiveCompanyId,
      tenantId: scope.tenantId,
      month: monthParam,
    });

    // Include the resolved employee identity so mobile clients can use this
    // endpoint as the canonical punch target resolver (employeeId for
    // /api/attendance/punch) without a second lookup.
    // Task 108: also expose the remote check-in pre-approval flags so the
    // web + mobile UIs can hide the punch options when they are not enabled.
    try {
      await ensureEmployeeRemoteColumns(db);
      const emp = await db.employee.findUnique({
        where: { id: effectiveEmployeeId },
        select: {
          id: true, firstName: true, lastName: true, employeeId: true, email: true,
          wfhPreApproved: true, mobileCheckInEnabled: true, webCheckInEnabled: true,
          holidayWeekendPunchEnabled: true,
        },
      }).catch(async () => db.employee.findUnique({
        where: { id: effectiveEmployeeId },
        select: { id: true, firstName: true, lastName: true, employeeId: true, email: true },
      }));
      if (emp) {
        (summary as Record<string, unknown>).employee = emp;
        const e = emp as Record<string, unknown>;
        (summary as Record<string, unknown>).remotePermissions = {
          wfhPreApproved: e.wfhPreApproved === true,
          mobileCheckInEnabled: e.mobileCheckInEnabled === true,
          webCheckInEnabled: e.webCheckInEnabled === true,
          holidayWeekendPunchEnabled: e.holidayWeekendPunchEnabled === true,
        };
      }
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
