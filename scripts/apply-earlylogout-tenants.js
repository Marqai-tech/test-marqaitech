/**
 * Task 77 — Pre-apply "earlyLogout" column (Attendance) to platform DB + ALL
 * dedicated tenant DBs, and re-verify "isManagement" (Employee) from Task 76.
 *
 * WHY: the incoming commit "Implement attendance punch flow rules" adds
 * Attendance.earlyLogout to the Prisma schema. Any Prisma query that reads
 * Attendance scalar fields (attendance page, etimeoffice sync) would fail with
 * P2022 once the new code deploys, unless the column exists in every DB first.
 * The ALTER is additive + idempotent (IF NOT EXISTS, DEFAULT false) and is
 * safe to run against the LIVE tenant while the current (old) build is running.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

const JOBS = [
  {
    table: 'Attendance',
    ddl: `ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "earlyLogout" BOOLEAN NOT NULL DEFAULT false`,
    verify: `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'Attendance' AND column_name = 'earlyLogout'`,
  },
  {
    table: 'Employee',
    ddl: `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "isManagement" BOOLEAN NOT NULL DEFAULT false`,
    verify: `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'Employee' AND column_name = 'isManagement'`,
  },
];

const TABLE_EXISTS = `SELECT to_regclass('public."Attendance"') IS NOT NULL AS att, to_regclass('public."Employee"') IS NOT NULL AS emp`;

async function applyTo(label, cs) {
  const sql = neon(cs);
  try {
    const t = await sql.query(TABLE_EXISTS);
    for (const job of JOBS) {
      const hasTable = job.table === 'Attendance' ? t[0].att : t[0].emp;
      if (!hasTable) {
        console.log(`[deploy-prep] ${label}: no ${job.table} table — skipped ${job.table}`);
        continue;
      }
      await sql.query(job.ddl);
      const v = await sql.query(job.verify);
      if (v[0]) {
        console.log(`[deploy-prep] ${label}: OK — ${job.table}.${v[0].column_name} ${v[0].data_type} default ${v[0].column_default}`);
      } else {
        console.log(`[deploy-prep] ${label}: ALTER ran but verification returned nothing for ${job.table}`);
      }
    }
  } catch (e) {
    console.error(`[deploy-prep] ${label}: FAILED — ${e.message}`);
  }
}

async function main() {
  const targets = [['platform (neondb)', PLATFORM]];
  const platformSql = neon(PLATFORM);
  try {
    const tenants = await platformSql.query(`
      SELECT t.slug, td."connectionString" AS cs, td."databaseName" AS db
      FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
      WHERE td."isActive" = true`);
    for (const t of tenants) targets.push([`${t.slug} (${t.db})`, t.cs]);
  } catch (e) { console.error('[deploy-prep] Registry read failed:', e.message); }
  console.log(`[deploy-prep] ${targets.length} target DB(s)`);
  for (const [label, cs] of targets) {
    await applyTo(label, cs);
  }
  console.log('[deploy-prep] done');
}

main().catch((e) => { console.error(e); process.exit(1); });
