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
 * GET /api/candidate-portal/portal-state
 *
 * Single source of truth for the candidate portal shell:
 *  - profile
 *  - preboarding: the candidate's ACTIVE preboarding record (BRD-stage,
 *    not cancelled / did-not-join) or null. Drives the Preboarding tab.
 *  - awaitingHR: applications whose offer was accepted but preboarding has
 *    not been initiated yet (mock 03 "Awaiting HR" state).
 *  - unreadNotifications: count for the bell dot.
 *
 * Auth: candidate-kind JWT only. 404-safe for candidates with no
 * preboarding (returns preboarding: null rather than an error, so the
 * shell can render the plain recruitment portal).
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
    const name = String((decoded as any).name || 'Candidate');

    // Active preboarding record for this candidate (latest, non-terminal).
    // preboardingStage: initiated | details_pending | verification | ready_to_join | joined | did_not_join | cancelled
    const pbRows = await db.$queryRawUnsafe(
      `SELECT "id","jobTitle","joiningDate","preboardingStage","status","portalSubmittedAt",
              "correctionNote","preboardingId","createdAt"
       FROM "PreboardingCandidate"
       WHERE "candidateEmail" = $1
         AND COALESCE("preboardingStage",'') NOT IN ('cancelled','did_not_join')
         AND COALESCE("status",'') <> 'cancelled'
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      email,
    ).catch(() => []) as any[];

    let preboarding: any = null;
    if (pbRows.length > 0) {
      const pb = pbRows[0];
      preboarding = {
        preboardingCandidateId: pb.id,
        jobTitle: pb.jobTitle || null,
        applicationRef: pb.preboardingId || null,
        joiningDate: pb.joiningDate || null,
        stage: pb.preboardingStage || 'initiated',
        status: pb.status || null,
        submittedAt: pb.portalSubmittedAt || null,
        correctionPending: !!(pb.correctionNote && pb.correctionNote.trim()),
      };
    }

    // Applications with an ACCEPTED offer still awaiting HR preboarding
    // initiation (mock screen 03). Offer links to the application via
    // jobPostingId + candidateEmail (the Offer model has no applicationId).
    const awaitingRows = await db.$queryRawUnsafe(
      `SELECT ja."id" AS "applicationId", jp."title" AS "jobTitle", jp."position", o."respondedAt"
       FROM "Offer" o
       JOIN "JobApplication" ja
         ON ja."jobPostingId" = o."jobPostingId"
        AND LOWER(ja."candidateEmail") = $1
       JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
       WHERE LOWER(o."candidateEmail") = $1
         AND o."status" = 'accepted'
         AND ja."status" <> 'hired'
         AND NOT EXISTS (
           SELECT 1 FROM "PreboardingCandidate" pc
           WHERE LOWER(pc."candidateEmail") = $1
             AND COALESCE(pc."preboardingStage",'') NOT IN ('cancelled','did_not_join')
             AND COALESCE(pc."status",'') <> 'cancelled'
         )
       ORDER BY o."respondedAt" DESC NULLS LAST
       LIMIT 10`,
      email,
    ).catch(() => []) as any[];

    // Unread in-app notifications (candidate portal messages).
    // Older tenant DBs carry a runtime-added "message" column; the base
    // schema only has "body". readAt exists in both — count unread rows.
    const unreadRows = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n
       FROM "CandidateMessage"
       WHERE LOWER("candidateEmail") = $1 AND "readAt" IS NULL`,
      email,
    ).catch(() => [{ n: 0 }]) as any[];

    return NextResponse.json({
      profile: { name, email },
      preboarding,
      awaitingHR: awaitingRows.map((r: any) => ({
        applicationId: r.applicationId,
        jobTitle: r.jobTitle,
        position: r.position,
        acceptedAt: r.respondedAt || null,
      })),
      unreadNotifications: Number(unreadRows[0]?.n || 0),
    }, { headers: CORS });
  } catch (error) {
    console.error('portal-state error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
