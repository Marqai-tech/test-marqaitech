// Probe workflow configs on LIVE + test inbox API and PATCH /api/users/profile
import { neon } from '@neondatabase/serverless';
const PLATFORM_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require';
const LIVE = 'https://marqaitechgroup.3boxeshrms.com';

const platform = neon(PLATFORM_CS);
const t = await platform`SELECT td."connectionString" AS cs FROM "Tenant" t JOIN "TenantDatabase" td ON td."tenantId" = t.id WHERE t.slug='marqaitechgroup'`;
const db = neon(t[0].cs);
const cfgs = await db`SELECT id, name, "workflowType", "isActive", config, "updatedAt" FROM "EmployeeWorkflowConfig" ORDER BY "updatedAt" DESC LIMIT 10`;
console.log('ALL EmployeeWorkflowConfig rows on LIVE:', JSON.stringify(cfgs, null, 1));

// Login as tenant admin
const login = await fetch(LIVE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }) });
const lb = await login.json();
const bearer = lb?.token || '';
console.log('login:', login.status, bearer ? 'OK' : 'FAIL');
const api = async (path, opts = {}) => {
  const res = await fetch(LIVE + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, ...(opts.headers || {}) } });
  const text = await res.text(); let b; try { b = JSON.parse(text); } catch { b = text.slice(0, 200); }
  return { status: res.status, body: b };
};

// 1. Inbox as hr@marqaitech.com (tier-1 approver of the stuck request)
const inbox = await api('/api/employees/update-requests?scope=inbox');
console.log('\ninbox:', inbox.status, 'requests:', (inbox.body?.requests || []).length, JSON.stringify((inbox.body?.requests || []).map(r => ({ f: r.fieldLabel, s: r.status }))));

// 2. workflow-config API as seen by the app
const wf = await api('/api/employees/workflow-config?type=update_profile');
console.log('workflow-config API:', wf.status, JSON.stringify(wf.body).slice(0, 300));

// 3. PATCH /api/users/profile — reproduce the "edit info" error (safe no-op: set city to its current value)
const prof = await api('/api/users/profile');
const emp = prof.body?.employee || {};
console.log('\nGET profile:', prof.status, '| employee id:', emp.id, '| city:', emp.city);
const patch = await api('/api/users/profile', { method: 'PATCH', body: JSON.stringify({ city: emp.city || 'Bengaluru', phone: emp.phone || '', firstName: emp.firstName || '', lastName: emp.lastName || '', name: prof.body?.name || '' }) });
console.log('PATCH profile:', patch.status, JSON.stringify(patch.body).slice(0, 300));
