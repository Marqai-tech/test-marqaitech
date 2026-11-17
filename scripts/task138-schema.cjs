/**
 * Task 138 — Apply the social-feeds / achievements / experience-letters /
 * KYC-verification schema additions to the platform DB + ALL active dedicated
 * tenant DBs (same additive-idempotent pattern as task136/task137).
 *
 * Changes:
 *   Experience.letters TEXT NULL          — JSON [{name,type,fileUrl}] offer/relieving letters.
 *   Experience.domains TEXT NULL          — JSON ["Development","Testing",…] multi-select.
 *   Employee.kycVerification TEXT NULL    — JSON verification result (Aadhaar QR / XML / PAN / DigiLocker).
 *   Employee.kycVerifiedAt TIMESTAMP(3) NULL
 *   EmployeeAchievement TABLE             — achievements rows (title/description/category/issuer/achievedOn).
 *   CollaborationSettings.feedCreationMode TEXT DEFAULT 'admins'
 *   CollaborationSettings.feedCreatorIds  TEXT DEFAULT '[]'
 *
 * USAGE:
 *   set -a; source .env.production.local; set +a
 *   node scripts/task138-schema.cjs
 *
 * Additive + idempotent (IF NOT EXISTS) — safe to run against LIVE before push.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task138-schema] FATAL: DATABASE_URL not set — source the production env first (see header).');
  process.exit(1);
}

const STATEMENTS = [
  `ALTER TABLE "Experience" ADD COLUMN IF NOT EXISTS "letters" TEXT`,
  `ALTER TABLE "Experience" ADD COLUMN IF NOT EXISTS "domains" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "kycVerification" TEXT`,
  `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "kycVerifiedAt" TIMESTAMP(3)`,
  `CREATE TABLE IF NOT EXISTS "EmployeeAchievement" (
      "id" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "category" TEXT NOT NULL DEFAULT 'previous_company',
      "issuer" TEXT,
      "achievedOn" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EmployeeAchievement_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "EmployeeAchievement_employeeId_idx" ON "EmployeeAchievement"("employeeId")`,
  `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeAchievement_employeeId_fkey') THEN
        ALTER TABLE "EmployeeAchievement" ADD CONSTRAINT "EmployeeAchievement_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
   END $$;`,
  `ALTER TABLE "CollaborationSettings" ADD COLUMN IF NOT EXISTS "feedCreationMode" TEXT DEFAULT 'admins'`,
  `ALTER TABLE "CollaborationSettings" ADD COLUMN IF NOT EXISTS "feedCreatorIds" TEXT DEFAULT '[]'`,
];

const VERIFY_COLUMNS = ['letters', 'domains', 'kycVerification', 'kycVerifiedAt', 'feedCreationMode', 'feedCreatorIds'];

async function applyTo(label, cs) {
  const sql = neon(cs);
  try {
    for (const stmt of STATEMENTS) {
      try {
        await sql.query(stmt);
      } catch (e) {
        // statement-level failures (e.g. a table not present in this DB yet)
        // are reported but don't stop the remaining statements
        console.log(`  [${label}] statement warning: ${e.message}`);
      }
    }
    const cols = await sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name = 'Experience' AND column_name IN ('letters','domains'))
         OR (table_name = 'Employee' AND column_name IN ('kycVerification','kycVerifiedAt'))
         OR (table_name = 'CollaborationSettings' AND column_name IN ('feedCreationMode','feedCreatorIds'))`;
    const have = new Set(cols.map((c) => c.column_name));
    const colsOk = VERIFY_COLUMNS.every((c) => have.has(c));
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'EmployeeAchievement'`;
    const tableOk = tables.length > 0;
    const ok = colsOk && tableOk;
    console.log(`  [${label}] ${ok ? 'VERIFIED' : 'INCOMPLETE'} — columns: ${[...have].join(', ')}; achievement table: ${tableOk}`);
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
  console.log(`[task138-schema] ${okAll ? 'ALL DBs VERIFIED' : 'SOME DBs INCOMPLETE'} (${results.filter(Boolean).length}/${results.length})`);
  process.exit(okAll ? 0 : 1);
})();
