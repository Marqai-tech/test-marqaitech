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

/**
 * GET /api/bgv/shared-documents/[id]/file — streams a document that HR shared
 * for a BGV case, to authorized parties only (brief fix #7: no permanent
 * public URLs — every access is authorized per request):
 *
 *  - Vendor: must belong to the case's vendor company; the assigned employee
 *    and same-company admins both may view (they perform/report the checks).
 *  - HR roles: always allowed (case data is theirs).
 *  - Everyone else (incl. other vendors, candidates): 403.
 *
 * BgvDocumentShare.fileUrl may hold the legacy base64 data-URL copied from
 * OnboardingDocument; otherwise the bytes are resolved from OnboardingDocument
 * server-side (clients never pass file data).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const { id: shareId } = await params;
    const rows = await db.$queryRawUnsafe(
      `SELECT s."id", s."bgvRequestId", s."onboardingDocumentId", s."fileUrl", s."documentLabel",
              r."vendorCompanyId", r."assignedVendorUserId"
         FROM "BgvDocumentShare" s
         JOIN "BgvRequest" r ON r."id" = s."bgvRequestId"
        WHERE s."id"=$1 LIMIT 1`,
      shareId,
    ).catch(() => []) as any[];
    if (!rows.length) return NextResponse.json({ error: 'Shared document not found' }, { status: 404, headers: CORS });
    const share = rows[0];

    const isHR = HR_ROLES.includes(String(auth.role || ''));
    if (!isHR) {
      if (!['vendor_employee', 'vendor_admin'].includes(String(auth.role || ''))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
      }
      const vuRows = await db.$queryRawUnsafe(
        `SELECT "id","vendorCompanyId" FROM "VendorUser" WHERE "email"=$1 AND "status"='active' LIMIT 1`,
        auth.email,
      ).catch(() => []) as any[];
      if (!vuRows.length || vuRows[0].vendorCompanyId !== share.vendorCompanyId) {
        return NextResponse.json({ error: 'This document belongs to a case outside your vendor company.' }, { status: 403, headers: CORS });
      }
    }

    // Resolve bytes: share.fileUrl (base64 data URL) → OnboardingDocument.
    let raw = String(share.fileUrl || '');
    let fileName = String(share.documentLabel || 'shared-document');
    if (!raw && share.onboardingDocumentId) {
      const docRows = await db.$queryRawUnsafe(
        `SELECT "fileName","fileUrl","fileData" FROM "OnboardingDocument" WHERE "id"=$1 LIMIT 1`,
        share.onboardingDocumentId,
      ).catch(() => []) as any[];
      if (docRows.length) {
        raw = String(docRows[0].fileUrl || docRows[0].fileData || '');
        fileName = String(docRows[0].fileName || fileName);
      }
    }
    if (!raw) return NextResponse.json({ error: 'The underlying file is no longer available' }, { status: 404, headers: CORS });

    // data-URL or raw base64 → bytes.
    let mime = 'application/octet-stream';
    let base64 = raw;
    const m = /^data:([^;,]+)?(;charset=[^;,]+)?;base64,([\s\S]*)$/.exec(raw);
    if (m) { mime = m[1] || mime; base64 = m[3]; }
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) return NextResponse.json({ error: 'Stored file payload is empty' }, { status: 422, headers: CORS });

    const asDownload = new URL(req.url).searchParams.get('download') === '1';
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': mime,
        'Content-Length': String(buffer.length),
        'Content-Disposition': `${asDownload ? 'attachment' : 'inline'}; filename="${String(fileName).replace(/[\r\n"\\]/g, '')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Shared document file error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
