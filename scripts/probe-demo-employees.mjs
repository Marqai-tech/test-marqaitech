const DEMO = { url: 'https://nexus-hrms-mu.vercel.app', email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' };
const r = await fetch(`${DEMO.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: DEMO.email, password: DEMO.password }) });
const d = await r.json();
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${d.token}` };
const er = await fetch(`${DEMO.url}/api/employees?limit=100`, { headers: H });
const ed = await er.json();
const list = ed.employees || ed.data || [];
console.log('total employees:', list.length, '| top-level keys:', Object.keys(ed).join(','));
const withUser = list.filter(e => e.userId);
console.log('with userId:', withUser.length);
console.log('statuses:', [...new Set(list.map(e => e.employeeStatus || e.status).filter(Boolean))].join(', '));
const sample = withUser[0] || list[0];
if (sample) console.log('sample:', JSON.stringify({ id: sample.id, name: `${sample.firstName} ${sample.lastName}`, code: sample.employeeId, status: sample.employeeStatus || sample.status, hasUser: !!sample.userId }));
// existing probation reviews
const prr = await fetch(`${DEMO.url}/api/employees/probation?limit=10`, { headers: H });
const prd = await prr.json();
console.log('existing probation reviews:', (prd.probations||[]).length, (prd.probations||[]).slice(0,3).map(p => `${p.employeeName}:${p.status}:${p.workflowStage}`).join(' | '));
