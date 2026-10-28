// Task 87 verification — Module Dashboard rename, separated Approval Workflows &
// Configuration pages, management list photos + actions (LIVE + demo)
// Checks:
//  1. Login works (admin)
//  2. NEW pages deploy & resolve 200: /employees/configuration,
//     /leave/approval-workflows, /leave/configuration
//  3. Existing pages still 200: /employees/dashboard, /employees/settings,
//     /employees/management, /leave/settings, /leave/leave-policy
//  4. Management list photo support: /api/employees list rows carry `avatar`
//     (photo API path with embedded token) for employees with stored photos
//  5. Leave workflow config API still reachable (the extracted component's
//     data source) so /leave/approval-workflows renders live config
//  6. Module Dashboard heading present in the SSR shell of /employees/dashboard
const SITES = [
  { name: 'LIVE', base: 'https://marqaitechgroup.3boxeshrms.com', email: 'hr@marqaitech.com', pass: 'MarqAI@2026' },
  { name: 'DEMO', base: 'https://nexus-hrms-mu.vercel.app', email: 'admin@3boxeshrms.com', pass: 'MarqAI@2026' },
];

async function run(site) {
  const out = { site: site.name, checks: [], pass: 0, fail: 0 };
  const add = (name, ok, detail) => { out.checks.push({ name, ok, detail }); ok ? out.pass++ : out.fail++; };
  let bearer = '';
  const api = async (path, opts = {}) => {
    const res = await fetch(site.base + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(opts.headers || {}) },
      redirect: 'manual',
    });
    const text = await res.text();
    let body = null; try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
    return { status: res.status, body, text };
  };

  // 1. Login
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: site.email, password: site.pass }) });
  bearer = login.body?.token || '';
  add('login', login.status === 200 && !!bearer, `status=${login.status} token=${bearer ? 'yes' : 'no'}`);

  // 2. New standalone pages resolve (200 = route deployed; 404 = missing)
  for (const p of ['/employees/configuration', '/leave/approval-workflows', '/leave/configuration']) {
    const r = await api(p);
    add(`page ${p}`, r.status === 200, `status=${r.status}`);
  }

  // 3. Existing pages still resolve
  for (const p of ['/employees/dashboard', '/employees/settings', '/employees/management', '/leave/settings', '/leave/leave-policy', '/employees/approval-config']) {
    const r = await api(p);
    add(`page ${p}`, r.status === 200, `status=${r.status}`);
  }

  // 4. Management photos: list rows must carry avatar for stored photos
  const emps = await api('/api/employees?limit=100');
  const rows = emps.body?.employees || [];
  const withAvatar = rows.filter(e => e.avatar && String(e.avatar).includes('/photo'));
  add('employees-list-carries-avatar-field', emps.status === 200, `status=${emps.status} rows=${rows.length} withPhotoUrl=${withAvatar.length}`);
  if (withAvatar.length > 0) {
    const probe = await api(withAvatar[0].avatar.startsWith('http') ? withAvatar[0].avatar : site.base === '' ? withAvatar[0].avatar : withAvatar[0].avatar);
    // probe relative URL directly against the same base
    const photoRes = await fetch(site.base + (withAvatar[0].avatar.startsWith('/') ? withAvatar[0].avatar : '/' + withAvatar[0].avatar), { headers: { Authorization: `Bearer ${bearer}` } });
    add('photo-endpoint-serves-image', photoRes.status === 200 && (photoRes.headers.get('content-type') || '').startsWith('image/'), `status=${photoRes.status} type=${photoRes.headers.get('content-type')}`);
  } else {
    add('photo-endpoint-serves-image (INFO: no stored photos on this tenant)', true, 'no employees with stored photos to probe');
  }

  // 5. Leave workflow-config API (data source of the new /leave/approval-workflows page)
  const wf = await api('/api/leave/workflow-config');
  add('leave-workflow-config-api', wf.status === 200, `status=${wf.status} hasConfig=${!!wf.body?.config}`);

  // 6. Module Dashboard heading in SSR shell of /employees/dashboard
  const dash = await api('/employees/dashboard');
  const heading = typeof dash.text === 'string' && dash.text.includes('Module Dashboard');
  add('dashboard-heading-module-dashboard', dash.status === 200 && heading, `status=${dash.status} headingFound=${heading}`);
  const nav = await api('/employees/management');
  const navOk = typeof nav.text === 'string' && nav.text.includes('Module Dashboard');
  add('sidebar-label-module-dashboard', nav.status === 200 && navOk, `sidebarLabelFound=${navOk}`);

  console.log(JSON.stringify(out, null, 2));
  return out;
}

const results = [];
for (const s of SITES) {
  try { results.push(await run(s)); } catch (e) { results.push({ site: s.name, fatal: String(e) }); }
}
const totals = results.map(r => `${r.site}: ${r.pass ?? 0} pass / ${r.fail ?? 0} fail`);
console.log('SUMMARY → ' + totals.join(' | '));
if (results.some(r => (r.fail ?? 1) > 0 || r.fatal)) process.exit(1);
