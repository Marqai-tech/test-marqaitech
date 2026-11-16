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

    // Candidate notification is sent only after an assigned interviewer has
    // accepted the interview. Scheduling itself must not notify the candidate
    // while the panel assignment is still pending confirmation.
    if (action === 'accept' && interview?.candidateEmail) {
      try {
        const { sendEmail } = await import('@/lib/email');
        const { sendTenantEmail } = await import('@/lib/notification-channels');
        const dateStr = interview.date
          ? new Date(interview.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'TBD';
        const typeLabel = interview.type === 'technical' ? 'Technical Interview'
          : interview.type === 'hr' ? 'HR Interview'
          : interview.type === 'ai' ? 'AI Interview' : 'Panel Interview';
        const round = Number(interview.round || 1);
        const roundLabel = round > 1 ? ` (Round ${round})` : '';
        const subject = `Interview Confirmed${roundLabel}: ${interview.candidateName} — ${interview.jobTitle || 'Interview'}`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#4f46e5;">Interview Confirmed${roundLabel}</h2>
          <p>Dear ${interview.candidateName},</p>
          <p>Your interviewer has accepted the <strong>${interview.jobTitle || 'interview'}</strong> interview assignment.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
            ${round > 1 ? `<tr><td style="padding:8px 12px;background:#f1f5f9;font-weight:600;width:35%;">Round</td><td style="padding:8px 12px;">${round}</td></tr>` : ''}
            <tr><td style="padding:8px 12px;background:#f1f5f9;font-weight:600;width:35%;">Date</td><td style="padding:8px 12px;">${dateStr}</td></tr>
            <tr><td style="padding:8px 12px;background:#f1f5f9;font-weight:600;">Time</td><td style="padding:8px 12px;">${interview.time || 'TBD'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f1f5f9;font-weight:600;">Type</td><td style="padding:8px 12px;">${typeLabel}</td></tr>
            <tr><td style="padding:8px 12px;background:#f1f5f9;font-weight:600;">Mode</td><td style="padding:8px 12px;">${interview.location ? `Offline — ${interview.location}` : interview.meetingUrl ? `Online — ${interview.meetingUrl}` : 'TBD'}</td></tr>
          </table>
          ${interview.meetingUrl ? `<p><a href="${interview.meetingUrl}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;">Join Meeting</a></p>` : ''}
          <p>Regards,<br/>HR Team</p>
        </div>`;
        let sent = false;
        let error = '';
        try {
          const result = await sendEmail({ to: interview.candidateEmail, subject, html });
          sent = result.success;
          error = result.error || '';
        } catch (e) { error = e instanceof Error ? e.message : String(e); }
        if (!sent) {
          const fallback = await sendTenantEmail(db, String(decoded.tenantId || ''), { to: interview.candidateEmail, subject, html });
          sent = fallback.success;
          error = error || fallback.error || '';
        }
        console.log(`[AcceptDecline] Candidate interview-confirmed email to ${interview.candidateEmail}: ${sent ? 'SENT' : 'FAILED'} — ${error}`);
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

      for (const hr of hrUsers) {
        const notif = await createNotification({
          tenantId: decoded.tenantId as string,
          userId: hr.id,
          title: `Interview ${actionLabel}: ${interview?.candidateName || 'Candidate'}`,
          message: `${memberName} has ${actionLabel.toLowerCase()} the interview for ${interview?.candidateName || 'the candidate'} (${interview?.jobTitle || 'position'}) on ${interview?.date ? new Date(interview.date).toLocaleDateString() : 'TBD'} at ${interview?.time || 'TBD'}.${reason ? ` Reason: ${reason}` : ''}`,
          type: action === 'accept' ? 'success' : 'warning',
          category: 'recruitment',
          link: '/recruitment',
        }).catch(() => null);

        if (notif?.id && hr.email) {
          await sendNotificationEmail(db, decoded.tenantId as string, notif, hr.email,
            `Interview ${actionLabel}: ${interview?.candidateName || 'Candidate'}`,
            `<p>${memberName} has ${actionLabel.toLowerCase()} the interview assignment.</p>${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}`
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

    return NextResponse.json({ success: true, status: newStatus }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[AcceptDecline] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
