/**
 * Task 122 — Apply chat-governance columns to the platform DB + ALL
 * dedicated tenant DBs (same pattern as apply-management-flag-tenants.js).
 *
 * Columns:
 *   CollaborationSettings.chatCustomManagersEnabled BOOLEAN DEFAULT false
 *   CollaborationSettings.chatGroupManagerIds       TEXT    DEFAULT '[]'
 *   CollaborationSettings.chatDirectDeleteEnabled   BOOLEAN DEFAULT true
 *   ChatRoom.deletedAt      TIMESTAMP(3)  (nullable)
 *   ChatRoom.deletedBy      TEXT          (nullable)
 *   ChatRoomMember.isHidden BOOLEAN DEFAULT false
 *   ChatRoomMember.hiddenAt TIMESTAMP(3)  (nullable)
 *
 * Additive + idempotent (IF NOT EXISTS) — safe to run against LIVE while the
 * current (old) build is still serving traffic. Run BEFORE `git push`.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

const STATEMENTS = [
  `ALTER TABLE "CollaborationSettings" ADD COLUMN IF NOT EXISTS "chatCustomManagersEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "CollaborationSettings" ADD COLUMN IF NOT EXISTS "chatGroupManagerIds" TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE "CollaborationSettings" ADD COLUMN IF NOT EXISTS "chatDirectDeleteEnabled" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "ChatRoom" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3)`,
  `ALTER TABLE "ChatRoom" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT`,
  `ALTER TABLE "ChatRoomMember" ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "ChatRoomMember" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3)`,
];

const VERIFY = `
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_name IN ('CollaborationSettings','ChatRoom','ChatRoomMember')
    AND column_name IN ('chatCustomManagersEnabled','chatGroupManagerIds','chatDirectDeleteEnabled','deletedAt','deletedBy','isHidden','hiddenAt')
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
    console.log(`[task122-schema] ${label}: OK — ${v.length}/7 columns present`);
  } catch (e) {
    console.error(`[task122-schema] ${label}: FAILED — ${e && e.message ? e.message : e}`);
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
  } catch (e) {
    console.error('[task122-schema] Tenant registry read failed:', e.message);
  }
  console.log(`[task122-schema] ${targets.length} target DB(s)`);
  for (const [label, cs] of targets) {
    await applyTo(label, cs);
  }
  console.log('[task122-schema] done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
