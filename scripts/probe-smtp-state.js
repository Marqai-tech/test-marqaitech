/**
 * READ-ONLY probe — current SMTP config state in both tenant DBs.
 * LIVE: tenant_marqaitechgroup | Demo: tenant_3boxes-hrms-demo
 */
const { Client } = require('pg');

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

async function main() {
  for (const target of DBS) {
    console.log(`\n===== ${target.label} — ${target.database} =====`);
    const c = new Client({ ...BASE, database: target.database });
    try {
      await c.connect();
      const res = await c.query(
        `SELECT "emailIntegrationEnabled", "emailProvider", "smtpHost", "smtpPort",
                "smtpUsername", "smtpPassword", "smtpEncryption",
                "smtpFromName", "smtpFromAddress", "smtpReplyTo",
                "smtpVerifiedAt", "smtpVerifyError", "updatedAt"
         FROM "CollaborationSettings" LIMIT 2`
      );
      if (!res.rows.length) { console.log('  (no CollaborationSettings row)'); continue; }
      res.rows.forEach((r, i) => {
        console.log(`--- row ${i + 1} ---`);
        for (const [k, v] of Object.entries(r)) {
          if (k === 'smtpPassword') {
            console.log(`  ${k}: ${v ? `SET (len=${String(v).length}, tail=${JSON.stringify(String(v).slice(-4))})` : 'null'}`);
          } else {
            console.log(`  ${k}: ${v === null ? 'null' : JSON.stringify(v)}`);
          }
        }
      });
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    } finally {
      try { await c.end(); } catch {}
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
