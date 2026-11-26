/**
 * Candidate Portal: Interview List + Respond API (Pt 11)
 *
 * GET  /api/candidate-portal/interviews               — list interviews for the logged-in candidate
 * POST /api/candidate-portal/interviews/[id]/respond   — candidate responds (confirm, reschedule, withdraw)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * Shared interview-fetch query (LOCKED-5).
 * Runs the same SELECT against any DB handle so the candidate portal can
 * search both dedicated tenant databases AND the shared platform DB.
 */
async function fetchCandidateInterviews(db: PrismaDb, candidateEmail: string): Promise<any[]> {
  // Ensure candidate-response columns exist (lazy migration) so the
  // candidateStatus SELECT below never fails on older deployments.
  await db.$executeRawUnsafe(`ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "candidateResponse" TEXT`).catch(() => null);
  await db.$executeRawUnsafe(`ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "candidateResponseReason" TEXT`).catch(() => null);
  await db.$executeRawUnsafe(`ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "candidateRespondedAt" TIMESTAMP(3)`).catch(() => null);
  await db.$executeRawUnsafe(`ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "finalFeedback" TEXT`).catch(() => null);
  await db.$executeRawUnsafe(`ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "finalDecision" TEXT`).catch(() => null);
  await db.$executeRawUnsafe(`ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "finalFeedbackAt" TIMESTAMP`).catch(() => null);

  // Find interviews via JobApplication.candidateEmail.
  // LOCKED-3: completed interviews that carry HR's final feedback are
  // also returned so the candidate can read the result in the portal.
  const interviews = await db.$queryRawUnsafe(
    `SELECT i."id", i."date", i."time", i."duration", i."type", i."location",
            i."meetingUrl", i."status", i."instructions", i."mode",
            i."candidateAttendance", i."round",
            CASE WHEN jp."interviewPlan" IS NULL OR jp."interviewPlan" = '' THEN 0
                 ELSE jsonb_array_length(jp."interviewPlan"::jsonb) END AS "planTotal",
            i."finalFeedback", i."finalDecision", i."finalFeedbackAt",
            ja."candidateName", ja."candidateEmail",
            jp."title" AS "jobTitle"
     FROM "Interview" i
     JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
     LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
     WHERE LOWER(ja."candidateEmail") = LOWER($1)
       AND ( i."status" IN ('scheduled', 'rescheduled')
             OR (i."finalFeedback" IS NOT NULL AND i."finalFeedback" <> '') )
     ORDER BY i."date" ASC`,
    candidateEmail,
  ).catch(() => []) as any[];

  // Fetch candidate response status if stored
  for (const interview of interviews) {
    try {
      const responseRow = await db.$queryRawUnsafe(
        `SELECT "candidateResponse", "candidateResponseReason", "candidateRespondedAt"
         FROM "Interview" WHERE "id" = $1 LIMIT 1`,
        interview.id,
      ).catch(() => []) as any[];
      interview.candidateStatus = responseRow[0]?.candidateResponse || 'pending';
    } catch {
      interview.candidateStatus = 'pending';
    }
  }
  return interviews;
}

type PrismaDb = { $queryRawUnsafe: (...args: any[]) => Promise<any>; $executeRawUnsafe: (...args: any[]) => Promise<any> };

export async function GET(req: NextRequest) {
  const platformDb = getPlatformDb();
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    // Find the candidate by email (decoded.email)
    const candidateEmail = (decoded as any).email || '';
    if (!candidateEmail) return NextResponse.json({ interviews: [] }, { headers: corsHeaders() });

    // ─── 1. Shared-mode DB (platform DB / request context) ──────────────
    // Deployments without dedicated tenant databases keep every Interview
    // row in the platform DB. getDb(request) resolves exactly the same DB
    // the candidate dashboard uses — this is why the dashboard showed the
    // upcoming interview while this tab stayed empty before the fix.
    const allInterviews: any[] = [];
    const seenIds = new Set<string>();
    try {
      const sharedDb = await getDb(req);
      for (const interview of await fetchCandidateInterviews(sharedDb as PrismaDb, candidateEmail)) {
        if (!seenIds.has(interview.id)) { seenIds.add(interview.id); allInterviews.push(interview); }
      }
    } catch { /* fall through to tenant sweep */ }

    // ─── 2. Dedicated tenant DB sweep (multi-DB deployments) ────────────
    const tenantDbs = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      select: { connectionString: true, tenant: { select: { slug: true, id: true } } },
    });

    for (const td of tenantDbs) {
      if (!td.connectionString || !td.tenant?.slug) continue;
      try {
        const { getDbForTenant } = await import('@/lib/tenant-db');
        const db = await getDbForTenant(td.tenant.slug);
        for (const interview of await fetchCandidateInterviews(db as unknown as PrismaDb, candidateEmail)) {
          if (!seenIds.has(interview.id)) { seenIds.add(interview.id); allInterviews.push(interview); }
        }
      } catch { /* try next tenant */ }
    }

    return NextResponse.json({ interviews: allInterviews }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[CandidateInterviews GET] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
