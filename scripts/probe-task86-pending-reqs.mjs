// Task 86 probe 2 — inspect pending update requests + step approvers on LIVE & demo
import { neon } from '@neondatabase/serverless';

const PLATFORM_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
const platform = neon(PLATFORM_CS);
const tenants = await platform`SELECT t.slug, td."connectionString" AS cs FROM "Tenant" t JOIN "TenantDatabase" td ON td."tenantId" = t.id`;

for (const t of tenants) {
  const db = neon(t.cs);
  console.log(`\n===== ${t.slug} =====`);
  const reqs = await db`
    SELECT r.id, r."fieldName", r."fieldLabel", r.status, r."currentTier", r."createdAt",
           e."firstName" || ' ' || e."lastName" AS emp_name, e."employeeId" AS emp_code,
           u_requested.id AS requested_by_id, u_requested.role AS requested_by_role
    FROM "EmployeeUpdateRequest" r
    JOIN "Employee" e ON e.id = r."employeeId"
    LEFT JOIN "User" u_requested ON u_requested.id = r."requestedById"
    WHERE r.status = 'pending'
    ORDER BY r."createdAt" DESC LIMIT 5`;
  for (const r of reqs) {
    console.log('pending req:', r.fieldLabel, '| emp:', r.emp_name, r.emp_code, '| requestedBy role:', r.requested_by_role, '| tier:', r.currentTier, '| at:', r.createdAt?.toISOString?.());
    const steps = await db`
      SELECT s.tier, s."approverType", s."approverName", s."approverUserId", s.status,
             u.email AS approver_email, u.role AS approver_role, u.status AS approver_status
      FROM "EmployeeUpdateApprovalStep" s
      LEFT JOIN "User" u ON u.id = s."approverUserId"
      WHERE s."updateRequestId" = ${r.id} ORDER BY s.tier`;
    for (const s of steps) {
      console.log(`   step tier=${s.tier} ${s.approverType} (${s.approverName}) → userId: ${s.approverUserId ? 'SET' : 'NULL'} | user: ${s.approver_email || 'NO MATCH'} (${s.approver_role || '-'}, ${s.approver_status || '-'}) | ${s.status}`);
    }
  }
  // who are the admins that SHOULD receive these?
  const admins = await db`SELECT id, email, role, status FROM "User" WHERE role IN ('admin','hr_admin','tenant_admin','super_admin','company_hr_admin') AND status='active' LIMIT 10`;
  console.log('active admins:', admins.map(a => `${a.email}(${a.role})`).join(', '));
}
console.log('\nPROBE2 DONE');
