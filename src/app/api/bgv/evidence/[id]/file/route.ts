import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { HR_ROLES } from '@/lib/bgv';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

interface SnapEvidenceIndex {
  [evidenceId: string]: { version: number; reportId: string };
}

/**
 * GET /api/bgv/evidence/[id]/file — streams an evidence file with STRICT
 * authorization (brief fix #7 + draft-privacy rule):
 *
 *  - Vendor assigned employee: evidence on their own case.
 *  - Vendor admin: evidence within their own company's cases.
 *  - HR: ONLY evidence included in at least one SUBMITTED report snapshot.
 *        Draft evidence is invisible to HR — via API and via file URL alike.
 *  - Candidate / anyone else: 403. No permanent public URLs exist.
 *
 * The snapshot index is built by scanning every submitted BgvReport snapshot
 * JSON for the evidence ids, so evidence uploaded during an ongoing rework
 * (not yet part of a version) stays private.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const { id: evidenceId } = await params;
    const rows = await db.$queryRawUnsafe(
      `SELECT "id","bgvCheckId","bgvRequestId","fileName","mimeType","fileSize","fileData"
         FROM "BgvEvidence" WHERE "id"=$1 LIMIT 1`,
      evidenceId,
    ).catch(() => []) as any[];
    if (!rows.length) return NextResponse.json({ error: 'Evidence not found' }, { status: 404, headers: CORS });
    const ev = rows[0];

    const isHR = HR_ROLES.includes(String(auth.role || ''));

    if (isHR) {
      // HR access requires the evidence id to appear in a submitted snapshot.
      const reports = await db.$queryRawUnsafe(
        `SELECT "id","version","snapshot" FROM "BgvReport" WHERE "bgvRequestId"=$1 AND "status"='submitted' ORDER BY "version" ASC`,
        ev.bgvRequestId,
      ).catch(() => []) as any[];
      let allowed = false;
      for (const r of reports) {
        if (!r.snapshot) continue;
        try {
          const snap = JSON.parse(r.snapshot);
          const checks: any[] = Array.isArray(snap?.checks) ? snap.checks : [];
          const inSnap = checks.some((c: any) => Array.isArray(c?.evidenceIds) && c.evidenceIds.includes(evidenceId));
          if (inSnap) { allowed = true; break; }
        } catch { /* skip malformed snapshot */ }
      }
      if (!allowed) {
        return NextResponse.json(
          { error: 'Evidence becomes available to HR only after the vendor submits the report version containing it.' },
          { status: 403, headers: CORS },
        );
      }
    } else if (auth.role === 'vendor_employee' || auth.role === 'vendor_admin') {
      const vuRows = await db.$queryRawUnsafe(
        `SELECT "id","vendorCompanyId" FROM "VendorUser" WHERE "email"=$1 AND "status"='active' LIMIT 1`,
        auth.email,
      ).catch(() => []) as any[];
      if (!vuRows.length) return NextResponse.json({ error: 'Vendor user not found' }, { status: 403, headers: CORS });
      const vu = vuRows[0];
      const reqRows = await db.$queryRawUnsafe(
        `SELECT "id","assignedVendorUserId" FROM "BgvRequest" WHERE "id"=$1 AND "vendorCompanyId"=$2 LIMIT 1`,
        ev.bgvRequestId, vu.vendorCompanyId,
      ).catch(() => []) as any[];
      if (!reqRows.length) {
        return NextResponse.json({ error: 'This evidence belongs to a case outside your vendor company.' }, { status: 403, headers: CORS });
      }
      if (auth.role === 'vendor_employee' && reqRows[0].assignedVendorUserId !== vu.id) {
        return NextResponse.json({ error: 'This case is not assigned to you.' }, { status: 403, headers: CORS });
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
    }

    const raw = String(ev.fileData || '');
    if (!raw) return NextResponse.json({ error: 'Evidence payload missing' }, { status: 404, headers: CORS });
    const base64 = raw.replace(/^data:[^;,]*;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) return NextResponse.json({ error: 'Evidence payload is empty or corrupted' }, { status: 422, headers: CORS });

    const asDownload = new URL(req.url).searchParams.get('download') === '1';
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': ev.mimeType || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `${asDownload ? 'attachment' : 'inline'}; filename="${ev.fileName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Evidence file error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
