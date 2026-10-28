const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require' });
  await c.connect();
  const blast = await c.query(`SELECT count(*)::int AS n, min("createdAt") AS since FROM "NotificationDelivery" WHERE error LIKE '%actionExpiresAt is not defined%'`);
  console.log('historical failures from this bug (demo):', blast.rows[0].n, 'since', blast.rows[0].since);
  const del = await c.query(`DELETE FROM "NotificationDelivery" WHERE "entityId" LIKE 'local-repro-%' RETURNING id`);
  console.log('cleaned synthetic repro rows:', del.rowCount);
  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
