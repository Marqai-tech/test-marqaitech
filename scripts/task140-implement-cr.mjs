// Task 140 — mark CR implemented (after deploy + live E2E 15/15).
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvn8h6jx000008kzr9ncd8zi';
const DEPLOY_COMMIT = '3dbbdf1a';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const r = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    deployCommit: DEPLOY_COMMIT,
    implementationNotes:
      'DEPLOYED (commit ' + DEPLOY_COMMIT + ', both Vercel projects success) + LIVE E2E 15/15 PASS (scripts/task140-postdeploy-verify.cjs). ' +
      'Fix: Employee List export now honours the checkbox selection — ticking one/many employees and clicking Export downloads ONLY those employees (employees-selected-<date>.csv, toast "CSV exported — N selected employee(s)"); with no selection the previous filtered-list export is unchanged. ' +
      'Code: GET /api/employees accepts ?ids= (deduped, capped 500) → where {id:{in:ids}} with list filters bypassed and ALL scoping preserved (company/tenant/self/management); handleExportCSV sends ids when selectedIds non-empty, else the legacy filter params. ' +
      'E2E evidence: demo 63-employee baseline → ids=<one> returns exactly 1 row (Mini mike); ids=<two> returns exactly 2; contradictory search/status filters ignored in ids-mode; garbage ids → 0 rows; duplicates dedupe; no-ids regression intact; employee-role caller CANNOT export a foreign employee via ids (0 rows); marqaitechgroup 13-employee baseline → single selection returns exactly 1 row (Shardh amma), two selections return exactly 2. Tests pre-push: task140-contract-check 15/15, scoped tsc vs stash baseline ZERO new errors. Web-only — version stays 1.6.5 (32), no APK needed.',
  }),
});
console.log('implement:', r.status, await r.text().then(t => t.slice(0, 200)));

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((x) => x.status === 'pending').length} pending` : ld);
