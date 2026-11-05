#!/usr/bin/env node
/* Task 158 — diagnose why biometric punches stopped flowing from 23 Oct 2026.
 * Reads the tenant DB: sync status/checkpoint settings, punch counts by day,
 * attendance rows by day, device state, and unmatched punches. */
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
  console.log('== Tenant resolved: marqaitechgroup ==');

  // 1) Sync settings (checkpoint + status)
  const settings = await db.query(`
    SELECT key, value, "updatedAt" FROM "Setting"
    WHERE category = 'integration' AND key IN ('etimeoffice_biometric_last_record','etimeoffice_biometric_sync_status')`);
  for (const s of settings) console.log(`SETTING ${s.key} (upd ${s.updatedAt ? new Date(s.updatedAt).toISOString() : '?'}):`, s.value);

  // 2) Devices
  const devices = await db.query(`SELECT id, name, "serialNumber", "isActive", "lastHeartbeatAt" FROM "BiometricDevice"`);
  console.log('DEVICES:', JSON.stringify(devices));

  // 3) Punches by IST day since 18 Oct
  const punches = await db.query(`
    SELECT ("punchTime" AT TIME ZONE 'Asia/Kolkata')::date AS day, "punchType", COUNT(*)::int AS n
    FROM "BiometricPunch" WHERE "punchTime" >= '2026-10-18'
    GROUP BY 1, 2 ORDER BY 1, 2`);
  console.log('PUNCHES BY DAY (IST):');
  for (const r of punches) console.log(`  ${new Date(r.day).toISOString().slice(0, 10)}  ${r.punchType}  ${r.n}`);

  // 4) Attendance by IST day since 18 Oct
  const att = await db.query(`
    SELECT (date AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS n,
           SUM(CASE WHEN "checkIn" IS NOT NULL THEN 1 ELSE 0 END)::int AS with_in,
           SUM(CASE WHEN "checkOut" IS NOT NULL THEN 1 ELSE 0 END)::int AS with_out
    FROM "Attendance" WHERE date >= '2026-10-18' GROUP BY 1 ORDER BY 1`);
  console.log('ATTENDANCE BY DAY:');
  for (const r of att) console.log(`  ${new Date(r.day).toISOString().slice(0, 10)}  rows=${r.n} checkIn=${r.with_in} checkOut=${r.with_out}`);

  // 5) Unmatched punches since 20 Oct
  const unmatched = await db.query(`
    SELECT "rawPayload"->>'Empcode' AS empcode, COUNT(*)::int AS n
    FROM "BiometricPunch" WHERE "punchType" = 'unmatched' AND "punchTime" >= '2026-10-20'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
  console.log('UNMATCHED since 20 Oct:', JSON.stringify(unmatched));

  // 6) Any error-state rows in Setting (recent)
  const errs = await db.query(`
    SELECT key, value FROM "Setting"
    WHERE value LIKE '%"state":"error"%' ORDER BY "updatedAt" DESC LIMIT 5`);
  console.log('ERROR-STATE SETTINGS:', JSON.stringify(errs));
}
main().catch((e) => { console.error('DIAG FAILED:', e.message); process.exit(1); });
