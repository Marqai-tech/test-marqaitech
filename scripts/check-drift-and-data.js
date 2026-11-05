/**
 * Task 78 — Diagnose "no data visible on LIVE tenant":
 * 1) Row counts of key tables per DB (is the data there at all?)
 * 2) Full schema drift check: every model/field in prisma/schema.prisma
 *    vs every DB (platform + tenants) -> missing tables / missing columns.
 * Read-only diagnostics, no DDL.
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');

const PLATFORM = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
const SCHEMA_PATH = 'prisma/schema.prisma';

// ---- Parse prisma schema: model -> { table, columns: [{name, dbCol, type}] }
function parseSchema() {
  const src = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const lines = src.split('\n');
  // pass 1: collect model names (relation detection) and enum names
  const modelNames = new Set(), enumNames = new Set();
  for (const line of lines) {
    let m = line.match(/^model\s+(\w+)\s*\{/);
    if (m) modelNames.add(m[1]);
    m = line.match(/^enum\s+(\w+)\s*\{/);
    if (m) enumNames.add(m[1]);
  }
  const models = {};
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^model\s+(\w+)\s*\{/);
    if (m) { cur = { table: m[1], columns: [] }; models[m[1]] = cur; continue; }
    if (cur && /^\s*\}\s*$/.test(line)) { cur = null; continue; }
    if (!cur) continue;
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('@@')) continue;
    const fm = t.match(/^(\w+)\s+([\w\[\]?]+)/);
    if (!fm) continue;
    const [, field, type] = fm;
    // relation detection: base type (strip [], ?) that refers to a model = relation, no column
    const baseType = type.replace(/\[\]/g, '').replace(/\?/g, '');
    if (modelNames.has(baseType)) continue;
    if (line.includes('@relation')) continue; // belt & braces
    const mapM = t.match(/@map\("([^"]+)"\)/);
    cur.columns.push({ name: field, dbCol: mapM ? mapM[1] : field, type, raw: t });
  }
  return models;
}

async function diagnose(label, cs, models) {
  const sql = neon(cs);
  console.log(`\n========== ${label} ==========`);
  // 1) row counts of key tables
  const keyTables = ['Employee', 'User', 'Attendance', 'Department', 'Designation', 'Branch', 'LeaveRequest', 'Tenant'];
  for (const tb of keyTables) {
    try {
      const r = await sql.query(`SELECT COUNT(*)::int AS n FROM "${tb}"`);
      console.log(`[data] ${tb}: ${r[0].n} rows`);
    } catch (e) {
      console.log(`[data] ${tb}: ERROR — ${e.message.split('\n')[0].slice(0, 100)}`);
    }
  }
  // 2) schema drift — fetch ALL columns in ONE query, compare in memory
  let missingTables = 0, missingCols = 0;
  const allCols = await sql.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`
  );
  const byTable = new Map();
  for (const r of allCols) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Set());
    byTable.get(r.table_name).add(r.column_name.toLowerCase());
  }
  for (const [modelName, model] of Object.entries(models)) {
    const have = byTable.get(model.table);
    if (!have) {
      console.log(`[drift] TABLE MISSING: ${model.table} (model ${modelName})`);
      missingTables++;
      continue;
    }
    const miss = model.columns.filter(c => !have.has(c.dbCol.toLowerCase()));
    if (miss.length) {
      console.log(`[drift] TABLE ${model.table}: missing ${miss.length} column(s): ${miss.map(c => c.dbCol).join(', ')}`);
      missingCols += miss.length;
    }
  }
  console.log(`[drift] SUMMARY ${label}: missingTables=${missingTables}, missingColumns=${missingCols}`);
  return { missingTables, missingCols };
}

async function main() {
  const models = parseSchema();
  console.log(`Parsed ${Object.keys(models).length} models from schema.prisma`);
  const targets = [['platform (neondb)', PLATFORM]];
  const platformSql = neon(PLATFORM);
  try {
    const tenants = await platformSql.query(`
      SELECT t.slug, td."connectionString" AS cs, td."databaseName" AS db
      FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId"
      WHERE td."isActive" = true`);
    for (const t of tenants) targets.push([`${t.slug} (${t.db})`, t.cs]);
  } catch (e) { console.error('Registry read failed:', e.message); }
  for (const [label, cs] of targets) {
    await diagnose(label, cs, models);
  }
  console.log('\n[done]');
}

main().catch(e => { console.error(e); process.exit(1); });
