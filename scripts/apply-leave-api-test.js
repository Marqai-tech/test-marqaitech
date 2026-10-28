/** Get Bala's employee record + leave types + submit leave via demo API + check deliveries. */
const { Client } = require('pg');
const BASE = 'https://nexus-hrms-mu.vercel.app';
const PG = {
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  database: 'tenant_3boxes-hrms-demo',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  ssl: { rejectUnauthorized: false },
};

async function main() {
  const c = new Client(PG);
  await c.connect();

  const e = await c.query(
    `SELECT e.id, e."firstName", e."lastName", e."reportingManagerId", e."companyId",
            m."userId" AS "mgrUserId", mu.email AS "mgrEmail", m."firstName" AS "mgrFirst"
     FROM "Employee" e
     JOIN "User" u ON u.id = e."userId"
     LEFT JOIN "Employee" m ON m.id = e."reportingManagerId"
     LEFT JOIN "User" mu ON mu.id = m."userId"
     WHERE u.email = 'bala.mukherjee@innovatech.demo'`
  );
  const bala = e.rows[0];
  console.log('BALA:', JSON.stringify(bala, null, 1));

  const lt = await c.query(
    `SELECT lt.id, lt.name FROM "LeaveType" lt
     WHERE lt."companyId" = $1 ORDER BY lt.name`,
    [bala.companyId]
  );
  console.log('LEAVE TYPES:', lt.rows.map(r => `${r.name}=${r.id}`).join(' | '));

  // Find Bala's entitlement-linked casual leave type
  const casual = lt.rows.find(r => /casual/i.test(r.name));
  if (!casual) throw new Error('No casual leave type found');
  console.log('USING TYPE:', casual.name, casual.id);

  // 1. Login as Bala via API
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bala.mukherjee@innovatech.demo', password: 'MarqAI@2026' }),
  });
  const loginData = await login.json();
  if (!loginData.token) throw new Error('Login failed: ' + JSON.stringify(loginData).slice(0, 200));
  console.log('\nLOGIN OK (Bala)');

  // 2. Submit leave via API (same endpoint the UI uses)
  const payload = {
    employeeId: bala.id,
    leaveTypeId: casual.id,
    startDate: '2026-09-17',
    endDate: '2026-09-18',
    reason: 'Family function at hometown — live email-alert verification',
  };
  const res = await fetch(`${BASE}/api/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.log('LEAVE POST status', res.status, ':', body.slice(0, 400));

  if (res.status === 201 || res.status === 200) {
    const created = JSON.parse(body);
    const leaveId = created.leaveRequest?.id || created.id || created.data?.id;
    console.log('LEAVE CREATED:', leaveId);

    // 3. Wait for dispatcher, then read deliveries for this event
    await new Promise(r => setTimeout(r, 5000));
    const d = await c.query(
      `SELECT channel, status, "recipientName", "recipientAddress", subject, error, "createdAt"
       FROM "NotificationDelivery"
       WHERE "createdAt" > NOW() - INTERVAL '2 minutes'
       ORDER BY "createdAt" DESC`
    );
    console.log('\n=== DELIVERIES (last 2 min) ===');
    d.rows.forEach(r =>
      console.log(`${(r.channel || '').padEnd(7)} | ${(r.status || '').padEnd(8)} | ${r.recipientName || '—'} <${r.recipientAddress || '—'}> | ${r.subject || ''} ${r.error ? 'ERR: ' + r.error : ''}`)
    );
  }
  await c.end();
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
