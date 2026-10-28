/**
 * Task 78 — Verbatim diff: schema.prisma Employee fields vs actual DB columns
 * on every database. Prints both lists so nothing hides behind a parser bug.
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';

function employeeFieldsFromSchema() {
  const src = fs.readFileSync('prisma/schema.prisma', 'utf8');
  const m = src.match(/model Employee \{([\s\S]*?)\n\}/);
  const fields = [];
  for (const line of m[1].split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('@@')) continue;
    const fm = t.match(/^(\w+)\s+([\w\[\]?]+)/);
    if (!fm) continue;
    const mapM = t.match(/@map\("([^"]+)"\)/);
    fields.push({ field: fm[1], type: fm[2], col: mapM ? mapM[1] : fm[1], raw: t.slice(0, 80) });
  }
  return fields;
}

async function main() {
  const fields = employeeFieldsFromSchema();
  console.log(`schema Employee fields: ${fields.length}`);
  const platformSql = neon(PLATFORM);
  const tenants = await platformSql.query(
    `SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id=td."tenantId" WHERE td."isActive"=true`
  );
  const targets = [['platform (neondb)', PLATFORM], ...tenants.map(t => [t.slug, t.cs])];
  for (const [label, cs] of targets) {
    const db = neon(cs);
    const cols = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Employee' ORDER BY ordinal_position`
    );
    const colSet = new Set(cols.map(c => c.column_name));
    console.log(`\n===== ${label}: ${cols.length} columns in DB =====`);
    const missing = [];
    for (const f of fields) {
      if (!colSet.has(f.col)) { missing.push(f); }
    }
    if (missing.length === 0) {
      console.log('  NO missing columns (all schema fields present)');
    } else {
      console.log(`  MISSING ${missing.length}:`);
      for (const f of missing) console.log(`    - field=${f.field} col=${f.col} type=${f.type} | ${f.raw}`);
    }
    // reverse: DB columns not in schema (informational)
    const fieldCols = new Set(fields.map(f => f.col));
    const extra = cols.filter(c => !fieldCols.has(c.column_name));
    if (extra.length) console.log(`  DB-only columns (${extra.length}):`, extra.map(c => c.column_name).join(', '));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
