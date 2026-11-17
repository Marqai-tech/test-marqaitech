// Task 127 — audit Oct 21 2026 (Dussehra holiday) punches + attendance in production MarqAI tenant
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
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

  // 1. Holidays around Oct 2026
  const hol = await db.query(
    `SELECT id, name, date FROM "Holiday" WHERE date >= '2026-09-01' AND date <= '2026-12-31' ORDER BY date`
  );
  console.log('\nHOLIDAYS Sep-Dec 2026:');
  for (const h of hol) console.log(` ${new Date(h.date).toISOString().slice(0, 10)} ${h.name}`);

  // 2. Attendance rows Oct 17-22
  const att = await db.query(
    `SELECT a.date, a.status, a."checkIn", a."checkOut", a."workHours", e."employeeId" AS code, e."firstName", e."lastName"
     FROM "Attendance" a JOIN "Employee" e ON e.id = a."employeeId"
     WHERE a.date >= '2026-10-17' AND a.date <= '2026-10-22'
     ORDER BY a.date, e."employeeId"`
  );
  console.log('\nATTENDANCE 2026-10-17..22:', att.length);
  for (const r of att) {
    const ci = r.checkIn ? new Date(r.checkIn).toISOString() : '-';
    const co = r.checkOut ? new Date(r.checkOut).toISOString() : '-';
    console.log(` ${new Date(r.date).toISOString().slice(0, 10)} ${r.status.padEnd(9)} in=${ci} out=${co} ${r.code} ${r.firstName} ${r.lastName}`);
  }

  // 3. Punch-ish tables Oct 20-22
  const tables = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%punch%' ORDER BY table_name`);
  console.log('\npunch tables:', tables.map((t) => t.table_name).join(', '));
  for (const { table_name } of tables) {
    const cols = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [table_name]);
    const timeCol = cols.map((c) => c.column_name).find((c) => /time|date/i.test(c) && !/update|create/i.test(c));
    if (!timeCol) continue;
    const rows = await db.query(
      `SELECT * FROM "${table_name}" WHERE "${timeCol}" >= '2026-10-20 00:00:00' AND "${timeCol}" <= '2026-10-22 23:59:59' ORDER BY "${timeCol}" LIMIT 60`
    );
    console.log(`\n== ${table_name} (${timeCol}) rows 10-20..10-22: ${rows.length}`);
    for (const r of rows.slice(0, 40)) console.log(' ', JSON.stringify(r).slice(0, 200));
  }

  // 4. attendance count by date for Oct
  const cnt = await db.query(
    `SELECT date, count(*)::int AS n, string_agg(DISTINCT status, ',') AS statuses FROM "Attendance"
     WHERE date >= '2026-10-01' AND date <= '2026-10-22' GROUP BY date ORDER BY date`
  );
  console.log('\nAttendance count by date Oct 2026:');
  for (const r of cnt) console.log(` ${new Date(r.date).toISOString().slice(0, 10)} -> ${r.n} [${r.statuses}]`);
}

main().catch((e) => { console.error(e); process.exit(1); });
