import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** GET /api/bgv/requests — HR views all BGV requests */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const isAdmin = ['super_admin','tenant_admin','ceo','admin','hr_admin','company_hr_admin'].includes(auth.role);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const requests = await db.$queryRawUnsafe(
      `SELECT r.*, vc."name" AS "vendorName" FROM "BgvRequest" r LEFT JOIN "VendorCompany" vc ON vc.id=r."vendorCompanyId" ORDER BY r."createdAt" DESC`,
    ).catch(() => []) as any[];

    for (const req of requests) {
      req.checks = await db.$queryRawUnsafe(`SELECT * FROM "BgvCheck" WHERE "bgvRequestId"=$1`, req.id).catch(() => []) as any[];
      req.reports = await db.$queryRawUnsafe(`SELECT * FROM "BgvReport" WHERE "bgvRequestId"=$1 ORDER BY version DESC`, req.id).catch(() => []) as any[];
    }

    return NextResponse.json({ requests }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
