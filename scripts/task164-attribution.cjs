#!/usr/bin/env node
/* Task 164 — verify punch attribution: raw Empcode vs linked employee. */
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

  console.log('── Raw Empcode → linked employee (October) ──');
  const rows = await db.query(`
    SELECT bp."rawPayload"->>'Empcode' AS empcode,
           bp."rawPayload"->>'Name' AS dev_name,
           e."employeeId" AS linked_code,
           e."firstName" || ' ' || e."lastName" AS linked_name,
           COUNT(*)::int AS n,
           MIN(bp."punchTime") AS first_p, MAX(bp."punchTime") AS last_p
    FROM "BiometricPunch" bp
    LEFT JOIN "Employee" e ON e.id = bp."employeeId"
    WHERE bp."punchTime" >= '2026-10-01'
    GROUP BY 1, 2, 3, 4 ORDER BY 1`);
  for (const r of rows) console.log(JSON.stringify(r));

  console.log('\n── Punches per linked employee per day (Oct, MARQ007 vs MARQ008) ──');
  const per = await db.query(`
    SELECT e."employeeId" AS linked, (bp."punchTime" AT TIME ZONE 'Asia/Kolkata')::date AS day,
           COUNT(*)::int AS punches
    FROM "BiometricPunch" bp JOIN "Employee" e ON e.id = bp."employeeId"
    WHERE bp."punchTime" >= '2026-10-01' AND e."employeeId" IN ('MARQ007','MARQ008')
    GROUP BY 1, 2 ORDER BY 2, 1`);
  for (const r of per) console.log(`${r.linked} ${new Date(r.day).toISOString().slice(0,10)} punches=${r.punches}`);

  console.log('\n── All October punch days where BOTH codes would collide ──');
  const collide = await db.query(`
    SELECT (bp."punchTime" AT TIME ZONE 'Asia/Kolkata')::date AS day,
           bp."rawPayload"->>'Empcode' AS empcode, COUNT(*)::int AS n
    FROM "BiometricPunch" bp
    WHERE bp."punchTime" >= '2026-10-01' AND bp."rawPayload"->>'Empcode' IN ('007','2','002')
    GROUP BY 1, 2 ORDER BY 1, 2`);
  for (const r of collide) console.log(`${new Date(r.day).toISOString().slice(0,10)} code=${r.empcode} n=${r.n}`);
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
