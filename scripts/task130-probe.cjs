/**
 * Task 130 — READ-ONLY production probe.
 * Inspects the MarqAI tenant: company rows (name/address/city/logo),
 * payroll rows (statuses, sample shape) and employee identity fields
 * used by the new payslip PDF (city, branch, department, designation).
 *
 * USAGE: set -a; source /tmp/my-project/.env.production.local; set +a
 *        node scripts/task130-probe.cjs
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task130-probe] FATAL: DATABASE_URL not set');
  process.exit(1);
}

function brief(v, n = 60) {
  if (v === null || v === undefined) return '∅';
  const s = String(v);
  return s.length > n ? s.slice(0, n) + `…(${s.length})` : s;
}

async function main() {
  const platformSql = neon(PLATFORM);
  const tenants = await platformSql.query(`
    SELECT t.slug, td."connectionString" AS cs, td."databaseName" AS db
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
    WHERE td."isActive" = true`);
  console.log(`[probe] active tenant DBs: ${tenants.map(t => t.slug).join(', ')}`);

  for (const t of tenants) {
    const sql = neon(t.cs);
    console.log(`\n================ ${t.slug} (${t.db}) ================`);
    // Company rows
    const companies = await sql.query(`
      SELECT c.id, c.name, c.address, c.city, c.state, c."zipCode", c.logo,
             (SELECT count(*) FROM "Employee" e WHERE e."companyId" = c.id) AS employees
      FROM "Company" c ORDER BY c.name`);
    for (const c of companies) {
      console.log(`  Company: ${brief(c.name, 40)} | addr=${brief(c.address, 70)} | city=${brief(c.city)} state=${brief(c.state)} zip=${brief(c.zipCode)} | logo=${brief(c.logo, 50)} | emps=${c.employees}`);
    }
    // Payroll rows
    const pay = await sql.query(`
      SELECT count(*) AS n,
             array_agg(DISTINCT status) AS statuses,
             min(year || '-' || lpad(month::text, 2, '0')) AS oldest,
             max(year || '-' || lpad(month::text, 2, '0')) AS newest
      FROM "Payroll"`);
    console.log(`  Payroll rows: ${pay[0].n} statuses=${JSON.stringify(pay[0].statuses)} range=${pay[0].oldest}..${pay[0].newest}`);
    // Does releasedAt exist?
    const cols = await sql.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Payroll' AND column_name IN ('releasedAt', 'releasedById')`);
    console.log(`  Payroll release cols present: ${cols.map(r => r.column_name).join(', ') || 'NONE'}`);
    // Sample employee with payroll ( vardhani / first active employee)
    const emp = await sql.query(`
      SELECT e.id, e."employeeId", e."firstName", e."lastName", e.city, e."branchId", e.status,
             d.title AS designation, dep.name AS department, e."dateOfJoining",
             b.name AS branchName, c2.name AS companyName
      FROM "Employee" e
      LEFT JOIN "Designation" d ON d.id = e."designationId"
      LEFT JOIN "Department" dep ON dep.id = e."departmentId"
      LEFT JOIN "Branch" b ON b.id = e."branchId"
      LEFT JOIN "Company" c2 ON c2.id = e."companyId"
      WHERE e."firstName" ILIKE 'vardhani' LIMIT 1`);
    if (emp[0]) {
      console.log(`  Sample emp: ${JSON.stringify(emp[0])}`);
    } else {
      const any = await sql.query(`
        SELECT e.id, e."employeeId", e."firstName", e.city, e."branchId", e.status, b.name AS branchName, c2.name AS companyName
        FROM "Employee" e LEFT JOIN "Branch" b ON b.id = e."branchId" LEFT JOIN "Company" c2 ON c2.id = e."companyId"
        LIMIT 2`);
      console.log(`  (no vardhani) sample: ${JSON.stringify(any)}`);
    }
    // Latest payroll row for the sample shape
    const prow = await sql.query(`
      SELECT p.month, p.year, p.status, p."grossSalary", p."netSalary", p."totalDays", p."paidDays", p."lopDays",
             p."professionalTax", p."lopDeduction", e."firstName"
      FROM "Payroll" p JOIN "Employee" e ON e.id = p."employeeId"
      ORDER BY p.year DESC, p.month DESC, e."firstName" LIMIT 4`);
    for (const r of prow) console.log(`  Payslip: ${r.year}-${String(r.month).padStart(2, '0')} ${r.firstName} status=${r.status} gross=${r.grossSalary} net=${r.netSalary} days T=${r.totalDays}/P=${r.paidDays}/L=${r.lopDays} PT=${r.professionalTax} lopDed=${r.lopDeduction}`);
  }
  console.log('\n[probe] done (read-only)');
}

main().catch(e => { console.error('[probe] FAILED:', e.message); process.exit(1); });
