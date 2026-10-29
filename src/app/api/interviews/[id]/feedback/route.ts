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

    // Ensure the InterviewFeedback table exists with correct schema
    // Drop the old table (from AI interview feature) and recreate with our schema
    try {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "InterviewFeedback"`);
    } catch {}
    try {
      await db.$executeRawUnsafe(`CREATE TABLE "InterviewFeedback" (
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
    const finalRecommendation = validRecommendations.includes(recommendation) ? recommendation : 'hold';
    const feedbackId = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Use INSERT ... ON CONFLICT to handle both insert and update in one query.
    // This avoids issues with old table schemas from previous deploys.
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "InterviewFeedback"
         ("id", "interviewId", "userId", "technicalSkills", "communication", "experience", "problemSolving",
          "roleSuitability", "culturalFit", "strengths", "concerns", "rating", "recommendation", "comments", "submittedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
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
           "updatedAt" = NOW()`,
        feedbackId, id, userId,
        technicalSkills || null, communication || null, experience || null, problemSolving || null,
        roleSuitability || null, culturalFit || null, strengths || null, concerns || null,
        rating ? Number(rating) : null, finalRecommendation, comments || null,
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
        // Avoid hr@marqaitech.com per user instruction
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
