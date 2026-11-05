/**
 * Task 169 — E2E supplement: employee-scope branch with a real employee login
 * (manoj@marqaitech.com, MARQ010, role=employee, no reportees).
 * USAGE: set -a; source .env.production.local; set +a; node scripts/task169-e2e2.cjs
 */
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
}

(async () => {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: T, body: JSON.stringify({ email: 'manoj@marqaitech.com', password: 'MarqAI@2026' }) });
  const j = await r.json().catch(() => null);
  const tok = j?.token;
  ok('employee login (manoj, role=employee)', r.ok && !!tok);
  if (!tok) process.exit(1);
  const H = { Authorization: `Bearer ${tok}`, ...T };

  const r2 = await fetch(`${BASE}/api/attendance/my-roster?month=2026-10`, { headers: H });
  const j2 = await r2.json().catch(() => null);
  ok('my-roster 200 (employee)', r2.status === 200 && !!j2?.people);
  ok('employee sees EXACTLY own roster (people=1, self)', j2?.people?.length === 1 && j2?.people?.[0]?.relationship === 'self', `people=${JSON.stringify(j2?.people || []).slice(0, 120)}`);
  ok('employee code = MARQ010', j2?.people?.[0]?.employeeCode === 'MARQ010', j2?.people?.[0]?.employeeCode);
  ok('viewer.isManager=false for plain employee', j2?.viewer?.isManager === false);
  ok('viewer.isAdmin=false for plain employee', j2?.viewer?.isAdmin === false);
  ok('employee calendar = 1 row x 31 days', (j2?.calendar?.length || 0) === 1 && Object.keys(j2?.calendar?.[0]?.days || {}).length === 31);

  // negative: another employee's roster → 403 (use hr's employee id from admin recon)
  const hr = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }) });
  const hrj = await hr.json().catch(() => null);
  const adminView = await fetch(`${BASE}/api/attendance/my-roster?month=2026-10`, { headers: { Authorization: `Bearer ${hrj?.token}`, ...T } });
  const avj = await adminView.json().catch(() => null);
  const stranger = (avj?.people || []).find(p => p.employeeCode !== 'MARQ010');
  const r3 = await fetch(`${BASE}/api/attendance/my-roster?month=2026-10&employeeId=${stranger?.employeeId}`, { headers: H });
  ok('employee 403 on another employee roster', r3.status === 403, `status=${r3.status} target=${stranger?.employeeCode}`);

  // page render for employee too (nav + shell)
  const page = await fetch(`${BASE}/attendance/my-roster`, { headers: { Cookie: `tb_token=${tok}` } });
  ok('GET /attendance/my-roster renders for employee (200)', page.status === 200);

  console.log(`\n=== task169 E2E supplement: ${pass}/${pass + fail} PASS, ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('fatal:', e); process.exit(1); });
