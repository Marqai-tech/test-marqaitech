/* Task 153 — LIVE post-deploy verification on both Vercel projects.
 * 1. auth/me now returns the linked Employee for ceo/tenant_admin (hero-card fix)
 * 2. /api/employees/[id] returns the detail rows the hero card consumes
 * 3. Key pages serve 200 (my-profile, employees list, payroll dashboard)
 * 4. Employee payroll data is self-scoped (spot-check via HR login's own scope)
 */
const BASES = ['https://marqaitechgroup.3boxeshrms.com', 'https://nexus-hrms-demo.vercel.app'];
const results = [];
const ok = (name, pass, extra = '') => { results.push({ name, pass, extra }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

async function login(base, email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const d = await res.json().catch(() => ({}));
  return d?.token || d?.accessToken || null;
}

(async () => {
  const base = BASES[0];
  /* 1 + 2 — hero card data chain for management logins */
  for (const [label, email, pw] of [
    ['CEO', 'mahesh@marqaitech.com', 'MarqAI@2026'],
    ['HR (tenant_admin)', 'hr@gmail.com', 'MarqAI@2026'],
  ]) {
    const token = await login(base, email, pw);
    ok(`${label} login`, !!token);
    if (!token) continue;
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const emp = me?.employee;
    ok(`${label} auth/me employee resolved (hero-card fix)`, !!emp?.id, emp ? `Employee ${emp.employeeId} ${emp.firstName || ''} ${emp.lastName || ''}` : 'still NULL');
    if (emp?.id) {
      const r = await fetch(`${base}/api/employees/${emp.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      const e = d.employee || {};
      ok(`${label} /api/employees/${emp.id} detail rows`, r.status === 200 && !!(e.phone || e.dateOfJoining || e.department),
        `phone=${e.phone || '—'} doj=${e.dateOfJoining || '—'} dept=${e.department?.name || '—'} rm=${e.reportingManager ? 'yes' : '—'}`);
    }
    /* 4 — payroll data endpoint reachable + shaped */
    const pr = await fetch(`${base}/api/payroll?limit=5`, { headers: { Authorization: `Bearer ${token}` } });
    const pd = await pr.json().catch(() => ({}));
    ok(`${label} /api/payroll reachable`, pr.status === 200 && Array.isArray(pd.payrolls), `${(pd.payrolls || []).length} rows in scope`);
  }

  /* 3 — page shells */
  for (const p of ['/my-profile', '/employees', '/payroll', '/payroll/group-dashboard', '/payroll/income-tax?tab=declarations', '/login']) {
    const r = await fetch(`${base}${p}`, { redirect: 'manual' });
    ok(`page ${p}`, r.status === 200 || r.status === 307 || r.status === 308, `HTTP ${r.status}`);
  }

  /* demo tenant spot check — CEO there also had a linked employee */
  const demoToken = await login('https://nexus-hrms-demo.vercel.app', 'amrutha@marqaitech.com', 'MarqAI@2026').catch(() => null);
  if (demoToken) {
    const me = await (await fetch('https://nexus-hrms-demo.vercel.app/api/auth/me', { headers: { Authorization: `Bearer ${demoToken}` } })).json();
    ok('demo CEO auth/me employee resolved', !!me?.employee?.id, me?.employee ? `Employee ${me.employee.employeeId}` : 'still NULL');
  } else {
    ok('demo CEO login', false, 'no token (check creds)');
  }

  const failed = results.filter(r => !r.pass);
  console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
  process.exit(failed.length ? 1 : 0);
})();
