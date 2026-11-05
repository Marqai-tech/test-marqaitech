// Task 126 — company policy context for the LOP backfill:
//   weekends config, holidays, approved leaves, management employees,
//   AttendancePolicyConfig + etimeoffice sync checkpoint/status settings.
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL='));
const PLATFORM = envLine ? envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim() : '';

async function main() {
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const db = neon(tenants.find((t) => /marqai/i.test(t.slug)).cs);

  // weekend config (Setting table, per attendance-auto-present getWeekendDaysSafe)
  const settings = await db.query(`
    SELECT key, value FROM "Setting"
    WHERE key ILIKE '%weekend%' OR key ILIKE '%etimeoffice%' OR key ILIKE '%work%week%'
    ORDER BY key`);
  console.log('settings:');
  for (const s of settings) console.log(`  ${s.key} = ${String(s.value).slice(0, 90)}`);

  const cfg = await db.query(`SELECT * FROM "AttendancePolicyConfig" LIMIT 1`);
  if (cfg[0]) {
    const c = cfg[0];
    console.log('\nAttendancePolicyConfig:', JSON.stringify({
      autoPresentManagementEnabled: c.autoPresentManagementEnabled,
      mobileCheckInEnabled: c.mobileCheckInEnabled,
      webCheckInEnabled: c.webCheckInEnabled,
      shiftStartDefault: c.shiftStartDefault, shiftEndDefault: c.shiftEndDefault,
      companyId: c.companyId,
    }));
  } else console.log('\nno AttendancePolicyConfig row');

  const hol = await db.query(`
    SELECT name, date FROM "Holiday" WHERE date >= '2026-05-01' AND date < '2026-11-01' ORDER BY date`);
  console.log('\nholidays May-Oct:', hol.map((h) => `${new Date(h.date).toISOString().slice(0, 10)} ${h.name}`).join(' | ') || 'none');

  const leaves = await db.query(`
    SELECT "employeeId", date_part('month', "startDate")::int AS m, status, count(*)::int AS n
    FROM "Leave" WHERE "startDate" >= '2026-05-01' AND "startDate" < '2026-11-01'
    GROUP BY 1, 2, 3 ORDER BY 1, 2`).catch(async () => {
    const t = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%leave%'`);
    console.log('leave tables:', t.map((x) => x.table_name).join(', '));
    return [];
  });
  if (leaves.length) {
    const emps = await db.query(`SELECT id, "firstName" FROM "Employee"`);
    const nm = Object.fromEntries(emps.map((e) => [e.id, e.firstName]));
    console.log('\nleaves May-Oct:');
    for (const l of leaves) console.log(`  ${nm[l.employeeId] || l.employeeId} ${l.m}: ${l.status} × ${l.n}`);
  } else if (!leaves.length) console.log('');

  const mgmt = await db.query(`
    SELECT e."firstName", e."lastName", e."isManagement", u.role
    FROM "Employee" e LEFT JOIN "User" u ON u."employeeId" = e.id
    WHERE e.status = 'active' ORDER BY e."firstName"`);
  console.log('\nmanagement/user roles:');
  for (const m of mgmt) console.log(`  ${m.firstName} ${m.lastName}: isManagement=${m.isManagement} role=${m.role || '—'}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
