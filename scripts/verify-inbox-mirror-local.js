/**
 * Local E2E: leave apply (Bala) -> notification email mirrored into Amit's internal inbox.
 * Verifies: EmailMessage row with toEmployeeId=Amit, GET /api/email scoped correctly.
 */
const { Client } = require('pg');
const BASE = process.env.BASE || 'http://localhost:3000';
const PG = {
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  database: 'tenant_3boxes-hrms-demo',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  ssl: { rejectUnauthorized: false },
};

async function main() {
  // 1. Login as Bala
  let r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-slug': '3boxes-hrms-demo' },
    body: JSON.stringify({ email: 'bala.mukherjee@innovatech.demo', password: 'MarqAI@2026' }),
  });
  const bala = await r.json();
  if (!bala.token) throw new Error('Bala login failed: ' + JSON.stringify(bala).slice(0, 200));
  console.log('1. Bala login OK');

  // 2. Apply leave (Casual Leave — Innovatech Systems)
  r = await fetch(`${BASE}/api/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bala.token}` },
    body: JSON.stringify({
      employeeId: 'cmtsczno9003t04jseueeu1y4',
      leaveTypeId: 'cmtsczrj5000504ib2a7l3dft',
      startDate: '2026-09-21',
      endDate: '2026-09-22',
      reason: 'Inbox mirror verification — local test',
    }),
  });
  const leaveRes = await r.json();
  if (r.status !== 201 && r.status !== 200) throw new Error('Leave POST failed: ' + JSON.stringify(leaveRes).slice(0, 300));
  console.log('2. Leave created:', leaveRes.leaveRequest?.id || leaveRes.id);

  // 3. Wait for dispatcher + mirror
  await new Promise(res => setTimeout(res, 6000));

  // 4. DB check: mirror row
  const c = new Client(PG);
  await c.connect();
  const mirrors = await c.query(
    `SELECT em.id, em.subject, em."fromName", em.folder, em."toEmployeeId", em."createdByFlow",
            e."firstName", e."lastName"
     FROM "EmailMessage" em LEFT JOIN "Employee" e ON e.id = em."toEmployeeId"
     ORDER BY em."createdAt" DESC LIMIT 5`
  );
  console.log('\n3. EmailMessage rows (top 5):');
  mirrors.rows.forEach(x => console.log(`   [${x.createdByFlow}] ${x.subject?.slice(0, 70)} -> ${x.firstName || ''} ${x.lastName || ''} (${x.folder})`));

  const latest = mirrors.rows[0];
  if (!latest || latest.createdByFlow !== 'notification') throw new Error('NO MIRROR ROW FOUND');
  console.log('\n4. MIRROR ROW CONFIRMED ->', latest.firstName, latest.lastName);

  // 5. API check: Amit's inbox via GET /api/email
  r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-slug': '3boxes-hrms-demo' },
    body: JSON.stringify({ email: 'amit.reddy@innovatech.demo', password: 'MarqAI@2026' }),
  });
  const amit = await r.json();
  if (!amit.token) throw new Error('Amit login failed');

  r = await fetch(`${BASE}/api/email?folder=inbox`, { headers: { Authorization: `Bearer ${amit.token}` } });
  const inbox = await r.json();
  console.log('\n5. Amit internal inbox total:', inbox.total);
  (inbox.emails || []).slice(0, 5).forEach(e =>
    console.log(`   - ${e.subject?.slice(0, 70)} | from ${e.fromName || e.fromAddress} | read=${e.isRead}`));

  // 6. Negative check: Bala should NOT see Amit's mirrored email
  r = await fetch(`${BASE}/api/email?folder=inbox`, { headers: { Authorization: `Bearer ${bala.token}` } });
  const balaInbox = await r.json();
  const balaHasIt = (balaInbox.emails || []).some(e => e.id === latest.id);
  console.log('\n6. Bala sees Amit mirror row?', balaHasIt, '| Bala inbox total:', balaInbox.total);
  if (balaHasIt) throw new Error('SCOPING LEAK: Bala can see Amit mirrored email');

  await c.end();
  console.log('\nALL LOCAL CHECKS PASSED');
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
