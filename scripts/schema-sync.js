/**
 * SRS Schema Sync Script (build-time)
 *
 * Applies the additive schema changes introduced by the SRS rework (commit 03f980e)
 * directly via raw SQL using IF NOT EXISTS guards. This is MORE RELIABLE than
 * `prisma db push` on Vercel because:
 *
 *   1. It only ADDS columns/tables — never drops or renames anything.
 *   2. It uses IF NOT EXISTS so re-runs are safe (idempotent).
 *   3. It doesn't require an interactive prompt or --accept-data-loss.
 *   4. It uses @neondatabase/serverless directly (no Prisma client needed),
 *      so it works even before `prisma generate` has fully populated the
 *      generated client output.
 *
 * This script is invoked from the Vercel build command (see vercel.json)
 * AFTER `prisma generate` and BEFORE `next build`. If it fails for any reason,
 * the failure is logged but does NOT block the build — the hardened login
 * route (which uses explicit `select`) will still work even if some columns
 * are missing.
 */

const { neon } = require('@neondatabase/serverless');

async function main() {
  const connectionString =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn('[schema-sync] No DATABASE_URL — skipping schema sync.');
    return;
  }

  const masked = connectionString.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  console.log(`[schema-sync] Connecting to: ${masked.substring(0, 70)}...`);

  const sql = neon(connectionString);

  // Each statement uses IF NOT EXISTS / CREATE TABLE IF NOT EXISTS so the
  // script is safe to re-run. We only ADD columns — never drop, never rename,
  // never change types. This means it cannot cause data loss.
  const statements = [
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

  let applied = 0;
  let skipped = 0;

  for (const stmt of statements) {
    try {
      await sql(stmt);
      applied++;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (/already exists|duplicate|exists/i.test(msg)) {
        skipped++;
      } else {
        console.warn(`[schema-sync] Statement failed (non-fatal): ${msg}`);
        console.warn(`[schema-sync] SQL: ${stmt.substring(0, 120)}...`);
        skipped++;
      }
    }
  }

  // Foreign key constraint — add separately because ALTER TABLE ADD CONSTRAINT
  // IF NOT EXISTS is only supported on Postgres 9.0+. Neon supports it.
  try {
    await sql(`
      ALTER TABLE "FeatureFlag"
      DROP CONSTRAINT IF EXISTS "FeatureFlag_tenantId_fkey"
    `);
    await sql(`
      ALTER TABLE "FeatureFlag"
      ADD CONSTRAINT "FeatureFlag_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    applied++;
  } catch (err) {
    console.warn(`[schema-sync] FK constraint failed (non-fatal): ${err && err.message ? err.message : err}`);
    skipped++;
  }

  console.log(`[schema-sync] Done. Applied ${applied} statement(s), skipped ${skipped}.`);
}

main().catch((err) => {
  console.warn('[schema-sync] FATAL (non-blocking):', err && err.message ? err.message : err);
  // Exit 0 so the build continues even if schema sync fails.
  process.exit(0);
});
