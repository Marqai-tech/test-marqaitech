// Task 155 — LIVE postdeploy verification of the /employees/dashboard restyle.
// Checks (all against the LIVE tenant host + apex):
//  1. Page shell HTTP 200 on tenant + apex.
//  2. The route chunk set no longer contains the string "Module Dashboard"
//     and DOES contain the new breadcrumb trail ["Employee","Dashboard"] +
//     the shared SmartHR gradient signature + SmartHR widget strings.
//  3. Auth still healthy: superadmin apex login + tenant login for
//     hr@gmail.com (login must be untouched by this UI change).
//  4. app-version still serves 1.8.0 (36) (no accidental version change).
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const APEX = 'https://3boxeshrms.com';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' :: ' + extra : ''}`);
  cond ? pass++ : fail++;
};

/* 1 + 2 — page shell + chunk inspection */
async function checkHost(host, label) {
  const res = await fetch(`${host}/employees/dashboard`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  ok(`${label} /employees/dashboard HTTP 200`, !!res && res.status === 200, res ? `status=${res.status}` : 'no response');
  if (!res || res.status !== 200) return;
  const html = await res.text();
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+?\.js/g)].map(m => m[0]))];
  ok(`${label} page shell lists JS chunks`, chunks.length > 0, `${chunks.length} chunks`);
  let found = { trail: false, gradient: false, moduleOld: false, quickTiles: false };
  for (const c of chunks) {
    const r = await fetch(`${host}${c}`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!r || !r.ok) continue;
    const js = await r.text();
    if (js.includes('Module Dashboard')) found.moduleOld = true;
    if (js.includes('["Employee","Dashboard"]')) found.trail = true;
    if (js.includes('from-[#3A57C4] via-[#4C51D6] to-[#6C4FD6]')) found.gradient = true;
    if (js.includes('Quick Actions') && js.includes('Department Distribution')) found.quickTiles = true;
  }
  ok(`${label} — heading renamed: "Module Dashboard" GONE from bundles`, !found.moduleOld);
  ok(`${label} — new breadcrumb trail ["Employee","Dashboard"] present`, found.trail);
  ok(`${label} — shared PageBreadcrumbs gradient signature present`, found.gradient);
  ok(`${label} — SmartHR panels (Quick Actions + Department Distribution) present`, found.quickTiles);
}

await checkHost(TENANT, 'tenant');
await checkHost(APEX, 'apex');

/* 3 — auth untouched */
const T = { 'Content-Type': 'application/json' };
const sa = await fetch(`${APEX.replace('3boxeshrms.com', 'nexus-hrms-demo.vercel.app')}/api/auth/login`, {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
  signal: AbortSignal.timeout(30000),
}).catch(() => null);
ok('apex (nexus-hrms-demo) superadmin login 200', !!sa && sa.status === 200, sa ? `status=${sa.status}` : 'no response');

const hr = await fetch(`${TENANT}/api/auth/login`, {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }),
  signal: AbortSignal.timeout(30000),
}).catch(() => null);
ok('tenant hr@gmail.com login 200', !!hr && hr.status === 200, hr ? `status=${hr.status}` : 'no response');
if (hr && hr.ok) {
  const hd = await hr.json().catch(() => null);
  const token = hd?.token || hd?.accessToken;
  ok('tenant login returns token', !!token);
  if (token) {
    const dash = await fetch(`${TENANT}/api/employees?limit=100&page=1`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
    }).catch(() => null);
    ok('tenant /api/employees (dashboard data source) 200', !!dash && dash.status === 200, dash ? `status=${dash.status}` : 'no response');
  }
}

/* 4 — version unchanged */
const ver = await fetch(`${TENANT}/api/public/app-version`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
if (ver && ver.ok) {
  const vd = await ver.json().catch(() => null);
  ok('app-version still 1.8.0 (36)', vd && /1\.8\.0/.test(String(vd?.latestVersion ?? vd?.version ?? vd?.versionName ?? '')) && Number(vd?.versionCode) === 36, JSON.stringify(vd).slice(0, 120));
} else {
  ok('app-version reachable', false, 'no response');
}

console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
