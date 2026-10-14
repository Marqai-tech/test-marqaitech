import { NextResponse } from 'next/server';
import { getDb, getPlatformDb, getDbForTenant } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { sendTenantEmail } from '@/lib/notification-channels';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

// Designated human approver for super-admin surface changes (GOLDEN RULE
// governance). Overridable via env without a code change.
export function changeApprovalRecipient(): string {
  return process.env.CHANGE_APPROVAL_EMAIL || 'mahesh@marqaitech.com';
}

function baseUrl(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '3boxeshrms.com';
  const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// ─── GET /api/super-admin/change-requests — list (super admin only) ───
export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    if (decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can view change requests' }, { status: 403, headers: corsHeaders() });
    }

    const platformDb = getPlatformDb();
    const status = new URL(request.url).searchParams.get('status');
    const where = status ? { status } : {};
    const requests = await platformDb.superAdminChangeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const counts = {
      pending: requests.filter((r) => r.status === 'pending_approval').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
      implemented: requests.filter((r) => r.status === 'implemented').length,
    };
    return NextResponse.json({ requests, counts }, { headers: corsHeaders() });
  } catch (error) {
    console.error('List change requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

// ─── Approval email delivery ───
// Platform-level emails have no CollaborationSettings of their own, and the
// global Resend key may be absent/invalid on some deployments. Resolve a
// WORKING SMTP in order: (1) the caller's home tenant, (2) up to 3 dedicated
// tenant DBs with verified SMTP. sendTenantEmail itself falls back to env SMTP
// and the global Resend sender, so a candidate chain covers every path.
async function dispatchApprovalEmail(
  request: Request,
  decoded: { tenantId?: string },
  approver: string,
  subject: string,
  html: string,
): Promise<{ sent: boolean; via: string; error?: string }> {
  const candidates: { dbLabel: string; resolve: () => Promise<{ db: unknown; tenantId: string } | null> }[] = [];
  if (decoded.tenantId) {
    candidates.push({
      dbLabel: 'home-tenant',
      resolve: async () => {
        try { return { db: await getDb(request), tenantId: decoded.tenantId as string }; } catch { return null; }
      },
    });
  }
  try {
    const platformDb = getPlatformDb();
    const dedicated = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      take: 3,
      orderBy: { provisionedAt: 'desc' },
      select: { tenant: { select: { slug: true, id: true } } },
    });
    for (const d of dedicated) {
      if (!d.tenant?.slug) continue;
      candidates.push({
        dbLabel: `tenant-db:${d.tenant.slug}`,
        resolve: async () => {
          try {
            const tdb = await getDbForTenant(d.tenant!.slug as string);
            const s = await tdb.collaborationSettings.findFirst({ where: { tenantId: d.tenant!.id as string } });
            if (s && (s as { smtpVerifiedAt?: Date | null }).smtpVerifiedAt) return { db: tdb, tenantId: d.tenant!.id as string };
            return null;
          } catch { return null; }
        },
      });
    }
  } catch { /* platform DB unavailable — fall through to Resend */ }

  for (const c of candidates) {
    try {
      const resolved = await c.resolve();
      if (!resolved) continue;
      const res = await sendTenantEmail(resolved.db as Parameters<typeof sendTenantEmail>[0], resolved.tenantId, { to: approver, subject, html });
      if (res.success) return { sent: true, via: c.dbLabel };
    } catch (e) {
      console.warn(`[ChangeRequests] approval email via ${c.dbLabel} failed:`, e instanceof Error ? e.message : e);
    }
  }

  // Last resort: global Resend sender (may be sandbox/invalid — reported honestly)
  try {
    const res = await sendEmail({ to: approver, subject, html });
    return { sent: res.success, via: 'resend-global', error: res.error };
  } catch (e) {
    return { sent: false, via: 'resend-global', error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── POST /api/super-admin/change-requests — raise a new change request ───
// Creates a pending_approval record, generates a single-use approval token,
// emails the designated approver (mahesh@marqaitech.com) with approval links,
// and writes an audit entry. The change may only be DEPLOYED once the request
// is approved (via email link or in-app by the super admin).
export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders() });
    if (decoded.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can raise change requests' }, { status: 403, headers: corsHeaders() });
    }

    const body = await request.json().catch(() => ({}));
    const title = (body.title || '').trim();
    const description = (body.description || '').trim();
    const moduleName = (body.module || 'super-admin').trim() || 'super-admin';
    if (!title || !description) {
      return NextResponse.json({ error: 'title and description are required' }, { status: 400, headers: corsHeaders() });
    }

    const platformDb = getPlatformDb();
    const crypto = await import('crypto');
    const approvalToken = crypto.randomBytes(24).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const requesterEmail = (decoded.email as string) || 'superadmin@3boxeshrms.com';

    const cr = await platformDb.superAdminChangeRequest.create({
      data: {
        title,
        description,
        module: moduleName,
        requestedBy: requesterEmail,
        status: 'pending_approval',
        approvalToken,
        tokenExpiresAt,
      },
    });

    // Email the designated approver with the decision links (GET renders a
    // confirmation page — no side effects on prefetch; the actual decision is
    // a POST from that page).
    const base = baseUrl(request);
    const reviewUrl = `${base}/api/super-admin/change-requests/token?token=${approvalToken}`;
    const approver = changeApprovalRecipient();
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <div style="background:#0f172a;color:#fff;padding:16px 24px">
          <h2 style="margin:0;font-size:18px">Super Admin Change Approval Required</h2>
        </div>
        <div style="padding:24px;color:#0f172a">
          <p>A change to the <b>super admin platform</b> has been proposed and requires your approval before any code update is deployed.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px 8px;background:#f8fafc;font-weight:600;width:160px">Title</td><td style="padding:6px 8px">${title}</td></tr>
            <tr><td style="padding:6px 8px;background:#f8fafc;font-weight:600">Module</td><td style="padding:6px 8px">${moduleName}</td></tr>
            <tr><td style="padding:6px 8px;background:#f8fafc;font-weight:600">Requested by</td><td style="padding:6px 8px">${requesterEmail}</td></tr>
            <tr><td style="padding:6px 8px;background:#f8fafc;font-weight:600;vertical-align:top">Description</td><td style="padding:6px 8px;white-space:pre-wrap">${description}</td></tr>
            <tr><td style="padding:6px 8px;background:#f8fafc;font-weight:600">Request ID</td><td style="padding:6px 8px">${cr.id}</td></tr>
          </table>
          <p style="margin:16px 0 8px"><b>Approve or reject this change:</b></p>
          <p><a href="${reviewUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Review &amp; Decide</a></p>
          <p style="color:#64748b;font-size:13px">This link expires on ${tokenExpiresAt.toISOString().slice(0, 10)}. Approval may also be granted in-app via Super Admin → Change Approvals.</p>
          <p style="color:#64748b;font-size:13px">Per the change-control policy, <b>no code update may be deployed to the super admin platform until this request is approved</b> by you or by the super admin in-app.</p>
        </div>
      </div>`;
    const emailResult = await dispatchApprovalEmail(request, decoded as { tenantId?: string }, approver, `[Approval Required] Super Admin Change: ${title}`, html);
    const emailSent = emailResult.sent;
    const emailError = emailResult.error || (emailResult.sent ? null : `no working email path (last tried: ${emailResult.via})`);

    // Audit (best-effort). userId is left null — the acting platform super
    // admin may not have a User row in the resolved audit DB, and AuditLog
    // carries an FK to User (SetNull); a bad userId silently kills the row.
    try {
      const db = await getDb(request);
      await db.auditLog.create({
        data: {
          action: 'CREATE_CHANGE_REQUEST',
          module: 'governance',
          details: `Change request "${title}" raised for module ${moduleName} by ${requesterEmail}; approval email to ${approver} ${emailSent ? `sent via ${emailResult.via}` : `FAILED (${emailError})`}`,
        },
      });
    } catch { /* audit must not fail the request */ }

    return NextResponse.json({ request: cr, approvalEmailTo: approver, emailSent, emailVia: emailResult.via, emailError }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Create change request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
