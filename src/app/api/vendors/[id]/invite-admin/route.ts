import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import {
  generateInviteToken, inviteExpiry, resolveBaseUrl, inviteLink,
  notifyBgvEvent, INVITE_TTL_DAYS, sha256,
} from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/vendors/[id]/invite-admin — HR invites a vendor admin.
 *
 * Secure invitation flow (brief fix #2):
 *  - 256-bit crypto token, only its SHA-256 hash + expiry stored; the raw
 *    token is emailed once and never returned by the API or stored in the DB.
 *  - Links are built from the validated request origin / env (no hardcoded
 *    deployment URLs).
 *  - Resending an invitation invalidates the previous token (hash replaced).
 *  - A disabled (inactive) account is NOT silently re-invited — the caller
 *    must reactivate it explicitly via the user management endpoint.
 *  - Email failures are recorded in BgvNotification and surfaced honestly
 *    as "queued/failed", never reported as delivered.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const { id: vendorCompanyId } = await params;
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const name = String(body?.name || '').trim();
    if (!email || !name) return NextResponse.json({ error: 'email and name required' }, { status: 400, headers: CORS });

    const vcRows = await db.$queryRawUnsafe(`SELECT * FROM "VendorCompany" WHERE "id"=$1 LIMIT 1`, vendorCompanyId).catch(() => []) as any[];
    if (vcRows.length === 0) return NextResponse.json({ error: 'Vendor not found' }, { status: 404, headers: CORS });
    const vendor = vcRows[0];

    // Duplicate handling: same email already belongs to a vendor account.
    const existing = await db.$queryRawUnsafe(
      `SELECT "id","vendorCompanyId","status","inviteStatus" FROM "VendorUser" WHERE "email"=$1 LIMIT 1`,
      email,
    ).catch(() => []) as any[];
    if (existing.length > 0) {
      const eu = existing[0];
      if (eu.vendorCompanyId !== vendorCompanyId) {
        return NextResponse.json(
          { error: 'This email already belongs to a user of another vendor company.' },
          { status: 409, headers: CORS },
        );
      }
      if (eu.status === 'inactive') {
        return NextResponse.json(
          { error: 'This account was disabled. Reactivate it from the vendor user list instead of re-inviting.' },
          { status: 409, headers: CORS },
        );
      }
      if (eu.status === 'active') {
        return NextResponse.json(
          { error: 'This admin is already active. No invitation needed.' },
          { status: 409, headers: CORS },
        );
      }
      // pending → resend path: invalidate old token, issue a fresh one.
      const { raw, hash } = generateInviteToken();
      await db.$executeRawUnsafe(
        `UPDATE "VendorUser" SET "name"=$1, "inviteTokenHash"=$2, "inviteExpiresAt"=$3, "inviteStatus"='sent',
           "invitedAt"=NOW(), "invitedById"=$4, "updatedAt"=NOW() WHERE "id"=$5`,
        name, hash, inviteExpiry(), auth.userId, eu.id,
      );
      const baseUrl = resolveBaseUrl(req);
      const link = inviteLink(baseUrl, raw);
      await notifyBgvEvent({
        db,
        event: 'invite_admin_resent',
        recipient: email,
        vendorCompanyId,
        subject: `Your invitation link: Vendor Admin for ${vendor.name}`,
        html: resendHtml(vendor.name, name, link, INVITE_TTL_DAYS, baseUrl),
      });
      await db.auditLog.create({ data: { userId: auth.userId, action: 'VENDOR_ADMIN_INVITE_RESENT', module: 'bgv', details: `Re-invited ${email} as admin for vendor ${vendorCompanyId}` } }).catch(() => null);
      const notif = await latestNotificationState(db, email, 'invite_admin_resent');
      return NextResponse.json({ message: 'Invitation re-sent to the admin.', vendorUserId: eu.id, email, invitation: notif }, { headers: CORS });
    }

    // New pending admin.
    const vuId = `vu-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const { raw, hash } = generateInviteToken();
    await db.$executeRawUnsafe(
      `INSERT INTO "VendorUser" ("id","vendorCompanyId","email","name","role","status","inviteTokenHash","inviteExpiresAt","inviteStatus","invitedAt","invitedById","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,'vendor_admin','pending',$5,$6,'sent',NOW(),$7,NOW(),NOW())`,
      vuId, vendorCompanyId, email, name, hash, inviteExpiry(), auth.userId,
    );

    const baseUrl = resolveBaseUrl(req);
    const link = inviteLink(baseUrl, raw);
    await notifyBgvEvent({
      db,
      event: 'invite_admin',
      recipient: email,
      vendorCompanyId,
      subject: `Invitation: Vendor Admin for ${vendor.name}`,
      html: inviteHtml(vendor.name, name, link, INVITE_TTL_DAYS, baseUrl),
    });

    await db.auditLog.create({ data: { userId: auth.userId, action: 'VENDOR_ADMIN_INVITED', module: 'bgv', details: `Invited ${email} as admin for vendor ${vendorCompanyId}` } }).catch(() => null);
    const notif = await latestNotificationState(db, email, 'invite_admin');
    return NextResponse.json({ message: 'Vendor admin invited — activation email queued.', vendorUserId: vuId, email, invitation: notif }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('Invite vendor admin error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

async function latestNotificationState(db: any, recipient: string, event: string) {
  try {
    const rows = await db.$queryRawUnsafe(
      `SELECT "status","error","createdAt" FROM "BgvNotification" WHERE "recipient"=$1 AND "event"=$2 ORDER BY "createdAt" DESC LIMIT 1`,
      recipient, event,
    ) as any[];
    if (!rows.length) return { status: 'queued' };
    return { status: rows[0].status, error: rows[0].error || undefined, at: rows[0].createdAt };
  } catch {
    return { status: 'queued' };
  }
}

function shell(title: string, bodyHtml: string, baseUrl: string): string {
  const brand = baseUrl || '';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;">
    <h2 style="color:#16254E;">${title}</h2>${bodyHtml}
    ${brand ? `<p style="font-size:12px;color:#64748b;">You are receiving this because you were invited to the 3Boxes HRMS Vendor BGV Portal.</p>` : ''}
  </div>`;
}

function inviteHtml(vendorName: string, name: string, link: string, ttlDays: number, baseUrl: string): string {
  return shell(
    `You've been invited as a Vendor Admin`,
    `<p>Hello ${name},</p>
     <p>You have been invited to administer background verification (BGV) cases for <strong>${vendorName}</strong>.</p>
     <p><a href="${link}" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:12px 0;">Activate your account</a></p>
     <p>This single-use link expires in ${ttlDays} days. It sets your own password — no one else ever receives it.</p>
     <p style="font-size:12px;color:#64748b;">If the button does not work, open: ${link}</p>`,
    baseUrl,
  );
}

function resendHtml(vendorName: string, name: string, link: string, ttlDays: number, baseUrl: string): string {
  return shell(
    `Your new activation link`,
    `<p>Hello ${name},</p>
     <p>A new activation link was generated for your Vendor Admin account for <strong>${vendorName}</strong>. Any earlier link is now invalid.</p>
     <p><a href="${link}" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:12px 0;">Activate your account</a></p>
     <p>This single-use link expires in ${ttlDays} days.</p>`,
    baseUrl,
  );
}
