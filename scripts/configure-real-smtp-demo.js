/**
 * Task 52 — Configure REAL SMTP credentials on the demo tenant.
 * Provider: 3boxeshrms.com mail (webhostbox) — noreply@3boxeshrms.com
 *   - Host:     md-in-59.webhostbox.net
 *   - Port:     465  (implicit SSL/TLS)
 *   - User:     noreply@3boxeshrms.com
 *   - Pass:     Boxes@001
 *   - From:     noreply@3boxeshrms.com
 *
 * This script:
 *   1. Verifies the new SMTP transport from this sandbox (direct cred check)
 *   2. Updates the DEMO tenant DB (tenant_3boxes-hrms-demo) CollaborationSettings
 *   3. Sends a self-loopback test email to noreply@3boxeshrms.com
 *
 * READ-ONLY for the LIVE tenant — scripts/configure-live-smtp.js handles that.
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

const DEMO_DB = {
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  database: 'tenant_3boxes-hrms-demo',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  ssl: { rejectUnauthorized: false },
};

async function main() {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
  };

  // 1. Local SMTP transport verify
  console.log('\n[1/3] Verifying SMTP credentials from sandbox...');
  const transport = nodemailer.createTransport({
    host: SMTP.host, port: SMTP.port, secure: true,
    auth: { user: SMTP.user, pass: SMTP.pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  let verifyOk = false;
  try { await transport.verify(); verifyOk = true; ok('SMTP transport.verify()', true); }
  catch (e) { ok('SMTP transport.verify()', false, e.message); }

  // 2. Update demo tenant DB
  console.log('\n[2/3] Updating DEMO tenant CollaborationSettings...');
  const c = new Client(DEMO_DB);
  await c.connect();
  const before = await c.query(
    `SELECT "emailProvider", "smtpHost", "smtpUsername", "emailIntegrationEnabled"
     FROM "CollaborationSettings" LIMIT 1`
  );
  console.log('  BEFORE:', before.rows[0] ? JSON.stringify(before.rows[0]) : '(none)');

  const upd = await c.query(
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
     RETURNING "smtpHost", "smtpPort", "smtpUsername", "smtpFromAddress", "smtpEncryption", "emailIntegrationEnabled", "smtpVerifiedAt"`,
    [SMTP.host, SMTP.port, SMTP.user, SMTP.pass, SMTP.fromName, SMTP.fromAddress, SMTP.replyTo, verifyOk ? new Date() : null]
  );
  ok('DB updated', upd.rowCount === 1, JSON.stringify(upd.rows[0]));
  await c.end();

  // 3. Self-loopback test email
  if (verifyOk) {
    console.log('\n[3/3] Sending test email noreply@3boxeshrms.com → noreply@3boxeshrms.com (local loopback)...');
    try {
      const info = await transport.sendMail({
        from: `"${SMTP.fromName}" <${SMTP.fromAddress}>`,
        to: 'noreply@3boxeshrms.com',
        subject: '3 Boxes HRMS — SMTP channel configured (demo tenant)',
        html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
  <div style="background:#0f766e;color:#fff;padding:20px 24px"><h2 style="margin:0;font-size:18px">3 Boxes HRMS</h2><p style="margin:4px 0 0;opacity:.85;font-size:13px">Email channel is live</p></div>
  <div style="padding:24px">
    <p style="margin:0 0 12px">Hi,</p>
    <p style="margin:0 0 12px">The demo tenant is now sending email through the configured SMTP server:</p>
    <ul style="margin:0 0 12px;color:#475569;font-size:13px;line-height:1.6">
      <li><b>Provider:</b> Custom SMTP (webhostbox)</li>
      <li><b>Host:</b> ${SMTP.host}</li>
      <li><b>Port:</b> ${SMTP.port} (SSL/TLS)</li>
      <li><b>From:</b> ${SMTP.fromName} &lt;${SMTP.fromAddress}&gt;</li>
      <li><b>Verified at:</b> ${new Date().toISOString()}</li>
    </ul>
    <p style="margin:0 0 12px">All modules — leave approvals, attendance requests, gatepass, overtime, WFH, payroll, recruitment notifications — will now dispatch through this channel.</p>
    <p style="margin:0;color:#94a3b8;font-size:12px">— 3 Boxes HRMS Notifications</p>
  </div>
</div>`,
        replyTo: SMTP.replyTo,
      });
      ok('Test email sent', !!info.messageId, `messageId=${info.messageId}`);
    } catch (e) {
      ok('Test email sent', false, e.message);
    }
  }

  transport.close();
  console.log(`\n=== DEMO RESULT: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e.message, '\n', e.stack); process.exit(1); });
