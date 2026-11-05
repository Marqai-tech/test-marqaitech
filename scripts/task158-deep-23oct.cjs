#!/usr/bin/env node
/* Task 158 — deep-dive 23 Oct: who punched, classification, audit trail. */
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

  // All punches 23-27 Oct with employee names
  const punches = await db.query(`
    SELECT bp."punchTime" AT TIME ZONE 'Asia/Kolkata' AS ist, bp."punchType", bp."createdAt",
           e."employeeId" AS code, e."firstName" || ' ' || e."lastName" AS name, bp."attendanceId"
    FROM "BiometricPunch" bp LEFT JOIN "Employee" e ON e.id = bp."employeeId"
    WHERE bp."punchTime" >= '2026-10-22T18:30:00Z' ORDER BY bp."punchTime"`);
  console.log('PUNCHES from 23 Oct IST:');
  for (const p of punches) console.log(`  ${new Date(p.ist).toISOString().slice(0, 16)}  ${String(p.code || 'UNMATCHED')} ${String(p.name || '')}  ${p.punchType}  att=${p.attendanceId || '—'}`);

  // PunchEvent rows 22-27 Oct
  const pe = await db.query(`
    SELECT "timestamp" AT TIME ZONE 'Asia/Kolkata' AS ist, type, method, notes,
           e."employeeId" AS code, e."firstName" AS fn
    FROM "PunchEvent" p LEFT JOIN "Employee" e ON e.id = p."employeeId"
    WHERE p."timestamp" >= '2026-10-22T18:30:00Z' ORDER BY p."timestamp"`);
  console.log('PUNCHEVENTS from 23 Oct IST:');
  for (const r of pe) console.log(`  ${new Date(r.ist).toISOString().slice(0, 16)}  ${r.code} ${r.fn}  ${r.type}/${r.method}  ${String(r.notes || '').slice(0, 60)}`);

  // Any attendance rows 23-24 Oct at all (raw)
  const att = await db.query(`
    SELECT date AT TIME ZONE 'Asia/Kolkata' AS d, a."punchMethod", a.status, a."checkIn" AT TIME ZONE 'Asia/Kolkata' AS ci,
           e."employeeId" AS code, e."firstName" AS fn
    FROM "Attendance" a LEFT JOIN "Employee" e ON e.id = a."employeeId"
    WHERE date >= '2026-10-22T18:30:00Z' AND date < '2026-10-24T18:30:00Z' ORDER BY date`);
  console.log('ATTENDANCE rows 23-24 Oct:', JSON.stringify(att, null, 1));

  // Audit log around 23-27 Oct mentioning attendance
  const audit = await db.query(`
    SELECT "createdAt", action, entity, "entityId", LEFT("details"::text, 160) AS details
    FROM "AuditLog"
    WHERE "createdAt" >= '2026-10-22' AND (LOWER(entity) LIKE '%attendance%' OR LOWER(action) LIKE '%attendance%' OR LOWER("details"::text) LIKE '%attendance%')
    ORDER BY "createdAt" DESC LIMIT 20`).catch(async (e) => {
    console.log('AuditLog query v1 failed:', e.message.slice(0, 80));
    return db.query(`SELECT * FROM "AuditLog" WHERE "createdAt" >= '2026-10-22' ORDER BY "createdAt" DESC LIMIT 10`).catch((e2) => {
      console.log('AuditLog query v2 failed:', e2.message.slice(0, 120));
      return [];
    });
  });
  console.log('AUDIT rows:', JSON.stringify(audit, null, 1));

  // PunchEvents 23 Oct per employee with method biometric - to compare count vs punches
  const cnt = await db.query(`
    SELECT e."employeeId" AS code,
           COUNT(DISTINCT bp.id)::int AS punches_23,
           (SELECT COUNT(*)::int FROM "PunchEvent" px WHERE px."employeeId" = bp."employeeId" AND px."timestamp" >= '2026-10-22T18:30:00Z' AND px."timestamp" < '2026-10-23T18:30:00Z') AS pe_23
    FROM "BiometricPunch" bp LEFT JOIN "Employee" e ON e.id = bp."employeeId"
    WHERE bp."punchTime" >= '2026-10-22T18:30:00Z' AND bp."punchTime" < '2026-10-23T18:30:00Z'
    GROUP BY 1, bp."employeeId"`);
  console.log('23-Oct per-employee punch vs punchEvent counts:', JSON.stringify(cnt));
}
main().catch((e) => { console.error('DEEP FAILED:', e.message); process.exit(1); });
