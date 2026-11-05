/**
 * Fix tenant SMTP password — root cause of "email alerts not coming".
 *
 * Task 52 stored password 'Boxes@001' (len 9). The REAL password is
 * 'Boxes@001#$' (len 12) — the mismatch caused SMTP 535 auth failures on
 * every notification dispatch (see notification-channels.ts circuit-breaker
 * comment about "the webhostbox 535 auth failure").
 *
 * Steps:
 *   1. Verify NEW credentials from sandbox (nodemailer, port 465 SSL)
 *   2. Send loopback test email to noreply@3boxeshrms.com (evidence of delivery)
 *   3. UPDATE CollaborationSettings in BOTH tenant DBs (LIVE + demo)
 *      - smtpPassword = 'Boxes@001#$'
 *      - smtpVerifiedAt = NULL, smtpVerifyError = NULL  (re-stamped by the
 *        sites' POST /api/settings/smtp verify endpoint as runtime proof)
 *   4. Show recent NotificationDelivery failures (evidence of the 535 story)
 *
 * User explicitly requested this SMTP configuration (IM message).
 */
const nodemailer = require('nodemailer');
const { Client } = require('pg');

const SMTP = {
  host: 'md-in-59.webhostbox.net',
  port: 465,
  user: 'noreply@3boxeshrms.com',
  pass: 'Boxes@001#$',           // NEW password from user (old: Boxes@001)
  fromName: '3 Boxes HRMS',
  fromAddress: 'noreply@3boxeshrms.com',
  encryption: 'ssl',
};

const BASE = {
  host: 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech',
  user: 'neondb_owner',
  password: 'npg_pxZd8woKe4WB',
  ssl: { rejectUnauthorized: false },
  connectionTimeout: 30000,
};

const DBS = [
  { label: 'LIVE (marqaitechgroup)', database: 'tenant_marqaitechgroup' },
  { label: 'DEMO (3boxes-hrms-demo)', database: 'tenant_3boxes-hrms-demo' },
];

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

async function verifyAndLoopback() {
  const transport = nodemailer.createTransport({
    host: SMTP.host, port: SMTP.port, secure: true,
    auth: { user: SMTP.user, pass: SMTP.pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
  console.log('\n[1/4] Verifying NEW SMTP credentials from sandbox (port 465 SSL)...');
  try {
    await transport.verify();
    ok('SMTP AUTH + connect (new password)', true);
  } catch (e) {
    ok('SMTP AUTH + connect (new password)', false, e.message);
    return false;
  }

  console.log('[2/4] Sending loopback test email to noreply@3boxeshrms.com ...');
  try {
    const info = await transport.sendMail({
      from: `"${SMTP.fromName}" <${SMTP.fromAddress}>`,
      to: SMTP.user,
      subject: '[3Boxes HRMS] SMTP configuration test — ' + new Date().toISOString(),
      text: 'SMTP credentials updated successfully. This is an automated configuration test — no action needed.',
      html: '<p>SMTP credentials were updated in 3Boxes HRMS (both sites). This is an automated configuration test — no action needed.</p>',
    });
    ok('Loopback email accepted by server', true, `messageId=${info.messageId}`);
  } catch (e) {
    ok('Loopback email accepted by server', false, e.message);
  } finally {
    transport.close();
  }
  return true;
}

async function updateDb(target) {
  console.log(`\n[3/4] Updating ${target.label} — ${target.database}`);
  const c = new Client({ ...BASE, database: target.database });
  try {
    await c.connect();
    const before = await c.query(
      `SELECT "smtpPassword", length("smtpPassword") AS len FROM "CollaborationSettings" LIMIT 1`
    );
    if (!before.rows.length) { ok(`${target.label} settings row exists`, false, 'no row'); return; }
    const oldLen = before.rows[0].len;
    ok(`${target.label} old password seen`, oldLen === 9, `len=${oldLen} (expected 9 = 'Boxes@001')`);

    const upd = await c.query(
      `UPDATE "CollaborationSettings"
         SET "smtpPassword" = $1,
             "smtpVerifiedAt" = NULL,
             "smtpVerifyError" = NULL,
             "updatedAt" = NOW()
       WHERE "smtpHost" = 'md-in-59.webhostbox.net'
         AND "smtpUsername" = 'noreply@3boxeshrms.com'`,
      [SMTP.pass]
    );
    ok(`${target.label} rows updated`, upd.rowCount === 1, `rowCount=${upd.rowCount}`);

    const after = await c.query(
      `SELECT length("smtpPassword") AS len, right("smtpPassword", 3) AS tail,
              "emailIntegrationEnabled", "emailProvider", "smtpPort", "smtpEncryption",
              "smtpFromAddress", "smtpVerifiedAt"
       FROM "CollaborationSettings" LIMIT 1`
    );
    const r = after.rows[0];
    ok(`${target.label} new password stored (len=11)`, r.len === 11, `len=${r.len} tail="${r.tail}"`);
    ok(`${target.label} provider/ssl intact`, r.emailIntegrationEnabled === true && r.emailProvider === 'smtp' && r.smtpPort === 465 && r.smtpEncryption === 'ssl',
      `enabled=${r.emailIntegrationEnabled} provider=${r.emailProvider} port=${r.smtpPort} enc=${r.smtpEncryption}`);
    ok(`${target.label} verifiedAt cleared for runtime re-stamp`, r.smtpVerifiedAt === null);
    console.log(`  fromAddress=${r.smtpFromAddress}`);
  } catch (e) {
    ok(`${target.label} update`, false, e.message);
  } finally {
    try { await c.end(); } catch {}
  }
}

async function showRecentFailures() {
  console.log('\n[4/4] Recent NotificationDelivery failures (evidence trail, LIVE tenant):');
  const c = new Client({ ...BASE, database: 'tenant_marqaitechgroup' });
  try {
    await c.connect();
    const res = await c.query(
      `SELECT status, COUNT(*)::int AS n FROM "NotificationDelivery" WHERE channel='email' GROUP BY status`
    );
    res.rows.forEach(r => console.log(`  email/${r.status}: ${r.n}`));
    const errs = await c.query(
      `SELECT "createdAt", "eventKey", "recipientAddress", left("error", 90) AS err
       FROM "NotificationDelivery"
       WHERE channel='email' AND status='failed' AND "error" IS NOT NULL
       ORDER BY "createdAt" DESC LIMIT 5`
    );
    errs.rows.forEach(r => console.log(`  ${r.createdAt?.toISOString?.() || r.createdAt} | ${(r.eventKey || '').padEnd(24)} | ${r.recipientAddress} | ${r.err}`));
  } catch (e) {
    console.log(`  (delivery table probe skipped: ${e.message})`);
  } finally {
    try { await c.end(); } catch {}
  }
}

async function main() {
  console.log('=== SMTP PASSWORD FIX — noreply@3boxeshrms.com @ md-in-59.webhostbox.net:465 ===');
  const verified = await verifyAndLoopback();
  if (!verified) {
    console.log('\nABORT: new credentials failed sandbox verification — DB left untouched.');
    process.exit(1);
  }
  for (const t of DBS) await updateDb(t);
  await showRecentFailures();
  console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
