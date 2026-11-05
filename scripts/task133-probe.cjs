/**
 * Task 133 — READ-ONLY probe: Shardha amma MARQ004 (marqaitechgroup tenant).
 * Employee record, company, recent attendance rows, existing shifts/rosters,
 * tenant AttendancePolicyConfig + policy rules.
 */
const { neon } = require('@neondatabase/serverless');
const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) { console.error('FATAL: DATABASE_URL not set'); process.exit(1); }

async function main() {
  const platform = neon(PLATFORM);
  const t = (await platform.query(`SELECT t.id, t.slug, td."connectionString" AS cs FROM "Tenant" t JOIN "TenantDatabase" td ON td."tenantId" = t.id AND td."isActive" = true WHERE t.slug = 'marqaitechgroup'`))[0];
  if (!t) { console.error('tenant not found'); process.exit(1); }
  const db = neon(t.cs);

  console.log('=== employee MARQ004 ===');
  const emp = (await db.query(`SELECT e.id, e."employeeId", e."firstName", e."lastName", e.email, e.status, e."companyId", e."departmentId", e."designationId", e."dateOfJoining", u.id AS "userId", u.email AS "userEmail"
    FROM "Employee" e LEFT JOIN "User" u ON u.id = e."userId" WHERE e."employeeId" = 'MARQ004'`));
  console.log(emp[0] || 'NOT FOUND');
  if (!emp.length) process.exit(1);
  const employeeId = emp[0].id;

  console.log('\n=== company ===');
  console.log((await db.query(`SELECT id, name, code FROM "Company" WHERE id = $1`, [emp[0].companyId]))[0]);

  console.log('\n=== attendance last 30 days (status counts + rows sample) ===');
  const rows = await db.query(`SELECT to_char("date" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, status, "checkIn", "checkOut", "workHours", "breakMinutes", "earlyLogout", "punchMethod"
    FROM "Attendance" WHERE "employeeId" = $1 AND "date" >= (NOW() - INTERVAL '45 days') ORDER BY "date" DESC`, [employeeId]);
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  console.log('rows:', rows.length, JSON.stringify(byStatus));
  for (const r of rows.slice(0, 15)) console.log(' ', r.day, r.status.padEnd(9), 'in:', r.checkIn ? new Date(r.checkIn).toISOString() : '-', 'out:', r.checkOut ? new Date(r.checkOut).toISOString() : '-', 'hrs:', r.workHours, 'brk:', r.breakMinutes, 'early:', r.earlyLogout);

  console.log('\n=== shifts for her company ===');
  console.log(await db.query(`SELECT id, name, code, "startTime", "endTime", "breakDuration", status FROM "Shift" WHERE "companyId" = $1`, [emp[0].companyId]));

  console.log('\n=== rosters + assignments ===');
  console.log(await db.query(`SELECT * FROM "RotationalRoster"`));
  console.log(await db.query(`SELECT * FROM "EmployeeRosterAssignment"`));

  console.log('\n=== AttendancePolicyConfig ===');
  console.log(await db.query(`SELECT id, name, "shiftStartDefault", "shiftEndDefault", "breakStartTime", "breakEndTime", "breakDurationMinutes", "mandatoryBreakEnabled", "attendanceRuleScope", "autoPresentManagementEnabled" FROM "AttendancePolicyConfig" ORDER BY "updatedAt" DESC LIMIT 3`));

  console.log('\n=== AttendancePolicyRule (her scope?) ===');
  console.log(await db.query(`SELECT id, name, "employmentType", "departmentId", "shiftStartDefault", "shiftEndDefault", priority, status FROM "AttendancePolicyRule" WHERE "companyId" = $1`, [emp[0].companyId]));
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
