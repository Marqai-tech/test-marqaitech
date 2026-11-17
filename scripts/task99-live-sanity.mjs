// Task 99 — final LIVE sanity probe: super-admin unscoped employees (dummy-data P0) still clean at 78e86b6f?
const BASE = 'https://3boxeshrms.com';
const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
}).then((r) => r.json());
const token = login.token || login.accessToken;
console.log('login:', token ? 'OK' : 'FAILED ' + JSON.stringify(login).slice(0, 120));

const H = { Authorization: `Bearer ${token}` };
const emp = await fetch(BASE + '/api/employees', { headers: H }).then((r) => r.json());
const rows = emp.employees || emp.data || emp.rows || [];
const emails = rows.map((e) => e.email || '');
const dummies = emails.filter((m) => /@(technova|apexservices|globaldynamics|innovatech|primehealth|sparklight|stellarent|example)\./i.test(m) || /veeha/i.test(m));
console.log('unscoped employees total:', emp.pagination?.total ?? rows.length, '| dummy emails present:', dummies.length ? dummies.join(',') : 'NONE');
console.log('first 3:', rows.slice(0, 3).map((e) => `${e.firstName || ''} ${e.lastName || ''} <${e.email || '?'}>`).join(' | '));

const dash = await fetch(BASE + '/api/super-admin/dashboard', { headers: H }).then((r) => r.json());
const d = dash.data || dash;
console.log('dashboard: tenants=', d.stats?.totalTenants ?? d.totalTenants, 'employees=', d.stats?.totalEmployees ?? d.totalEmployees, 'companies=', d.stats?.totalCompanies ?? d.totalCompanies, 'scopeTenant=', d.scopeTenant || '(unscoped)');
