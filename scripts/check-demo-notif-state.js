/**
 * Check demo tenant SMTP config + notification deliveries (READ-ONLY).
 * Tenant: 3boxes-hrms-demo ONLY.
 */
const { Client } = require('pg');

const PLATFORM = {
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  database: 'neondb',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  ssl: { rejectUnauthorized: false },
};
const TENANT_DB = 'tenant_3boxes-hrms-demo';

async function main() {
  const c = new Client({ ...PLATFORM, database: TENANT_DB });
  await c.connect();

  const cfg = await c.query(
    `SELECT "emailIntegrationEnabled", "emailProvider", "smtpHost", "smtpPort",
            "smtpUsername", "smtpFromName", "smtpFromAddress", "smtpEncryption",
            "smtpVerifiedAt", "smtpVerifyError"
     FROM "CollaborationSettings" LIMIT 3`
  );
  console.log('=== SMTP CONFIG (demo tenant) ===');
  cfg.rows.forEach(r => console.log(JSON.stringify(r, null, 1)));

  const stats = await c.query(
    `SELECT channel, status, COUNT(*)::int AS n
     FROM "NotificationDelivery" GROUP BY channel, status ORDER BY channel, status`
  );
  console.log('\n=== NOTIFICATION DELIVERY STATS (all time) ===');
  stats.rows.forEach(r => console.log(`${r.channel.padEnd(8)} ${r.status.padEnd(10)} ${r.n}`));

  const recent = await c.query(
    `SELECT "eventKey", channel, status, "recipientName", "recipientAddress", subject, "createdAt"
     FROM "NotificationDelivery"
     ORDER BY "createdAt" DESC LIMIT 10`
  );
  console.log('\n=== 10 MOST RECENT DELIVERIES ===');
  recent.rows.forEach(r =>
    console.log(`${r.createdAt?.toISOString?.() || r.createdAt} | ${(r.eventKey || '').padEnd(26)} | ${(r.channel || '').padEnd(7)} | ${(r.status || '').padEnd(8)} | ${r.recipientName || '—'} <${r.recipientAddress || '—'}> | ${r.subject || ''}`)
  );

  const em = await c.query(`SELECT COUNT(*)::int AS n FROM "EmailMessage"`);
  console.log('\n=== EmailMessage (Collaboration > Email inbox) total rows:', em.rows[0].n, '===');

  const emp = await c.query(
    `SELECT e.id, e."employeeId", e."firstName", e."lastName", u.email,
            e."reportingManagerId", m."firstName" AS "mgrFirst", m."lastName" AS "mgrLast",
            mu.email AS "mgrEmail", c.name AS company
     FROM "Employee" e
     JOIN "User" u ON u.id = e."userId"
     LEFT JOIN "Employee" m ON m.id = e."reportingManagerId"
     LEFT JOIN "User" mu ON mu.id = m."userId"
     LEFT JOIN "Company" c ON c.id = e."companyId"
     WHERE u.email LIKE '%@innovatech.demo'
     ORDER BY e."firstName" LIMIT 10`
  );
  console.log('\n=== DEMO EMPLOYEES + MANAGERS (live-test candidates) ===');
  emp.rows.forEach(r =>
    console.log(`${r.firstName} ${r.lastName} <${r.email}> | mgr: ${r.mgrFirst || '—'} ${r.mgrLast || ''} <${r.mgrEmail || '—'}> | ${r.company}`)
  );

  await c.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
