/**
 * Additive DDL: EmailMessage.toEmployeeId + createdByFlow (+ index) on all tenant DBs.
 * Safe: ADD COLUMN IF NOT EXISTS only — no data writes, no existing column changes.
 * Also checks the platform DB (neondb) in case the table exists there.
 */
const { Client } = require('pg');

const HOST = 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech';
const USER = 'neondb_owner';
const PASSWORD = 'npg_pxZd8woKe4WB';

const TENANT_SLUGS = [
  'acme-global-demo',
  'zenith-retail-demo',
  'nova-tech-demo',
  '3boxes-hrms-demo',
  'marqaitechgroup', // LIVE — additive column only, zero data writes
  '3boxes-corp',
];

const DDL = [
  `ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "toEmployeeId" TEXT`,
  `ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "createdByFlow" TEXT`,
  `CREATE INDEX IF NOT EXISTS "EmailMessage_toEmployeeId_idx" ON "EmailMessage"("toEmployeeId")`,
];

async function applyTo(dbName, label) {
  const c = new Client({ host: HOST, database: dbName, user: USER, password: PASSWORD, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    const has = await c.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema='public' AND table_name='EmailMessage'`
    );
    if (has.rows[0].n === 0) {
      console.log(`${label}: EmailMessage table does not exist — skipped`);
      return;
    }
    for (const stmt of DDL) await c.query(stmt);
    const cols = await c.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='EmailMessage' AND column_name IN ('toEmployeeId','createdByFlow')`
    );
    console.log(`${label}: OK — columns present: ${cols.rows.map(r => r.column_name).join(', ')}`);
  } catch (e) {
    console.error(`${label}: FAILED — ${e.message}`);
    process.exitCode = 1;
  } finally {
    await c.end().catch(() => {});
  }
}

async function main() {
  for (const slug of TENANT_SLUGS) {
    await applyTo(`tenant_${slug}`, `tenant_${slug}`);
  }
  await applyTo('neondb', 'platform (neondb)');
}

main();
