/**
 * Task 130 — production data backfill (idempotent, run AFTER CR approval).
 *
 * 1. MarqAI Tech Pvt Ltd company row: letterhead address from the released
 *    payslip format + the MarqAI logo reference. The PDF builder resolves
 *    '/logos/…' to the EMBEDDED mark by company name, so no runtime file
 *    access is needed.
 * 2. INITIAL RELEASE: every existing processed/paid payslip on both active
 *    tenant DBs gets releasedAt stamped (releasedById = 'task130-initial-release').
 *    Rationale: those payslips have been visible to employees since they were
 *    processed — the gate must not silently hide history; future months stay
 *    locked until the payroll manager releases them from the web UI.
 *
 * USAGE: set -a; source /tmp/my-project/.env.production.local; set +a
 *        node scripts/task130-production-run.cjs
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) {
  console.error('[task130-run] FATAL: DATABASE_URL not set');
  process.exit(1);
}

const LETTERHEAD = {
  address: '#399, Level 1, SS Prime, Double Road, AGB Layout, Hessaraghatta Main Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  zipCode: '560090',
  logo: '/logos/marq-ai-tech.png',
};

async function main() {
  const platformSql = neon(PLATFORM);
  const tenants = await platformSql.query(`
    SELECT t.slug, td."connectionString" AS cs
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
    WHERE td."isActive" = true`);
  console.log(`[task130-run] tenants: ${tenants.map((t) => t.slug).join(', ')}`);

  for (const t of tenants) {
    const sql = neon(t.cs);
    console.log(`\n===== ${t.slug} =====`);

    // 1. Company letterhead (only MarqAI-branded rows)
    const marqCompanies = await sql.query(`SELECT id, name FROM "Company" WHERE name ILIKE '%marq%'`);
    for (const c of marqCompanies) {
      const upd = await sql.query(
        `UPDATE "Company" SET
           address = CASE WHEN name ILIKE '%tech%' THEN $2 ELSE address END,
           "zipCode" = CASE WHEN name ILIKE '%tech%' THEN $3 ELSE "zipCode" END,
           state = CASE WHEN name ILIKE '%tech%' THEN $4 ELSE state END,
           city = $5,
           logo = $6,
           "updatedAt" = NOW()
         WHERE id = $1
         RETURNING name, address, city, state, "zipCode", logo`,
        [c.id, LETTERHEAD.address, LETTERHEAD.zipCode, LETTERHEAD.state, LETTERHEAD.city, LETTERHEAD.logo],
      );
      if (upd[0]) {
        console.log(`  company "${upd[0].name}": addr="${upd[0].address}" city=${upd[0].city} zip=${upd[0].zipCode} logo=${upd[0].logo}`);
      }
    }

    // 2. Initial release of existing payslips (only NULL ones — idempotent)
    const rel = await sql.query(
      `UPDATE "Payroll"
         SET "releasedAt" = NOW(), "releasedById" = 'task130-initial-release'
       WHERE status IN ('processed', 'paid') AND "releasedAt" IS NULL
       RETURNING id`,
    );
    const total = await sql.query(
      `SELECT count(*)::int AS n,
              count("releasedAt")::int AS released
         FROM "Payroll" WHERE status IN ('processed', 'paid')`,
    );
    console.log(`  initial release: ${rel.length} payslips stamped; tenant totals now ${total[0].released}/${total[0].n} released`);
  }

  console.log('\n[task130-run] done');
}

main().catch((e) => {
  console.error('[task130-run] FAILED:', e.message);
  process.exit(1);
});
