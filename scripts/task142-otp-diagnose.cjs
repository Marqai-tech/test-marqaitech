// Task 142 — diagnose OTP delivery: recent LoginOtp rows + SMTP connectivity test
const { neon } = require('@neondatabase/serverless');

async function main() {
  // Env comes from the shell: set -a; source /tmp/my-project/.env.production.local; set +a
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing — source the production env first');
  const psql = neon(process.env.DATABASE_URL);
  const tenants = await psql`SELECT t.slug, td."connectionString" FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE t.slug IN ('3boxes-hrms-demo','marqaitechgroup')`;

  for (const t of tenants) {
    const sql = neon(t.connectionString);
    try {
      const rows = await sql`SELECT "phone", "attempts", "consumedAt" IS NOT NULL AS consumed, "createdAt" FROM "LoginOtp" ORDER BY "createdAt" DESC LIMIT 6`;
      console.log(`\n=== ${t.slug}: last ${rows.length} OTP requests ===`);
      for (const r of rows) console.log(` ${r.createdAt?.toISOString?.() || r.createdAt} phone=${r.phone} attempts=${r.attempts} consumed=${r.consumed}`);
    } catch (e) { console.log(`${t.slug}: ${String(e.message).slice(0, 120)}`); }
  }

  // SMTP handshake test (creds from env — do NOT print secrets)
  const nodemailer = require('nodemailer');
  if (process.env.SMTP_HOST && process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD) {
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465 || String(process.env.SMTP_ENCRYPTION || '').toLowerCase() === 'ssl',
      auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 20000,
    });
    try {
      const info = await transport.sendMail({
        from: `${process.env.SMTP_FROM_NAME || '3Boxes HRMS'} <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USERNAME}>`,
        to: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USERNAME,
        subject: 'Task 142 SMTP connectivity test',
        text: 'If you receive this, SMTP delivery works for OTP emails. Test sent by task142-otp-diagnose.cjs',
      });
      console.log(`\nSMTP SEND OK via ${process.env.SMTP_HOST}:${port} → messageId=${info.messageId}`);
    } catch (e) {
      console.log(`\nSMTP SEND FAILED via ${process.env.SMTP_HOST}:${port}: ${e.message}`);
    }
  } else {
    console.log('\nSMTP env incomplete: host/username/password missing');
  }
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
