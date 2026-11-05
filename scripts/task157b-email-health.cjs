// Email sender health audit — last 48h NotificationDelivery email outcomes by event.
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL='));
const platform = neon(envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, ''));

(async () => {
  const tenants = await platform.query('SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true');
  const db = neon(tenants.find(x => /marqai/i.test(x.slug)).cs);
  const byEvent = await db.query(`
    SELECT "eventKey", status, COUNT(*)::int AS n
    FROM "NotificationDelivery"
    WHERE channel = 'email' AND "createdAt" >= NOW() - INTERVAL '48 hours'
    GROUP BY "eventKey", status ORDER BY "eventKey", status`);
  console.log('=== last 48h email deliveries by event ===');
  byEvent.forEach(r => console.log(`${r.eventKey.padEnd(48)} ${r.status.padEnd(8)} ${r.n}`));
  const retried = await db.query(`
    SELECT "recipientAddress", status, error FROM "NotificationDelivery"
    WHERE "eventKey"='core_hr.announcement.published' AND "entityId"='cmvt17vsw000208jvdjm1ncl0'
      AND channel='email' AND status='failed' AND error ILIKE '%auto-retries%'
    LIMIT 3`);
  console.log('\ncircuit-breaker rows still failed (no retry yet):', retried.length);
  const recentSend = await db.query(`
    SELECT MAX("createdAt") AS last_ok FROM "NotificationDelivery" WHERE channel='email' AND status='sent'`);
  console.log('last successful email send:', recentSend[0]?.last_ok);
})();
