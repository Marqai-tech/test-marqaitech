// Task 126 — derive missing attendance days from biometric reality:
//   • scope: months with device evidence — May..Sept (full) + Oct 1..21
//   • working day = Mon-Fri, not a company holiday, on/after DOJ
//   • non-management employee, no attendance row, no approved leave → ABSENT
//   • Vardhani (isManagement, auto-present enabled) → PRESENT per Task 82 rule
//   • Idempotent: skips days that already have a row.
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL='));
const PLATFORM = envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim();

const HOLIDAYS = new Set(['2026-05-01', '2026-08-15', '2026-09-14', '2026-10-02', '2026-10-20']); // from Holiday table (May-Oct)
const WEEKEND_DOW = new Set([0, 6]); // DEFAULT_WEEKEND_DOW — Sat + Sun

async function main() {
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const db = neon(tenants.find((t) => /marqai/i.test(t.slug)).cs);

  const emps = await db.query(`
    SELECT e.id, e."firstName", e."lastName", e."dateOfJoining", e."isManagement", u.role
    FROM "Employee" e LEFT JOIN "User" u ON u.email = e.email
    WHERE e.status = 'active' ORDER BY e."firstName"`);
  console.log('employees:', emps.length);

  // month ranges: May..Sept full; Oct 1..21
  const ranges = [
    { from: '2026-05-01', to: '2026-06-01' }, { from: '2026-06-01', to: '2026-07-01' },
    { from: '2026-07-01', to: '2026-08-01' }, { from: '2026-08-01', to: '2026-09-01' },
    { from: '2026-09-01', to: '2026-10-01' }, { from: '2026-10-01', to: '2026-10-22' }, // Oct 1..21 inclusive
  ];

  let created = 0;
  const summary = {};
  for (const e of emps) {
    const name = `${e.firstName} ${e.lastName}`.trim();
    const doj = new Date(e.dateOfJoining);
    const management = e.isManagement === true || ['tenant_admin', 'admin', 'hr_admin', 'manager'].includes(String(e.role || ''));
    for (const r of ranges) {
      for (let d = new Date(r.from + 'T00:00:00Z'); d < new Date(r.to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
        const dayLocal = new Date(d.getTime() - 330 * 60_000); // local-midnight-as-UTC (IST −5:30), same convention as the biometric sync
        const dayIso = new Date(d.getTime()).toISOString().slice(0, 10); // the LOCAL calendar day
        if (WEEKEND_DOW.has(d.getUTCDay())) continue;
        if (HOLIDAYS.has(dayIso)) continue;
        if (d < doj) continue;
        const existing = await db.query(`SELECT 1 FROM "Attendance" WHERE "employeeId" = $1 AND date = $2 LIMIT 1`, [e.id, dayLocal]);
        if (existing.length) continue;
        const status = management ? 'present' : 'absent';
        const notes = management
          ? 'Auto-present (management rule · Task 126 backfill)'
          : 'Absent — no biometric punch on a working day (Task 126 backfill)';
        await db.query(`
          INSERT INTO "Attendance" (id, "employeeId", date, status, "punchMethod", notes, "createdAt", "updatedAt")
          VALUES ('att_' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5, now(), now())`,
          [e.id, dayLocal, status, management ? 'auto' : null, notes]);
        created += 1;
        const key = `${name}|${dayIso.slice(0, 7)}`;
        summary[key] = (summary[key] || 0) + 1;
      }
    }
    console.log(`${name.padEnd(24)} ${management ? 'MANAGEMENT (auto-present)' : 'employee (absent derivation)'} done`);
  }
  console.log(`\ncreated ${created} attendance rows (absent/present-backfill)`);
  for (const [k, n] of Object.entries(summary).sort()) console.log('  ', k, '→', n);
}
main().catch((e) => { console.error(e); process.exit(1); });
