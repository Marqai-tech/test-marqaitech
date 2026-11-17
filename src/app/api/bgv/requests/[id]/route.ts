import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { HR_ROLES, labelForStatus } from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * GET /api/bgv/requests/[id] — HR case detail (mock screens 15 & 16).
 *
 * DRAFT PRIVACY (enforced in serialization, not just UI):
 *  - HR always sees case status, assignee, vendor, due date and PROGRESS
 *    counts of checks (pending / in progress / completed).
 *  - HR NEVER sees live draft findings/results/evidence from BgvCheck —
 *    before the first submission they get "Report available after vendor
 *    submission" only; during rework they still see the earlier SUBMITTED
 *    versions (immutable snapshots) but never the vendor's new drafts.
 *  - Submitted content comes exclusively from BgvReport.snapshot rows.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!HR_ROLES.includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const { id: requestId } = await params;
    const reqRows = await db.$queryRawUnsafe(
      `SELECT r.*, vc."name" AS "vendorName", vu."name" AS "assigneeName", vu."email" AS "assigneeEmail",
              hr."name" AS "initiatedByName", hr."email" AS "initiatedByEmail"
         FROM "BgvRequest" r
         LEFT JOIN "VendorCompany" vc ON vc."id" = r."vendorCompanyId"
         LEFT JOIN "VendorUser" vu ON vu."id" = r."assignedVendorUserId"
         LEFT JOIN "User" hr ON hr."id" = r."initiatedByHRId"
        WHERE r."id"=$1 LIMIT 1`,
      requestId,
    ).catch(() => []) as any[];
    if (!reqRows.length) return NextResponse.json({ error: 'Case not found' }, { status: 404, headers: CORS });
    const bgvReq = reqRows[0];

    // ── Progress counts ONLY (draft findings/result/evidence stripped).
    const checkRows = await db.$queryRawUnsafe(
      `SELECT "id","checkType","checkLabel","status","updatedAt" FROM "BgvCheck"
        WHERE "bgvRequestId"=$1 ORDER BY "createdAt" ASC`,
      requestId,
    ).catch(() => []) as any[];
    const progress = {
      total: checkRows.length,
      pending: checkRows.filter((c: any) => c.status === 'pending').length,
      inProgress: checkRows.filter((c: any) => c.status === 'in_progress').length,
      completed: checkRows.filter((c: any) => c.status === 'completed').length,
    };
    const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

    // ── Submitted report versions (immutable snapshots) — HR-visible.
    const reportRows = await db.$queryRawUnsafe(
      `SELECT "id","version","summary","overallResult","status","submittedAt","pdfStatus","pdfError",
              "standardPdfName","vendorPdfName","hrDecision","hrDecisionById","hrDecisionAt","hrDecisionReason",
              "snapshot",
              (SELECT "name" FROM "VendorUser" WHERE "id"="BgvReport"."submittedById") AS "investigatorName",
              (SELECT "email" FROM "VendorUser" WHERE "id"="BgvReport"."submittedById") AS "investigatorEmail"
         FROM "BgvReport" WHERE "bgvRequestId"=$1 ORDER BY "version" ASC`,
      requestId,
    ).catch(() => []) as any[];

    const reports = reportRows.map((r: any) => {
      let checks: any[] = [];
      try {
        const snap = JSON.parse(r.snapshot || 'null');
        checks = Array.isArray(snap?.checks) ? snap.checks : [];
      } catch { checks = []; }
      return {
        id: r.id,
        version: r.version,
        summary: r.summary,
        overallResult: r.overallResult,
        status: r.status,
        submittedAt: r.submittedAt,
        investigatorName: r.investigatorName,
        investigatorEmail: r.investigatorEmail,
        pdfStatus: r.pdfStatus,
        pdfError: r.pdfStatus === 'failed' ? r.pdfError : undefined, // surfaced for retry, never faked
        hasStandardPdf: r.pdfStatus === 'ready',
        standardPdfName: r.standardPdfName,
        hasVendorPdf: Boolean(r.vendorPdfName),
        vendorPdfName: r.vendorPdfName,
        hrDecision: r.hrDecision,
        hrDecisionAt: r.hrDecisionAt,
        hrDecisionReason: r.hrDecisionReason,
        checks,
      };
    });

    // Shared documents metadata (labels only — files via authorized endpoint).
    const sharedDocs = await db.$queryRawUnsafe(
      `SELECT "id","documentType","documentLabel","sharedAt" FROM "BgvDocumentShare" WHERE "bgvRequestId"=$1 ORDER BY "sharedAt" ASC`,
      requestId,
    ).catch(() => []) as any[];

    // Assignment history.
    const assignments = await db.$queryRawUnsafe(
      `SELECT a."assignedAt", a."unassignedAt", a."reason", vu."name" AS "assigneeName", vu."email" AS "assigneeEmail"
         FROM "BgvAssignment" a LEFT JOIN "VendorUser" vu ON vu."id"=a."vendorUserId"
        WHERE a."bgvRequestId"=$1 ORDER BY a."assignedAt" ASC`,
      requestId,
    ).catch(() => []) as any[];

    return NextResponse.json({
      request: {
        id: bgvReq.id,
        caseNumber: bgvReq.caseNumber,
        status: bgvReq.status,
        statusLabel: labelForStatus(bgvReq.status),
        candidateName: bgvReq.candidateName,
        candidateEmail: bgvReq.candidateEmail,
        preboardingCandidateId: bgvReq.preboardingCandidateId,
        vendorCompanyId: bgvReq.vendorCompanyId,
        vendorName: bgvReq.vendorName,
        initiatedByName: bgvReq.initiatedByName,
        initiatedByEmail: bgvReq.initiatedByEmail,
        dueDate: bgvReq.dueDate,
        instructions: bgvReq.instructions,
        assigneeName: bgvReq.assigneeName,
        assigneeEmail: bgvReq.assigneeEmail,
        version: bgvReq.version,
        reworkReason: bgvReq.reworkReason,
        reworkChecks: bgvReq.reworkChecks,
        reworkDueDate: bgvReq.reworkDueDate,
        createdAt: bgvReq.createdAt,
        updatedAt: bgvReq.updatedAt,
      },
      checks: checkRows.map((c: any) => ({
        id: c.id, checkType: c.checkType, checkLabel: c.checkLabel, status: c.status,
      })), // deliberately NO result/findings/evidence — draft privacy
      progress,
      progressPercent,
      reports,
      sharedDocuments: sharedDocs,
      assignments,
      hasSubmittedReport: reports.length > 0,
    }, { headers: CORS });
  } catch (error) {
    console.error('BGV case detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
