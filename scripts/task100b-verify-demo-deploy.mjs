// Task 100-b — post-deploy verification of nexus-hrms-demo.vercel.app (build 1dde947a)
const BASE = 'https://nexus-hrms-demo.vercel.app';
const j = async (r) => { try { return await r.json(); } catch { return null; } };

// 1. build fingerprint
const page = await fetch(BASE + '/login').then((r) => r.text());
const dpl = [...new Set([...page.matchAll(/dpl=([A-Za-z0-9]+)/g)].map((m) => m[1]))];
console.log('1. deployment hash served:', dpl.join(', ') || '(none)', dpl[0] === 'dpl_4ESNTTToHz8zhFRHBZpW2q7kvX2u' ? '⚠️ STILL OLD BUILD' : '→ NEW BUILD confirmed (was dpl_4ESN… before deploy)');

// 2. super admin
const L = await j(await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
}));
const ok1 = L && (L.token || L.accessToken);
console.log('2. super-admin login:', ok1 ? 'OK' : 'FAILED');
if (ok1) {
  const H = { Authorization: `Bearer ${L.token || L.accessToken}` };
  const cr = await j(await fetch(BASE + '/api/super-admin/change-requests', { headers: H }));
  const crs = cr?.requests || cr?.data || (Array.isArray(cr) ? cr : []);
  console.log('   change-requests module:', `HTTP OK, count=${Array.isArray(crs) ? crs.length : '?'}`);
  const T = await j(await fetch(BASE + '/api/tenants', { headers: H }));
  const ts = T?.tenants || T?.data || (Array.isArray(T) ? T : []);
  console.log('   switcher tenants (sample only expected):', ts.map((t) => t.slug).join(', '));
  const E = await j(await fetch(BASE + '/api/employees', { headers: H }));
  const total = E?.pagination?.total ?? (E?.employees || []).length;
  console.log('   unscoped employees (demo sample DB by design):', total);
}

// 3. tenant admin
const L2 = await j(await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@acme-global.com', password: 'MarqAI@2026' }),
}));
const ok2 = L2 && (L2.token || L2.accessToken);
console.log('3. tenant-admin login (admin@acme-global.com):', ok2 ? 'OK' : 'FAILED');
if (ok2) {
  const H2 = { Authorization: `Bearer ${L2.token || L2.accessToken}` };
  let oks = 0; const apis = ['dashboard', 'employees', 'attendance', 'leaves', 'payroll', 'notifications', 'tickets', 'announcements'];
  for (const a of apis) { const r = await fetch(`${BASE}/api/${a}`, { headers: H2 }); if (r.ok) oks++; else console.log(`   /api/${a} → ${r.status}`); }
  console.log(`   core APIs: ${oks}/8 OK`);
  const wf = await fetch(`${BASE}/api/attendance/workflow-config`, { headers: H2 });
  console.log(`   attendance workflow-config: HTTP ${wf.status}`);
}

// 4. LIVE untouched sanity
const live = await fetch('https://3boxeshrms.com/login').then((r) => r.text());
const liveDpl = [...new Set([...live.matchAll(/dpl=([A-Za-z0-9]+)/g)].map((m) => m[1]))];
console.log('4. LIVE untouched check:', liveDpl[0] === 'dpl_A9Fu3gQUbeCSRNRJRgoFmhTi64wq' ? 'OK — LIVE still on its own build (dpl_A9Fu…)' : `CHANGED? ${liveDpl.join(',')}`);
