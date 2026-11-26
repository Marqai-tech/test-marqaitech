import { NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

/**
 * GET /api/candidate-portal/bgv
 *
 * Candidate-safe view of the candidate's own Background Verification case
 * (if HR has initiated one). Powers the dynamic "Background Verification"
 * panel on the candidate portal Documents & BGV tab.
 *
 * Returns `{ request: null }` when HR has not initiated BGV yet.
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token);
    if (!decoded || (decoded as any).kind !== 'candidate') {
      return NextResponse.json({ error: 'Invalid candidate token' }, { status: 401, headers: CORS });
    }
    const email = String((decoded as any).email || '').toLowerCase();

    // Latest non-cancelled preboarding record for this candidate.
    const pbRows = await db.$queryRawUnsafe(
      `SELECT "id" FROM "PreboardingCandidate"
       WHERE LOWER("candidateEmail") = $1
         AND COALESCE("preboardingStage",'') NOT IN ('cancelled','did_not_join')
         AND COALESCE("status",'') <> 'cancelled'
       ORDER BY "createdAt" DESC LIMIT 1`,
      email,
    ).catch(() => []) as any[];
    const preboardingCandidateId: string | null = pbRows[0]?.id || null;

    // Latest BGV request for this candidate (match on preboarding id first,
    // fall back to candidate email for cases initiated before the link existed).
    const reqRows = await db.$queryRawUnsafe(
      `SELECT r."id","caseNumber",r."status","instructions","dueDate","createdAt","updatedAt",
              "assignedAt","reworkReason",
              vc."name" AS "vendorName"
       FROM "BgvRequest" r
       LEFT JOIN "VendorCompany" vc ON vc."id" = r."vendorCompanyId"
       WHERE (r."preboardingCandidateId" = $1 OR LOWER(r."candidateEmail") = $2)
         AND COALESCE(r."status",'') <> 'cancelled'
       ORDER BY r."createdAt" DESC
       LIMIT 1`,
      preboardingCandidateId || '',
      email,
    ).catch(() => []) as any[];

    if (reqRows.length === 0) {
      return NextResponse.json({ request: null }, { headers: CORS });
    }
    const req = reqRows[0];

    // Per-check progress rows.
    const checkRows = await db.$queryRawUnsafe(
      `SELECT "checkType","checkLabel","status","result","verificationDate","completedAt"
       FROM "BgvCheck" WHERE "bgvRequestId" = $1
       ORDER BY "createdAt" ASC`,
      req.id,
    ).catch(() => []) as any[];

    // Latest submitted vendor report (if any).
    const reportRows = await db.$queryRawUnsafe(
      `SELECT "summary","overallResult","status","hrDecision","hrDecisionReason","hrDecisionAt","submittedAt"
       FROM "BgvReport" WHERE "bgvRequestId" = $1
       ORDER BY "version" DESC LIMIT 1`,
      req.id,
    ).catch(() => []) as any[];
    const report = reportRows[0] || null;

    return NextResponse.json({
      request: {
        id: req.id,
        caseNumber: req.caseNumber || null,
        status: req.status || 'awaiting_assignment',
        vendorName: req.vendorName || null,
        instructions: req.instructions || null,
        dueDate: req.dueDate || null,
        assignedAt: req.assignedAt || null,
        reworkReason: req.reworkReason || null,
        initiatedAt: req.createdAt || null,
        updatedAt: req.updatedAt || null,
        checks: checkRows.map((c: any) => ({
          checkType: c.checkType,
          label: c.checkLabel || c.checkType,
          status: c.status || 'pending',
          result: c.result || null,
          completedAt: c.completedAt || null,
        })),
        report: report ? {
          summary: report.summary || null,
          overallResult: report.overallResult || null,
          status: report.status || 'submitted',
          hrDecision: report.hrDecision || null,
          hrDecisionReason: report.hrDecisionReason || null,
          hrDecisionAt: report.hrDecisionAt || null,
          submittedAt: report.submittedAt || null,
        } : null,
      },
    }, { headers: CORS });
  } catch (error) {
    console.error('candidate-portal/bgv error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
