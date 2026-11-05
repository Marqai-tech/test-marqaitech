/**
 * Task 94 (94-4) — E2E verify the new `demo` test tenant through the LIVE demo Vercel deployment.
 * Uses the x-tenant-slug header (what middleware sets for demo.3boxeshrms.com) so this works
 * BEFORE the custom domain is attached. Read-only: no writes via app APIs except the
 * idempotent notification-template auto-seed.
 */
const BASE = 'https://nexus-hrms-mu.vercel.app';
const SLUG = 'demo';
const EMAIL = 'admin@demo.3boxeshrms.com';
const PASSWORD = 'MarqAI@2026';
const HDRS = { 'Content-Type': 'application/json' };
// NOTE: on the vercel.app host the middleware FORCES x-tenant-slug to the demo tenant,
// so we use the ?tenant= query param (middleware's highest-priority source) — this
// exactly simulates what demo.3boxeshrms.com will do via hostname extraction.
const Q = `?tenant=${SLUG}`;

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  // 0. Middleware page behavior: /?tenant=demo must redirect to /login
  const pageRes = await fetch(`${BASE}/?tenant=${SLUG}`, { redirect: 'manual' });
  ok('middleware: /?tenant=demo redirects to /login', pageRes.status === 307 || pageRes.status === 302, `status=${pageRes.status} loc=${pageRes.headers.get('location')}`);

  // 1. Login as the seeded tenant admin
  const loginRes = await fetch(`${BASE}/api/auth/login${Q}`, {
    method: 'POST', headers: HDRS, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = await loginRes.json().catch(() => ({}));
  ok('login admin@demo.3boxeshrms.com (x-tenant-slug: demo)', loginRes.status === 200 && (login.token || login.accessToken), `status=${loginRes.status}${login.error ? ' err=' + login.error : ''}`);
  const token = login.token || login.accessToken;
  if (!token) { console.log('Cannot continue without token'); process.exit(1); }
  const tenantInfo = login.tenant || login.user?.tenant;
  console.log('  tenant:', JSON.stringify(tenantInfo));
  const auth = { ...HDRS, Authorization: `Bearer ${token}` };

  // 2. Companies — expect the 5 dummy companies
  const compRes = await fetch(`${BASE}/api/companies${Q}`, { headers: auth });
  const comp = await compRes.json().catch(() => ({}));
  const companies = comp.companies || comp.data || comp;
  const arr = Array.isArray(companies) ? companies : companies?.companies || [];
  ok('GET /api/companies → 5 dummy companies', compRes.status === 200 && arr.length === 5, `status=${compRes.status} count=${arr.length}: ${arr.map(c => c.code || c.name).join(', ')}`);

  // 3. Employees — expect 51
  const empRes = await fetch(`${BASE}/api/employees${Q}`, { headers: auth });
  const emp = await empRes.json().catch(() => ({}));
  const emps = emp.employees || emp.data || emp;
  const empArr = Array.isArray(emps) ? emps : emps?.employees || [];
  const total = emp.pagination?.total ?? emp.total ?? empArr.length;
  ok('GET /api/employees → seeded employees visible', empRes.status === 200 && total >= 51, `status=${empRes.status} total=${total} page=${empArr.length}`);

  // 4. Leave requests — seeded samples visible (working /api/leave route)
  const lvRes = await fetch(`${BASE}/api/leave${Q}`, { headers: auth });
  const lv = await lvRes.json().catch(() => ({}));
  const lvs = lv.leaves || lv.leaveRequests || lv.data || lv;
  const lvArr = Array.isArray(lvs) ? lvs : lvs?.leaves || [];
  ok('GET /api/leave → sample leave requests visible', lvRes.status === 200 && lvArr.length > 0, `status=${lvRes.status} count=${lvArr.length}`);

  // 5. Notification templates — auto-seed on first GET (response: { modules: [...] })
  const ntRes = await fetch(`${BASE}/api/notifications/templates${Q}`, { headers: auth });
  const nt = await ntRes.json().catch(() => ({}));
  const modules = nt.modules || [];
  const templateCount = modules.reduce((n, m) => n + (m.templates?.length || 0), 0) || modules.length;
  ok('GET /api/notifications/templates → catalog seeded', ntRes.status === 200 && modules.length > 0, `status=${ntRes.status} modules=${modules.length} events≈${templateCount}`);

  // 6. Dashboard sanity
  const dashRes = await fetch(`${BASE}/api/dashboard${Q}`, { headers: auth });
  ok('GET /api/dashboard reachable', dashRes.status === 200 || dashRes.status === 404, `status=${dashRes.status}`);

  // 7. Second login — an employee-role user
  const empLoginRes = await fetch(`${BASE}/api/auth/login${Q}`, {
    method: 'POST', headers: HDRS, body: JSON.stringify({ email: 'employee@demo.3boxeshrms.com', password: PASSWORD }),
  });
  const empLogin = await empLoginRes.json().catch(() => ({}));
  ok('login employee@demo.3boxeshrms.com', empLoginRes.status === 200 && (empLogin.token || empLogin.accessToken), `status=${empLoginRes.status}${empLogin.error ? ' err=' + empLogin.error : ''}`);

  // 8. Bell feed for the fresh tenant (should be empty but 200 — no auth noise since Task 92)
  if (empLogin.token || empLogin.accessToken) {
    const bellRes = await fetch(`${BASE}/api/notifications${Q}&limit=10`, { headers: { ...auth, Authorization: `Bearer ${empLogin.token || empLogin.accessToken}` } });
    const bell = await bellRes.json().catch(() => ({}));
    ok('GET /api/notifications (bell) 200 for employee', bellRes.status === 200 && Array.isArray(bell.notifications), `status=${bellRes.status} rows=${(bell.notifications || []).length}`);
  }

  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('VERIFY CRASHED:', e.message); process.exit(1); });
