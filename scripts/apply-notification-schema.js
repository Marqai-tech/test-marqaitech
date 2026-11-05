/**
 * Targeted schema sync: applies ONLY the Notification Center tables (Task 36)
 * to a given Postgres connection. Additive-only (IF NOT EXISTS), idempotent.
 *
 * Usage: node scripts/apply-notification-schema.js <connectionString>
 */
const { neon } = require('@neondatabase/serverless');

const NEW_TABLES = [
  'NotificationTemplate',
  'NotificationDelivery',
  'NotificationPreference',
  'IntegrationWebhook',
];

async function main() {
  const connectionString = process.argv[2] || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[ntf-sync] No connection string provided');
    process.exit(1);
  }
  const all = require('./_generated-tables.js');
  const stmts = [];
  for (const stmt of all) {
    if (NEW_TABLES.some((t) => stmt.includes(`"${t}"`))) stmts.push(stmt);
  }
  console.log(`[ntf-sync] ${stmts.length} statements to apply`);
  const sql = neon(connectionString);
  for (const stmt of stmts) {
    const name = (stmt.match(/"(?:CREATE (?:UNIQUE )?INDEX IF NOT EXISTS )"?(\w+)/) || [])[1] || stmt.slice(0, 50);
    try {
      await sql.query(stmt);
      console.log(`[ntf-sync] OK: ${name}`);
    } catch (err) {
      // "already exists" duplicates are fine (e.g. index re-created per table block)
      if (String(err.message || err).includes('already exists')) {
        console.log(`[ntf-sync] SKIP (exists): ${name}`);
      } else {
        console.error(`[ntf-sync] FAIL: ${name} -> ${err.message || err}`);
      }
    }
  }
  // Verify
  const rows = await sql.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('NotificationTemplate','NotificationDelivery','NotificationPreference','IntegrationWebhook')`);
  console.log(`[ntf-sync] Verified tables:`, rows.map((r) => r.table_name).join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
