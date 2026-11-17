/**
 * GET /api/onboarding/pipeline — HR view of the candidate onboarding pipeline.
 *
 * Returns every PreboardingCandidate with its OnboardingDocument rows so the
 * Onboarding Review page can show document review + BGV actions.
 * (Fixes the previous contract mismatch: /onboarding-review used to fetch
 * /api/onboarding/progress, which returns TASK aggregates — the page always
 * rendered an empty list.)
 *
 * Auth: HR/admin roles. Documents are returned WITHOUT fileUrl (privacy +
 * payload size); the candidate portal and document viewer handle file access.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
    const decoded = await verifyToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: CORS });
    if (!HR_ROLES.includes(String(decoded.role || ''))) {
      return NextResponse.json({ error: 'Forbidden — HR/Admin access only' }, { status: 403, headers: CORS });
    }

    const candidates = await db.$queryRawUnsafe(
      `SELECT pbc."id", pbc."candidateName", pbc."candidateEmail", pbc."candidatePhone",
              pbc."jobTitle", pbc."onboardingStatus", pbc."status",
              pbc."backgroundCheckStatus", pbc."bgvNotes", pbc."companyEmail",
              pbc."ctc", pbc."employmentType", pbc."workLocation",
              pbc."joiningDate", pbc."startDate", pbc."employeeId", pbc."activatedAt",
              pbc."portalDetails", pbc."portalSubmittedAt", pbc."declarationName",
              pbc."declarationAcceptedAt", pbc."correctionNote", pbc."correctionSetAt",
              pbc."createdAt"
       FROM "PreboardingCandidate" pbc
       ORDER BY pbc."createdAt" DESC
       LIMIT 200`,
    ).catch(() => []) as any[];

    for (const c of candidates) {
      c.documents = await db.$queryRawUnsafe(
        `SELECT d."id", d."documentType", d."documentLabel", d."status",
                d."reviewNotes", d."uploadedAt", d."fileName", d."fileSize",
                d."reviewedAt"
         FROM "OnboardingDocument" d
         WHERE d."preboardingCandidateId" = $1
         ORDER BY d."createdAt" ASC`,
        c.id,
      ).catch(() => []) as any[];
      const approved = (c.documents || []).filter((d: any) => d.status === 'approved').length;
      const total = (c.documents || []).length;
      c.documentProgress = { approved, total };
    }

    return NextResponse.json({ candidates }, { headers: CORS });
  } catch (error) {
    console.error('[onboarding/pipeline] GET failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
