/**
 * Apply Notification Center schema to ALL dedicated tenant DBs.
 * Reads the TenantDatabase registry from the platform DB, then applies
 * the additive DDL (IF NOT EXISTS) to each connection string.
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
const { execSync } = require('child_process');

async function main() {
  const platformSql = neon(PLATFORM);
  const tenants = await platformSql.query(`
    SELECT t.slug, t.name, td."connectionString" AS cs, td."databaseName" AS db
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
    WHERE td."isActive" = true`);
  console.log(`[ntf-tenants] ${tenants.length} dedicated tenant DBs found`);
  for (const t of tenants) {
    console.log(`\n[ntf-tenants] → ${t.slug} (${t.db})`);
    try {
      execSync(`node scripts/apply-notification-schema.js "${t.cs}"`, { cwd: '/home/z/my-project', stdio: 'pipe', timeout: 110000 });
      console.log(`[ntf-tenants] OK for ${t.slug}`);
    } catch (e) {
      const out = (e.stdout || '').toString();
      const err = (e.stderr || e.message || '').toString();
      console.log(out.split('\n').filter((l) => l.includes('[ntf-sync]')).join('\n'));
      console.error(`[ntf-tenants] FAILED for ${t.slug}: ${err.split('\n')[0]}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
