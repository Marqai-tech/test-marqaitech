/** Task 78 — list LIVE tenant users (login candidates) + check PolicyAcknowledgment.action column need */
const { neon } = require('@neondatabase/serverless');
const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const sql = neon(PLATFORM);
  const tenants = await sql.query(`
    SELECT t.id, t.slug, t.name, t.status, td."connectionString" AS cs, td."databaseName" AS db
    FROM "Tenant" t JOIN "TenantDatabase" td ON td."tenantId" = t.id
    WHERE td."isActive" = true`);
  for (const t of tenants) {
    console.log(`\n=== tenant ${t.slug} (${t.db}) status=${t.status} ===`);
    const db = neon(t.cs);
    try {
      const users = await db.query(`SELECT email, "employeeId", role, status, "isActive" FROM "User" ORDER BY role LIMIT 12`);
      for (const u of users) console.log(`  ${u.email} | role=${u.role} | status=${u.status} | active=${u.isActive}`);
      const emps = await db.query(`SELECT status, COUNT(*)::int AS n FROM "Employee" GROUP BY status`);
      console.log('  Employee status counts:', JSON.stringify(emps));
    } catch (e) { console.log('  ERR', e.message.split('\n')[0]); }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
