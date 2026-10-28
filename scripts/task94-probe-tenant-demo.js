/**
 * Task 94 — READ-ONLY probe of the existing tenant_demo database.
 */
const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_demo?sslmode=require' });
  await c.connect();
  const tables = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  console.log(`=== tenant_demo: ${tables.rows.length} tables ===`);
  console.log(tables.rows.map(r => r.table_name).join(', '));
  if (tables.rows.length > 0) {
    const counts = {};
    for (const t of ['Tenant', 'User', 'CompanyGroup', 'Company', 'Branch', 'Department', 'Designation', 'Employee', 'LeaveType', 'Shift', 'Holiday', 'AttendanceRecord', 'LeaveRequest', 'Notification']) {
      try {
        const r = await c.query(`SELECT count(*)::int AS n FROM "${t.table_name || t}"`);
        counts[t] = r.rows[0].n;
      } catch { counts[t] = 'n/a'; }
    }
    console.log('=== row counts ===', JSON.stringify(counts));
    try {
      const us = await c.query(`SELECT email, role, status FROM "User" ORDER BY "createdAt" LIMIT 20`);
      console.log('=== Users ===');
      for (const u of us.rows) console.log(`- ${u.email} | ${u.role} | ${u.status}`);
    } catch (e) { console.log('user list err:', e.message); }
  }
  await c.end();
}
main().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
