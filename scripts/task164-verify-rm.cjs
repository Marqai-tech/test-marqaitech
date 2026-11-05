#!/usr/bin/env node
/* Task 164 — verify RM notification path: Vardhani (MARQ001) userId vs policy reminder recipients. */
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL='));
const PLATFORM = envLine ? envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim() : '';

async function main() {
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const db = neon(tenants.find((t) => /marqai/i.test(t.slug)).cs);

  const rm = await db.query(`
    SELECT e.id, e."employeeId", e."firstName", e."lastName", e."userId", u.email, u.role
    FROM "Employee" e LEFT JOIN "User" u ON u.id = e."userId"
    WHERE e."employeeId" = 'MARQ001'`);
  console.log('RM (Vardhani MARQ001):', JSON.stringify(rm));

  const rmUserId = rm[0]?.userId;
  if (rmUserId) {
    const del = await db.query(`
      SELECT "eventKey", "entityId", "createdAt" FROM "NotificationDelivery"
      WHERE "recipientId" = $1 AND "eventKey" LIKE 'core_hr.policy%' ORDER BY "createdAt" DESC LIMIT 20`, [rmUserId]);
    console.log(`RM deliveries for ${rmUserId} (${del.length}):`);
    for (const d of del) console.log(JSON.stringify(d));
  } else {
    console.log('RM has NO user account — RM alerts impossible (would need a login)');
  }

  // employees of the tenant: who has no ack for Leave Policy (pending)?
  const pend = await db.query(`
    SELECT e."employeeId", e."firstName" || ' ' || e."lastName" AS name, e."userId" IS NOT NULL AS has_login
    FROM "Employee" e
    WHERE e.status = 'active' AND e.id NOT IN (
      SELECT pa."employeeId" FROM "PolicyAcknowledgment" pa
      WHERE pa."policyId" = 'cmsrblqsd000004kztox7npa1' AND pa.action = 'accepted')
    ORDER BY 1`);
  console.log('\nPENDING (Leave Policy, no accepted ack):');
  for (const p of pend) console.log(JSON.stringify(p));
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
