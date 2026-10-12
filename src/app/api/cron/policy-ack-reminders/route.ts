/**
 * Policy Acknowledgement Reminder Cron (Task 88)
 *
 *   GET /api/cron/policy-ack-reminders?secret=CRON_SECRET
 *   GET /api/cron/policy-ack-reminders   (Authorization: Bearer <admin JWT>
 *                                         → sweeps ONLY the caller's tenant)
 *
 * Spec: "Pending Policy Acknowledgement — Notification & Email Workflow v1.0"
 *
 * Sweeps every tenant with a DEDICATED database (shared platform-DB tenants
 * are skipped — their legacy rows have no per-tenant scoping) and:
 *   1. Finds ACTIVE policies whose assignment date (effectiveDate || createdAt)
 *      is ≥ 30 calendar days in the past.
 *   2. Finds active employees who have NOT acknowledged the policy's current
 *      version (a 'rejected' acknowledgment still counts as pending — the
 *      employee must accept in the end). Version-aware: acknowledging v1.0
 *      does not clear a pending v1.1.
 *   3. Sends ONE consolidated notification per (employee, recipient) listing
 *      all eligible pending policies:
 *        - the employee          → reminder (recommended by the spec matrix)
 *        - the Reporting Manager → 30-day pending alert
 *        - HR / Admin roles      → 30-day pending alert
 *   4. Dedupes through the NotificationDelivery log: first escalation at day
 *      30, follow-up reminders at most every 7 days, and stops permanently
 *      for a policy version once it is acknowledged.
 *
 * Schedule (vercel.json): daily 03:00 UTC = 08:30 IST — Hobby-plan safe.
 * Vercel Cron injects `Authorization: Bearer $CRON_SECRET` automatically.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenantById } from '@/lib/tenant-db';
import { dispatchNotification } from '@/lib/notification-center';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const CRON_SECRET = process.env.CRON_SECRET || '3boxes-hrms-cron-2026';
const THRESHOLD_DAYS = 30;   // first escalation after 30 calendar days
const REPEAT_DAYS = 7;       // follow-up reminder interval (configurable)

// HR / Admin audience for the 30-day alert (matches leave-notify fallbacks —
// includes tenant_admin so customers whose HR account uses that role, e.g.
// hr@marqaitech.com on LIVE, are covered).
const HR_ROLES = ['hr_admin', 'admin', 'tenant_admin', 'company_hr_admin'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() { return NextResponse.json({}, { headers: cors() }); }

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const bearer = request.headers.get('authorization');
    const bearerToken = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : null;

    // Auth mode 1 — Vercel Cron (secret): sweep ALL dedicated tenants.
    const isCronSecret = searchParams.get('secret') === CRON_SECRET || bearerToken === CRON_SECRET;

    // Auth mode 2 — admin/HR JWT: sweep ONLY the caller's tenant (manual
    // "run now" from the app; also lets admins verify the reminder pipeline).
    let adminTenantId: string | null = null;
    if (!isCronSecret && bearerToken) {
      try {
        const decoded = await verifyToken(getTokenFromHeaders(request.headers) || '');
        const role = (decoded as { role?: string } | null)?.role || '';
        const tid = (decoded as { tenantId?: string | null } | null)?.tenantId || null;
        if (['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'].includes(role)) {
          adminTenantId = tid;
        }
      } catch { /* fall through to unauthorized */ }
    }

    if (!isCronSecret && !adminTenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors() });
    }

    const platformDb = getPlatformDb();

    // Dedicated-DB tenants only (LIVE + demo pattern). Shared platform-DB
    // tenants are skipped: their legacy rows have no tenant scoping and
    // re-sweeping the platform DB once per shared tenant caused timeouts.
    const dedicated = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      select: { tenantId: true, tenant: { select: { name: true, slug: true, status: true } } },
    });
    let tenants = dedicated
      .filter((d: any) => d.tenant?.status === 'active')
      .map((d: any) => ({ id: d.tenantId, name: d.tenant?.name || d.tenant?.slug || d.tenantId }));

    // Admin-JWT mode: restrict to the caller's own tenant (super admins with
    // no tenant scope sweep everything, same as cron mode).
    const sweepAll = isCronSecret || !adminTenantId;
    if (!sweepAll) tenants = tenants.filter((t: { id: string }) => t.id === adminTenantId);

    let alertsSent = 0;
    const details: any[] = [];

    for (const tenant of tenants) {
      try {
        const db = await getDbForTenantById(tenant.id);
        alertsSent += await sweepTenant(db, tenant.id, tenant.name, details);
      } catch (e) {
        console.warn(`[PolicyAckCron] tenant ${tenant.id} failed: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({
      success: true,
      mode: sweepAll ? 'all_tenants' : 'admin_single_tenant',
      tenantsSwept: tenants.length,
      alertsSent,
      details,
      thresholdDays: THRESHOLD_DAYS,
      repeatDays: REPEAT_DAYS,
      checkedAt: new Date().toISOString(),
    }, { headers: cors() });
  } catch (error) {
    console.error('Policy acknowledgement reminder cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors() });
  }
}

/** Dedupe: has this recipient already been reminded for this employee within the repeat window? */
async function alreadySent(db: any, eventKey: string, entityId: string, recipientId: string, sinceDays: number): Promise<boolean> {
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
  const count = await db.notificationDelivery.count({
    where: { eventKey, entityType: 'policy_ack_reminder', entityId, recipientId, createdAt: { gte: since } },
  }).catch(() => 1); // on error, assume already sent (safer than spamming)
  return count > 0;
}

async function sweepTenant(db: any, tenantId: string, tenantName: string, details: any[]): Promise<number> {
  const now = new Date();

  // Active policies + their assignment date (effectiveDate || createdAt)
  const policies = await db.policy.findMany({
    where: { status: 'active' },
    select: { id: true, title: true, version: true, effectiveDate: true, createdAt: true },
    take: 100,
  }).catch(() => []);
  if (!policies.length) return 0;

  // Accepted acknowledgments: key `${policyId}:${employeeId}` → Set<versions>
  const acks = await db.policyAcknowledgment.findMany({
    select: { policyId: true, employeeId: true, policyVersion: true, action: true },
    take: 5000,
  }).catch(() => []);
  const accepted = new Map<string, Set<string>>();
  for (const a of acks) {
    if (a.action !== 'accepted') continue; // 'rejected' stays pending
    const k = `${a.policyId}:${a.employeeId}`;
    if (!accepted.has(k)) accepted.set(k, new Set());
    accepted.get(k)!.add(a.policyVersion || '');
  }

  // Active employees (+ RM and department for the alert template)
  const employees = await db.employee.findMany({
    where: { status: 'active' },
    select: {
      id: true, employeeId: true, firstName: true, lastName: true, userId: true,
      reportingManagerId: true,
      reportingManager: { select: { userId: true, firstName: true, lastName: true } },
      department: { select: { name: true } },
    },
    take: 1000,
  }).catch(() => []);
  if (!employees.length) return 0;

  // HR / Admin audience (per tenant)
  const hrUsers = await db.user.findMany({
    where: { role: { in: HR_ROLES }, status: 'active' },
    select: { id: true },
    take: 15,
  }).catch(() => []);

  let sent = 0;

  for (const emp of employees) {
    // Eligible pending policies for this employee
    const pending: { title: string; version: string; assignedOn: string; days: number }[] = [];
    for (const p of policies) {
      if (accepted.get(`${p.id}:${emp.id}`)?.has(p.version || '')) continue;
      const assignedAt = p.effectiveDate ? new Date(p.effectiveDate) : new Date(p.createdAt);
      if (Number.isNaN(assignedAt.getTime())) continue;
      const days = Math.floor((now.getTime() - assignedAt.getTime()) / 86400000);
      if (days < THRESHOLD_DAYS) continue; // not yet 30 days / not yet effective
      pending.push({
        title: p.title,
        version: p.version || '1.0',
        assignedOn: assignedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        days,
      });
    }
    if (!pending.length) continue;

    const empName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'An employee';
    const policyLines = pending
      .map((p) => `• ${p.title} (v${p.version}) — assigned ${p.assignedOn}, ${p.days} day${p.days === 1 ? '' : 's'} pending`)
      .join('\n');
    const baseVars = {
      Employee_Name: empName,
      Employee_Code: emp.employeeId ? ` (${emp.employeeId})` : '',
      Department: emp.department?.name || '—',
      RM_Name: emp.reportingManager
        ? `${emp.reportingManager.firstName || ''} ${emp.reportingManager.lastName || ''}`.trim() || '—'
        : '—',
      Pending_Policies: policyLines,
      Policy_Count: pending.length === 1 ? 'y' : 'ies',
      Days_Pending: String(Math.max(...pending.map((p) => p.days))),
    };

    // 1) Employee reminder (recommended by the spec matrix)
    if (emp.userId && !(await alreadySent(db, 'core_hr.policy.ack_employee_reminder', emp.id, emp.userId, REPEAT_DAYS))) {
      const res = await dispatchNotification({
        tenantId, module: 'core_hr', eventKey: 'core_hr.policy.ack_employee_reminder',
        recipients: [{ userId: emp.userId, name: empName }],
        vars: {
          Pending_Policies: policyLines,
          Policy_Count: baseVars.Policy_Count,
          Days_Pending: baseVars.Days_Pending,
        },
        entity: { type: 'policy_ack_reminder', id: emp.id, link: '/policies-handbook' },
      }).catch(() => null);
      sent += res ? res.deliveries.filter((d: any) => d.status === 'sent').length : 0;
    }

    // 2) Reporting Manager alert (identifies the employee + pending policies)
    const rmUserId = emp.reportingManager?.userId;
    if (rmUserId && !(await alreadySent(db, 'core_hr.policy.ack_pending', emp.id, rmUserId, REPEAT_DAYS))) {
      const res = await dispatchNotification({
        tenantId, module: 'core_hr', eventKey: 'core_hr.policy.ack_pending',
        recipients: [{ userId: rmUserId }],
        vars: baseVars,
        entity: { type: 'policy_ack_reminder', id: emp.id, link: '/company/policies' },
      }).catch(() => null);
      sent += res ? res.deliveries.filter((d: any) => d.status === 'sent').length : 0;
    }

    // 3) HR / Admin alerts
    for (const hr of hrUsers) {
      if (await alreadySent(db, 'core_hr.policy.ack_pending', emp.id, hr.id, REPEAT_DAYS)) continue;
      const res = await dispatchNotification({
        tenantId, module: 'core_hr', eventKey: 'core_hr.policy.ack_pending',
        recipients: [{ userId: hr.id }],
        vars: baseVars,
        entity: { type: 'policy_ack_reminder', id: emp.id, link: '/company/policies' },
      }).catch(() => null);
      sent += res ? res.deliveries.filter((d: any) => d.status === 'sent').length : 0;
    }

    details.push({
      tenant: tenantName,
      employee: empName,
      pendingPolicies: pending.map((p) => `${p.title} (v${p.version})`),
      daysPending: baseVars.Days_Pending,
    });
  }
  return sent;
}
