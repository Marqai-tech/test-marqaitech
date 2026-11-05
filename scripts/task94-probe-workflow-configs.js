/** Task 94 — probe EmployeeWorkflowConfig + LeaveType pattern in CURRENT demo tenant DB */
const { Client } = require('pg');
async function main() {
  const d = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require' });
  await d.connect();
  const cols = await d.query(`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='EmployeeWorkflowConfig' AND table_schema='public' ORDER BY ordinal_position`);
  console.log('=== EmployeeWorkflowConfig columns ===');
  console.log(cols.rows.map(c => `${c.column_name}${c.is_nullable === 'NO' && !c.column_default ? '*' : ''}`).join(', '));
  const wfc = await d.query(`SELECT * FROM "EmployeeWorkflowConfig"`);
  console.log(`=== EmployeeWorkflowConfig rows: ${wfc.rows.length} ===`);
  for (const r of wfc.rows) console.log(JSON.stringify(r).slice(0, 600));
  const lt = await d.query(`SELECT "code", name, "companyId", "defaultDays" FROM "LeaveType" ORDER BY code`);
  console.log('=== LeaveType rows (code uniqueness pattern) ===');
  for (const r of lt.rows) console.log(`- ${r.code} | ${r.name} | co=${r.companyId ? r.companyId.slice(-8) : 'NULL'} | ${r.defaultDays}d`);
  await d.end();
}
main().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
