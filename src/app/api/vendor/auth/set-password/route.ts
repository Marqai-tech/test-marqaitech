import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { hashPassword } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

/**
 * POST /api/vendor/auth/set-password
 *   body: { token, password }
 *
 * Activates a vendor user invited via /api/vendors/[id]/invite-admin.
 * The invite email contains a link with ?token=<inviteToken>; the vendor
 * user calls this endpoint with that token + a chosen password to activate
 * their account.
 */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    const password = String(body.password || '');
    if (!token || !password) {
      return NextResponse.json({ error: 'token and password are required' }, { status: 400, headers: CORS });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400, headers: CORS });
    }

    // Find the VendorUser by invite token
    const rows = await db.$queryRawUnsafe(
      `SELECT id, email, name, "invitedAt", status FROM "VendorUser" WHERE "inviteToken" = $1 LIMIT 1`,
      token,
    ).catch(() => []) as any[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired invite token' }, { status: 404, headers: CORS });
    }
    const vu = rows[0];

    // Expire invites after 7 days
    if (vu.invitedAt) {
      const ageMs = Date.now() - new Date(vu.invitedAt).getTime();
      if (ageMs > 7 * 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: 'Invite token has expired. Please ask HR to re-invite you.' }, { status: 403, headers: CORS });
      }
    }

    const hashed = await hashPassword(password);
    await db.$executeRawUnsafe(
      `UPDATE "VendorUser" SET "passwordHash" = $1, "passwordSetAt" = NOW(), "status" = 'active', "inviteToken" = NULL, "updatedAt" = NOW() WHERE "id" = $2`,
      hashed, vu.id,
    );

    await db.auditLog.create({
      data: { userId: vu.id, action: 'VENDOR_ADMIN_ACTIVATED', module: 'vendor', details: `Vendor user ${vu.email} activated their account` },
    }).catch(() => null);

    return NextResponse.json({ message: 'Password set. You can now log in.', email: vu.email }, { headers: CORS });
  } catch (error) {
    console.error('Vendor set-password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
