/**
 * Task 133 — dump MARQ004 (Shardh amma) full attendance history.
 */
const { neon } = require('@neondatabase/serverless');
const PLATFORM = process.env.DATABASE_URL;

async function main() {
  const p = neon(PLATFORM);
  const t = (await p.query(`SELECT td."connectionString" AS cs FROM "Tenant" t JOIN "TenantDatabase" td ON td."tenantId"=t.id WHERE t.slug='marqaitechgroup'`))[0];
  const db = neon(t.cs);
  const empId = 'cmvknpxnl000108jvmgrm6xug';
  const all = await db.query(
    `SELECT "date", status, "checkIn", "checkOut", "workHours", "earlyLogout", "punchMethod"
     FROM "Attendance" WHERE "employeeId" = $1 ORDER BY "date"`, [empId]);
  const byStatus = {};
  for (const r of all) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  console.log('TOTAL rows:', all.length, JSON.stringify(byStatus));
  for (const r of all) {
    const day = new Date(r.date).toISOString().slice(0, 10);
    console.log(day, String(r.status).padEnd(9),
      'in:', r.checkIn ? new Date(r.checkIn).toISOString() : '-',
      'out:', r.checkOut ? new Date(r.checkOut).toISOString() : '-',
      'hrs:', r.workHours, 'early:', r.earlyLogout, r.punchMethod);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
