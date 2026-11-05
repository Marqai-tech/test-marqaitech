/**
 * Task 128 — Sync employeeStatus for terminated/resigned employees across the
 * platform DB + ALL active dedicated tenant DBs.
 *
 * Root cause: DELETE /api/employees/[id] (soft-delete = terminate) used to set
 * ONLY status='terminated', leaving a stale employeeStatus ('probation',
 * 'confirmed', …). The mobile app renders employeeStatus when present, so
 * terminated employees showed as "Probation". The API now syncs both fields;
 * this one-off heals the existing rows so every client (web + mobile) shows
 * the right status immediately.
 *
 * Idempotent — safe to re-run.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task128-empstatus] FATAL: DATABASE_URL not set — source .env.production.local first.');
  process.exit(1);
}

const FIX = `
  UPDATE "Employee"
  SET "employeeStatus" = "status", "updatedAt" = NOW()
  WHERE "status" IN ('terminated','resigned')
    AND ("employeeStatus" IS NULL OR "employeeStatus" <> "status")`;

const VERIFY = `
  SELECT "status", "employeeStatus", COUNT(*)::int AS n
  FROM "Employee"
  WHERE "status" IN ('terminated','resigned') OR "employeeStatus" IN ('terminated','resigned')
  GROUP BY 1, 2 ORDER BY 1, 2`;

async function applyTo(label, cs) {
  const sql = neon(cs);
  try {
    const before = await sql.query(`SELECT COUNT(*)::int AS n FROM "Employee" WHERE "status" IN ('terminated','resigned') AND ("employeeStatus" IS NULL OR "employeeStatus" <> "status")`);
    if (before[0].n > 0) {
      await sql.query(FIX);
    }
    const v = await sql.query(VERIFY);
    console.log(`[task128-empstatus] ${label}: fixed ${before[0].n} row(s)`);
    for (const r of v) console.log(`   · status=${r.status} employeeStatus=${r.employeeStatus} count=${r.n}`);
    return true;
  } catch (e) {
    console.error(`[task128-empstatus] ${label}: FAILED — ${e && e.message ? e.message : e}`);
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
    console.error('[task128-empstatus] Tenant registry read failed:', e.message);
  }
  console.log(`[task128-empstatus] ${targets.length} target DB(s)`);
  let ok = 0;
  for (const [label, cs] of targets) {
    if (await applyTo(label, cs)) ok += 1;
  }
  console.log(`[task128-empstatus] done — ${ok}/${targets.length} DBs OK`);
  if (ok !== targets.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
