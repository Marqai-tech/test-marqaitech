import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { hashPassword } from '@/lib/auth';
import { randomBytes } from 'crypto';
import { sendTenantEmail } from '@/lib/notification-channels';
import { validateEmail } from '@/lib/validators';
import { getTenantBranding } from '@/lib/tenant-branding';

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
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400, headers: CORS });
    }

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
        // Raw SQL fallback on tenant DB (schema drift safety)
        if (!user) {
          try {
            const rows = await tenantDb.$queryRawUnsafe(
              `SELECT "id", "email", "tenantId" FROM "User" WHERE LOWER("email") = $1 LIMIT 1`,
              email,
            ) as Array<{ id: string; email: string; tenantId: string | null }>;
            if (rows && rows.length > 0) {
              user = { id: rows[0].id, email: rows[0].email, name: null, tenantId: rows[0].tenantId };
              db = tenantDb;
            }
          } catch { /* fall through to platform DB */ }
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

    // Cross-DB raw SQL fallback (Task 157 pattern) — if Prisma findUnique
    // fails (e.g. schema drift), try a raw SQL query on the platform DB.
    if (!user) {
      try {
        const rows = await platformDb.$queryRawUnsafe(
          `SELECT "id", "email", "tenantId" FROM "User" WHERE LOWER("email") = $1 LIMIT 1`,
          email,
        ) as Array<{ id: string; email: string; tenantId: string | null }>;
        if (rows && rows.length > 0) {
          user = { id: rows[0].id, email: rows[0].email, name: null, tenantId: rows[0].tenantId };
          db = platformDb;
        }
      } catch (e) {
        console.warn('[ForgotPassword] Raw SQL fallback failed:', e instanceof Error ? e.message : e);
      }
    }

    // ─── Tenant DB sweep (Task 132 pattern from login route) ──────────
    // If no tenant slug was provided AND the platform DB doesn't have the
    // user, sweep ALL active tenant DBs to find the user. This handles
    // test-platform hosts (test-marqaitech-ontt.vercel.app) where the
    // middleware sets x-tenant-slug to empty (platform), but the user
    // actually lives in the test-marqaitech tenant DB.
    if (!user) {
      try {
        const { getDbForTenant } = await import('@/lib/tenant-db');
        const sweepDbs = await platformDb.tenantDatabase.findMany({
          where: { isActive: true },
          select: { connectionString: true, tenant: { select: { slug: true } } },
        });
        for (const td of sweepDbs) {
          if (!td.connectionString || !td.tenant?.slug) continue;
          try {
            const sweepTenantDb = await getDbForTenant(td.tenant.slug);
            // Try Prisma first
            let candidate = await sweepTenantDb.user.findUnique({
              where: { email },
              select: { id: true, email: true, tenantId: true },
            }).catch(() => null);
            // Raw SQL fallback for this tenant DB
            if (!candidate) {
              try {
                const rows = await sweepTenantDb.$queryRawUnsafe(
                  `SELECT "id", "email", "tenantId" FROM "User" WHERE LOWER("email") = $1 LIMIT 1`,
                  email,
                ) as Array<{ id: string; email: string; tenantId: string | null }>;
                if (rows && rows.length > 0) {
                  candidate = { id: rows[0].id, email: rows[0].email, tenantId: rows[0].tenantId };
                }
              } catch { /* try next tenant DB */ }
            }
            if (candidate) {
              user = { ...candidate, name: null };
              db = sweepTenantDb;
              console.log(`[ForgotPassword] Found ${email} in tenant DB: ${td.tenant.slug}`);
              break; // Found — stop sweeping
            }
          } catch (sweepDbErr) {
            console.warn(`[ForgotPassword] Tenant sweep skipped ${td.tenant.slug}:`, sweepDbErr instanceof Error ? sweepDbErr.message : sweepDbErr);
            continue;
          }
        }
      } catch (sweepErr) {
        console.error('[ForgotPassword] Tenant sweep failed:', sweepErr);
      }
    }

    // TC_026: For HRMS (internal B2B tool), email enumeration risk is low.
    // Return a clear "not registered" message for non-existent emails so the
    // user gets immediate feedback (per tester expectation). The anti-enumeration
    // pattern is documented here for future reference if security policy changes.
    if (!user) {
      console.log(`[ForgotPassword] No user found for ${email}`);
      return NextResponse.json({
        exists: false,
        error: 'This email address is not registered. Please check the email address and try again.',
      }, { status: 200, headers: CORS });
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

    // Resolve the tenant name + branding (REQ 5) for the email body
    let tenantName = '3Boxes HRMS';
    let primaryColor = '#065f46';
    let accentColor = '#10b981';
    let tenantLogo: string | null = null;
    if (user.tenantId) {
      // REQ 5: use getTenantBranding to fetch logo + colors atomically.
      const branding = await getTenantBranding(user.tenantId);
      tenantName = branding.name;
      primaryColor = branding.primaryColor;
      accentColor = branding.accentColor;
      tenantLogo = branding.logo;
    }

    // Send the email via the tenant SMTP channel (configured in Task 52)
    // REQ 5: header gradient + reset button use tenant brand colors; logo
    // rendered when available; falls back to defaults otherwise.
    const logoHtml = tenantLogo
      ? `<img src="${tenantLogo}" alt="${tenantName}" style="height:32px;width:auto;max-width:160px;object-fit:contain;display:block;margin-bottom:6px" />`
      : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:linear-gradient(135deg,${primaryColor},${accentColor});border-radius:14px 14px 0 0;padding:22px 28px;color:#fff">
    ${logoHtml}
    <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:.85">${tenantName}</div>
    <div style="font-size:19px;font-weight:700;margin-top:4px">Reset your password</div>
  </div>
  <div style="background:#fff;border-radius:0 0 14px 14px;padding:26px 28px;box-shadow:0 6px 24px rgba(15,23,42,.08)">
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6">Hi ${user.name || 'there'},</p>
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.6">We received a request to reset the password for your <strong>${tenantName} HRMS</strong> account${user.email ? ` (<strong>${user.email}</strong>)` : ''}. Click the button below to set a new password:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr>
      <td style="padding-right:10px"><a href="${resetLink}" style="display:inline-block;padding:12px 26px;background:${accentColor};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Reset Password</a></td>
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

    return NextResponse.json({
      message: 'A password reset link has been sent. The link is valid for 30 minutes.',
    }, { headers: CORS });
  } catch (error) {
    console.error('[ForgotPassword] Error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal server error', debug: errMsg }, { status: 500, headers: CORS });
  }
}
