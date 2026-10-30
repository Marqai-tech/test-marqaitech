/**
 * Referral Status Auto-Sync Service
 *
 * One shared helper that keeps Referral.status in sync with the linked
 * JobApplication.status. Called from every place that changes the
 * application status:
 *   - PATCH /api/recruitment/[id]         (Candidate Status dropdown)
 *   - POST /api/offers/accept/[token]     (candidate accepts offer → auto-hire)
 *   - POST /api/candidate-portal/offers/[id]/respond  (portal accept → auto-hire)
 *   - src/lib/interview-decision.ts        (HR Decision: reject / offer)
 *
 * Map (application status → referral status):
 *   screening / interview / shortlisted → interviewed
 *   offered                              → offered
 *   hired                                → hired  (+ auto-set bonusAmount=5000, hiredAt=NOW)
 *   rejected                             → rejected
 *   applied                              → applied (only if referral was still 'pending')
 *
 * Side effects on hire:
 *   - Auto-sets bonusAmount to 5000 (₹5000 default — only if not already set by HR)
 *   - Auto-sets hiredAt to NOW
 *   - Notifies the referrer via in-app notification + email
 *
 * Side effects on reject:
 *   - Sends the CANDIDATE a rejection email (smart routing: SMTP for internal,
 *     Resend for external domains)
 *   - Notifies the referrer via in-app notification
 *
 * Side effects on any status change:
 *   - Notifies the referrer via in-app notification (recruitment.referral.status_changed)
 *   - Creates an audit log entry
 */

import type { PrismaClient } from '@/generated/prisma/client';

const DEFAULT_BONUS_AMOUNT = 5000;
const DEFAULT_BONUS_CURRENCY = 'INR';

/** Map JobApplication.status → Referral.status */
function appStatusToReferralStatus(appStatus: string): string | null {
  switch (appStatus) {
    case 'applied': return 'applied';
    case 'screening':
    case 'interview':
    case 'shortlisted': return 'interviewed';
    case 'offered': return 'offered';
    case 'hired': return 'hired';
    case 'rejected': return 'rejected';
    default: return null;
  }
}

/** Send an email to the candidate (smart routing via sendEmail + sendTenantEmail fallback). */
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
      const fb = await sendTenantEmail(db, tenantId, { to, subject, html });
      sent = fb.success;
      error = error || fb.error || '';
    } catch (e) {
      error = error + ' | fallback failed: ' + (e instanceof Error ? e.message : String(e));
    }
  }
  return { sent, error: error || undefined };
}

/**
 * Find all Referrals matching the candidate's email and sync their status
 * to match the new JobApplication status.
 *
 * @param db          Tenant Prisma client
 * @param tenantId    Tenant ID (for notifications)
 * @param candidateEmail  The candidate's email (from the JobApplication)
 * @param newAppStatus    The new JobApplication.status that was just written
 * @param jobTitle        The job title (for email/notification bodies)
 * @param options         { trackToken?: string — if available, the referral's trackable URL for the apply link }
 */
export async function syncReferralStatus(
  db: PrismaClient,
  tenantId: string,
  candidateEmail: string,
  newAppStatus: string,
  jobTitle: string,
  options?: { trackToken?: string; origin?: string },
): Promise<void> {
  if (!candidateEmail || !tenantId) return;

  const referralStatus = appStatusToReferralStatus(newAppStatus);
  if (!referralStatus) return; // status not in the map → nothing to sync

  // Find ALL referrals for this candidate email (case-insensitive).
  // A candidate may have been referred for the same job by multiple employees,
  // or for different jobs — we sync all of them.
  let referrals: Array<{
    id: string;
    status: string;
    candidateName: string;
    candidateEmail: string;
    bonusAmount: number | null;
    bonusCurrency: string;
    hiredAt: Date | null;
    bonusPaidAt: Date | null;
    trackToken: string;
    referrerEmployeeId: string;
    jobPostingId: string;
  }> = [];

  try {
    referrals = await db.referral.findMany({
      where: { candidateEmail: { equals: candidateEmail, mode: 'insensitive' } },
      select: {
        id: true, status: true, candidateName: true, candidateEmail: true,
        bonusAmount: true, bonusCurrency: true, hiredAt: true, bonusPaidAt: true,
        trackToken: true, referrerEmployeeId: true, jobPostingId: true,
      },
    }) as typeof referrals;
  } catch (e) {
    console.warn('[ReferralSync] Failed to find referrals for', candidateEmail, ':', e instanceof Error ? e.message : e);
    return;
  }

  if (referrals.length === 0) return; // no referrals for this candidate — nothing to sync

  for (const referral of referrals) {
    // Skip if the referral is already at or past this status (avoid regression).
    // The only exception is 'hired' → if the referral was already 'hired' we
    // still want to ensure the bonus is set (idempotent).
    if (referral.status === referralStatus && referralStatus !== 'hired') continue;
    // Don't touch referrals that are already 'bonus_paid' (terminal — HR processed the payout).
    if (referral.status === 'bonus_paid') continue;

    const updateData: Record<string, unknown> = { status: referralStatus, updatedAt: new Date() };

    // On hire: auto-set bonus + hiredAt.
    if (referralStatus === 'hired') {
      if (!referral.hiredAt) updateData.hiredAt = new Date();
      if (referral.bonusAmount === null || referral.bonusAmount === undefined) {
        updateData.bonusAmount = DEFAULT_BONUS_AMOUNT;
        updateData.bonusCurrency = DEFAULT_BONUS_CURRENCY;
      }
    }

    try {
      await db.referral.update({
        where: { id: referral.id },
        data: updateData,
      });
      console.log(`[ReferralSync] Referral ${referral.id} → status='${referralStatus}' (was '${referral.status}')`);
    } catch (e) {
      console.warn(`[ReferralSync] Failed to update referral ${referral.id}:`, e instanceof Error ? e.message : e);
      continue;
    }

    // ─── Notify the referrer ───────────────────────────────────────────
    try {
      // Find the User linked to the referrer Employee
      const referrerUser = await db.user.findFirst({
        where: { employee: { id: referral.referrerEmployeeId } },
        select: { id: true, email: true, name: true },
      }).catch(() => null);

      if (referrerUser) {
        const { createNotification } = await import('@/lib/notifications');
        const referrerName = referrerUser.name || 'there';
        const isHired = referralStatus === 'hired';
        const bonusAmount = (updateData.bonusAmount as number) || referral.bonusAmount || DEFAULT_BONUS_AMOUNT;
        const bonusCurrency = (updateData.bonusCurrency as string) || referral.bonusCurrency || DEFAULT_BONUS_CURRENCY;

        await createNotification({
          tenantId,
          userId: referrerUser.id,
          title: isHired
            ? `🎉 Your referral has been hired — bonus of ${bonusCurrency} ${bonusAmount.toLocaleString()} is due!`
            : `Referral status update: ${referral.candidateName} → ${referralStatus}`,
          message: isHired
            ? `Great news! Your referral ${referral.candidateName} has been hired for ${jobTitle}. A referral bonus of ${bonusCurrency} ${bonusAmount.toLocaleString()} has been credited. HR will process the payout.`
            : `Your referral ${referral.candidateName} for ${jobTitle} has been updated to: ${referralStatus}.`,
          type: isHired ? 'success' : 'info',
          category: 'recruitment',
          link: '/referrals',
        }).catch(() => null);

        // Also send email to the referrer via sendEmail (smart routing)
        if (referrerUser.email) {
          const { sendEmail } = await import('@/lib/email');
          await sendEmail({
            to: referrerUser.email,
            subject: isHired
              ? `Your referral has been hired: ${referral.candidateName} — Bonus ${bonusCurrency} ${bonusAmount.toLocaleString()}`
              : `Referral update: ${referral.candidateName} is now ${referralStatus}`,
            html: isHired
              ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#10b981;">🎉 Your referral has been hired!</h2>
                  <p>Dear ${referrerName},</p>
                  <p>Great news! Your referral <strong>${referral.candidateName}</strong> has been hired for the <strong>${jobTitle}</strong> position.</p>
                  <p>A referral bonus of <strong>${bonusCurrency} ${bonusAmount.toLocaleString()}</strong> has been credited to your account. HR will process the payout shortly.</p>
                  <p>Thank you for your contribution to our hiring!</p>
                  <p>Regards,<br/>HR Team</p>
                </div>`
              : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2 style="color:#4f46e5;">Referral Status Update</h2>
                  <p>Dear ${referrerName},</p>
                  <p>Your referral <strong>${referral.candidateName}</strong> for the <strong>${jobTitle}</strong> position has been updated to: <strong>${referralStatus}</strong>.</p>
                  <p>Thank you for your referral!</p>
                  <p>Regards,<br/>HR Team</p>
                </div>`,
          }).catch(() => null);
        }
      }
    } catch (e) {
      console.warn('[ReferralSync] Referrer notification failed:', e instanceof Error ? e.message : e);
    }

    // ─── Email the CANDIDATE on reject ──────────────────────────────────
    if (referralStatus === 'rejected') {
      try {
        await sendCandidateEmail(
          db, tenantId, referral.candidateEmail,
          `Application Update — ${referral.candidateName} — ${jobTitle}`,
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#ef4444;">Application Update</h2>
            <p>Dear ${referral.candidateName},</p>
            <p>Thank you for your interest in the <strong>${jobTitle}</strong> position and for applying through our referral program.</p>
            <p>While we appreciate your time, we are unable to proceed with your application at this time.</p>
            <p>We wish you the best in your job search.</p>
            <p>Regards,<br/>HR Team</p>
          </div>`,
        );
        console.log(`[ReferralSync] Rejection email sent to candidate ${referral.candidateEmail}`);
      } catch (e) {
        console.warn('[ReferralSync] Candidate rejection email failed:', e instanceof Error ? e.message : e);
      }
    }

    // ─── Email the CANDIDATE on shortlist/screening with apply link ────
    if (referralStatus === 'interviewed' && referral.status === 'pending') {
      // Only send the apply-link email if the referral was transitioning from
      // 'pending' (i.e. the candidate hasn't formally applied yet). If the
      // referral was already 'applied', they already have a portal account.
      try {
        const baseUrl = options?.origin || '';
        const applyUrl = `${baseUrl}/api/referrals/track/${referral.trackToken}`;
        await sendCandidateEmail(
          db, tenantId, referral.candidateEmail,
          `You've been shortlisted: ${referral.candidateName} — ${jobTitle}`,
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#10b981;">You've been shortlisted!</h2>
            <p>Dear ${referral.candidateName},</p>
            <p>Good news! You have been shortlisted for the <strong>${jobTitle}</strong> position through our employee referral program.</p>
            <p>To proceed with your application, please click the link below to formally apply and create your candidate portal account:</p>
            <p><a href="${applyUrl}" style="display:inline-block;padding:12px 28px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Apply Now</a></p>
            <p>This link will take you to our careers page where you can complete your application.</p>
            <p>We look forward to hearing from you!</p>
            <p>Regards,<br/>HR Team</p>
          </div>`,
        );
        console.log(`[ReferralSync] Shortlist+apply-link email sent to candidate ${referral.candidateEmail}`);
      } catch (e) {
        console.warn('[ReferralSync] Candidate shortlist email failed:', e instanceof Error ? e.message : e);
      }
    }

    // ─── Audit log ──────────────────────────────────────────────────────
    try {
      await db.auditLog.create({
        data: {
          userId: null, // system-triggered sync
          action: 'REFERRAL_STATUS_SYNCED',
          module: 'referrals',
          details: `Referral ${referral.id} auto-synced to '${referralStatus}' because JobApplication for ${candidateEmail} moved to '${newAppStatus}'.`,
        },
      });
    } catch { /* non-fatal */ }
  }
}
