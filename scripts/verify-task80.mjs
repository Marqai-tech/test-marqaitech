// Task 80 post-deploy verification — Inactive filter semantics + designation filter.
const BASES = [
  ['LIVE', 'https://marqaitechgroup.3boxeshrms.com', 'hr@gmail.com'],
  ['DEMO', 'https://nexus-hrms-mu.vercel.app', 'admin@3boxeshrms.com'],
];
const PASS = 'MarqAI@2026';
let passN = 0, failN = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passN++; console.log(`  PASS ${name}${detail ? ' — ' + detail : ''}`); }
  else { failN++; console.log(`  FAIL ${name} — ${detail}`); }
};

for (const [label, base, email] of BASES) {
  console.log(`\n===== ${label} (${base}) =====`);
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) });
  const lb = await login.json();
  const t = lb?.token || lb?.data?.token || '';
  check('login', login.status === 200 && !!t, `status=${login.status}`);
  if (!t) continue;
  const api = async (p) => { const r = await fetch(base + p, { headers: { Authorization: `Bearer ${t}` } }); const b = await r.json().catch(() => ({})); return { s: r.status, b }; };

  // 1) NEW SEMANTICS: status=inactive → inactive+terminated+resigned
  const inact = await api('/api/employees?limit=500&export=1&status=inactive');
  const rows = inact.b?.employees || [];
  const badSet = rows.filter(r => !['inactive', 'terminated', 'resigned'].includes(r.status));
  check('export status=inactive returns only inactive/terminated/resigned', inact.s === 200 && badSet.length === 0, `rows=${rows.length} statuses=${[...new Set(rows.map(r => r.status))].join(',') || '∅'}`);

  // 2) Card vs filter consistency: the stats cards are GLOBAL (unfiltered page
  //    load). The Inactive card must equal what the Inactive filter returns.
  //    (Stats are omitted on empty filtered results by design — card keeps
  //    global values — so compare against the unfiltered page call.)
  const stats = await api('/api/employees?page=1&limit=10&includeStats=1');
  const cardInactive = stats.b?.stats?.inactive;
  check('global Inactive card == inactive-filter row count', typeof cardInactive === 'number' && cardInactive === rows.length, `card=${cardInactive} rows=${rows.length}`);

  // 3) Exact statuses unchanged
  const act = await api('/api/employees?limit=500&export=1&status=active');
  const arows = act.b?.employees || [];
  check('export status=active still exact', act.s === 200 && arows.length > 0 && arows.every(r => r.status === 'active'), `rows=${arows.length}`);
  const term = await api('/api/employees?limit=500&export=1&status=terminated');
  const trows = term.b?.employees || [];
  check('export status=terminated still exact', term.s === 200 && trows.every(r => r.status === 'terminated'), `rows=${trows.length}`);

  // 4) Designation filter (new param) — pick a designation from first employee
  const anyEmp = await api('/api/employees?limit=1&export=1');
  const desigId = anyEmp.b?.employees?.[0]?.designation?.id;
  if (desigId) {
    const df = await api(`/api/employees?limit=500&export=1&designationId=${desigId}`);
    const drows = df.b?.employees || [];
    check('export designationId filters', df.s === 200 && drows.length > 0 && drows.every(r => r.designation?.id === desigId), `rows=${drows.length}`);
  } else {
    console.log('  SKIP designation check (no designation on first employee)');
  }

  // 5) on_leave not swallowed by inactive semantics
  const ol = await api('/api/employees?limit=500&export=1&status=on_leave');
  const orows = ol.b?.employees || [];
  check('export status=on_leave still exact', ol.s === 200 && orows.every(r => r.status === 'on_leave'), `rows=${orows.length}`);
}

console.log(`\nTOTAL: ${passN}/${passN + failN} pass — ${failN === 0 ? 'TASK 80 FIX CONFIRMED LIVE' : 'CHECK FAILURES ABOVE'}`);
process.exit(failN === 0 ? 0 : 1);
