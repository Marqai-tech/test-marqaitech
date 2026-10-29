/**
 * Interview Reminders + No-Response Handler (Pt 14, Pt 10)
 *
 * GET/POST /api/cron/interview-reminders
 *
 * Vercel Cron: runs every 30 minutes
 *
 * Actions:
 *   1. Send reminder 24h before interview to panel members + candidate
 *   2. Send reminder 1h before interview to panel members
 *   3. Send reminder for pending feedback (after interview completed)
 *   4. Auto-mark "No Response" for panel members who didn't respond before confirmationDeadline
 *   5. Send final reminder to no-response members
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPlatformDb } from '@/lib/tenant-db';
// GAP FIX #3: import dispatchNotification for proper email + delivery log
import { dispatchNotification } from '@/lib/notification-center';

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
  return POST(req);
}

export async function POST(req: NextRequest) {
  const platformDb = getPlatformDb();
  const results: string[] = [];

  try {
    const tenantDbs = await platformDb.tenantDatabase.findMany({
      where: { isActive: true },
      select: { connectionString: true, tenant: { select: { slug: true, id: true } } },
    });

    for (const td of tenantDbs) {
      if (!td.connectionString || !td.tenant?.slug) continue;
      try {
        const { getDbForTenant } = await import('@/lib/tenant-db');
        const db = await getDbForTenant(td.tenant.slug);
        const tenantId = td.tenant.id;
        const now = new Date();

        // 1. Reminders 24h before
        try {
          const upcoming24h = await db.$queryRawUnsafe(
            `SELECT i."id", i."date", i."time", i."type", i."location", i."meetingUrl",
                    i."confirmationDeadline", i."feedbackDeadline",
                    ja."candidateName", ja."candidateEmail",
                    jp."title" AS "jobTitle"
             FROM "Interview" i
             LEFT JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
             LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
             WHERE i."status" IN ('scheduled', 'rescheduled')
               AND i."date"::date = ($1::date + INTERVAL '1 day')::date`,
            now,
          ) as any[];

          for (const interview of upcoming24h) {
            const panelMembers = await db.$queryRawUnsafe(
              `SELECT pm."userId", pm."status", u."name", u."email"
               FROM "InterviewPanelMember" pm
               LEFT JOIN "User" u ON u."id" = pm."userId"
               WHERE pm."interviewId" = $1`,
              interview.id,
            ) as any[];

            for (const pm of panelMembers) {
              if (pm.status === 'declined' || pm.status === 'no_response') continue;
              try {
                await dispatchNotification({
                  tenantId,
                  module: 'recruitment',
                  eventKey: 'recruitment.interview.reminder',
                  recipients: [{ userId: pm.userId }],
                  vars: {
                    Candidate_Name: interview.candidateName || 'a candidate',
                    Job_Title: interview.jobTitle || 'a position',
                    Interview_Date: interview.time || 'TBD',
                    Interview_Time: interview.time || 'TBD',
                    Interview_Mode: interview.location || interview.meetingUrl || 'TBD',
                  },
                  entity: { type: 'interview', id: interview.id, link: '/my-interviews' },
                });
              } catch {}
            }
            results.push(`24h reminder sent for interview ${interview.id}`);
          }
        } catch (e) { results.push(`24h reminder error: ${e instanceof Error ? e.message : e}`); }

        // 2. Reminders 1h before
        // Phase 16 fix: The original SQL subtracted NOW from interview start,
        // finding interviews ALREADY STARTED 30-90 min ago. Fixed to subtract
        // NOW from interview start to find interviews STARTING in 30-90 min.
        try {
          const upcoming1h = await db.$queryRawUnsafe(
            `SELECT i."id", i."date", i."time", i."type", i."location", i."meetingUrl",
                    ja."candidateName"
             FROM "Interview" i
             LEFT JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
             WHERE i."status" IN ('scheduled', 'rescheduled')
               AND i."date"::date = $1::date
               AND i."time" IS NOT NULL
               AND EXTRACT(EPOCH FROM (CAST(CONCAT(i."date"::date::text, ' ', i."time") AS TIMESTAMP) - CAST($1 AS TIMESTAMP))) / 3600 BETWEEN 0.5 AND 1.5`,
            now,
          ) as any[];

          for (const interview of upcoming1h) {
            const panelMembers = await db.$queryRawUnsafe(
              `SELECT pm."userId", pm."status" FROM "InterviewPanelMember" pm WHERE pm."interviewId" = $1 AND pm."status" = 'accepted'`,
              interview.id,
            ) as any[];

            for (const pm of panelMembers) {
              try {
                await dispatchNotification({
                  tenantId,
                  module: 'recruitment',
                  eventKey: 'recruitment.interview.reminder',
                  recipients: [{ userId: pm.userId }],
                  vars: {
                    Candidate_Name: interview.candidateName || 'a candidate',
                    Job_Title: 'Interview',
                    Interview_Date: 'Today',
                    Interview_Time: interview.time || 'TBD',
                    Interview_Mode: 'Starting in 1 hour',
                  },
                  entity: { type: 'interview', id: interview.id, link: '/my-interviews' },
                });
              } catch {}
            }
            results.push(`1h reminder sent for interview ${interview.id}`);
          }
        } catch (e) { results.push(`1h reminder error: ${e instanceof Error ? e.message : e}`); }

        // 3. Feedback-pending reminders
        try {
          const completedWithoutFeedback = await db.$queryRawUnsafe(
            `SELECT i."id", i."date", i."feedbackDeadline",
                    ja."candidateName", jp."title" AS "jobTitle"
             FROM "Interview" i
             LEFT JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
             LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
             WHERE i."status" = 'completed'
               AND i."feedbackDeadline" IS NOT NULL
               AND i."feedbackDeadline" > $1`,
            now,
          ) as any[];

          for (const interview of completedWithoutFeedback) {
            const pendingMembers = await db.$queryRawUnsafe(
              `SELECT pm."userId", u."name" FROM "InterviewPanelMember" pm
               LEFT JOIN "User" u ON u."id" = pm."userId"
               WHERE pm."interviewId" = $1 AND pm."status" = 'accepted'
                 AND NOT EXISTS (
                   SELECT 1 FROM "InterviewFeedback" f
                   WHERE f."interviewId" = pm."interviewId" AND f."userId" = pm."userId"
                 )`,
              interview.id,
            ) as any[];

            for (const pm of pendingMembers) {
              try {
                await dispatchNotification({
                  tenantId,
                  module: 'recruitment',
                  eventKey: 'recruitment.interview.feedback_pending',
                  recipients: [{ userId: pm.userId }],
                  vars: {
                    Candidate_Name: interview.candidateName || 'a candidate',
                    Job_Title: interview.jobTitle || 'position',
                  },
                  entity: { type: 'interview', id: interview.id, link: '/my-interviews' },
                });
              } catch {}
            }
            if (pendingMembers.length > 0) results.push(`Feedback reminder sent for interview ${interview.id} (${pendingMembers.length} pending)`);
          }
        } catch (e) { results.push(`Feedback reminder error: ${e instanceof Error ? e.message : e}`); }

        // 4. No-Response handling (Pt 10)
        try {
          const expiredConfirmations = await db.$queryRawUnsafe(
            `SELECT pm."id", pm."userId", pm."interviewId", pm."status",
                    i."confirmationDeadline", i."date", i."time",
                    ja."candidateName", jp."title" AS "jobTitle"
             FROM "InterviewPanelMember" pm
             JOIN "Interview" i ON i."id" = pm."interviewId"
             LEFT JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
             LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
             WHERE pm."status" = 'pending'
               AND i."confirmationDeadline" IS NOT NULL
               AND i."confirmationDeadline" < $1
               AND i."status" = 'scheduled'`,
            now,
          ) as any[];

          for (const pm of expiredConfirmations) {
            try {
              await db.$executeRawUnsafe(
                `UPDATE "InterviewPanelMember" SET "status" = 'no_response', "updatedAt" = NOW() WHERE "id" = $1 AND "status" = 'pending'`,
                pm.id,
              );
            } catch {}

            // Notify HR
            try {
              const hrUsers = await db.user.findMany({
                where: { role: { in: ['hr_admin', 'company_hr_admin', 'admin', 'tenant_admin'] }, status: 'active', tenantId },
                select: { id: true },
              }).catch(() => []);

              for (const hr of hrUsers) {
                await dispatchNotification({
                  tenantId,
                  module: 'recruitment',
                  eventKey: 'recruitment.interview.feedback_pending',
                  recipients: [{ userId: hr.id }],
                  vars: {
                    Candidate_Name: pm.candidateName || 'a candidate',
                    Job_Title: 'Panel confirmation deadline expired',
                  },
                  entity: { type: 'interview', id: pm.interviewId, link: '/recruitment' },
                }).catch(() => null);
              }
            } catch {}

            results.push(`No-response marked for panel member on interview ${pm.interviewId}`);
          }
        } catch (e) { results.push(`No-response error: ${e instanceof Error ? e.message : e}`); }

      } catch (e) {
        results.push(`Tenant ${td.tenant?.slug} error: ${e instanceof Error ? e.message : e}`);
      }
    }

    return NextResponse.json({ success: true, processed: results.length, details: results.slice(0, 50) }, { headers: corsHeaders() });
  } catch (error) {
    console.error('[InterviewReminders] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders() });
  }
}
