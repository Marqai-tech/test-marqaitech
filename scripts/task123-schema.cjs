/**
 * Task 123 — Apply payroll schema additions to the platform DB + ALL active
 * dedicated tenant DBs (same additive-idempotent pattern as task122).
 *
 * Changes:
 *   Payroll: totalDays, paidDays, lopDays, attendanceJson, processingMode,
 *            processedBy, processedAt
 *   NEW TABLE PayrollSettings (processing mode + statutory configuration)
 *
 * USAGE (pull the LIVE project env first — task122 lesson: never trust
 * embedded platform URLs in old scripts):
 *   vercel env pull --project 3-boxes-hrms --environment production .env.production.local
 *   set -a; source .env.production.local; set +a
 *   node scripts/task123-schema.mjs
 *
 * Additive + idempotent (IF NOT EXISTS) — safe to run against LIVE while the
 * current (old) build is still serving traffic. Run BEFORE `git push`.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task123-schema] FATAL: DATABASE_URL not set — run `vercel env pull` first (see header).');
  process.exit(1);
}

const PAYROLL_COLUMNS = [
  `ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "totalDays" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "paidDays" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "lopDays" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "attendanceJson" TEXT`,
  `ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "processingMode" TEXT`,
  `ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "processedBy" TEXT`,
  `ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3)`,
];

const PAYROLL_SETTINGS_TABLE = [
  `CREATE TABLE IF NOT EXISTS "PayrollSettings" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'IN',
  "processingMode" TEXT NOT NULL DEFAULT 'manual',
  "autoProcessDay" INTEGER NOT NULL DEFAULT 1,
  "payDay" INTEGER,
  "lopEnabled" BOOLEAN NOT NULL DEFAULT true,
  "basicPct" DOUBLE PRECISION NOT NULL DEFAULT 40,
  "hraPctOfBasic" DOUBLE PRECISION NOT NULL DEFAULT 40,
  "conveyanceAmt" DOUBLE PRECISION NOT NULL DEFAULT 1600,
  "medicalAmt" DOUBLE PRECISION NOT NULL DEFAULT 1250,
  "pfEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pfEmployeePct" DOUBLE PRECISION NOT NULL DEFAULT 12,
  "pfEmployerPct" DOUBLE PRECISION NOT NULL DEFAULT 12,
  "pfWageCeiling" DOUBLE PRECISION NOT NULL DEFAULT 15000,
  "esiEnabled" BOOLEAN NOT NULL DEFAULT true,
  "esiEmployeePct" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
  "esiEmployerPct" DOUBLE PRECISION NOT NULL DEFAULT 3.25,
  "esiWageCeiling" DOUBLE PRECISION NOT NULL DEFAULT 21000,
  "ptEnabled" BOOLEAN NOT NULL DEFAULT true,
  "ptMode" TEXT NOT NULL DEFAULT 'slab',
  "ptState" TEXT NOT NULL DEFAULT 'TELANGANA',
  "ptMonthlyAmount" DOUBLE PRECISION NOT NULL DEFAULT 200,
  "tdsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "taxRegime" TEXT NOT NULL DEFAULT 'NEW',
  "tdsMethod" TEXT NOT NULL DEFAULT 'FLAT_ANNUAL',
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PayrollSettings_companyId_key" ON "PayrollSettings"("companyId")`,
  `CREATE INDEX IF NOT EXISTS "PayrollSettings_companyId_idx" ON "PayrollSettings"("companyId")`,
];

const STATEMENTS = [...PAYROLL_COLUMNS, ...PAYROLL_SETTINGS_TABLE];

const VERIFY = `
  SELECT table_name, column_name FROM information_schema.columns
  WHERE (table_name = 'Payroll' AND column_name IN ('totalDays','paidDays','lopDays','attendanceJson','processingMode','processedBy','processedAt'))
     OR (table_name = 'PayrollSettings')
  ORDER BY table_name, column_name`;

async function applyTo(label, cs) {
  const sql = neon(cs);
  try {
    for (const stmt of STATEMENTS) {
      try {
        await sql.query(stmt);
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        if (!/already exists|duplicate/i.test(msg)) throw e;
      }
    }
    const v = await sql.query(VERIFY);
    const payrollCols = v.filter((r) => r.table_name === 'Payroll').length;
    const settingsCols = v.filter((r) => r.table_name === 'PayrollSettings').length;
    console.log(`[task123-schema] ${label}: OK — Payroll ${payrollCols}/7 cols, PayrollSettings ${settingsCols}/30 rows-cols`);
    return payrollCols >= 7 && settingsCols >= 28;
  } catch (e) {
    console.error(`[task123-schema] ${label}: FAILED — ${e && e.message ? e.message : e}`);
    return false;
  }
}

async function main() {
  const targets = [['platform (DATABASE_URL)', PLATFORM]];
  const platformSql = neon(PLATFORM);
  try {
    const tenants = await platformSql.query(`
      SELECT t.slug, td."connectionString" AS cs, td."databaseName" AS db
      FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
      WHERE td."isActive" = true`);
    for (const t of tenants) targets.push([`${t.slug} (${t.db})`, t.cs]);
  } catch (e) {
    console.error('[task123-schema] Tenant registry read failed:', e.message);
  }
  console.log(`[task123-schema] ${targets.length} target DB(s)`);
  let ok = 0;
  for (const [label, cs] of targets) {
    if (await applyTo(label, cs)) ok += 1;
  }
  console.log(`[task123-schema] done — ${ok}/${targets.length} DBs verified`);
  if (ok !== targets.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
