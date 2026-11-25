/**
 * POST /api/interviews/[id]/accept-decline
 *
 * Panel member accepts, declines, or requests a different time for an interview.
 *
 * Body:
 *   { action: 'accept' | 'decline' | 'request_reschedule', reason?: string, userId: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { createNotification, sendNotificationEmail } from '@/lib/notifications';
import { sendConfiguredEmail } from '@/lib/configured-email';

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
    const { action, reason, userId } = body;

    if (!userId || !['accept', 'decline', 'request_reschedule'].includes(action)) {
      return NextResponse.json({ error: 'userId and action (accept|decline|request_reschedule) are required' }, { status: 400, headers: corsHeaders() });
    }

    // CRITICAL FIX #7: The userId in the body MUST match the signed-in user's ID.
    // Previously anyone with a valid token could respond on behalf of another user.
    if (decoded.userId !== userId) {
      return NextResponse.json({ error: 'You can only respond to interviews assigned to your own account.' }, { status: 403, headers: corsHeaders() });
    }

    // Phase 9 fix: Decline and reschedule MUST include a reason
    if ((action === 'decline' || action === 'request_reschedule') && (!reason || !reason.trim())) {
      return NextResponse.json({ error: `A reason is required for ${action === 'decline' ? 'declining' : 'requesting a reschedule'}.` }, { status: 400, headers: corsHeaders() });
    }

    // Ensure the InterviewPanelMember table exists
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InterviewPanelMember" (
        "id" TEXT NOT NULL,
        "interviewId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "reason" TEXT,
        "respondedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        CONSTRAINT "InterviewPanelMember_pkey" PRIMARY KEY ("id")
      )`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InterviewPanelMember_interviewId_idx" ON "InterviewPanelMember"("interviewId")`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InterviewPanelMember_userId_idx" ON "InterviewPanelMember"("userId")`);
    } catch {}

    // Check if the panel member record exists
    const existing = await db.$queryRawUnsafe(
      `SELECT "id", "status" FROM "InterviewPanelMember" WHERE "interviewId" = $1 AND "userId" = $2 LIMIT 1`,
      id, userId,
    ) as any[];

    if (existing.length === 0) {
      return NextResponse.json({ error: 'You are not assigned to this interview' }, { status: 404, headers: corsHeaders() });
    }

    const statusMap: Record<string, string> = {
      accept: 'accepted',
      decline: 'declined',
      request_reschedule: 'requested_reschedule',
    };
    const newStatus = statusMap[action];

    await db.$executeRawUnsafe(
      `UPDATE "InterviewPanelMember" SET "status" = $1, "reason" = $2, "respondedAt" = NOW(), "updatedAt" = NOW() WHERE "interviewId" = $3 AND "userId" = $4`,
      newStatus, reason || null, id, userId,
    );

    // ─── PANEL ACCEPTANCE STATUS (dynamic, drives the candidate-mail gate) ───
    // The candidate email is sent ONLY after EVERY panel member has accepted.
    // Until then HR sees "pending X of Y" — e.g. 2 interviewers where 1 has
    // accepted → "pending (1 of 2 accepted)"; a single interviewer accepting
    // → acceptance completed and the candidate is notified immediately.
    const panelRows = await db.$queryRawUnsafe(
      `SELECT "userId", "status" FROM "InterviewPanelMember" WHERE "interviewId" = $1`,
      id,
    ) as any[];
    const totalMembers = panelRows.length;
    const acceptedMembers = panelRows.filter(p => p.status === 'accepted').length;
    const declinedMembers = panelRows.filter(p => p.status === 'declined').length;
    const pendingMembers = totalMembers - acceptedMembers - declinedMembers;
    const allAccepted = totalMembers > 0 && acceptedMembers === totalMembers;

    // Fetch interview + candidate details for notifications
    const interviewRows = await db.$queryRawUnsafe(
      `SELECT i."date", i."time", i."type", i."duration", i."location", i."meetingUrl", i."round", ja."candidateName", ja."candidateEmail", jp."title" AS "jobTitle"
       FROM "Interview" i
       JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
       LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
       WHERE i."id" = $1 LIMIT 1`,
      id,
    ) as any[];
    const interview = interviewRows[0];

    // Candidate notification is sent only when EVERY assigned interviewer has
    // accepted the interview. One pending interviewer = still pending for HR;
    // the candidate hears nothing until panel acceptance is complete.
    if (action === 'accept' && allAccepted && interview?.candidateEmail) {
      try {
        const dateStr = interview.date
          ? new Date(interview.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'TBD';
        const typeLabel = interview.type === 'technical' ? 'Technical Interview'
          : interview.type === 'hr' ? 'HR Interview'
          : interview.type === 'ai' ? 'AI Interview' : 'Panel Interview';
        const round = Number(interview.round || 1);
        const roundLabel = round > 1 ? ` (Round ${round})` : '';
        const modeLabel = interview.location ? `Offline — ${interview.location}` : interview.meetingUrl ? `Online — ${interview.meetingUrl}` : 'TBD';
        // Template-driven confirmation email (Notification Center; admin-editable).
        // The helper internally falls back to tenant SMTP on failure.
        const result = await sendConfiguredEmail({
          db, tenantId: String(decoded.tenantId || ''),
          module: 'recruitment', eventKey: 'recruitment.interview.candidate_decision',
          to: interview.candidateEmail,
          toName: interview.candidateName || undefined,
          vars: {
            Decision: `confirmed${roundLabel} — action required`,
            Reason: `All ${totalMembers} interviewer${totalMembers > 1 ? 's have' : ' has'} accepted your ${interview.jobTitle || 'interview'} interview (Type: ${typeLabel}). You must ACCEPT this interview in your candidate portal to confirm your participation. If you do not accept in time, the interview will be automatically cancelled. You will also receive daily reminders until you accept.`,
            Job_Title: interview.jobTitle || 'interview',
            Interview_Date: dateStr,
            Interview_Time: interview.time || 'TBD',
            Interview_Mode: modeLabel,
            Portal_Url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/candidate-portal/interviews`,
          },
          entityType: 'interview', entityId: interview.id, entityLink: '/candidate-portal/interviews',
          status: 'warning',
        });
        const sent = result.sent;
        const error = result.error || result.skipped || '';
        console.log(`[AcceptDecline] Panel acceptance complete (${acceptedMembers}/${totalMembers}) — candidate interview-confirmed email to ${interview.candidateEmail}: ${sent ? 'SENT' : 'FAILED'} — ${error}`);

        // LOCKED-5: candidate acceptance deadline = interview date − 1 day.
        // The daily cron uses this to auto-cancel interviews the candidate
        // never accepted in the portal.
        await db.$executeRawUnsafe(
          `UPDATE "Interview" SET "confirmationDeadline" = "date" - INTERVAL '1 day' WHERE "id" = $1 AND "confirmationDeadline" IS NULL`,
          id,
        ).catch(() => null);
      } catch (emailErr) {
        console.warn('[AcceptDecline] Candidate confirmation email failed (non-fatal):', emailErr instanceof Error ? emailErr.message : emailErr);
      }
    }

    // Notify HR of the response
    try {
      const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];
      const hrUsers = await db.user.findMany({
        where: { role: { in: HR_ROLES }, status: 'active' },
        select: { id: true, email: true },
      }).catch(() => []);

      const memberName = decoded.name || decoded.email || 'Panel Member';
      const actionLabels: Record<string, string> = {
        accept: 'Accepted',
        decline: 'Declined',
        request_reschedule: 'Requested Reschedule',
      };
      const actionLabel = actionLabels[action] || action;
      // Dynamic acceptance line so HR always knows the exact pending state.
      const acceptanceLine = allAccepted
        ? `Panel acceptance COMPLETED (${acceptedMembers}/${totalMembers} accepted) — candidate has been notified.`
        : `Panel acceptance PENDING: ${acceptedMembers} of ${totalMembers} accepted${pendingMembers > 0 ? `, ${pendingMembers} still pending` : ''}${declinedMembers > 0 ? `, ${declinedMembers} declined` : ''}. Candidate email is held until every interviewer accepts.`;

      for (const hr of hrUsers) {
        const notif = await createNotification({
          tenantId: decoded.tenantId as string,
          userId: hr.id,
          title: `Interview ${actionLabel} (${acceptedMembers}/${totalMembers}): ${interview?.candidateName || 'Candidate'}`,
          message: `${memberName} has ${actionLabel.toLowerCase()} the interview for ${interview?.candidateName || 'the candidate'} (${interview?.jobTitle || 'position'}) on ${interview?.date ? new Date(interview.date).toLocaleDateString() : 'TBD'} at ${interview?.time || 'TBD'}. ${acceptanceLine}${reason ? ` Reason: ${reason}` : ''}`,
          type: action === 'accept' ? 'success' : 'warning',
          category: 'recruitment',
          link: '/interviews',
        }).catch(() => null);

        if (notif?.id && hr.email) {
          await sendNotificationEmail(db, decoded.tenantId as string, notif, hr.email,
            `Interview ${actionLabel} (${acceptedMembers}/${totalMembers}): ${interview?.candidateName || 'Candidate'}`,
            `<p>${memberName} has ${actionLabel.toLowerCase()} the interview assignment.</p><p><strong>${acceptanceLine}</strong></p>${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}`
          ).catch(() => null);
        }
      }
    } catch {}

    // Audit log
    await db.auditLog.create({
      data: {
        userId: decoded.userId as string,
        action: `INTERVIEW_${action.toUpperCase()}`,
        module: 'recruitment',
        details: `Panel member ${decoded.email} ${action}ed interview ${id}${reason ? ` — ${reason}` : ''}`,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      status: newStatus,
      // Dynamic panel-acceptance state — the HR UI renders "pending X of Y"
      // or "acceptance completed" straight from this payload.
      panelAcceptance: {
        accepted: acceptedMembers,
        total: totalMembers,
        pending: pendingMembers,
        declined: declinedMembers,
        allAccepted,
        candidateNotified: action === 'accept' && allAccepted,
      },
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[AcceptDecline] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
