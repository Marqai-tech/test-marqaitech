/**
 * Task 154 — LIVE post-deploy verification: dashboard UI polish.
 * Pure client-UI change, so the live proof is: both Vercel projects built and
 * serve the app shell (200) for every touched route, auth + the data APIs the
 * four screens consume still work, and the CR is approved.
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
    return { status: res.status, json: await res.json().catch(() => null), text: await res.text().catch(() => '') };
  } catch (e) { return { status: 0, json: null, text: '', error: e.message }; }
}

(async () => {
  // 0) hosts up
  const vDemo = await api(DEMO, '/api/public/app-version');
  const vMarq = await api(MARQAI, '/api/public/app-version');
  ok('demo host up (app-version)', vDemo.status === 200, `v=${vDemo.json?.versionName}(${vDemo.json?.versionCode})`);
  ok('marqai host up (app-version)', vMarq.status === 200, `v=${vMarq.json?.versionName}(${vMarq.json?.versionCode})`);

  // 1) touched routes serve the app shell on both tenants
  for (const route of ['/home', '/dashboard', '/employees', '/org-chart']) {
    const a = await api(DEMO, route);
    ok(`demo route ${route} serves 200`, a.status === 200);
    const b = await api(MARQAI, route);
    ok(`marqai route ${route} serves 200`, b.status === 200);
  }

  // 2) marqai admin login + the data APIs behind the 4 screens
  const ceo = await api(MARQAI, '/api/auth/login', { method: 'POST', body: { email: 'mahesh@marqaitech.com', password: 'MarqAI@2026' } });
  let T = ceo.json?.token;
  if (!T) {
    const hr = await api(MARQAI, '/api/auth/login', { method: 'POST', body: { email: 'hr@gmail.com', password: 'MarqAI@2026' } });
    T = hr.json?.token;
  }
  ok('marqai admin/HR login', !!T);
  if (T) {
    const bal = await api(MARQAI, '/api/leave/balance?limit=50', { token: T });
    ok('leave balance API (Leave Details/Summary data) 200', bal.status === 200, `keys=${Object.keys(bal.json || {}).slice(0, 4).join(',')}`);
    const lv = await api(MARQAI, '/api/leave?limit=6', { token: T });
    ok('leave list API (Pending/Upcoming rows data) 200', lv.status === 200);
    const emps = await api(MARQAI, '/api/employees?limit=1000', { token: T });
    ok('employees API (list filters + org tree data) 200', emps.status === 200, `${(emps.json?.employees || []).length} employees`);
  }

  // 3) demo tenant sanity (same screens, other tenant)
  const tRes = await api(DEMO, '/api/auth/login', { method: 'POST', body: { email: 'admin@techstart.com', password: 'MarqAI@2026' } });
  const D = tRes.json?.token;
  ok('demo tenant admin login', !!D);
  if (D) {
    const emps = await api(DEMO, '/api/employees?limit=1000', { token: D });
    ok('demo employees API 200', emps.status === 200, `${(emps.json?.employees || []).length} employees`);
  }

  // 4) change request approved
  const sa = await api(DEMO, '/api/auth/login', { method: 'POST', body: { email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' } });
  const S = sa.json?.token;
  if (S) {
    const list = await api(DEMO, '/api/super-admin/change-requests', { token: S });
    const reqs = list.json?.requests || list.json?.data || [];
    const cr = Array.isArray(reqs) ? reqs.find((r) => r.id === 'cmvo3si96000008l57i72sewy') : null;
    ok('Task 154 CR approved', !!cr && cr.status === 'approved', `status=${cr?.status}`);
  }

  console.log(results.join('\n'));
  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
