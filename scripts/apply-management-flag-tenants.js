/**
 * Task 76 — Apply "isManagement" column (Management designation) to
 * platform DB + ALL dedicated tenant DBs.
 *
 * WHY: GET /api/employees uses Prisma select-all (omit avatar). Once the new
 * code (which adds Employee.isManagement to the Prisma schema) deploys, every
 * tenant DB MUST have the column or the list API fails with P2022.
 * The ALTER is additive + idempotent (IF NOT EXISTS, DEFAULT false) and is
 * safe to run against the LIVE tenant while the current (old) build is running.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

const DDL = `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "isManagement" BOOLEAN NOT NULL DEFAULT false`;
const VERIFY = `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'Employee' AND column_name = 'isManagement'`;
const TABLE_EXISTS = `SELECT to_regclass('public."Employee"') IS NOT NULL AS tbl`;

async function applyTo(label, cs) {
  const sql = neon(cs);
  try {
    const t = await sql.query(TABLE_EXISTS);
    if (!t[0] || !t[0].tbl) {
      console.log(`[mgmt-flag] ${label}: no Employee table — skipped`);
      return;
    }
    await sql.query(DDL);
    const v = await sql.query(VERIFY);
    if (v[0]) {
      console.log(`[mgmt-flag] ${label}: OK — isManagement ${v[0].data_type} default ${v[0].column_default}`);
    } else {
      console.log(`[mgmt-flag] ${label}: ALTER ran but verification query returned nothing`);
    }
  } catch (e) {
    console.error(`[mgmt-flag] ${label}: FAILED — ${e.message}`);
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
  } catch (e) { console.error('[mgmt-flag] Registry read failed:', e.message); }
  console.log(`[mgmt-flag] ${targets.length} target DB(s)`);
  for (const [label, cs] of targets) {
    await applyTo(label, cs);
  }
  console.log('[mgmt-flag] done');
}

main().catch((e) => { console.error(e); process.exit(1); });
