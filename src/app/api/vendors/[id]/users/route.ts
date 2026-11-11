/**
 * GET /api/vendors/[id]/users — list a vendor company's users (staff).
 *
 * Used by:
 *  - HR (to inspect vendor staffing before/while initiating BGV)
 *  - vendor_admin (to pick an employee when assigning a BGV request —
 *    replaces the old window.prompt flow that required typing raw IDs)
 *
 * Auth: HR/admin roles OR vendor_admin belonging to this vendor company.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const { id: vendorCompanyId } = await params;
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    if (!HR_ROLES.includes(String(auth.role || ''))) {
      // Vendor path: must be a vendor_admin of THIS company
      if (auth.role !== 'vendor_admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
      }
      const own = await db.$queryRawUnsafe(
        `SELECT "vendorCompanyId" FROM "VendorUser" WHERE "email" = $1 LIMIT 1`,
        auth.email,
      ).catch(() => []) as any[];
      if (!own[0] || own[0].vendorCompanyId !== vendorCompanyId) {
        return NextResponse.json({ error: 'Forbidden — different vendor company' }, { status: 403, headers: CORS });
      }
    }

    const users = await db.$queryRawUnsafe(
      `SELECT u."id", u."name", u."email", u."role", u."status", u."createdAt",
              u."passwordSetAt" IS NOT NULL AS "activated"
       FROM "VendorUser" u
       WHERE u."vendorCompanyId" = $1
       ORDER BY u."role" ASC, u."name" ASC`,
      vendorCompanyId,
    ).catch(() => []) as any[];

    return NextResponse.json({ users }, { headers: CORS });
  } catch (error) {
    console.error('[vendors/users] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
