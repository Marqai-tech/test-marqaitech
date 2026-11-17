import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyPassword, createToken, authTokenCookieHeader } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

/**
 * POST /api/vendor/auth/login
 *   body: { email, password }
 *
 * Authenticates a VendorUser (vendor_admin or vendor_employee) and issues a
 * JWT carrying { userId, role, email, vendorCompanyId, tenantId }. The same
 * getAuthInfo() resolver reads role+email from the token, so all vendor
 * routes (which already call getAuthInfo + check role) work unchanged.
 */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) {
      return NextResponse.json({ error: 'email and password are required' }, { status: 400, headers: CORS });
    }

    // Look up the VendorUser row
    const rows = await db.$queryRawUnsafe(
      `SELECT id, "vendorCompanyId", email, name, role, status, "passwordHash"
       FROM "VendorUser" WHERE email = $1 LIMIT 1`,
      email,
    ).catch(() => []) as any[];

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401, headers: CORS });
    }
    const vu = rows[0];

    if (vu.status === 'pending') {
      return NextResponse.json(
        { error: 'Your account is pending. Please set your password using the invite link emailed to you.', code: 'PENDING_INVITE' },
        { status: 403, headers: CORS },
      );
    }
    if (vu.status !== 'active') {
      return NextResponse.json({ error: `Account is ${vu.status}. Contact your HR administrator.` }, { status: 403, headers: CORS });
    }
    if (!vu.passwordHash) {
      return NextResponse.json(
        { error: 'Password not set. Please use the invite link emailed to you.', code: 'PENDING_INVITE' },
        { status: 403, headers: CORS },
      );
    }

    const ok = await verifyPassword(password, vu.passwordHash).catch(() => false);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401, headers: CORS });
    }

    // Resolve the tenantId the HR who invited this vendor belonged to.
    // VendorCompany.createdById → User.tenantId. Fall back to the
    // TEST_TENANT_SLUG path if that lookup fails (beta is a test host).
    let tenantId: string | null = null;
    try {
      const vc = await db.$queryRawUnsafe(
        `SELECT vc.id AS "vendorCompanyId", u."tenantId" AS "tenantId"
         FROM "VendorCompany" vc
         LEFT JOIN "User" u ON u.id = vc."createdById"
         WHERE vc.id = $1 LIMIT 1`,
        vu.vendorCompanyId,
      ).catch(() => []) as any[];
      tenantId = vc[0]?.tenantId || null;
    } catch {}

    const token = await createToken({
      userId: vu.id,
      role: vu.role,            // vendor_admin | vendor_employee
      email: vu.email,
      vendorCompanyId: vu.vendorCompanyId,
      tenantId,
      kind: 'vendor',
    });

    await db.$executeRawUnsafe(
      `UPDATE "VendorUser" SET "updatedAt" = NOW() WHERE "id" = $1`,
      vu.id,
    ).catch(() => 0);

    // Audit the vendor login
    await db.auditLog.create({
      data: {
        userId: vu.id,
        action: 'VENDOR_LOGIN',
        module: 'vendor',
        details: `Vendor ${vu.role} ${vu.email} logged in`,
      },
    }).catch(() => null);

    const resBody = {
      message: 'Vendor login successful',
      user: {
        id: vu.id,
        name: vu.name,
        email: vu.email,
        role: vu.role,
        vendorCompanyId: vu.vendorCompanyId,
        tenantId,
      },
      token,
    };
    const res = NextResponse.json(resBody, { headers: CORS });
    // Also set the same tb_token cookie the rest of the app reads, so
    // server-side route handlers that check the cookie also work.
    res.headers.set('Set-Cookie', authTokenCookieHeader(token, 60 * 60 * 24 * 7));
    return res;
  } catch (error) {
    console.error('Vendor login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
