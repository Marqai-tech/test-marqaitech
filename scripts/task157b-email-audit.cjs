// Inspect failed email deliveries for the Task 157 broadcast E2E post.
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL='));
const platform = neon(envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, ''));

(async () => {
  const tenants = await platform.query('SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true');
  const db = neon(tenants.find(x => /marqai/i.test(x.slug)).cs);
  const POST = 'cmvt17vsw000208jvdjm1ncl0';
  const rows = await db.query(
    `SELECT channel, "recipientName", "recipientAddress", status, LEFT(COALESCE(error, ''), 100) AS err
     FROM "NotificationDelivery"
     WHERE "eventKey" = 'core_hr.announcement.published' AND "entityId" = $1
     ORDER BY channel, status`, [POST]);
  rows.forEach(r => console.log(`${String(r.channel).padEnd(6)} ${String(r.status).padEnd(7)} ${String(r.recipientname || r.recipientName || '').padEnd(22)} ${String(r.recipientaddress || r.recipientAddress || '(no address)').padEnd(32)} ${r.err || ''}`));
  if (rows.length === 0) console.log('(no rows — post deleted or deliveries purged)');
  const u = await db.query(`SELECT email FROM "User" WHERE status='active' ORDER BY email`);
  console.log('\nactive users w/ emails:', u.map(r => r.email).join(', '));
})();
