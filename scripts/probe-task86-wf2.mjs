const LIVE = 'https://marqaitechgroup.3boxeshrms.com';
const login = await fetch(LIVE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }) });
const lb = await login.json();
const bearer = lb?.token || '';
const wf = await fetch(LIVE + '/api/employees/workflow-config?type=update_profile', { headers: { Authorization: `Bearer ${bearer}` } }).then(r => r.json());
console.log('configs:', JSON.stringify(wf.configs, null, 1).slice(0, 1200));
