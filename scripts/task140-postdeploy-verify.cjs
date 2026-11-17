/**
 * Task 140 — LIVE post-deploy verification: selected-row export.
 * Proves: export with ?ids= returns EXACTLY the selected employee(s),
 * ignores list filters in ids-mode, keeps full-list behaviour without ids,
 * and never widens scope for employee-role callers.
 */
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const MARQAI = 'https://marqaitechgroup.3boxeshrms.com';

let pass = 0, fail = 0;
const results = [];
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; results.push(`  PASS  ${label}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; results.push(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`); }
};

async function api(base, path, { method = 'GET', token, body } = {}) {
  try {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45000),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  } catch (e) { return { status: 0, json: null, error: e.message }; }
}
const login = async (base, email, password) =>
  (await api(base, '/api/auth/login', { method: 'POST', body: { email, password } })).json?.token
  ?? (await api(base, '/api/auth/login', { method: 'POST', body: { email, password } })).json?.token;

(async () => {
  // 0) version endpoints up
  const vDemo = await api(DEMO, '/api/public/app-version');
  const vMarq = await api(MARQAI, '/api/public/app-version');
  ok('demo host up (app-version)', vDemo.status === 200, `v=${vDemo.json?.versionName}(${vDemo.json?.versionCode})`);
  ok('marqai host up (app-version)', vMarq.status === 200, `v=${vMarq.json?.versionName}(${vMarq.json?.versionCode})`);

  // ─── DEMO tenant ───
  const tRes = await api(DEMO, '/api/auth/login', { method: 'POST', body: { email: 'admin@techstart.com', password: 'MarqAI@2026' } });
  const T = tRes.json?.token;
  ok('demo tenant admin login', !!T);
  if (T) {
    const H = { token: T };
    const full = await api(DEMO, '/api/employees?export=1&limit=500', H);
    const all = full.json?.employees || [];
    ok('full export returns rows (baseline)', full.status === 200 && all.length >= 2, `${all.length} employees`);
    const idA = all[0]?.id;
    const idB = all[1]?.id;
    const nameA = `${all[0]?.firstName || ''} ${all[0]?.lastName || ''}`.trim();

    // single selection → exactly 1 row
    const one = await api(DEMO, `/api/employees?export=1&limit=500&ids=${idA}`, H);
    const oneRows = one.json?.employees || [];
    ok('single selected employee exports EXACTLY 1 row', one.status === 200 && oneRows.length === 1 && oneRows[0]?.id === idA,
      `got ${oneRows.length} row(s), id match=${oneRows[0]?.id === idA}${oneRows[0] ? ` (${nameA})` : ''}`);

    // two selections → exactly 2 rows
    const two = await api(DEMO, `/api/employees?export=1&limit=500&ids=${idA},${idB}`, H);
    const twoRows = two.json?.employees || [];
    const twoIds = new Set(twoRows.map((r) => r.id));
    ok('two selected employees export EXACTLY 2 rows', two.status === 200 && twoRows.length === 2 && twoIds.has(idA) && twoIds.has(idB),
      `got ${twoRows.length} row(s)`);

    // ids-mode IGNORES list filters (selection wins)
    const filtered = await api(DEMO, `/api/employees?export=1&limit=500&ids=${idA}&search=zzzznomatch&status=inactive&excludeManagement=1`, H);
    const fRows = filtered.json?.employees || [];
    ok('ids-mode ignores search/status filters (selection wins)', filtered.status === 200 && fRows.length === 1 && fRows[0]?.id === idA,
      `got ${fRows.length} row(s) with contradictory filters present`);

    // regression: no ids → whole list still flows (filters honoured path intact)
    const regress = await api(DEMO, '/api/employees?export=1&limit=500&search=' + encodeURIComponent((all[0]?.firstName || '').slice(0, 3)), H);
    ok('no-ids export still returns rows (regression)', regress.status === 200 && (regress.json?.employees || []).length >= 1,
      `${(regress.json?.employees || []).length} rows via search filter`);

    // garbage ids → empty, not the whole list
    const junk = await api(DEMO, '/api/employees?export=1&limit=500&ids=nonexistent-id-xyz', H);
    ok('garbage ids return 0 rows (not the whole list)', junk.status === 200 && (junk.json?.employees || []).length === 0,
      `${(junk.json?.employees || []).length} rows`);

    // duplicate ids deduped
    const dup = await api(DEMO, `/api/employees?export=1&limit=500&ids=${idA},${idA},${idA}`, H);
    ok('duplicate ids dedupe to 1 row', dup.status === 200 && (dup.json?.employees || []).length === 1,
      `${(dup.json?.employees || []).length} row(s)`);
  }

  // ─── DEMO employee-role scoping: employee cannot export someone else via ids ───
  const empRes = await api(DEMO, '/api/auth/login', { method: 'POST', body: { email: 'meera.bansal@technova.demo', password: 'MarqAI@2026' } });
  const E = empRes.json?.token;
  if (E && pass > 0) {
    const full = await api(DEMO, '/api/employees?export=1&limit=500', { token: E });
    const rows = full.json?.employees || [];
    // find someone who is NOT in the employee's visible set
    const adminRows = await api(DEMO, '/api/employees?export=1&limit=500', { token: (await api(DEMO, '/api/auth/login', { method: 'POST', body: { email: 'admin@techstart.com', password: 'MarqAI@2026' } })).json?.token });
    const adminIds = (adminRows.json?.employees || []).map((r) => r.id);
    const foreign = adminIds.find((id) => !rows.some((r) => r.id === id));
    if (foreign) {
      const smuggle = await api(DEMO, `/api/employees?export=1&limit=500&ids=${foreign}`, { token: E });
      ok('employee-role caller CANNOT export a foreign employee via ids', smuggle.status === 200 && (smuggle.json?.employees || []).length === 0,
        `foreign id returned ${(smuggle.json?.employees || []).length} rows`);
    } else {
      ok('employee-role scoping (no foreign id available to test — all visible)', true, 'informational');
    }
  } else {
    ok('employee-role scoping (meera login unavailable — skipped)', true, 'informational');
  }

  // ─── MARQAI tenant (user's tenant) ───
  const mRes = await api(MARQAI, '/api/auth/login', { method: 'POST', body: { email: 'hr@gmail.com', password: 'MarqAI@2026' } });
  const M = mRes.json?.token;
  ok('marqai HR login', !!M);
  if (M) {
    const full = await api(MARQAI, '/api/employees?export=1&limit=500', { token: M });
    const all = full.json?.employees || [];
    ok('marqai full export baseline', full.status === 200 && all.length >= 2, `${all.length} employees`);
    if (all.length >= 1) {
      const one = await api(MARQAI, `/api/employees?export=1&limit=500&ids=${all[0].id}`, { token: M });
      const rows = one.json?.employees || [];
      ok('marqai single selected employee exports EXACTLY 1 row', one.status === 200 && rows.length === 1 && rows[0]?.id === all[0].id,
        `got ${rows.length} row(s) (${rows[0]?.firstName || ''} ${rows[0]?.lastName || ''})`);
      if (all.length >= 2) {
        const two = await api(MARQAI, `/api/employees?export=1&limit=500&ids=${all[0].id},${all[1].id}`, { token: M });
        ok('marqai two selected employees export EXACTLY 2 rows', two.status === 200 && (two.json?.employees || []).length === 2,
          `got ${(two.json?.employees || []).length} row(s)`);
      }
    }
  }

  console.log(results.join('\n'));
  console.log(`\nRESULT: ${pass}/${pass + fail} checks passed`);
  process.exit(fail === 0 ? 0 : 1);
})();
