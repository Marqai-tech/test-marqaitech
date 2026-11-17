import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { hashPassword } from '@/lib/auth';
import { sha256 } from '@/lib/bgv';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/vendor/auth/reset-password
 *   body: { token, password }
 *
 * Vendor password recovery step 2 — single-use, atomic, hash-verified:
 *  - Looks the reset up by SHA-256(token); plaintext never stored.
 *  - One conditional UPDATE (hash matches AND not expired AND account
 *    active) consumes the token atomically — replay updates zero rows.
 *  - Deliberately disabled accounts can never reset through this endpoint.
 *  - New hash invalidates nothing else; old sessions remain until they
 *    naturally expire (vendor tokens are short-lived JWTs).
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
    // Same policy as activation (mock 03): min 8 chars, letters + numbers.
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters and include letters and numbers.' },
        { status: 400, headers: CORS },
      );
    }

    const hash = sha256(token);
    const hashed = await hashPassword(password);

    // Atomic single-use consumption with RETURNING id — rowCount tells us
    // whether the token was valid, unexpired and the account still active.
    const consumed = await db.$executeRawUnsafe(
      `UPDATE "VendorUser"
          SET "passwordHash" = $1,
              "passwordSetAt" = NOW(),
              "passwordResetHash" = NULL,
              "passwordResetExpiresAt" = NULL,
              "updatedAt" = NOW()
        WHERE "passwordResetHash" = $2
          AND "passwordResetExpiresAt" > NOW()
          AND "status" = 'active'
        RETURNING "id", "email"`,
      hashed, hash,
    ).catch(() => []);

    const consumedRows = (consumed as any[]) || [];
    if (!Array.isArray(consumedRows) || consumedRows.length === 0) {
      // Distinguish expiry from invalid/desynced state for a helpful screen.
      const still = await db.$queryRawUnsafe(
        `SELECT "status", "passwordResetExpiresAt" FROM "VendorUser" WHERE "passwordResetHash" = $1 LIMIT 1`,
        hash,
      ).catch(() => []) as any[];
      if (still.length === 0) {
        return NextResponse.json(
          { error: 'This password reset link is invalid or was already used. Please request a new one.', code: 'INVALID_TOKEN' },
          { status: 404, headers: CORS },
        );
      }
      if (still[0].status !== 'active') {
        return NextResponse.json(
          { error: 'This account is disabled. Password recovery is not available — contact your vendor admin or HR administrator.', code: 'ACCOUNT_DISABLED' },
          { status: 403, headers: CORS },
        );
      }
      return NextResponse.json(
        { error: 'This password reset link has expired. Please request a new one from the login screen.', code: 'EXPIRED_TOKEN' },
        { status: 410, headers: CORS },
      );
    }

    const vu = consumedRows[0];
    await db.auditLog.create({
      data: {
        userId: vu.id,
        action: 'VENDOR_PASSWORD_RESET_COMPLETED',
        module: 'vendor',
        details: `Vendor user ${vu.email} set a new password via a single-use recovery link`,
      },
    }).catch(() => null);

    return NextResponse.json({ ok: true, message: 'Password updated. You can now sign in with your new password.', email: vu.email }, { headers: CORS });
  } catch (error) {
    console.error('Vendor reset-password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
