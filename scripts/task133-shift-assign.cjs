/**
 * Task 133 — production data fix: assign Shardh amma (MARQ004, MarqAI Tech
 * Pvt Ltd) to a fixed 11:00–17:00 shift, ONLY for her.
 *
 * 1. Shift "11 AM - 5 PM" (11:00–17:00, 60m break, 15m grace) for her company
 *    (reuses an existing row with the same name when present).
 * 2. RotationalRoster "Fixed 11 AM - 5 PM — Shardh amma" pattern=[shiftId],
 *    rotationUnit='day' (single-element pattern = fixed assignment).
 * 3. EmployeeRosterAssignment for MARQ004 only (replaces any previous).
 * 4. Re-evaluates her existing Attendance rows under the new shift window:
 *    late cutoff 11:15 (start + grace), finalize at 17:00, full-day = 5h net.
 *
 * Idempotent. USAGE: set -a; source /tmp/my-project/.env.production.local; set +a
 *                    node scripts/task133-shift-assign.cjs
 */
const { neon } = require('@neondatabase/serverless');
const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) { console.error('FATAL: DATABASE_URL not set'); process.exit(1); }

const EMP_CODE = 'MARQ004';
const SHIFT_NAME = '11 AM - 5 PM';
const SHIFT_START = '11:00';
const SHIFT_END = '17:00';

function hmToMin(hm) { const [h, m] = hm.split(':').map(Number); return h * 60 + m; }

async function main() {
  const platform = neon(PLATFORM);
  const t = (await platform.query(`SELECT t.id, t.slug, td."connectionString" AS cs FROM "Tenant" t JOIN "TenantDatabase" td ON td."tenantId" = t.id AND td."isActive" = true WHERE t.slug = 'marqaitechgroup'`))[0];
  if (!t) throw new Error('tenant not found');
  const db = neon(t.cs);
  console.log(`tenant: ${t.slug}`);

  const emp = (await db.query(`SELECT id, "employeeId", "firstName", "lastName", "companyId", status FROM "Employee" WHERE "employeeId" = $1`, [EMP_CODE]))[0];
  if (!emp) throw new Error(`${EMP_CODE} not found`);
  console.log(`employee: ${emp.firstName} ${emp.lastName} (${emp.employeeId}) company=${emp.companyId} status=${emp.status}`);

  // ── 1. the shift ──
  let shift = (await db.query(`SELECT id, name, "startTime", "endTime" FROM "Shift" WHERE "companyId" = $1 AND name = $2`, [emp.companyId, SHIFT_NAME]))[0];
  if (!shift) {
    shift = (await db.query(
      `INSERT INTO "Shift" ("id", "name", "code", "type", "startTime", "endTime", "crossMidnight", "breakDuration", "graceTime", "status", "companyId", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'S11-17', 'fixed', $2, $3, false, 60, 15, 'active', $4, NOW(), NOW())
       RETURNING id, name, "startTime", "endTime"`,
      [SHIFT_NAME, SHIFT_START, SHIFT_END, emp.companyId]))[0];
    console.log(`shift CREATED: ${shift.name} ${shift.startTime}-${shift.endTime} id=${shift.id}`);
  } else {
    console.log(`shift EXISTS: ${shift.name} ${shift.startTime}-${shift.endTime} id=${shift.id}`);
  }

  // ── 2. the roster (single-shift pattern = fixed assignment) ──
  const rosterName = `Fixed ${SHIFT_NAME} — ${emp.firstName} ${emp.lastName}`.slice(0, 120);
  let roster = (await db.query(`SELECT id FROM "RotationalRoster" WHERE name = $1`, [rosterName]))[0];
  if (!roster) {
    roster = (await db.query(
      `INSERT INTO "RotationalRoster" ("id", "name", "description", "pattern", "rotationUnit", "startDate", "isActive", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3::jsonb, 'day', NOW(), true, NOW(), NOW())
       RETURNING id`,
      [rosterName, `Fixed ${SHIFT_START}–${SHIFT_END} shift — only for ${emp.employeeId}`, JSON.stringify([shift.id])]))[0];
    console.log(`roster CREATED: ${rosterName} id=${roster.id}`);
  } else {
    await db.query(`UPDATE "RotationalRoster" SET pattern = $2::jsonb, "rotationUnit" = 'day', "isActive" = true, "updatedAt" = NOW() WHERE id = $1`, [roster.id, JSON.stringify([shift.id])]);
    console.log(`roster EXISTS (pattern normalized): id=${roster.id}`);
  }

  // ── 3. the assignment — ONLY this employee ──
  await db.query(`DELETE FROM "EmployeeRosterAssignment" WHERE "employeeId" = $1`, [emp.id]);
  await db.query(
    `INSERT INTO "EmployeeRosterAssignment" ("id", "employeeId", "rosterId", "currentOffset", "startDate", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 0, NOW(), NOW(), NOW())
     ON CONFLICT ("employeeId", "rosterId") DO UPDATE SET "endDate" = NULL, "updatedAt" = NOW()`,
    [emp.id, roster.id]);
  console.log(`assignment CREATED for ${emp.employeeId} (only her)`);

  // ── 4. re-evaluate her existing attendance rows under the new window ──
  const startMin = hmToMin(SHIFT_START), endMin = hmToMin(SHIFT_END), grace = 15, brk = 60;
  const lateCutoff = startMin + grace;
  const fullDayHours = Math.max(0, (endMin - startMin - brk) / 60 - 0.25);
  const istMin = (d) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    return Number(parts.find(p => p.type === 'hour')?.value || 0) * 60 + Number(parts.find(p => p.type === 'minute')?.value || 0);
  };
  const rows = await db.query(`SELECT id, "date", status, "checkIn", "checkOut", "workHours", "earlyLogout" FROM "Attendance" WHERE "employeeId" = $1`, [emp.id]);
  let fixed = 0;
  for (const r of rows) {
    if (!r.checkIn) continue; // absent/leave rows are not punch-derived
    const inMin = istMin(new Date(r.checkIn));
    const outMin = r.checkOut ? istMin(new Date(r.checkOut)) : null;
    const canFinalize = outMin != null && outMin >= endMin;
    const grossH = canFinalize && r.checkOut > r.checkIn ? Math.max(0, (new Date(r.checkOut) - new Date(r.checkIn)) / 3600000 - brk / 60) : null;
    const isLate = inMin > lateCutoff;
    const newStatus = (canFinalize && grossH !== null && grossH < fullDayHours) ? 'half_day' : (isLate ? 'late' : 'present');
    const newHours = canFinalize ? Number(grossH.toFixed(2)) : (r.checkOut ? Number(grossH.toFixed(2)) : null);
    if (newStatus !== r.status || (canFinalize && r.workHours !== newHours)) {
      await db.query(`UPDATE "Attendance" SET status = $2, "workHours" = $3, "updatedAt" = NOW() WHERE id = $1`, [r.id, newStatus, canFinalize ? newHours : (r.checkOut ? newHours : r.workHours)]);
      console.log(`  row ${new Date(r.date).toISOString().slice(0, 10)}: ${r.status} → ${newStatus} (in=${inMin}m, out=${outMin}m, hrs=${newHours})`);
      fixed++;
    } else {
      console.log(`  row ${new Date(r.date).toISOString().slice(0, 10)}: unchanged (${r.status})`);
    }
  }
  console.log(`attendance rows re-evaluated: ${rows.length}, updated: ${fixed}`);
  console.log('DONE');
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
