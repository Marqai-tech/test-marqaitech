/**
 * Task 136 — Apply the birthday schema to the platform DB + ALL active
 * dedicated tenant DBs (same additive-idempotent pattern as task128).
 *
 * Changes:
 *   Employee.originalBirthday TIMESTAMP(3) NULL — the REAL birth date used
 *     for birthday celebrations (dateOfBirth stays the official record).
 *   BirthdayGreeting table — one row per greeting (auto cron / manual wishes),
 *     the dedupe ledger (employeeId + year + source + senderUserId).
 *
 * USAGE:
 *   set -a; source .env.production.local; set +a
 *   node scripts/task136-schema.cjs
 *
 * Additive + idempotent (IF NOT EXISTS) — safe to run against LIVE before push.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task136-schema] FATAL: DATABASE_URL not set — source the production env first (see header).');
  process.exit(1);
}

const STATEMENTS = [
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "originalBirthday" TIMESTAMP(3)`,
  `CREATE TABLE IF NOT EXISTS "BirthdayGreeting" (
      "id" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "year" INTEGER NOT NULL,
      "source" TEXT NOT NULL DEFAULT 'manual',
      "senderUserId" TEXT,
      "senderName" TEXT,
      "message" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BirthdayGreeting_pkey" PRIMARY KEY ("id")
    )`,
  `CREATE INDEX IF NOT EXISTS "BirthdayGreeting_employeeId_year_idx" ON "BirthdayGreeting"("employeeId", "year")`,
  `CREATE INDEX IF NOT EXISTS "BirthdayGreeting_year_idx" ON "BirthdayGreeting"("year")`,
];

const VERIFY = `
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'Employee' AND column_name = 'originalBirthday'`;

async function applyTo(label, cs) {
  const sql = neon(cs);
  try {
    for (const stmt of STATEMENTS) {
      try {
        await sql.query(stmt);
      } catch (e) {
        // statement-level failures (e.g. table not present in this DB) are
        // reported but don't stop the remaining statements
        console.log(`  [${label}] statement warning: ${e.message}`);
      }
    }
    const v = await sql`SELECT table_name FROM information_schema.tables WHERE table_name = 'BirthdayGreeting'`;
    const col = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'Employee' AND column_name = 'originalBirthday'`;
    const ok = v.length === 1 && col.length === 1;
    console.log(`  [${label}] ${ok ? 'VERIFIED' : 'INCOMPLETE'} — Employee.originalBirthday=${col.length}, BirthdayGreeting table=${v.length}`);
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
  console.log(`[task136-schema] ${okAll ? 'ALL DBs VERIFIED' : 'SOME DBs INCOMPLETE'} (${results.filter(Boolean).length}/${results.length})`);
  process.exit(okAll ? 0 : 1);
})();
