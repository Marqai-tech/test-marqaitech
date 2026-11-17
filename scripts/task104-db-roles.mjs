// Task 104: set manager role + reporting link in the demo tenant DB (via platform DB → TenantDbConnection)
import { readFileSync } from 'fs';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync('/home/z/toolchain/.env.demo2', 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const PLATFORM = env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || env.DATABASE_URL;
console.log('platform db host:', new URL(PLATFORM).host, '/', new URL(PLATFORM).pathname);

const p = new pg.Client({ connectionString: PLATFORM });
await p.connect();

// 1. Which tenant hosts admin@acme-global? tenants with their DB connections
const t = await p.query(`
  SELECT t.id, t.name, t.slug, c.id AS conn_id, c."connectionString", c."databaseName"
  FROM "Tenant" t
  LEFT JOIN "TenantDatabase" c ON c."tenantId" = t.id
`);
for (const r of t.rows) console.log('tenant:', r.slug, '| db:', r.databaseName || '(shared platform)');
const demo = t.rows.find(r => r.slug?.includes('acme') || r.slug?.includes('demo')) || t.rows[0];
console.log('using tenant:', demo.slug);

let target = PLATFORM; // fallback: shared platform DB
if (demo.conn_id) target = demo.connectionString;
const d = new pg.Client({ connectionString: target });
await d.connect();
console.log('connected tenant db:', new URL(target).pathname);

// 2. current users
const u0 = await d.query(`SELECT email, role, status FROM "User" WHERE email IN ('manager.demo@3boxeshrms.com','employee.demo@3boxeshrms.com','admin@acme-global.com')`);
console.log('before:', u0.rows);

// 3. promote manager + link reporting manager
await d.query(`UPDATE "User" SET role='manager' WHERE email='manager.demo@3boxeshrms.com'`);
const ravi = await d.query(`SELECT id FROM "Employee" WHERE email='manager.demo@3boxeshrms.com'`);
const priya = await d.query(`SELECT id FROM "Employee" WHERE email='employee.demo@3boxeshrms.com'`);
if (ravi.rows[0] && priya.rows[0]) {
  await d.query(`UPDATE "Employee" SET "reportingManagerId"=$1 WHERE id=$2`, [ravi.rows[0].id, priya.rows[0].id]);
  console.log('linked Priya → reporting manager Ravi');
}
const u1 = await d.query(`SELECT email, role FROM "User" WHERE email IN ('manager.demo@3boxeshrms.com','employee.demo@3boxeshrms.com')`);
console.log('after:', u1.rows);
await d.end(); await p.end();
console.log('DONE');
