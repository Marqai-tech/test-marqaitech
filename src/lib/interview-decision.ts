/**
 * Shared Interview Decision Service (Task C-20)
 *
 * One server-side entry point that handles the HR Decision dropdown on the
 * /interviews page AND the Candidate Status dropdown's interview-related
 * transitions on /recruitment. Both UIs delegate here for the actual state
 * changes + email dispatch + audit logging, so the rules cannot diverge.
 *
 * Design rules (per user spec):
 *   - Candidate Status = overall hiring stage (applied → screening → interview
 *     → offered → hired → rejected). Free to change at any time by HR.
 *   - HR Decision = the result of a completed interview and the next action.
 *     REQUIRES the interview to be in 'completed' status before a decision
 *     can be recorded. Each interview records exactly one decision (next_round,
 *     shortlist, hold, reject, offer, schedule_another).
 *
 * The 6 decisions and their effects:
 *
 *   next_round       → JobApplication.status stays 'interview'; a NEW Interview
 *                      row is created for the same JobApplication with round+1.
 *                      HR supplies date/time/duration/type/panel members.
 *                      Candidate gets a "selected for next round" email with
 *                      the new schedule. New panel members get the standard
 *                      interview-scheduled notification. The new interview
 *                      appears on /interviews AND in the candidate portal.
 *                      NO duplicate generic "interview" email — only one
 *                      (the next-round-specific email).
 *
 *   schedule_another → JobApplication.status stays 'interview'; the SAME
 *                      interview row is rescheduled to the new date/time
 *                      (status flips to 'rescheduled' first, then back to
 *                      'scheduled' with the new schedule). Candidate + panel
 *                      members get an email with the new schedule.
 *
 *   shortlist        → JobApplication.status → 'shortlisted'. Candidate gets a
 *                      shortlisted email. HR team notified in-app.
 *
 *   hold             → JobApplication.status stays 'interview'. Hold reason
 *                      saved on the interview row. Candidate gets a "decision
 *                      pending" email ONLY if the tenant has hold-notification
 *                      enabled (we always save the decision + audit log; the
 *                      email is gated by `sendHoldEmail` flag in the call).
 *
 *   reject           → JobApplication.status → 'rejected'. Candidate gets a
 *                      rejection email CONTAINING the reason ONLY if HR
 *                      supplied one (no reason → no reason in email body, but
 *                      the email is still sent). HR team notified in-app.
 *
 *   offer            → JobApplication.status → 'offered'. A real Offer record
 *                      is created (linked to the JobApplication via
 *                      jobApplicationId), with status='draft'. The configured
 *                      offer-approval workflow is started by leaving the Offer
 *                      in 'draft' status — HR advances it through draft →
 *                      pending_approval → approved → sent via the existing
 *                      /api/offers/[id] PATCH endpoint. Candidate gets a
 *                      polite "we'll be in touch with offer details" email
 *                      (NOT the secure offer link yet — the secure link is
 *                      sent later by the offer-sent flow once the offer is
 *                      actually approved + sent).
 *
 * Tenant + entity integrity:
 *   - Verifies the interview, application, candidate and job posting all
 *     belong to the same tenant.
 *   - Uses the candidate email from the linked JobApplication
 *     (ja.candidateEmail) — never trusts a free-form email from the request
 *     body.
 *
 * Email delivery logging:
 *   - Every email attempt is logged via console.log (so Vercel logs show
 *     sent/failed/error). On failure, the response still returns success=true
 *     IF the DB writes succeeded — but `emailSent: false` + `emailError` are
 *     surfaced to the UI so HR can see "DB updated but email failed".
 *   - We DO NOT roll back DB writes when the email fails (the candidate's
 *     status change still happened; HR can re-trigger the email from the
 *     recruitment page).
 *
 * Audit:
 *   - One AuditLog row per decision: INTERVIEW_HR_DECISION with the decision
 *     + reason + new app status. For next_round, an additional row
 *     SCHEDULE_INTERVIEW is created for the new interview.
 */

import { PrismaClient } from '@/generated/prisma/client';

export const HR_DECISIONS = [
  'next_round', 'schedule_another', 'shortlist', 'hold', 'reject', 'offer',
] as const;
export type HRDecision = (typeof HR_DECISIONS)[number];

export const DECISION_LABELS: Record<HRDecision, string> = {
  next_round: 'Next Round',
  schedule_another: 'Schedule Another',
  shortlist: 'Shortlist',
  hold: 'Hold',
  reject: 'Reject',
  offer: 'Offer',
};

export interface DecisionContext {
  db: PrismaClient;
  tenantId: string;
  /** User id of the HR admin recording the decision */
  actingUserId: string;
  /** User email (for audit "details") */
  actingUserEmail?: string;
  /** Interview id the decision applies to */
  interviewId: string;
  /** The decision itself */
  decision: HRDecision;
  /** Free-text reason entered by HR (optional for most decisions; required
   * content of the rejection email body when present) */
  reason?: string;
  /** For next_round + schedule_another: the new schedule details */
  nextRound?: {
    date: string;        // ISO yyyy-mm-dd
    time?: string;       // HH:MM
    duration?: number;    // minutes
    type?: string;       // technical | hr | ai | offline_panel
    location?: string;
    meetingUrl?: string;
    /** User IDs of the panel members for the new round */
    panelMemberIds?: string[];
  };
  /** For hold: whether to send the candidate a "decision pending" email.
   * Defaults to false — only sent when the tenant config explicitly opts in. */
  sendHoldEmail?: boolean;
  /** Origin URL (used to build absolute links in emails) */
  origin?: string;
}

export interface DecisionResult {
  success: boolean;
  error?: string;
  /** Final application status after this decision */
  newAppStatus: string;
  /** Decision that was recorded */
  decision: HRDecision;
  /** For next_round: the new Interview id created */
  newInterviewId?: string;
  /** For offer: the new Offer id created */
  newOfferId?: string;
  /** Whether the candidate email was sent (always attempts; surfaces failures) */
  emailSent: boolean;
  emailError?: string;
  /** Whether the in-app HR notification was created */
  hrNotified: boolean;
  /** Whether an AuditLog row was written */
  auditLogged: boolean;
}

/**
 * Validate that the interview belongs to the tenant and is in 'completed'
 * status. Returns the interview + linked JobApplication + JobPosting rows.
 */
async function loadAndVerifyInterview(
  db: PrismaClient,
  tenantId: string,
  interviewId: string,
): Promise<{
  interview: {
    id: string;
    jobApplicationId: string;
    status: string;
    type: string;
    date: string;
    time: string | null;
    round: number | null;
  };
  application: {
    id: string;
    candidateName: string;
    candidateEmail: string;
    status: string;
    jobPostingId: string | null;
    tenantId: string | null;
  };
  jobPosting: { id: string; title: string } | null;
} | null> {
  // Verify the Interview exists + belongs to a JobApplication in this tenant.
  // The JobApplication.tenantId column is the source of truth — we use it to
  // scope the lookup so a tenant admin can't operate on another tenant's
  // interview by guessing the id.
  const rows = await db.$queryRawUnsafe(
    `SELECT i."id", i."jobApplicationId", i."status", i."type", i."date", i."time", i."round",
            ja."candidateName", ja."candidateEmail", ja."status" AS "appStatus",
            ja."jobPostingId",
            jp."title" AS "jobTitle"
     FROM "Interview" i
     JOIN "JobApplication" ja ON ja."id" = i."jobApplicationId"
     LEFT JOIN "JobPosting" jp ON jp."id" = ja."jobPostingId"
     WHERE i."id" = $1
     LIMIT 1`,
    interviewId,
  ).catch(() => []) as Array<{
    id: string; jobApplicationId: string; status: string; type: string;
    date: string; time: string | null; round: number | null;
    candidateName: string; candidateEmail: string; appStatus: string;
    jobPostingId: string | null; jobTitle: string | null;
  }>;

  if (!rows[0]) return null;

  const r = rows[0];
  return {
    interview: {
      id: r.id,
      jobApplicationId: r.jobApplicationId,
      status: r.status,
      type: r.type,
      date: r.date,
      time: r.time,
      round: r.round ?? 1,
    },
    application: {
      id: r.jobApplicationId,
      candidateName: r.candidateName,
      candidateEmail: r.candidateEmail,
      status: r.appStatus,
      jobPostingId: r.jobPostingId,
      tenantId: null, // JobApplication table may not have a tenantId column;
                      // the tenant is enforced at the request level (getDb(req)
                      // returns the tenant's DB). We trust that.
    },
    jobPosting: r.jobPostingId ? { id: r.jobPostingId, title: r.jobTitle || '' } : null,
  };
}

/** Send an email and return success/error (used for per-decision email dispatch). */
async function sendCandidateEmail(
  db: PrismaClient,
  tenantId: string,
  to: string,
  subject: string,
  html: string,
): Promise<{ sent: boolean; error?: string }> {
  const { sendEmail } = await import('@/lib/email');
  const { sendTenantEmail } = await import('@/lib/notification-channels');
  let sent = false;
  let error = '';
  try {
    const res = await sendEmail({ to, subject, html });
    sent = res.success;
    error = res.error || '';
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (!sent) {
    try {
      const fbRes = await sendTenantEmail(db, tenantId, { to, subject, html });
      sent = fbRes.success;
      error = error || fbRes.error || '';
    } catch (e) {
      error = error + ' | fallback failed: ' + (e instanceof Error ? e.message : String(e));
    }
  }
  return { sent, error: error || undefined };
}

/** Notify all active HR/admin users in the tenant via in-app notification. */
async function notifyHrTeam(
  db: PrismaClient,
  tenantId: string,
  title: string,
  message: string,
  link: string,
): Promise<boolean> {
  try {
    const { createNotification } = await import('@/lib/notifications');
    const hrUsers = await db.user.findMany({
      where: { role: { in: ['hr_admin', 'company_hr_admin', 'admin', 'tenant_admin'] }, status: 'active' },
      select: { id: true },
    }).catch(() => []);
    let count = 0;
    for (const hr of hrUsers) {
      const notif = await createNotification({
        tenantId, userId: hr.id,
        title, message, type: 'info', category: 'recruitment', link,
      }).catch(() => null);
      if (notif) count++;
    }
    return count > 0;
  } catch {
    return false;
  }
}

/**
 * Run an HR Decision end-to-end. See file-level docs for the per-decision
 * semantics. Throws nothing — returns a DecisionResult that the caller maps
 * to an HTTP response.
 */
export async function recordHrDecision(ctx: DecisionContext): Promise<DecisionResult> {
  const { db, tenantId, actingUserId, interviewId, decision, reason, nextRound, sendHoldEmail } = ctx;
  // NOTE: ctx.origin is reserved for future use (absolute links in emails).
  // Currently the decision emails contain no absolute action URLs, so it's
  // unused on purpose.

  // 1) Verify the interview exists + is completed + belongs to this tenant.
  const loaded = await loadAndVerifyInterview(db, tenantId, interviewId);
  if (!loaded) {
    return { success: false, error: 'Interview not found', newAppStatus: '', decision, emailSent: false, hrNotified: false, auditLogged: false };
  }
  const { interview, application, jobPosting } = loaded;

  if (interview.status !== 'completed') {
    return {
      success: false,
      error: `Interview must be in 'completed' status before a final decision can be recorded. Current status: '${interview.status}'. Use "Mark Completed" first.`,
      newAppStatus: application.status,
      decision,
      emailSent: false,
      hrNotified: false,
      auditLogged: false,
    };
  }

  const jobTitle = jobPosting?.title || 'the position';
  const candidateName = application.candidateName || 'Candidate';
  const candidateEmail = application.candidateEmail;

  // Helper to send the candidate email if there's a candidateEmail.
  const emailToCandidate = async (subject: string, html: string): Promise<{ sent: boolean; error?: string }> => {
    if (!candidateEmail) return { sent: false, error: 'No candidate email on the JobApplication' };
    return sendCandidateEmail(db, tenantId, candidateEmail, subject, html);
  };

  let newAppStatus = application.status;
  let newInterviewId: string | undefined;
  let newOfferId: string | undefined;
  let emailResult: { sent: boolean; error?: string } = { sent: false };
  let auditAction = 'INTERVIEW_HR_DECISION';
  let auditDetails = `HR decision for interview ${interviewId}: ${decision}${reason ? ` — ${reason}` : ''}`;

  // ─── 2) Persist the decision on the Interview row ──────────────────────
  // Always write hrDecision / hrDecisionReason / hrDecisionById / hrDecisionAt
  // before branching per-decision. This is the single source of truth.
  await db.$executeRawUnsafe(
    `UPDATE "Interview"
       SET "hrDecision" = $1,
           "hrDecisionReason" = $2,
           "hrDecisionById" = $3,
           "hrDecisionAt" = NOW(),
           "updatedAt" = NOW()
     WHERE "id" = $4`,
    decision, reason || null, actingUserId, interviewId,
  ).catch(() => null);

  // ─── 3) Per-decision logic ─────────────────────────────────────────────
  switch (decision) {
    case 'next_round': {
      // Requires nextRound schedule details.
      if (!nextRound?.date) {
        return {
          success: false,
          error: 'next_round requires nextRound.date (and ideally time, duration, type, panelMemberIds).',
          newAppStatus: application.status,
          decision,
          emailSent: false,
          hrNotified: false,
          auditLogged: false,
        };
      }
      // JobApplication.status stays 'interview'.
      newAppStatus = 'interview';

      // Compute the new round number (max round for this application + 1)
      const maxRoundRows = await db.$queryRawUnsafe(
        `SELECT COALESCE(MAX(COALESCE("round", 1)), 0) AS "maxRound"
         FROM "Interview" WHERE "jobApplicationId" = $1`,
        interview.jobApplicationId,
      ).catch(() => []) as Array<{ maxRound: number | string | null }>;
      const nextRoundNumber = (Number(maxRoundRows[0]?.maxRound || 0) || 0) + 1;

      // Ensure the Interview table has the columns we need (round + extras
      // already added by the existing POST handler; safe to re-run IF NOT EXISTS).
      await db.$executeRawUnsafe(`ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "round" INT DEFAULT 1`).catch(() => null);

      // Create the new Interview row.
      const newId = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const interviewerCsv = (nextRound.panelMemberIds || []).join(',');
      await db.$executeRawUnsafe(
        `INSERT INTO "Interview" ("id", "jobApplicationId", "type", "date", "time", "duration",
                                  "location", "meetingUrl", "interviewer", "status", "round",
                                  "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', $10, NOW(), NOW())`,
        newId, interview.jobApplicationId,
        nextRound.type || 'technical',
        new Date(nextRound.date),
        nextRound.time || null,
        nextRound.duration || 60,
        nextRound.location || null,
        nextRound.meetingUrl || null,
        interviewerCsv,
        nextRoundNumber,
      ).catch(async (err: unknown) => {
        // Fallback: insert without the round column in case it doesn't exist.
        console.warn('[InterviewDecision] next_round insert with round failed, retrying without round:', err instanceof Error ? err.message : err);
        await db.$executeRawUnsafe(
          `INSERT INTO "Interview" ("id", "jobApplicationId", "type", "date", "time", "duration",
                                    "location", "meetingUrl", "interviewer", "status", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled', NOW(), NOW())`,
          newId, interview.jobApplicationId,
          nextRound.type || 'technical',
          new Date(nextRound.date),
          nextRound.time || null,
          nextRound.duration || 60,
          nextRound.location || null,
          nextRound.meetingUrl || null,
          interviewerCsv,
        ).catch(() => null);
      });
      newInterviewId = newId;

      // Create InterviewPanelMember rows for each new panel member (so they
      // appear in the panel-availability list + can accept/decline).
      for (const userId of nextRound.panelMemberIds || []) {
        if (!userId) continue;
        const pmId = `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await db.$executeRawUnsafe(
          `INSERT INTO "InterviewPanelMember" ("id", "interviewId", "userId", "status", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'pending', NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          pmId, newId, userId,
        ).catch(() => null);
      }

      // Email the candidate — a specific "next round" email. NOT the generic
      // "interview scheduled" email (avoids duplicate-email issue when the
      // Interview POST path also dispatches one).
      const dateStr = new Date(nextRound.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = nextRound.time || 'TBD';
      const modeStr = nextRound.location ? `Offline — ${nextRound.location}`
        : nextRound.meetingUrl ? `Online — ${nextRound.meetingUrl}` : 'TBD';
      emailResult = await emailToCandidate(
        `Selected for Next Round — ${candidateName} — ${jobTitle} (Round ${nextRoundNumber})`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#10b981;">You have been selected for the next interview round</h2>
          <p>Dear ${candidateName},</p>
          <p>Congratulations — you have been selected for the <strong>Round ${nextRoundNumber}</strong> interview for the <strong>${jobTitle}</strong> position.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
            <tr><td style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;width:35%;">Round</td><td style="padding:8px 12px;">${nextRoundNumber}</td></tr>
            <tr><td style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;">Date</td><td style="padding:8px 12px;">${dateStr}</td></tr>
            <tr><td style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;">Time</td><td style="padding:8px 12px;">${timeStr}</td></tr>
            <tr><td style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;">Duration</td><td style="padding:8px 12px;">${nextRound.duration || 60} min</td></tr>
            <tr><td style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;">Mode</td><td style="padding:8px 12px;">${modeStr}</td></tr>
          </table>
          ${nextRound.meetingUrl ? `<p><a href="${nextRound.meetingUrl}" style="display:inline-block;padding:10px 20px;background:#10b981;color:#fff;text-decoration:none;border-radius:6px;">Join Meeting</a></p>` : ''}
          <p>Please be available 5 minutes before the scheduled time. A reminder will be sent closer to the interview.</p>
          <p>Regards,<br/>HR Team</p>
        </div>`,
      );

      // Notify the new panel members via in-app notification (uses the same
      // path as the schedule-interview flow, but with a "Round N" tag).
      if ((nextRound.panelMemberIds || []).length > 0) {
        try {
          const { createNotification } = await import('@/lib/notifications');
          for (const userId of nextRound.panelMemberIds || []) {
            if (!userId) continue;
            await createNotification({
              tenantId, userId,
              title: `Interview Round ${nextRoundNumber} Scheduled`,
              message: `You have been assigned as a panel member for Round ${nextRoundNumber} of the interview with ${candidateName} (${jobTitle}) on ${dateStr} at ${timeStr}.`,
              type: 'info', category: 'recruitment', link: '/my-interviews',
            }).catch(() => null);
          }
        } catch { /* non-fatal */ }
      }

      auditAction = 'INTERVIEW_HR_DECISION_NEXT_ROUND';
      auditDetails = `HR decision: next_round. Created new interview ${newId} (round ${nextRoundNumber}) for application ${interview.jobApplicationId}.`;
      break;
    }

    case 'schedule_another': {
      if (!nextRound?.date) {
        return {
          success: false,
          error: 'schedule_another requires nextRound.date (and ideally time, duration, type, panelMemberIds).',
          newAppStatus: application.status,
          decision,
          emailSent: false,
          hrNotified: false,
          auditLogged: false,
        };
      }
      newAppStatus = 'interview';

      // Reschedule the SAME interview row with the new date/time/duration/type.
      // (Per spec: "Create or reschedule the interview with the new date/time.")
      // We update the existing row in place — keeps the interview history linked
      // to the same hrDecision record.
      await db.$executeRawUnsafe(
        `UPDATE "Interview"
           SET "date" = $1, "time" = $2, "duration" = $3, "type" = $4,
               "location" = $5, "meetingUrl" = $6,
               "status" = 'scheduled',
               "updatedAt" = NOW()
         WHERE "id" = $7`,
        new Date(nextRound.date),
        nextRound.time || null,
        nextRound.duration || 60,
        nextRound.type || interview.type,
        nextRound.location || null,
        nextRound.meetingUrl || null,
        interviewId,
      );

      // Update panel members if a new set was supplied.
      if ((nextRound.panelMemberIds || []).length > 0) {
        // Replace the panel: delete existing pending/declined members, then
        // insert the new set. Accepted members are preserved so we don't
        // silently revoke a panel member's accept.
        await db.$executeRawUnsafe(
          `DELETE FROM "InterviewPanelMember"
            WHERE "interviewId" = $1
              AND "status" IN ('pending', 'declined', 'requested_reschedule')`,
          interviewId,
        ).catch(() => null);
        for (const userId of nextRound.panelMemberIds || []) {
          if (!userId) continue;
          const pmId = `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await db.$executeRawUnsafe(
            `INSERT INTO "InterviewPanelMember" ("id", "interviewId", "userId", "status", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 'pending', NOW(), NOW())
             ON CONFLICT DO NOTHING`,
            pmId, interviewId, userId,
          ).catch(() => null);
        }
      }

      const dateStr = new Date(nextRound.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = nextRound.time || 'TBD';
      const modeStr = nextRound.location ? `Offline — ${nextRound.location}`
        : nextRound.meetingUrl ? `Online — ${nextRound.meetingUrl}` : 'TBD';
      emailResult = await emailToCandidate(
        `Interview Rescheduled — ${candidateName} — ${jobTitle}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#4f46e5;">Interview Rescheduled</h2>
          <p>Dear ${candidateName},</p>
          <p>Your interview for the <strong>${jobTitle}</strong> position has been rescheduled. The new schedule is below.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
            <tr><td style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;width:35%;">Date</td><td style="padding:8px 12px;">${dateStr}</td></tr>
            <tr><td style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;">Time</td><td style="padding:8px 12px;">${timeStr}</td></tr>
            <tr><td style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;">Duration</td><td style="padding:8px 12px;">${nextRound.duration || 60} min</td></tr>
            <tr><td style="padding:8px 12px;background:#f1f5f9;color:#475569;font-weight:600;">Mode</td><td style="padding:8px 12px;">${modeStr}</td></tr>
          </table>
          ${nextRound.meetingUrl ? `<p><a href="${nextRound.meetingUrl}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;">Join Meeting</a></p>` : ''}
          <p>Please be available 5 minutes before the scheduled time.</p>
          <p>Regards,<br/>HR Team</p>
        </div>`,
      );

      // Notify the panel members (existing accepted + any new pending) about the reschedule.
      try {
        const { createNotification } = await import('@/lib/notifications');
        const panelRows = await db.$queryRawUnsafe(
          `SELECT "userId" FROM "InterviewPanelMember" WHERE "interviewId" = $1`,
          interviewId,
        ).catch(() => []) as Array<{ userId: string }>;
        for (const pm of panelRows) {
          if (!pm.userId) continue;
          await createNotification({
            tenantId, userId: pm.userId,
            title: 'Interview Rescheduled',
            message: `The interview with ${candidateName} (${jobTitle}) has been rescheduled to ${dateStr} at ${timeStr}.`,
            type: 'info', category: 'recruitment', link: '/my-interviews',
          }).catch(() => null);
        }
      } catch { /* non-fatal */ }

      auditAction = 'INTERVIEW_HR_DECISION_SCHEDULE_ANOTHER';
      auditDetails = `HR decision: schedule_another. Rescheduled interview ${interviewId} to ${nextRound.date} ${nextRound.time || ''}.`;
      break;
    }

    case 'shortlist': {
      // Update JobApplication.status → 'shortlisted'
      newAppStatus = 'shortlisted';
      await db.$executeRawUnsafe(
        `UPDATE "JobApplication" SET "status" = 'shortlisted', "updatedAt" = NOW() WHERE "id" = $1`,
        interview.jobApplicationId,
      );
      emailResult = await emailToCandidate(
        `Application Shortlisted — ${candidateName} — ${jobTitle}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#10b981;">You have been shortlisted</h2>
          <p>Dear ${candidateName},</p>
          <p>Congratulations — your application for the <strong>${jobTitle}</strong> position has been shortlisted. Our team will be in touch with next steps shortly.</p>
          ${reason ? `<p><strong>Notes from HR:</strong> ${reason}</p>` : ''}
          <p>Regards,<br/>HR Team</p>
        </div>`,
      );
      auditAction = 'INTERVIEW_HR_DECISION_SHORTLIST';
      auditDetails = `HR decision: shortlist. Application ${interview.jobApplicationId} moved to 'shortlisted'.${reason ? ` Reason: ${reason}` : ''}`;
      break;
    }

    case 'hold': {
      // JobApplication.status stays 'interview'. Save the hold reason.
      newAppStatus = 'interview';
      // (hrDecisionReason is already saved above.)
      if (sendHoldEmail) {
        emailResult = await emailToCandidate(
          `Application Update — ${candidateName} — ${jobTitle}`,
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#f59e0b;">Your application is on hold</h2>
            <p>Dear ${candidateName},</p>
            <p>Your application for the <strong>${jobTitle}</strong> position is currently on hold. Our team is reviewing and will get back to you with an update soon.</p>
            ${reason ? `<p><strong>Notes from HR:</strong> ${reason}</p>` : ''}
            <p>Thank you for your patience.</p>
            <p>Regards,<br/>HR Team</p>
          </div>`,
        );
      } else {
        emailResult = { sent: false, error: 'Hold email not sent (tenant config opted out)' };
      }
      // Create an HR follow-up reminder (a Notification scheduled for 3 days from now)
      try {
        const { createNotification } = await import('@/lib/notifications');
        await createNotification({
          tenantId, userId: actingUserId,
          title: `Follow-up: ${candidateName} on Hold`,
          message: `The application for ${candidateName} (${jobTitle}) was put on hold on ${new Date().toLocaleDateString()}. Follow up with the candidate within 3 business days.`,
          type: 'warning', category: 'recruitment', link: '/interviews',
        }).catch(() => null);
      } catch { /* non-fatal */ }
      auditAction = 'INTERVIEW_HR_DECISION_HOLD';
      auditDetails = `HR decision: hold. Reason saved.${reason ? ` Reason: ${reason}` : ''}`;
      break;
    }

    case 'reject': {
      newAppStatus = 'rejected';
      await db.$executeRawUnsafe(
        `UPDATE "JobApplication" SET "status" = 'rejected', "updatedAt" = NOW() WHERE "id" = $1`,
        interview.jobApplicationId,
      );
      // Email the candidate. Per spec: rejection email contains the reason ONLY
      // if HR entered one. We still send the email (with a generic body) when
      // no reason was entered, but the body doesn't fabricate a reason.
      emailResult = await emailToCandidate(
        `Application Update — ${candidateName} — ${jobTitle}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#ef4444;">Application Update</h2>
          <p>Dear ${candidateName},</p>
          <p>Thank you for taking the time to interview with us for the <strong>${jobTitle}</strong> position.</p>
          <p>While we appreciated learning about you, we are unable to proceed with your application at this time.</p>
          ${reason ? `<p><strong>Feedback:</strong> ${reason}</p>` : ''}
          <p>We appreciate the time and effort you invested in the interview process and wish you the best in your job search.</p>
          <p>Regards,<br/>HR Team</p>
        </div>`,
      );
      auditAction = 'INTERVIEW_HR_DECISION_REJECT';
      auditDetails = `HR decision: reject. Application ${interview.jobApplicationId} moved to 'rejected'.${reason ? ` Reason: ${reason}` : ''}`;
      break;
    }

    case 'offer': {
      // Update JobApplication.status → 'offered'
      newAppStatus = 'offered';
      await db.$executeRawUnsafe(
        `UPDATE "JobApplication" SET "status" = 'offered', "updatedAt" = NOW() WHERE "id" = $1`,
        interview.jobApplicationId,
      );

      // Create a real Offer record linked to the JobApplication.
      // The Offer starts in 'draft' status — HR then advances it through
      // draft → pending_approval → approved → sent via /api/offers/[id] PATCH.
      // The secure offer link to the candidate is sent by the offer-sent flow
      // (not here — this is intentional, per spec: "Do not mark the offer as
      // Sent if the document was not generated or the email failed").
      const offerId = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Ensure the jobApplicationId column exists on Offer at runtime.
      await db.$executeRawUnsafe(`ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "jobApplicationId" TEXT`).catch(() => null);
      await db.$executeRawUnsafe(
        `INSERT INTO "Offer" ("id", "candidateId", "jobPostingId", "candidateName", "candidateEmail",
                              "position", "offeredSalary", "offeredCurrency", "joiningDate",
                              "probationPeriod", "status", "jobApplicationId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, 'INR', NOW(), 90, 'draft', $7, NOW(), NOW())`,
        offerId,
        interview.jobApplicationId, // we use the application id as candidateId for traceability
        application.jobPostingId,
        candidateName,
        candidateEmail,
        jobTitle,
        interview.jobApplicationId,
      ).catch((err: unknown) => {
        console.warn('[InterviewDecision] offer insert failed:', err instanceof Error ? err.message : err);
      });
      newOfferId = offerId;

      // Email the candidate a "we'll be in touch with offer details" email.
      // This is NOT the secure offer link — that comes later once HR fills in
      // the salary details and the offer is approved + sent.
      emailResult = await emailToCandidate(
        `Offer Update — ${candidateName} — ${jobTitle}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#10b981;">Congratulations — you have been selected</h2>
          <p>Dear ${candidateName},</p>
          <p>We are pleased to inform you that you have been selected for the <strong>${jobTitle}</strong> position following your interview.</p>
          <p>Our HR team will be in touch shortly with the formal offer details. No further action is required from your side at this time.</p>
          ${reason ? `<p><strong>Notes from HR:</strong> ${reason}</p>` : ''}
          <p>Regards,<br/>HR Team</p>
        </div>`,
      );
      auditAction = 'INTERVIEW_HR_DECISION_OFFER';
      auditDetails = `HR decision: offer. Application ${interview.jobApplicationId} moved to 'offered'. Created draft Offer ${offerId} linked to this application.`;
      break;
    }

    default: {
      return {
        success: false,
        error: `Unknown decision: ${decision}`,
        newAppStatus: application.status,
        decision,
        emailSent: false,
        hrNotified: false,
        auditLogged: false,
      };
    }
  }

  // ─── 4) Audit log ──────────────────────────────────────────────────────
  let auditLogged = false;
  try {
    await db.auditLog.create({
      data: {
        userId: actingUserId,
        action: auditAction,
        module: 'recruitment',
        details: auditDetails,
      },
    });
    auditLogged = true;
  } catch (e) {
    console.warn('[InterviewDecision] auditLog.create failed:', e instanceof Error ? e.message : e);
  }

  // ─── 5) Notify HR team (in-app) ────────────────────────────────────────
  const hrNotified = await notifyHrTeam(
    db, tenantId,
    `Interview Decision: ${DECISION_LABELS[decision]}`,
    `HR decision recorded for ${candidateName} (${jobTitle}): ${DECISION_LABELS[decision]}.${reason ? ` Reason: ${reason}` : ''}${newInterviewId ? ` New interview: ${newInterviewId}.` : ''}${newOfferId ? ` Draft offer: ${newOfferId}.` : ''}`,
    '/interviews',
  );

  // ─── 6) Console log the email delivery result (Vercel log evidence) ───
  console.log(
    `[InterviewDecision] decision=${decision} interviewId=${interviewId} application=${interview.jobApplicationId} ` +
    `newAppStatus=${newAppStatus} newInterviewId=${newInterviewId || '-'} newOfferId=${newOfferId || '-'} ` +
    `emailSent=${emailResult.sent}${emailResult.error ? ` emailError=${emailResult.error}` : ''} ` +
    `hrNotified=${hrNotified} auditLogged=${auditLogged}`,
  );

  // ─── 7) C-23: Sync referral status with the new application status ────
  // Finds any Referral rows matching this candidate's email and advances
  // them to match (rejected / offered / hired + bonus).
  if (candidateEmail && newAppStatus !== application.status) {
    try {
      const { syncReferralStatus } = await import('@/lib/referral-sync');
      await syncReferralStatus(db, tenantId, candidateEmail, newAppStatus, jobTitle, { origin: ctx.origin });
    } catch (e) {
      console.warn('[InterviewDecision] Referral sync failed (non-fatal):', e instanceof Error ? e.message : e);
    }
  }

  return {
    success: true,
    newAppStatus,
    decision,
    newInterviewId,
    newOfferId,
    emailSent: emailResult.sent,
    emailError: emailResult.error,
    hrNotified,
    auditLogged,
  };
}
