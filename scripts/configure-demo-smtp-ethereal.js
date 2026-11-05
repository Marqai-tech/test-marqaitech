/**
 * Configure a WORKING SMTP provider on the DEMO tenant (tenant_3boxes-hrms-demo)
 * so that all module email notifications send through real SMTP.
 *
 * Provider: Ethereal (nodemailer test account) — a genuine SMTP server with
 * real credentials. Messages are captured (not relayed to external inboxes)
 * and viewable in the account's webmail at https://ethereal.email — perfect
 * for proving the end-to-end pipeline without third-party mail credentials.
 *
 * Swapping to production later = paste Gmail/Office365/Resend creds in
 * Collaboration → Settings (identical code path via email-sender.ts).
 *
 * Idempotent: upserts the single CollaborationSettings row for the demo tenant.
 * Usage: node scripts/configure-demo-smtp-ethereal.js
 */
const nodemailer = require('nodemailer');
const fs = require('fs');
const { neon } = require('@neondatabase/serverless');

const DEMO_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require';
const DEMO_TENANT_ID = 'cmrmxegjy000604jv9ntgcshh'; // 3boxes-hrms-demo
const CRED_FILE = '/home/z/my-project/scripts/.ethereal-demo-credentials.json';
const sql = neon(DEMO_CS);
const log = (...a) => console.log('[smtp-config]', ...a);

async function main() {
  // 1. Reuse or create the Ethereal account
  let creds;
  if (fs.existsSync(CRED_FILE)) {
    creds = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
    log('Reusing existing Ethereal account:', creds.user);
  } else {
    creds = await nodemailer.createTestAccount();
    fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2));
    log('Created NEW Ethereal account:', creds.user);
  }

  // 2. Verify the SMTP connection works BEFORE saving it into settings
  const transport = nodemailer.createTransport({
    host: creds.smtp.host,
    port: creds.smtp.port,
    secure: creds.smtp.secure,
    auth: { user: creds.user, pass: creds.pass },
    tls: { rejectUnauthorized: false },
  });
  await transport.verify();
  transport.close();
  log(`SMTP verify OK (${creds.smtp.host}:${creds.smtp.port})`);

  // 3. Upsert the demo tenant's CollaborationSettings
  const existing = await sql`
    SELECT "id" FROM "CollaborationSettings" WHERE "tenantId" = ${DEMO_TENANT_ID} LIMIT 1`;
  const values = {
    provider: 'smtp',
    host: creds.smtp.host,
    port: creds.smtp.port,
    user: creds.user,
    pass: creds.pass,
    encryption: creds.smtp.secure ? 'ssl' : 'tls',
    fromName: '3Boxes HRMS (Demo)',
    fromAddress: creds.user,
    replyTo: 'admin@3boxeshrms.com',
  };
  if (existing.length) {
    await sql`
      UPDATE "CollaborationSettings" SET
        "emailIntegrationEnabled" = true,
        "emailProvider" = ${values.provider},
        "smtpHost" = ${values.host},
        "smtpPort" = ${values.port},
        "smtpUsername" = ${values.user},
        "smtpPassword" = ${values.pass},
        "smtpEncryption" = ${values.encryption},
        "smtpFromName" = ${values.fromName},
        "smtpFromAddress" = ${values.fromAddress},
        "smtpReplyTo" = ${values.replyTo},
        "smtpVerifiedAt" = NOW(),
        "smtpVerifyError" = NULL,
        "updatedAt" = NOW()
      WHERE "tenantId" = ${DEMO_TENANT_ID}`;
    log('Updated existing CollaborationSettings row');
  } else {
    await sql`
      INSERT INTO "CollaborationSettings"
        ("id", "tenantId", "emailIntegrationEnabled", "emailProvider",
         "smtpHost", "smtpPort", "smtpUsername", "smtpPassword", "smtpEncryption",
         "smtpFromName", "smtpFromAddress", "smtpReplyTo", "smtpVerifiedAt", "createdAt", "updatedAt")
      VALUES (
        'cs_demo_smtp_' || substr(md5(random()::text), 1, 16),
        ${DEMO_TENANT_ID}, true, ${values.provider},
        ${values.host}, ${values.port}, ${values.user}, ${values.pass}, ${values.encryption},
        ${values.fromName}, ${values.fromAddress}, ${values.replyTo}, NOW(), NOW(), NOW()
      )`;
    log('Inserted new CollaborationSettings row');
  }

  // 4. Read back + confirm
  const check = await sql`
    SELECT "emailIntegrationEnabled", "emailProvider", "smtpHost", "smtpPort",
           "smtpUsername", "smtpEncryption", "smtpFromName", "smtpFromAddress", "smtpVerifiedAt"
    FROM "CollaborationSettings" WHERE "tenantId" = ${DEMO_TENANT_ID}`;
  log('SAVED:', JSON.stringify(check[0], null, 2));
  log('Webmail login → https://ethereal.email  |  user:', creds.user, ' pass:', creds.pass);
}

main().catch((e) => { console.error(e); process.exit(1); });
