/**
 * Regularization Release Window API (Task 161)
 *
 * GET  /api/attendance/regularization-release
 *      → current window state for everyone (drives the employee banner and
 *        the admin release panel).
 *
 * POST /api/attendance/regularization-release   (admin / hr_admin only)
 *      body { action: 'release' | 'close', payrollCutoffDay?, note? }
 *      'release' → enables regularization for ALL employees for this cycle
 *                  (until the payroll cut-off) and queues an email +
 *                  in-app/mobile notification to every active user.
 *      'close'   → closes the window immediately.
 *
 * The mass notification runs inside next/server after() so the HTTP response
 * returns instantly while emails flush in the background.
 */
import { NextResponse, after } from 'next/server';
import { requireUser, ok, fail, OPTIONS } from '@/lib/attendance-leave-api';
import { getDb } from '@/lib/tenant-db';
import {
  getRegularizationWindow,
  saveRegularizationRelease,
  getTenantPayrollCutoffDay,
  type RegularizationReleaseRecord,
} from '@/lib/regularization-release';
import { sanitizePlainText } from '@/lib/sanitize';

export { OPTIONS };

/** Admins + HR admins may release/close the window (user request). */
const RELEASE_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'];

async function tenantIdOf(request: Request, user: { tenantId?: string | null } | null): Promise<string | null> {
  if (user?.tenantId) return user.tenantId;
  try {
    const { resolveCompanyScope } = await import('@/lib/companyScope');
    const scope = await resolveCompanyScope(request);
    return (scope as { tenantId?: string | null } | null)?.tenantId || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  try {
    const tenantId = await tenantIdOf(request, user as { tenantId?: string | null });
    if (!tenantId) return fail('Tenant context is missing.', 400);
    const window = await getRegularizationWindow(db, tenantId);
    const cutoffDayDefault = await getTenantPayrollCutoffDay(db, tenantId);
    return ok({
      ...window,
      payrollCutoffDay: window.release?.payrollCutoffDay ?? cutoffDayDefault,
      payrollCutoffDayDefault: cutoffDayDefault,
      canManage: RELEASE_ROLES.includes(String((user as { role?: string }).role || '')),
    });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to load regularization window', 500);
  }
}

export async function POST(request: Request) {
  const db = await getDb(request);
  const { user, response } = await requireUser(request);
  if (!user) return response;
  const role = String((user as { role?: string }).role || '');
  if (!RELEASE_ROLES.includes(role)) return fail('Only Admins and HR admins can release the regularization window.', 403);
  const tenantId = await tenantIdOf(request, user as { tenantId?: string | null });
  if (!tenantId) return fail('Tenant context is missing.', 400);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch { /* empty body */ }
  const action = String(body.action || '').trim();
  if (!['release', 'close'].includes(action)) return fail('action must be "release" or "close"', 422);

  try {
    const current = await getRegularizationWindow(db, tenantId);
    const previous = current.release;
    const existing = previous || {
      released: false,
      releasedAt: new Date().toISOString(),
      releasedBy: String((user as { id?: string }).id || ''),
      releasedByName: String((user as { name?: string }).name || 'HR'),
      payrollCutoffDay: null as number | null,
      note: '',
    };

    let cutoffDay = existing.payrollCutoffDay;
    if (typeof body.payrollCutoffDay === 'number' && Number.isFinite(body.payrollCutoffDay)) {
      const n = Math.floor(body.payrollCutoffDay);
      if (n < 1 || n > 31) return fail('payrollCutoffDay must be between 1 and 31', 422);
      cutoffDay = n;
    } else if (cutoffDay == null) {
      cutoffDay = await getTenantPayrollCutoffDay(db, tenantId);
    }
    const note = sanitizePlainText(String(body.note ?? existing.note ?? ''), 300);

    const record: RegularizationReleaseRecord = {
      released: action === 'release',
      releasedAt: action === 'release' ? new Date().toISOString() : existing.releasedAt,
      releasedBy: String((user as { id?: string }).id || existing.releasedBy),
      releasedByName: String((user as { name?: string }).name || existing.releasedByName || 'HR'),
      payrollCutoffDay: cutoffDay,
      note,
    };
    await saveRegularizationRelease(db, tenantId, record);

    if (action !== 'release') {
      const window = await getRegularizationWindow(db, tenantId);
      return ok({ ...window, payrollCutoffDayDefault: await getTenantPayrollCutoffDay(db, tenantId) });
    }

    // ── Release: notify every active user (in-app/mobile + email) ──
    const users = await db.user.findMany({
      where: { tenantId, status: 'active' },
      select: { id: true, email: true, name: true },
    });
    const cutoff = await getRegularizationWindow(db, tenantId);
    const cutoffLabel = cutoff.cutoffDate
      ? new Date(cutoff.cutoffDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
      : 'the payroll cut-off date';
    const releasedBy = record.releasedByName || 'HR';
    const vars = {
      Cutoff_Date: cutoffLabel,
      Released_By: releasedBy,
      Note: note || 'Please regularize any missed punches for this cycle.',
    };
    const origin = new URL(request.url).origin;

    after(async () => {
      const { dispatchNotification } = await import('@/lib/notification-center');
      let sent = 0;
      let failed = 0;
      const CONCURRENCY = 6;
      let cursor = 0;
      const worker = async () => {
        while (cursor < users.length) {
          const u = users[cursor++];
          if (!u?.id && !u?.email) continue;
          try {
            await dispatchNotification({
              tenantId,
              module: 'attendance',
              eventKey: 'attendance.regularization_released',
              recipients: [{ userId: u.id || undefined, email: u.email || undefined, name: u.name || undefined }],
              vars,
              forceChannels: ['in_app', 'email'],
              entity: { type: 'attendance_regularization_window', id: 'release', link: '/attendance/regularize' },
              origin,
            });
            sent += 1;
          } catch (err) {
            failed += 1;
            console.warn('[regularization-release] notify failed for', u.email || u.id, err);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, users.length)) }, worker));
      console.log(`[regularization-release] window released — notifications: ${sent} sent, ${failed} failed`);
    });

    return NextResponse.json({
      ...cutoff,
      payrollCutoffDayDefault: await getTenantPayrollCutoffDay(db, tenantId),
      notified: users.length,
      dispatch: 'queued',
      message: `Regularization released for all employees until ${cutoffLabel}. ${users.length} notification(s) are being sent by email and in-app.`,
    }, { status: 200 });
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : 'Failed to update regularization window', 500);
  }
}
