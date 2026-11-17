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

    // Sweep tenant DBs to find the candidate's interviews
    const tenantDbs = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      select: { connectionString: true, tenant: { select: { slug: true, id: true } } },
    });

    let allInterviews: any[] = [];
    for (const td of tenantDbs) {
      if (!td.connectionString || !td.tenant?.slug) continue;
      try {
        const { getDbForTenant } = await import('@/lib/tenant-db');
        const db = await getDbForTenant(td.tenant.slug);

        // Find interviews via JobApplication.candidateEmail
        const interviews = await db.$queryRawUnsafe(
          `SELECT i."id", i."date", i."time", i."duration", i."type", i."location",
                  i."meetingUrl", i."status", i."instructions", i."mode",
                  i."candidateAttendance",
                  ja."candidateName", ja."candidateEmail",
                  jp."title" AS "jobTitle"
           FROM "Interview" i
           JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
           LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
           WHERE LOWER(ja."candidateEmail") = LOWER($1)
             AND i."status" IN ('scheduled', 'rescheduled')
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
          allInterviews.push(interview);
        }
      } catch { /* try next tenant */ }
    }

    return NextResponse.json({ interviews: allInterviews }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[CandidateInterviews GET] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
