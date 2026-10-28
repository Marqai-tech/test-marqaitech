/**
 * Task 82 — Apply "autoPresentManagementEnabled" column to
 * AttendancePolicyConfig on the platform DB + ALL dedicated tenant DBs.
 *
 * WHY: /api/attendance-policy-config and the new auto-present engine read
 * the new flag as soon as the code deploys. Tenant DBs missing the column
 * would surface P2022 ("Unknown column") on the policy config load. The
 * ALTER is additive + idempotent (IF NOT EXISTS, DEFAULT false) and safe to
 * run against LIVE while the current (old) build is still running.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

const DDL = `ALTER TABLE "AttendancePolicyConfig" ADD COLUMN IF NOT EXISTS "autoPresentManagementEnabled" BOOLEAN NOT NULL DEFAULT false`;
const VERIFY = `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'AttendancePolicyConfig' AND column_name = 'autoPresentManagementEnabled'`;
const TABLE_EXISTS = `SELECT to_regclass('public."AttendancePolicyConfig"') IS NOT NULL AS tbl`;

async function applyTo(label, cs) {
  const sql = neon(cs);
  try {
    const t = await sql.query(TABLE_EXISTS);
    if (!t[0] || !t[0].tbl) {
      console.log(`[auto-present] ${label}: no AttendancePolicyConfig table — skipped`);
      return;
    }
    await sql.query(DDL);
    const v = await sql.query(VERIFY);
    if (v[0]) {
      console.log(`[auto-present] ${label}: OK — ${v[0].column_name} ${v[0].data_type} default ${v[0].column_default}`);
    } else {
      console.log(`[auto-present] ${label}: ALTER ran but verification query returned nothing`);
    }
  } catch (e) {
    console.error(`[auto-present] ${label}: FAILED — ${e.message}`);
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
  } catch (e) { console.error('[auto-present] Registry read failed:', e.message); }
  console.log(`[auto-present] ${targets.length} target DB(s)`);
  for (const [label, cs] of targets) {
    await applyTo(label, cs);
  }
  console.log('[auto-present] done');
}

main().catch((e) => { console.error(e); process.exit(1); });
