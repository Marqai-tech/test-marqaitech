// Task 127b — raw date forensics: exact ISO dates + createdAt for Oct 14-22 rows
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
  const marqai = tenants.find((t) => /marqai/i.test(t.slug));
  const db = neon(marqai.cs);

  const rows = await db.query(`
    SELECT a.id, a.date::text AS date_raw, a.status, a."checkIn", a."checkOut",
           a."createdAt"::text AS created, a."updatedAt"::text AS updated,
           a.notes,
           e."employeeId" AS code, e."firstName"
    FROM "Attendance" a JOIN "Employee" e ON e.id = a."employeeId"
    WHERE a.date >= '2026-10-14' AND a.date <= '2026-10-23'
    ORDER BY e."employeeId", a.date`);
  console.log('RAW ROWS Oct 14-23:', rows.length);
  for (const r of rows) {
    console.log(`${r.code} date=${r.date_raw} ${r.status.padEnd(9)} in=${r.checkIn ? new Date(r.checkIn).toISOString() : '-'} src=${r.source || '-'} created=${r.created}`);
  }

  // distinct date styles across the whole table
  const styles = await db.query(`
    SELECT CASE WHEN date::text LIKE '%T18:30:00' THEN '18:30Z (ist-midnight)'
                WHEN date::text LIKE '%T00:00:00' THEN '00:00Z (utc-midnight)'
                ELSE 'other: ' || date::text END AS style, count(*)::int AS n
    FROM "Attendance" GROUP BY 1 ORDER BY 2 DESC`);
  console.log('\nDATE STYLES:', JSON.stringify(styles, null, 1));

  // how many duplicates: same employee + same IST calendar day in both styles
  const dups = await db.query(`
    WITH norm AS (
      SELECT e."employeeId" AS code, (date + interval '330 minutes')::date AS ist_day, count(*)::int AS n
      FROM "Attendance" a JOIN "Employee" e ON e.id = a."employeeId"
      GROUP BY 1, 2 HAVING count(*) > 1)
    SELECT code, ist_day, n FROM norm WHERE ist_day >= '2026-09-01' ORDER BY ist_day, code LIMIT 80`);
  console.log('\nDUP (same emp, same IST day) since Sep:', dups.length);
  for (const d of dups) console.log(` ${d.ist_day} ${d.code} x${d.n}`);

  // Attendance table columns (check 'source' col existence)
  const cols = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Attendance' ORDER BY ordinal_position`);
  console.log('\nAttendance columns:', cols.map((c) => c.column_name).join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
