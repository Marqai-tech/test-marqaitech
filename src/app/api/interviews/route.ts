import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification, sendNotificationEmail } from '@/lib/notifications';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

/**
 * Task 167: Interview scheduling API
 *
 * GET  /api/interviews — list interviews (filter by jobApplicationId, status, type, scope=mine)
 * POST /api/interviews — schedule a new interview
 *   Body: { jobApplicationId, type, date, time, duration, location, meetingUrl, panelMemberIds: string[] }
 *   - Creates Interview row
 *   - Stores panel member IDs in the interviewer field as comma-separated string
 *   - Notifies each panel member (in-app + email)
 *   - Updates JobApplication.status to 'interview'
 */
export async function GET(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const url = new URL(req.url);
    const jobApplicationId = url.searchParams.get('jobApplicationId');
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const scope = url.searchParams.get('scope'); // 'mine' = interviews where I'm a panelist

    // Task 167: use RAW SQL for schema-drift resilience
    let sql = `SELECT i.*, ja."candidateName", ja."candidateEmail", jp."title" AS "jobTitle"
               FROM "Interview" i
               LEFT JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
               LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
               WHERE 1=1`;
    const params: unknown[] = [];
    let pIdx = 1;

    if (jobApplicationId) { sql += ` AND i."jobApplicationId" = $${pIdx++}`; params.push(jobApplicationId); }
    if (status) { sql += ` AND i."status" = $${pIdx++}`; params.push(status); }
    if (type) { sql += ` AND i."type" = $${pIdx++}`; params.push(type); }

    // 'mine' scope: interviews where the current user is a panel member
    if (scope === 'mine' && decoded.userId) {
      sql += ` AND i."interviewer" LIKE $${pIdx++}`;
      params.push(`%${decoded.userId}%`);
    }

    sql += ` ORDER BY i."date" DESC, i."time" DESC LIMIT 100`;

    const interviews = await db.$queryRawUnsafe(sql, ...params).catch(() => []) as any[];

    // Task 167: For each interview, fetch panel members with their confirmation + feedback status
    for (const interview of interviews) {
      try {
        const panelMembers = await db.$queryRawUnsafe(
          `SELECT pm."id", pm."userId", pm."status", pm."reason", pm."respondedAt",
                  u."name" AS "memberName", u."email" AS "memberEmail",
                  e."firstName", e."lastName", e."designationId",
                  des."title" AS "designation",
                  CASE WHEN f."id" IS NOT NULL THEN true ELSE false END AS "hasFeedback",
                  f."rating" AS "feedbackRating", f."recommendation" AS "feedbackRecommendation"
           FROM "InterviewPanelMember" pm
           LEFT JOIN "User" u ON u."id" = pm."userId"
           LEFT JOIN "Employee" e ON e."userId" = pm."userId"
           LEFT JOIN "Designation" des ON des."id" = e."designationId"
           LEFT JOIN "InterviewFeedback" f ON f."interviewId" = pm."interviewId" AND f."userId" = pm."userId"
           WHERE pm."interviewId" = $1`,
          interview.id,
        ) as any[];
        interview.panelMembers = panelMembers.map(pm => ({
          id: pm.id,
          userId: pm.userId,
          name: pm.memberName || `${pm.firstName || ''} ${pm.lastName || ''}`.trim() || pm.memberEmail,
          email: pm.memberEmail,
          designation: pm.designation || '—',
          confirmationStatus: pm.status,
          reason: pm.reason,
          respondedAt: pm.respondedAt,
          hasFeedback: pm.hasFeedback,
          feedbackRating: pm.feedbackRating,
          feedbackRecommendation: pm.feedbackRecommendation,
        }));
      } catch {
        interview.panelMembers = [];
      }
    }

    return NextResponse.json({ data: interviews }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Interviews GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    // Task 167: permission check — only HR/admin can schedule interviews
    const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
    if (!HR_ROLES.includes((decoded.role as string) || '')) {
      return NextResponse.json({ error: 'Only HR/Admin can schedule interviews' }, { status: 403, headers: corsHeaders() });
    }

    const body = await req.json();
    const { jobApplicationId, type, date, time, duration, location, meetingUrl, panelMemberIds, panelMemberEmails } = body;

    if (!jobApplicationId || !date) {
      return NextResponse.json({ error: 'Missing required fields: jobApplicationId, date' }, { status: 400, headers: corsHeaders() });
    }

    // Task 167: past date validation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const interviewDate = new Date(date + 'T00:00:00');
    if (interviewDate < today) {
      return NextResponse.json({ error: 'Cannot schedule interviews in the past' }, { status: 400, headers: corsHeaders() });
    }

    // Task 167: duplicate scheduling prevention — check if there's already a
    // scheduled interview for this candidate on the same date + same time
    try {
      const existing = await db.$queryRawUnsafe(
        `SELECT "id" FROM "Interview"
         WHERE "jobApplicationId" = $1 AND "date"::date = $2::date
           AND "time" = $3 AND "status" = 'scheduled'
         LIMIT 1`,
        jobApplicationId, date, time || null,
      ) as any[];
      if (existing.length > 0) {
        return NextResponse.json({ error: 'An interview is already scheduled for this candidate on the same date and time' }, { status: 409, headers: corsHeaders() });
      }
    } catch {}

    // Validate interview type
    const validTypes = ['ai', 'technical', 'hr', 'offline_panel'];
    const interviewType = validTypes.includes(type) ? type : 'technical';

    // Phase 8 fix: Validate duration (must be positive, max 480 min = 8 hours)
    const durationNum = Number(duration) || 60;
    if (durationNum < 5 || durationNum > 480) {
      return NextResponse.json({ error: 'Duration must be between 5 and 480 minutes.' }, { status: 400, headers: corsHeaders() });
    }

    // Phase 8 fix: Validate time is not in the past (if date is today)
    if (time) {
      const interviewDateTime = new Date(`${date}T${time}:00`);
      if (interviewDateTime < new Date()) {
        return NextResponse.json({ error: 'Interview time cannot be in the past.' }, { status: 400, headers: corsHeaders() });
      }
    }

    // Store panel member IDs as comma-separated string in the interviewer field
    // Task 167: support both panelMemberIds (user IDs) and panelMemberEmails (emails)
    let panelMembers: string[] = [];
    if (Array.isArray(panelMemberIds) && panelMemberIds.length > 0) {
      panelMembers = panelMemberIds.filter(Boolean);
    } else if (Array.isArray(panelMemberEmails) && panelMemberEmails.length > 0) {
      // Resolve emails to user IDs
      for (const email of panelMemberEmails.filter(Boolean)) {
        try {
          const userRows = await db.$queryRawUnsafe(
            `SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1) LIMIT 1`, email,
          ) as any[];
          if (userRows[0]?.id) panelMembers.push(userRows[0].id);
        } catch {}
      }
    }
    const interviewerStr = panelMembers.join(',');

    // Ensure extended columns exist on Interview table
    const extendCols = [
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "round" INT DEFAULT 1',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "mode" TEXT DEFAULT \'online\'',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "confirmationDeadline" TIMESTAMP(3)',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "feedbackDeadline" TIMESTAMP(3)',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "instructions" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "evaluationAreas" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "panelLeadId" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "scheduledById" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "cancelledById" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "candidateAttendance" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "hrDecision" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "hrDecisionReason" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "hrDecisionById" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "hrDecisionAt" TIMESTAMP(3)',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "panelLeadRecommendation" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "panelLeadNotes" TEXT',
    ];
    for (const sql of extendCols) {
      try { await db.$executeRawUnsafe(sql); } catch {}
    }

    // Extract spec fields from body (round, mode, confirmationDeadline, feedbackDeadline, instructions, evaluationAreas, panelLeadId)
    const { round, mode, confirmationDeadline, feedbackDeadline, instructions, evaluationAreas, panelLeadId } = body;

    // Create the interview via RAW SQL (schema-drift safe)
    const interviewId = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "Interview" ("id", "jobApplicationId", "type", "date", "time", "duration", "location", "meetingUrl", "interviewer", "status", "round", "mode", "confirmationDeadline", "feedbackDeadline", "instructions", "evaluationAreas", "panelLeadId", "scheduledById", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())`,
        interviewId, jobApplicationId, interviewType,
        new Date(date), time || null, duration || null,
        location || null, meetingUrl || null, interviewerStr || null,
        round ? Number(round) : 1, mode || 'online',
        confirmationDeadline ? new Date(confirmationDeadline) : null,
        feedbackDeadline ? new Date(feedbackDeadline) : null,
        instructions || null, evaluationAreas || null,
        panelLeadId || null, decoded.userId,
      );
    } catch (insertErr) {
      console.error('[Interviews POST] insert failed:', insertErr);
      return NextResponse.json({ error: 'Failed to schedule interview' }, { status: 500, headers: corsHeaders() });
    }

    // Update the job application status to 'interview'
    try {
      await db.$executeRawUnsafe(
        `UPDATE "JobApplication" SET "status" = 'interview', "updatedAt" = NOW() WHERE "id" = $1`,
        jobApplicationId,
      );
    } catch { /* non-fatal */ }

    // Task 167: Create InterviewPanelMember records for each panel member
    // with status 'pending' (Pending Confirmation)
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InterviewPanelMember" (
        "id" TEXT NOT NULL,
        "interviewId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "reason" TEXT,
        "respondedAt" TIMESTAMP(3),
        "attendance" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        CONSTRAINT "InterviewPanelMember_pkey" PRIMARY KEY ("id")
      )`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InterviewPanelMember_interviewId_idx" ON "InterviewPanelMember"("interviewId")`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InterviewPanelMember_userId_idx" ON "InterviewPanelMember"("userId")`);
      // Ensure attendance column exists on older tables
      await db.$executeRawUnsafe(`ALTER TABLE "InterviewPanelMember" ADD COLUMN IF NOT EXISTS "attendance" TEXT`).catch(() => {});
    } catch {}

    for (const memberId of panelMembers) {
      try {
        const pmId = `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await db.$executeRawUnsafe(
          `INSERT INTO "InterviewPanelMember" ("id", "interviewId", "userId", "status", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'pending', NOW(), NOW())`,
          pmId, interviewId, memberId,
        );
      } catch {}
    }

    // Audit log — who scheduled the interview (pt 24)
    await db.auditLog.create({
      data: { userId: decoded.userId as string, action: 'INTERVIEW_SCHEDULED', module: 'recruitment',
        details: `Interview ${interviewId} scheduled for ${jobApplicationId}. Type: ${interviewType}, Date: ${date}, Panel: ${panelMembers.length} member(s)${panelLeadId ? `, Lead: ${panelLeadId}` : ''}` },
    }).catch(() => null);

    // Fetch the application details for notifications
    const appRows = await db.$queryRawUnsafe(
      `SELECT "candidateName", "candidateEmail", "jobPostingId" FROM "JobApplication" WHERE "id" = $1 LIMIT 1`,
      jobApplicationId,
    ) as any[];
    const app = appRows[0];

    // Fetch job title
    let jobTitle = 'the position';
    if (app?.jobPostingId) {
      try {
        const jobRows = await db.$queryRawUnsafe(`SELECT "title" FROM "JobPosting" WHERE "id" = $1 LIMIT 1`, app.jobPostingId) as any[];
        if (jobRows[0]?.title) jobTitle = jobRows[0].title;
      } catch {}
    }

    // Notify each panel member via Notification Center (dispatchNotification)
    // GAP FIX #2: Migrate from raw createNotification to dispatchNotification so the
    // recruitment.interview.scheduled event fires with proper email + delivery log
    if (panelMembers.length > 0 && decoded.tenantId) {
      const typeLabels: Record<string, string> = {
        ai: 'AI Interview', technical: 'Technical Interview', hr: 'HR Interview', offline_panel: 'Panel Interview',
      };
      const typeLabel = typeLabels[interviewType] || 'Interview';
      const dateStr = new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = time || 'TBD';

      try {
        const { dispatchNotification } = await import('@/lib/notification-center');
        // Get panel member user details for email recipients
        const panelUsers = await db.user.findMany({
          where: { id: { in: panelMembers }, status: 'active' },
          select: { id: true, email: true, name: true },
        }).catch(() => []);
        // Avoid hr@marqaitech.com per user instruction
        const safePanelUsers = panelUsers.filter(u => !u.email?.includes('hr@marqaitech'));

        if (safePanelUsers.length > 0) {
          await dispatchNotification({
            tenantId: decoded.tenantId as string,
            module: 'recruitment',
            eventKey: 'recruitment.interview.scheduled',
            recipients: safePanelUsers.map(u => ({ userId: u.id, email: u.email, name: u.name })),
            vars: {
              Candidate_Name: app?.candidateName || 'a candidate',
              Job_Title: jobTitle,
              Interview_Date: dateStr,
              Interview_Time: timeStr,
              Interview_Mode: location ? `Offline — ${location}` : meetingUrl ? `Online — ${meetingUrl}` : 'TBD',
              Interviewer_Name: typeLabel,
            },
            entity: { type: 'interview', id: interviewId, link: '/my-interviews' },
          }).catch(() => null);
        }
      } catch { /* non-fatal */ }

      // Audit log
      await db.auditLog.create({
        data: {
          userId: decoded.userId as string,
          action: 'SCHEDULE_INTERVIEW',
          module: 'recruitment',
          details: `Scheduled ${interviewType} interview for ${app?.candidateName || jobApplicationId} on ${new Date(date).toLocaleDateString()}`,
        },
      }).catch(() => null);

      // GAP FIX #2: Also dispatch recruitment.interview.scheduled to the candidate (email-only)
      if (app?.candidateEmail) {
        try {
          const { dispatchNotification } = await import('@/lib/notification-center');
          await dispatchNotification({
            tenantId: decoded.tenantId as string,
            module: 'recruitment',
            eventKey: 'recruitment.interview.scheduled',
            recipients: [{ name: app.candidateName, email: app.candidateEmail }],
            vars: {
              Candidate_Name: app.candidateName,
              Job_Title: jobTitle,
              Interview_Date: dateStr,
              Interview_Time: timeStr,
              Interview_Mode: location ? `Offline — ${location}` : meetingUrl ? `Online — ${meetingUrl}` : 'TBD',
              Interviewer_Name: typeLabel,
            },
            entity: { type: 'interview', id: interviewId, link: '/careers' },
            suppressInApp: true, // email-only for candidate
          }).catch(() => null);
        } catch { /* non-fatal */ }
      }
    }

    return NextResponse.json({
      id: interviewId,
      jobApplicationId,
      type: interviewType,
      date, time, duration, location, meetingUrl,
      panelMembers: panelMembers,
      status: 'scheduled',
    }, { status: 201, headers: corsHeaders() });
  } catch (error) {
    console.error('Interviews POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}

/**
 * PATCH /api/interviews — update interview (submit feedback/ratings, change status,
 *   reschedule, cancel with reason, record attendance, HR final decision)
 *
 * Body variants:
 *   { id, status?, feedback?, score? }                                     — basic update
 *   { id, action: 'reschedule', newDate, newTime, newDuration? }           — reschedule
 *   { id, action: 'cancel', cancelReason }                                 — cancel with reason
 *   { id, action: 'attendance', candidateAttendance?, panelAttendance? }  — record attendance
 *   { id, action: 'hr_decision', decision, reason? }                       — HR final decision
 *   { id, action: 'panel_lead_recommendation', recommendation, notes? }   — panel lead debrief
 */
export async function PATCH(req: NextRequest) {
  const db = await getDb(req);
  try {
    const token = getTokenFromHeaders(req as unknown as Request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const body = await req.json();
    const { id, status, feedback, score, action } = body;

    if (!id) return NextResponse.json({ error: 'Interview ID is required' }, { status: 400, headers: corsHeaders() });

    // ─── Ensure extended columns exist on Interview table ─────────────
    const extendCols = [
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "round" INT DEFAULT 1',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "mode" TEXT DEFAULT \'online\'',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "confirmationDeadline" TIMESTAMP(3)',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "feedbackDeadline" TIMESTAMP(3)',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "instructions" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "evaluationAreas" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "panelLeadId" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "scheduledById" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "cancelledById" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3)',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "candidateAttendance" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "hrDecision" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "hrDecisionReason" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "hrDecisionById" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "hrDecisionAt" TIMESTAMP(3)',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "panelLeadRecommendation" TEXT',
      'ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "panelLeadNotes" TEXT',
    ];
    for (const sql of extendCols) {
      try { await db.$executeRawUnsafe(sql); } catch {}
    }

    const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

    // ─── Action: RESCHEDULE (pt 12) ──────────────────────────────────
    if (action === 'reschedule') {
      if (!HR_ROLES.includes((decoded.role as string) || '')) {
        return NextResponse.json({ error: 'Only HR/Admin can reschedule interviews' }, { status: 403, headers: corsHeaders() });
      }
      const { newDate, newTime, newDuration } = body;
      if (!newDate) return NextResponse.json({ error: 'newDate is required for reschedule' }, { status: 400, headers: corsHeaders() });

      // Past date validation
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (new Date(newDate + 'T00:00:00') < today) {
        return NextResponse.json({ error: 'Cannot reschedule to a past date' }, { status: 400, headers: corsHeaders() });
      }

      await db.$executeRawUnsafe(
        `UPDATE "Interview" SET "date" = $1, "time" = $2, "duration" = $3, "status" = 'rescheduled', "updatedAt" = NOW() WHERE "id" = $4`,
        new Date(newDate), newTime || null, newDuration ? Number(newDuration) : null, id,
      );

      // Reset all panel member confirmations to pending
      try {
        await db.$executeRawUnsafe(
          `UPDATE "InterviewPanelMember" SET "status" = 'pending', "reason" = NULL, "respondedAt" = NULL, "updatedAt" = NOW() WHERE "interviewId" = $1`,
          id,
        );
      } catch {}

      // Notify panel members of reschedule
      try {
        if (decoded.tenantId) {
          const panelMembers = await db.$queryRawUnsafe(
            `SELECT pm."userId", u."name", u."email" FROM "InterviewPanelMember" pm LEFT JOIN "User" u ON u."id" = pm."userId" WHERE pm."interviewId" = $1`,
            id,
          ) as any[];
          for (const pm of panelMembers) {
            await createNotification({
              tenantId: decoded.tenantId as string, userId: pm.userId,
              title: 'Interview Rescheduled',
              message: `An interview has been rescheduled to ${newDate} at ${newTime || 'TBD'}. Please confirm your availability.`,
              type: 'workflow', category: 'recruitment', link: '/my-interviews',
            }).catch(() => null);
          }
        }
      } catch {}

      // GAP FIX #4: Notify the CANDIDATE of reschedule (was missing)
      try {
        if (decoded.tenantId) {
          const interviewRow = await db.$queryRawUnsafe(
            `SELECT ja."candidateName", ja."candidateEmail", jp."title" AS "jobTitle"
             FROM "Interview" i
             JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
             LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
             WHERE i."id" = $1 LIMIT 1`, id,
          ) as any[];
          if (interviewRow[0]?.candidateEmail) {
            const { sendEmail } = await import('@/lib/email');
            await sendEmail({
              to: interviewRow[0].candidateEmail,
              subject: 'Interview Rescheduled',
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <h2 style="color:#4f46e5;">Interview Rescheduled</h2>
                <p>Dear ${interviewRow[0].candidateName || 'Candidate'},</p>
                <p>Your interview for <strong>${interviewRow[0].jobTitle || 'the position'}</strong> has been rescheduled.</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                  <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">New Date:</td><td style="padding:8px;border:1px solid #ddd;">${newDate}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">New Time:</td><td style="padding:8px;border:1px solid #ddd;">${newTime || 'TBD'}</td></tr>
                </table>
                <p>Please check your candidate portal for updated details.</p>
              </div>`,
            }).catch(() => null);
          }
        }
      } catch {}

      // Audit log
      await db.auditLog.create({
        data: { userId: decoded.userId as string, action: 'INTERVIEW_RESCHEDULED', module: 'recruitment',
          details: `Interview ${id} rescheduled to ${newDate} at ${newTime || 'TBD'}` },
      }).catch(() => null);

      return NextResponse.json({ success: true, message: 'Interview rescheduled — panel members notified' }, { headers: corsHeaders() });
    }

    // ─── Action: CANCEL with reason (pt 13) ────────────────────────────
    if (action === 'cancel') {
      if (!HR_ROLES.includes((decoded.role as string) || '')) {
        return NextResponse.json({ error: 'Only HR/Admin can cancel interviews' }, { status: 403, headers: corsHeaders() });
      }
      const { cancelReason } = body;
      if (!cancelReason || !cancelReason.trim()) {
        return NextResponse.json({ error: 'A cancellation reason is required' }, { status: 400, headers: corsHeaders() });
      }

      await db.$executeRawUnsafe(
        `UPDATE "Interview" SET "status" = 'cancelled', "cancelReason" = $1, "cancelledById" = $2, "cancelledAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $3`,
        cancelReason, decoded.userId, id,
      );

      // Notify panel members of cancellation
      try {
        if (decoded.tenantId) {
          const panelMembers = await db.$queryRawUnsafe(
            `SELECT pm."userId" FROM "InterviewPanelMember" pm WHERE pm."interviewId" = $1`, id,
          ) as any[];
          for (const pm of panelMembers) {
            await createNotification({
              tenantId: decoded.tenantId as string, userId: pm.userId,
              title: 'Interview Cancelled',
              message: `An interview has been cancelled. Reason: ${cancelReason}`,
              type: 'warning', category: 'recruitment', link: '/my-interviews',
            }).catch(() => null);
          }
        }
      } catch {}

      // GAP FIX #4: Notify the CANDIDATE of cancellation (was missing)
      try {
        if (decoded.tenantId) {
          const interviewRow = await db.$queryRawUnsafe(
            `SELECT ja."candidateName", ja."candidateEmail", jp."title" AS "jobTitle"
             FROM "Interview" i
             JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
             LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
             WHERE i."id" = $1 LIMIT 1`, id,
          ) as any[];
          if (interviewRow[0]?.candidateEmail) {
            const { sendEmail } = await import('@/lib/email');
            await sendEmail({
              to: interviewRow[0].candidateEmail,
              subject: 'Interview Cancelled',
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <h2 style="color:#ef4444;">Interview Cancelled</h2>
                <p>Dear ${interviewRow[0].candidateName || 'Candidate'},</p>
                <p>Your interview for <strong>${interviewRow[0].jobTitle || 'the position'}</strong> has been cancelled.</p>
                <p><strong>Reason:</strong> ${cancelReason}</p>
                <p>If you have any questions, please contact the HR team.</p>
              </div>`,
            }).catch(() => null);
          }
        }
      } catch {}

      // Audit log
      await db.auditLog.create({
        data: { userId: decoded.userId as string, action: 'INTERVIEW_CANCELLED', module: 'recruitment',
          details: `Interview ${id} cancelled by ${decoded.email || decoded.userId}. Reason: ${cancelReason}` },
      }).catch(() => null);

      return NextResponse.json({ success: true, message: 'Interview cancelled — panel members notified' }, { headers: corsHeaders() });
    }

    // ─── Action: ATTENDANCE (pt 15) ───────────────────────────────────
    if (action === 'attendance') {
      if (!HR_ROLES.includes((decoded.role as string) || '')) {
        return NextResponse.json({ error: 'Only HR/Admin can record attendance' }, { status: 403, headers: corsHeaders() });
      }
      const { candidateAttendance, panelAttendance } = body;
      const validCandidateAttendance = ['attended', 'late', 'no_show', 'reschedule_required'];
      const validPanelAttendance = ['present', 'late', 'absent', 'replacement_joined'];

      if (candidateAttendance && !validCandidateAttendance.includes(candidateAttendance)) {
        return NextResponse.json({ error: `Invalid candidate attendance. Must be: ${validCandidateAttendance.join(', ')}` }, { status: 400, headers: corsHeaders() });
      }

      if (candidateAttendance) {
        await db.$executeRawUnsafe(
          `UPDATE "Interview" SET "candidateAttendance" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
          candidateAttendance, id,
        );
      }

      // Record panel member attendance
      if (panelAttendance && Array.isArray(panelAttendance)) {
        for (const pa of panelAttendance) {
          if (pa.userId && pa.attendance && validPanelAttendance.includes(pa.attendance)) {
            try {
              await db.$executeRawUnsafe(
                `UPDATE "InterviewPanelMember" SET "attendance" = $1, "updatedAt" = NOW() WHERE "interviewId" = $2 AND "userId" = $3`,
                pa.attendance, id, pa.userId,
              );
            } catch {}
          }
        }
      }

      // Audit log
      await db.auditLog.create({
        data: { userId: decoded.userId as string, action: 'INTERVIEW_ATTENDANCE_RECORDED', module: 'recruitment',
          details: `Attendance recorded for interview ${id}: candidate=${candidateAttendance || 'N/A'}` },
      }).catch(() => null);

      return NextResponse.json({ success: true, message: 'Attendance recorded' }, { headers: corsHeaders() });
    }

    // ─── Action: HR FINAL DECISION (pt 19-20) ─────────────────────────
    if (action === 'hr_decision') {
      if (!HR_ROLES.includes((decoded.role as string) || '')) {
        return NextResponse.json({ error: 'Only HR/Admin can make final decisions' }, { status: 403, headers: corsHeaders() });
      }
      const { decision, reason: decisionReason } = body;
      const validDecisions = ['next_round', 'shortlist', 'hold', 'reject', 'offer', 'schedule_another'];
      if (!decision || !validDecisions.includes(decision)) {
        return NextResponse.json({ error: `Invalid decision. Must be: ${validDecisions.join(', ')}` }, { status: 400, headers: corsHeaders() });
      }

      await db.$executeRawUnsafe(
        `UPDATE "Interview" SET "hrDecision" = $1, "hrDecisionReason" = $2, "hrDecisionById" = $3, "hrDecisionAt" = NOW(), "updatedAt" = NOW() WHERE "id" = $4`,
        decision, decisionReason || null, decoded.userId, id,
      );

      // Update JobApplication status based on decision
      // Phase 12 fix: shortlist should map to 'shortlisted' not 'screening'
      const decisionToAppStatus: Record<string, string> = {
        next_round: 'interview', shortlist: 'shortlisted', hold: 'interview',
        reject: 'rejected', offer: 'offered', schedule_another: 'interview',
      };
      const newAppStatus = decisionToAppStatus[decision] || 'interview';
      try {
        const interviewRow = await db.$queryRawUnsafe(
          `SELECT "jobApplicationId" FROM "Interview" WHERE "id" = $1 LIMIT 1`, id,
        ) as any[];
        if (interviewRow[0]?.jobApplicationId) {
          await db.$executeRawUnsafe(
            `UPDATE "JobApplication" SET "status" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
            newAppStatus, interviewRow[0].jobApplicationId,
          );
        }
      } catch {}

      // Audit log
      await db.auditLog.create({
        data: { userId: decoded.userId as string, action: 'INTERVIEW_HR_DECISION', module: 'recruitment',
          details: `HR decision for interview ${id}: ${decision}${decisionReason ? ` — ${decisionReason}` : ''}` },
      }).catch(() => null);

      return NextResponse.json({ success: true, message: `Decision recorded: ${decision}`, newAppStatus }, { headers: corsHeaders() });
    }

    // ─── Action: PANEL LEAD RECOMMENDATION (pt 18) ────────────────────
    if (action === 'panel_lead_recommendation') {
      const { recommendation, notes } = body;
      const validRecs = ['strong_hire', 'hire', 'hold', 'next_round', 'reject'];
      if (!recommendation || !validRecs.includes(recommendation)) {
        return NextResponse.json({ error: `Invalid recommendation. Must be: ${validRecs.join(', ')}` }, { status: 400, headers: corsHeaders() });
      }

      await db.$executeRawUnsafe(
        `UPDATE "Interview" SET "panelLeadRecommendation" = $1, "panelLeadNotes" = $2, "updatedAt" = NOW() WHERE "id" = $3`,
        recommendation, notes || null, id,
      );

      // Audit log
      await db.auditLog.create({
        data: { userId: decoded.userId as string, action: 'INTERVIEW_PANEL_LEAD_RECOMMENDATION', module: 'recruitment',
          details: `Panel lead recommendation for interview ${id}: ${recommendation}` },
      }).catch(() => null);

      return NextResponse.json({ success: true, message: 'Panel lead recommendation submitted' }, { headers: corsHeaders() });
    }

    // ─── Basic status/feedback update (existing behavior) ─────────────
    const sets: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (status !== undefined) {
      const validStatuses = ['scheduled', 'completed', 'cancelled', 'rescheduled'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` }, { status: 400, headers: corsHeaders() });
      }
      sets.push(`"status" = $${pIdx++}`); params.push(status);
    }
    if (feedback !== undefined) { sets.push(`"feedback" = $${pIdx++}`); params.push(feedback); }
    if (score !== undefined) { sets.push(`"score" = $${pIdx++}`); params.push(Number(score) || null); }
    sets.push(`"updatedAt" = NOW()`);
    params.push(id);

    await db.$executeRawUnsafe(
      `UPDATE "Interview" SET ${sets.join(', ')} WHERE "id" = $${pIdx}`,
      ...params,
    );

    // Audit log
    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: 'UPDATE_INTERVIEW',
        module: 'recruitment',
        details: `Updated interview ${id}: ${status ? `status=${status}` : ''} ${feedback ? `feedback submitted` : ''}`,
      },
    }).catch(() => null);

    return NextResponse.json({ success: true, id, status, feedback, score }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Interviews PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
