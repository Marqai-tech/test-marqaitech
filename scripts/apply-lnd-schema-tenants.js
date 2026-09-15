/**
 * Apply L&D schema (Task 38) to platform DB + ALL dedicated tenant DBs.
 * Reads the TenantDatabase registry from the platform DB.
 */
const { neon } = require('@neondatabase/serverless');
const { execSync } = require('child_process');

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const targets = [['platform (neondb)', PLATFORM]];
  const platformSql = neon(PLATFORM);
  try {
    const tenants = await platformSql.query(`
      SELECT t.slug, td."connectionString" AS cs, td."databaseName" AS db
      FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
      WHERE td."isActive" = true`);
    for (const t of tenants) targets.push([`${t.slug} (${t.db})`, t.cs]);
  } catch (e) { console.error('Registry read failed:', e.message); }
  console.log(`[lnd-tenants] ${targets.length} target DBs`);
  for (const [label, cs] of targets) {
    try {
      const out = execSync(`node scripts/apply-lnd-schema.js "${cs}"`, { cwd: '/home/z/my-project', stdio: 'pipe', timeout: 110000 });
      console.log(`[lnd-tenants] ${label}: ${out.toString().trim().split('\n').pop()}`);
    } catch (e) {
      console.error(`[lnd-tenants] ${label}: FAILED — ${(e.stderr || e.message || '').toString().split('\n')[0]}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
