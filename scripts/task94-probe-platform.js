/**
 * Task 94 — READ-ONLY probe of the platform DB (ep-blue-fire neondb).
 * Lists tenants, tenant DBs, and existing databases on the endpoint.
 */
const { Client } = require('pg');

const HOST = 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech';
const USER = 'neondb_owner';
const PASSWORD = 'npg_pxZd8woKe4WB';

async function main() {
  // 1. Platform DB contents
  const platform = new Client({
    host: HOST, user: USER, password: PASSWORD, database: 'neondb', ssl: { rejectUnauthorized: false },
  });
  await platform.connect();
  const tenants = await platform.query(`SELECT id, name, slug, "domain", plan, status, "maxCompaniesAllowed", "createdAt" FROM "Tenant" ORDER BY "createdAt"`);
  console.log('=== PLATFORM DB: Tenants ===');
  for (const t of tenants.rows) console.log(`- ${t.slug} | ${t.name} | plan=${t.plan} status=${t.status} maxCo=${t.maxCompaniesAllowed} | domain=${t.domain || '-'} | id=${t.id}`);
  const tdbs = await platform.query(`SELECT td.id, td."databaseName", td."isActive", t.slug FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"`);
  console.log('=== PLATFORM DB: TenantDatabase rows ===');
  for (const d of tdbs.rows) console.log(`- ${d.slug} -> ${d.databaseName} active=${d.isActive}`);
  const su = await platform.query(`SELECT email, role, status, "tenantId" FROM "User" WHERE role = 'super_admin'`);
  console.log('=== PLATFORM DB: super_admin users ===');
  for (const u of su.rows) console.log(`- ${u.email} | status=${u.status} | tenantId=${u.tenantId || '-'}`);
  await platform.end();

  // 2. Databases on the endpoint
  const postgres = new Client({
    host: HOST, user: USER, password: PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  try {
    await postgres.connect();
    const dbs = await postgres.query(`SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`);
    console.log('=== ENDPOINT: databases ===');
    for (const d of dbs.rows) console.log(`- ${d.datname}`);
    await postgres.end();
  } catch (e) {
    console.log('postgres db not reachable:', e.message);
    try { await postgres.end(); } catch {}
  }
}

main().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
