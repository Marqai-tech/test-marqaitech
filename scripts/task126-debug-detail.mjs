// Task 126 — test the validations [id] endpoint on the latest records.
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(`${TENANT}/api/auth/login`, {
  method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const emps = await (await fetch(`${TENANT}/api/employees?limit=5`, { headers: H })).json();
const companyId = (emps.employees || emps.data || [])[0]?.companyId;

const list = await (await fetch(`${TENANT}/api/payroll/validations?companyId=${companyId}`, { headers: H })).json();
const rows = list.data || [];
console.log('list rows:', rows.length);
for (const r of rows.slice(0, 3)) {
  console.log(`\nrow ${r.id} created ${r.createdAt}`);
  console.log('  list row errors type:', typeof r.errors, '| warnings type:', typeof r.warnings);
  const det = await fetch(`${TENANT}/api/payroll/validations/${r.id}`, { headers: H });
  const dj = await det.json().catch(() => ({}));
  console.log('  detail:', det.status, dj?.error || '');
  if (dj?.data) {
    console.log('  detail errors type:', typeof dj.data.errors, '| value:', JSON.stringify(dj.data.errors).slice(0, 120));
    console.log('  detail warnings type:', typeof dj.data.warnings);
  }
}
