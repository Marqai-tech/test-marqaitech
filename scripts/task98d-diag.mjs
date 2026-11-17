// Task 98-d diagnostic (READ-ONLY): why didn't the unscoped employee exclusion fire?
import fs from 'node:fs';
import pg from 'pg';

const env = fs.readFileSync('/tmp/vlink/live.env', 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '="([\\s\\S]*?)"', 'm')) || [])[1];
const cs = get('DATABASE_URL');
const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await client.connect();

const hiddenSlugs = ['3boxes-hrms-demo', '3boxeshrms', '3boxes-corp', 'acme-global-demo', 'zenith-retail-demo', 'nova-tech-demo'];

const total = await client.query('SELECT count(*)::int AS n FROM "Employee"');
console.log('total employees:', total.rows[0].n);

const nulls = await client.query('SELECT count(*)::int AS n FROM "Employee" WHERE "companyId" IS NULL');
console.log('employees with NULL companyId:', nulls.rows[0].n);

const byTenant = await client.query(`
  SELECT COALESCE(t.slug,'(none)') AS slug, COALESCE(t.name,'-') AS tenant_name, count(*)::int AS employees
  FROM "Employee" e
  LEFT JOIN "Company" c ON c.id = e."companyId"
  LEFT JOIN "CompanyGroup" g ON g.id = c."companyGroupId"
  LEFT JOIN "Tenant" t ON t.id = g."tenantId"
  GROUP BY 1,2 ORDER BY 3 DESC`);
console.log('\nemployees by tenant (via company->group->tenant):');
for (const r of byTenant.rows) console.log(`  ${r.slug} [${r.tenant_name}]: ${r.employees}`);

const hidden = await client.query(
  'SELECT id, slug FROM "Tenant" WHERE slug = ANY($1) OR name LIKE $2',
  [hiddenSlugs, 'Marq AI Tech Pvt Ltd'],
);
console.log('\nhidden tenants found:', hidden.rows.map(r => `${r.slug}:${r.id.slice(0,8)}`).join(', '));

const hiddenCompanies = await client.query(`
  SELECT count(*)::int AS n FROM "Company" c
  JOIN "CompanyGroup" g ON g.id = c."companyGroupId"
  WHERE g."tenantId" = ANY($1)`, [hidden.rows.map(r => r.id)]);
console.log('companies under hidden tenants:', hiddenCompanies.rows[0].n);

const sim = await client.query(`
  SELECT count(*)::int AS n FROM "Employee" e
  WHERE e."companyId" IS NOT NULL AND e."companyId" NOT IN (
    SELECT c.id FROM "Company" c
    JOIN "CompanyGroup" g ON g.id = c."companyGroupId"
    WHERE g."tenantId" = ANY($1)
  )`, [hidden.rows.map(r => r.id)]);
console.log('\nSIMULATED exclusion result (employees remaining):', sim.rows[0].n);

const sample = await client.query(`
  SELECT e."firstName", e."lastName", e."email", t.slug AS tenant_slug
  FROM "Employee" e
  LEFT JOIN "Company" c ON c.id = e."companyId"
  LEFT JOIN "CompanyGroup" g ON g.id = c."companyGroupId"
  LEFT JOIN "Tenant" t ON t.id = g."tenantId"
  WHERE e."companyId" IS NULL OR t.id IS NULL OR t.slug IS NULL
  LIMIT 8`);
console.log('\nsample non-hidden-linked employees:');
for (const r of sample.rows) console.log(`  ${r.firstName} ${r.lastName} <${r.email}> tenant=${r.tenant_slug}`);

await client.end();
