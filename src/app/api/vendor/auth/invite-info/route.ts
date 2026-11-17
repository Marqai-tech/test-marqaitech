import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { sha256, INVITE_TTL_DAYS } from '@/lib/bgv';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * GET /api/vendor/auth/invite-info?token=...
 *
 * Powers the activation screen (mock 03): shows the intended company, role
 * and read-only work email so the invited person can confirm the invite is
 * genuine BEFORE choosing a password. Never returns the raw token and never
 * confirms account existence beyond the invite states below.
 */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = new URL(req.url).searchParams.get('token') || '';
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400, headers: CORS });

    const hash = sha256(token);
    const rows = await db.$queryRawUnsafe(
      `SELECT vu."id", vu."email", vu."name", vu."role", vu."status", vu."inviteStatus",
              vu."inviteExpiresAt", vu."passwordSetAt", vc."name" AS "companyName"
         FROM "VendorUser" vu
         LEFT JOIN "VendorCompany" vc ON vc."id" = vu."vendorCompanyId"
        WHERE vu."inviteTokenHash" = $1
           OR (vu."inviteStatus" IS NULL AND vu."inviteToken" = $1)
        LIMIT 1`,
      hash,
    ).catch(() => []) as any[];

    if (rows.length === 0) {
      return NextResponse.json(
        { valid: false, code: 'INVALID_TOKEN', error: 'This invitation link is invalid or was already used. Ask your admin or HR for a new invitation.' },
        { headers: CORS },
      );
    }
    const vu = rows[0];

    if (vu.inviteStatus === 'used' || (vu.status === 'active' && vu.passwordSetAt)) {
      return NextResponse.json({ valid: false, code: 'USED_TOKEN', error: 'This invitation was already used. Please sign in.' }, { headers: CORS });
    }
    if (vu.inviteStatus === 'revoked') {
      return NextResponse.json({ valid: false, code: 'REVOKED_TOKEN', error: 'This invitation was revoked. Please request a new one.' }, { headers: CORS });
    }
    if (vu.status === 'inactive') {
      return NextResponse.json({ valid: false, code: 'ACCOUNT_DISABLED', error: 'This account has been disabled and cannot be activated.' }, { headers: CORS });
    }
    if (vu.inviteExpiresAt && new Date(vu.inviteExpiresAt).getTime() < Date.now()) {
      return NextResponse.json({ valid: false, code: 'EXPIRED_TOKEN', error: `This invitation expired (links are valid ${INVITE_TTL_DAYS} days). Please request a new one.` }, { headers: CORS });
    }

    return NextResponse.json({
      valid: true,
      email: vu.email,
      name: vu.name,
      role: vu.role,
      companyName: vu.companyName || 'Your vendor company',
      expiresAt: vu.inviteExpiresAt,
    }, { headers: CORS });
  } catch (error) {
    console.error('Invite info error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
