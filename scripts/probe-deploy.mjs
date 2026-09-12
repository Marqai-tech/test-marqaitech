const BASE = 'https://nexus-hrms-mu.vercel.app';
async function main() {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' }),
  });
  const d = await login.json();
  if (!d.token) { console.log('LOGIN FAILED', login.status, JSON.stringify(d).slice(0, 200)); return; }
  console.log('login ok');

  // Probe: try to apply for a past date. Old build → 201 (accepted) or some other error;
  // new build → 400 "Leave requests cannot be submitted for past dates..."
  const emps = await (await fetch(BASE + '/api/employees?limit=1', { headers: { Authorization: `Bearer ${d.token}` } })).json();
  const emp = emps.employees?.[0];
  if (!emp) { console.log('NO EMPLOYEE'); return; }
  const types = await (await fetch(BASE + `/api/leave-types?companyId=${emp.companyId}`, { headers: { Authorization: `Bearer ${d.token}` } })).json();
  const typeId = types.data?.[0]?.id;
  if (!typeId) { console.log('NO TYPE'); return; }
  const past = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0];
  const r = await fetch(BASE + '/api/leave', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${d.token}` },
    body: JSON.stringify({ employeeId: emp.id, leaveTypeId: typeId, startDate: past, endDate: past, reason: 'deploy probe past date' }),
  });
  const body = await r.json().catch(() => ({}));
  console.log('past-date probe:', r.status, JSON.stringify(body).slice(0, 200));
  console.log(/past dates/i.test(body.error || '') ? 'NEW_DEPLOY_LIVE' : 'OLD_DEPLOY_STILL_LIVE');
}
main().catch(e => console.error('ERR', e.message));
