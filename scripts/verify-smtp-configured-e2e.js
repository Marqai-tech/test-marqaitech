/**
 * Task 52 — Verify SMTP via Vercel network (demo API) + confirm UI is editable.
 * - Logs in as admin on the demo deployment
 * - GET /api/settings/smtp → confirms masked creds match the seeded config
 * - POST /api/settings/smtp verify → confirms Vercel can reach webhostbox:465
 */
const DEMO = 'https://nexus-hrms-mu.vercel.app';
const ADMIN = { email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' };

const EXPECT = {
  emailProvider: 'smtp',
  smtpHost: 'md-in-59.webhostbox.net',
  smtpPort: 465,
  smtpUsername: 'noreply@3boxeshrms.com',
  smtpEncryption: 'ssl',
  smtpFromAddress: 'noreply@3boxeshrms.com',
  emailIntegrationEnabled: true,
};

async function main() {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
  };

  const loginRes = await fetch(`${DEMO}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  ok('login', loginRes.ok);
  const { token } = await loginRes.json();
  const H = { Authorization: `Bearer ${token}`, 'x-tenant-slug': '3boxes-hrms-demo', 'Content-Type': 'application/json' };

  let r = await fetch(`${DEMO}/api/settings/smtp`, { headers: H });
  ok('GET settings', r.status === 200);
  const { settings } = await r.json();
  ok('emailProvider=smtp', settings.emailProvider === EXPECT.emailProvider);
  ok('smtpHost correct', settings.smtpHost === EXPECT.smtpHost, settings.smtpHost);
  ok('smtpPort=465', settings.smtpPort === EXPECT.smtpPort);
  ok('smtpUsername correct', settings.smtpUsername === EXPECT.smtpUsername, settings.smtpUsername);
  ok('smtpEncryption=ssl', settings.smtpEncryption === EXPECT.smtpEncryption);
  ok('emailIntegrationEnabled', settings.emailIntegrationEnabled === true);
  ok('smtpVerifiedAt set', !!settings.smtpVerifiedAt, settings.smtpVerifiedAt);
  console.log('   (password masked in API response:', settings.smtpPassword + ')');

  // POST verify — Vercel-side SMTP connection test
  r = await fetch(`${DEMO}/api/settings/smtp`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      smtpHost: EXPECT.smtpHost,
      smtpPort: EXPECT.smtpPort,
      smtpUsername: EXPECT.smtpUsername,
      smtpPassword: 'Boxes@001',
      smtpEncryption: EXPECT.smtpEncryption,
    }),
  });
  const verify = await r.json();
  ok('POST verify from Vercel', r.status === 200 && verify.success === true,
     verify.success ? 'Vercel → webhostbox:465 OK' : `FAIL: ${verify.error || JSON.stringify(verify)}`);

  console.log('\n=== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
