// Task 156 — LIVE postdeploy verification v3 (fast: route-chunk-only scanning).
// GitHub status posting is disconnected (known Task 142 pattern) → verify by
// fetching the live sites directly. Only the route-specific `chunks/app/…`
// bundles are downloaded (page title/trail strings live there); the shared
// gradient signature is checked once globally and cached.
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const APEX = 'https://nexus-hrms-demo.vercel.app';
const GRAD = 'from-[#3A57C4] via-[#4C51D6] to-[#6C4FD6]';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' :: ' + extra : ''}`);
  cond ? pass++ : fail++;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const cache = new Map();
async function getChunk(host, path) {
  const key = host + path;
  if (cache.has(key)) return cache.get(key);
  const r = await fetch(`${host}${path}`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
  const js = r && r.ok ? await r.text() : null;
  cache.set(key, js);
  return js;
}

// route chunks: Turbopack production builds use OPAQUE hashed chunk names
// (no /chunks/app/ path segments) — so scan ALL referenced chunks.
function routeChunks(html) {
  return [...new Set([...html.matchAll(/\/_next\/static\/[^"']+?\.js/g)].map(m => m[0]))];
}

async function scan(host, pagePath, mustHave, label = '') {
  const res = await fetch(`${host}${pagePath}`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!res || res.status !== 200) { ok(`${label}${pagePath} HTTP 200`, false, res ? `status=${res.status}` : 'no response'); return; }
  const chunks = routeChunks(await res.text());
  const found = Object.fromEntries(mustHave.map(n => [n, false]));
  for (const c of chunks) {
    const js = await getChunk(host, c);
    if (!js) continue;
    for (const n of mustHave) if (!found[n] && js.includes(n)) found[n] = true;
    if (mustHave.every(n => found[n])) break;
  }
  for (const n of mustHave) ok(`${label}${pagePath} has "${n.length > 34 ? n.slice(0, 34) + '…' : n}"`, found[n], `${chunks.length} app chunks`);
}

/* 1 — wait for the NEW deploy: /leave route chunk must carry the gradient
       banner signature (pre-change /leave had a flat white header). */
let live = false, gradSeenOn = null;
for (let i = 1; i <= 18 && !live; i++) {
  const res = await fetch(`${TENANT}/leave`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (res && res.status === 200) {
    const chunks = routeChunks(await res.text());
    let hasTitle = false, hasGrad = false;
    for (const c of chunks) {
      const js = await getChunk(TENANT, c);
      if (!js) continue;
      if (js.includes('"Leave Dashboard"') || js.includes('"My Leave Applications"')) hasTitle = true;
      if (js.includes(GRAD)) hasGrad = true;
    }
    if (hasTitle && hasGrad) { live = true; gradSeenOn = `${chunks.length} chunks scanned`; }
  }
  if (!live) { console.log(`poll ${i}: new build not live yet`); await sleep(30000); }
}
ok('NEW deploy live on tenant (leave route chunk: gradient + new title)', live, gradSeenOn || 'not found');

if (live) {
  /* 2 — gradient signature verified once already above; now title checks for
         every restyled page (fast: route chunks only). */
  const pages = [
    ['/attendance', ['"Attendance Dashboard"']],
    ['/payroll', ['"Payroll Dashboard"']],
    ['/payroll/group-dashboard', ['"Group Dashboard"']],
    ['/dashboards/recruitment', ['"Recruitment Dashboard"']],
    ['/onboarding', ['"Onboarding Dashboard"']],
    ['/preboarding', ['"Preboarding Dashboard"']],
    ['/performance', ['"Appraisal Dashboard"']],
    ['/learning', ['L&D Hub']],
    ['/project-management', ['"PM Dashboard"']],
    ['/travel', ['Travel & Expense Dashboard']],
    ['/assets', ['"Asset Dashboard"']],
    ['/it-admin', ['IT Admin Console']],
    ['/accounts', ['"Accounts Dashboard"']],
    ['/crm', ['"CRM Dashboard"']],
    ['/clients', ['"External Dashboard"']],
    ['/helpdesk', ['"Support Dashboard"']],
    ['/governance', ['"Governance Dashboard"']],
    ['/super-admin', ['Super Admin Dashboard']],
    ['/tenant-admin', ['"Tenant Dashboard"']],
    ['/company', ['"Company Dashboard"']],
    ['/dashboards', ['"Dashboards"']],
    ['/dashboards/employee', ['"Admin Dashboard"']],
    ['/dashboards/payroll', ['"Payroll Dashboard"']],
    ['/employees/dashboard', ['"Dashboard"']],
  ];
  for (const [p, needles] of pages) await scan(TENANT, p, needles, 'tenant ');

  /* 3 — apex spot checks (same build serves both projects) */
  for (const [p, needles] of [['/crm', ['"CRM Dashboard"', GRAD]], ['/helpdesk', ['"Support Dashboard"', GRAD]], ['/it-admin', ['IT Admin Console']], ['/payroll', ['"Payroll Dashboard"']]]) {
    await scan(APEX, p, needles, 'apex ');
  }

  /* 4 — auth untouched */
  const T = { 'Content-Type': 'application/json' };
  const sa = await fetch(`${APEX}/api/auth/login`, { method: 'POST', headers: T, body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }), signal: AbortSignal.timeout(30000) }).catch(() => null);
  ok('apex superadmin login 200 (auth untouched)', !!sa && sa.status === 200);
  const tn = await fetch(`${TENANT}/api/auth/login`, { method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }), signal: AbortSignal.timeout(30000) }).catch(() => null);
  ok('tenant hr@gmail.com login 200', !!tn && tn.status === 200);

  /* 5 — APIs behind the restyled pages still healthy */
  if (tn && tn.ok) {
    const { token } = await tn.json().catch(() => ({ token: null }));
    const H = { Authorization: `Bearer ${token}` };
    for (const api of ['/api/leave', '/api/employees', '/api/payroll/dashboard']) {
      const r = await fetch(`${TENANT}${api}`, { headers: H, signal: AbortSignal.timeout(30000) }).catch(() => null);
      ok(`tenant ${api} reachable`, !!r && r.status < 500, r ? `status=${r.status}` : 'no response');
    }
  }

  /* 6 — app version unchanged */
  const v = await fetch(`${TENANT}/api/public/app-version`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (v && v.ok) {
    const vd = await v.json().catch(() => null);
    const ver = String(vd?.version?.version ?? vd?.version ?? '?');
    ok('app-version unchanged 1.8.0 (36) — no bump for web-only change', ver.startsWith('1.8.0'), `got ${ver}`);
  } else ok('app-version endpoint reachable', false, v ? String(v.status) : 'no response');
}

console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
