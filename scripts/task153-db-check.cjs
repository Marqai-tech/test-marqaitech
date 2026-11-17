/* Task 153 — check linked Employee rows for MarqAI ceo/tenant_admin users,
 * and count roles of linked users (to size the fix). */
const { readFileSync } = require('fs');
let env = {};
try { env = Object.fromEntries(readFileSync('/tmp/my-project/.env.production.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])); } catch (e) { console.error('env', e.message); }
const { neon } = require('@neondatabase/serverless');

// strip channel_binding which the neon HTTP driver rejects
const clean = (cs) => String(cs || '').replace(/^"|"$/g, '').replace(/&channel_binding=require/, '');

(async () => {
  const sql = neon(clean(env.DATABASE_URL));
  const tenants = await sql`SELECT id, name, slug FROM "Tenant" WHERE slug IN ('marqaitechgroup','3boxes-hrms-demo')`;
  console.log('tenants:', tenants.map(t => `${t.slug}=${t.id}`).join(' | '));
  for (const t of tenants) {
    const cs = env[`TENANT_DB_${t.id}`] || null;
    // tenant connection strings live in TenantDatabase table
  }
  const tds = await sql`SELECT "tenantId", "connectionString" FROM "TenantDatabase"`;
  for (const t of tenants) {
    const td = tds.find(x => x.tenantId === t.id);
    if (!td) { console.log(`${t.slug}: no dedicated DB row (shared)`); continue; }
    const tsql = neon(clean(td.connectionString));
    const linked = await tsql`
      SELECT u.id, u.email, u.role, u."tenantId", e.id AS emp_id, e."employeeId", e."firstName", e."lastName", e.status
      FROM "User" u LEFT JOIN "Employee" e ON e."userId" = u.id
      WHERE u.role IN ('ceo','tenant_admin','hr_admin') AND u.status = 'active' LIMIT 12`;
    console.log(`\n[${t.slug}] management users with/without linked Employee:`);
    linked.forEach(r => console.log(`  ${r.role} ${r.email} → ${r.emp_id ? `Employee ${r.employeeId} ${r.firstName} ${r.lastName} (${r.status})` : 'NO Employee row'}`));
    const empLinked = await tsql`SELECT COUNT(*)::int AS n FROM "Employee" e JOIN "User" u ON u.id = e."userId" WHERE u.role = 'employee'`;
    console.log(`  employees with linked user (role=employee): ${empLinked[0].n}`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
