/**
 * Task 78 bonus — additive column sync for the SG platform DB (neondb on
 * ep-icy-star). Adds every schema.prisma scalar column missing from existing
 * tables (nullable or with schema default). Zero data changes, idempotent.
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');

const TENANT_CS_RAW = fs.readFileSync('/tmp/icy_tenant_cs.txt', 'utf8').trim();
const TENANT_CS = TENANT_CS_RAW.replace(/([?&])channel_binding=[^&]*&?/, '$1').replace(/[?&]$/, '');
const PLATFORM_SG = TENANT_CS.replace(/\/tenant_marqaitechgroup\?/, '/neondb?');

function pgType(prismaType) {
  const t = prismaType.replace(/\[\]$/, '').replace(/\?$/, '');
  switch (t) {
    case 'String': return 'TEXT';
    case 'Boolean': return 'BOOLEAN';
    case 'Int': return 'INTEGER';
    case 'BigInt': return 'BIGINT';
    case 'Float': case 'Decimal': return 'DOUBLE PRECISION';
    case 'DateTime': return 'TIMESTAMP(3)';
    case 'Json': return 'JSONB';
    case 'Bytes': return 'BYTEA';
    default: return 'TEXT'; // enums are TEXT-backed in PG
  }
}

function parseAll() {
  const src = fs.readFileSync('prisma/schema.prisma', 'utf8');
  const lines = src.split('\n');
  const modelNames = new Set();
  for (const line of lines) { const m = line.match(/^model\s+(\w+)\s*\{/); if (m) modelNames.add(m[1]); }
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
    const baseType = fm[2].replace(/\[\]/g, '').replace(/\?/g, '');
    if (modelNames.has(baseType) || line.includes('@relation')) continue;
    const mapM = t.match(/@map\("([^"]+)"\)/);
    const defM = t.match(/@default\(([^)]+)\)/);
    cur.columns.push({ col: mapM ? mapM[1] : fm[1], type: fm[2], def: defM ? defM[1] : null });
  }
  return models;
}

function defaultSql(def, pgT) {
  if (!def) return '';
  const d = def.trim();
  if (d === 'now()') return ' DEFAULT CURRENT_TIMESTAMP';
  if (/^(true|false)$/.test(d)) return ` DEFAULT ${d}`;
  if (/^\d+$/.test(d)) return ` DEFAULT ${d}`;
  if (/^".*"$/.test(d)) return ` DEFAULT ${d}`;
  if (/^'.*'$/.test(d)) return ` DEFAULT ${d}`;
  if (d.startsWith('cuid') || d.startsWith('uuid')) return ''; // app supplies
  if (pgT === 'BOOLEAN') return ' DEFAULT false';
  return '';
}

async function main() {
  const models = parseAll();
  const sql = neon(PLATFORM_SG);
  const allCols = await sql.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`);
  const byTable = new Map();
  for (const r of allCols) { if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Set()); byTable.get(r.table_name).add(r.column_name); }
  let applied = 0;
  for (const [mn, model] of Object.entries(models)) {
    const have = byTable.get(model.table);
    if (!have) continue; // missing tables handled by build-time gen-missing-tables
    for (const c of model.columns) {
      if (have.has(c.col)) continue;
      const ddl = `ALTER TABLE "${model.table}" ADD COLUMN IF NOT EXISTS "${c.col}" ${pgType(c.type)}${defaultSql(c.def, pgType(c.type))}`;
      try { await sql.query(ddl); applied++; }
      catch (e) { console.log(`  SKIP ${model.table}.${c.col}: ${e.message.split('\n')[0].slice(0, 90)}`); }
    }
  }
  console.log(`[sg-platform-sync] applied ${applied} additive column(s)`);
  const emp = await sql.query(`SELECT COUNT(*)::int AS n FROM "Employee"`);
  console.log(`[sg-platform-sync] platform Employee rows: ${emp[0].n} — sync complete`);
}

main().catch(e => { console.error(e); process.exit(1); });
