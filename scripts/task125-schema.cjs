/**
 * Task 125 — Apply the lopDeduction column addition to the platform DB + ALL
 * active dedicated tenant DBs (same additive-idempotent pattern as task123).
 *
 * Change: Payroll.lopDeduction DOUBLE PRECISION NOT NULL DEFAULT 0
 *         (Loss of Pay presented as an explicit deduction line; gross fixed)
 *
 * USAGE:
 *   /home/z/node_modules/.bin/vercel env pull --project 3-boxes-hrms \
 *     --environment production .env.production.local
 *   set -a; source .env.production.local; set +a
 *   node scripts/task125-schema.cjs
 *
 * Additive + idempotent (IF NOT EXISTS) — safe to run against LIVE before push.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task125-schema] FATAL: DATABASE_URL not set — run `vercel env pull` first (see header).');
  process.exit(1);
}

const STATEMENTS = [
  `ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "lopDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0`,
];

const VERIFY = `
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'Payroll' AND column_name IN ('lopDeduction','lopDays','totalDeductions')
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
    console.log(`[task125-schema] ${label}: OK — Payroll cols found: ${v.map((r) => r.column_name).join(', ')}`);
    return v.some((r) => r.column_name === 'lopDeduction');
  } catch (e) {
    console.error(`[task125-schema] ${label}: FAILED — ${e && e.message ? e.message : e}`);
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
    console.error('[task125-schema] Tenant registry read failed:', e.message);
  }
  console.log(`[task125-schema] ${targets.length} target DB(s)`);
  let ok = 0;
  for (const [label, cs] of targets) {
    if (await applyTo(label, cs)) ok += 1;
  }
  console.log(`[task125-schema] done — ${ok}/${targets.length} DBs verified`);
  if (ok !== targets.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
