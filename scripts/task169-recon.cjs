/**
 * Task 169 — pre-E2E recon: tenant connection string + a plain employee
 * account candidate for the my-roster scope test.
 * USAGE: set -a; source .env.production.local; set +a; node scripts/task169-recon.cjs
 */
const { neon } = require('@neondatabase/serverless');

(async () => {
  const platform = neon(process.env.DATABASE_URL);
  const tds = await platform`
    SELECT t.slug, td."connectionString" AS cs
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
    WHERE td."isActive" = true AND t.status = 'active'`;
  for (const td of tds) console.log(`tenant: ${td.slug}`);
  const marqai = tds.find(t => t.slug && t.slug.toLowerCase().includes('marqai')) || tds[0];
  if (!marqai?.cs) { console.log('NO TENANT CS'); process.exit(1); }
  const db = neon(marqai.cs);

  // Plain employee users (no reportees) for the negative scope test
  const users = await db`
    SELECT u.id, u.email, u.role, e.id AS emp_id, e."employeeId" AS emp_code, e.status
    FROM "User" u JOIN "Employee" e ON e."userId" = u.id
    WHERE LOWER(u.role) IN ('employee','finance_admin','it_admin')
      AND e.status = 'active'
    LIMIT 6`;
  console.log('employee users:', JSON.stringify(users, null, 1).slice(0, 1200));

  // Who manages people (for the manager-scope positive test, if we get a login)
  const mgrs = await db`
    SELECT m.id, m.email, COUNT(r.id) AS reportees
    FROM "Employee" m JOIN "Employee" r ON r."reportingManagerId" = m.id
    JOIN "User" u ON u.id = m."userId"
    GROUP BY m.id, m.email HAVING COUNT(r.id) > 0 LIMIT 3`;
  console.log('managers with reportees:', JSON.stringify(mgrs));

  // Projects available for the task-create E2E
  const projects = await db`SELECT id, name FROM "Project" ORDER BY "createdAt" DESC LIMIT 5`;
  console.log('projects:', JSON.stringify(projects));
})();
