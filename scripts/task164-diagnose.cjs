#!/usr/bin/env node
/* Task 164 — diagnostics:
 *  A) Biometric mapping: code map setting, Suresh/Madhuri records, unmatched punches (codes 007 / 2),
 *     attendance state for both, auto-present toggle.
 *  B) Policy acknowledgement: active policies, acks, pending >= 30 days, reminder deliveries. */
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

  console.log('\n── A1. Employee biometric columns + code map ──');
  const cols = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Employee' AND column_name IN ('biometricId','autoPresentAllDays')`);
  console.log('Employee extra cols present:', cols.map((c) => c.column_name));
  const map = await db.query(`
    SELECT value, "updatedAt" FROM "Setting" WHERE key = 'etimeoffice_employee_code_map'`);
  console.log('CODE MAP:', map.length ? map[0].value : '(none)', map.length ? `upd ${map[0].updatedAt}` : '');

  console.log('\n── A2. Target employees ──');
  const emps = await db.query(`
    SELECT e.id, e."employeeId", e."firstName", e."lastName", e.status, e."isManagement",
           e."userId", u.role, e."reportingManagerId", rm."firstName" AS rm_first, rm."lastName" AS rm_last,
           e."dateOfJoining"
    FROM "Employee" e
    LEFT JOIN "User" u ON u.id = e."userId"
    LEFT JOIN "Employee" rm ON rm.id = e."reportingManagerId"
    WHERE e."employeeId" IN ('MARQ007','MARQ008')`);
  for (const e of emps) console.log(JSON.stringify(e));

  console.log('\n── A3. Unmatched punches last 60 days by raw Empcode ──');
  const unmatched = await db.query(`
    SELECT "rawPayload"->>'Empcode' AS empcode, "rawPayload"->>'Name' AS name,
           MIN("punchTime") AS first_p, MAX("punchTime") AS last_p, COUNT(*)::int AS n
    FROM "BiometricPunch" WHERE "punchType" = 'unmatched' AND "punchTime" >= NOW() - INTERVAL '60 days'
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20`);
  for (const r of unmatched) console.log(JSON.stringify(r));
  const unmatchedTotal = await db.query(`
    SELECT COUNT(*)::int AS n FROM "BiometricPunch" WHERE "punchType" = 'unmatched'`);
  console.log('Unmatched total (all time):', unmatchedTotal[0].n);

  console.log('\n── A4. October attendance for both employees ──');
  const att = await db.query(`
    SELECT e."employeeId", (a.date AT TIME ZONE 'Asia/Kolkata')::date AS day, a.status,
           a."checkIn" IS NOT NULL AS has_in, a."checkOut" IS NOT NULL AS has_out,
           a."punchMethod", a."workHours"
    FROM "Attendance" a JOIN "Employee" e ON e.id = a."employeeId"
    WHERE e."employeeId" IN ('MARQ007','MARQ008') AND a.date >= '2026-10-01'
    ORDER BY e."employeeId", 2`);
  for (const r of att) console.log(`${r.employeeId} ${new Date(r.day).toISOString().slice(0,10)} ${r.status} in=${r.has_in} out=${r.has_out} method=${r.punchMethod || '-'} hrs=${r.workHours ?? '-'}`);

  console.log('\n── A5. Auto-present + weekend config ──');
  const cfg = await db.query(`
    SELECT "autoPresentManagementEnabled", "shiftStartDefault", "shiftEndDefault" FROM "AttendancePolicyConfig" ORDER BY "createdAt" DESC LIMIT 1`);
  console.log('AttendancePolicyConfig:', JSON.stringify(cfg));
  const wk = await db.query(`SELECT key, value FROM "Setting" WHERE key ILIKE '%weekend%' OR key ILIKE '%working%day%'`);
  for (const w of wk) console.log('WEEKEND SETTING:', w.key, '=', w.value);

  console.log('\n── B1. Policies ──');
  const policies = await db.query(`
    SELECT id, title, version, status, "effectiveDate", "createdAt" FROM "Policy" ORDER BY "createdAt" DESC LIMIT 20`);
  for (const p of policies) console.log(JSON.stringify(p));

  console.log('\n── B2. Acknowledgments ──');
  const acks = await db.query(`
    SELECT pa."policyId", p.title, pa."employeeId", e."employeeId" AS code, pa.action, pa."policyVersion", pa."acknowledgedAt"
    FROM "PolicyAcknowledgment" pa JOIN "Policy" p ON p.id = pa."policyId" JOIN "Employee" e ON e.id = pa."employeeId"
    ORDER BY pa."acknowledgedAt" DESC LIMIT 30`);
  for (const a of acks) console.log(JSON.stringify(a));

  console.log('\n── B3. Pending >= 30 days (computed) ──');
  const pend = await db.query(`
    SELECT p.id, p.title, p.version, p.status,
           COALESCE(p."effectiveDate", p."createdAt") AS assigned_at,
           (SELECT COUNT(*)::int FROM "Employee" e WHERE e.status = 'active') AS active_emps,
           (SELECT COUNT(*)::int FROM "PolicyAcknowledgment" pa WHERE pa."policyId" = p.id AND pa.action = 'accepted') AS accepted_n
    FROM "Policy" p WHERE p.status = 'active'`);
  const now = Date.now();
  for (const p of pend) {
    const days = Math.floor((now - new Date(p.assigned_at).getTime()) / 86400000);
    console.log(`${p.title} v${p.version} assigned ${new Date(p.assigned_at).toISOString().slice(0,10)} -> ${days}d pending | active emps ${p.active_emps}, accepted ${p.accepted_n} => pending-now ${Math.max(0, p.active_emps - p.accepted_n)} | eligible-for-reminder ${days >= 30 ? 'YES' : 'no'}`);
  }

  console.log('\n── B4. Reminder deliveries ──');
  const del = await db.query(`
    SELECT "eventKey", "recipientId", "entityId", "createdAt" FROM "NotificationDelivery"
    WHERE "entityType" = 'policy_ack_reminder' OR "eventKey" LIKE 'core_hr.policy%'
    ORDER BY "createdAt" DESC LIMIT 30`);
  if (!del.length) console.log('(no policy reminder deliveries yet)');
  for (const d of del) console.log(JSON.stringify(d));
  const users = await db.query(`
    SELECT id, email, role FROM "User" WHERE role IN ('hr_admin','admin','tenant_admin','ceo') AND status = 'active' LIMIT 10`);
  console.log('HR/AUDIENCE USERS:');
  for (const u of users) console.log(`  ${u.id} ${u.email} ${u.role}`);

  console.log('\n── B5. Notification events registered ──');
  const evs = await db.query(`
    SELECT "eventKey", "isActive" FROM "NotificationEvent" WHERE "eventKey" LIKE 'core_hr.policy%'`);
  for (const e of evs) console.log(JSON.stringify(e));
}

main().catch((e) => { console.error('DIAG FAILED:', e.message); process.exit(1); });
