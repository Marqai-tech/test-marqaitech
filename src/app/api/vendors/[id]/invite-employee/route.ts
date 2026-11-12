import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import {
  generateInviteToken, inviteExpiry, resolveBaseUrl, inviteLink,
  notifyBgvEvent, INVITE_TTL_DAYS,
} from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/vendors/[id]/invite-employee
 *   body: { name, email }
 *
 * Creates a PENDING vendor_employee membership and emails a single-use
 * activation link (brief fix #1):
 *  - Never creates an active user, never sets or returns a password.
 *  - Role is ALWAYS vendor_employee — role escalation via body is ignored.
 *    HR-only admin creation goes through invite-admin.
 *  - The existing-email branch does NOT overwrite another vendor's user and
 *    does NOT reset anyone's password. Same-vendor pending user → re-invite.
 *  - Caller scoping: HR may invite for any vendor; a vendor_admin only for
 *    their own company.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isHR = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isHR && auth.role !== 'vendor_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
    }

    const { id: vendorCompanyId } = await params;
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const name = String(body?.name || '').trim();
    if (!email || !name) return NextResponse.json({ error: 'name and email required' }, { status: 400, headers: CORS });
    // Body-supplied role/password are deliberately ignored.

    // Vendor admin must belong to THIS vendor company (current DB row, not token).
    if (auth.role === 'vendor_admin') {
      const caller = await db.$queryRawUnsafe(
        `SELECT "id","vendorCompanyId","status" FROM "VendorUser" WHERE "email"=$1 LIMIT 1`,
        auth.email,
      ).catch(() => []) as any[];
      if (!caller.length || caller[0].vendorCompanyId !== vendorCompanyId) {
        return NextResponse.json({ error: 'You can only invite employees to your own vendor company.' }, { status: 403, headers: CORS });
      }
      if (caller[0].status !== 'active') {
        return NextResponse.json({ error: 'Your account is not active.' }, { status: 403, headers: CORS });
      }
    }

    const vcRows = await db.$queryRawUnsafe(`SELECT id, name FROM "VendorCompany" WHERE id=$1 LIMIT 1`, vendorCompanyId).catch(() => []) as any[];
    if (vcRows.length === 0) return NextResponse.json({ error: 'Vendor company not found' }, { status: 404, headers: CORS });
    const vendor = vcRows[0];

    const baseUrl = resolveBaseUrl(req);

    const existing = await db.$queryRawUnsafe(
      `SELECT "id","vendorCompanyId","status","role" FROM "VendorUser" WHERE "email"=$1 LIMIT 1`,
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
          { error: 'This person was disabled. Reactivate the account instead of re-inviting.' },
          { status: 409, headers: CORS },
        );
      }
      if (eu.status === 'active') {
        return NextResponse.json(
          { error: 'This employee is already active in your vendor company.' },
          { status: 409, headers: CORS },
        );
      }
      // pending → authorized resend, old token invalidated.
      const { raw, hash } = generateInviteToken();
      await db.$executeRawUnsafe(
        `UPDATE "VendorUser" SET "name"=$1, "role"='vendor_employee', "inviteTokenHash"=$2, "inviteExpiresAt"=$3,
           "inviteStatus"='sent', "invitedAt"=NOW(), "invitedById"=$4, "updatedAt"=NOW() WHERE "id"=$5`,
        name, hash, inviteExpiry(), auth.userId, eu.id,
      );
      const link = inviteLink(baseUrl, raw);
      await notifyBgvEvent({
        db,
        event: 'invite_employee_resent',
        recipient: email,
        vendorCompanyId,
        vendorUserId: eu.id,
        subject: `Your invitation link: ${vendor.name} BGV team`,
        html: inviteHtml(vendor.name, name, link, INVITE_TTL_DAYS, baseUrl, true),
      });
      await db.auditLog.create({ data: { userId: auth.userId, action: 'VENDOR_EMPLOYEE_INVITE_RESENT', module: 'vendor', details: `Re-invited ${email} to ${vendor.name}` } }).catch(() => null);
      return NextResponse.json({ message: 'Invitation re-sent — a new activation link was queued.', vendorUserId: eu.id, email }, { headers: CORS });
    }

    const vuId = `vu-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const { raw, hash } = generateInviteToken();
    await db.$executeRawUnsafe(
      `INSERT INTO "VendorUser" ("id","vendorCompanyId","email","name","role","status","inviteTokenHash","inviteExpiresAt","inviteStatus","invitedAt","invitedById","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,'vendor_employee','pending',$5,$6,'sent',NOW(),$7,NOW(),NOW())`,
      vuId, vendorCompanyId, email, name, hash, inviteExpiry(), auth.userId,
    );

    const link = inviteLink(baseUrl, raw);
    await notifyBgvEvent({
      db,
      event: 'invite_employee',
      recipient: email,
      vendorCompanyId,
      vendorUserId: vuId,
      subject: `Invitation: join ${vendor.name}'s BGV team`,
      html: inviteHtml(vendor.name, name, link, INVITE_TTL_DAYS, baseUrl, true),
    });

    await db.auditLog.create({ data: { userId: auth.userId, action: 'VENDOR_EMPLOYEE_INVITED', module: 'vendor', details: `Invited ${email} as vendor_employee under ${vendor.name}` } }).catch(() => null);
    return NextResponse.json({ message: 'Invitation sent — the employee must activate via the emailed link.', vendorUserId: vuId, email }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('Invite vendor employee error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

function inviteHtml(vendorName: string, name: string, link: string, ttlDays: number, baseUrl: string, employee = false): string {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;">
    <h2 style="color:#16254E;">${employee ? 'You\'ve been invited to a BGV team' : 'Vendor Admin invitation'}</h2>
    <p>Hello ${name},</p>
    <p>You have been invited to <strong>${vendorName}</strong> on the 3Boxes HRMS Vendor BGV Portal as a <strong>Vendor ${employee ? 'Employee' : 'Admin'}</strong>.</p>
    <p><a href="${link}" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:12px 0;">Set your password & activate</a></p>
    <p>This single-use link expires in ${ttlDays} days. Only you receive it — create your own password on the activation page.</p>
    <p style="font-size:12px;color:#64748b;">If the button does not work, open: ${link}</p>
  </div>`;
}
