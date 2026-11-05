const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require' });
  await c.connect();
  const del = await c.query(`SELECT "eventKey", channel, status, count(*)::int AS n, min("createdAt") AS first_at FROM "NotificationDelivery" WHERE module='probation' GROUP BY 1,2,3 ORDER BY 1,2`);
  console.log('=== ALL probation deliveries (any review) ===');
  del.rows.forEach(r => console.log(r.eventKey, r.channel, r.status, 'x'+r.n, new Date(r.first_at).toISOString()));
  // templates actually in DB
  const tpl = await c.query(`SELECT module, "eventKey", channels, enabled FROM "NotificationTemplate" WHERE module='probation'`);
  console.log('=== probation templates in DB ===');
  tpl.rows.forEach(r => console.log(r.eventKey, r.channels, 'enabled=' + r.enabled));
  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
