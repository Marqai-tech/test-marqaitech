import { NextResponse } from 'next/server';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { sendEmail } from '@/lib/email';
import { sendSms, isSmsConfigured } from '@/lib/sms';

/**
 * Task 142 — PRE-LOGIN "Contact HR" endpoint (no auth, mobile login page).
 *
 * The login screen's Contact HR button used to show an informational sheet
 * telling the employee to ask a colleague to raise a ticket. Now it RAISES
 * the ticket directly: the employee enters their Employee ID (optional) and
 * describes the issue, and this route:
 *   1. creates a real Ticket in the workspace's Help Desk (Support & AI →
 *      Help Desk on the web app — same system, same TK- numbering),
 *   2. notifies every active HR / Admin / IT Admin with an in-app
 *      notification (mobile bell alert) AND an email alert,
 *   3. attempts an SMS alert to those admins when an SMS gateway is
 *      configured,
 *   4. returns the ticket id so the employee sees confirmation.
 *
 * POST { employeeId?, name?, contact?, issueType, description, dialCode? }
 * Rate limited per IP (10 tickets / 15 min) to stop spam.
 */

const ISSUE_TYPES: Record<string, { label: string; priority: string }> = {
  otp_not_received: { label: 'OTP not received', priority: 'high' },
  signin_problem: { label: 'Sign-in problem', priority: 'high' },
  account_locked: { label: 'Account locked', priority: 'high' },
  password_reset: { label: 'Password reset', priority: 'medium' },
  employee_id_unknown: { label: 'Unknown Employee ID', priority: 'medium' },
  other: { label: 'Other issue', priority: 'medium' },
};

const ADMIN_ROLES = ['tenant_admin', 'admin', 'hr', 'it_admin', 'super_admin', 'hr_manager', 'ceo', 'hr_admin', 'company_hr_admin'];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

function resolveTenantSlug(request: Request): string {
  let slug = request.headers.get('x-tenant-slug') || '';
  const host = (request.headers.get('x-tenant-domain') || request.headers.get('host') || '').split(':')[0].toLowerCase();
  if (host.endsWith('.vercel.app') && slug === host.split('.')[0]) slug = '';
  if (!slug && host.endsWith('.3boxeshrms.com')) {
    const sub = host.replace('.3boxeshrms.com', '');
    if (sub && sub !== 'www' && sub !== 'nexus-hrms-demo' && sub !== 'nexus-hrms') slug = sub;
  }
  return slug;
}

function maskContact(contact: string): string {
  const c = String(contact || '').trim();
  if (!c) return '';
  if (c.includes('@')) {
    const at = c.indexOf('@');
    const local = c.slice(0, at);
    return `${local.slice(0, 2)}***${c.slice(at)}`;
  }
  const digits = c.replace(/\D/g, '');
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : '••••';
}

// ── Tiny in-memory IP rate limit (per serverless instance; good-enough guard) ──
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 15 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => t > windowStart);
  list.push(now);
  hits.set(ip, list);
  return list.length > 10;
}

export async function POST(request: Request) {
  const platformDb = getPlatformDb();
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many help requests from this device — your HR team can also be reached by phone. Try again in 15 minutes.' },
        { status: 429, headers: corsHeaders() },
      );
    }

    const body = await request.json().catch(() => ({}));
    const issueKey = String(body.issueType || 'other');
    const issue = ISSUE_TYPES[issueKey] || ISSUE_TYPES.other;
    const description = String(body.description || '').trim();
    if (description.length < 10) {
      return NextResponse.json(
        { error: 'Please describe the issue in at least 10 characters so HR can help quickly.' },
        { status: 400, headers: corsHeaders() },
      );
    }

    const employeeId = String(body.employeeId || '').trim().slice(0, 40);
    const name = String(body.name || '').trim().slice(0, 80) || 'Employee (pre-login)';
    const contact = String(body.contact || '').trim().slice(0, 120);
    const dialCode = String(body.dialCode || '91').replace(/\D/g, '') || '91';

    // ── Resolve the workspace DB (host header, same ladder as the OTP route).
    // The mobile app points baseUrl at the workspace, so the host is present.
    const tenantSlug = resolveTenantSlug(request);
    let db: Awaited<ReturnType<typeof getDbForTenant>> | null = null;
    let tenant: { id: string; name: string; slug: string } | null = null;

    if (tenantSlug) {
      db = await getDbForTenant(tenantSlug).catch(() => null);
      tenant = (await platformDb.tenant
        .findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true, slug: true } })
        .catch(() => null)) as { id: string; name: string; slug: string } | null;
    }
    if (!db) {
      // Apex/unknown workspace → the platform DB Help Desk (super admins watch it).
      db = getPlatformDb();
    }
    // Task 142 fix — the Notification table has an FK to Tenant, so the
    // in-app alert MUST carry a real tenant id. On hosts without a tenant
    // subdomain (the demo Vercel URL) the slug lookup above misses; read the
    // tenant row from the resolved DB instead.
    if (!tenant) {
      try {
        const rows = (await db.$queryRawUnsafe<Array<{ id: string; name: string; slug: string }>>(
          `SELECT "id", "name", "slug" FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1`,
        )) as Array<{ id: string; name: string; slug: string }>;
        if (rows?.[0]?.id) tenant = rows[0];
      } catch (_) {}
    }

    // ── Find the people who must be alerted: active HR / Admin / IT Admin.
    let admins: { id: string; name: string; email: string; role: string }[] = [];
    try {
      admins = (await db.user.findMany({
        // User.email is NON-NULLABLE in the schema — `email: { not: null }`
        // throws PrismaClientValidationError at runtime and silently emptied
        // the admin list (no alerts ever fired). Email presence is guaranteed
        // by the column, so the filter is simply dropped (Task 142 fix 3).
        where: { role: { in: ADMIN_ROLES }, status: 'active' },
        select: { id: true, name: true, email: true, role: true },
        take: 12,
      })) as typeof admins;
    } catch (e) {
      console.error('[HelpDesk-Public] admin lookup failed:', e);
    }
    // The demo DB may mark admins differently — fall back to any non-candidate user.
    if (admins.length === 0) {
      try {
        admins = (await db.user.findMany({
          where: { status: 'active', role: { not: 'candidate' } },
          select: { id: true, name: true, email: true, role: true },
          take: 8,
        })) as typeof admins;
      } catch (_) {}
    }

    // ── Generate the TK- id (same pattern as /api/tickets).
    let nextNum = 1;
    try {
      const lastTicket = await db.ticket.findFirst({ orderBy: { createdAt: 'desc' }, select: { ticketId: true } });
      const match = lastTicket?.ticketId?.match(/TK-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    } catch (_) {}
    const ticketId = `TK-${nextNum.toString().padStart(4, '0')}`;

    const workspaceLabel = tenant?.name || tenantSlug || 'Platform';
    const subject = `[Login Help · ${issue.label}] ${name}${employeeId ? ` (${employeeId})` : ''}`;
    const fullDescription = [
      `Issue type: ${issue.label}`,
      employeeId ? `Employee ID: ${employeeId}` : 'Employee ID: not provided',
      contact ? `Reply-to contact: ${contact}` : 'Reply-to contact: none given',
      `Workspace: ${workspaceLabel}${tenantSlug ? ` (${tenantSlug}.3boxeshrms.com)` : ''}`,
      `Raised: pre-login, from the mobile app Contact HR form`,
      '',
      'Description:',
      description,
    ].join('\n');

    const ticket = await db.ticket.create({
      data: {
        ticketId,
        requesterType: 'guest',
        requesterId: `pre-login:${employeeId || maskContact(contact) || ip}`,
        requesterName: `${name}${employeeId ? ` · ${employeeId}` : ''}`,
        subject,
        description: fullDescription,
        priority: issue.priority,
        status: 'open',
        tags: 'pre-login,mobile,login-help',
      },
    });

    // ── Alert every admin: in-app notification (mobile bell) + email.
    let notifiedCount = 0;
    const emailTargets = admins.map((a) => a.email).filter(Boolean).slice(0, 10);
    if (emailTargets.length > 0) {
      const emailHtml = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e9f2;">
    <div style="background:linear-gradient(135deg,#3A57C4,#6C4FD6);padding:22px 26px;color:#ffffff;">
      <div style="font-size:18px;font-weight:800;">3Boxes HRMS — Login Help Desk</div>
      <div style="font-size:12px;opacity:.8;margin-top:2px;">New pre-login ticket raised from the mobile app</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0f172a;">${ticketId} · ${issue.label} <span style="color:#b45309;font-size:12px;">(${issue.priority} priority)</span></p>
      <p style="margin:0 0 14px;font-size:13px;color:#475569;">Raised by <strong>${name}</strong>${employeeId ? ` (Employee ID: <strong>${employeeId}</strong>)` : ''}${contact ? ` · contact: ${contact}` : ''} — workspace ${workspaceLabel}.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;font-size:13px;color:#334155;white-space:pre-wrap;line-height:1.6;">${description.replace(/</g, '&lt;')}</div>
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">Open the web app → Support &amp; AI → Help Desk to respond. The employee sees your replies once they can sign in; they also receive the ticket confirmation number now.</p>
    </div>
  </div>
</body></html>`;
      try {
        const result = await sendEmail({
          to: emailTargets,
          subject: `🎫 ${ticketId} — ${issue.label}: ${name}${employeeId ? ` (${employeeId})` : ''}`,
          html: emailHtml,
        });
        notifiedCount = result.success ? emailTargets.length : 0;
        if (!result.success) console.error('[HelpDesk-Public] admin email failed:', result.error);
      } catch (e) {
        console.error('[HelpDesk-Public] admin email exception:', e);
      }
    }

    for (const admin of tenant ? admins.slice(0, 10) : []) {
      try {
        await db.notification.create({
          data: {
            tenantId: tenant?.id || '',
            userId: admin.id,
            title: `Login help ticket ${ticketId}`,
            message: `${name}${employeeId ? ` (${employeeId})` : ''} raised "${issue.label}" from the mobile login screen: ${description.slice(0, 120)}`,
            type: 'alert',
            category: 'alert',
            link: '/helpdesk',
            isRead: false,
            isEmailSent: notifiedCount > 0,
          },
        });
      } catch (_) {}
    }

    // ── SMS nudge to admins' phones (best effort, only when a gateway exists).
    if (isSmsConfigured() && admins.length > 0) {
      try {
        const adminIds = admins.slice(0, 5).map((a) => a.id);
        const phones = (await db.$queryRawUnsafe<{ phone: string }[]>(
          `SELECT phone FROM "Employee" WHERE "userId" = ANY($1::text[]) AND phone IS NOT NULL LIMIT 5`,
          adminIds,
        )) as { phone: string }[];
        for (const p of phones.slice(0, 3)) {
          await sendSms(
            p.phone,
            `3Boxes HRMS: ticket ${ticketId} (${issue.label}) from ${name}${employeeId ? `/${employeeId}` : ''} — open Help Desk.`,
            dialCode,
          ).catch(() => null);
        }
      } catch (_) {}
    }

    return NextResponse.json(
      {
        ticketId,
        ticket: { ticketId, subject, status: 'open', priority: issue.priority },
        adminsAlerted: admins.length,
        emailAlertSent: notifiedCount > 0,
        smsAlertConfigured: isSmsConfigured(),
        message: `Ticket ${ticketId} raised — HR / Admin / IT Admin${emailTargets.length ? '' : ' (no email gateway configured yet)'} have been alerted.`,
      },
      { status: 201, headers: corsHeaders() },
    );
  } catch (error) {
    console.error('[HelpDesk-Public] error:', error);
    return NextResponse.json(
      { error: 'Could not raise the ticket right now — please ask a colleague to alert HR directly.' },
      { status: 500, headers: corsHeaders() },
    );
  }
}
