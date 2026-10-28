const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require' });
  await c.connect();
  // workflow config shape
  const cfg = await c.query(`SELECT id, "workflowType", "isActive", config FROM "EmployeeWorkflowConfig" WHERE "workflowType"='probation_confirmation' ORDER BY "updatedAt" DESC LIMIT 3`);
  console.log('=== probation workflow configs ===');
  cfg.rows.forEach(r => console.log(r.id, r.isActive, JSON.stringify(r.config).slice(0, 300)));
  // deliveries for the new review
  const rid = 'cmv6bii5x000b06l6cuvqu7w2';
  const del = await c.query(`SELECT "eventKey", channel, status, error, "recipientId", "recipientName" FROM "NotificationDelivery" WHERE "entityId"=$1 ORDER BY "createdAt"`, [rid]);
  console.log(`=== deliveries for new review ${rid} ===`);
  del.rows.forEach(r => console.log(r.eventKey, r.channel, r.status, (r.error||'').slice(0,80), r.recipientName || r.recipientId));
  // tenant user roles
  const users = await c.query(`SELECT email, role, status FROM "User" WHERE status='active' ORDER BY role LIMIT 15`);
  console.log('=== active tenant users ===');
  users.rows.forEach(r => console.log(r.email, r.role));
  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
