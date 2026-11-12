import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { sha256 } from '@/lib/bgv';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * GET /api/vendor/auth/reset-info?token=...
 *
 * Powers the reset screen: shows a masked work email so the user can confirm
 * the link is genuine BEFORE typing a new password. Never returns the raw
 * token and never confirms account existence beyond the token states.
 */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = new URL(req.url).searchParams.get('token') || '';
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400, headers: CORS });

    const hash = sha256(token);
    const rows = await db.$queryRawUnsafe(
      `SELECT vu."email", vu."status", vu."passwordResetExpiresAt", vc."name" AS "companyName"
         FROM "VendorUser" vu
         LEFT JOIN "VendorCompany" vc ON vc."id" = vu."vendorCompanyId"
        WHERE vu."passwordResetHash" = $1
        LIMIT 1`,
      hash,
    ).catch(() => []) as any[];

    if (rows.length === 0) {
      return NextResponse.json(
        { valid: false, code: 'INVALID_TOKEN', error: 'This password reset link is invalid or was already used. Request a new one from the login screen.' },
        { headers: CORS },
      );
    }
    const vu = rows[0];
    const expired = !vu.passwordResetExpiresAt || new Date(vu.passwordResetExpiresAt).getTime() < Date.now();
    if (expired) {
      return NextResponse.json(
        { valid: false, code: 'EXPIRED_TOKEN', error: 'This password reset link has expired. Reset links stay valid for 60 minutes — please request a new one.' },
        { headers: CORS },
      );
    }
    if (vu.status === 'pending') {
      return NextResponse.json(
        { valid: false, code: 'PENDING_INVITE', error: 'This account has not been activated yet. Use the invitation link emailed to you to set your first password.' },
        { headers: CORS },
      );
    }
    if (vu.status !== 'active') {
      return NextResponse.json(
        { valid: false, code: 'ACCOUNT_DISABLED', error: 'This account is disabled. Contact your vendor admin or HR administrator.' },
        { headers: CORS },
      );
    }

    const email: string = vu.email || '';
    const at = email.indexOf('@');
    const masked = at > 1 ? `${email[0]}${'*'.repeat(Math.max(1, at - 2))}${email.slice(at - 1)}` : email;

    return NextResponse.json({
      valid: true,
      emailMasked: masked,
      companyName: vu.companyName || null,
      expiresAt: vu.passwordResetExpiresAt,
    }, { headers: CORS });
  } catch (error) {
    console.error('Vendor reset-info error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
