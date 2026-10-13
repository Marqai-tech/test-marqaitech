const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require' });
  await c.connect();
  const rid = 'cmv6bx3ak000206jt5gwre03p';
  const del = await c.query(`SELECT "eventKey", channel, status, error, "recipientName", "createdAt" FROM "NotificationDelivery" WHERE "entityId"=$1 ORDER BY "createdAt"`, [rid]);
  console.log(`deliveries for ${rid}: ${del.rowCount}`);
  del.rows.forEach(r => console.log(' ', r.eventKey, r.channel, r.status, (r.error||'').slice(0,70), '→', r.recipientName, new Date(r.createdAt).toISOString().slice(11,19)));
  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
