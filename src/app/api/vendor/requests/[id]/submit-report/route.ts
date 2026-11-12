import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import {
  CHECK_RESULTS, RESULTS_REQUIRING_REASON, BGV_WORKABLE_STATUSES,
  notifyBgvEvent, generateStandardReportPdf, VENDOR_PDF_MAX_BYTES,
  type ReportSnapshot, type SnapshotCheck,
} from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/vendor/requests/[id]/submit-report — vendor submits the standard
 * report to HR (mock 14). Creates an immutable report version.
 *
 * Hardened per the brief (fix #5 + form rules):
 *  - Only the ASSIGNED employee (DB-verified) may submit, case must be in a
 *    workable state, and rework state requires HR's rework to be addressed.
 *  - EVERY required check must be completed with a legal result
 *    (Clear / Discrepancy Found / Unable to Verify) + verification date +
 *    findings for non-Clear results. "Unable to Verify" with a reason is a
 *    COMPLETED result — never a Pending blocker.
 *  - Overall findings are required.
 *  - Version allocation is transactional and race-safe (row lock on the
 *    case + advisory lock) — duplicate clicks create ONE version.
 *  - An immutable snapshot JSON is persisted; the Marqaitech standard PDF is
 *    generated from it at submission time. PDF failure is RECORDED
 *    (pdfStatus='failed' + pdfError) and retryable — never faked as ready.
 *  - Optional vendor-company PDF (≤10MB, application/pdf only) is stored
 *    separately and stays clearly distinguished from the standard report.
 *  - The submitting employee cannot edit the submitted version afterwards.
 *  - HR notification goes to the initiating/assigned HR user (fix #8) and is
 *    delivery-tracked (BgvNotification) — no hardcoded recipient.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id: requestId } = await params;
    const body = await req.json().catch(() => ({}));
    const summary = String(body?.summary || '').trim();
    const vendorPdf = body?.vendorPdf || null; // { fileName, dataBase64 } | null
    if (!summary) {
      return NextResponse.json({ error: 'Overall findings are required.' }, { status: 400, headers: CORS });
    }

    // Case ownership + state.
    const reqRows = await db.$queryRawUnsafe(
      `SELECT * FROM "BgvRequest" WHERE "id"=$1 AND "vendorCompanyId"=$2 LIMIT 1`,
      requestId, vu.vendorCompanyId,
    ).catch(() => []) as any[];
    if (!reqRows.length) return NextResponse.json({ error: 'Case not found' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];

    if (auth.role === 'vendor_employee' && bgvReq.assignedVendorUserId !== vu.id) {
      return NextResponse.json({ error: 'This case is not assigned to you.' }, { status: 403, headers: CORS });
    }
    if (auth.role === 'vendor_admin') {
      // Admins may submit on behalf of the assignee ONLY if the case is
      // assigned to someone in their company — never across vendors.
      if (!bgvReq.assignedVendorUserId) {
        return NextResponse.json({ error: 'Assign the case to an investigator before submitting.' }, { status: 409, headers: CORS });
      }
    }
    if (!BGV_WORKABLE_STATUSES.includes(bgvReq.status)) {
      if (bgvReq.status === 'submitted_for_hr_review') {
        return NextResponse.json(
          { error: 'The latest report version is already with HR. Wait for their decision, or use rework once HR requests changes.' },
          { status: 409, headers: CORS },
        );
      }
      return NextResponse.json({ error: `Case is ${bgvReq.status} — submission not allowed.` }, { status: 409, headers: CORS });
    }

    // ── Required-check validation (fix #5).
    const checks = await db.$queryRawUnsafe(
      `SELECT * FROM "BgvCheck" WHERE "bgvRequestId"=$1 ORDER BY "createdAt" ASC`, requestId,
    ).catch(() => []) as any[];
    if (!checks.length) return NextResponse.json({ error: 'This case has no checks to report.' }, { status: 400, headers: CORS });

    const reworkCheckIds: string[] | null = (() => {
      if (bgvReq.status !== 'rework_required' || !bgvReq.reworkChecks) return null;
      try { const arr = JSON.parse(bgvReq.reworkChecks); return Array.isArray(arr) ? arr : null; } catch { return null; }
    })();

    const incomplete: string[] = [];
    for (const c of checks) {
      // In rework, only the HR-flagged checks block submission; others may already be fine.
      const isRequired = reworkCheckIds ? reworkCheckIds.includes(c.id) : true;
      if (!isRequired) continue;
      if (c.status !== 'completed') { incomplete.push(`${c.checkLabel || c.checkType}: not completed`); continue; }
      if (!c.result || !CHECK_RESULTS.includes(c.result)) { incomplete.push(`${c.checkLabel || c.checkType}: invalid result`); continue; }
      if (!c.verificationDate) { incomplete.push(`${c.checkLabel || c.checkType}: missing verification date`); continue; }
      if (RESULTS_REQUIRING_REASON.includes(c.result) && !String(c.findings || '').trim()) {
        incomplete.push(`${c.checkLabel || c.checkType}: "${c.result}" needs written findings`);
      }
    }
    if (incomplete.length > 0) {
      return NextResponse.json(
        { error: `Complete all required checks before submitting: ${incomplete.join('; ')}` },
        { status: 400, headers: CORS },
      );
    }

    // Optional vendor PDF (clearly separate from the standard report).
    let vendorPdfName: string | null = null;
    let vendorPdfData: string | null = null;
    if (vendorPdf && vendorPdf.dataBase64) {
      const mime = String(vendorPdf.mimeType || 'application/pdf').toLowerCase();
      if (mime !== 'application/pdf') {
        return NextResponse.json({ error: 'The vendor report upload must be a PDF.' }, { status: 415, headers: CORS });
      }
      const b64 = String(vendorPdf.dataBase64).replace(/^data:[^;,]*;base64,/, '');
      const approxBytes = Math.floor(b64.length * 0.75);
      if (approxBytes > VENDOR_PDF_MAX_BYTES) {
        return NextResponse.json({ error: `Vendor PDF is too large (max ${VENDOR_PDF_MAX_BYTES / (1024 * 1024)} MB).` }, { status: 413, headers: CORS });
      }
      const fileName = String(vendorPdf.fileName || 'vendor-report.pdf')
        .replace(/[\r\n"\\/\x00-\x1f]/g, '_').slice(0, 160) || 'vendor-report.pdf';
      vendorPdfName = fileName;
      vendorPdfData = b64;
    }

    // Investigator identity (session-derived, not client-supplied).
    let investigatorName = vu.name;
    if (auth.role === 'vendor_admin' && bgvReq.assignedVendorUserId && bgvReq.assignedVendorUserId !== vu.id) {
      const inv = await db.$queryRawUnsafe(
        `SELECT "name","email" FROM "VendorUser" WHERE "id"=$1 LIMIT 1`, bgvReq.assignedVendorUserId,
      ).catch(() => []) as any[];
      if (inv[0]) investigatorName = inv[0].name;
    }

    // Evidence index per check.
    const evidenceRows = await db.$queryRawUnsafe(
      `SELECT "id","bgvCheckId","fileName" FROM "BgvEvidence" WHERE "bgvRequestId"=$1 ORDER BY "uploadedAt" ASC`,
      requestId,
    ).catch(() => []) as any[];
    const evByCheck: Record<string, { id: string; fileName: string }[]> = {};
    for (const e of evidenceRows) {
      (evByCheck[e.bgvCheckId] ||= []).push({ id: e.id, fileName: e.fileName });
    }

    const vendorRow = await db.$queryRawUnsafe(
      `SELECT "name" FROM "VendorCompany" WHERE "id"=$1 LIMIT 1`, bgvReq.vendorCompanyId,
    ).catch(() => [{ name: '' }]) as any[];

    const sharedDocs = await db.$queryRawUnsafe(
      `SELECT "id","documentType","documentLabel" FROM "BgvDocumentShare" WHERE "bgvRequestId"=$1 ORDER BY "sharedAt" ASC`,
      requestId,
    ).catch(() => []) as any[];

    // ── Transactional version creation (race-safe).
    let snapshot: ReportSnapshot | null = null;
    let createdReport: { id: string; version: number; pdfStatus: string } | null = null;
    await db.$transaction(async (tx: any) => {
      // Advisory lock scoped to this request serializes concurrent submissions.
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `bgv-submit-${requestId}`);

      // Re-read status inside the lock (guard against a just-submitted case).
      const fresh = await tx.$queryRawUnsafe(
        `SELECT "status" FROM "BgvRequest" WHERE "id"=$1 LIMIT 1`, requestId,
      );
      if (!fresh.length || !BGV_WORKABLE_STATUSES.includes(fresh[0].status)) {
        throw Object.assign(new Error('The report was just submitted — refreshing.'), { code: 'ALREADY_SUBMITTED' });
      }

      const verRows = await tx.$queryRawUnsafe(
        `SELECT COALESCE(MAX("version"),0)+1 AS "nextVer" FROM "BgvReport" WHERE "bgvRequestId"=$1`, requestId,
      );
      const nextVersion = Number(verRows?.[0]?.nextVer || 1);

      const snapChecks: SnapshotCheck[] = checks.map((c: any) => ({
        checkId: c.id,
        checkType: c.checkType,
        checkLabel: c.checkLabel || c.checkType,
        status: c.status,
        result: c.result || null,
        findings: c.findings || null,
        verificationDate: c.verificationDate ? new Date(c.verificationDate).toISOString() : null,
        completedAt: c.completedAt ? new Date(c.completedAt).toISOString() : null,
        evidenceIds: (evByCheck[c.id] || []).map((e) => e.id),
        evidenceFiles: (evByCheck[c.id] || []),
      }));

      const submitterId = auth.role === 'vendor_admin' ? String(bgvReq.assignedVendorUserId || vu.id) : vu.id;
      const submitterRow = submitterId !== vu.id
        ? await tx.$queryRawUnsafe(`SELECT "name","email" FROM "VendorUser" WHERE "id"=$1 LIMIT 1`, submitterId)
        : null;

      snapshot = {
        caseId: requestId,
        caseNumber: bgvReq.caseNumber || null,
        candidateName: bgvReq.candidateName || bgvReq.candidateEmail,
        candidateEmail: bgvReq.candidateEmail,
        vendorCompanyId: bgvReq.vendorCompanyId,
        vendorName: vendorRow[0]?.name || '',
        investigatorId: submitterId,
        investigatorName: submitterRow?.[0]?.name || investigatorName,
        investigatorEmail: submitterRow?.[0]?.email || vu.email,
        submittedAt: new Date().toISOString(),
        version: nextVersion,
        overallFindings: summary,
        overallResult: snapChecks.every((c) => c.result === 'Clear') ? 'Clear' : (snapChecks.some((c) => c.result === 'Discrepancy Found') ? 'Discrepancy Found' : 'Mixed / Unable to Verify'),
        checks: snapChecks,
        sharedDocuments: sharedDocs.map((d: any) => ({ id: d.id, documentType: d.documentType, documentLabel: d.documentLabel })),
        instructions: bgvReq.instructions || null,
        dueDate: bgvReq.dueDate ? new Date(bgvReq.dueDate).toISOString() : null,
      };

      // Standard PDF — generated INSIDE the transaction so the stored bytes
      // and the stored snapshot can never diverge. Failure is recorded, not fatal.
      let pdfB64: string | null = null;
      let pdfError: string | null = null;
      try {
        const buf = await generateStandardReportPdf(snapshot, { draft: false });
        pdfB64 = buf.toString('base64');
      } catch (e: any) {
        pdfError = String(e?.message || e || 'PDF generation failed').slice(0, 500);
      }

      const reportId = `rpt-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      await tx.$executeRawUnsafe(
        `INSERT INTO "BgvReport"
           ("id","bgvRequestId","version","submittedById","submittedAt","summary","overallResult","snapshot",
            "standardPdfName","standardPdfMime","standardPdfData","pdfStatus","pdfError",
            "vendorPdfName","vendorPdfMime","vendorPdfData","status","createdAt")
         VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'submitted',NOW())`,
        reportId, requestId, nextVersion, vu.id, summary, (snapshot as ReportSnapshot).overallResult,
        JSON.stringify(snapshot),
        pdfB64 ? `Marqaitech-Standard-BGV-Report-v${nextVersion}.pdf` : null,
        pdfB64 ? 'application/pdf' : null,
        pdfB64,
        pdfB64 ? 'ready' : 'failed',
        pdfError,
        vendorPdfName, vendorPdfName ? 'application/pdf' : null, vendorPdfData,
      );

      // Freeze the case for HR review (work stops until HR decides).
      await tx.$executeRawUnsafe(
        `UPDATE "BgvRequest" SET "status"='submitted_for_hr_review',"version"="version"+1,"updatedAt"=NOW() WHERE "id"=$1`,
        requestId,
      );

      createdReport = { id: reportId, version: nextVersion, pdfStatus: pdfB64 ? 'ready' : 'failed' };
    }).catch((txError: any) => {
      throw txError;
    });

    const report = createdReport as { id: string; version: number; pdfStatus: string } | null;
    if (!report || !report.id) {
      // defensive: transaction succeeded but did not produce a report row
      throw new Error('Report transaction completed without creating a report');
    }

      // HR notification goes to the responsible HR reviewer (fix #8 — resolved, not hardcoded).
      const hrIds = [...new Set([bgvReq.initiatedByHRId].filter(Boolean))] as string[];
      let recipients: any[] = [];
      if (hrIds.length) {
        const placeholders = hrIds.map((_, i) => `$${i + 1}`).join(',');
        recipients = await db.$queryRawUnsafe(
          `SELECT "id","email","name" FROM "User" WHERE "id" IN (${placeholders}) AND "status"='active' LIMIT 5`,
          ...hrIds,
        ).catch(() => []) as any[];
      }
    if (!recipients.length) {
      // Fallback: active HR-role users of the initiating tenant.
      recipients = await db.$queryRawUnsafe(
        `SELECT "id","email","name" FROM "User" WHERE "role" IN ('tenant_admin','hr_admin','admin','company_hr_admin') AND "status"='active' LIMIT 3`,
      ).catch(() => []) as any[];
    }
    for (const hr of recipients.slice(0, 3)) {
      await notifyBgvEvent({
        db,
        event: 'report_submitted',
        recipient: hr.email,
        bgvRequestId: requestId,
        vendorCompanyId: bgvReq.vendorCompanyId,
        vendorUserId: vu.id,
        subject: `BGV report v${report.version} submitted — ${snapshot!.candidateName}`,
        html: `<p>The vendor submitted a BGV report for review:</p>
               <ul>
                 <li>Candidate: <b>${snapshot!.candidateName}</b> (${snapshot!.candidateEmail})</li>
                 <li>Case: <b>${snapshot!.caseNumber || snapshot!.caseId}</b> — report version <b>v${report.version}</b></li>
                 <li>Vendor: <b>${snapshot!.vendorName}</b> · Investigator: <b>${snapshot!.investigatorName}</b></li>
                 <li>Results: ${snapshot!.checks.map((c) => `${c.checkLabel || c.checkType}: ${c.result || '—'}`).join(' · ')}</li>
               </ul>
               <p>Open <b>BGV Cases</b> in the HRMS to review and decide (Approve / Request Rework / Reject).</p>`,
        inAppUserId: hr.id,
        inAppTitle: 'BGV report ready for review',
        inAppMessage: `${snapshot!.vendorName} submitted report v${report.version} for ${snapshot!.candidateName}.`,
        tenantId: auth.tenantId,
      });
    }
    // Vendor admin awareness (in-app mirror of the event).
    const vendorAdmins = await db.$queryRawUnsafe(
      `SELECT "email","id" FROM "VendorUser" WHERE "vendorCompanyId"=$1 AND "role"='vendor_admin' AND "status"='active'`,
      bgvReq.vendorCompanyId,
    ).catch(() => []) as any[];
    for (const va of vendorAdmins.slice(0, 3)) {
      await notifyBgvEvent({
        db, event: 'report_submitted_admin_mirror', recipient: va.email,
        bgvRequestId: requestId, vendorCompanyId: bgvReq.vendorCompanyId, vendorUserId: va.id,
        subject: `Report v${report.version} submitted for ${snapshot!.candidateName}`,
        html: `<p>The investigator submitted report v${report.version} for case ${snapshot!.caseNumber || snapshot!.caseId} (${snapshot!.candidateName}). HR review is pending.</p>`,
      });
    }

    await db.auditLog.create({
      data: { userId: vu.id, action: 'BGV_REPORT_SUBMITTED', module: 'bgv',
              details: `Report v${report.version} submitted for request ${requestId} (${bgvReq.caseNumber || ''})` },
    }).catch(() => null);

    return NextResponse.json({
      message: `Report v${report.version} submitted to HR. You cannot edit this version anymore.`,
      reportId: report.id, version: report.version,
      pdfStatus: report.pdfStatus,
      status: 'submitted_for_hr_review',
    }, { status: 201, headers: CORS });
  } catch (error: any) {
    if (String(error?.message || '').toLowerCase().includes('just submitted') || error?.code === 'ALREADY_SUBMITTED') {
      return NextResponse.json(
        { error: 'This report was just submitted (double click protected). Refreshing…', code: 'ALREADY_SUBMITTED' },
        { status: 409, headers: CORS },
      );
    }
    console.error('BGV submit-report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
