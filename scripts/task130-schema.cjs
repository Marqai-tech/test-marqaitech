/**
 * Task 130 — Payslip release gate: add "releasedAt" + "releasedById" to the
 * "Payroll" table on the platform DB + ALL active dedicated tenant DBs
 * (same additive-idempotent pattern as task123/125/128/129).
 *
 * A payslip becomes downloadable by the employee only after the payroll
 * manager releases it. The columns are NULL until released.
 *
 * USAGE:
 *   set -a; source /tmp/my-project/.env.production.local; set +a
 *   node scripts/task130-schema.cjs
 *
 * Additive + idempotent — safe to run against LIVE before push.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task130-schema] FATAL: DATABASE_URL not set — run `vercel env pull` first (see header).');
  process.exit(1);
}

const STATEMENTS = [
  `ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "releasedById" TEXT`,
];

const VERIFY = `
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'Payroll' AND column_name IN ('releasedAt', 'releasedById')
  ORDER BY column_name`;

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
    const ok = v.length === 2;
    console.log(`[task130-schema] ${label}: ${ok ? 'OK' : 'INCOMPLETE'} — release cols: ${v.map((r) => r.column_name).join(', ')}`);
    return ok;
  } catch (e) {
    console.error(`[task130-schema] ${label}: FAILED — ${e && e.message ? e.message : e}`);
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
    console.error('[task130-schema] Tenant registry read failed:', e.message);
  }
  console.log(`[task130-schema] ${targets.length} target DB(s)`);
  let ok = 0;
  for (const [label, cs] of targets) {
    if (await applyTo(label, cs)) ok += 1;
  }
  console.log(`[task130-schema] done — ${ok}/${targets.length} DBs verified`);
  if (ok !== targets.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
