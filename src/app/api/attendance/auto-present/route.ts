/**
 * Auto-Present for Management Employees (Task 82) — API
 *
 *   GET  /api/attendance/auto-present
 *        → { enabled, shiftStartDefault, shiftEndDefault, breakDurationMinutes }
 *          (scoped like /api/attendance-policy-config)
 *
 *   POST /api/attendance/auto-present      (admin only)
 *        body: { date?: 'YYYY-MM-DD', backfillDays?: 0..31, tzOffset?: number,
 *                employeeId?: string }
 *        → runs the engine for the caller's company scope and returns
 *          { created, updated, skipped*, managementCount, details }.
 *
 * The engine (src/lib/attendance-auto-present.ts) marks management employees
 * PRESENT with in/out punches from their roster/shift (or the policy default
 * shift) for each requested working day — never overwriting real punches,
 * approved leave, weekends or holidays, and never touching future dates.
 */
import { isAdminRole, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { resolveCompanyScope } from '@/lib/companyScope';
import { getDb } from '@/lib/tenant-db';
import { runManagementAutoPresent } from '@/lib/attendance-auto-present';

export { OPTIONS };

function pad2(n: number) { return String(n).padStart(2, '0'); }

export async function GET(request: Request) {
  const db = await getDb(request);
  const scope = await resolveCompanyScope(request);
  if (!scope) return fail('Unauthorized', 401);
  try {
    const cfg = await db.attendancePolicyConfig.findFirst({
      where: (scope.companyId || scope.ownCompanyId) ? { companyId: scope.companyId || scope.ownCompanyId } : {},
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    return ok({
      enabled: cfg?.autoPresentManagementEnabled === true,
      shiftStartDefault: cfg?.shiftStartDefault || '09:30',
      shiftEndDefault: cfg?.shiftEndDefault || '18:30',
      breakDurationMinutes: cfg?.breakDurationMinutes ?? 30,
    });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to load auto-present status', 500);
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  const scope = await resolveCompanyScope(request);
  if (!scope) return fail('Unauthorized', 401);
  if (!isAdminRole(scope.role)) return fail('Admin only', 403);

  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch { /* empty body allowed → today only */ }

  const tzOffset = typeof body.tzOffset === 'number' ? body.tzOffset : -330;
  // Client-local "today" from the caller's tz offset (getTimezoneOffset is UTC−local).
  const todayKey = body.todayKey && /^\d{4}-\d{2}-\d{2}$/.test(body.todayKey)
    ? body.todayKey
    : new Date(Date.now() - tzOffset * 60000).toISOString().slice(0, 10);

  const backfillDays = Math.min(Math.max(parseInt(String(body.backfillDays ?? 0), 10) || 0, 0), 31);
  const dateKeys: string[] = [];
  if (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    dateKeys.push(body.date);
  } else {
    for (let i = backfillDays; i >= 0; i -= 1) {
      const d = new Date(new Date(`${todayKey}T00:00:00.000Z`).getTime() - i * 86400000);
      dateKeys.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
    }
  }

  try {
    const result = await runManagementAutoPresent(db, {
      companyId: scope.companyId || scope.ownCompanyId || null,
      dateKeys,
      todayKey,
      tzOffsetMinutes: tzOffset,
      employeeId: typeof body.employeeId === 'string' && body.employeeId ? body.employeeId : undefined,
    });
    if (!result.enabled) {
      return ok({ ...result, message: 'Auto-present for management is disabled in Attendance Settings — nothing was changed.' });
    }
    return ok({
      ...result,
      message: result.created + result.updated > 0
        ? `Auto-present applied: ${result.created} record(s) created, ${result.updated} updated for ${result.managementCount} management employee(s).`
        : `Nothing to change — all management attendance rows are already up to date (${result.managementCount} management employee(s) in scope).`,
    });
  } catch (e: unknown) {
    console.error('[attendance/auto-present] run failed:', e);
    return fail(e instanceof Error ? e.message : 'Auto-present run failed', 500);
  }
}
