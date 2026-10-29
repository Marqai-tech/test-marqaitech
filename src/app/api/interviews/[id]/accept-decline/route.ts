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
      `SELECT i."date", i."time", i."type", ja."candidateName", jp."title" AS "jobTitle"
       FROM "Interview" i
       JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
       LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
       WHERE i."id" = $1 LIMIT 1`,
      id,
    ) as any[];
    const interview = interviewRows[0];

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
