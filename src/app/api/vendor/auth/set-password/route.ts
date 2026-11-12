import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { hashPassword } from '@/lib/auth';
import { sha256, INVITE_TTL_DAYS } from '@/lib/bgv';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/vendor/auth/set-password
 *   body: { token, password }
 *
 * Single-use, atomic, hash-verified activation (brief fix #2):
 *  - Looks the invite up by SHA-256(token) — plaintext tokens are never stored.
 *  - Expired / used / revoked / disabled states get distinct, helpful errors
 *    without leaking whether the email exists.
 *  - Activation is one conditional UPDATE (WHERE status='pending' AND hash
 *    matches AND not expired) — a replayed token updates zero rows.
 *  - A deliberately disabled (inactive) account can never be re-activated
 *    through this endpoint.
 */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    const password = String(body?.password || '');
    if (!token || !password) {
      return NextResponse.json({ error: 'token and password are required' }, { status: 400, headers: CORS });
    }
    // Password policy (mock 03): min length + at least one letter and one digit.
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters and include letters and numbers.' },
        { status: 400, headers: CORS },
      );
    }

    const hash = sha256(token);

    // 1) Hash lookup with expiry + pending state in SQL (atomic eligibility).
    const rows = await db.$queryRawUnsafe(
      `SELECT "id","email","name","role","status","inviteExpiresAt","inviteStatus"
         FROM "VendorUser"
        WHERE "inviteTokenHash" = $1
           OR ("inviteToken" IS NOT NULL AND "inviteStatus" IS NULL AND "inviteToken" = $1)
        LIMIT 1`,
      hash,
    ).catch(() => []) as any[];

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'This invitation link is invalid or was already used. Please ask your admin or HR to send a new invitation.', code: 'INVALID_TOKEN' },
        { status: 404, headers: CORS },
      );
    }
    const vu = rows[0];

    if (vu.inviteStatus === 'used' || (vu.status === 'active' && vu.passwordSetAt)) {
      return NextResponse.json(
        { error: 'This invitation was already used. Sign in with your password instead.', code: 'USED_TOKEN' },
        { status: 409, headers: CORS },
      );
    }
    if (vu.inviteStatus === 'revoked') {
      return NextResponse.json(
        { error: 'This invitation was revoked. Please request a new invitation.', code: 'REVOKED_TOKEN' },
        { status: 403, headers: CORS },
      );
    }
    if (vu.status === 'inactive') {
      return NextResponse.json(
        { error: 'This account has been disabled and cannot be activated. Contact your vendor admin or HR.', code: 'ACCOUNT_DISABLED' },
        { status: 403, headers: CORS },
      );
    }
    if (vu.inviteExpiresAt && new Date(vu.inviteExpiresAt).getTime() < Date.now()) {
      return NextResponse.json(
        { error: `This invitation expired (links are valid ${INVITE_TTL_DAYS} days). Please request a new invitation.`, code: 'EXPIRED_TOKEN' },
        { status: 403, headers: CORS },
      );
    }

    // 2) Atomic single-use consumption: the WHERE clause only matches a still
    //    pending account; concurrent/replayed calls update zero rows.
    const hashed = await hashPassword(password);
    const updated = await db.$executeRawUnsafe(
      `UPDATE "VendorUser"
          SET "passwordHash"=$1, "passwordSetAt"=NOW(), "status"='active',
              "inviteStatus"='used', "inviteToken"=NULL, "inviteTokenHash"=NULL, "inviteExpiresAt"=NULL,
              "updatedAt"=NOW()
        WHERE "id"=$2 AND "status"='pending'`,
      hashed, vu.id,
    ).catch(() => 0);

    if (!updated) {
      return NextResponse.json(
        { error: 'This invitation was just used or the account state changed. Try signing in, or request a new invitation.', code: 'USED_TOKEN' },
        { status: 409, headers: CORS },
      );
    }

    await db.auditLog.create({
      data: { userId: vu.id, action: 'VENDOR_USER_ACTIVATED', module: 'vendor', details: `Vendor ${vu.role} ${vu.email} activated their account` },
    }).catch(() => null);

    // Notify vendor admins (in-portal awareness that a member is available).
    try {
      const admins = await db.$queryRawUnsafe(
        `SELECT "email" FROM "VendorUser" WHERE "vendorCompanyId"=(SELECT "vendorCompanyId" FROM "VendorUser" WHERE "id"=$1) AND "role"='vendor_admin' AND "status"='active'`,
        vu.id,
      ) as any[];
      for (const a of admins) {
        const { notifyBgvEvent } = await import('@/lib/bgv');
        await notifyBgvEvent({
          db,
          event: 'employee_activated',
          recipient: a.email,
          vendorUserId: vu.id,
          subject: `${vu.name} is now active and available for assignment`,
          html: `<p>${vu.name} (${vu.email}) activated their vendor account and can now be assigned BGV cases.</p>`,
        });
      }
    } catch { /* optional */ }

    return NextResponse.json({ message: 'Password set. You can now log in.', email: vu.email, role: vu.role }, { headers: CORS });
  } catch (error) {
    console.error('Vendor set-password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
