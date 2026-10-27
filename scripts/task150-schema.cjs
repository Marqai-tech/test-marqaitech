/**
 * Task 150 — Apply the PM-slimming schema to the platform DB + ALL active
 * dedicated tenant DBs (same additive-idempotent pattern as task136).
 *
 * Changes:
 *   ProjectTask.source   TEXT NOT NULL DEFAULT 'internal' — internal | external
 *   ProjectTask.clientId TEXT NULL — the client who raised an external issue
 *   Index ProjectTask.clientId
 *
 * USAGE:
 *   node scripts/task150-schema.cjs   (platform CS hardcoded below, same as
 *   scripts/apply-lnd-schema-tenants.js — set DATABASE_URL env to override)
 *
 * Additive + idempotent (IF NOT EXISTS) — safe to run against LIVE.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
if (!PLATFORM) {
  console.error('[task150-schema] FATAL: no DATABASE_URL');
  process.exit(1);
}

const STATEMENTS = [
  `ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'internal'`,
  `ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "clientId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "ProjectTask_clientId_idx" ON "ProjectTask"("clientId")`,
  `CREATE INDEX IF NOT EXISTS "ProjectTask_source_idx" ON "ProjectTask"("source")`,
];

async function applyTo(label, cs) {
  const sql = neon(cs);
  try {
    for (const stmt of STATEMENTS) {
      try {
        await sql.query(stmt);
      } catch (e) {
        console.log(`  [${label}] statement warning: ${e.message}`);
      }
    }
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ProjectTask' AND column_name IN ('source', 'clientId')`;
    const ok = cols.length === 2;
    console.log(`  [${label}] ${ok ? 'VERIFIED' : 'INCOMPLETE'} — ProjectTask.source/clientId=${cols.length}/2`);
    return ok;
  } catch (e) {
    console.log(`  [${label}] FAILED: ${e.message}`);
    return false;
  }
}

(async () => {
  const results = [];
  results.push(await applyTo('platform', PLATFORM));
  const platform = neon(PLATFORM);
  const tds = await platform`
    SELECT t.slug, td."connectionString" AS cs
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
    WHERE td."isActive" = true AND t.status = 'active'`;
  for (const td of tds) {
    if (!td.cs) { console.log(`  [${td.slug}] no connection string — skipped`); continue; }
    results.push(await applyTo(td.slug, td.cs));
  }
  const okAll = results.every(Boolean);
  console.log(`[task150-schema] ${okAll ? 'ALL DBs VERIFIED' : 'SOME DBs INCOMPLETE'} (${results.filter(Boolean).length}/${results.length})`);
  process.exit(okAll ? 0 : 1);
})();
