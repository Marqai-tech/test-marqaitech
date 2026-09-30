/**
 * Phase 2: EXPLAIN ANALYZE against MarqAI tenant DB (and platform User lookup).
 * Prints plans only — never logs connection strings.
 */
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(path.join(__dirname, '..', '.env.local'));
loadEnv(path.join(__dirname, '..', '.env.production.local'));
loadEnv(path.join(__dirname, '..', '.env'));
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.production.local') });
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
} catch { /* optional */ }

const platformUrl = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.TENANT_DATABASE_URL;
if (!platformUrl) {
  console.error('No platform DATABASE_URL / POSTGRES_*');
  process.exit(1);
}

function summarize(planRows) {
  const text = planRows.map((r) => Object.values(r)[0]).join('\n');
  const exec = text.match(/Execution Time:\s*([\d.]+)\s*ms/);
  const plan = text.match(/Planning Time:\s*([\d.]+)\s*ms/);
  const seq = /Seq Scan/i.test(text);
  const idx = /Index Scan|Index Only Scan|Bitmap Index Scan/i.test(text);
  const nest = /Nested Loop/i.test(text);
  const hash = /Hash Join/i.test(text);
  const merge = /Merge Join/i.test(text);
  return { execMs: exec ? exec[1] : null, planMs: plan ? plan[1] : null, seq, idx, nest, hash, merge, text };
}

async function explain(sql, title, query) {
  const rows = await sql.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`);
  const s = summarize(rows);
  console.log('\n======== ' + title + ' ========');
  console.log('SQL: ' + query.replace(/\s+/g, ' ').trim().slice(0, 400));
  console.log('Planning Time: ' + (s.planMs || '?') + ' ms');
  console.log('Execution Time: ' + (s.execMs || '?') + ' ms');
  console.log('Seq Scan: ' + s.seq + ' | Index scan: ' + s.idx);
  console.log('Join: nestedLoop=' + s.nest + ' hash=' + s.hash + ' merge=' + s.merge);
  console.log(s.text);
  return s;
}

async function main() {
  const platform = neon(platformUrl);
  const td = await platform.query(
    `SELECT "connectionString" FROM "TenantDatabase" WHERE "tenantSlug" = $1 OR slug = $1 LIMIT 1`,
    ['marqaitechgroup'],
  ).catch(() => []);

  let tenantUrl = process.env.TENANT_DATABASE_URL || null;
  if (!tenantUrl && td.length) {
    const row = td[0];
    tenantUrl = row.connectionString || row.connectionstring;
  }
  if (!tenantUrl) {
    console.error('Could not resolve tenant DB URL (no TENANT_DATABASE_URL and TenantDatabase lookup empty).');
    process.exit(1);
  }

  const sql = neon(tenantUrl);
  console.log('Connected to tenant DB (marqaitechgroup). Host prefix only: ' + new URL(tenantUrl.replace('postgresql://', 'http://')).host.split('.')[0]);

  const idx = await sql`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('Employee','Attendance','LeaveRequest','User','Company','CompanyGroup','Department','Designation','Payroll','JobPosting','JobApplication') ORDER BY tablename, indexname`;
  console.log('\n======== INDEXES ========');
  for (const r of idx) console.log(r.tablename + ' | ' + r.indexname + ' | ' + r.indexdef);

  const emp = await sql`SELECT id FROM "Employee" ORDER BY "createdAt" DESC LIMIT 1`;
  const empId = emp[0]?.id;
  const user = await sql`SELECT id FROM "User" LIMIT 1`.catch(() => []);
  const userId = user[0]?.id;
  const tenantRow = await platform.query(`SELECT id FROM "Tenant" WHERE slug = $1 LIMIT 1`, ['marqaitechgroup']).catch(() => []);
  const tenantId = tenantRow[0]?.id;

  await explain(sql, 'Employee list (limit 10, omit avatar conceptually)',
    `SELECT e.id, e."firstName", e."lastName", e."employeeId", e.status, e."createdAt",
            d.id AS dept_id, d.name AS dept_name,
            g.id AS desig_id, g.title AS desig_title,
            b.id AS branch_id, b.name AS branch_name,
            u.id AS user_id, u.email, u.role
     FROM "Employee" e
     LEFT JOIN "Department" d ON d.id = e."departmentId"
     LEFT JOIN "Designation" g ON g.id = e."designationId"
     LEFT JOIN "Branch" b ON b.id = e."branchId"
     LEFT JOIN "User" u ON u.id = e."userId"
     ORDER BY e."createdAt" DESC
     LIMIT 10`);

  await explain(sql, 'Employee list COUNT',
    `SELECT COUNT(*) FROM "Employee"`);

  if (empId) {
    await explain(sql, 'Employee detail by PK (all scalar columns, includes avatar TOAST)',
      `SELECT * FROM "Employee" WHERE id = '${empId}'`);
    await explain(sql, 'Employee detail by PK WITHOUT avatar',
      `SELECT id, "firstName", "lastName", "employeeId", status, email, "companyId", "departmentId", "designationId", "branchId", "userId", "createdAt"
       FROM "Employee" WHERE id = '${empId}'`);
    await explain(sql, 'Employee detail optional leaveBalances',
      `SELECT * FROM "LeaveBalance" WHERE "employeeId" = '${empId}'`);
    await explain(sql, 'Employee detail optional documents',
      `SELECT * FROM "Document" WHERE "employeeId" = '${empId}'`);
    await explain(sql, 'Photo existence check (list/attendance helper)',
      `SELECT e.id FROM "Employee" e LEFT JOIN "User" u ON u.id = e."userId"
       WHERE e.id = '${empId}' AND (COALESCE(e."avatar", '') <> '' OR COALESCE(u."avatar", '') <> '')`);
  }

  await explain(sql, 'Attendance list limit 20 + employee join WITH avatar',
    `SELECT a.*, e.id AS e_id, e."firstName", e."lastName", e."employeeId", e.avatar
     FROM "Attendance" a
     LEFT JOIN "Employee" e ON e.id = a."employeeId"
     ORDER BY a.date DESC
     LIMIT 20`);

  await explain(sql, 'Attendance list limit 20 + employee join WITHOUT avatar',
    `SELECT a.id, a.date, a.status, a."employeeId", e.id AS e_id, e."firstName", e."lastName", e."employeeId"
     FROM "Attendance" a
     LEFT JOIN "Employee" e ON e.id = a."employeeId"
     ORDER BY a.date DESC
     LIMIT 20`);

  await explain(sql, 'Attendance COUNT',
    `SELECT COUNT(*) FROM "Attendance"`);

  await explain(sql, 'LeaveRequest list limit 20',
    `SELECT l.id, l.status, l."employeeId", l."createdAt"
     FROM "LeaveRequest" l
     ORDER BY l."createdAt" DESC
     LIMIT 20`);

  await explain(sql, 'Analytics: employee counts',
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active') AS active,
       COUNT(*) FILTER (WHERE "dateOfJoining" >= NOW() - INTERVAL '30 days') AS new_hires,
       COUNT(*) FILTER (WHERE status IN ('terminated','resigned')) AS separated
     FROM "Employee"`);

  await explain(sql, 'Analytics: employee groupBy departmentId',
    `SELECT "departmentId", COUNT(*) FROM "Employee" WHERE status = 'active' GROUP BY "departmentId"`);

  await explain(sql, 'Analytics: leave counts',
    `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'approved') AS approved,
            COUNT(*) AS total
     FROM "LeaveRequest"`);

  await explain(sql, 'Analytics: attendance groupBy status 30d',
    `SELECT status, COUNT(*) FROM "Attendance" WHERE date >= NOW() - INTERVAL '30 days' GROUP BY status`);

  await explain(sql, 'Company list',
    `SELECT id, name, code, status FROM "Company" ORDER BY name ASC`);

  await explain(sql, 'CompanyGroup by tenantId (if column exists)',
    `SELECT id, name FROM "CompanyGroup" ORDER BY name ASC LIMIT 50`);

  await explain(sql, 'Designations list',
    `SELECT id, title, "departmentId", level, status FROM "Designation" ORDER BY title ASC`);

  if (userId) {
    await explain(sql, 'Auth /api/auth/me User by PK (tenant DB)',
      `SELECT id, name, email, role, avatar, status, "lastLogin", "createdAt", "tenantId" FROM "User" WHERE id = '${userId}'`);
    await explain(sql, 'me/context employee.findFirst by userId',
      `SELECT id, "companyId", email FROM "Employee" WHERE "userId" = '${userId}' LIMIT 1`);
  }

  if (tenantId) {
    await explain(platform, 'Platform Tenant by slug',
      `SELECT id, name, slug, plan, status FROM "Tenant" WHERE slug = 'marqaitechgroup' LIMIT 1`);
    await explain(platform, 'Platform User by tenantId sample',
      `SELECT id, email, role FROM "User" WHERE "tenantId" = '${tenantId}' LIMIT 5`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
