/**
 * Task 79 — Introspect the "PerformanceReview" table on EVERY database the
 * app can reach (US platform + US registry tenants + SG platform + SG tenant).
 *
 * WHY: QA reports P2011 (null constraint violation) on prisma.performanceReview.create()
 * when saving a probation review. The current Prisma model has NO cycleId column,
 * but legacy DBs may still carry a NOT NULL "cycleId" column (from the old
 * schema where reviews belonged to a cycle) → Prisma INSERT omits it → P2011.
 *
 * Read-only script: lists actual columns, nullability, defaults + row counts,
 * and diffs them against the current Prisma model.
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');

const US_PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

// Columns expected by the CURRENT Prisma model (schema.prisma PerformanceReview)
const MODEL_COLS = {
  id: 'NOT NULL', employeeId: 'NOT NULL', reviewCycle: 'NOT NULL', reviewPeriod: 'NULL',
  reviewerId: 'NULL', rating: 'DEF', goalsRating: 'DEF', skillsRating: 'DEF',
  behaviorRating: 'DEF', overallRating: 'DEF', comments: 'NULL', strengths: 'NULL',
  improvements: 'NULL', status: 'DEF', reviewDate: 'NULL', createdAt: 'DEF', updatedAt: 'DEF',
};

async function inspect(label, cs) {
  const sql = neon(cs);
  console.log(`\n========== ${label} ==========`);
  try {
    const exists = await sql.query(`SELECT to_regclass('public."PerformanceReview"') AS t`);
    if (!exists[0].t) { console.log('  TABLE MISSING (would be auto-created by inline sync on first GET/POST)'); return; }
    const cols = await sql.query(`
      SELECT column_name, is_nullable, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'PerformanceReview' AND table_schema = 'public'
      ORDER BY ordinal_position`);
    const actual = new Map(cols.map(c => [c.column_name, c]));
    // Extra columns NOT in the model → potential NOT NULL traps
    const extra = cols.filter(c => !MODEL_COLS[c.column_name]);
    if (extra.length) {
      for (const c of extra) {
        const trap = c.is_nullable === 'NO' && !c.column_default;
        console.log(`  EXTRA COL: ${c.column_name} ${c.data_type} nullable=${c.is_nullable} default=${c.column_default}${trap ? '  ← P2011 TRAP (NOT NULL, no default, unknown to Prisma)' : ''}`);
      }
    }
    // Model columns missing from the DB → P2022 traps
    const missing = Object.keys(MODEL_COLS).filter(k => !actual.has(k));
    if (missing.length) console.log(`  MISSING COLS: ${missing.join(', ')}  ← P2022 TRAP`);
    if (!extra.length && !missing.length) console.log('  schema matches current model (no traps)');
    try {
      const n = await sql.query(`SELECT COUNT(*)::int AS n FROM "PerformanceReview"`);
      const byCycle = await sql.query(`SELECT "reviewCycle", COUNT(*)::int AS n FROM "PerformanceReview" GROUP BY "reviewCycle"`);
      console.log(`  rows: ${n[0].n} | by cycle: ${byCycle.map(r => `${r.reviewCycle}=${r.n}`).join(', ') || '—'}`);
      if (n[0].n > 0 && extra.some(c => c.column_name === 'cycleId')) {
        const nullCycle = await sql.query(`SELECT COUNT(*)::int AS n FROM "PerformanceReview" WHERE "cycleId" IS NULL`);
        console.log(`  rows with cycleId NULL: ${nullCycle[0].n}`);
      }
    } catch (e) { console.log(`  row-count err: ${e.message.split('\n')[0].slice(0, 100)}`); }
  } catch (e) {
    console.error(`  CONNECT/QUERY FAILED: ${e.message.split('\n')[0].slice(0, 160)}`);
  }
}

async function main() {
  const targets = [['US platform (neondb)', US_PLATFORM]];
  const platformSql = neon(US_PLATFORM);
  try {
    const tenants = await platformSql.query(`
      SELECT t.slug, td."connectionString" AS cs, td."databaseName" AS db
      FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
      WHERE td."isActive" = true`);
    for (const t of tenants) targets.push([`US ${t.slug} (${t.db})`, t.cs]);
  } catch (e) { console.error('[inspect] US registry read failed:', e.message.split('\n')[0]); }

  try {
    const raw = fs.readFileSync('/tmp/icy_tenant_cs.txt', 'utf8').trim();
    const strip = (u) => u.replace(/([?&])channel_binding=[^&]*&?/, '$1').replace(/[?&]$/, '');
    const sgTenant = strip(raw);
    targets.push(['SG tenant_marqaitechgroup (LIVE)', sgTenant]);
    targets.push(['SG platform (neondb)', sgTenant.replace(/\/tenant_marqaitechgroup\?/, '/neondb?')]);
  } catch { console.log('[inspect] /tmp/icy_tenant_cs.txt unavailable — skipping SG'); }

  for (const [label, cs] of targets) await inspect(label, cs);
  console.log('\n[inspect] done');
}

main().catch((e) => { console.error(e); process.exit(1); });
