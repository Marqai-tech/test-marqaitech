// Task 126 — debug /payroll/validations: probe every endpoint the page uses.
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(`${TENANT}/api/auth/login`, {
  method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }),
});
const j = await login.json();
const token = j.token;
console.log('login:', login.status, token ? 'ok' : JSON.stringify(j).slice(0, 200));
const H = { ...T, Authorization: `Bearer ${token}` };

const emps = await (await fetch(`${TENANT}/api/employees?limit=5`, { headers: H })).json();
const companyId = (emps.employees || emps.data || [])[0]?.companyId;
console.log('companyId:', companyId);

// 1. GET validations
let r = await fetch(`${TENANT}/api/payroll/validations?companyId=${companyId}`, { headers: H });
console.log('\nGET /api/payroll/validations:', r.status, (await r.text()).slice(0, 300));

// 2. GET companies (page loads this first)
r = await fetch(`${TENANT}/api/companies?limit=100`, { headers: H });
console.log('\nGET /api/companies:', r.status, (await r.text()).slice(0, 200));

// 3. POST run validation
r = await fetch(`${TENANT}/api/payroll/validations`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ companyId }),
});
console.log('\nPOST /api/payroll/validations:', r.status, (await r.text()).slice(0, 500));
