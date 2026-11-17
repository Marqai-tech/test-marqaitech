/**
 * Probation Review — Notification & Email Workflow helper (Task 93)
 *
 * Implements the "Probation Review — Notification & Email Workflow" spec:
 *   • Role-based recipients — the HR / MD ASSIGNED to the specific employee's
 *     review (resolved through the tenant's configured probation approval
 *     tiers), never a blanket broadcast.
 *   • Status-based triggers — dispatch only after the review status change
 *     has been persisted successfully.
 *   • Duplicate protection — one dispatch per (event, review, recipient);
 *     page refreshes / repeated actions cannot re-send.
 *   • Audit trail — every dispatch is recorded in NotificationDelivery
 *     (module 'probation', entityId = review id, per-channel status).
 *
 * Rejection semantics: termination emails are sent ONLY when the configured
 * reject rule actually terminates (actionRule.employeeStatus === 'terminated')
 * AND the employee status update succeeded; otherwise the employee receives
 * the review-rejection notification with next steps.
 */
import { dispatchNotification } from '@/lib/notification-center';
import type { NotificationRecipient } from '@/lib/notification-center';

type PrismaClient = Record<string, any>;

export interface ProbationNotifyInput {
  db: PrismaClient;
  tenantId: string;
  /** NotificationCenter event key, e.g. 'probation.review_submitted' */
  eventKey: string;
  /** The PerformanceReview (probation) row id — used as the dedup + entity anchor */
  reviewId: string;
  employee: {
    id: string;
    userId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    employeeId?: string | null;
    departmentName?: string | null;
    reportingManagerUserId?: string | null;
  };
  /** Resolved recipients for this event; when omitted the employee is used */
  recipients?: NotificationRecipient[];
  /** Users to exclude (e.g. the submitting HR from the "different HR" notification) */
  excludeUserIds?: (string | null | undefined)[];
  vars?: Record<string, string | number | null | undefined>;
  /** Request origin for absolute action links */
  origin?: string;
}

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

const fmtDateTime = (d: Date | string | null | undefined): string => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

/**
 * Revised probation end date = probationStartDate + (probationPeriod +
 * extensionPeriod) months — same formula the probation list API uses.
 */
export function computeProbationEndDate(probationData: {
  probationStartDate?: string | null;
  probationPeriod?: number | null;
  extensionPeriod?: number | null;
}): string {
  try {
    if (!probationData.probationStartDate) return '—';
    const start = new Date(probationData.probationStartDate);
    if (Number.isNaN(start.getTime())) return '—';
    const end = new Date(start);
    end.setMonth(end.getMonth() + Number(probationData.probationPeriod || 0) + Number(probationData.extensionPeriod || 0));
    return fmtDate(end);
  } catch { return '—'; }
}

/**
 * Duplicate guard — skip when a delivery for this (event, review, recipient)
 * was already attempted. Keeps page refreshes / repeated PATCH calls from
 * re-notifying (spec rule "Duplicate notifications").
 */
async function alreadyDelivered(
  db: PrismaClient,
  tenantId: string,
  eventKey: string,
  reviewId: string,
  recipient: NotificationRecipient,
): Promise<boolean> {
  if (!recipient.userId) return false;
  try {
    const dup = await (db as any).notificationDelivery.findFirst({
      where: {
        tenantId,
        module: 'probation',
        eventKey,
        entityType: 'probation_review',
        entityId: reviewId,
        recipientId: recipient.userId,
        status: { in: ['queued', 'sent'] },
      },
      select: { id: true },
    });
    return !!dup;
  } catch { /* delivery log unavailable — do not block dispatch */ return false; }
}

export async function dispatchProbationEvent(input: ProbationNotifyInput): Promise<void> {
  const { db, tenantId, eventKey, reviewId, employee, origin } = input;
  try {
    let recipients: NotificationRecipient[] = input.recipients?.length
      ? input.recipients
      : employee.userId
        ? [{ userId: employee.userId, name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() }]
        : [];
    const excluded = new Set((input.excludeUserIds || []).filter(Boolean) as string[]);
    if (excluded.size) recipients = recipients.filter((r) => !r.userId || !excluded.has(r.userId));
    if (!recipients.length) return;

    // Per-recipient duplicate guard
    const fresh: NotificationRecipient[] = [];
    for (const r of recipients) {
      if (await alreadyDelivered(db, tenantId, eventKey, reviewId, r)) continue;
      fresh.push(r);
    }
    if (!fresh.length) return;

    const empName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'An employee';
    await dispatchNotification({
      tenantId,
      module: 'probation',
      eventKey,
      recipients: fresh,
      vars: {
        Employee_Name: empName,
        Employee_ID: employee.employeeId || '—',
        Department: employee.departmentName || '—',
        ...Object.fromEntries(Object.entries(input.vars || {}).map(([k, v]) => [k, v == null ? '' : v])),
      },
      entity: { type: 'probation_review', id: reviewId, link: '/employees/probation' },
      origin,
    });
  } catch (e) {
    console.warn(`[ProbationNotify] dispatch ${eventKey} failed for review ${reviewId}: ${(e as Error).message}`);
  }
}

/**
 * Resolve the recipients ASSIGNED to this employee's probation review:
 * tier approvers from the tenant's probation_confirmation workflow config.
 * `tierIndex` (1-based) selects the tier; falls back to the tenant's HR
 * role-holders when the tier cannot be resolved.
 */
export async function resolveProbationTierRecipients(
  db: PrismaClient,
  tiers: { approverType: string; approverUserId?: string | null; approverName?: string | null }[] | null | undefined,
  tierIndex: number,
  employeeId: string,
): Promise<NotificationRecipient[]> {
  const ids = new Set<string>();
  try {
    if (tiers?.length) {
      const idx = Math.min(Math.max(tierIndex, 1), tiers.length) - 1;
      const tier = tiers[idx];
      if (tier?.approverType === 'specific_user' && tier.approverUserId) {
        ids.add(tier.approverUserId);
      } else if (tier?.approverType === 'reporting_manager') {
        const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { reportingManagerId: true } });
        if (emp?.reportingManagerId) {
          const mgr = await db.employee.findUnique({ where: { id: emp.reportingManagerId }, select: { userId: true } });
          if (mgr?.userId) ids.add(mgr.userId);
        }
      } else if ((tier?.approverType === 'tenant_admin' || tier?.approverType === 'ceo')) {
        const admins = await db.user.findMany({ where: { role: { in: ['super_admin', 'tenant_admin', 'ceo'] }, status: 'active' }, select: { id: true }, take: 20 });
        admins.forEach((a: { id: string }) => ids.add(a.id));
      } else {
        // hr_admin / finance / anything else — resolve by role family
        const roleMap: Record<string, string[]> = {
          hr_admin: ['admin', 'hr_admin', 'company_hr_admin', 'tenant_admin', 'ceo'],
          finance: ['finance', 'finance_admin'],
        };
        const roles = roleMap[tier?.approverType] || ['admin', 'hr_admin', 'company_hr_admin', 'tenant_admin', 'ceo'];
        const users = await db.user.findMany({ where: { role: { in: roles }, status: 'active' }, select: { id: true }, take: 20 });
        users.forEach((u: { id: string }) => ids.add(u.id));
      }
    }
  } catch { /* fall through to fallback */ }

  if (!ids.size) {
    try {
      const users = await db.user.findMany({ where: { role: { in: ['admin', 'hr_admin', 'company_hr_admin', 'tenant_admin', 'ceo'] }, status: 'active' }, select: { id: true }, take: 20 });
      users.forEach((u: { id: string }) => ids.add(u.id));
    } catch { /* nothing else we can do */ }
  }
  return [...ids].map((userId) => ({ userId }));
}

export { fmtDate, fmtDateTime };
