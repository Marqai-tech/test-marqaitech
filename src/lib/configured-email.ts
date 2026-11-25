/**
 * Configured Email — dynamic notification sender (scoped: Recruitment / Preboarding / Onboarding)
 *
 * Replaces hardcoded inline subject/HTML email sends. The subject, body and
 * enabled flag come from the NotificationTemplate system:
 *
 *   tenant override → global default row → code catalog defaults
 *
 * So admins can edit every message in Notification Center
 * (Notifications → Center) and enable/disable any event without code
 * changes. Delivery is logged to NotificationDelivery for the audit trail.
 *
 * Also exposes the workflow-timing config readers so hardcoded cadences
 * (interview reminder windows, offer expiry days) become tenant-configurable
 * with the previous hardcoded values as safe defaults.
 */
import { renderPlaceholders, buildEmailHtml } from '@/lib/notification-render';
import { resolveTemplate } from '@/lib/notification-center';
// Used by the internal/external provider split below (same definition as email.ts).
import { isInternalEmail } from '@/lib/email';

export interface ConfiguredEmailParams {
  db: any;
  tenantId: string;
  /** 'recruitment' | 'onboarding' */
  module: string;
  /** e.g. recruitment.interview.scheduled — must exist in the notification catalog */
  eventKey: string;
  vars?: Record<string, string | number | null | undefined>;
  to: string | string[];
  cc?: string[];
  toName?: string;
  /** Branded email button target (portal / deep link) */
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  entityLink?: string;
  status?: 'approved' | 'rejected' | 'pending' | 'info' | 'warning' | 'welcome';
}

export interface ConfiguredEmailResult {
  sent: boolean;
  skipped?: string;
  error?: string;
  subject?: string;
}

export async function sendConfiguredEmail(params: ConfiguredEmailParams): Promise<ConfiguredEmailResult> {
  const { db, tenantId, module, eventKey } = params;
  try {
    const tpl = await resolveTemplate(db, tenantId, module, eventKey);
    if (!tpl.enabled) {
      return { sent: false, skipped: 'event disabled by admin' };
    }

    // Tenant branding + company name (falls back silently)
    let companyName = '3Boxes HRMS';
    let branding: any;
    try {
      const { getPlatformDb } = await import('@/lib/tenant-db');
      const tenant = await getPlatformDb().tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, logo: true },
      });
      if (tenant?.name) companyName = tenant.name;
      if (tenant) {
        branding = {
          name: tenant.name,
          logoUrl: tenant.logo,
        };
      }
    } catch { /* branding fallback */ }

    const vars: Record<string, string> = {
      Company_Name: companyName,
      HRMS_Name: '3Boxes HRMS',
      Today_Date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      Recipient_Name: params.toName || 'there',
      ...Object.fromEntries(
        Object.entries(params.vars || {})
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ),
    };

    const subject = renderPlaceholders(tpl.subject, vars);
    const bodyText = renderPlaceholders((tpl as any).bodyEmail || tpl.body || '', vars);
    const html = buildEmailHtml({
      title: subject,
      bodyText,
      actionUrl: params.actionUrl,
      companyName,
      branding,
      status: params.status,
    });

    const to = params.cc?.length
      ? [...(Array.isArray(params.to) ? params.to : [params.to]), ...params.cc]
      : params.to;

    // Provider order (fixed 2026-11-25 after deliverability proof): the global
    // sender (Resend) is the ONLY provider proven to deliver to external
    // mailboxes. The SMTP relay (both env SMTP_HOST and the seeded tenant
    // CollaborationSettings pointed at webhostbox) ACCEPTS messages with
    // 250 OK but never delivers them to external recipients — a test mailbox
    // at an external provider stayed empty after 5 minutes of polling while
    // every send reported success. That black hole is exactly why candidate
    // OTP emails vanished while the UI claimed "Verification code sent".
    // Tenant SMTP stays as a fallback ONLY for internal same-server recipients
    // (its one reliably-working mode).
    let res: { success: boolean; error?: string } = { success: false, error: 'not attempted' };
    try {
      const { sendEmail } = await import('@/lib/email');
      const g = await sendEmail({ to: to as any, subject, html });
      if (g.success) {
        res = { success: true };
      } else {
        res = { success: false, error: `global sender: ${g.error || 'failed'}` };
      }
    } catch (gErr: any) {
      res = { success: false, error: `global sender error: ${gErr?.message || gErr}` };
    }

    const toList = Array.isArray(to) ? to : [to];
    const allInternal = toList.length > 0 && toList.every((addr) => isInternalEmail(String(addr)));
    if (!res.success && allInternal) {
      try {
        const { sendTenantEmail } = await import('@/lib/notification-channels');
        const fb = await sendTenantEmail(db, tenantId, { to: to as any, subject, html });
        if (fb?.success) {
          res = { success: true };
        } else {
          res = { success: false, error: `${res.error || 'global failed'}; tenant SMTP: ${fb?.error || 'failed'}` };
        }
      } catch (fbErr: any) {
        res = { success: false, error: `${res.error || 'global failed'}; tenant SMTP error: ${fbErr?.message || fbErr}` };
      }
    }

    // Best-effort delivery log (Notification Center delivery history)
    try {
      await (db as any).notificationDelivery.create({
        data: {
          tenantId,
          templateId: tpl.id || null,
          module,
          eventKey,
          channel: 'email',
          recipientType: 'candidate',
          recipientAddress: Array.isArray(to) ? to.join(', ') : to,
          subject,
          status: res.success ? 'sent' : 'failed',
          error: res.error || null,
          entityType: params.entityType || null,
          entityId: params.entityId || null,
          entityLink: params.entityLink || null,
          metadata: JSON.stringify(vars),
        },
      });
    } catch { /* delivery log best-effort */ }

    // Honest result: report what actually happened. Returning sent:true while
    // every provider failed made the UI show "Verification code sent" for an
    // email that never left the building (candidate register OTP bug).
    console.log(`[ConfiguredEmail] eventKey=${eventKey} tplEnabled=${tpl.enabled} tplId=${tpl.id || '-'} res=${JSON.stringify(res)}`);
    return res.success
      ? { sent: true, subject }
      : { sent: false, subject, error: res.error };
  } catch (e: any) {
    return { sent: false, error: e?.message || String(e) };
  }
}

// ─── Workflow timing configuration (dynamic, with safe defaults) ────────────

export interface RecruitmentTimings {
  acceptanceReminderEnabled: boolean;
  acceptanceReminderDaysBefore: number;
  autoCancelHoursBefore: number;
  lastHourReminderEnabled: boolean;
}

/**
 * Interview reminder timings from RecruitmentWorkflowConfig.config JSON
 * ({ timings: { ... } }). Defaults keep the previous hardcoded behavior.
 */
export async function getRecruitmentTimings(db: any, tenantId: string): Promise<RecruitmentTimings> {
  const defaults: RecruitmentTimings = {
    acceptanceReminderEnabled: true,
    acceptanceReminderDaysBefore: 1,
    autoCancelHoursBefore: 24,
    lastHourReminderEnabled: true,
  };
  try {
    const rows = await (db as any).$queryRawUnsafe(
      `SELECT "config" FROM "RecruitmentWorkflowConfig"
        WHERE "tenantId" = $1 AND "workflowType" = 'recruitment'
        ORDER BY "updatedAt" DESC LIMIT 1`,
      tenantId,
    );
    const cfg = rows?.[0]?.config ? JSON.parse(rows[0].config) : null;
    const timings = cfg?.timings || cfg || {};
    return {
      acceptanceReminderEnabled: timings.acceptanceReminderEnabled !== false,
      acceptanceReminderDaysBefore: Number(timings.acceptanceReminderDaysBefore) > 0 ? Number(timings.acceptanceReminderDaysBefore) : 1,
      autoCancelHoursBefore: Number(timings.autoCancelHoursBefore) > 0 ? Number(timings.autoCancelHoursBefore) : 24,
      lastHourReminderEnabled: timings.lastHourReminderEnabled !== false,
    };
  } catch {
    return defaults;
  }
}

/** Offer expiry days from OfferWorkflowConfig.rules.offerExpiryDays (default 7). */
export async function getOfferExpiryDays(db: any, tenantId: string): Promise<number> {
  try {
    const row = await (db as any).offerWorkflowConfig.findUnique({ where: { tenantId } });
    const rules = row?.rules ? JSON.parse(row.rules) : null;
    const days = Number(rules?.offerExpiryDays);
    return Number.isFinite(days) && days > 0 ? days : 7;
  } catch {
    return 7;
  }
}
