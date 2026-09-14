/**
 * Task 37 cleanup — remove E2E test artifacts from the DEMO tenant DB only.
 * Precise ID-targeted deletes inside a transaction; verified counts printed.
 * IDs captured from scripts/verify-india-payroll.mjs runs (2026-09-15).
 */
const { neon } = require('@neondatabase/serverless');

// Demo tenant DB connection (tenant_3boxes-hrms-demo schema on the platform instance)
const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

// Resolve schema for demo tenant
async function main() {
  const admin = neon(PLATFORM);
  // Find the demo tenant DB connection string from the registry
  const reg = await admin.query(`
    SELECT td."connectionString" AS cs, td."databaseName" AS db
    FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
    WHERE t.slug = '3boxes-hrms-demo' AND td."isActive" = true LIMIT 1`);
  const cs = reg[0]?.cs;
  if (!cs) { console.error('No demo tenant connection found'); process.exit(1); }
  const sql = neon(cs);
  console.log(`[cleanup] target DB: ${reg[0].db}`);

  const RUN_ID = 'cmu1imykk002rvqu5c1jjj0dm';
  const FNF_IDS = ['cmu1iq7zd0073vqu5vj9gpkvn', 'cmu1iuzs400abvqu55w7h55ej'];
  const DECL_IDS = ['cmu1io654006jvqu5v372hf3o', 'cmu1isffm008rvqu5v0i9cjqm', 'cmu1ivhcl00bavqu5itiaud9o'];
  const FILING_IDS = ['cmu1infa6005evqu5d9gf2qtg', 'cmu1irz0u0087vqu5ncccit2x', 'cmu1iuss400aavqu5i4hfo8z2'];

  // Pre-checks (SELECT before DELETE)
  const runExists = await sql.query(`SELECT id, "payrollPeriod", "runStatus" FROM "PayrollRun" WHERE id = $1`, [RUN_ID]);
  console.log(`[cleanup] run pre-check: ${JSON.stringify(runExists)}`);
  if (runExists.length && runExists[0].payrollPeriod !== '2026-09') {
    console.error('[cleanup] ABORT — unexpected period on target run');
    process.exit(1);
  }

  const pre = async (label, q) => {
    const r = await sql.query(q);
    console.log(`[cleanup] pre ${label}: ${r[0]?.count ?? 0}`);
  };
  await pre('transaction lines', `SELECT COUNT(*)::int AS count FROM "PayrollTransactionLine" WHERE "payrollRunId" = '${RUN_ID}'`);
  await pre('bank files', `SELECT COUNT(*)::int AS count FROM "BankPaymentFile" WHERE "payrollRunId" = '${RUN_ID}'`);
  await pre('variance anomalies', `SELECT COUNT(*)::int AS count FROM "PayrollAnomaly" WHERE "payrollRunId" = '${RUN_ID}'`);

  const steps = [
    ['notification deliveries (test entities)', `DELETE FROM "NotificationDelivery" WHERE ("entityId" = '${RUN_ID}' AND "entityType" IN ('payroll_run','bank_payment_file')) OR ("entityId" IN (${FNF_IDS.map(i => `'${i}'`).join(',')}) AND "entityType" = 'fnf_calculation') OR ("entityId" IN (${DECL_IDS.map(i => `'${i}'`).join(',')}) AND "entityType" = 'income_tax_declaration')`],
    ['in-app notifications (test entities)', `DELETE FROM "Notification" WHERE "link" LIKE '%/payroll/fnf%' AND "createdAt" > NOW() - INTERVAL '1 day' AND ("title" LIKE '%F&F%' OR "title" LIKE '%fnf%')`],
    ['payroll transaction lines', `DELETE FROM "PayrollTransactionLine" WHERE "payrollRunId" = '${RUN_ID}'`],
    ['bank payment files', `DELETE FROM "BankPaymentFile" WHERE "payrollRunId" = '${RUN_ID}'`],
    ['payroll anomalies (variance)', `DELETE FROM "PayrollAnomaly" WHERE "payrollRunId" = '${RUN_ID}'`],
    ['payroll run', `DELETE FROM "PayrollRun" WHERE id = '${RUN_ID}'`],
    ['F&F test rows', `DELETE FROM "FNFCalculation" WHERE id IN (${FNF_IDS.map(i => `'${i}'`).join(',')})`],
    ['test declarations', `DELETE FROM "IncomeTaxDeclaration" WHERE id IN (${DECL_IDS.map(i => `'${i}'`).join(',')})`],
    ['compliance filings', `DELETE FROM "ComplianceFiling" WHERE id IN (${FILING_IDS.map(i => `'${i}'`).join(',')})`],
  ];

  let failures = 0;
  for (const [label, q] of steps) {
    try {
      const r = await sql.query(q);
      console.log(`[cleanup] OK ${label}: ${r.rowCount ?? 0} row(s)`);
    } catch (e) {
      failures++;
      console.error(`[cleanup] FAIL ${label}: ${e.message}`);
    }
  }

  // Verify zero leftovers
  const post = await sql.query(`
    SELECT
      (SELECT COUNT(*)::int FROM "PayrollTransactionLine" WHERE "payrollRunId" = $1) AS lines,
      (SELECT COUNT(*)::int FROM "PayrollAnomaly" WHERE "payrollRunId" = $1) AS anomalies,
      (SELECT COUNT(*)::int FROM "PayrollRun" WHERE id = $1) AS run,
      (SELECT COUNT(*)::int FROM "FNFCalculation" WHERE id = ANY($2)) AS fnf,
      (SELECT COUNT(*)::int FROM "IncomeTaxDeclaration" WHERE id = ANY($3)) AS decl,
      (SELECT COUNT(*)::int FROM "ComplianceFiling" WHERE id = ANY($4)) AS filings`,
    [RUN_ID, FNF_IDS, DECL_IDS, FILING_IDS]);
  console.log(`[cleanup] post-check: ${JSON.stringify(post[0])}`);

  // Keep: PayrollStatutoryConfig (legitimate config), the auto-seeded ComplianceObligation, India CTC presets were API-deleted (200) already.
  console.log(`[cleanup] DONE — failures: ${failures}`);
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
