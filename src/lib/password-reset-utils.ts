/**
 * Shared user-resolution helper for the password-reset flow.
 *
 * The forgot-password and reset-password routes MUST resolve the user the
 * same way — otherwise a token written by forgot-password (which has a
 * tenant-sweep + LOWER(email) fallback) can't be found by reset-password
 * (which previously only checked x-tenant-slug + platform DB), causing
 * "This password reset link is invalid" for users whose token lives in a
 * different DB than the one the middleware resolves.
 *
 * Resolution cascade:
 *   1. Tenant DB from x-tenant-slug header (Prisma findUnique → LOWER(email) raw SQL)
 *   2. Platform DB (Prisma findUnique → LOWER(email) raw SQL)
 *   3. Tenant-sweep: iterate ALL active tenant DBs (Prisma findUnique → LOWER(email) raw SQL)
 *
 * Returns { user, db } where `db` is the PrismaClient that holds the user's
 * PasswordReset rows (i.e. the DB where the token must be read/written).
 */
import type { PrismaClient } from '@prisma/client';
import { getPlatformDb, getDbForTenant } from '@/lib/tenant-db';

export interface ResolvedUser {
  id: string;
  email: string;
  name: string | null;
  tenantId: string | null;
}

export interface ResolveResult {
  user: ResolvedUser | null;
  db: PrismaClient;
  /** The tenant slug where the user was found (for logging), or '' for platform */
  foundInTenant: string;
}

/**
 * Resolve a user by email across all DBs, using the same cascade as the
 * forgot-password route. Callers: forgot-password POST (write token) and
 * reset-password GET + POST (read/validate token).
 */
export async function resolveUserForPasswordReset(
  email: string,
  tenantSlug: string,
): Promise<ResolveResult> {
  const platformDb = getPlatformDb();
  const lowerEmail = email.trim().toLowerCase();
  let db: PrismaClient = platformDb;
  let user: ResolvedUser | null = null;
  let foundInTenant = '';

  // ─── 1. Tenant DB from x-tenant-slug header ───────────────────────
  if (tenantSlug) {
    try {
      const tenantDb = await getDbForTenant(tenantSlug);
      const u = await tenantDb.user.findUnique({
        where: { email: lowerEmail },
        select: { id: true, email: true, name: true, tenantId: true },
      }).catch(() => null);
      if (u) {
        user = u;
        db = tenantDb;
        foundInTenant = tenantSlug;
      } else {
        // LOWER(email) raw SQL fallback (case-insensitive, schema-drift safe)
        try {
          const rows = await tenantDb.$queryRawUnsafe(
            `SELECT "id", "email", "name", "tenantId" FROM "User" WHERE LOWER("email") = $1 LIMIT 1`,
            lowerEmail,
          ) as Array<{ id: string; email: string; name: string | null; tenantId: string | null }>;
          if (rows && rows.length > 0) {
            user = { id: rows[0].id, email: rows[0].email, name: rows[0].name, tenantId: rows[0].tenantId };
            db = tenantDb;
            foundInTenant = tenantSlug;
          }
        } catch { /* fall through */ }
      }
    } catch (e) {
      console.warn('[resolveUserForPasswordReset] Tenant DB lookup failed:', e);
    }
  }

  // ─── 2. Platform DB ───────────────────────────────────────────────
  if (!user) {
    const platformUser = await platformDb.user.findUnique({
      where: { email: lowerEmail },
      select: { id: true, email: true, name: true, tenantId: true },
    }).catch(() => null);
    if (platformUser) {
      user = platformUser;
      db = platformDb;
      foundInTenant = '';
    } else {
      // LOWER(email) raw SQL fallback on platform DB
      try {
        const rows = await platformDb.$queryRawUnsafe(
          `SELECT "id", "email", "name", "tenantId" FROM "User" WHERE LOWER("email") = $1 LIMIT 1`,
          lowerEmail,
        ) as Array<{ id: string; email: string; name: string | null; tenantId: string | null }>;
        if (rows && rows.length > 0) {
          user = { id: rows[0].id, email: rows[0].email, name: rows[0].name, tenantId: rows[0].tenantId };
          db = platformDb;
          foundInTenant = '';
        }
      } catch { /* fall through to sweep */ }
    }
  }

  // ─── 3. Tenant-sweep: iterate ALL active tenant DBs ────────────────
  // Handles test-platform hosts where the middleware sets x-tenant-slug
  // to empty (platform) but the user actually lives in a tenant DB.
  if (!user) {
    try {
      const sweepDbs = await platformDb.tenantDatabase.findMany({
        where: { isActive: true },
        select: { connectionString: true, tenant: { select: { slug: true } } },
      });
      for (const td of sweepDbs) {
        if (!td.connectionString || !td.tenant?.slug) continue;
        if (td.tenant.slug === tenantSlug) continue; // already tried above
        try {
          const sweepTenantDb = await getDbForTenant(td.tenant.slug);
          let candidate = await sweepTenantDb.user.findUnique({
            where: { email: lowerEmail },
            select: { id: true, email: true, name: true, tenantId: true },
          }).catch(() => null);
          if (!candidate) {
            try {
              const rows = await sweepTenantDb.$queryRawUnsafe(
                `SELECT "id", "email", "name", "tenantId" FROM "User" WHERE LOWER("email") = $1 LIMIT 1`,
                lowerEmail,
              ) as Array<{ id: string; email: string; name: string | null; tenantId: string | null }>;
              if (rows && rows.length > 0) {
                candidate = { id: rows[0].id, email: rows[0].email, name: rows[0].name, tenantId: rows[0].tenantId };
              }
            } catch { /* try next tenant DB */ }
          }
          if (candidate) {
            user = candidate;
            db = sweepTenantDb;
            foundInTenant = td.tenant.slug;
            console.log(`[resolveUserForPasswordReset] Found ${lowerEmail} in tenant DB: ${td.tenant.slug}`);
            break;
          }
        } catch (sweepDbErr) {
          console.warn(`[resolveUserForPasswordReset] Tenant sweep skipped ${td.tenant.slug}:`, sweepDbErr);
          continue;
        }
      }
    } catch (sweepErr) {
      console.error('[resolveUserForPasswordReset] Tenant sweep failed:', sweepErr);
    }
  }

  return { user, db, foundInTenant };
}

/**
 * Ensure the PasswordReset table exists on the given DB.
 * Idempotent — safe to call on every request.
 */
export async function ensurePasswordResetTable(db: PrismaClient): Promise<void> {
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
  } catch {
    /* ignore — table may already exist */
  }
}
