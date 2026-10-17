import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { hashPassword } from '@/lib/auth';
import { randomBytes } from 'crypto';
import { sendTenantEmail } from '@/lib/notification-channels';
import { validateEmail } from '@/lib/validators';

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * Looks up the user (in tenant DB first if x-tenant-slug is set, else platform
 * DB). If found, generates a time-bound (30-minute) reset token, hashes it
 * (bcrypt), persists the hash to a PasswordReset table, and emails the user
 * a magic link with the raw token.
 *
 * Security:
 *   - Raw token is NEVER stored — only the bcrypt hash.
 *   - Tokens expire after 30 minutes.
 *   - Any previously-issued unused tokens for this email are expired immediately.
 *   - The endpoint ALWAYS returns 200 OK (even if the email doesn't exist)
 *     to prevent email-enumeration attacks.
 *
 * BUG_004 fix: email format is validated server-side and a 400 is returned
 * for clearly malformed input ("abc", "abc@", "abc@.com", "@gmail.com").
 * This is NOT email enumeration — invalid format ≠ non-existent account.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

const TOKEN_EXPIRY_MINUTES = 30;

export async function POST(request: Request) {
  const platformDb = getPlatformDb();
  let db = platformDb;
  try {
    const body = await request.json().catch(() => ({}));
    const rawEmail = String(body.email || '').trim();
    // BUG_004 fix: server-side email format validation. Reject malformed
    // inputs ("abc", "abc@", "abc@.com", "@gmail.com") with a 400 — this is
    // a format check, not an existence check, so it does NOT leak which
    // emails are registered.
    const emailCheck = validateEmail(rawEmail);
    if (!emailCheck.valid) {
      return NextResponse.json({ error: emailCheck.error || 'Invalid email format' }, { status: 400, headers: CORS });
    }
    const email = rawEmail.toLowerCase();

    const tenantSlug = request.headers.get('x-tenant-slug') || '';

    // Look up the user (tenant DB first, platform DB fallback)
    let user: { id: string; email: string; name: string | null; tenantId: string | null } | null = null;

    if (tenantSlug) {
      try {
        // Dynamically import to avoid circular deps at module load
        const { getDbForTenant } = await import('@/lib/tenant-db');
        const tenantDb = await getDbForTenant(tenantSlug);
        const u = await tenantDb.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, tenantId: true },
        }).catch(() => null);
        if (u) {
          user = u;
          db = tenantDb;
        }
      } catch (e) {
        console.error('[ForgotPassword] Tenant DB lookup failed:', e);
      }
    }
    if (!user) {
      const platformUser = await platformDb.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, tenantId: true },
      }).catch(() => null);
      if (platformUser) {
        user = platformUser;
        db = platformDb;
      }
    }

    // ALWAYS return 200 OK (even if user not found) to prevent email enumeration
    const okResponse = NextResponse.json({
      message: 'If an account with that email exists, a password reset link has been sent. The link is valid for 30 minutes.',
    }, { headers: CORS });

    if (!user) {
      console.log(`[ForgotPassword] No user found for ${email} (returning 200 to prevent enumeration)`);
      return okResponse;
    }

    // Generate a random token (32 bytes → 64 hex chars)
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = await hashPassword(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    // Ensure the PasswordReset table exists, then expire any old unused tokens
    // for this user, and INSERT the new one.
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PasswordReset" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "tokenHash" TEXT NOT NULL,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "usedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
          CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
        )
      `);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON "PasswordReset"("userId")`);
    } catch (e) {
      console.warn('[ForgotPassword] Failed to ensure PasswordReset table:', e);
    }

    // Expire any previously-issued unused tokens for this user
    try {
      await db.$executeRawUnsafe(
        `UPDATE "PasswordReset" SET "usedAt" = NOW() WHERE "userId" = $1 AND "usedAt" IS NULL`,
        user.id,
      );
    } catch (e) {
      console.warn('[ForgotPassword] Failed to expire old tokens:', e);
    }

    // Insert the new token (raw token → bcrypt hash)
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "PasswordReset" ("id", "userId", "tokenHash", "expiresAt", "createdAt")
         VALUES ($1, $2, $3, $4, NOW())`,
        `pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user.id,
        hashedToken,
        expiresAt,
      );
    } catch (e) {
      console.error('[ForgotPassword] Failed to insert new token:', e);
      return NextResponse.json({ error: 'Failed to generate reset token' }, { status: 500, headers: CORS });
    }

    // Build the reset link (use the request's origin so the link works on the
    // deployment the user is currently on — demo or LIVE tenant)
    const origin = request.headers.get('origin') || `https://${request.headers.get('host') || 'marqaitechgroup.3boxeshrms.com'}`;
    const resetLink = `${origin}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    // Resolve the tenant name for the email body
    let tenantName = '3Boxes HRMS';
    if (user.tenantId) {
      const tenant = await platformDb.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true },
      }).catch(() => null);
      if (tenant?.name) tenantName = tenant.name;
    }

    // Send the email via the tenant SMTP channel (configured in Task 52)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:linear-gradient(135deg,#065f46,#10b981);border-radius:14px 14px 0 0;padding:22px 28px;color:#fff">
    <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:.85">${tenantName}</div>
    <div style="font-size:19px;font-weight:700;margin-top:4px">Reset your password</div>
  </div>
  <div style="background:#fff;border-radius:0 0 14px 14px;padding:26px 28px;box-shadow:0 6px 24px rgba(15,23,42,.08)">
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6">Hi ${user.name || 'there'},</p>
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6">We received a request to reset the password for your <strong>${tenantName} HRMS</strong> account${user.email ? ` (<strong>${user.email}</strong>)` : ''}. Click the button below to set a new password:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr>
      <td style="padding-right:10px"><a href="${resetLink}" style="display:inline-block;padding:12px 26px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Reset Password</a></td>
    </tr></table>
    <p style="margin:14px 0 0;font-size:12px;color:#94a3b8">Or copy this link into your browser: ${resetLink}</p>
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8">This link expires in 30 minutes. If you didn't request a password reset, you can safely ignore this email — your password has not been changed.</p>
    <div style="border-top:1px solid #e2e8f0;margin-top:20px;padding-top:14px;font-size:11px;color:#94a3b8">Sent by ${tenantName} via 3Boxes HRMS</div>
  </div>
</div>
</body></html>`;

    const emailResult = await sendTenantEmail(db, user.tenantId || '', {
      to: user.email,
      subject: `Reset your ${tenantName} HRMS password`,
      html,
    });
    console.log(`[ForgotPassword] Reset email for ${user.email}: ${emailResult.success ? 'sent' : 'FAILED (' + emailResult.error + ')'}`);

    return okResponse;
  } catch (error) {
    console.error('[ForgotPassword] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
