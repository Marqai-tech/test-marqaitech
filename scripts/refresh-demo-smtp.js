/**
 * Refresh demo tenant SMTP credentials with a NEW Ethereal test account.
 * - Creates a fresh Ethereal account via nodemailer.createTestAccount()
 * - Tests old saved credentials (expected to fail with 535)
 * - Updates CollaborationSettings on tenant_3boxes-hrms-demo ONLY
 * - Verifies new transport works
 * - Saves credentials to scripts/.ethereal-demo-credentials.json
 */
const nodemailer = require('nodemailer');
const { Client } = require('pg');
const fs = require('fs');

const PLATFORM = {
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  database: 'tenant_3boxes-hrms-demo', // DEMO ONLY
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  ssl: { rejectUnauthorized: false },
};

async function verify(host, port, user, pass, from) {
  const t = nodemailer.createTransport({
    host, port, secure: false,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
  try {
    await t.verify();
    return { ok: true, transport: t };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  // 1. Read current config
  const c = new Client(PLATFORM);
  await c.connect();
  const cur = await c.query(
    `SELECT "smtpHost", "smtpPort", "smtpUsername", "smtpPassword", "smtpFromName", "smtpFromAddress"
     FROM "CollaborationSettings" LIMIT 1`
  );
  const old = cur.rows[0];
  console.log('OLD CONFIG:', old.smtpUsername, '@', old.smtpHost);

  // 2. Test old creds
  const oldTest = await verify(old.smtpHost, old.smtpPort, old.smtpUsername, old.smtpPassword);
  console.log('OLD CREDS TEST:', oldTest.ok ? 'PASS' : `FAIL (${oldTest.error})`);

  if (oldTest.ok) {
    console.log('Old credentials still valid — no refresh needed.');
    await c.end();
    return;
  }

  // 3. Create fresh Ethereal account
  console.log('\nCreating NEW Ethereal test account...');
  const acct = await nodemailer.createTestAccount();
  console.log('NEW ACCOUNT:', acct.user);

  const newTest = await verify('smtp.ethereal.email', 587, acct.user, acct.pass);
  if (!newTest.ok) throw new Error('New Ethereal creds also failed: ' + newTest.error);
  console.log('NEW CREDS TEST: PASS');

  // 4. Update demo tenant CollaborationSettings
  const upd = await c.query(
    `UPDATE "CollaborationSettings"
     SET "emailIntegrationEnabled" = true,
         "emailProvider" = 'smtp',
         "smtpHost" = 'smtp.ethereal.email',
         "smtpPort" = 587,
         "smtpUsername" = $1,
         "smtpPassword" = $2,
         "smtpEncryption" = 'tls',
         "smtpFromName" = $3,
         "smtpFromAddress" = $1,
         "smtpReplyTo" = 'admin@3boxeshrms.com',
         "smtpVerifiedAt" = NOW(),
         "smtpVerifyError" = NULL,
         "updatedAt" = NOW()
     WHERE id = (SELECT id FROM "CollaborationSettings" LIMIT 1)
     RETURNING "smtpUsername", "smtpVerifiedAt"`,
    [acct.user, acct.pass, '3Boxes HRMS (Demo)']
  );
  console.log('\nDB UPDATED:', JSON.stringify(upd.rows[0]));
  await c.end();

  // 5. Save credentials
  const credPath = '/home/z/my-project/scripts/.ethereal-demo-credentials.json';
  fs.writeFileSync(credPath, JSON.stringify({
    user: acct.user,
    pass: acct.pass,
    smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    web: 'https://ethereal.email',
    login: acct.user,       // webmail login = same user/pass
    password: acct.pass,
    note: 'Demo tenant (3boxes-hrms-demo) SMTP. Refreshed ' + new Date().toISOString(),
  }, null, 2));
  console.log('Credentials saved to', credPath);

  // 6. Send a verification email through the new transport (captured in Ethereal)
  const info = await newTest.transport.sendMail({
    from: '"3Boxes HRMS (Demo)" <' + acct.user + '>',
    to: acct.user,
    subject: 'SMTP refreshed — demo tenant email channel live',
    text: 'This is a transport verification message after credential refresh. If you can read this in the Ethereal inbox, the demo email channel is working.',
  });
  console.log('\nVERIFICATION EMAIL SENT:', info.messageId);
  console.log('PREVIEW URL:', nodemailer.getTestMessageUrl(info));
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
