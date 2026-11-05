/** Task 94 — direct check of the seeded admin user + bcrypt verify */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
async function main() {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_demo?sslmode=require' });
  await c.connect();
  const u = await c.query(`SELECT id, email, name, role, status, "tenantId", LEFT(password, 10) AS hash_prefix, length(password) AS hash_len FROM "User" WHERE email = 'admin@demo.3boxeshrms.com'`);
  console.log('admin user row:', JSON.stringify(u.rows[0]));
  const full = await c.query(`SELECT password FROM "User" WHERE email = 'admin@demo.3boxeshrms.com'`);
  const match = await bcrypt.compare('MarqAI@2026', full.rows[0].password);
  console.log('bcrypt compare MarqAI@2026:', match);
  const count = await c.query(`SELECT count(*)::int n FROM "User"`);
  console.log('total users in tenant_demo:', count.rows[0].n);
  // platform-side registry as the deployed app would see it
  const p = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require' });
  await p.connect();
  const reg = await p.query(`SELECT td."connectionString", td."isActive", t.slug FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE t.slug='demo'`);
  console.log('platform registry:', JSON.stringify(reg.rows.map(r => ({ slug: r.slug, isActive: r.isActive, host: (r.connectionString.match(/@([^/]+)\//) || [])[1] }))));
  await p.end();
  await c.end();
}
main().catch(e => { console.error('CHECK FAILED:', e.message); process.exit(1); });
