/** Re-test compose fallback on demo (SMTP disabled -> global Resend -> restore). */
const { Client } = require('pg');
const BASE = 'https://nexus-hrms-mu.vercel.app';
const PG = {
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  database: 'tenant_3boxes-hrms-demo',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  ssl: { rejectUnauthorized: false },
};
const OWNER_EMAIL = 'maheshkpreddy@gmail.com';

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-slug': '3boxes-hrms-demo' },
    body: JSON.stringify({ email, password: 'MarqAI@2026' }),
  });
  const d = await r.json();
  if (!d.token) throw new Error(`${email} login failed`);
  return d.token;
}

async function main() {
  const amitToken = await login('amit.reddy@innovatech.demo');
  const c = new Client(PG);
  await c.connect();
  await c.query(`UPDATE "CollaborationSettings" SET "emailIntegrationEnabled" = false, "updatedAt" = NOW()`);
  console.log('SMTP disabled');
  try {
    const cr = await fetch(`${BASE}/api/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${amitToken}` },
      body: JSON.stringify({
        subject: '3Boxes HRMS — REAL inbox delivery test (Resend fallback)',
        body: 'Hi Mahesh,\n\nThis message was composed inside the 3Boxes HRMS demo (Collaboration -> Email) and delivered to your REAL Gmail inbox through the global Resend sender fallback.\n\nIf you are reading this in Gmail, real-inbox delivery is proven.\n\n— 3Boxes HRMS Demo',
        toAddresses: [OWNER_EMAIL],
        folder: 'sent',
      }),
    });
    const cd = await cr.json();
    console.log('Compose response:', cr.status, JSON.stringify(cd.sent || cd).slice(0, 300));
  } finally {
    await c.query(`UPDATE "CollaborationSettings" SET "emailIntegrationEnabled" = true, "updatedAt" = NOW()`);
    const chk = await c.query(`SELECT "emailIntegrationEnabled" FROM "CollaborationSettings" LIMIT 1`);
    await c.end();
    console.log('SMTP restored:', chk.rows[0].emailIntegrationEnabled);
  }
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
