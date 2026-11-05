/**
 * Task 128 — Apply the ProjectTask task-classification + workflow-step columns
 * to the platform DB + ALL active dedicated tenant DBs (same additive-idempotent
 * pattern as task123/125).
 *
 * Changes:
 *   ProjectTask.taskType     TEXT NULL  (customisation | rework | development | bug)
 *   ProjectTask.workflowStep TEXT NULL  (testing | re_testing | production | delivery)
 *
 * USAGE:
 *   /home/z/node_modules/.bin/vercel env pull --project 3-boxes-hrms \
 *     --environment production .env.production.local
 *   set -a; source .env.production.local; set +a
 *   node scripts/task128-schema.cjs
 *
 * Additive + idempotent (IF NOT EXISTS) — safe to run against LIVE before push.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task128-schema] FATAL: DATABASE_URL not set — run `vercel env pull` first (see header).');
  process.exit(1);
}

const STATEMENTS = [
  `ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "taskType" TEXT`,
  `ALTER TABLE "ProjectTask" ADD COLUMN IF NOT EXISTS "workflowStep" TEXT`,
];

const VERIFY = `
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'ProjectTask' AND column_name IN ('taskType','workflowStep','storyPoints')
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
    console.log(`[task128-schema] ${label}: OK — ProjectTask cols found: ${v.map((r) => r.column_name).join(', ')}`);
    return v.some((r) => r.column_name === 'taskType') && v.some((r) => r.column_name === 'workflowStep');
  } catch (e) {
    console.error(`[task128-schema] ${label}: FAILED — ${e && e.message ? e.message : e}`);
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
    console.error('[task128-schema] Tenant registry read failed:', e.message);
  }
  console.log(`[task128-schema] ${targets.length} target DB(s)`);
  let ok = 0;
  for (const [label, cs] of targets) {
    if (await applyTo(label, cs)) ok += 1;
  }
  console.log(`[task128-schema] done — ${ok}/${targets.length} DBs verified`);
  if (ok !== targets.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
