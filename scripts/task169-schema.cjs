/**
 * Task 169 — Apply the ProjectTask delivery-breakdown columns to the platform
 * DB + ALL active dedicated tenant DBs (same additive-idempotent pattern as
 * task137/task136/task128).
 *
 * Changes:
 *   ProjectTask.module        TEXT NULL — functional module the task belongs to
 *   ProjectTask.subModule     TEXT NULL — sub-module within the module
 *   ProjectTask.subSection    TEXT NULL — finer sub-section within the sub-module
 *   ProjectTask.softwareLink  TEXT NULL — URL of the related software/feature
 *
 * USAGE:
 *   set -a; source .env.production.local; set +a
 *   node scripts/task169-schema.cjs
 *
 * Additive + idempotent (IF NOT EXISTS) — safe to run against LIVE before push.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task169-schema] FATAL: DATABASE_URL not set — source the production env first (see header).');
  process.exit(1);
}

const STATEMENTS = [
  `ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "module" TEXT`,
  `ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "subModule" TEXT`,
  `ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "subSection" TEXT`,
  `ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "softwareLink" TEXT`,
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
      WHERE table_name = 'ProjectTask'
        AND column_name IN ('module','subModule','subSection','softwareLink')`;
    const have = new Set(cols.map((c) => c.column_name));
    const ok = ['module', 'subModule', 'subSection', 'softwareLink'].every((c) => have.has(c));
    console.log(`  [${label}] ${ok ? 'VERIFIED' : 'INCOMPLETE'} — columns present: ${[...have].sort().join(', ')}`);
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
  console.log(`[task169-schema] ${okAll ? 'ALL DBs VERIFIED' : 'SOME DBs INCOMPLETE'} (${results.filter(Boolean).length}/${results.length})`);
  process.exit(okAll ? 0 : 1);
})();
