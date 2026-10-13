/** Task 94 — probe tenant_demo Tenant row, companies, workflow/template state */
const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_demo?sslmode=require' });
  await c.connect();
  const t = await c.query(`SELECT id, name, slug, "domain", status FROM "Tenant"`);
  console.log('=== Tenant rows in tenant_demo ===', JSON.stringify(t.rows, null, 1));
  const cg = await c.query(`SELECT id, name FROM "CompanyGroup" LIMIT 15`);
  console.log('=== CompanyGroups ==='); cg.rows.forEach(g => console.log(`- ${g.name} (${g.id})`));
  const co = await c.query(`SELECT id, name, code, "companyGroupId", status FROM "Company" ORDER BY name LIMIT 20`);
  console.log('=== Companies ==='); co.rows.forEach(x => console.log(`- ${x.name} (${x.code}) group=${x.companyGroupId} ${x.status}`));
  // recent activity
  const recent = await c.query(`SELECT max("updatedAt") AS latest FROM "Employee"`);
  console.log('Employee latest updatedAt:', recent.rows[0].latest);
  const wf = await c.query(`SELECT count(*)::int n FROM "WorkflowDefinition"`).catch(() => null);
  console.log('WorkflowDefinition rows:', wf ? wf.rows[0].n : 'n/a');
  const nt = await c.query(`SELECT count(*)::int n FROM "NotificationTemplate"`).catch(e => ({ rows: [{ n: 'missing: ' + e.message }] }));
  console.log('NotificationTemplate rows:', nt.rows[0].n);
  const cfg = await c.query(`SELECT count(*)::int n FROM "TenantConfiguration"`).catch(() => null);
  console.log('TenantConfiguration rows:', cfg ? cfg.rows[0].n : 'n/a');
  const roles = await c.query(`SELECT count(*)::int n FROM "Role"`).catch(() => null);
  console.log('Role rows:', roles ? roles.rows[0].n : 'n/a');
  await c.end();
}
main().catch(e => { console.error('PROBE FAILED:', e.message); process.exit(1); });
