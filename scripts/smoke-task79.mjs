// Task 79 smoke test — verify QA fixes are LIVE on both Vercel deployments.
// Demo: full checks incl. one document create+delete (cleanup).
// LIVE: read-only + rejection checks only (no writes, per standing rules).
const PASS = 'MarqAI@2026';

async function runSite(label, base, email, allowWrite) {
  console.log(`\n========== ${label} (${base}) ==========`);
  let bearer = '';
  const api = async (path, opts = {}) => {
    const res = await fetch(base + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(opts.headers || {}) },
    });
    let body = null;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    return { status: res.status, body };
  };

  let passN = 0, failN = 0;
  const check = (name, cond, detail = '') => {
    if (cond) { passN++; console.log(`  PASS ${name}`); }
    else { failN++; console.log(`  FAIL ${name} — ${detail}`); }
  };

  // 0) home page
  const home = await fetch(base + '/', { redirect: 'manual' });
  check('home reachable', [200, 307, 308].includes(home.status), `status=${home.status}`);

  // 1) login
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: PASS }) });
  check('login', login.status === 200, `status=${login.status}`);
  bearer = login.body?.token || login.body?.data?.token || '';
  if (!bearer) { console.log('  no token — aborting site'); return { passN, failN }; }

  // 2) NEW: onLeaveToday metric
  const olt = await api('/api/leave?onLeaveToday=1');
  check('leave onLeaveToday=1 → 200 + numeric count',
    olt.status === 200 && typeof olt.body?.onLeaveToday === 'number' && Array.isArray(olt.body?.employees),
    `status=${olt.status} body=${JSON.stringify(olt.body).slice(0, 120)}`);
  console.log(`    onLeaveToday = ${olt.body?.onLeaveToday}`);

  // 3) NEW: export mode honors status filter (server-side)
  // NB: both sites currently have ZERO inactive employees, so status=inactive
  // correctly returns an empty set. Prove the filter positively with active.
  const exp = await api('/api/employees?limit=500&export=1&status=inactive');
  const rows = Array.isArray(exp.body?.employees) ? exp.body.employees : [];
  const badRows = rows.filter(r => r.status !== 'inactive').length;
  check('export=1&status=inactive returns only inactive (may be empty)',
    exp.status === 200 && badRows === 0, `status=${exp.status} rows=${rows.length} nonInactive=${badRows}`);
  const expA = await api('/api/employees?limit=500&export=1&status=active');
  const rowsA = Array.isArray(expA.body?.employees) ? expA.body.employees : [];
  const badActive = rowsA.filter(r => r.status !== 'active').length;
  check('export=1&status=active returns only active', expA.status === 200 && rowsA.length > 0 && badActive === 0,
    `status=${expA.status} rows=${rowsA.length} nonActive=${badActive}`);

  // 4) probation GET exercises the new schema-sync helper
  const prob = await api('/api/employees/probation?limit=5');
  check('probation GET → 200', prob.status === 200, `status=${prob.status} body=${JSON.stringify(prob.body).slice(0, 120)}`);

  // 5) document link security — server must REJECT unsafe URLs (writes nothing)
  const emps = await api('/api/employees?limit=1');
  const empId = emps.body?.employees?.[0]?.id;
  check('employees list for doc tests', Boolean(empId), `status=${emps.status}`);
  if (empId) {
    const js = await api(`/api/employees/${empId}/documents`, { method: 'POST', body: JSON.stringify({ name: 'QA security probe', fileUrl: 'javascript:alert(1)' }) });
    check('javascript: URL rejected (400)', js.status === 400, `status=${js.status} body=${JSON.stringify(js.body).slice(0, 120)}`);
    const html = await api(`/api/employees/${empId}/documents`, { method: 'POST', body: JSON.stringify({ name: 'QA security probe 2', fileUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' }) });
    check('data:text/html URL rejected (400)', html.status === 400, `status=${html.status} body=${JSON.stringify(html.body).slice(0, 120)}`);
    const svg = await api(`/api/employees/${empId}/documents`, { method: 'POST', body: JSON.stringify({ name: 'QA security probe 3', fileUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }) });
    check('data:image/svg+xml URL rejected (400)', svg.status === 400, `status=${svg.status}`);
  }

  // 6) safe https URL still accepted (demo only: create then DELETE to clean up)
  if (allowWrite && empId) {
    const ok = await api(`/api/employees/${empId}/documents`, { method: 'POST', body: JSON.stringify({ name: 'QA safe-link check (delete me)', category: 'other', type: 'other', fileUrl: 'https://example.com/qa-task79-safe.pdf' }) });
    const docId = ok.body?.document?.id;
    check('safe https URL accepted (201)', ok.status === 201, `status=${ok.status} body=${JSON.stringify(ok.body).slice(0, 120)}`);
    if (docId) {
      const del = await api(`/api/employees/${empId}/documents?docId=${docId}`, { method: 'DELETE' });
      check('cleanup delete (200)', del.status === 200, `status=${del.status}`);
    }
  }

  console.log(`  → ${label}: ${passN} pass, ${failN} fail`);
  return { passN, failN };
}

const demo = await runSite('DEMO', 'https://nexus-hrms-mu.vercel.app', 'admin@3boxeshrms.com', true);
const live = await runSite('LIVE', 'https://marqaitechgroup.3boxeshrms.com', 'hr@gmail.com', false);
const total = demo.passN + demo.failN + live.passN + live.failN;
console.log(`\nTOTAL: ${demo.passN + live.passN}/${total} pass — ${demo.failN + live.failN === 0 ? 'ALL QA FIXES CONFIRMED LIVE' : 'SOME CHECKS FAILED'}`);
process.exit(demo.failN + live.failN === 0 ? 0 : 1);
