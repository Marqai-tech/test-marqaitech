import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { BGV_TERMINAL_STATUSES } from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * GET /api/vendor/requests — vendor portal case list.
 *
 *  - vendor_admin: every case of their company (unassigned queue + assigned).
 *  - vendor_employee: ONLY cases assigned to them (mock 10 — no vendor-wide
 *    candidate list). Direct API calls obey the same rule as the UI.
 *
 * Returns checks (with evidence ids), shared documents (labels only — files
 * stream through the authorized endpoint) and report versions. Data is
 * never served for a different vendor company.
 */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!['vendor_admin', 'vendor_employee'].includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden — vendor access only' }, { status: 403, headers: CORS });
    }

    // Current DB record — disabling an account cuts access immediately.
    const vuRows = await db.$queryRawUnsafe(
      `SELECT * FROM "VendorUser" WHERE "email"=$1 AND "status"='active' LIMIT 1`,
      auth.email,
    ).catch(() => []) as any[];
    if (vuRows.length === 0) {
      return NextResponse.json({ error: 'Vendor user not found or disabled' }, { status: 403, headers: CORS });
    }
    const vu = vuRows[0];

    let sql = `SELECT r."id","candidateEmail","candidateName","preboardingCandidateId","vendorCompanyId",
                      "initiatedByHRId","status","caseNumber","dueDate","instructions","checks",
                      "assignedVendorUserId","assignedById","assignedAt","version",
                      "reworkReason","reworkChecks","reworkDueDate","createdAt","updatedAt",
                      vc."name" AS "vendorName",
                      vu2."name" AS "assigneeName", vu2."email" AS "assigneeEmail"
                 FROM "BgvRequest" r
                 LEFT JOIN "VendorCompany" vc ON vc."id" = r."vendorCompanyId"
                 LEFT JOIN "VendorUser" vu2 ON vu2."id" = r."assignedVendorUserId"
                WHERE r."vendorCompanyId"=$1`;
    const params: any[] = [vu.vendorCompanyId];
    if (auth.role === 'vendor_employee') {
      sql += ` AND r."assignedVendorUserId"=$2`;
      params.push(vu.id);
    }
    sql += ` ORDER BY r."createdAt" DESC`;

    const requests = await db.$queryRawUnsafe(sql, ...params).catch(() => []) as any[];

    for (const req of requests) {
      req.checks = await db.$queryRawUnsafe(
        `SELECT c."id","checkType","checkLabel","status","result","findings","verificationDate","completedAt",
                (SELECT COUNT(*)::int FROM "BgvEvidence" e WHERE e."bgvCheckId" = c."id") AS "evidenceCount",
                (SELECT json_agg(json_build_object('id', e."id", 'fileName', e."fileName"))
                   FROM "BgvEvidence" e WHERE e."bgvCheckId" = c."id") AS "evidence"
           FROM "BgvCheck" c WHERE c."bgvRequestId"=$1 ORDER BY c."createdAt" ASC`,
        req.id,
      ).catch(() => []) as any[];
      req.sharedDocuments = await db.$queryRawUnsafe(
        `SELECT "id","documentType","documentLabel" FROM "BgvDocumentShare" WHERE "bgvRequestId"=$1 ORDER BY "sharedAt" ASC`,
        req.id,
      ).catch(() => []) as any[];
      // Report metadata only — PDF bytes stream via the report-pdf endpoint.
      req.reports = await db.$queryRawUnsafe(
        `SELECT "id","version","summary","overallResult","status","submittedAt","pdfStatus",
                "vendorPdfName","standardPdfName","hrDecision","hrDecisionAt","hrDecisionReason"
           FROM "BgvReport" WHERE "bgvRequestId"=$1 ORDER BY "version" DESC`,
        req.id,
      ).catch(() => []) as any[];
      // Assignment history (visible to admins; harmless summary for employees).
      req.assignments = await db.$queryRawUnsafe(
        `SELECT a."vendorUserId", a."assignedAt", a."unassignedAt", a."reason", vu."name" AS "assigneeName"
           FROM "BgvAssignment" a LEFT JOIN "VendorUser" vu ON vu."id"=a."vendorUserId"
          WHERE a."bgvRequestId"=$1 ORDER BY a."assignedAt" ASC`,
        req.id,
      ).catch(() => []) as any[];
    }

    return NextResponse.json({
      requests,
      vendorUserId: vu.id,
      vendorCompanyId: vu.vendorCompanyId,
      role: vu.role,
    }, { headers: CORS });
  } catch (error) {
    console.error('Vendor requests GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
