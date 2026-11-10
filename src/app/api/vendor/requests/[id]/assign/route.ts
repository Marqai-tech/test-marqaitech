import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** POST /api/vendor/requests/[id]/assign — vendor admin assigns request to employee */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (auth.role !== 'vendor_admin') return NextResponse.json({ error: 'Forbidden — vendor admin only' }, { status: 403, headers: CORS });

    const { id: requestId } = await params;
    const body = await req.json();
    const { vendorUserId, reason } = body || {};
    if (!vendorUserId) return NextResponse.json({ error: 'vendorUserId required' }, { status: 400, headers: CORS });

    // Find vendor admin
    const adminRows = await db.$queryRawUnsafe(`SELECT * FROM "VendorUser" WHERE "email"=$1 LIMIT 1`, auth.email).catch(() => []) as any[];
    if (adminRows.length === 0) return NextResponse.json({ error: 'Vendor admin not found' }, { status: 404, headers: CORS });
    const admin = adminRows[0];

    // Verify employee belongs to same vendor
    const empRows = await db.$queryRawUnsafe(`SELECT * FROM "VendorUser" WHERE "id"=$1 AND "vendorCompanyId"=$2 AND "status"='active' LIMIT 1`, vendorUserId, admin.vendorCompanyId).catch(() => []) as any[];
    if (empRows.length === 0) return NextResponse.json({ error: 'Employee not found, inactive, or from different vendor' }, { status: 403, headers: CORS });

    // Check request belongs to this vendor
    const reqRows = await db.$queryRawUnsafe(`SELECT * FROM "BgvRequest" WHERE "id"=$1 AND "vendorCompanyId"=$2 LIMIT 1`, requestId, admin.vendorCompanyId).catch(() => []) as any[];
    if (reqRows.length === 0) return NextResponse.json({ error: 'Request not found or not in your vendor' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];

    // If reassignment, record the unassignment
    if (bgvReq.assignedVendorUserId) {
      await db.$executeRawUnsafe(
        `INSERT INTO "BgvAssignment" ("id","bgvRequestId","vendorUserId","assignedById","assignedAt","unassignedAt","unassignedById","reason") VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)`,
        `asg-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, requestId, bgvReq.assignedVendorUserId, bgvReq.assignedById, bgvReq.assignedAt, admin.id, reason||'Reassigned',
      ).catch(() => 0);
    }

    // Assign
    await db.$executeRawUnsafe(
      `UPDATE "BgvRequest" SET "assignedVendorUserId"=$1,"assignedById"=$2,"assignedAt"=NOW(),"status"='assigned',"updatedAt"=NOW() WHERE "id"=$3`,
      vendorUserId, admin.id, requestId,
    );

    // Notify assigned employee
    const emp = empRows[0];
    try {
      const { sendEmail } = await import('@/lib/email');
      await sendEmail({ to: emp.email, subject: 'BGV Request Assigned to You', html: `<p>A BGV request has been assigned to you. Please log in to your vendor workspace to begin verification.</p>` }).catch(() => null);
    } catch {}

    await db.auditLog.create({ data: { userId: admin.id, action: 'BGV_REQUEST_ASSIGNED', module: 'bgv', details: `Assigned request ${requestId} to ${emp.email}` } }).catch(() => null);

    return NextResponse.json({ message: 'Request assigned', requestId, assignedTo: emp.email, status: 'assigned' }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
