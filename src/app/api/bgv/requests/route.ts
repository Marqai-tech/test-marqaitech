import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getAuthInfo } from '@/lib/companyScope';
import { HR_ROLES } from '@/lib/bgv';

const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization' };
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * GET /api/bgv/requests — HR case list.
 *
 *  ?preboardingCandidateId=<id>  → only that candidate's cases (used by the
 *                                  preboarding Documents workspace BGV card).
 *
 * DRAFT PRIVACY: live BgvCheck rows are reduced to progress counts only —
 * HR never receives draft findings/results/evidence from this endpoint.
 * Submitted content flows exclusively through report snapshots
 * (see GET /api/bgv/requests/[id]).
 */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const auth = await getAuthInfo(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    if (!HR_ROLES.includes(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: CORS });

    const candidateId = new URL(req.url).searchParams.get('preboardingCandidateId');
    const corsDbg = { ...CORS } as Record<string, string>;
    let rows: any[];
    try {
      if (candidateId) {
        rows = await db.$queryRawUnsafe(
          `SELECT r."id","caseNumber","status","candidateEmail","candidateName","preboardingCandidateId",
                  "vendorCompanyId","dueDate","createdAt","updatedAt","version",
                  vc."name" AS "vendorName",
                  vu."name" AS "assigneeName", vu."email" AS "assigneeEmail",
                  (SELECT json_agg(json_build_object('id', c."id", 'status', c."status")) FROM "BgvCheck" c WHERE c."bgvRequestId" = r."id") AS "checkStates",
                  (SELECT COUNT(*)::int FROM "BgvReport" rp WHERE rp."bgvRequestId" = r."id") AS "reportCount"
             FROM "BgvRequest" r
             LEFT JOIN "VendorCompany" vc ON vc."id" = r."vendorCompanyId"
             LEFT JOIN "VendorUser" vu ON vu."id" = r."assignedVendorUserId"
            WHERE r."preboardingCandidateId"=$1
            ORDER BY r."createdAt" DESC LIMIT 5`,
          candidateId,
        ) as any[];
      } else {
        rows = await db.$queryRawUnsafe(
          `SELECT r."id","caseNumber","status","candidateEmail","candidateName","preboardingCandidateId",
                  "vendorCompanyId","dueDate","createdAt","updatedAt","version",
                  vc."name" AS "vendorName",
                  vu."name" AS "assigneeName", vu."email" AS "assigneeEmail",
                  (SELECT json_agg(json_build_object('id', c."id", 'status', c."status")) FROM "BgvCheck" c WHERE c."bgvRequestId" = r."id") AS "checkStates",
                  (SELECT COUNT(*)::int FROM "BgvReport" rp WHERE rp."bgvRequestId" = r."id") AS "reportCount"
             FROM "BgvRequest" r
             LEFT JOIN "VendorCompany" vc ON vc."id" = r."vendorCompanyId"
             LEFT JOIN "VendorUser" vu ON vu."id" = r."assignedVendorUserId"
            ORDER BY r."createdAt" DESC LIMIT 200`,
        ) as any[];
      }
    } catch (qErr) {
      // Never swallow the failure silently: log it, surface a short diagnostic
      // header, and fall back to a resilient r.* query so HR still sees cases.
      console.error('[bgv-list] enriched query failed:', qErr instanceof Error ? qErr.message : qErr);
      corsDbg['x-bgv-list-debug'] = (qErr instanceof Error ? qErr.message : String(qErr)).slice(0, 180);
      rows = await db.$queryRawUnsafe(
        `SELECT r.* FROM "BgvRequest" r ${candidateId ? `WHERE r."preboardingCandidateId"=$1` : ''}
          ORDER BY r."createdAt" DESC LIMIT 200`,
        ...(candidateId ? [candidateId] : []),
      ).catch(() => []) as any[];
    }

    return NextResponse.json({ requests: rows }, { headers: corsDbg });
  } catch (error) {
    console.error('BGV requests list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
