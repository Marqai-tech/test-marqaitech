// Task 127c — holiday/attendance junk survey before writing the fix
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

  // Holiday table structure + full 2026 rows
  const hcols = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Holiday' ORDER BY ordinal_position`);
  console.log('Holiday columns:', hcols.map((c) => c.column_name).join(', '));
  const hol = await db.query(`SELECT * FROM "Holiday" WHERE date >= '2026-01-01' AND date <= '2026-12-31' ORDER BY date`);
  console.log('\nHOLIDAYS 2026:');
  for (const h of hol) console.log(' ', JSON.stringify(h));

  // companies in tenant
  const comps = await db.query(`SELECT id, name FROM "Company"`);
  console.log('\nCOMPANIES:', comps.map((c) => `${c.id} ${c.name}`).join(' | '));

  // Attendance rows ON holiday dates 2026
  const attHol = await db.query(`
    SELECT a.date::text AS d, a.status, count(*)::int AS n,
           string_agg(DISTINCT e."employeeId", ',') AS codes,
           min(a."createdAt")::text AS first_created, max(a."createdAt")::text AS last_created
    FROM "Attendance" a JOIN "Employee" e ON e.id = a."employeeId"
    WHERE a.date::date IN (SELECT date::date FROM "Holiday" WHERE date >= '2026-01-01' AND date <= '2026-12-31')
    GROUP BY 1, 2 ORDER BY 1, 2`);
  console.log('\nATTENDANCE ON HOLIDAY DATES 2026:');
  for (const r of attHol) console.log(` ${r.d} ${r.status.padEnd(9)} n=${r.n} [${r.codes}] created ${r.first_created} .. ${r.last_created}`);

  // weekend rows (Sundays) status survey Oct
  const attSun = await db.query(`
    SELECT a.date::text AS d, extract(dow from a.date) AS dow, a.status, count(*)::int AS n
    FROM "Attendance" a
    WHERE a.date >= '2026-10-01' AND a.date <= '2026-10-31' AND extract(dow from a.date) IN (0, 6)
    GROUP BY 1, 2, 3 ORDER BY 1, 3`);
  console.log('\nATTENDANCE ON WEEKENDS Oct 2026:');
  for (const r of attSun) console.log(` ${r.d} (dow=${r.dow}) ${r.status} n=${r.n}`);

  // duplicates preview AFTER +330 normalization: same (employee, normalized date) >1
  const dups = await db.query(`
    WITH norm AS (
      SELECT a.id, e."employeeId" AS code, (a.date + interval '330 minutes')::date AS nd,
             a.status, a."checkIn" IS NOT NULL AND (a."checkIn" IS NULL OR (a."checkIn"::text NOT LIKE '% 04:00:00' OR a."checkOut" IS NULL OR a."checkOut"::text NOT LIKE '% 13:00:00')) AS has_real,
             a."createdAt"::text AS created
      FROM "Attendance" a JOIN "Employee" e ON e.id = a."employeeId")
    SELECT code, nd, count(*)::int AS n,
           string_agg(status || '/' || CASE WHEN has_real THEN 'REAL' ELSE 'FAKE' END || '/' || created, ' || ' ORDER BY created) AS detail
    FROM norm GROUP BY 1, 2 HAVING count(*) > 1 ORDER BY nd LIMIT 100`);
  console.log('\nDUP GROUPS AFTER NORMALIZATION (count):', dups.length);
  for (const d of dups.slice(0, 60)) console.log(` ${d.nd} ${d.code} x${d.n}: ${d.detail}`);

  // tenant timezone + company timezone fields
  const tcols = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Tenant' AND column_name ILIKE '%time%'`);
  const trow = await db.query(`SELECT slug, "timezone" FROM "Tenant" WHERE slug='marqaitechgroup'`).catch(() => null);
  console.log('\nTenant tz columns:', tcols.map((c) => c.column_name).join(','), '| row:', JSON.stringify(trow));
}

main().catch((e) => { console.error(e); process.exit(1); });
