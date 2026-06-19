/**
 * Runtime schema sync — called lazily from API routes when they detect
 * the production DB is missing SRS-rework columns.
 *
 * This is a BELT-AND-SUSPENDERS layer on top of scripts/schema-sync.js
 * (which runs at build time). If the build-time sync failed (e.g. because
 * POSTGRES_PRISMA_URL wasn't exposed to the Vercel build env), the runtime
 * sync will catch up on the first request that needs the new columns.
 *
 * The sync is idempotent (uses IF NOT EXISTS) and cached in-process for
 * 10 minutes so we don't run ALTER TABLE on every request.
 */

import { neon } from '@neondatabase/serverless';

let lastSyncAt = 0;
let lastSyncPromise: Promise<void> | null = null;
const SYNC_TTL_MS = 10 * 60 * 1000; // 10 minutes

const SYNC_STATEMENTS: string[] = [
  // ─── Tenant: new SRS columns (REQ-GL-01/03/06, REQ-SA-02) ───
  `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en'`,
  `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "baseCurrency" TEXT NOT NULL DEFAULT 'USD'`,
  `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "dataRegion" TEXT`,
  `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionSeats" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "subscriptionStorage" INTEGER NOT NULL DEFAULT 0`,

  // ─── Company: new SRS column (REQ-TA-02 / REQ-GL-01) ───
  `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en'`,

  // ─── FeatureFlag: new table (REQ-SA-05) ───
  `CREATE TABLE IF NOT EXISTS "FeatureFlag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT,
    "source" TEXT NOT NULL DEFAULT 'platform_default',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FeatureFlag_tenantId_key_key" ON "FeatureFlag"("tenantId", "key")`,
  `CREATE INDEX IF NOT EXISTS "FeatureFlag_tenantId_idx" ON "FeatureFlag"("tenantId")`,
];

export async function ensureSchemaSynced(): Promise<void> {
  // Return cached promise if a sync is already in flight
  if (lastSyncPromise) return lastSyncPromise;

  // Skip if we synced recently
  if (Date.now() - lastSyncAt < SYNC_TTL_MS) return;

  lastSyncPromise = (async () => {
    const connectionString =
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL;

    if (!connectionString) {
      console.warn('[runtime-sync] No DATABASE_URL — skipping');
      return;
    }

    // Don't run on SQLite (local dev) — the schema is managed by prisma db push locally
    if (connectionString.startsWith('file:')) {
      return;
    }

    try {
      const sql = neon(connectionString);
      let applied = 0;
      let skipped = 0;

      for (const stmt of SYNC_STATEMENTS) {
        try {
          // IMPORTANT: neon() returns a tagged-template function. Calling
          // sql(stmt) with a string variable treats it as a PARAMETER value,
          // not as raw SQL. Use sql.query(stmt, []) to execute raw DDL.
          await sql.query(stmt, []);
          applied++;
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          if (/already exists|duplicate/i.test(msg)) {
            skipped++;
          } else {
            console.warn(`[runtime-sync] Statement failed (non-fatal): ${msg}`);
            console.warn(`[runtime-sync] SQL: ${stmt.substring(0, 120)}...`);
            skipped++;
          }
        }
      }

      // Foreign key constraint (separate because DROP + ADD pattern)
      try {
        await sql.query(`ALTER TABLE "FeatureFlag" DROP CONSTRAINT IF EXISTS "FeatureFlag_tenantId_fkey"`, []);
        await sql.query(
          `ALTER TABLE "FeatureFlag"
           ADD CONSTRAINT "FeatureFlag_tenantId_fkey"
           FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
           ON DELETE CASCADE ON UPDATE CASCADE`,
          []
        );
        applied++;
      } catch (err) {
        console.warn(`[runtime-sync] FK constraint failed (non-fatal): ${err && err.message ? err.message : err}`);
      }

      lastSyncAt = Date.now();
      console.log(`[runtime-sync] Done. Applied ${applied}, skipped ${skipped}.`);
    } catch (err) {
      console.warn('[runtime-sync] FATAL (non-blocking):', err && err.message ? err.message : err);
    } finally {
      lastSyncPromise = null;
    }
  })();

  return lastSyncPromise;
}

/**
 * Wraps a Prisma operation so that if it fails with a "column does not exist"
 * error (indicating schema drift), we run the schema sync once and retry.
 *
 * Usage:
 *   const tenant = await withSchemaSync(() =>
 *     prisma.tenant.upsert({ where: {...}, update: {...}, create: {...} })
 *   );
 */
export async function withSchemaSync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err && err.message ? err.message : String(err);
    // Detect Prisma's "column does not exist" error and retry once after sync
    if (/column .* does not exist|does not exist in the current database/i.test(msg)) {
      console.warn('[withSchemaSync] Detected missing column — running schema sync and retrying...');
      await ensureSchemaSynced();
      return await fn(); // retry once
    }
    throw err;
  }
}
