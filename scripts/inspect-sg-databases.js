/**
 * Task 78 — Inspect the REAL database the LIVE Vercel app uses:
 * ep-icy-star (ap-southeast-1) tenant_marqaitechgroup + its platform neondb.
 * Data counts + full schema drift (all models, relation-aware).
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');

const TENANT_CS_RAW = fs.readFileSync('/tmp/icy_tenant_cs.txt', 'utf8').trim();
// strip channel_binding for the neon HTTP driver (same fix as app code)
const TENANT_CS = TENANT_CS_RAW.replace(/([?&])channel_binding=[^&]*&?/, '$1').replace(/[?&]$/, '');
const PLATFORM_SG = TENANT_CS.replace(/\/tenant_marqaitechgroup\?/, '/neondb?');

function parseSchema() {
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
    cur.columns.push({ field: fm[1], col: mapM ? mapM[1] : fm[1], type: fm[2], raw: t });
  }
  return models;
}

async function main() {
  const models = parseSchema();
  console.log(`parsed ${Object.keys(models).length} models`);
  for (const [label, cs] of [['SG tenant_marqaitechgroup', TENANT_CS], ['SG platform neondb', PLATFORM_SG]]) {
    console.log(`\n========== ${label} ==========`);
    const sql = neon(cs);
    try {
      for (const tb of ['Employee', 'User', 'Attendance', 'Department', 'Designation', 'Branch', 'LeaveRequest']) {
        try { const r = await sql.query(`SELECT COUNT(*)::int AS n FROM "${tb}"`); console.log(`[data] ${tb}: ${r[0].n} rows`); }
        catch (e) { console.log(`[data] ${tb}: ERR ${e.message.split('\n')[0].slice(0, 80)}`); }
      }
      const allCols = await sql.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`);
      const byTable = new Map();
      for (const r of allCols) { if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Set()); byTable.get(r.table_name).add(r.column_name); }
      let missT = 0, missC = 0;
      const detail = [];
      for (const [mn, model] of Object.entries(models)) {
        const have = byTable.get(model.table);
        if (!have) { missT++; detail.push(`TABLE ${model.table} MISSING`); continue; }
        const miss = model.columns.filter(c => !have.has(c.col));
        if (miss.length) { missC += miss.length; detail.push(`${model.table}: ${miss.map(c => c.col).join(', ')}`); }
      }
      console.log(`[drift] missingTables=${missT} missingColumns=${missC}`);
      for (const d of detail.slice(0, 40)) console.log('  -', d);
      if (detail.length > 40) console.log(`  ... +${detail.length - 40} more`);
    } catch (e) {
      console.error('CONNECT FAILED:', e.message.split('\n')[0].slice(0, 200));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
