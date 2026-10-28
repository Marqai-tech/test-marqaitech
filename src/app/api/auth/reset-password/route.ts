import { NextResponse } from 'next/server';
import { getDb, getPlatformDb } from '@/lib/tenant-db';
import { hashPassword, verifyPassword } from '@/lib/auth';

/**
 * POST /api/auth/reset-password
 * Body: { email, token, newPassword }
 *
 * Verifies the reset token (bcrypt compare against the PasswordReset table),
 * checks it's not expired or already used, then sets the user's password to
 * the new value (hashed with bcrypt). Marks the token as used so it can't be
 * replayed.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

// TC_030/TC_031: Preflight token validation — check if token is valid, expired, or already used
export async function GET(request: Request) {
  const platformDb = getPlatformDb();
  let db = platformDb;
  try {
    const { searchParams } = new URL(request.url);
    const email = String(searchParams.get('email') || '').trim().toLowerCase();
    const token = String(searchParams.get('token') || '');

    if (!email || !token) {
      return NextResponse.json({ valid: false, reason: 'missing' }, { headers: CORS });
    }

    const tenantSlug = request.headers.get('x-tenant-slug') || '';
    let user: { id: string; email: string; tenantId: string | null } | null = null;
    if (tenantSlug) {
      try {
        const { getDbForTenant } = await import('@/lib/tenant-db');
        const tenantDb = await getDbForTenant(tenantSlug);
        const u = await tenantDb.user.findUnique({ where: { email }, select: { id: true, email: true, tenantId: true } }).catch(() => null);
        if (u) { user = u; db = tenantDb; }
      } catch { /* ignore */ }
    }
    if (!user) {
      const platformUser = await platformDb.user.findUnique({ where: { email }, select: { id: true, email: true, tenantId: true } }).catch(() => null);
      if (platformUser) { user = platformUser; db = platformDb; }
    }
    if (!user) {
      return NextResponse.json({ valid: false, reason: 'invalid' }, { headers: CORS });
    }

    // Ensure the PasswordReset table exists
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PasswordReset" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(), CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id"))`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON "PasswordReset"("userId")`);
    } catch { /* ignore */ }

    const rows = await db.$queryRawUnsafe(
      `SELECT "id", "tokenHash", "expiresAt", "usedAt" FROM "PasswordReset" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 10`,
      user.id,
    ).catch(() => []) as Array<{ id: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }>;

    let foundValid = false;
    let foundExpired = false;
    let foundUsed = false;

    for (const row of rows) {
      const isValid = await verifyPassword(token, row.tokenHash);
      if (!isValid) continue;
      // Token hash matches — check its state
      if (row.usedAt) { foundUsed = true; continue; }
      if (new Date(row.expiresAt).getTime() < Date.now()) { foundExpired = true; continue; }
      foundValid = true;
      break;
    }

    if (foundValid) {
      return NextResponse.json({ valid: true }, { headers: CORS });
    }
    if (foundExpired) {
      return NextResponse.json({ valid: false, reason: 'expired', message: 'This password reset link has expired. Please request a new link.' }, { headers: CORS });
    }
    if (foundUsed) {
      return NextResponse.json({ valid: false, reason: 'used', message: 'This password reset link has already been used or is no longer valid.' }, { headers: CORS });
    }
    return NextResponse.json({ valid: false, reason: 'invalid', message: 'This password reset link is invalid. Please request a new link.' }, { headers: CORS });
  } catch (error) {
    console.error('[ResetPassword GET] Error:', error);
    return NextResponse.json({ valid: false, reason: 'error', message: 'Unable to validate reset link.' }, { status: 500, headers: CORS });
  }
}

export async function POST(request: Request) {
  const platformDb = getPlatformDb();
  let db = platformDb;
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const token = String(body.token || '');
    const newPassword = String(body.newPassword || '');
    // TC_035: Server-side password confirmation validation
    const confirmPassword = String(body.confirmPassword || '');

    if (!email || !token || !newPassword) {
      return NextResponse.json({ error: 'Email, token, and newPassword are required' }, { status: 400, headers: CORS });
    }
    // TC_034: Backend password length validation
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400, headers: CORS });
    }
    if (newPassword.length > 128) {
      return NextResponse.json({ error: 'Password must not exceed 128 characters.' }, { status: 400, headers: CORS });
    }
    // TC_035: Backend password match validation
    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400, headers: CORS });
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
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400, headers: CORS });
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

    // Find the most recent unused, non-expired token for this user
    const rows = await db.$queryRawUnsafe(
      `SELECT "id", "tokenHash", "expiresAt", "usedAt" FROM "PasswordReset"
       WHERE "userId" = $1 AND "usedAt" IS NULL
       ORDER BY "createdAt" DESC LIMIT 5`,
      user.id,
    ).catch(() => []) as Array<{ id: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }>;

    let matchedRow: { id: string; tokenHash: string; expiresAt: Date } | null = null;
    for (const row of rows) {
      // Check expiry first
      if (new Date(row.expiresAt).getTime() < Date.now()) continue;
      // Then check the hash
      const isValid = await verifyPassword(token, row.tokenHash);
      if (isValid) {
        matchedRow = row;
        break;
      }
    }

    if (!matchedRow) {
      return NextResponse.json({ error: 'Invalid or expired token. Please request a new password reset link.' }, { status: 400, headers: CORS });
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
