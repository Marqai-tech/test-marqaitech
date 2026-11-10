import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/** POST /api/vendor/requests/[id]/submit-report — vendor employee submits final report */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!['vendor_admin','vendor_employee'].includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const { id: requestId } = await params;
    const body = await req.json();
    const { summary, overallResult } = body || {};

    // Verify vendor user
    const vuRows = await db.$queryRawUnsafe(`SELECT * FROM "VendorUser" WHERE "email"=$1 LIMIT 1`, auth.email).catch(() => []) as any[];
    if (vuRows.length === 0) return NextResponse.json({ error: 'Vendor user not found' }, { status: 404, headers: CORS });
    const vu = vuRows[0];

    // Verify request is assigned to this vendor user (or admin of same vendor)
    const reqRows = await db.$queryRawUnsafe(`SELECT * FROM "BgvRequest" WHERE "id"=$1 LIMIT 1`, requestId).catch(() => []) as any[];
    if (reqRows.length === 0) return NextResponse.json({ error: 'Request not found' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];
    if (auth.role === 'vendor_employee' && bgvReq.assignedVendorUserId !== vu.id)
      return NextResponse.json({ error: 'Not assigned to you' }, { status: 403, headers: CORS });

    // Get next version number
    const versionRows = await db.$queryRawUnsafe(`SELECT COALESCE(MAX(version),0)+1 AS "nextVer" FROM "BgvReport" WHERE "bgvRequestId"=$1`, requestId).catch(() => [{ nextVer: 1 }]) as any[];
    const nextVersion = versionRows[0]?.nextVer || 1;

    const reportId = `rpt-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "BgvReport" ("id","bgvRequestId","version","submittedById","submittedAt","summary","overallResult","status","createdAt") VALUES ($1,$2,$3,$4,NOW(),$5,$6,'submitted',NOW())`,
      reportId, requestId, nextVersion, vu.id, summary||null, overallResult||null,
    );

    // Update request status
    await db.$executeRawUnsafe(`UPDATE "BgvRequest" SET "status"='submitted_for_hr_review',"updatedAt"=NOW() WHERE "id"=$1`, requestId);

    // Notify HR
    try {
      const { sendEmail } = await import('@/lib/email');
      await sendEmail({ to: 'hr@marqaitech.com', subject: 'BGV Report Submitted for Review', html: `<p>A BGV report has been submitted for ${bgvReq.candidateName}. Please review it in the HRMS.</p>` }).catch(() => null);
    } catch {}

    await db.auditLog.create({ data: { userId: vu.id, action: 'BGV_REPORT_SUBMITTED', module: 'bgv', details: `Report v${nextVersion} submitted for request ${requestId}` } }).catch(() => null);

    return NextResponse.json({ message: 'Report submitted for HR review.', reportId, version: nextVersion, status: 'submitted_for_hr_review' }, { status: 201, headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
