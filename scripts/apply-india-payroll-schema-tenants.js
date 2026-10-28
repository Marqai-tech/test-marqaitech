/**
 * Apply India Payroll schema (Task 37) to ALL dedicated tenant DBs.
 * Reads the TenantDatabase registry from the platform DB, then applies
 * the additive DDL (IF NOT EXISTS) to each connection string.
 */
const { neon } = require('@neondatabase/serverless');
const { execSync } = require('child_process');

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  // Platform DB first
  console.log('[in-pay-tenants] → platform DB (neondb)');
  try {
    const out = execSync(`node scripts/apply-india-payroll-schema.js "${PLATFORM}"`, { cwd: '/home/z/my-project', stdio: 'pipe', timeout: 110000 });
    console.log(out.toString());
  } catch (e) {
    console.error((e.stderr || e.message || '').toString().split('\n').slice(0, 12).join('\n'));
  }

  const platformSql = neon(PLATFORM);
  const tenants = await platformSql.query(`
    SELECT t.slug, t.name, td."connectionString" AS cs, td."databaseName" AS db
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
    WHERE td."isActive" = true`);
  console.log(`[in-pay-tenants] ${tenants.length} dedicated tenant DBs found`);
  for (const t of tenants) {
    console.log(`\n[in-pay-tenants] → ${t.slug} (${t.db})`);
    try {
      const out = execSync(`node scripts/apply-india-payroll-schema.js "${t.cs}"`, { cwd: '/home/z/my-project', stdio: 'pipe', timeout: 110000 });
      console.log(out.toString().split('\n').filter(l => l.includes('[in-pay-sync]')).join('\n'));
    } catch (e) {
      const out = (e.stdout || '').toString();
      const err = (e.stderr || e.message || '').toString();
      console.log(out.split('\n').filter((l) => l.includes('[in-pay-sync]')).join('\n'));
      console.error(`[in-pay-tenants] FAILED for ${t.slug}: ${err.split('\n')[0]}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
