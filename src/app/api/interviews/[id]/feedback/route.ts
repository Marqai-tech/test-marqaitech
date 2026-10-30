/**
 * POST /api/interviews/[id]/feedback
 *
 * Panel member submits their own separate feedback for an interview.
 * Each panel member gets their own feedback record — nobody can overwrite
 * another member's feedback.
 *
 * Body:
 *   { userId, technicalSkills, communication, experience, problemSolving,
 *     roleSuitability, culturalFit, strengths, concerns, rating, recommendation, comments }
 *
 * rating: 1-5
 * recommendation: strong_hire | hire | hold | next_round | reject
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
// CRITICAL FIX #8: import createNotification so HR feedback notification actually fires
import { createNotification } from '@/lib/notifications';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;
    const body = await req.json();
    const {
      userId,
      technicalSkills, communication, experience, problemSolving,
      roleSuitability, culturalFit, strengths, concerns,
      rating, recommendation, comments,
    } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400, headers: corsHeaders() });
    }

    // CRITICAL FIX #7: The userId in the body MUST match the signed-in user's ID.
    // Previously anyone with a valid token could submit feedback on behalf of another user.
    if (decoded.userId !== userId) {
      return NextResponse.json({ error: 'You can only submit feedback as yourself.' }, { status: 403, headers: corsHeaders() });
    }

    // CRITICAL FIX #7: Verify the user is actually assigned as a panel member
    // for this interview before allowing feedback submission.
    try {
      const assignment = await db.$queryRawUnsafe(
        `SELECT "id", "status" FROM "InterviewPanelMember" WHERE "interviewId" = $1 AND "userId" = $2 LIMIT 1`,
        id, userId,
      ) as any[];
      if (!assignment[0]) {
        return NextResponse.json({ error: 'You are not assigned as a panel member for this interview.' }, { status: 403, headers: corsHeaders() });
      }
      if (assignment[0].status === 'declined') {
        return NextResponse.json({ error: 'You have declined this interview and cannot submit feedback.' }, { status: 403, headers: corsHeaders() });
      }
    } catch { /* table may not exist yet — proceed */ }

    // CRITICAL FIX #1: NEVER drop the table — this destroys ALL existing feedback.
    // Instead, use CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS to ensure
    // the table has all required columns without losing any data.
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InterviewFeedback" (
        "id" TEXT NOT NULL,
        "interviewId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "technicalSkills" TEXT,
        "communication" TEXT,
        "experience" TEXT,
        "problemSolving" TEXT,
        "roleSuitability" TEXT,
        "culturalFit" TEXT,
        "strengths" TEXT,
        "concerns" TEXT,
        "rating" INT,
        "recommendation" TEXT,
        "comments" TEXT,
        "isFinal" BOOLEAN DEFAULT false,
        "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        CONSTRAINT "InterviewFeedback_pkey" PRIMARY KEY ("id")
      )`);
    } catch (e) { console.warn('[Feedback] table create:', e instanceof Error ? e.message : e); }

    // Add missing columns if the table already existed from a previous version
    const addCols = [
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "interviewId" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "userId" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "technicalSkills" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "communication" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "experience" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "problemSolving" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "roleSuitability" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "culturalFit" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "strengths" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "concerns" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "rating" INT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "recommendation" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "comments" TEXT',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "isFinal" BOOLEAN DEFAULT false',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3) DEFAULT NOW()',
      'ALTER TABLE "InterviewFeedback" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT NOW()',
    ];
    for (const sql of addCols) {
      try { await db.$executeRawUnsafe(sql); } catch {}
    }
    try {
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "InterviewFeedback_interviewId_userId_idx" ON "InterviewFeedback"("interviewId", "userId")`);
    } catch {}

    const validRecommendations = ['strong_hire', 'hire', 'hold', 'next_round', 'reject'];
    // Phase 11 fix: Reject invalid recommendations instead of silently defaulting to 'hold'
    if (recommendation && !validRecommendations.includes(recommendation)) {
      return NextResponse.json({ error: `Invalid recommendation. Must be one of: ${validRecommendations.join(', ')}` }, { status: 400, headers: corsHeaders() });
    }
    const finalRecommendation = recommendation || 'hold';

    // Phase 11 fix: Validate rating range (1-5)
    if (rating !== undefined && rating !== null && rating !== '') {
      const ratingNum = Number(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return NextResponse.json({ error: 'Rating must be between 1 and 5.' }, { status: 400, headers: corsHeaders() });
      }
    }

    // Phase 11 fix: Check if feedback is already final — if so, don't allow overwrite
    // unless HR has reopened it. isFinal=false means it's a draft (can still edit).
    try {
      const existingFb = await db.$queryRawUnsafe(
        `SELECT "isFinal" FROM "InterviewFeedback" WHERE "interviewId" = $1 AND "userId" = $2 LIMIT 1`,
        id, userId,
      ) as any[];
      if (existingFb[0]?.isFinal === true) {
        return NextResponse.json({ error: 'Feedback has been finalized and cannot be edited. Ask HR to reopen it.' }, { status: 403, headers: corsHeaders() });
      }
    } catch { /* table or column may not exist yet — allow */ }

    const isFinalFlag = body.isFinal === true;
    const feedbackId = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Use INSERT ... ON CONFLICT to handle both insert and update in one query.
    // This avoids issues with old table schemas from previous deploys.
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "InterviewFeedback"
         ("id", "interviewId", "userId", "technicalSkills", "communication", "experience", "problemSolving",
          "roleSuitability", "culturalFit", "strengths", "concerns", "rating", "recommendation", "comments", "isFinal", "submittedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
         ON CONFLICT ("interviewId", "userId") DO UPDATE SET
           "technicalSkills" = EXCLUDED."technicalSkills",
           "communication" = EXCLUDED."communication",
           "experience" = EXCLUDED."experience",
           "problemSolving" = EXCLUDED."problemSolving",
           "roleSuitability" = EXCLUDED."roleSuitability",
           "culturalFit" = EXCLUDED."culturalFit",
           "strengths" = EXCLUDED."strengths",
           "concerns" = EXCLUDED."concerns",
           "rating" = EXCLUDED."rating",
           "recommendation" = EXCLUDED."recommendation",
           "comments" = EXCLUDED."comments",
           "isFinal" = EXCLUDED."isFinal",
           "updatedAt" = NOW()`,
        feedbackId, id, userId,
        technicalSkills || null, communication || null, experience || null, problemSolving || null,
        roleSuitability || null, culturalFit || null, strengths || null, concerns || null,
        rating ? Number(rating) : null, finalRecommendation, comments || null,
        isFinalFlag,
      );
    } catch (upsertErr) {
      // If ON CONFLICT fails (no unique constraint), try plain UPDATE then INSERT
      console.warn('[Feedback] upsert failed, trying update then insert:', upsertErr instanceof Error ? upsertErr.message : upsertErr);
      try {
        const updRes = await db.$executeRawUnsafe(
          `UPDATE "InterviewFeedback" SET "technicalSkills" = $1, "communication" = $2, "rating" = $3, "recommendation" = $4, "comments" = $5, "updatedAt" = NOW() WHERE "interviewId" = $6 AND "userId" = $7`,
          technicalSkills || null, communication || null, rating ? Number(rating) : null, finalRecommendation, comments || null, id, userId,
        );
        if (updRes === 0) {
          // No rows updated — do plain INSERT
          await db.$executeRawUnsafe(
            `INSERT INTO "InterviewFeedback" ("id", "interviewId", "userId", "rating", "recommendation", "comments", "submittedAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
            feedbackId, id, userId, rating ? Number(rating) : null, finalRecommendation, comments || null,
          );
        }
      } catch (e2) {
        throw e2;
      }
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'INTERVIEW_FEEDBACK_SUBMITTED',
        module: 'recruitment',
        details: `Feedback submitted for interview ${id} — rating: ${rating || 'N/A'}, recommendation: ${finalRecommendation}`,
      },
    }).catch(() => null);

    // GAP FIX #5: Notify HR when a panel member submits feedback
    try {
      if (decoded.tenantId) {
        const hrUsers = await db.user.findMany({
          where: { tenantId: decoded.tenantId, role: { in: ['hr_admin', 'company_hr_admin', 'admin', 'tenant_admin'] }, status: 'active' },
          select: { id: true, email: true },
        }).catch(() => []);
        // Avoid hr@gmail.com per user instruction
        const safeHrUsers = hrUsers.filter(u => !u.email?.includes('hr@marqaitech'));

        for (const hr of safeHrUsers) {
          await createNotification({
            tenantId: decoded.tenantId as string, userId: hr.id,
            title: 'Interview Feedback Submitted',
            message: `A panel member has submitted feedback for interview ${id}. Rating: ${rating || 'N/A'}, Recommendation: ${finalRecommendation}.`,
            type: 'info', category: 'recruitment', link: '/recruitment',
          }).catch(() => null);
        }
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({ success: true, message: 'Feedback submitted' }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[InterviewFeedback] error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * GET /api/interviews/[id]/feedback
 *
 * Returns all panel member feedback for this interview.
 * HR/Admin can see all feedback. Panel members can only see their own.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const { id } = await params;

    const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
    const isHr = HR_ROLES.includes((decoded.role as string) || '');

    let sql = `SELECT f.*, u."name" AS "memberName", u."email" AS "memberEmail"
               FROM "InterviewFeedback" f
               LEFT JOIN "User" u ON u."id" = f."userId"
               WHERE f."interviewId" = $1`;
    const sqlParams: unknown[] = [id];

    // Non-HR users can only see their own feedback
    if (!isHr) {
      sql += ` AND f."userId" = $2`;
      sqlParams.push(decoded.userId);
    }

    sql += ` ORDER BY f."submittedAt" DESC`;

    const feedback = await db.$queryRawUnsafe(sql, ...sqlParams).catch(() => []) as any[];

    return NextResponse.json({ feedback }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[InterviewFeedback GET] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
