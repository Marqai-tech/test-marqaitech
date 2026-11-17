import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { parseResumeFromDataUrl } from '@/lib/resume-parser';

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
 * POST /api/ats/parse-resume
 * Body: { jobApplicationId, resumeDataUrl }
 *   - resumeDataUrl = base64 data URL (data:<mime>;base64,<...>)
 *
 * Validates the application exists, extracts text from PDF/DOCX/text,
 * detects language, calls ZAI for structured extraction, and saves a
 * ResumeParse row.
 */
export async function POST(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    }

    const body = await request.json();
    const { jobApplicationId, resumeDataUrl } = body || ({} as { jobApplicationId?: string; resumeDataUrl?: string });

    if (!jobApplicationId || !resumeDataUrl) {
      return NextResponse.json(
        { error: 'jobApplicationId and resumeDataUrl are required' },
        { status: 400, headers: corsHeaders() },
      );
    }

    // Verify the application exists — also fetch the job posting's requirements
    // so we can compute a match score against the parsed resume.
    const application = await db.jobApplication.findUnique({
      where: { id: jobApplicationId },
      select: {
        id: true,
        candidateName: true,
        jobPosting: {
          select: { id: true, title: true, requirements: true, description: true, position: true },
        },
      },
    });
    if (!application) {
      return NextResponse.json(
        { error: 'Job application not found' },
        { status: 404, headers: corsHeaders() },
      );
    }

    // Run the parser pipeline
    const result = await parseResumeFromDataUrl(resumeDataUrl);

    // ── Compute match score: parsed resume skills vs job requirements ──
    // Extract skill keywords from the parsed resume (lowercase, trimmed).
    const parsedSkills = (result.parsed.skills || [])
      .map(s => String(s || '').toLowerCase().trim())
      .filter(Boolean);

    // Build a haystack of requirement keywords from the job posting.
    // The job's `requirements` field is free text (e.g. "Required skills:
    // React, Node.js, PostgreSQL"). We also include the title, position,
    // and description so the match covers the full job spec.
    const jobText = [
      application.jobPosting?.requirements || '',
      application.jobPosting?.title || '',
      application.jobPosting?.position || '',
      application.jobPosting?.description || '',
    ].join(' ').toLowerCase();

    // Tokenize the job text: split on non-alphanumeric, filter short tokens.
    const jobTokens = new Set(
      jobText
        .split(/[^a-z0-9+#.]+/i)
        .map(t => t.trim())
        .filter(t => t.length >= 3)
    );

    // For each parsed skill, check if it (or any of its tokens) appears in
    // the job text. This handles "Testing skills" matching "testing" etc.
    let matchedSkills: string[] = [];
    let unmatchedSkills: string[] = [];
    for (const skill of parsedSkills) {
      const skillTokens = skill.split(/[^a-z0-9+#.]+/i).filter(t => t.length >= 3);
      const isMatch = skillTokens.some(tok => jobText.includes(tok));
      if (isMatch) {
        matchedSkills.push(skill);
      } else {
        unmatchedSkills.push(skill);
      }
    }

    // Match score = (matched skills / max(total parsed skills, 1)) * 100
    // Boost: if the job text has very few skill tokens, fall back to a
    // keyword-overlap ratio so we don't punish candidates for sparse job specs.
    let matchScore = 0;
    if (parsedSkills.length > 0) {
      matchScore = Math.round((matchedSkills.length / parsedSkills.length) * 100);
    } else if (result.parsed.summary) {
      // No structured skills — fall back to summary keyword overlap
      const summaryLower = (result.parsed.summary || '').toLowerCase();
      let overlapCount = 0;
      for (const tok of jobTokens) {
        if (summaryLower.includes(tok)) overlapCount++;
      }
      matchScore = jobTokens.size > 0
        ? Math.round((overlapCount / jobTokens.size) * 100)
        : 0;
    }
    // Clamp 0-100
    matchScore = Math.max(0, Math.min(100, matchScore));

    // Persist the match score on the ResumeParse row (via raw SQL — the
    // matchScore column is added by schema-sync.ts at runtime).
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "ResumeParse" ADD COLUMN IF NOT EXISTS "matchScore" INTEGER DEFAULT 0`
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE "ResumeParse" ADD COLUMN IF NOT EXISTS "matchedSkills" TEXT`
      );
      await db.$executeRawUnsafe(
        `ALTER TABLE "ResumeParse" ADD COLUMN IF NOT EXISTS "unmatchedSkills" TEXT`
      );
    } catch { /* non-fatal — column may already exist */ }

    // Persist the ResumeParse row
    const saved = await db.resumeParse.create({
      data: {
        jobApplicationId,
        rawText: result.rawText.slice(0, 100000), // cap stored raw text
        language: result.language,
        parsedData: JSON.stringify(result.parsed),
        confidence: result.confidence,
        sourceFormat: result.sourceFormat,
        parseError: result.parseError || null,
      },
    });

    // Save the match score on the newly created ResumeParse row.
    // (Uses raw SQL because matchScore/matchedSkills/unmatchedSkills columns
    //  are added at runtime above and not yet in the Prisma schema.)
    try {
      await db.$executeRawUnsafe(
        `UPDATE "ResumeParse" SET "matchScore" = $1, "matchedSkills" = $2, "unmatchedSkills" = $3 WHERE "id" = $4`,
        matchScore,
        JSON.stringify(matchedSkills),
        JSON.stringify(unmatchedSkills),
        saved.id,
      );
    } catch { /* non-fatal — match score is best-effort */ }

    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'PARSE_RESUME',
        module: 'ats',
        details: `Parsed resume for application ${jobApplicationId} (${result.sourceFormat}, conf=${result.confidence.toFixed(2)}, lang=${result.language}, match=${matchScore}%)`,
      },
    }).catch(() => { /* non-critical */ });

    return NextResponse.json(
      {
        parseId: saved.id,
        parsedData: result.parsed,
        language: result.language,
        confidence: result.confidence,
        sourceFormat: result.sourceFormat,
        parseError: result.parseError || null,
        matchScore,
        matchedSkills,
        unmatchedSkills,
        jobRequirements: application.jobPosting?.requirements || '',
      },
      { status: 201, headers: corsHeaders() },
    );
  } catch (error) {
    console.error('parse-resume POST error:', error);
    return NextResponse.json(
      { error: 'Failed to parse resume' },
      { status: 500, headers: corsHeaders() },
    );
  }
}

/**
 * GET /api/ats/parse-resume?jobApplicationId=...
 * Returns the latest ResumeParse row for a given application.
 */
export async function GET(request: Request) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });
    }

    const { searchParams } = new URL(request.url);
    const jobApplicationId = searchParams.get('jobApplicationId');

    if (!jobApplicationId) {
      return NextResponse.json(
        { error: 'jobApplicationId query param is required' },
        { status: 400, headers: corsHeaders() },
      );
    }

    // Fetch the latest ResumeParse row + match score columns via raw SQL
    // (matchScore/matchedSkills/unmatchedSkills are added at runtime).
    let latest: any = await db.resumeParse.findFirst({
      where: { jobApplicationId },
      orderBy: { createdAt: 'desc' },
    });

    // Augment with match score fields if available
    if (latest) {
      try {
        const matchRow = await db.$queryRawUnsafe(
          `SELECT "matchScore", "matchedSkills", "unmatchedSkills" FROM "ResumeParse" WHERE "id" = $1`,
          latest.id,
        ) as any[];
        if (matchRow && matchRow[0]) {
          latest.matchScore = matchRow[0].matchScore ?? 0;
          try { latest.matchedSkills = JSON.parse(matchRow[0].matchedSkills || '[]'); } catch { latest.matchedSkills = []; }
          try { latest.unmatchedSkills = JSON.parse(matchRow[0].unmatchedSkills || '[]'); } catch { latest.unmatchedSkills = []; }
        }
      } catch { /* non-fatal */ }
    }

    if (!latest) {
      return NextResponse.json(
        { parse: null, parsedData: null },
        { headers: corsHeaders() },
      );
    }

    let parsedData = null;
    try {
      parsedData = latest.parsedData ? JSON.parse(latest.parsedData) : null;
    } catch {
      parsedData = null;
    }

    return NextResponse.json(
      {
        parse: latest,
        parsedData,
        matchScore: latest.matchScore ?? 0,
        matchedSkills: latest.matchedSkills || [],
        unmatchedSkills: latest.unmatchedSkills || [],
      },
      { headers: corsHeaders() },
    );
  } catch (error) {
    console.error('parse-resume GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch parsed resume' },
      { status: 500, headers: corsHeaders() },
    );
  }
}
