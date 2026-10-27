/**
 * Task 129 — Create the ProjectAttachment table (task description / dates /
 * hrs / attachments feature) on the platform DB + ALL active dedicated tenant
 * DBs (same additive-idempotent pattern as task123/125/128).
 *
 * ProjectTask fields (description, plannedStart, plannedEnd, estimatedHours)
 * ALREADY exist — no ALTER needed for them. This script only adds the new
 * attachment table + indexes + FKs.
 *
 * USAGE:
 *   set -a; source .env.production.local; set +a
 *   node scripts/task129-schema.cjs
 *
 * Additive + idempotent — safe to run against LIVE before push.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task129-schema] FATAL: DATABASE_URL not set — run `vercel env pull` first (see header).');
  process.exit(1);
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "ProjectAttachment" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "taskId" TEXT,
      "fileName" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL DEFAULT 0,
      "category" TEXT,
      "dataUrl" TEXT NOT NULL,
      "uploadedById" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ProjectAttachment_projectId_idx" ON "ProjectAttachment"("projectId")`,
  `CREATE INDEX IF NOT EXISTS "ProjectAttachment_taskId_idx" ON "ProjectAttachment"("taskId")`,
  // FKs — guarded (Postgres has no ADD CONSTRAINT IF NOT EXISTS before v9.6+ for DO blocks)
  `DO $$ BEGIN
     ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_projectId_fkey"
       FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
     ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_taskId_fkey"
       FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
     ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_uploadedById_fkey"
       FOREIGN KEY ("uploadedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
];

const VERIFY = `
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'ProjectAttachment'
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
    const cols = new Set(v.map((r) => r.column_name));
    const ok = ['id', 'projectId', 'taskId', 'fileName', 'mimeType', 'fileSize', 'dataUrl', 'uploadedById', 'isActive'].every((c) => cols.has(c));
    console.log(`[task129-schema] ${label}: ${ok ? 'OK' : 'INCOMPLETE'} — ProjectAttachment cols: ${v.map((r) => r.column_name).join(', ')}`);
    return ok;
  } catch (e) {
    console.error(`[task129-schema] ${label}: FAILED — ${e && e.message ? e.message : e}`);
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
    console.error('[task129-schema] Tenant registry read failed:', e.message);
  }
  console.log(`[task129-schema] ${targets.length} target DB(s)`);
  let ok = 0;
  for (const [label, cs] of targets) {
    if (await applyTo(label, cs)) ok += 1;
  }
  console.log(`[task129-schema] done — ${ok}/${targets.length} DBs verified`);
  if (ok !== targets.length) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
