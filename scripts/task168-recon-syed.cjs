// Recon v2: Syed MARQ015 Sep rows with correct column names.
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL='));
const platform = neon(envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, ''));

(async () => {
  const tenants = await platform.query('SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true');
  const db = neon(tenants.find(x => /marqai/i.test(x.slug)).cs);
  const emp = await db.query(`SELECT id, "employeeId", "firstName", "lastName" FROM "Employee" WHERE "employeeId" = 'MARQ015'`);
  if (!emp[0]) { console.log('MARQ015 not found'); return; }
  console.log('employee:', emp[0].id, emp[0].firstName, emp[0].lastName);
  const rows = await db.query(`
    SELECT "date"::text, status, "checkIn"::text AS cin, "checkOut"::text AS cout,
           "workHours"::text AS hrs, notes, "punchMethod", "updatedAt"::text
    FROM "Attendance" WHERE "employeeId" = $1
      AND "date" >= '2026-09-01' AND "date" <= '2026-09-30'
    ORDER BY "date"`, [emp[0].id]);
  console.log('=== Sep rows (' + rows.length + ') ===');
  rows.forEach(r => console.log(
    r.date, '|', String(r.status).padEnd(9), '|', String(r.hrs ?? '-').padStart(5), 'h',
    '| in', String(r.cin || '-').slice(11, 16), '| out', String(r.cout || '-').slice(11, 16),
    '|', r.punchMethod || '-', '| notes:', String(r.notes || '').slice(0, 70)
  ));
  // Payroll row for Sep
  const pr = await db.query(`
    SELECT period, "lopDays", "paidDays", "totalDays", LEFT(COALESCE("attendanceJson",''), 160) AS aj
    FROM "Payroll" WHERE "employeeId" = $1 AND period ILIKE '%2026-09%' OR ("employeeId" = $1 AND period ILIKE '%sep%')
    LIMIT 3`, [emp[0].id]);
  console.log('\n=== Payroll rows ===');
  (pr).forEach(p => console.log(p.period, '| lop:', p.lopDays, '| paid:', p.paidDays, '| total:', p.totalDays, '|', p.aj));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
