import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { validatePasswordStrength } from '@/lib/validators';

/**
 * POST /api/auth/reset-password
 * Body: { email, token, newPassword }
 *
 * Verifies the reset token (bcrypt compare against the PasswordReset table),
 * checks it's not expired or already used, then sets the user's password to
 * the new value (hashed with bcrypt). Marks the token as used so it can't be
 * replayed.
 *
 * BUG_005 fix: distinct error code `TOKEN_EXPIRED` for expired tokens.
 * BUG_006 fix: distinct error code `TOKEN_ALREADY_USED` for replayed tokens.
 * BUG_007 fix: distinct error code `TOKEN_SUPERSEDED` for older tokens that
 *              were invalidated by a newer reset request.
 * BUG_008 fix: server-side password policy enforcement (min 8 chars, mixed
 *              case + digit + special) via validatePasswordStrength.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function POST(request: Request) {
  const platformDb = getPlatformDb();
  let db = platformDb;
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const token = String(body.token || '');
    const newPassword = String(body.newPassword || '');

    if (!email || !token || !newPassword) {
      return NextResponse.json({ error: 'Email, token, and newPassword are required' }, { status: 400, headers: CORS });
    }
    // BUG_008 fix: enforce password policy server-side. Rejects weak passwords
    // like "123456" with a clear policy message.
    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error || 'Password does not meet policy requirements', code: 'WEAK_PASSWORD' }, { status: 400, headers: CORS });
    }

    const tenantSlug = request.headers.get('x-tenant-slug') || '';

    // Resolve the right DB (tenant DB first, platform DB fallback)
    let user: { id: string; email: string; tenantId: string | null } | null = null;
    if (tenantSlug) {
      try {
        const { getDbForTenant } = await import('@/lib/tenant-db');
        const tenantDb = await getDbForTenant(tenantSlug);
        const u = await tenantDb.user.findUnique({
          where: { email },
          select: { id: true, email: true, tenantId: true },
        }).catch(() => null);
        if (u) {
          user = u;
          db = tenantDb;
        }
      } catch (e) {
        console.error('[ResetPassword] Tenant DB lookup failed:', e);
      }
    }
    if (!user) {
      const platformUser = await platformDb.user.findUnique({
        where: { email },
        select: { id: true, email: true, tenantId: true },
      }).catch(() => null);
      if (platformUser) {
        user = platformUser;
        db = platformDb;
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired token', code: 'TOKEN_INVALID' }, { status: 400, headers: CORS });
    }

    // Ensure the PasswordReset table exists
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
      console.warn('[ResetPassword] Failed to ensure PasswordReset table:', e);
    }

    // Find ALL unused tokens for this user (most recent first) so we can
    // distinguish expired / already-used / superseded-by-newer-request cases.
    const rows = await db.$queryRawUnsafe(
      `SELECT "id", "tokenHash", "expiresAt", "usedAt" FROM "PasswordReset"
       WHERE "userId" = $1
       ORDER BY "createdAt" DESC LIMIT 10`,
      user.id,
    ).catch(() => []) as Array<{ id: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }>;

    // Step 1: look for a match among unused, non-expired tokens (the happy path).
    let matchedRow: { id: string; tokenHash: string; expiresAt: Date } | null = null;
    let newestUnusedRow: { id: string; tokenHash: string; expiresAt: Date } | null = null;
    let foundUsedMatch = false;
    let foundExpiredMatch = false;

    for (const row of rows) {
      const isExpired = new Date(row.expiresAt).getTime() < Date.now();
      const isUsed = row.usedAt !== null;
      const hashMatches = await verifyPassword(token, row.tokenHash).catch(() => false);

      if (hashMatches) {
        if (isUsed) {
          foundUsedMatch = true;       // BUG_006: this token was already consumed
          continue;
        }
        if (isExpired) {
          foundExpiredMatch = true;    // BUG_005: this token's 30-min window lapsed
          continue;
        }
        // Unused + unexpired + hash matches = valid. But check if there's a
        // NEWER unused+unexpired token for this user (BUG_007: supersession).
        if (!newestUnusedRow || new Date(row.expiresAt).getTime() > new Date(newestUnusedRow.expiresAt).getTime()) {
          // We'll handle supersession below — first remember this row.
        }
        matchedRow = row;
        break;
      } else if (!isUsed && !isExpired) {
        if (!newestUnusedRow) newestUnusedRow = row;
      }
    }

    // BUG_007: if this token matches but it's NOT the newest unused token for
    // the user, it has been superseded by a newer reset request.
    if (matchedRow && newestUnusedRow && matchedRow.id !== newestUnusedRow.id) {
      return NextResponse.json({
        error: 'This reset link is no longer valid. A newer password reset request was made for your account — please use the link from the most recent email.',
        code: 'TOKEN_SUPERSEDED',
      }, { status: 400, headers: CORS });
    }

    if (!matchedRow) {
      // BUG_006: token was already used (replay attempt)
      if (foundUsedMatch) {
        return NextResponse.json({
          error: 'This reset link has already been used to reset your password. For security, each link can only be used once. Please request a new link if you need to reset again.',
          code: 'TOKEN_ALREADY_USED',
        }, { status: 400, headers: CORS });
      }
      // BUG_005: token's 30-minute window has lapsed
      if (foundExpiredMatch) {
        return NextResponse.json({
          error: 'This reset link has expired. Reset links are valid for 30 minutes. Please request a new password reset link.',
          code: 'TOKEN_EXPIRED',
        }, { status: 400, headers: CORS });
      }
      return NextResponse.json({
        error: 'Invalid or expired token. Please request a new password reset link.',
        code: 'TOKEN_INVALID',
      }, { status: 400, headers: CORS });
    }

    // Mark the token as used (prevents replay)
    await db.$executeRawUnsafe(
      `UPDATE "PasswordReset" SET "usedAt" = NOW() WHERE "id" = $1`,
      matchedRow.id,
    ).catch(() => null);

    // Hash the new password and update the User
    const newHash = await hashPassword(newPassword);
    await db.user.update({
      where: { id: user.id },
      data: { password: newHash, status: 'active' },
    });

    // If user was found in tenant DB, also update the platform DB User row
    // (if one exists with the same email) so login works from both DB paths.
    if (db !== platformDb) {
      await platformDb.user.update({
        where: { email },
        data: { password: newHash, status: 'active' },
      }).catch(() => null);
    }

    console.log(`[ResetPassword] Password reset successfully for ${email}`);

    return NextResponse.json({
      message: 'Password reset successfully. You can now login with your new password.',
    }, { headers: CORS });
  } catch (error) {
    console.error('[ResetPassword] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
  }
}
