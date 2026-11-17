import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { HR_ROLES, generateStandardReportPdf, type ReportSnapshot } from '@/lib/bgv';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * GET /api/bgv/requests/[id]/report-pdf
 *      ?version=N          → download the immutable SUBMITTED standard PDF
 *      ?draft=1            → generate a clearly-marked DRAFT preview from the
 *                            vendor's current form state (vendor roles only)
 *
 * Authorization:
 *  - Submitted versions: assigned employee, same-company vendor admin, HR.
 *  - DRAFT preview: ONLY the assigned employee or same-company vendor admin —
 *    HR must never be able to render a vendor's unpublished draft (brief).
 *  - Different tenant/vendor/candidate access is denied everywhere.
 *
 * When the stored snapshot PDF failed at submission (pdfStatus='failed'),
 * this route regenerates from the immutable snapshot (retry) instead of
 * pretending a broken file is ready.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const { id: requestId } = await params;
    const url = new URL(req.url);
    const wantDraft = url.searchParams.get('draft') === '1';
    const version = url.searchParams.get('version');

    const reqRows = await db.$queryRawUnsafe(
      `SELECT * FROM "BgvRequest" WHERE "id"=$1 LIMIT 1`, requestId,
    ).catch(() => []) as any[];
    if (!reqRows.length) return NextResponse.json({ error: 'Case not found' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];

    const isHR = HR_ROLES.includes(String(auth.role || ''));
    let vendorView: 'assigned' | 'same_vendor_admin' | 'none' = 'none';

    if (!isHR && ['vendor_employee', 'vendor_admin'].includes(String(auth.role))) {
      const vuRows = await db.$queryRawUnsafe(
        `SELECT "id","vendorCompanyId" FROM "VendorUser" WHERE "email"=$1 AND "status"='active' LIMIT 1`,
        auth.email,
      ).catch(() => []) as any[];
      if (!vuRows.length) return NextResponse.json({ error: 'Vendor user not found' }, { status: 403, headers: CORS });
      const vu = vuRows[0];
      if (bgvReq.vendorCompanyId !== vu.vendorCompanyId) {
        return NextResponse.json({ error: 'This case belongs to a different vendor company.' }, { status: 403, headers: CORS });
      }
      vendorView = (auth.role === 'vendor_employee' && bgvReq.assignedVendorUserId === vu.id)
        ? 'assigned' : 'same_vendor_admin';
    } else if (!isHR) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
    }

    if (wantDraft) {
      // ── DRAFT preview (vendor-only).
      if (isHR) {
        return NextResponse.json(
          { error: 'Draft reports are private to the vendor until submission.' },
          { status: 403, headers: CORS },
        );
      }
      if (vendorView === 'none') {
        return NextResponse.json({ error: 'This case is not assigned to you.' }, { status: 403, headers: CORS });
      }
      const checks = await db.$queryRawUnsafe(
        `SELECT * FROM "BgvCheck" WHERE "bgvRequestId"=$1 ORDER BY "createdAt" ASC`, requestId,
      ).catch(() => []) as any[];
      const evidenceRows = await db.$queryRawUnsafe(
        `SELECT "id","bgvCheckId","fileName" FROM "BgvEvidence" WHERE "bgvRequestId"=$1`, requestId,
      ).catch(() => []) as any[];
      const sharedDocs = await db.$queryRawUnsafe(
        `SELECT "id","documentType","documentLabel" FROM "BgvDocumentShare" WHERE "bgvRequestId"=$1`, requestId,
      ).catch(() => []) as any[];
      const vendorRow = await db.$queryRawUnsafe(
        `SELECT "name" FROM "VendorCompany" WHERE "id"=$1 LIMIT 1`, bgvReq.vendorCompanyId,
      ).catch(() => []) as any[];

      const investigator = vendorView === 'assigned'
        ? { name: String(auth.email || '').split('@')[0], email: auth.email }
        : null;
      // Resolve investigator identity from DB when admin previews.
      const invRows = bgvReq.assignedVendorUserId
        ? await db.$queryRawUnsafe(`SELECT "name","email" FROM "VendorUser" WHERE "id"=$1 LIMIT 1`, bgvReq.assignedVendorUserId).catch(() => []) as any[]
        : [];

      const snap: ReportSnapshot = {
        caseId: requestId,
        caseNumber: bgvReq.caseNumber || null,
        candidateName: bgvReq.candidateName || bgvReq.candidateEmail,
        candidateEmail: bgvReq.candidateEmail,
        vendorCompanyId: bgvReq.vendorCompanyId,
        vendorName: vendorRow[0]?.name || '',
        investigatorId: String(bgvReq.assignedVendorUserId || ''),
        investigatorName: invRows[0]?.name || investigator?.name || '',
        investigatorEmail: invRows[0]?.email || auth.email,
        submittedAt: new Date().toISOString(),
        version: 0, // 0 = draft
        overallFindings: 'DRAFT — findings not yet submitted.',
        overallResult: null,
        checks: checks.map((c: any) => ({
          checkId: c.id,
          checkType: c.checkType,
          checkLabel: c.checkLabel || c.checkType,
          status: c.status,
          result: c.result || null,
          findings: c.findings || null,
          verificationDate: c.verificationDate ? new Date(c.verificationDate).toISOString() : null,
          completedAt: c.completedAt ? new Date(c.completedAt).toISOString() : null,
          evidenceIds: evidenceRows.filter((e: any) => e.bgvCheckId === c.id).map((e: any) => e.id),
          evidenceFiles: evidenceRows.filter((e: any) => e.bgvCheckId === c.id).map((e: any) => ({ id: e.id, fileName: e.fileName })),
        })),
        sharedDocuments: sharedDocs.map((d: any) => ({ id: d.id, documentType: d.documentType, documentLabel: d.documentLabel })),
        instructions: bgvReq.instructions || null,
        dueDate: bgvReq.dueDate ? new Date(bgvReq.dueDate).toISOString() : null,
      };

      const buf = await generateStandardReportPdf(snap, { draft: true });
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="BGV-DRAFT-${snap.caseNumber || requestId}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // ── Submitted version download (or optional vendor-company PDF via ?vendor=1).
    const wantVendorPdf = url.searchParams.get('vendor') === '1';
    const verNum = version ? Number(version) : null;
    const reportRows = await db.$queryRawUnsafe(
      `SELECT "id","version","snapshot","standardPdfData","standardPdfName","pdfStatus","pdfError","submittedAt","summary","overallResult",
              "vendorPdfData","vendorPdfName"
         FROM "BgvReport" WHERE "bgvRequestId"=$1 ${verNum ? `AND "version"=$2` : ''} ORDER BY "version" DESC LIMIT 1`,
      ...(verNum ? [requestId, verNum] : [requestId]),
    ).catch(() => []) as any[];
    if (!reportRows.length) {
      return NextResponse.json({ error: 'No submitted report exists for this case yet.' }, { status: 404, headers: CORS });
    }
    const rpt = reportRows[0];

    // Vendor-company optional PDF — clearly separate from the standard report.
    if (wantVendorPdf) {
      if (!rpt.vendorPdfData) {
        return NextResponse.json({ error: 'No vendor company PDF was attached to this report version.' }, { status: 404, headers: CORS });
      }
      const buf = Buffer.from(rpt.vendorPdfData, 'base64');
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${rpt.vendorPdfName || `Vendor-Report-v${rpt.version}.pdf`}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // Immutable bytes first — if the snapshot PDF is stored, serve it as-is.
    if (rpt.standardPdfData) {
      const buf = Buffer.from(rpt.standardPdfData, 'base64');
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${rpt.standardPdfName || `Marqaitech-Standard-BGV-Report-v${rpt.version}.pdf`}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // Retry path: regenerate from the immutable snapshot; never fake success.
    if (!rpt.snapshot) {
      return NextResponse.json({ error: 'The submitted report has no stored snapshot — cannot generate the PDF.' }, { status: 409, headers: CORS });
    }
    let snap: ReportSnapshot;
    try { snap = JSON.parse(rpt.snapshot); } catch {
      return NextResponse.json({ error: 'Stored snapshot is corrupted.' }, { status: 409, headers: CORS });
    }
    try {
      const buf = await generateStandardReportPdf(snap, { draft: false });
      await db.$executeRawUnsafe(
        `UPDATE "BgvReport" SET "standardPdfName"=$1,"standardPdfMime"='application/pdf',"standardPdfData"=$2,"pdfStatus"='ready',"pdfError"=NULL WHERE "id"=$3`,
        `Marqaitech-Standard-BGV-Report-v${rpt.version}.pdf`, buf.toString('base64'), rpt.id,
      );
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Marqaitech-Standard-BGV-Report-v${rpt.version}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (e: any) {
      await db.$executeRawUnsafe(
        `UPDATE "BgvReport" SET "pdfStatus"='failed',"pdfError"=$1 WHERE "id"=$2`,
        String(e?.message || e).slice(0, 500), rpt.id,
      ).catch(() => 0);
      return NextResponse.json(
        { error: `PDF generation failed and was recorded: ${String(e?.message || e).slice(0, 200)}. Retry later.` },
        { status: 500, headers: CORS },
      );
    }
  } catch (error) {
    console.error('Report PDF error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
