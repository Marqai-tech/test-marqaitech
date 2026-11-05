/**
 * Task 94 — clone-source probe (READ-ONLY).
 * Gathers: platform TenantDatabase row pattern (demo), platform Tenant columns,
 * demo tenant WorkflowDefinition/TenantConfiguration/CollaborationSettings rows,
 * and column shapes for seed-target tables in the CURRENT demo tenant DB.
 */
const { Client } = require('pg');
const HOST = 'ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech';
const CA = { host: HOST, user: 'neondb_owner', password: 'npg_pxZd8woKe4WB', ssl: { rejectUnauthorized: false } };

async function main() {
  const p = new Client({ ...CA, database: 'neondb' });
  await p.connect();
  const tdb = await p.query(`SELECT td."connectionString", td."directUrl", td."databaseName" FROM "TenantDatabase" td JOIN "Tenant" t ON t.id=td."tenantId" WHERE t.slug='3boxes-hrms-demo'`);
  console.log('=== demo TenantDatabase row (clone pattern) ===');
  console.log(tdb.rows[0]?.connectionString?.replace(/:[^:@]+@/, ':****@'));
  const cols = await p.query(`SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_name='Tenant' AND table_schema='public' ORDER BY ordinal_position`);
  console.log('=== platform Tenant columns (required: no default + not nullable) ===');
  for (const c of cols.rows) {
    const required = c.is_nullable === 'NO' && !c.column_default;
    if (required || ['id','name','slug','domain','plan','status'].includes(c.column_name)) {
      console.log(`${required ? 'REQ ' : '    '}${c.column_name} ${c.data_type} ${c.column_default ? 'def=' + c.column_default : ''}`);
    }
  }
  await p.end();

  const d = new Client({ ...CA, database: 'tenant_3boxes-hrms-demo' });
  await d.connect();
  const wf = await d.query(`SELECT name, module, "companyId", description, "isActive", version, length(steps) AS steps_len FROM "WorkflowDefinition" ORDER BY "createdAt"`);
  console.log('=== demo WorkflowDefinitions ===');
  for (const w of wf.rows) console.log(`- ${w.module} | ${w.name} | companyId=${w.companyId || 'NULL'} | v${w.version} active=${w.isActive} stepsLen=${w.steps_len}`);
  const tc = await d.query(`SELECT * FROM "TenantConfiguration" LIMIT 5`);
  console.log('=== demo TenantConfiguration (keys) ===');
  if (tc.fields) console.log('columns:', tc.fields.map(f => f.name).join(','));
  for (const r of tc.rows) console.log(JSON.stringify(r).slice(0, 300));
  const cs = await d.query(`SELECT * FROM "CollaborationSettings" LIMIT 1`);
  console.log('=== demo CollaborationSettings columns+values (secrets masked) ===');
  if (cs.rows[0]) {
    const row = cs.rows[0];
    for (const [k, v] of Object.entries(row)) {
      const masked = /pass|secret|key/i.test(k) && v ? '****' : v;
      console.log(`${k} = ${masked}`);
    }
  } else console.log('(no rows)');
  // column shapes for seed targets
  for (const table of ['LeaveBalance', 'LeaveRequest', 'Announcement', 'CompanyGroup', 'Company', 'Branch', 'Department', 'Designation', 'Employee', 'User', 'Shift', 'Holiday', 'LeaveType']) {
    const r = await d.query(`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name=$1 AND table_schema='public' ORDER BY ordinal_position`, [table]);
    const req = r.rows.filter(c => c.is_nullable === 'NO' && !c.column_default).map(c => c.column_name);
    console.log(`REQ ${table}: ${req.join(', ')}`);
  }
  await d.end();
}
main().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
