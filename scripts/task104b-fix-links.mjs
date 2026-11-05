// Task 104b: inspect + fix employee↔user links and roles in the demo (platform) DB
import { readFileSync } from 'fs';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync('/home/z/toolchain/.env.demo2', 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const p = new pg.Client({ connectionString: env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || env.DATABASE_URL });
await p.connect();
// demo host routes to tenant 3boxes-hrms-demo's DEDICATED DB
const tdb = await p.query(`
  SELECT c."connectionString" FROM "TenantDatabase" c
  JOIN "Tenant" t ON t.id = c."tenantId" WHERE t.slug = '3boxes-hrms-demo'`);
await p.end();
if (!tdb.rows[0]) { console.error('no dedicated DB for 3boxes-hrms-demo'); process.exit(1); }
const c = new pg.Client({ connectionString: tdb.rows[0].connectionString });
await c.connect();
console.log('connected to dedicated demo DB');

const r = await c.query(`
  SELECT e.id, e.email, e."userId", e.status, e."reportingManagerId",
         u.email AS user_email, u.role
  FROM "Employee" e LEFT JOIN "User" u ON u.id = e."userId"
  WHERE e.email LIKE '%demo@3boxeshrms.com'`);
console.log('employee rows:', JSON.stringify(r.rows, null, 1));

const u = await c.query(`SELECT id, email, role, status FROM "User" WHERE email LIKE '%demo@3boxeshrms.com'`);
console.log('user rows:', JSON.stringify(u.rows, null, 1));

// Fix 1: ensure manager role
await c.query(`UPDATE "User" SET role='manager' WHERE email='manager.demo@3boxeshrms.com'`);

// Fix 2: ensure employee↔user links exist
for (const [email, ue] of [['manager.demo@3boxeshrms.com', 'manager.demo@3boxeshrms.com'], ['employee.demo@3boxeshrms.com', 'employee.demo@3boxeshrms.com']]) {
  const usr = await c.query(`SELECT id FROM "User" WHERE email=$1`, [ue]);
  if (usr.rows[0]) {
    await c.query(`UPDATE "Employee" SET "userId"=$1 WHERE email=$2 AND ("userId" IS NULL OR "userId"<>$1)`, [usr.rows[0].id, email]);
  }
}

// Fix 3: link Priya's reporting manager to Ravi
const link = await c.query(`
  UPDATE "Employee" pri SET "reportingManagerId" = ravi.id
  FROM "Employee" ravi
  WHERE ravi.email='manager.demo@3boxeshrms.com' AND pri.email='employee.demo@3boxeshrms.com'`);
console.log('reporting link rows affected:', link.rowCount);

const f = await c.query(`
  SELECT e.email, e."userId" IS NOT NULL AS linked, e."reportingManagerId", u.role
  FROM "Employee" e LEFT JOIN "User" u ON u.id=e."userId"
  WHERE e.email LIKE '%demo@3boxeshrms.com'`);
console.log('final:', JSON.stringify(f.rows, null, 1));
await c.end();
console.log('DONE');
