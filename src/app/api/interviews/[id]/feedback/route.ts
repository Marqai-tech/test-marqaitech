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

    // Ensure the InterviewFeedback table exists
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
        "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        CONSTRAINT "InterviewFeedback_pkey" PRIMARY KEY ("id")
      )`);
    } catch (e) { console.warn('[Feedback] table create:', e instanceof Error ? e.message : e); }

    // Add missing columns if the table already existed from a previous version
    const addCols = [
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
    ];
    for (const sql of addCols) {
      try { await db.$executeRawUnsafe(sql); } catch {}
    }
    try {
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "InterviewFeedback_interviewId_userId_idx" ON "InterviewFeedback"("interviewId", "userId")`);
    } catch {}

    // Check if feedback already exists for this interview + user
    const existing = await db.$queryRawUnsafe(
      `SELECT "id" FROM "InterviewFeedback" WHERE "interviewId" = $1 AND "userId" = $2 LIMIT 1`,
      id, userId,
    ) as any[];

    const validRecommendations = ['strong_hire', 'hire', 'hold', 'next_round', 'reject'];
    const finalRecommendation = validRecommendations.includes(recommendation) ? recommendation : 'hold';

    if (existing.length > 0) {
      // Update existing feedback
      await db.$executeRawUnsafe(
        `UPDATE "InterviewFeedback"
         SET "technicalSkills" = $1, "communication" = $2, "experience" = $3, "problemSolving" = $4,
             "roleSuitability" = $5, "culturalFit" = $6, "strengths" = $7, "concerns" = $8,
             "rating" = $9, "recommendation" = $10, "comments" = $11, "updatedAt" = NOW()
         WHERE "interviewId" = $12 AND "userId" = $13`,
        technicalSkills || null, communication || null, experience || null, problemSolving || null,
        roleSuitability || null, culturalFit || null, strengths || null, concerns || null,
        rating ? Number(rating) : null, finalRecommendation, comments || null,
        id, userId,
      );
    } else {
      // Create new feedback
      const feedbackId = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db.$executeRawUnsafe(
        `INSERT INTO "InterviewFeedback"
         ("id", "interviewId", "userId", "technicalSkills", "communication", "experience", "problemSolving",
          "roleSuitability", "culturalFit", "strengths", "concerns", "rating", "recommendation", "comments", "submittedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
        feedbackId, id, userId,
        technicalSkills || null, communication || null, experience || null, problemSolving || null,
        roleSuitability || null, culturalFit || null, strengths || null, concerns || null,
        rating ? Number(rating) : null, finalRecommendation, comments || null,
      );
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
