import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** GET /api/vendor/requests — vendor admin/employee sees their vendor's requests */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!['vendor_admin','vendor_employee'].includes(auth.role))
      return NextResponse.json({ error: 'Forbidden — vendor access only' }, { status: 403, headers: CORS });

    // Find vendor user by email
    const vuRows = await db.$queryRawUnsafe(`SELECT * FROM "VendorUser" WHERE "email"=$1 LIMIT 1`, auth.email).catch(() => []) as any[];
    if (vuRows.length === 0) return NextResponse.json({ error: 'Vendor user not found' }, { status: 404, headers: CORS });
    const vu = vuRows[0];

    let sql = `SELECT r.*, vc."name" AS "vendorName" FROM "BgvRequest" r LEFT JOIN "VendorCompany" vc ON vc.id=r."vendorCompanyId" WHERE r."vendorCompanyId"=$1`;
    const params: any[] = [vu.vendorCompanyId];
    if (auth.role === 'vendor_employee') {
      sql += ` AND r."assignedVendorUserId"=$2`;
      params.push(vu.id);
    }
    sql += ` ORDER BY r."createdAt" DESC`;

    const requests = await db.$queryRawUnsafe(sql, ...params).catch(() => []) as any[];

    // Fetch checks for each request
    for (const req of requests) {
      req.checks = await db.$queryRawUnsafe(`SELECT * FROM "BgvCheck" WHERE "bgvRequestId"=$1`, req.id).catch(() => []) as any[];
      req.sharedDocuments = await db.$queryRawUnsafe(`SELECT * FROM "BgvDocumentShare" WHERE "bgvRequestId"=$1`, req.id).catch(() => []) as any[];
      req.reports = await db.$queryRawUnsafe(`SELECT * FROM "BgvReport" WHERE "bgvRequestId"=$1 ORDER BY version DESC`, req.id).catch(() => []) as any[];
    }

    return NextResponse.json({ requests, vendorUserId: vu.id, vendorCompanyId: vu.vendorCompanyId, role: vu.role }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
