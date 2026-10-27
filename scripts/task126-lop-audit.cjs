// Task 126 — LOP accuracy audit: for the 9 MarqAI employees compare
//   (a) biometric punches (EtimeOfficePunch / any punch log)
//   (b) Attendance rows (status counts + missing days)
//   (c) Payroll lopDays per month (Sep 2026 and earlier)
// READ-ONLY — connects via the platform DB's TenantDatabase registry.
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
// parse .env manually (quotes not stripped by the installed dotenv)
const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL='));
const PLATFORM = envLine ? envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim() : '';
if (!PLATFORM) { console.error('DATABASE_URL missing'); process.exit(1); }

async function main() {
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const marqai = tenants.find((t) => /marqai/i.test(t.slug));
  if (!marqai) { console.error('marqai tenant DB not found'); process.exit(1); }
  const db = neon(marqai.cs);
  console.log('tenant DB:', marqai.slug);

  // punch log tables present?
  const tables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name ILIKE '%punch%' OR table_name ILIKE '%li%' OR table_name ILIKE '%device%'
    ORDER BY table_name`);
  console.log('punch-ish tables:', tables.map((t) => t.table_name).join(', '));

  const emps = await db.query(`
    SELECT id, "firstName", "lastName", "employeeId", "dateOfJoining", status, salary
    FROM "Employee" WHERE status = 'active' ORDER BY "firstName"`);
  console.log('\nactive employees:', emps.length);

  // Attendance + payroll per employee per month (May..Oct 2026)
  for (const e of emps) {
    const name = `${e.firstName} ${e.lastName}`;
    const att = await db.query(`
      SELECT date_part('month', date)::int AS m, status, count(*)::int AS n
      FROM "Attendance"
      WHERE "employeeId" = $1 AND date >= '2026-05-01' AND date < '2026-11-01'
      GROUP BY 1, 2 ORDER BY 1, 2`, [e.id]);
    const pay = await db.query(`
      SELECT month, year, "lopDays", "paidDays", "totalDays", "netSalary" AS net
      FROM "Payroll" WHERE "employeeId" = $1 AND year = 2026 AND month BETWEEN 5 AND 10
      ORDER BY month`, [e.id]);
    console.log(`\n== ${name} (${e.employeeId}) DOJ ${new Date(e.dateOfJoining).toISOString().slice(0, 10)}`);
    for (const p of pay) {
      const rows = att.filter((a) => a.m === p.month);
      const byStatus = rows.map((r) => `${r.status}:${r.n}`).join(' ') || 'NO ATTENDANCE ROWS';
      const totalRows = rows.reduce((s, r) => s + r.n, 0);
      console.log(`   ${p.year}-${String(p.month).padStart(2, '0')} lop ${p.lopDays} paid ${p.paidDays}/${p.totalDays} net ${p.net} | rows ${totalRows} [${byStatus}]`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
