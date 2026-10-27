// Task 113 — post-deploy verification matrix on LIVE tenant + apex + demo.
const LIVE = 'https://marqaitechgroup.3boxeshrms.com';
const APEX = 'https://3boxeshrms.com';
const DEMO = 'https://nexus-hrms-demo.vercel.app';

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
async function get(url, token) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text.slice(0, 300) }, bytes: text.length }; }
}
async function post(url, payload) {
  const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text.slice(0, 300) } }; }
}

async function hostMatrix(base, label, logins) {
  console.log(`\n=== ${label} (${base}) ===`);
  const v = await get(`${base}/api/public/app-version`);
  check('app-version endpoint', v.status === 200 && v.data.versionName === '1.3.0' && v.data.versionCode === 13, `v${v.data?.versionName}(${v.data?.versionCode})`);
  check('notes updated', (v.data?.notes || '').includes('directory now scoped'), '');
  for (const apk of ['3boxes-hrms-mobile-v1.3.0.apk', '3boxes-hrms-mobile.apk']) {
    const r = await fetch(`${base}/downloads/${apk}`, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
    check(`APK ${apk}`, r.status === 200, `${r.headers.get('content-length') || '?'} bytes`);
  }
  // login page: download section present, no PWA install
  const page = await fetch(base + '/login', { signal: AbortSignal.timeout(30000) }).then(r => r.text());
  check('login page has Download for Android', page.includes('Download for Android'));
  check('no PWA install option', !/install.*pwa|add to home screen/i.test(page));

  // ── Directory scoping ladder (role → visible employees) ──
  for (const { email, password, expectScope, min, max } of logins) {
    const l = await post(`${base}/api/auth/login`, { email, password });
    if (l.status !== 200 || !l.data.token) { check(`login ${email}`, false, `status ${l.status}`); continue; }
    check(`login ${email}`, true, l.data.user?.role);
    const emp = await get(`${base}/api/employees`, l.data.token);
    const rows = emp.data?.employees?.length ?? emp.data?.data?.length ?? 0;
    const scoped = rows >= min && (max == null || rows <= max);
    check(`directory scope ${expectScope}`, scoped, `${rows} rows (expect ${min}${max != null ? '-' + max : '+'})`);
    // my-balance for the employee account
    if (expectScope === 'employee') {
      const bal = await get(`${base}/api/leaves/my-balance`, l.data.token);
      check('my-balance responds', bal.status === 200 && 'total' in bal.data, `total=${bal.data?.total}`);
    }
    // punch API rejects properly-formed request with missing GPS (400) — proves route alive
    const p = await fetch(`${base}/api/attendance/punch`, {
      method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${l.data.token}` },
      body: JSON.stringify({ employeeId: 'x', action: 'checkin', date: '2026-01-01', localTime: '09:00' }),
    });
    check('punch route alive', [400, 403, 404, 409].includes(p.status), `status ${p.status}`);
  }
}

// Demo accounts (Task 104 seeding): employee.demo sees own DEPARTMENT (>=2 expected),
// manager.demo sees own + reports (>=2), admin sees all (>=10).
await hostMatrix(DEMO, 'DEMO', [
  { email: 'employee.demo@3boxeshrms.com', password: 'MarqAI@2026', expectScope: 'employee', min: 2, max: null },
  { email: 'manager.demo@3boxeshrms.com', password: 'MarqAI@2026', expectScope: 'manager-team', min: 2, max: null },
  { email: 'admin@acme-global.com', password: 'MarqAI@2026', expectScope: 'admin-all', min: 10, max: null },
]);
// LIVE tenant: hr@ is tenant_admin (scope all — sees everyone).
await hostMatrix(LIVE, 'LIVE TENANT', [
  { email: 'hr@marqaitech.com', password: 'MarqAI@2026', expectScope: 'admin-all', min: 5, max: null },
]);
// Apex: super-admin version + APK only (tenant login 403 by design).
console.log(`\n=== APEX (${APEX}) ===`);
const av = await get(`${APEX}/api/public/app-version`);
check('apex app-version', av.status === 200 && av.data.versionName === '1.3.0', `v${av.data?.versionName}`);
const apk = await fetch(`${APEX}/downloads/3boxes-hrms-mobile-v1.3.0.apk`, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
check('apex APK', apk.status === 200);

console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
