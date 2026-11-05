// Task 111 — End-to-end API test mimicking the Flutter app EXACTLY.
// Tests the login ladder + every module endpoint for all account types.
const LIVE = 'https://3boxeshrms.com';
const DEMO = 'https://nexus-hrms-demo.vercel.app';

const results = [];
function log(section, msg, ok) {
  results.push({ section, msg, ok });
  console.log(`${ok === true ? 'PASS' : ok === false ? 'FAIL' : 'INFO'} [${section}] ${msg}`);
}

async function attemptLogin(baseUrl, email, password) {
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(25000),
    });
    let data = {};
    try { data = await res.json(); } catch { data = { error: `non-JSON (${res.status})` }; }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: { error: `network: ${e.message}` } };
  }
}

// EXACT replica of ApiService.login ladder (including the /login bug)
async function ladderLogin(startWorkspace, email, password, fixLoginPath) {
  const attempted = new Set();
  const triedUrls = [];
  let current = startWorkspace;
  let lastStatus = 0, lastError = 'Login failed';
  while (attempted.size < 3) {
    attempted.add(current);
    triedUrls.push(current);
    // EXACT app behavior: POST $baseUrl/api/auth/login
    const { status, data } = await attemptLogin(current, email, password);
    lastStatus = status; lastError = data.error || data.message || lastError;
    if (status === 200) {
      return { ok: true, workspace: current, token: data.token || data.data?.token, user: data.user || data.data?.user || data.data, triedUrls };
    }
    const suggested = data.suggestedUrl;
    if (suggested) {
      // App: normalizeWorkspaceUrl(suggested) — strips trailing / only, keeps path!
      let target = suggested.trim().replace(/\/+$/, '');
      if (fixLoginPath) target = target.replace(/\/login$/, ''); // THE FIX
      if (!attempted.has(target)) { triedUrls.push(`↳ ${target}`); current = target; continue; }
    }
    if (current !== LIVE) { current = LIVE; continue; }
    break;
  }
  return { ok: false, lastStatus, lastError, triedUrls };
}

const MODULES = [
  ['auth/me', '/api/auth/me'],
  ['dashboard', '/api/dashboard'],
  ['employees', '/api/employees?page=1&limit=20'],
  ['leaves', '/api/leaves?page=1'],
  ['attendance', '/api/attendance'],
  ['my-summary', '/api/attendance/my-summary'],
  ['payroll', '/api/payroll?page=1&limit=20'],
  ['notifications', '/api/notifications'],
  ['companies', '/api/companies'],
  ['departments', '/api/departments'],
  ['designations', '/api/designations'],
  ['app-version', '/api/public/app-version'],
];

async function hitModules(label, workspace, token) {
  for (const [name, path] of MODULES) {
    try {
      const res = await fetch(`${workspace}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(25000),
      });
      let body;
      try { body = await res.json(); } catch { body = {}; }
      const shape = Object.keys(body).slice(0, 6).join(',');
      log(label, `${name} → ${res.status} {${shape}}`, res.status >= 200 && res.status < 300);
    } catch (e) {
      log(label, `${name} → NETWORK FAIL ${e.message}`, false);
    }
  }
}

// ============ Scenario 1: tenant admin hr@marqaitech.com (fresh install, demo default) ============
console.log('\n========== TENANT ADMIN hr@marqaitech.com (fresh install) ==========');
log('tenant-admin', '--- CURRENT BUILD (buggy /login path) ---');
const r1a = await ladderLogin(DEMO, 'hr@marqaitech.com', 'MarqAI@2026', false);
log('tenant-admin', r1a.ok ? `LOGGED IN at ${r1a.workspace}` : `LOGIN FAILED status=${r1a.lastStatus} err="${r1a.lastError}" tried=${r1a.triedUrls.join(' | ')}`, r1a.ok);
log('tenant-admin', '--- WITH FIX (strip /login) ---');
const r1b = await ladderLogin(DEMO, 'hr@marqaitech.com', 'MarqAI@2026', true);
log('tenant-admin', r1b.ok ? `LOGGED IN at ${r1b.workspace}` : `LOGIN FAILED status=${r1b.lastStatus} err="${r1b.lastError}" tried=${r1b.triedUrls.join(' | ')}`, r1b.ok);
if (r1b.ok) await hitModules('tenant-admin', r1b.workspace, r1b.token);

// ============ Scenario 2: demo admin ============
console.log('\n========== DEMO ADMIN admin@acme-global.com ==========');
const r2 = await ladderLogin(DEMO, 'admin@acme-global.com', 'MarqAI@2026', true);
log('demo-admin', r2.ok ? `LOGGED IN at ${r2.workspace}` : `FAILED: ${r2.lastError}`, r2.ok);
if (r2.ok) await hitModules('demo-admin', r2.workspace, r2.token);

// ============ Scenario 3: super admin at apex ============
console.log('\n========== SUPER ADMIN superadmin@3boxeshrms.com ==========');
const r3 = await ladderLogin(LIVE, 'superadmin@3boxeshrms.com', 'MarqAI@2026', true);
log('super-admin', r3.ok ? `LOGGED IN at ${r3.workspace}` : `FAILED: ${r3.lastError}`, r3.ok);
if (r3.ok) await hitModules('super-admin', r3.workspace, r3.token);

// ============ Scenario 4: demo employee + manager ============
console.log('\n========== DEMO EMPLOYEE employee.demo@3boxeshrms.com ==========');
const r4 = await ladderLogin(DEMO, 'employee.demo@3boxeshrms.com', 'MarqAI@2026', true);
log('demo-employee', r4.ok ? `LOGGED IN at ${r4.workspace}` : `FAILED: ${r4.lastError}`, r4.ok);
if (r4.ok) await hitModules('demo-employee', r4.workspace, r4.token);

console.log('\n========== DEMO MANAGER manager.demo@3boxeshrms.com ==========');
const r5 = await ladderLogin(DEMO, 'manager.demo@3boxeshrms.com', 'MarqAI@2026', true);
log('demo-manager', r5.ok ? `LOGGED IN at ${r5.workspace}` : `FAILED: ${r5.lastError}`, r5.ok);
if (r5.ok) await hitModules('demo-manager', r5.workspace, r5.token);

// ============ Scenario 5: tenant manager (real LIVE account) ============
console.log('\n========== LIVE TENANT — try common accounts at marqaitechgroup ==========');
// Direct login at the tenant subdomain (as if workspace manually set)
const r6 = await attemptLogin('https://marqaitechgroup.3boxeshrms.com', 'hr@marqaitech.com', 'MarqAI@2026');
log('live-tenant', `direct tenant login hr@ → ${r6.status}`, r6.status === 200);
if (r6.status === 200) {
  await hitModules('live-tenant', 'https://marqaitechgroup.3boxeshrms.com', r6.data.token);
}

const pass = results.filter(r => r.ok === true).length;
const fail = results.filter(r => r.ok === false).length;
console.log(`\n===== SUMMARY: ${pass} pass, ${fail} fail =====`);
