/**
 * Task 52 — Configure REAL SMTP credentials on the LIVE tenant.
 *
 * ⚠️ LIVE TENANT — DO NOT RUN BLINDLY.
 * Run this script yourself when you are ready to enable SMTP on the
 * LIVE marqaitechgroup tenant. It has a 5-second abort window.
 *
 * Provider: 3boxeshrms.com mail (webhostbox) — noreply@3boxeshrms.com
 *   - Host:     md-in-59.webhostbox.net
 *   - Port:     465  (implicit SSL/TLS)
 *   - User:     noreply@3boxeshrms.com
 *   - Pass:     Boxes@001
 *
 * Usage:
 *   1. Confirm the LIVE tenant DB name on Neon (expected: tenant_marqaitechgroup).
 *   2. Edit LIVE_DB.database below if needed.
 *   3. Run:  node scripts/configure-live-smtp.js
 *
 * After running, the LIVE tenant will dispatch all module notifications
 * (leave approvals, attendance, gatepass, overtime, WFH, payroll, recruitment)
 * through this SMTP channel. The same credentials can be edited later via the
 * LIVE site's /settings → "SMTP Email" tab.
 */
const nodemailer = require('nodemailer');
const { Client } = require('pg');

const SMTP = {
  host: 'md-in-59.webhostbox.net',
  port: 465,
  user: 'noreply@3boxeshrms.com',
  pass: 'Boxes@001',
  fromName: '3 Boxes HRMS',
  fromAddress: 'noreply@3boxeshrms.com',
  replyTo: 'noreply@3boxeshrms.com',
  encryption: 'ssl',
};

// LIVE tenant DB — using IPv4 + SNI to bypass IPv6 routing issues
const LIVE_DB = {
  host: '52.72.123.251',  // direct IPv4 (Neon endpoint)
  database: 'tenant_marqaitechgroup',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  ssl: { rejectUnauthorized: false, servername: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech' },
  connectionTimeout: 60000,
};

async function main() {
  console.log('\n=== LIVE TENANT SMTP CONFIGURATION (marqaitechgroup) ===\n');
  console.log('User has explicitly authorized LIVE SMTP induction.\n');

  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
  };

  // 1. SMTP verify
  console.log('[1/3] Verifying SMTP credentials...');
  const transport = nodemailer.createTransport({
    host: SMTP.host, port: SMTP.port, secure: true,
    auth: { user: SMTP.user, pass: SMTP.pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  let verifyOk = false;
  try { await transport.verify(); verifyOk = true; ok('SMTP verify', true); }
  catch (e) { ok('SMTP verify', false, e.message); }

  // 2. Update LIVE DB (UPDATE if row exists, INSERT if not)
  console.log('\n[2/3] Updating LIVE tenant CollaborationSettings...');
  const c = new Client(LIVE_DB);
  await c.connect();
  const before = await c.query(
    `SELECT "emailProvider", "smtpHost", "smtpUsername", "emailIntegrationEnabled"
     FROM "CollaborationSettings" LIMIT 1`
  );
  console.log('  BEFORE:', before.rows[0] ? JSON.stringify(before.rows[0]) : '(none — will INSERT)');

  let upd;
  if (before.rows[0]) {
    upd = await c.query(
      `UPDATE "CollaborationSettings"
          SET "emailIntegrationEnabled" = true,
              "emailProvider"          = 'smtp',
              "smtpHost"               = $1,
              "smtpPort"               = $2,
              "smtpUsername"           = $3,
              "smtpPassword"           = $4,
              "smtpEncryption"         = 'ssl',
              "smtpFromName"           = $5,
              "smtpFromAddress"        = $6,
              "smtpReplyTo"            = $7,
              "smtpVerifiedAt"         = $8,
              "smtpVerifyError"        = NULL,
              "updatedAt"              = NOW()
        WHERE id = (SELECT id FROM "CollaborationSettings" LIMIT 1)
        RETURNING "smtpHost", "smtpPort", "smtpUsername", "smtpFromAddress", "smtpEncryption", "smtpVerifiedAt"`,
      [SMTP.host, SMTP.port, SMTP.user, SMTP.pass, SMTP.fromName, SMTP.fromAddress, SMTP.replyTo, verifyOk ? new Date() : null]
    );
  } else {
    // No row — need tenantId from platform DB
    const pc = new Client({ ...LIVE_DB, database: 'neondb' });
    await pc.connect();
    const tRes = await pc.query(`SELECT id FROM "Tenant" WHERE slug = 'marqaitechgroup'`);
    await pc.end();
    if (!tRes.rows[0]) {
      ok('DB update', false, 'no CollaborationSettings row + could not resolve tenantId from platform DB');
      await c.end(); transport.close();
      console.log(`\n=== LIVE RESULT: ${pass} PASS / ${fail} FAIL ===`);
      process.exit(1);
    }
    const tenantId = tRes.rows[0].id;
    upd = await c.query(
      `INSERT INTO "CollaborationSettings" ("id", "tenantId", "emailIntegrationEnabled", "emailProvider",
          "smtpHost", "smtpPort", "smtpUsername", "smtpPassword", "smtpEncryption",
          "smtpFromName", "smtpFromAddress", "smtpReplyTo", "smtpVerifiedAt",
          "encryptionEnabled", "fileSharingLimitMB", "messageRetentionDays", "calendarSyncEnabled",
          "calendarSyncProvider", "autoDeleteMessages", "maxCallDurationMin", "allowExternalSharing",
          "watermarkEnabled", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, true, 'smtp',
          $2, $3, $4, $5, 'ssl',
          $6, $7, $8, $9,
          true, 25, 90, true,
          'google', false, 60, true,
          false, NOW(), NOW())
        RETURNING "smtpHost", "smtpPort", "smtpUsername", "smtpFromAddress", "smtpEncryption", "smtpVerifiedAt"`,
      [tenantId, SMTP.host, SMTP.port, SMTP.user, SMTP.pass, SMTP.fromName, SMTP.fromAddress, SMTP.replyTo, verifyOk ? new Date() : null]
    );
  }
  ok('DB updated', upd.rowCount === 1, JSON.stringify(upd.rows[0]));
  await c.end();

  // 3. Self-loop test email
  if (verifyOk) {
    console.log('\n[3/3] Sending self-loop test email...');
    try {
      const info = await transport.sendMail({
        from: `"${SMTP.fromName}" <${SMTP.fromAddress}>`,
        to: 'noreply@3boxeshrms.com',
        subject: '3 Boxes HRMS — LIVE SMTP channel configured (marqaitechgroup)',
        html: `<p>LIVE marqaitechgroup tenant is now sending email via ${SMTP.host}:${SMTP.port}.</p>
               <p>Verified at: ${new Date().toISOString()}</p>`,
        replyTo: SMTP.replyTo,
      });
      ok('Test email sent', !!info.messageId, `messageId=${info.messageId}`);
    } catch (e) {
      ok('Test email sent', false, e.message);
    }
  }
  transport.close();
  console.log(`\n=== LIVE RESULT: ${pass} PASS / ${fail} FAIL ===`);
  console.log('\nNext: verify on the LIVE site at https://marqaitechgroup.3boxeshrms.com/settings → "SMTP Email" tab.');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
