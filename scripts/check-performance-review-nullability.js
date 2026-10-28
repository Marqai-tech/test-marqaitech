/**
 * Task 79 — Verify PerformanceReview column NULLABILITY + DEFAULTS on every DB
 * vs the Prisma model, then (DEMO DB ONLY) attempt the exact INSERT the
 * probation POST route performs, to reproduce the QA-reported P2011.
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');

const US_PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

// model field → { nullable, hasDefault }  (from schema.prisma)
const MODEL = {
  id: { nullable: false, def: false }, employeeId: { nullable: false, def: false },
  reviewCycle: { nullable: false, def: false }, reviewPeriod: { nullable: true, def: false },
  reviewerId: { nullable: true, def: false }, rating: { nullable: false, def: true },
  goalsRating: { nullable: false, def: true }, skillsRating: { nullable: false, def: true },
  behaviorRating: { nullable: false, def: true }, overallRating: { nullable: false, def: true },
  comments: { nullable: true, def: false }, strengths: { nullable: true, def: false },
  improvements: { nullable: true, def: false }, status: { nullable: false, def: true },
  reviewDate: { nullable: true, def: false }, createdAt: { nullable: false, def: true },
  updatedAt: { nullable: false, def: true },
};

async function checkNullability(label, cs) {
  const sql = neon(cs);
  try {
    const cols = await sql.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name='PerformanceReview' AND table_schema='public'
      ORDER BY ordinal_position`);
    if (!cols.length) { console.log(`${label}: table missing`); return; }
    const problems = [];
    for (const c of cols) {
      const m = MODEL[c.column_name];
      if (!m) continue; // extra col, already reported
      const dbNullable = c.is_nullable === 'YES';
      if (dbNullable !== m.nullable) {
        problems.push(`${c.column_name}: DB nullable=${dbNullable} model nullable=${m.nullable}${!dbNullable ? '  ← NOT NULL in DB but model thinks nullable' : ''}`);
      }
    }
    console.log(`${label}: ${problems.length ? problems.join(' | ') : 'nullability OK'}`);
    return problems.length === 0;
  } catch (e) { console.log(`${label}: ERR ${e.message.split('\n')[0].slice(0, 100)}`); return false; }
}

async function main() {
  const targets = [['US platform', US_PLATFORM]];
  const platformSql = neon(US_PLATFORM);
  try {
    const tenants = await platformSql.query(`
      SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
      JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
    for (const t of tenants) targets.push([`US ${t.slug}`, t.cs]);
  } catch (e) { console.error('US registry read failed'); }
  try {
    const raw = fs.readFileSync('/tmp/icy_tenant_cs.txt', 'utf8').trim();
    const strip = (u) => u.replace(/([?&])channel_binding=[^&]*&?/, '$1').replace(/[?&]$/, '');
    targets.push(['SG marqaitechgroup (LIVE)', strip(raw)]);
  } catch { /* skip */ }

  for (const [label, cs] of targets) await checkNullability(label, cs);

  // ── Live INSERT reproduction on the DEMO tenant DB only ──
  const demo = targets.find(([l]) => l.includes('3boxes-hrms-demo'));
  if (demo) {
    const sql = neon(demo[1]);
    console.log(`\n[repro] attempting route-shaped INSERT on ${demo[0]}…`);
    try {
      const emp = await sql.query(`SELECT id FROM "Employee" LIMIT 1`);
      if (!emp.length) { console.log('[repro] no employees in demo DB'); return; }
      const r = await sql.query(`
        INSERT INTO "PerformanceReview"
          ("id","employeeId","reviewCycle","reviewPeriod","reviewerId","rating","goalsRating","skillsRating","behaviorRating","overallRating","comments","strengths","improvements","status","reviewDate","createdAt","updatedAt")
        VALUES
          ($1,$2,'Probation','Probation (6 months)',NULL,0,0,0,0,0,$3,NULL,NULL,'pending',NOW(),NOW(),NOW())
        RETURNING "id"`, [`repro_${Date.now()}`, emp[0].id, '{"test":true}']);
      console.log(`[repro] INSERT OK → ${r[0].id} (null reviewerId accepted) — cleaning up`);
      await sql.query(`DELETE FROM "PerformanceReview" WHERE "id" = $1`, [r[0].id]);
      console.log('[repro] cleaned up. DB layer does NOT reproduce P2011 with NULL reviewerId.');
    } catch (e) {
      console.log(`[repro] INSERT FAILED: ${e.message.split('\n')[0]}`);
      console.log(`[repro] detail: ${(e.detail || e.message).slice(0, 300)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
