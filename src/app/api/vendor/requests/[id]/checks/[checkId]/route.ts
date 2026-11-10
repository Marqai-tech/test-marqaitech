import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'PATCH, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** PATCH /api/vendor/requests/[id]/checks/[checkId] — update check findings */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!['vendor_admin','vendor_employee'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const { id: requestId, checkId } = await params;
    const body = await req.json();
    const { status, result, findings, evidenceUrl } = body || {};

    // Verify vendor user is assigned to this request
    const vuRows = await db.$queryRawUnsafe(`SELECT * FROM "VendorUser" WHERE "email"=$1 LIMIT 1`, auth.email).catch(() => []) as any[];
    if (vuRows.length === 0) return NextResponse.json({ error: 'Vendor user not found' }, { status: 404, headers: CORS });
    const vu = vuRows[0];

    const reqRows = await db.$queryRawUnsafe(`SELECT * FROM "BgvRequest" WHERE "id"=$1 AND "assignedVendorUserId"=$2 LIMIT 1`, requestId, vu.id).catch(() => []) as any[];
    if (reqRows.length === 0 && auth.role === 'vendor_employee')
      return NextResponse.json({ error: 'Not assigned to you' }, { status: 403, headers: CORS });

    // Update check
    const updates: string[] = [];
    const vals: any[] = [];
    let pIdx = 1;
    if (status) { updates.push(`"status"=$${pIdx++}`); vals.push(status); }
    if (result) { updates.push(`"result"=$${pIdx++}`); vals.push(result); }
    if (findings !== undefined) { updates.push(`"findings"=$${pIdx++}`); vals.push(findings); }
    if (evidenceUrl) { updates.push(`"evidenceUrl"=$${pIdx++}`); vals.push(evidenceUrl); }
    if (status === 'completed') { updates.push(`"completedAt"=NOW()`); }
    updates.push(`"updatedAt"=NOW()`);
    vals.push(checkId);

    await db.$executeRawUnsafe(`UPDATE "BgvCheck" SET ${updates.join(',')} WHERE "id"=$${pIdx}`, ...vals).catch(() => 0);

    // If status is in_progress, update request status too
    if (status === 'in_progress') {
      await db.$executeRawUnsafe(`UPDATE "BgvRequest" SET "status"='in_progress',"updatedAt"=NOW() WHERE "id"=$1`, requestId).catch(() => 0);
    }

    await db.auditLog.create({ data: { userId: vu.id, action: 'BGV_CHECK_UPDATED', module: 'bgv', details: `Check ${checkId} updated: status=${status||'n/a'}, result=${result||'n/a'}` } }).catch(() => null);

    return NextResponse.json({ message: 'Check updated', checkId, status, result }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
