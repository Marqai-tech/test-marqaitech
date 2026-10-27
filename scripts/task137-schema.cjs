/**
 * Task 137 — Apply the employee-module schema additions to the platform DB +
 * ALL active dedicated tenant DBs (same additive-idempotent pattern as
 * task136/task128).
 *
 * Changes:
 *   Employee.interests TEXT NULL — comma-separated personal interests chips.
 *   Experience.companyLogo TEXT NULL — auto-fetched public company logo URL.
 *   Experience.companyCategory TEXT NULL — Listed / Non-Listed / Government / PSU / Startup.
 *   Experience.companyLevel TEXT NULL — MNC / Tier-1 / Tier-2 / Large / Mid / Startup / Small.
 *
 * USAGE:
 *   set -a; source .env.production.local; set +a
 *   node scripts/task137-schema.cjs
 *
 * Additive + idempotent (IF NOT EXISTS) — safe to run against LIVE before push.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task137-schema] FATAL: DATABASE_URL not set — source the production env first (see header).');
  process.exit(1);
}

const STATEMENTS = [
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "interests" TEXT`,
  `ALTER TABLE "Experience" ADD COLUMN IF NOT EXISTS "companyLogo" TEXT`,
  `ALTER TABLE "Experience" ADD COLUMN IF NOT EXISTS "companyCategory" TEXT`,
  `ALTER TABLE "Experience" ADD COLUMN IF NOT EXISTS "companyLevel" TEXT`,
];

async function applyTo(label, cs) {
  const sql = neon(cs);
  try {
    for (const stmt of STATEMENTS) {
      try {
        await sql.query(stmt);
      } catch (e) {
        // statement-level failures (e.g. Experience table not present in this
        // DB yet) are reported but don't stop the remaining statements
        console.log(`  [${label}] statement warning: ${e.message}`);
      }
    }
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE (table_name = 'Employee' AND column_name = 'interests')
         OR (table_name = 'Experience' AND column_name IN ('companyLogo','companyCategory','companyLevel'))`;
    const have = new Set(cols.map((c) => c.column_name));
    const ok = have.has('interests') && have.has('companyLogo') && have.has('companyCategory') && have.has('companyLevel');
    console.log(`  [${label}] ${ok ? 'VERIFIED' : 'INCOMPLETE'} — columns present: ${[...have].join(', ')}`);
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
  console.log(`[task137-schema] ${okAll ? 'ALL DBs VERIFIED' : 'SOME DBs INCOMPLETE'} (${results.filter(Boolean).length}/${results.length})`);
  process.exit(okAll ? 0 : 1);
})();
