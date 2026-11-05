/**
 * Demo verification for the reporting-manager workflow (read-only first stage).
 * Shows every employee's current reporting manager + user role linkage.
 */
const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/tenant_3boxes-hrms-demo?sslmode=require');

async function main() {
  const rows = await sql`
    SELECT e."id", e."firstName", e."lastName", e."employeeId", e."status",
           e."companyId", e."reportingManagerId",
           m."firstName" AS mgr_first, m."lastName" AS mgr_last,
           u."email", u."role"
    FROM "Employee" e
    LEFT JOIN "Employee" m ON m."id" = e."reportingManagerId"
    LEFT JOIN "User" u ON u."id" = e."userId"
    ORDER BY e."firstName" ASC`;
  console.log(`Employees: ${rows.length}`);
  for (const r of rows) {
    const mgr = r.mgr_first ? `${r.mgr_first} ${r.mgr_last}` : '(none)';
    console.log(`  ${String(r.firstName + ' ' + r.lastName).padEnd(24)} ${String(r.employeeId || '').padEnd(8)} role=${String(r.role || '-').padEnd(10)} status=${String(r.status).padEnd(8)} manager=${mgr}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
