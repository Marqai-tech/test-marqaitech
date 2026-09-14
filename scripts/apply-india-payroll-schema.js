/**
 * Targeted schema sync (Task 37 — Indian Payroll): applies ONLY the
 * PayrollStatutoryConfig table + additive columns on FNFCalculation and
 * IncomeTaxDeclaration. Additive-only (IF NOT EXISTS), idempotent.
 *
 * Usage: node scripts/apply-india-payroll-schema.js <connectionString>
 */
const { neon } = require('@neondatabase/serverless');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "PayrollStatutoryConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "ptState" TEXT,
    "lwfState" TEXT,
    "pfOnActualBasic" BOOLEAN NOT NULL DEFAULT false,
    "pfWageCeiling" DOUBLE PRECISION NOT NULL DEFAULT 15000,
    "pfAdminCharges" BOOLEAN NOT NULL DEFAULT true,
    "esiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "esiWageLimit" DOUBLE PRECISION NOT NULL DEFAULT 21000,
    "tdsRegimeDefault" TEXT NOT NULL DEFAULT 'NEW',
    "declarationWindowMonth" INTEGER NOT NULL DEFAULT 4,
    "proofWindowMonth" INTEGER NOT NULL DEFAULT 1,
    "proofDeadlineMonth" INTEGER NOT NULL DEFAULT 1,
    "tdsAdjustFromMonth" INTEGER NOT NULL DEFAULT 2,
    "varianceThresholdPct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "notes" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollStatutoryConfig_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PayrollStatutoryConfig_companyId_key" ON "PayrollStatutoryConfig"("companyId")`,
  `CREATE INDEX IF NOT EXISTS "PayrollStatutoryConfig_companyId_idx" ON "PayrollStatutoryConfig"("companyId")`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollStatutoryConfig_companyId_fkey') THEN
       ALTER TABLE "PayrollStatutoryConfig" ADD CONSTRAINT "PayrollStatutoryConfig_companyId_fkey"
       FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  // FNFCalculation — India F&F addendum
  `ALTER TABLE "FNFCalculation" ADD COLUMN IF NOT EXISTS "gratuityAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "FNFCalculation" ADD COLUMN IF NOT EXISTS "gratuityEligible" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "FNFCalculation" ADD COLUMN IF NOT EXISTS "leaveEncashmentExempt" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "FNFCalculation" ADD COLUMN IF NOT EXISTS "leaveEncashmentTaxable" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "FNFCalculation" ADD COLUMN IF NOT EXISTS "noticeBuyoutDays" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "FNFCalculation" ADD COLUMN IF NOT EXISTS "noticeBuyoutAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "FNFCalculation" ADD COLUMN IF NOT EXISTS "lwdDate" TIMESTAMP(3)`,
  `ALTER TABLE "FNFCalculation" ADD COLUMN IF NOT EXISTS "clearanceCleared" BOOLEAN NOT NULL DEFAULT false`,
  // IncomeTaxDeclaration — proof verification workflow
  `ALTER TABLE "IncomeTaxDeclaration" ADD COLUMN IF NOT EXISTS "proofStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED'`,
  `ALTER TABLE "IncomeTaxDeclaration" ADD COLUMN IF NOT EXISTS "proofSubmittedAt" TIMESTAMP(3)`,
  `ALTER TABLE "IncomeTaxDeclaration" ADD COLUMN IF NOT EXISTS "proofDocs" TEXT`,
  `ALTER TABLE "IncomeTaxDeclaration" ADD COLUMN IF NOT EXISTS "sectionProofStatus" TEXT`,
  `ALTER TABLE "IncomeTaxDeclaration" ADD COLUMN IF NOT EXISTS "regimeElectionLocked" BOOLEAN NOT NULL DEFAULT false`,
];

async function main() {
  const connectionString = process.argv[2] || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[in-pay-sync] No connection string provided');
    process.exit(1);
  }
  const sql = neon(connectionString);
  for (const stmt of STATEMENTS) {
    const name = (stmt.match(/"(?:CREATE (?:UNIQUE )?INDEX IF NOT EXISTS )"?(\w+)/) || [])[1]
      || (stmt.match(/ALTER TABLE "(\w+)"/) || [])[1]
      || stmt.slice(0, 60);
    try {
      await sql.query(stmt);
      console.log(`[in-pay-sync] OK: ${name}`);
    } catch (err) {
      if (String(err.message || err).includes('already exists')) {
        console.log(`[in-pay-sync] SKIP (exists): ${name}`);
      } else {
        console.error(`[in-pay-sync] FAIL: ${name} -> ${err.message || err}`);
        process.exitCode = 1;
      }
    }
  }
  const cols = await sql.query(`SELECT column_name FROM information_schema.columns WHERE table_name='IncomeTaxDeclaration' AND column_name='proofStatus'`);
  const tbl = await sql.query(`SELECT table_name FROM information_schema.tables WHERE table_name='PayrollStatutoryConfig'`);
  console.log(`[in-pay-sync] Verified: PayrollStatutoryConfig=${tbl.length}, proofStatus column=${cols.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
