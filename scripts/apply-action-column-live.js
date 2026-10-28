/** Task 78 — apply PolicyAcknowledgment.action to LIVE tenant DB (post-cs-fix) */
const { neon } = require('@neondatabase/serverless');
const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const platformSql = neon(PLATFORM);
  const t = await platformSql.query(
    `SELECT td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE t.slug = 'marqaitechgroup'`
  );
  const db = neon(t[0].cs);
  await db.query(`ALTER TABLE "PolicyAcknowledgment" ADD COLUMN IF NOT EXISTS "action" TEXT NOT NULL DEFAULT 'accepted'`);
  const v = await db.query(
    `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='PolicyAcknowledgment' AND column_name='action'`
  );
  console.log('LIVE PolicyAcknowledgment.action:', v[0] ? `${v[0].data_type} default ${v[0].column_default}` : 'MISSING');
  const n = await db.query(`SELECT COUNT(*)::int AS n FROM "Employee"`);
  console.log('LIVE Employee rows:', n[0].n);
}

main().catch(e => { console.error('ERR', e.message.split('\n')[0]); process.exit(1); });
