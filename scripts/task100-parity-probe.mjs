// Task 100 — Update-parity probe: LIVE vs OLD test link (nexus-hrms-mu) vs NEW test link (nexus-hrms-demo)
// Markers:
//   M1 super-admin login                      (baseline)
//   M2 unscoped /api/companies dummy leak     (Task 98 golden rule — LIVE: 0 dummies)
//   M3 unscoped /api/employees dummy leak     (Task 98-d golden rule — LIVE: 10 real / 0 dummies)
//   M4 /api/super-admin/change-requests       (Task 95 change-control — LIVE: working list)
//   M5 unscoped /api/super-admin/dashboard    (scope hygiene)
//   M6 tenant-admin login + core APIs         (baseline tenant parity)
//   M7 tenant attendance workflow-config API  (late feature marker)
const DUMMY_RE = /technova|apexservices|globaldynamics|innovatech|primehealth|sparklight|stellarent|veeha/i;

async function j(r) { try { return await r.json(); } catch { return null; } }

async function superAdminBlock(name, base) {
  console.log(`\n■■■ SUPER ADMIN @ ${name} (${base}) ■■■`);
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
  });
  const L = await j(login);
  if (!login.ok || !(L && (L.token || L.accessToken))) {
    console.log(`  M1 login: FAIL (HTTP ${login.status}) ${(JSON.stringify(L) || '').slice(0, 100)}`);
    return;
  }
  console.log(`  M1 login: OK`);
  const H = { Authorization: `Bearer ${L.token || L.accessToken}` };

  const comp = await fetch(base + '/api/companies', { headers: H });
  const C = await j(comp);
  const crows = C?.companies || C?.data || C?.rows || (Array.isArray(C) ? C : []);
  const cdummy = crows.filter((c) => DUMMY_RE.test(c.name || ''));
  console.log(`  M2 unscoped companies: HTTP ${comp.status} | total=${C?.pagination?.total ?? crows.length} | dummy names=${cdummy.length}${cdummy.length ? ' → ' + cdummy.slice(0, 4).map((c) => c.name).join(', ') : ''}`);

  const emp = await fetch(base + '/api/employees', { headers: H });
  const E = await j(emp);
  const erows = E?.employees || E?.data || E?.rows || (Array.isArray(E) ? E : []);
  const edummy = erows.filter((e) => DUMMY_RE.test((e.email || '') + (e.firstName || '') + (e.lastName || '')));
  console.log(`  M3 unscoped employees: HTTP ${emp.status} | total=${E?.pagination?.total ?? erows.length} | dummy rows=${edummy.length}${edummy.length ? ' → e.g. ' + edummy.slice(0, 3).map((e) => e.email || e.firstName).join(', ') : ''}`);

  const cr = await fetch(base + '/api/super-admin/change-requests', { headers: H });
  const CR = await j(cr);
  const crows2 = CR?.requests || CR?.data || (Array.isArray(CR) ? CR : []);
  console.log(`  M4 change-requests API: HTTP ${cr.status} | count=${Array.isArray(crows2) ? crows2.length : '?'} ${cr.status !== 200 ? '(Task-95 module MISSING)' : ''}`);

  const dash = await fetch(base + '/api/super-admin/dashboard', { headers: H });
  const D = await j(dash);
  const dd = D?.data || D || {};
  const st = dd.stats || dd;
  console.log(`  M5 dashboard: HTTP ${dash.status} | tenants=${st.totalTenants ?? '?'} employees=${st.totalEmployees ?? '?'} companies=${st.totalCompanies ?? '?'} | scope=${dd.scopeTenant || 'unscoped'}`);
}

async function tenantAdminBlock(name, base, email) {
  console.log(`\n■■■ TENANT ADMIN @ ${name} (${base}) ■■■`);
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'MarqAI@2026' }),
  });
  const L = await j(login);
  if (!login.ok || !(L && (L.token || L.accessToken))) {
    console.log(`  M6 login (${email}): FAIL (HTTP ${login.status}) ${(JSON.stringify(L) || '').slice(0, 100)}`);
    return;
  }
  console.log(`  M6 login (${email}): OK`);
  const H = { Authorization: `Bearer ${L.token || L.accessToken}` };
  const apis = ['dashboard', 'employees', 'attendance', 'leaves', 'payroll', 'notifications', 'tickets', 'announcements'];
  let ok = 0;
  for (const a of apis) {
    const r = await fetch(`${base}/api/${a}`, { headers: H });
    if (r.ok) ok++; else console.log(`    /api/${a} → HTTP ${r.status}`);
  }
  console.log(`  M6 core APIs: ${ok}/${apis.length} OK`);
  const wf = await fetch(`${base}/api/attendance/workflow-config`, { headers: H });
  console.log(`  M7 attendance workflow-config (Task-79/83 feature): HTTP ${wf.status} ${wf.ok ? '' : '(feature MISSING on this build)'}`);
}

await superAdminBlock('LIVE production', 'https://3boxeshrms.com');
await superAdminBlock('OLD test link (frozen)', 'https://nexus-hrms-mu.vercel.app');
await superAdminBlock('NEW test link (current)', 'https://nexus-hrms-demo.vercel.app');

await tenantAdminBlock('LIVE production tenant', 'https://marqaitechgroup.3boxeshrms.com', 'hr@marqaitech.com');
await tenantAdminBlock('OLD test link', 'https://nexus-hrms-mu.vercel.app', 'admin@acme-global.com');
await tenantAdminBlock('NEW test link', 'https://nexus-hrms-demo.vercel.app', 'admin@acme-global.com');
