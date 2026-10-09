// Probe LIVE tenant export-filter behavior end-to-end (read-only).
// Simulates exactly what the fixed employees page sends for each filter.
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const EMAIL = process.env.LIVE_EMAIL || 'hr@marqaitech.com';
const PASS = 'MarqAI@2026';

let bearer = '';
const api = async (path) => {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: res.status, body };
};

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const lb = await login.json();
bearer = lb?.token || lb?.data?.token || '';
console.log('login:', login.status, bearer ? 'token OK' : 'NO TOKEN');
if (!bearer) process.exit(1);

// 1) Everything (export mode)
const all = await api('/api/employees?limit=500&export=1');
const rows = all.body?.employees || [];
const dist = {};
for (const r of rows) dist[r.status] = (dist[r.status] || 0) + 1;
console.log('\nexport=1 no filter →', all.status, 'rows:', rows.length, 'dist:', JSON.stringify(dist));

// 2) Each status filter through EXPORT path
for (const st of ['active', 'inactive', 'on_leave', 'terminated', 'resigned']) {
  const r = await api(`/api/employees?limit=500&export=1&status=${st}`);
  const list = r.body?.employees || [];
  console.log(`export=1&status=${st} →`, r.status, 'rows:', list.length,
    list.length ? `statuses: ${[...new Set(list.map(x => x.status))].join(',')}` : '');
}

// 3) Same via NORMAL list path (what the on-screen list shows)
for (const st of ['inactive', 'terminated', 'resigned']) {
  const r = await api(`/api/employees?limit=100&status=${st}`);
  const list = r.body?.employees || [];
  console.log(`list&status=${st} →`, r.status, 'rows:', list.length);
}

// 4) Search + department combined (spot-check the other two filters)
const depts = await api('/api/departments?limit=100');
const dlist = depts.body?.data || depts.body?.departments || [];
console.log('\ndepartments:', dlist.length, dlist.slice(0, 5).map(d => `${d.id}:${d.name}`).join(' | '));
if (dlist[0]) {
  const df = await api(`/api/employees?limit=500&export=1&departmentId=${dlist[0].id}`);
  console.log(`export=1&departmentId=${dlist[0].name} →`, df.status, 'rows:', (df.body?.employees || []).length);
  const sf = await api('/api/employees?limit=500&export=1&search=a');
  console.log('export=1&search=a →', sf.status, 'rows:', (sf.body?.employees || []).length);
}

// 5) non-export limit check: UI export sends limit=500; confirm no silent cap issue
console.log('\npagination of unfiltered export:', JSON.stringify(all.body?.pagination));
