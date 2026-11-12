import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { hashPassword } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

/**
 * PATCH /api/vendors/[id]/users/[userId]
 *   body: { action: 'activate' | 'deactivate' | 'reset_password' | 'resend_invite', password? }
 *
 * HR-side Vendor Management actions on a vendor portal user:
 *  - activate        : pending/inactive → active (requires passwordHash set)
 *  - deactivate      : any → inactive (blocks vendor portal login)
 *  - reset_password  : set a new password directly (HR shares it out-of-band)
 *  - resend_invite   : regenerate the invite token (user goes back to pending)
 *
 * Auth: HR/admin roles only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const { id: vendorCompanyId, userId } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // Vendor user must belong to this vendor company
    const rows = await db.$queryRawUnsafe(
      `SELECT id, email, name, role, status, "passwordHash" IS NOT NULL AS "hasPassword", "inviteToken"
       FROM "VendorUser" WHERE "id" = $1 AND "vendorCompanyId" = $2 LIMIT 1`,
      userId, vendorCompanyId,
    ).catch(() => []) as any[];
    if (rows.length === 0) return NextResponse.json({ error: 'Vendor user not found' }, { status: 404, headers: CORS });
    const vu = rows[0];

    if (action === 'activate') {
      if (!vu.hasPassword) {
        return NextResponse.json({ error: 'User has not set a password yet — use Resend Invite or Reset Password first.' }, { status: 400, headers: CORS });
      }
      await db.$executeRawUnsafe(
        `UPDATE "VendorUser" SET "status" = 'active', "updatedAt" = NOW() WHERE "id" = $1`, userId,
      );
    } else if (action === 'deactivate') {
      await db.$executeRawUnsafe(
        `UPDATE "VendorUser" SET "status" = 'inactive', "updatedAt" = NOW() WHERE "id" = $1`, userId,
      );
    } else if (action === 'reset_password') {
      const password = String(body.password || '');
      if (password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400, headers: CORS });
      }
      const hashed = await hashPassword(password);
      await db.$executeRawUnsafe(
        `UPDATE "VendorUser" SET "passwordHash" = $1, "passwordSetAt" = NOW(), "status" = 'active', "inviteToken" = NULL, "updatedAt" = NOW() WHERE "id" = $2`,
        hashed, userId,
      );
    } else if (action === 'resend_invite') {
      const inviteToken = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      await db.$executeRawUnsafe(
        `UPDATE "VendorUser" SET "status" = 'pending', "inviteToken" = $1, "invitedAt" = NOW(), "invitedById" = $2, "updatedAt" = NOW() WHERE "id" = $3`,
        inviteToken, auth.userId, userId,
      );
      // Best-effort email with the new set-password link
      try {
        const vcRows = await db.$queryRawUnsafe(`SELECT name FROM "VendorCompany" WHERE "id" = $1 LIMIT 1`, vendorCompanyId).catch(() => []) as any[];
        const { sendEmail } = await import('@/lib/email');
        await sendEmail({
          to: vu.email,
          subject: `Invitation reminder: Vendor portal for ${vcRows[0]?.name || 'our company'}`,
          html: `<p>You have been invited to the vendor portal. Please set your password using the link below (valid for 7 days):</p>
                 <p><a href="https://3boxes-hrms-beta.vercel.app/vendor/set-password?token=${inviteToken}">Set Your Password</a></p>`,
        }).catch(() => null);
      } catch {}
      await db.auditLog.create({
        data: { userId: auth.userId, action: 'VENDOR_USER_INVITE_RESENT', module: 'vendor', details: `Re-invited ${vu.email}` },
      }).catch(() => null);
      return NextResponse.json({ message: 'Invite resent', inviteToken, setPasswordUrl: `/vendor/set-password?token=${inviteToken}` }, { headers: CORS });
    } else {
      return NextResponse.json({ error: 'action must be activate | deactivate | reset_password | resend_invite' }, { status: 400, headers: CORS });
    }

    await db.auditLog.create({
      data: { userId: auth.userId, action: `VENDOR_USER_${action.toUpperCase()}`, module: 'vendor', details: `Vendor user ${vu.email}: ${action}` },
    }).catch(() => null);

    return NextResponse.json({ message: `Vendor user ${action.replace('_', ' ')} done`, email: vu.email }, { headers: CORS });
  } catch (error) {
    console.error('Vendor user PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
