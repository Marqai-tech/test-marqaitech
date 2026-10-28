/**
 * Notification Center — Dispatch Engine (Task 36)
 *
 * Central multi-channel dispatcher. Every workflow trigger in the app calls
 * `dispatchNotification()`; this module resolves the tenant template, applies
 * preference overrides, renders {{placeholders}} and fans out to channels:
 *
 *   • in_app  → Notification row in the TENANT DB (bell icon + inbox)
 *   • email   → per-tenant SMTP/Resend (CollaborationSettings) with fallback
 *               to the global Resend sender; branded HTML + action buttons
 *   • sms     → Twilio REST API when env-configured, otherwise 'skipped'
 *   • slack   → IntegrationWebhook (Block Kit, URL action buttons)
 *   • teams   → IntegrationWebhook (Adaptive Card, openUrl actions)
 *
 * Every send is recorded in NotificationDelivery (status per channel) and
 * actionable notifications mint a single-use `actionToken` that the
 * approve/reject page and API consume.
 *
 * Multi-tenant: ALL writes go through the tenant DB resolved via
 * getDbForTenantById() — never the platform DB.
 */
import { getDbForTenantById, getPlatformDb } from '@/lib/tenant-db';
import { getEventDef, type NotificationChannel } from '@/lib/notification-events';
import { renderPlaceholders, buildEmailHtml } from '@/lib/notification-render';
import { sendTenantEmail, sendGlobalEmail } from '@/lib/notification-channels';

type PrismaClient = ReturnType<typeof getPlatformDb>;

export interface NotificationRecipient {
  /** In-app recipient user id (tenant user) */
  userId?: string;
  /** Display name for logging + greeting fallback */
  name?: string;
  /** Email address override; when absent, resolved from the user record */
  email?: string;
  /** Phone for SMS; when absent resolved from the user record */
  phone?: string;
}

export interface DispatchNotificationParams {
  tenantId: string;
  module: string;
  eventKey: string;
  recipients: NotificationRecipient[];
  /** Render variables, e.g. { 'Employee_Name': 'Amit', 'From_Date': '...' } */
  vars?: Record<string, string | number | null | undefined>;
  /** Linked entity for the delivery log + action routing */
  entity?: { type: string; id: string; link?: string };
  /** Force channels (skip preference resolution) — used by escalation cron */
  forceChannels?: NotificationChannel[];
  /** Suppress in-app (e.g. pure external candidate emails) */
  suppressInApp?: boolean;
  /** Request origin to build absolute action URLs (server routes) */
  origin?: string;
  /** Company name for branding (avoid extra queries when caller has it) */
  companyName?: string;
}

export interface DispatchResult {
  eventKey: string;
  module: string;
  deliveries: { channel: string; recipient: string; status: string; error?: string; actionToken?: string }[];
  skipped?: string; // why nothing was sent (e.g. event disabled)
}

// ─── Action token helper ─────────────────────────────────────────────

function mintActionToken(): string {
  return 'ntf_' + crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
}

/** Resolve the public base URL used in emails/chat action links. */
export function resolveBaseUrl(origin?: string, tenantSlug?: string): string {
  if (process.env.NOTIFICATION_BASE_URL) return process.env.NOTIFICATION_BASE_URL.replace(/\/$/, '');
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (origin) return origin.replace(/\/$/, '');
  // Tenant-aware fallback: live tenants use their subdomain; the demo tenant
  // uses the Vercel demo URL.
  if (tenantSlug) {
    if (tenantSlug === '3boxes-hrms-demo') return 'https://nexus-hrms-mu.vercel.app';
    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || '3boxeshrms.com';
    return `https://${tenantSlug}.${root}`;
  }
  return 'https://nexus-hrms-mu.vercel.app';
}

// ─── Template + preference resolution ────────────────────────────────

interface ResolvedTemplate {
  id: string | null;
  channels: NotificationChannel[];
  enabled: boolean;
  subject: string;
  body: string;
  bodySlack: string;
  bodySms: string;
  actionable: boolean;
  expiresHours: number;
  escalationHours: number;
  escalationEnabled: boolean;
  escalateToRole: string | null;
}

/** Seed any missing global templates from the code catalog (idempotent). */
export async function ensureTemplatesSeeded(db: PrismaClient): Promise<void> {
  const { NOTIFICATION_MODULES } = await import('@/lib/notification-events');
  const existing = await (db as any).notificationTemplate.findMany({
    where: { tenantId: null },
    select: { module: true, eventKey: true },
  });
  const have = new Set(existing.map((e: { module: string; eventKey: string }) => `${e.module}:${e.eventKey}`));
  const missing: any[] = [];
  for (const mod of NOTIFICATION_MODULES) {
    for (const ev of mod.events) {
      if (have.has(`${mod.module}:${ev.eventKey}`)) continue;
      missing.push({
        tenantId: null,
        module: mod.module,
        eventKey: ev.eventKey,
        name: ev.name,
        description: ev.description,
        channels: JSON.stringify(ev.defaultChannels),
        enabled: true,
        subject: ev.subject,
        bodyEmail: ev.body,
        bodyInApp: ev.body,
        bodySms: ev.sms,
        bodySlack: ev.slack,
        actionable: !!ev.actionable,
        expiresHours: 168,
      });
    }
  }
  if (missing.length) {
    await (db as any).notificationTemplate.createMany({ data: missing, skipDuplicates: true });
    console.log(`[NotificationCenter] Seeded ${missing.length} global template(s)`);
  }
}

async function resolveTemplate(db: PrismaClient, tenantId: string, module: string, eventKey: string): Promise<ResolvedTemplate> {
  const [tenantTpl, globalTpl] = await Promise.all([
    (db as any).notificationTemplate.findFirst({ where: { tenantId, module, eventKey } }),
    (db as any).notificationTemplate.findFirst({ where: { tenantId: null, module, eventKey } }),
  ]);
  const tpl = tenantTpl || globalTpl;
  if (!tpl) {
    // Fallback: build from the code catalog so we never silently drop events
    const def = getEventDef(module, eventKey);
    if (!def) throw new Error(`Unknown notification event ${module}/${eventKey}`);
    return {
      id: null,
      channels: def.defaultChannels,
      enabled: true,
      subject: def.subject,
      body: def.body,
      bodySlack: def.slack,
      bodySms: def.sms,
      actionable: !!def.actionable,
      expiresHours: 168,
      escalationHours: 48,
      escalationEnabled: true,
      escalateToRole: null,
    };
  }

  // Module-level preference (escalation + channel adjustments)
  let pref: any = null;
  try {
    pref = await (db as any).notificationPreference.findFirst({
      where: { tenantId, scope: 'tenant', module, eventKey: null },
    });
  } catch { /* preferences table may not exist on very old DBs */ }

  let channels: NotificationChannel[] = safeParseArray(tpl.channels) as NotificationChannel[];
  if (pref?.channelsDisabled?.length) {
    const disabled = safeParseArray(pref.channelsDisabled);
    channels = channels.filter((c) => !disabled.includes(c));
  }
  if (pref?.channelsEnabled?.length) {
    const enabled = safeParseArray(pref.channelsEnabled);
    channels = Array.from(new Set([...channels.filter((c) => enabled.includes(c))]));
    if (!channels.length) channels = enabled as NotificationChannel[];
  }

  return {
    id: tpl.id,
    channels,
    enabled: tpl.enabled !== false,
    subject: tpl.subject || '',
    body: tpl.bodyEmail || tpl.bodyInApp || '',
    bodySlack: tpl.bodySlack || '',
    bodySms: tpl.bodySms || '',
    actionable: tpl.actionable === true,
    expiresHours: typeof tpl.expiresHours === 'number' ? tpl.expiresHours : 168,
    escalationHours: pref?.escalationHours ?? 48,
    escalationEnabled: pref?.escalationEnabled !== false,
    escalateToRole: pref?.escalateToRole || null,
  };
}

function safeParseArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

// ─── Recipient resolution ────────────────────────────────────────────

interface ResolvedRecipient {
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}

async function resolveRecipient(db: PrismaClient, r: NotificationRecipient): Promise<ResolvedRecipient> {
  const base: ResolvedRecipient = { userId: r.userId || null, name: r.name || '', email: r.email || null, phone: r.phone || null };
  if (base.userId && (!base.email || !base.name)) {
    try {
      const user = await (db as any).user.findUnique({
        where: { id: base.userId },
        select: { name: true, email: true },
      });
      if (user) {
        if (!base.name) base.name = (user as any).name || '';
        if (!base.email) base.email = user.email || null;
      }
    } catch { /* user lookup is best-effort (e.g. candidate recipients) */ }
  }
  return base;
}

/** Resolve all active users holding a role in the tenant DB. */
export async function resolveRoleRecipients(db: PrismaClient, roles: string[], limit = 25): Promise<string[]> {
  try {
    const users = await db.user.findMany({
      where: { role: { in: roles }, status: 'active' },
      select: { id: true },
      take: limit,
    });
    return users.map((u: { id: string }) => u.id);
  } catch {
    return [];
  }
}

// ─── Main dispatcher ─────────────────────────────────────────────────

export async function dispatchNotification(params: DispatchNotificationParams): Promise<DispatchResult> {
  const { tenantId, module, eventKey } = params;
  const result: DispatchResult = { eventKey, module, deliveries: [] };
  if (!params.recipients?.length) {
    result.skipped = 'no recipients';
    return result;
  }

  let db: PrismaClient;
  try {
    db = await getDbForTenantById(tenantId);
  } catch (e) {
    result.skipped = 'tenant db unavailable';
    return result;
  }

  let tpl: ResolvedTemplate;
  try {
    await ensureTemplatesSeeded(db);
    tpl = await resolveTemplate(db, tenantId, module, eventKey);
  } catch (e) {
    result.skipped = `template resolution failed: ${(e as Error).message}`;
    return result;
  }

  if (!tpl.enabled) {
    result.skipped = 'event disabled by admin';
    return result;
  }

  const channels = (params.forceChannels?.length ? params.forceChannels : tpl.channels) as NotificationChannel[];

  // Tenant slug for absolute links + company name for branding
  let tenantSlug = '';
  let companyName = params.companyName || '';
  try {
    const platformDb = getPlatformDb();
    const tenant = await platformDb.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, name: true } });
    tenantSlug = tenant?.slug || '';
    if (!companyName) companyName = tenant?.name || '3Boxes HRMS';
  } catch { /* branding fallback below */ }
  const baseUrl = resolveBaseUrl(params.origin, tenantSlug);

  for (const raw of params.recipients) {
    const recipient = await resolveRecipient(db, raw);
    const recipientLabel = recipient.name || recipient.email || recipient.userId || 'unknown';

    // Per-recipient render vars
    const vars: Record<string, string> = {
      ...(params.vars || {} as Record<string, string>),
      Recipient_Name: recipient.name || 'there',
      Company_Name: companyName,
      HRMS_Name: '3Boxes HRMS',
      Today_Date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    };

    // Actionable → mint ONE token shared by all channels for this recipient
    let actionToken: string | null = null;
    let actionUrl = '';
    let actionExpiresAt: Date | null = null;
    if (tpl.actionable && params.entity) {
      actionToken = mintActionToken();
      const slugQ = tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : '';
      actionUrl = `${baseUrl}/notifications/action/${actionToken}${slugQ}`;
      vars.Action_Url = actionUrl;
      actionExpiresAt = await resolveActionExpiry(db, params.entity, tpl.expiresHours);
      vars.Action_Expiry = actionExpiresAt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    for (const channel of channels) {
      if (channel === 'in_app' && params.suppressInApp) continue;
      if (channel === 'email' && !recipient.email) { logDelivery(result, channel, recipientLabel, 'skipped', 'no email address'); continue; }
      if (channel === 'sms' && !recipient.phone) { logDelivery(result, channel, recipientLabel, 'skipped', 'no phone number'); continue; }

      try {
        const status = await sendToChannel({
          db, tenantId, channel, recipient, vars, tpl, module, eventKey,
          entity: params.entity, actionToken, actionUrl, actionExpiresAt, baseUrl, companyName,
        });
        logDelivery(result, channel, recipientLabel, status.status, status.error, actionToken || undefined);
      } catch (e: any) {
        console.warn(`[NotificationCenter] channel ${channel} failed for ${recipientLabel}: ${e?.message || e}`);
        logDelivery(result, channel, recipientLabel, 'failed', (e as Error).message, actionToken || undefined);
      }
    }
  }

  return result;
}

function logDelivery(
  result: DispatchResult, channel: string, recipient: string, status: string,
  error?: string, actionToken?: string,
) {
  result.deliveries.push({ channel, recipient, status, error, actionToken });
}

interface SendContext {
  db: PrismaClient;
  tenantId: string;
  channel: NotificationChannel;
  recipient: ResolvedRecipient;
  vars: Record<string, string>;
  tpl: ResolvedTemplate;
  module: string;
  eventKey: string;
  entity?: { type: string; id: string; link?: string };
  actionToken: string | null;
  actionUrl: string;
  actionExpiresAt: Date | null;
  baseUrl: string;
  companyName: string;
}

/**
 * Attendance approval links are tied to the request date. They must not stay
 * actionable for the generic seven-day notification window after the day the
 * permission/regularization request applies to.
 */
async function resolveActionExpiry(
  db: PrismaClient,
  entity: { type: string; id: string },
  defaultHours: number,
): Promise<Date> {
  if (entity.type === 'attendance_request') {
    const request = await (db as any).attendanceRequest.findUnique({
      where: { id: entity.id },
      select: { startDate: true, endDate: true },
    }).catch(() => null);
    const requestEnd = request?.endDate || request?.startDate;
    if (requestEnd) {
      const expiry = new Date(requestEnd);
      expiry.setUTCHours(23, 59, 59, 999);
      return expiry;
    }
  }
  return new Date(Date.now() + defaultHours * 3600 * 1000);
}

async function sendToChannel(ctx: SendContext): Promise<{ status: string; error?: string }> {
  const { db, tenantId, channel, recipient, vars, tpl, module, eventKey, entity } = ctx;
  const title = renderPlaceholders(tpl.subject, vars);
  const bodyText = renderPlaceholders(tpl.body, vars);
  const slackText = renderPlaceholders(tpl.bodySlack || tpl.body, vars);
  const smsText = renderPlaceholders(tpl.bodySms || tpl.body, vars);
  const link = ctx.actionUrl || (entity?.link ? `${ctx.baseUrl}${entity.link}` : '');

  let delivery: any;
  try {
    delivery = await (db as any).notificationDelivery.create({
      data: {
        tenantId,
        templateId: tpl.id || undefined,
        module, eventKey, channel,
        recipientType: recipient.userId ? 'user' : 'email',
        recipientId: recipient.userId || undefined,
        recipientName: recipient.name || undefined,
        recipientAddress: channel === 'email' ? recipient.email : channel === 'sms' ? recipient.phone : undefined,
        subject: title,
        status: 'queued',
        entityType: entity?.type,
        entityId: entity?.id,
        entityLink: entity?.link,
        actionable: !!(tpl.actionable && ctx.actionToken),
        actionToken: ctx.actionToken || undefined,
        // Task 93 fix: this used to reference the CALLER-LOCAL actionExpiresAt
        // (ReferenceError: actionExpiresAt is not defined) which silently
        // failed delivery.create for EVERY actionable notification
        // (probation review, profile updates, requisitions, escalations...).
        actionExpiresAt: ctx.actionToken ? (ctx.actionExpiresAt || new Date(Date.now() + tpl.expiresHours * 3600 * 1000)) : undefined,
        metadata: JSON.stringify(vars),
      },
    });
  } catch (e: any) {
    console.error(`[NotificationCenter] delivery.create failed for ${channel}: ${e?.message?.slice(0, 200) || e} (${e?.code || 'unknown'})`);
    throw e;
  }

  try {
    let status = 'sent';
    let error: string | undefined;

    switch (channel) {
      case 'in_app': {
        await db.notification.create({
          data: {
            tenantId,
            userId: recipient.userId!,
            title,
            message: bodyText,
            type: 'workflow',
            category: moduleCategory(module),
            link: entity?.link,
            isRead: false,
            isEmailSent: false,
          },
        });
        break;
      }
      case 'email': {
        const html = buildEmailHtml({ title, bodyText, actionUrl: ctx.actionUrl, companyName: ctx.companyName, expiresAt: vars.Action_Expiry });
        const res = await sendTenantEmail(db, tenantId, { to: recipient.email!, subject: title, html });
        status = res.success ? 'sent' : 'failed';
        error = res.error;
        if (res.success && res.usedFallback) status = 'sent'; // still delivered (possibly sandbox)
        // Mirror into the recipient's internal Collaboration → Email inbox so
        // HR alerts are visible inside the app (not only in the mailbox).
        if (res.success && recipient.userId) {
          await mirrorToInternalInbox(db, ctx, recipient, title, bodyText).catch((mirrorErr: Error) => {
            console.warn(`[NotificationCenter] inbox mirror failed for ${recipient.email || recipient.userId}: ${mirrorErr.message}`);
          });
        }
        break;
      }
      case 'sms': {
        const res = await sendSms(recipient.phone!, smsText);
        status = res.status; error = res.error;
        break;
      }
      case 'slack':
      case 'teams': {
        const res = await sendChatWebhook(db, tenantId, channel, slackText, title, ctx.actionUrl, entity?.link ? `${ctx.baseUrl}${entity.link}` : undefined, ctx.companyName);
        status = res.status; error = res.error;
        break;
      }
      default:
        status = 'skipped'; error = `unknown channel ${channel}`;
    }

    await (db as any).notificationDelivery.update({
      where: { id: (delivery as any).id },
      data: { status, error: error || null },
    });
    return { status, error };
  } catch (e) {
    const msg = (e as Error).message;
    try {
      await (db as any).notificationDelivery.update({
        where: { id: (delivery as any).id },
        data: { status: 'failed', error: msg },
      });
    } catch { /* ignore */ }
    return { status: 'failed', error: msg };
  }
}

function moduleCategory(module: string): string {
  const map: Record<string, string> = {
    recruitment: 'recruitment', onboarding: 'workflow', core_hr: 'system',
    leave: 'leave', attendance: 'workflow', performance: 'performance',
    learning: 'system', payroll: 'payroll', exit: 'workflow',
  };
  return map[module] || 'system';
}

/**
 * Mirror a successfully-sent notification email into the recipient's internal
 * Collaboration → Email inbox (EmailMessage). Best-effort: never blocks or
 * fails the notification pipeline. Plain-text body matches the inbox renderer.
 */
async function mirrorToInternalInbox(
  db: PrismaClient,
  ctx: SendContext,
  recipient: ResolvedRecipient,
  subject: string,
  bodyText: string,
): Promise<void> {
  const emp = await db.employee.findFirst({
    where: { userId: recipient.userId! },
    select: { id: true, companyId: true },
  });
  if (!emp) return; // non-employee recipients (e.g. candidates) have no HR inbox

  await (db as any).emailMessage.create({
    data: {
      subject,
      body: bodyText,
      fromAddress: 'notifications@3boxeshrms.com',
      fromName: ctx.companyName || '3Boxes HRMS',
      toAddresses: JSON.stringify(recipient.email ? [recipient.email] : []),
      folder: 'inbox',
      isRead: false,
      labels: JSON.stringify(['Notification', ctx.module]),
      toEmployeeId: emp.id,
      companyId: emp.companyId || null,
      createdByFlow: 'notification',
    },
  });
}

// ─── SMS (Twilio REST, env-driven) ───────────────────────────────────

async function sendSms(phone: string, text: string): Promise<{ status: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    console.log(`[NotificationCenter SMS DEV] To: ${phone} | ${text.slice(0, 80)}`);
    return { status: 'skipped', error: 'SMS provider not configured (set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)' };
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, From: from, Body: text.slice(0, 480) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { status: 'failed', error: `Twilio ${res.status}: ${body.slice(0, 200)}` };
    }
    return { status: 'sent' };
  } catch (e) {
    return { status: 'failed', error: (e as Error).message };
  }
}

// ─── Slack / Teams webhooks ──────────────────────────────────────────

async function sendChatWebhook(
  db: PrismaClient, tenantId: string, channel: 'slack' | 'teams',
  text: string, title: string, actionUrl?: string, link?: string, companyName?: string,
): Promise<{ status: string; error?: string }> {
  let hooks: any[] = [];
  try {
    hooks = await (db as any).integrationWebhook.findMany({
      where: { tenantId, enabled: true, OR: [{ channel }, { type: channel }] },
      take: 3,
    });
  } catch { /* table may not exist on old DBs */ }
  if (!hooks.length) {
    return { status: 'skipped', error: `No ${channel} webhook configured (add one in Notifications → Integrations)` };
  }

  let lastError: string | undefined;
  let anySent = false;
  for (const hook of hooks) {
    try {
      const payload = channel === 'slack' ? slackPayload(text, title, actionUrl, link, companyName) : teamsPayload(text, title, actionUrl, link, companyName);
      const res = await fetch(hook.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) { anySent = true; } else { lastError = `${channel} webhook ${res.status}`; }
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  return anySent ? { status: 'sent' } : { status: 'failed', error: lastError };
}

function slackPayload(text: string, title: string, actionUrl?: string, link?: string, companyName?: string) {
  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: title.slice(0, 150), emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } },
  ];
  const elements: any[] = [];
  if (actionUrl) {
    elements.push(
      { type: 'button', style: 'primary', text: { type: 'plain_text', text: '✅ Approve' }, url: `${actionUrl}&action=approve` },
      { type: 'button', style: 'danger', text: { type: 'plain_text', text: '❌ Reject' }, url: `${actionUrl}&action=reject` },
    );
  }
  if (link) elements.push({ type: 'button', text: { type: 'plain_text', text: 'Open in HRMS' }, url: link });
  if (elements.length) blocks.push({ type: 'actions', elements });
  return { text: `${companyName ? companyName + ' · ' : ''}${title}`, blocks };
}

function teamsPayload(text: string, title: string, actionUrl?: string, link?: string, companyName?: string) {
  const actions: any[] = [];
  if (actionUrl) {
    actions.push(
      { type: 'Action.OpenUrl', title: '✅ Approve', url: `${actionUrl}&action=approve` },
      { type: 'Action.OpenUrl', title: '❌ Reject', url: `${actionUrl}&action=reject` },
    );
  }
  if (link) actions.push({ type: 'Action.OpenUrl', title: 'Open in HRMS', url: link });
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard', version: '1.4',
        body: [
          { type: 'TextBlock', text: `${companyName ? companyName + ' · ' : ''}${title}`, weight: 'Bolder', size: 'Medium', wrap: true },
          { type: 'TextBlock', text: text.slice(0, 2000), wrap: true },
        ],
        actions,
      },
    }],
  };
}

/**
 * Convenience: notify all users in roles + optional extra users, fanning out
 * through the full channel stack. Used by crons and admin actions.
 */
export async function dispatchToRoles(params: DispatchNotificationParams & { roles?: string[] }): Promise<DispatchResult> {
  const recipients: NotificationRecipient[] = [...params.recipients];
  if (params.roles?.length) {
    const db = await getDbForTenantById(params.tenantId);
    const ids = await resolveRoleRecipients(db, params.roles);
    for (const id of ids) if (!recipients.some((r) => r.userId === id)) recipients.push({ userId: id });
  }
  return dispatchNotification({ ...params, recipients });
}
