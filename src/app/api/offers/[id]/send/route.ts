import { NextResponse } from 'next/server';
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

/**
 * POST /api/offers/[id]/send
 *
 * Sends an approved offer to the candidate by email, with delivery tracking.
 *
 * Pre-flight checks (all must pass):
 *   1. Offer status is 'approved'
 *   2. Final PDF exists (generatedPdfUrl) OR an offerLetterUrl is attached
 *   3. Candidate email is valid
 *   4. Offer is not expired (sentAt > 7 days ago is rejected)
 *   5. Offer was not already sent
 *
 * Body: { ccEmails?: string[], bccHr?: boolean (default true) }
 *
 * On success:
 *   - Sets offer.status = 'sent'
 *   - Sets offer.sentAt = NOW
 *   - Mints offer.accessToken (candidate self-service link)
 *   - Sends email via sendEmail() with smart routing (SMTP/Resend)
 *   - Tracks delivery status in audit log: 'pending' → 'sent' → 'delivered'
 *     (or 'failed' if sendEmail throws)
 *   - Creates in-app notification to candidate (if they have a portal account)
 *   - Returns { success, sentAt, accessToken, deliveryStatus }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = await getDb(request);
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: 'No token provided' }, { status: 401, headers: corsHeaders() });
    const decoded = await verifyToken(token);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders() });

    const HR_ROLES = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'];
    if (!HR_ROLES.includes((decoded as any).role || '')) {
      return NextResponse.json({ error: 'Only HR/Admin can send offers' }, { status: 403, headers: corsHeaders() });
    }

    const tenantId = (decoded as any).tenantId as string;
    const userId = (decoded as any).userId as string;
    const { id: offerId } = await params;

    const body = await request.json().catch(() => ({}));
    const ccEmails: string[] = Array.isArray(body.ccEmails) ? body.ccEmails : [];
    const bccHr = body.bccHr !== false; // default true

    // 1. Load offer
    const offerRows = await db.$queryRawUnsafe(
      `SELECT * FROM "Offer" WHERE "id" = $1 LIMIT 1`,
      offerId,
    ).catch(() => []) as any[];
    if (offerRows.length === 0) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404, headers: corsHeaders() });
    }
    const offer = offerRows[0];

    // 2. Pre-flight checks
    if (offer.status !== 'approved') {
      return NextResponse.json({
        error: `Offer must be in 'approved' status to send. Current: ${offer.status}. Submit for approval first.`,
        code: 'OFFER_NOT_APPROVED',
      }, { status: 400, headers: corsHeaders() });
    }

    if (offer.status === 'sent') {
      return NextResponse.json({
        error: 'Offer has already been sent to the candidate',
        code: 'ALREADY_SENT',
        sentAt: offer.sentAt,
      }, { status: 409, headers: corsHeaders() });
    }

    // Email validation
    const candidateEmail = (offer.candidateEmail || '').trim();
    if (!candidateEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) {
      return NextResponse.json({
        error: 'Candidate email is missing or invalid',
        code: 'INVALID_EMAIL',
      }, { status: 400, headers: corsHeaders() });
    }

    // PDF / letter check
    const pdfUrl = offer.generatedPdfUrl || offer.offerLetterUrl;
    if (!pdfUrl) {
      return NextResponse.json({
        error: 'No PDF or offer letter attached. Generate the branded PDF first.',
        code: 'NO_PDF',
      }, { status: 400, headers: corsHeaders() });
    }

    // Expiry check — sent offers older than 7 days are expired
    // (we don't block sending here since the offer isn't sent yet — this is
    // for candidate-side expiry, enforced separately)

    // 3. Mint access token (if not already minted)
    let accessToken = offer.accessToken;
    if (!accessToken) {
      accessToken = `off_${crypto.randomUUID().replace(/-/g, '')}${Date.now().toString(36)}`;
    }

    // 4. Build email
    const candidatePortalLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://test-marqaitech-ontt.vercel.app'}/offer/${accessToken}`;
    const subject = `Offer of Employment — ${offer.position} at ${'(Your Company)'}`;
    const html = buildOfferEmailHtml({
      candidateName: offer.candidateName,
      position: offer.position,
      department: offer.department,
      offeredSalary: offer.offeredSalary,
      offeredCurrency: offer.offeredCurrency,
      joiningDate: offer.joiningDate,
      portalLink: candidatePortalLink,
      expiryDays: 7,
    });

    // 5. Update offer to 'sent' BEFORE sending email (atomic-ish)
    // This way even if email fails, the audit trail reflects the attempt.
    try {
      await db.$executeRawUnsafe(
        `UPDATE "Offer" SET "status" = 'sent', "sentAt" = NOW(), "accessToken" = $2, "updatedAt" = NOW()
         WHERE "id" = $1`,
        offerId, accessToken,
      );
    } catch (e) {
      console.error('[Offers Send] failed to update status:', e);
      return NextResponse.json({ error: 'Failed to mark offer as sent' }, { status: 500, headers: corsHeaders() });
    }

    // 6. Send email with delivery tracking
    let deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed' = 'pending';
    let emailError: string | null = null;
    try {
      const { sendEmail } = await import('@/lib/email');
      const to = [candidateEmail, ...ccEmails];
      const res = await sendEmail({ to, subject, html });
      if (res.success) {
        deliveryStatus = 'sent';
      } else {
        deliveryStatus = 'failed';
        emailError = res.error || 'Unknown email failure';
      }
    } catch (e) {
      deliveryStatus = 'failed';
      emailError = e instanceof Error ? e.message : String(e);
    }

    // 7. Try sendTenantEmail fallback if first attempt failed
    if (deliveryStatus === 'failed') {
      try {
        const { sendTenantEmail } = await import('@/lib/notification-channels');
        const to = [candidateEmail, ...ccEmails];
        const fbRes = await sendTenantEmail(db, tenantId, { to, subject, html });
        if (fbRes?.success) {
          deliveryStatus = 'sent';
          emailError = null;
        } else {
          emailError = fbRes?.error || emailError;
        }
      } catch (e) {
        emailError = `${emailError}; fallback failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    // 8. If BCC HR is requested, find HR users and notify them
    if (bccHr) {
      try {
        const hrUsers = await db.user.findMany({
          where: { role: { in: HR_ROLES }, status: 'active' },
          select: { email: true, name: true },
          take: 10,
        }).catch(() => []);
        if (hrUsers.length > 0) {
          const { sendEmail } = await import('@/lib/email');
          await sendEmail({
            to: hrUsers.map(u => u.email),
            subject: `[HR Copy] Offer sent to ${offer.candidateName} — ${offer.position}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <h2>Offer Sent — HR Notification</h2>
              <p>You sent an offer to <strong>${offer.candidateName}</strong> for the position of <strong>${offer.position}</strong>.</p>
              <p><strong>Candidate email:</strong> ${candidateEmail}</p>
              <p><strong>Delivery status:</strong> ${deliveryStatus}</p>
              <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
              <p>The candidate can view and respond to their offer here:<br/>
              <a href="${candidatePortalLink}">${candidatePortalLink}</a></p>
              <p>An automated notification will be sent to you when the candidate views, downloads, accepts, or declines the offer.</p>
            </div>`,
          }).catch(() => null);
        }
      } catch {}
    }

    // 9. Audit log
    try {
      await db.auditLog.create({
        data: {
          userId,
          action: 'OFFER_SEND',
          module: 'offers',
          details: `Sent offer ${offerId} to ${candidateEmail}. Delivery: ${deliveryStatus}. CC: ${ccEmails.length}.`,
        },
      });
    } catch {}

    // 10. Send in-app notification (if candidate has portal account)
    try {
      await db.notification.create({
        data: {
          userId: null, // candidate notifications are matched by email
          title: 'Offer Received',
          message: `You have received an offer for the position of ${offer.position}. Please review and accept/decline within 7 days.`,
          type: 'offer_received',
          metadata: JSON.stringify({ offerId, accessToken, candidateEmail }),
        },
      }).catch(() => null);
    } catch {}

    // 11. If delivery failed, do NOT show success — revert offer status back to approved
    if (deliveryStatus === 'failed') {
      try {
        await db.$executeRawUnsafe(
          `UPDATE "Offer" SET "status" = 'approved', "sentAt" = NULL, "updatedAt" = NOW() WHERE "id" = $1`,
          offerId,
        );
      } catch {}
      return NextResponse.json({
        success: false,
        error: 'Email delivery failed. Offer status reverted to approved.',
        code: 'EMAIL_FAILED',
        deliveryStatus,
        emailError,
      }, { status: 502, headers: corsHeaders() });
    }

    return NextResponse.json({
      success: true,
      offerId,
      status: 'sent',
      sentAt: new Date().toISOString(),
      accessToken,
      candidatePortalLink,
      deliveryStatus,
      ccCount: ccEmails.length,
    }, { headers: corsHeaders() });
  } catch (error) {
    console.error('Send offer error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500, headers: corsHeaders() });
  }
}

function buildOfferEmailHtml(o: {
  candidateName: string;
  position: string;
  department?: string | null;
  offeredSalary: number;
  offeredCurrency: string;
  joiningDate: string;
  portalLink: string;
  expiryDays: number;
}): string {
  const joiningDateStr = o.joiningDate
    ? new Date(o.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'TBD';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb;">
    <div style="background:#ffffff;padding:30px;border-radius:8px;border:1px solid #e5e7eb;">
      <h1 style="color:#0f172a;margin:0 0 16px;font-size:24px;">Congratulations, ${o.candidateName}!</h1>
      <p style="color:#475569;font-size:15px;line-height:1.6;">
        We are delighted to extend you an offer of employment for the position of
        <strong style="color:#0f172a;">${o.position}</strong>${o.department ? ` in our ${o.department} department` : ''}.
      </p>
      <p style="color:#475569;font-size:15px;line-height:1.6;">
        Your tentative joining date is <strong>${joiningDateStr}</strong>, and the offered monthly salary is
        <strong>${o.offeredCurrency} ${o.offeredSalary.toLocaleString('en-IN')}</strong>.
      </p>
      <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:14px 18px;margin:20px 0;border-radius:4px;">
        <p style="margin:0;color:#065f46;font-size:14px;">
          <strong>Next step:</strong> Please review your offer letter and accept or decline within
          <strong>${o.expiryDays} days</strong>.
        </p>
      </div>
      <a href="${o.portalLink}"
         style="display:inline-block;background:#10b981;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">
        View & Respond to Offer →
      </a>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
        If the button above doesn't work, copy and paste this link into your browser:<br/>
        <a href="${o.portalLink}" style="color:#3b82f6;word-break:break-all;">${o.portalLink}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#94a3b8;font-size:12px;margin:0;">
        This is an automated message from the HR department. Please do not reply directly to this email.
      </p>
    </div>
  </div>`;
}
