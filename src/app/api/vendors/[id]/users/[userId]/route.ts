import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import {
  generateInviteToken, inviteExpiry, resolveBaseUrl, inviteLink, notifyBgvEvent, INVITE_TTL_DAYS,
} from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * GET /api/vendors/[id]/users/[userId] — one team member + their open case
 * count (vendor admin team page detail).
 * PATCH — team management actions:
 *   { action: 'resend_invite' }                    pending → fresh single-use link
 *   { action: 'cancel_invite' }                    pending → revoked (inviteStatus='revoked', token cleared)
 *   { action: 'disable' }                          active → inactive (they can no longer sign in;
 *                                                  their active cases are auto-unassigned so work is not lost)
 *   { action: 'reactivate' }                       inactive → pending (a new activation link is required)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isHR = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isHR && auth.role !== 'vendor_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
    }

    const { id: vendorCompanyId, userId } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');

    // Authorization: current DB state — vendor admin only manages own company.
    if (auth.role === 'vendor_admin') {
      const caller = await db.$queryRawUnsafe(
        `SELECT "vendorCompanyId","status" FROM "VendorUser" WHERE "email"=$1 LIMIT 1`, auth.email,
      ).catch(() => []) as any[];
      if (!caller.length || caller[0].vendorCompanyId !== vendorCompanyId || caller[0].status !== 'active') {
        return NextResponse.json({ error: 'Forbidden — different vendor or inactive account.' }, { status: 403, headers: CORS });
      }
    }

    const targetRows = await db.$queryRawUnsafe(
      `SELECT "id","email","name","role","status","vendorCompanyId" FROM "VendorUser" WHERE "id"=$1 AND "vendorCompanyId"=$2 LIMIT 1`,
      userId, vendorCompanyId,
    ).catch(() => []) as any[];
    if (!targetRows.length) return NextResponse.json({ error: 'Vendor user not found' }, { status: 404, headers: CORS });
    const target = targetRows[0];

    const baseUrl = resolveBaseUrl(req);

    switch (action) {
      case 'resend_invite': {
        if (target.status !== 'pending') {
          return NextResponse.json({ error: 'Only pending (invited) users can be re-invited.' }, { status: 409, headers: CORS });
        }
        const { raw, hash } = generateInviteToken();
        await db.$executeRawUnsafe(
          `UPDATE "VendorUser" SET "inviteTokenHash"=$1,"inviteExpiresAt"=$2,"inviteStatus"='sent',"invitedAt"=NOW(),"invitedById"=$3,"updatedAt"=NOW() WHERE "id"=$4`,
          hash, inviteExpiry(), auth.userId, userId,
        );
        const link = inviteLink(baseUrl, raw);
        await notifyBgvEvent({
          db, event: 'invite_resent', recipient: target.email, vendorCompanyId, vendorUserId: userId,
          subject: 'Your new activation link',
          html: `<p>Hello ${target.name},</p><p>A new activation link was generated for your 3Boxes vendor account. Any earlier link is now invalid.</p><p><a href="${link}">Activate your account</a> — single use, expires in ${INVITE_TTL_DAYS} days.</p>`,
        });
        return NextResponse.json({ message: 'A new invitation was queued.', email: target.email }, { headers: CORS });
      }
      case 'cancel_invite': {
        if (target.status !== 'pending') {
          return NextResponse.json({ error: 'Only pending (invited) users can have their invitation cancelled.' }, { status: 409, headers: CORS });
        }
        await db.$executeRawUnsafe(
          `UPDATE "VendorUser" SET "inviteStatus"='revoked',"inviteToken"=NULL,"inviteTokenHash"=NULL,"inviteExpiresAt"=NULL,"updatedAt"=NOW() WHERE "id"=$1`,
          userId,
        );
        await db.auditLog.create({ data: { userId: auth.userId, action: 'VENDOR_INVITE_REVOKED', module: 'vendor', details: `Cancelled pending invitation for ${target.email}` } }).catch(() => null);
        return NextResponse.json({ message: 'Invitation cancelled — the link will no longer work.', email: target.email }, { headers: CORS });
      }
      case 'disable': {
        if (target.status !== 'active') {
          return NextResponse.json({ error: 'Only active users can be disabled.' }, { status: 409, headers: CORS });
        }
        // Admins may not disable themselves (lock-out guard).
        if (auth.role === 'vendor_admin' && target.email?.toLowerCase() === String(auth.email || '').toLowerCase()) {
          return NextResponse.json({ error: 'You cannot disable your own admin account.' }, { status: 400, headers: CORS });
        }
        await db.$executeRawUnsafe(
          `UPDATE "VendorUser" SET "status"='inactive',"updatedAt"=NOW() WHERE "id"=$1`, userId,
        );
        // Unassign open cases so work is never silently lost (brief screen 05).
        const openCases = await db.$queryRawUnsafe(
          `SELECT "id","candidateName","caseNumber" FROM "BgvRequest"
            WHERE "assignedVendorUserId"=$1 AND "status" IN ('assigned','in_progress','rework_required')`,
          userId,
        ).catch(() => []) as any[];
        for (const c of openCases) {
          await db.$executeRawUnsafe(
            `UPDATE "BgvRequest" SET "assignedVendorUserId"=NULL,"status"='awaiting_assignment',"version"="version"+1,"updatedAt"=NOW() WHERE "id"=$1`,
            c.id,
          ).catch(() => 0);
        }
        await db.auditLog.create({
          data: { userId: auth.userId, action: 'VENDOR_USER_DISABLED', module: 'vendor',
                  details: `Disabled vendor user ${target.email}; ${openCases.length} open case(s) returned to the unassigned queue` },
        }).catch(() => null);
        // Inform vendor admins + HR? Record notification for the disabled user's cases.
        return NextResponse.json({
          message: `${target.name} disabled. ${openCases.length} open case(s) moved back to Unassigned.`,
          unassignedCases: openCases.length,
        }, { headers: CORS });
      }
      case 'reactivate': {
        if (target.status !== 'inactive') {
          return NextResponse.json({ error: 'Only disabled users can be reactivated.' }, { status: 409, headers: CORS });
        }
        // Reactivation returns the account to PENDING with a fresh invite —
        // a disabled account must never silently regain access (brief fix #2).
        const { raw, hash } = generateInviteToken();
        await db.$executeRawUnsafe(
          `UPDATE "VendorUser" SET "status"='pending',"inviteTokenHash"=$1,"inviteExpiresAt"=$2,"inviteStatus"='sent',"invitedAt"=NOW(),"invitedById"=$3,"updatedAt"=NOW() WHERE "id"=$4`,
          hash, inviteExpiry(), auth.userId, userId,
        );
        const link = inviteLink(baseUrl, raw);
        await notifyBgvEvent({
          db, event: 'invite_reactivated', recipient: target.email, vendorCompanyId, vendorUserId: userId,
          subject: 'Your account was reactivated — set a new password',
          html: `<p>Hello ${target.name},</p><p>Your vendor account was reactivated by an administrator. Please set a new password to regain access.</p><p><a href="${link}">Set your password</a> — single use, expires in ${INVITE_TTL_DAYS} days.</p>`,
        });
        return NextResponse.json({ message: 'Account reactivated as pending — a fresh activation link was queued.', email: target.email }, { headers: CORS });
      }
      default:
        return NextResponse.json({ error: "action must be 'resend_invite' | 'cancel_invite' | 'disable' | 'reactivate'" }, { status: 400, headers: CORS });
    }
  } catch (error) {
    console.error('Vendor user PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
