import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { ALLOWED_EVIDENCE_TYPES, EVIDENCE_MAX_BYTES, BGV_WORKABLE_STATUSES, BGV_TERMINAL_STATUSES } from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

function safeFileName(name: string): string {
  const cleaned = String(name || '')
    .replace(/[\r\n"\\/\x00-\x1f]/g, '_')
    .replace(/_{2,}/g, '_')
    .trim()
    .slice(0, 160);
  return cleaned || 'evidence';
}

/**
 * GET  /api/vendor/requests/[id]/checks/[checkId]/evidence — list evidence files
 * POST — upload one evidence file (JSON: { fileName, mimeType, dataBase64 })
 *
 * Access: the assigned vendor employee (own case) or a vendor admin of the
 * same company. Evidence is stored base64 in the tenant DB (BgvEvidence) and
 * downloaded through /api/bgv/evidence/[id]/file with role checks — never a
 * permanent public URL.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!['vendor_admin', 'vendor_employee'].includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
    }
    const vuRows = await db.$queryRawUnsafe(
      `SELECT * FROM "VendorUser" WHERE "email"=$1 AND "status"='active' LIMIT 1`, auth.email,
    ).catch(() => []) as any[];
    if (!vuRows.length) return NextResponse.json({ error: 'Vendor user not found' }, { status: 403, headers: CORS });
    const vu = vuRows[0];

    const { id: requestId, checkId } = await params;
    const reqRows = await db.$queryRawUnsafe(
      `SELECT "id" FROM "BgvRequest" WHERE "id"=$1 AND "vendorCompanyId"=$2 LIMIT 1`,
      requestId, vu.vendorCompanyId,
    ).catch(() => []) as any[];
    if (!reqRows.length) return NextResponse.json({ error: 'Case not found' }, { status: 404, headers: CORS });

    const evidence = await db.$queryRawUnsafe(
      `SELECT "id","fileName","mimeType","fileSize","uploadedAt" FROM "BgvEvidence"
        WHERE "bgvCheckId"=$1 AND "bgvRequestId"=$2 ORDER BY "uploadedAt" ASC`,
      checkId, requestId,
    ).catch(() => []) as any[];
    return NextResponse.json({ evidence }, { headers: CORS });
  } catch (error) {
    console.error('Evidence list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; checkId: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (auth.role !== 'vendor_employee') {
      return NextResponse.json({ error: 'Only the assigned investigator can upload evidence.' }, { status: 403, headers: CORS });
    }
    const vuRows = await db.$queryRawUnsafe(
      `SELECT * FROM "VendorUser" WHERE "email"=$1 AND "status"='active' LIMIT 1`, auth.email,
    ).catch(() => []) as any[];
    if (!vuRows.length) return NextResponse.json({ error: 'Vendor user not found' }, { status: 403, headers: CORS });
    const vu = vuRows[0];

    const { id: requestId, checkId } = await params;
    const body = await req.json().catch(() => ({}));
    const fileName = safeFileName(String(body?.fileName || ''));
    const mimeType = String(body?.mimeType || '').toLowerCase();
    const dataBase64 = String(body?.dataBase64 || '').replace(/^data:[^;,]*;base64,/, '');

    if (!ALLOWED_EVIDENCE_TYPES[mimeType]) {
      return NextResponse.json({ error: `Unsupported file type. Allowed: ${Object.values(ALLOWED_EVIDENCE_TYPES).join(', ').toUpperCase()}` }, { status: 415, headers: CORS });
    }
    if (!dataBase64) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400, headers: CORS });
    }
    const approxBytes = Math.floor(dataBase64.length * 0.75);
    if (approxBytes > EVIDENCE_MAX_BYTES) {
      return NextResponse.json({ error: `File too large — evidence files are limited to ${EVIDENCE_MAX_BYTES / (1024 * 1024)} MB` }, { status: 413, headers: CORS });
    }

    // Case + check binding + workable state + ownership.
    const reqRows = await db.$queryRawUnsafe(
      `SELECT "id","status","assignedVendorUserId","caseNumber" FROM "BgvRequest" WHERE "id"=$1 AND "vendorCompanyId"=$2 LIMIT 1`,
      requestId, vu.vendorCompanyId,
    ).catch(() => []) as any[];
    if (!reqRows.length) return NextResponse.json({ error: 'Case not found' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];
    if (bgvReq.assignedVendorUserId !== vu.id) {
      return NextResponse.json({ error: 'This case is not assigned to you.' }, { status: 403, headers: CORS });
    }
    if (!BGV_WORKABLE_STATUSES.includes(bgvReq.status) && !BGV_TERMINAL_STATUSES.includes(bgvReq.status)) {
      return NextResponse.json({ error: 'Case state does not allow evidence uploads right now.' }, { status: 409, headers: CORS });
    }
    const checkRows = await db.$queryRawUnsafe(
      `SELECT "id" FROM "BgvCheck" WHERE "id"=$1 AND "bgvRequestId"=$2 LIMIT 1`,
      checkId, requestId,
    ).catch(() => []) as any[];
    if (!checkRows.length) return NextResponse.json({ error: 'Check not found for this case' }, { status: 404, headers: CORS });

    const evId = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await db.$executeRawUnsafe(
      `INSERT INTO "BgvEvidence" ("id","bgvCheckId","bgvRequestId","fileName","mimeType","fileSize","fileData","uploadedById","uploadedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      evId, checkId, requestId, fileName, mimeType, approxBytes, dataBase64, vu.id,
    );

    await db.auditLog.create({
      data: { userId: vu.id, action: 'BGV_EVIDENCE_UPLOADED', module: 'bgv',
              details: `Evidence ${fileName} (${approxBytes} bytes) uploaded for check ${checkId} on ${bgvReq.caseNumber || requestId}` },
    }).catch(() => null);

    return NextResponse.json({
      message: 'Evidence uploaded.',
      evidence: { id: evId, fileName, mimeType, fileSize: approxBytes, uploadedAt: new Date().toISOString() },
    }, { status: 201, headers: CORS });
  } catch (error) {
    console.error('Evidence upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
