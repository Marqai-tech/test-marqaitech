/**
 * DEMO E2E (post-deploy): 
 *  A) leave apply (Bala) -> mirrored into Amit's internal inbox on production demo
 *  B) real-inbox delivery: disable tenant SMTP -> compose to Resend account owner
 *     (maheshkpreddy@gmail.com) via global fallback -> restore SMTP
 * Retries step A while the Vercel deployment propagates (mirror row absent).
 */
const { Client } = require('pg');
const BASE = 'https://nexus-hrms-mu.vercel.app';
const PG = {
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  database: 'tenant_3boxes-hrms-demo',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  ssl: { rejectUnauthorized: false },
};
const OWNER_EMAIL = 'maheshkpreddy@gmail.com'; // Resend account holder — sandbox delivers ONLY here

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-slug': '3boxes-hrms-demo' },
    body: JSON.stringify({ email, password: 'MarqAI@2026' }),
  });
  const d = await r.json();
  if (!d.token) throw new Error(`${email} login failed: ` + JSON.stringify(d).slice(0, 150));
  return d.token;
}

async function main() {
  const balaToken = await login('bala.mukherjee@innovatech.demo');
  console.log('1. Bala login OK');

  // ── A: leave apply + mirror (retry while deploy propagates) ──
  let mirror = null;
  let leavePosted = false;
  for (let attempt = 1; attempt <= 12; attempt++) {
    if (!leavePosted) {
      const r = await fetch(`${BASE}/api/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${balaToken}` },
        body: JSON.stringify({
          employeeId: 'cmtsczno9003t04jseueeu1y4',
          leaveTypeId: 'cmtsczrj5000504ib2a7l3dft',
          startDate: '2026-09-25',
          endDate: '2026-09-26',
          reason: 'Inbox mirror verification — demo post-deploy',
        }),
      });
      leavePosted = true; // post at most once to avoid duplicates
      if (r.status !== 201 && r.status !== 200) {
        console.log(`   attempt ${attempt}: leave POST ${r.status}`, (await r.text()).slice(0, 120));
      }
    }
    await new Promise(res => setTimeout(res, 6000));
    const c = new Client(PG);
    await c.connect();
    const m = await c.query(
      `SELECT em.id, em.subject, em."toEmployeeId", e."firstName", e."lastName"
       FROM "EmailMessage" em LEFT JOIN "Employee" e ON e.id = em."toEmployeeId"
       WHERE em."createdByFlow" = 'notification' AND em.subject LIKE '%25 Sept 2026%'
       ORDER BY em."createdAt" DESC LIMIT 1`
    );
    // also fetch this leave's delivery rows
    const del = await c.query(
      `SELECT channel, status, "recipientAddress", error FROM "NotificationDelivery"
       WHERE "createdAt" > NOW() - INTERVAL '2 minutes' ORDER BY "createdAt" DESC`
    );
    await c.end();
    mirror = m.rows[0] || null;
    console.log(`   attempt ${attempt}: deliveries=[${del.rows.map(d => `${d.channel}:${d.status}${d.error ? '(' + d.error.slice(0, 40) + ')' : ''}`).join(', ')}] mirror=${mirror ? mirror.firstName + ' ' + mirror.lastName : 'none'}`);
    if (mirror) break;
    console.log('   deployment not propagated yet — waiting 45s...');
    await new Promise(res => setTimeout(res, 45000));
  }
  if (!mirror) throw new Error('Mirror row never appeared — deployment did not propagate');
  console.log('2. MIRROR CONFIRMED on demo ->', mirror.firstName, mirror.lastName, '|', mirror.subject.slice(0, 60));

  // Amit inbox via API
  const amitToken = await login('amit.reddy@innovatech.demo');
  const ir = await fetch(`${BASE}/api/email?folder=inbox`, { headers: { Authorization: `Bearer ${amitToken}` } });
  const inbox = await ir.json();
  console.log('3. Amit internal inbox total:', inbox.total, '| top:', inbox.emails?.[0]?.subject?.slice(0, 60));

  // ── B: real-inbox delivery via global fallback ──
  const c = new Client(PG);
  await c.connect();
  // disable tenant SMTP temporarily
  await c.query(`UPDATE "CollaborationSettings" SET "emailIntegrationEnabled" = false, "updatedAt" = NOW()`);
  console.log('\n4. Demo tenant SMTP temporarily DISABLED (global Resend fallback active)');
  try {
    const cr = await fetch(`${BASE}/api/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${amitToken}` },
      body: JSON.stringify({
        subject: '3Boxes HRMS — REAL inbox delivery test (Resend fallback)',
        body: 'Hi Mahesh,\n\nThis message was composed inside the 3Boxes HRMS demo (Collaboration -> Email) and delivered to your REAL Gmail inbox through the global Resend sender fallback.\n\n- Tenant SMTP was temporarily disabled for this test\n- Reply-to / From: Resend sandbox (onboarding@resend.dev)\n\nIf you are reading this in Gmail, real-inbox delivery is proven.\n\n— 3Boxes HRMS Demo',
        toAddresses: [OWNER_EMAIL],
        folder: 'sent',
      }),
    });
    const cd = await cr.json();
    console.log('5. Compose response:', cr.status, JSON.stringify(cd.sent || cd).slice(0, 260));
  } finally {
    await c.query(`UPDATE "CollaborationSettings" SET "emailIntegrationEnabled" = true, "updatedAt" = NOW()`);
    const chk = await c.query(`SELECT "emailIntegrationEnabled" FROM "CollaborationSettings" LIMIT 1`);
    await c.end();
    console.log('6. Demo tenant SMTP RESTORED:', chk.rows[0].emailIntegrationEnabled);
  }
  console.log('\nDEMO E2E COMPLETE');
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
