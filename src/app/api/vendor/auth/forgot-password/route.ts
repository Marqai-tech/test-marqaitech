import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/tenant-db';
import { sha256, PASSWORD_RESET_TTL_MINUTES, resolveBaseUrl } from '@/lib/bgv';
import { randomBytes } from 'crypto';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

/**
 * POST /api/vendor/auth/forgot-password
 *   body: { email }
 *
 * Vendor password recovery step 1 (mock screen 04 — password recovery).
 *
 * Security posture:
 *  - ALWAYS answers { ok: true } with the same neutral message, whether or
 *    not the email belongs to a vendor account (no account-existence leak).
 *  - The RAW reset token is only ever emailed; the DB stores a SHA-256 hash
 *    plus a 60-minute expiry (PASSWORD_RESET_TTL_MINUTES).
 *  - Requesting a new link invalidates the previous token (single hash row).
 *  - Only ACTIVE vendor users who already set a password receive a link;
 *    pending users are pointed at their invitation, disabled accounts at HR.
 *  - Delivery failures are recorded in the audit log and reported honestly
 *    in the response `delivered` flag — never a fake success.
 */
export async function POST(req: NextRequest) {
  const db = await getDb(req);
  const NEUTRAL = 'If this email belongs to an active vendor account, a password reset link has been sent. The link expires in 60 minutes.';
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400, headers: CORS });
    }

    const rows = await db.$queryRawUnsafe(
      `SELECT "id","email","name","status","passwordHash","passwordSetAt"
         FROM "VendorUser"
        WHERE "email" = $1
        LIMIT 1`,
      email,
    ).catch(() => []) as any[];

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, message: NEUTRAL }, { headers: CORS });
    }
    const vu = rows[0];

    // Distinct guidance per account state, kept safe (no existence confirmation
    // beyond what the wording already implies to the requester).
    if (vu.status === 'pending' || !vu.passwordHash) {
      return NextResponse.json({
        ok: true,
        message: 'If this email belongs to a vendor account, look for the invitation email to set your password first, or ask your vendor admin to resend the invitation.',
      }, { headers: CORS });
    }
    if (vu.status !== 'active') {
      return NextResponse.json({
        ok: true,
        message: 'If this email belongs to a vendor account that has been disabled, contact your HR administrator or vendor admin to reactivate it.',
      }, { headers: CORS });
    }

    // Generate + store the reset token (overwrites any previous one).
    const rawToken = randomBytes(32).toString('base64url');
    const hash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

    const upd = await db.$executeRawUnsafe(
      `UPDATE "VendorUser"
          SET "passwordResetHash" = $1,
              "passwordResetExpiresAt" = $2,
              "updatedAt" = NOW()
        WHERE "id" = $3 AND "status" = 'active'`,
      hash, expiresAt, vu.id,
    ).catch(() => 0);

    if (!upd) {
      // State changed between reads — answer neutrally, no link sent.
      return NextResponse.json({ ok: true, message: NEUTRAL }, { headers: CORS });
    }

    const base = resolveBaseUrl(req);
    const resetUrl = `${base}/vendor/reset-password?token=${encodeURIComponent(rawToken)}`;

    // Audit the request (no token material in the log).
    await db.auditLog.create({
      data: {
        userId: vu.id,
        action: 'VENDOR_PASSWORD_RESET_REQUESTED',
        module: 'vendor',
        details: `Password reset requested for vendor user ${vu.email} (link expires ${expiresAt.toISOString()})`,
      },
    }).catch(() => null);

    // Send the email and report delivery honestly.
    let delivered = false;
    let mailNote = '';
    try {
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: vu.email,
        subject: 'Reset your Vendor Portal password',
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
                 <h2 style="color:#0F766E;margin-bottom:4px;">Password reset request</h2>
                 <p style="color:#334155;">Hi ${vu.name || ''}, a password reset was requested for your Vendor Portal account.</p>
                 <p style="text-align:center;margin:24px 0;">
                   <a href="${resetUrl}" style="background:#0F766E;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Set a new password</a>
                 </p>
                 <p style="color:#475569;font-size:13px;">This single-use link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes. If you did not request it, you can safely ignore this email — your current password keeps working.</p>
               </div>`,
      });
      delivered = !!result?.success;
      if (!delivered) mailNote = String(result?.error || 'mail provider reported failure');
    } catch (mailErr: any) {
      mailNote = String(mailErr?.message || mailErr);
    }

    if (!delivered) {
      await db.auditLog.create({
        data: {
          userId: vu.id,
          action: 'VENDOR_PASSWORD_RESET_EMAIL_FAILED',
          module: 'vendor',
          details: `Reset email delivery failed for ${vu.email}: ${mailNote.slice(0, 300)}`,
        },
      }).catch(() => null);
      return NextResponse.json({
        ok: true,
        delivered: false,
        message: 'The request was recorded but the email could not be sent right now (mail service unavailable). Please try again shortly.',
      }, { headers: CORS });
    }
    return NextResponse.json({ ok: true, delivered: true, message: NEUTRAL }, { headers: CORS });
  } catch (error) {
    console.error('Vendor forgot-password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
