/** Task 83 probe 2 — punch-log API + self view + muster roll month mapping */
const BASE = 'https://marqaitechgroup.3boxeshrms.com';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data };
}

async function main() {
  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }),
  });
  const token = login.data.token;
  console.log('LOGIN OK — user.employee:', JSON.stringify(login.data.user?.employee || null));
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-tenant-slug': 'marqaitechgroup' };

  // 1. HRMS punch-log API (used by /attendance/punch-log page)
  const today = new Date();
  const thirtyAgo = new Date(today.getTime() - 30 * 86400000);
  const from = thirtyAgo.toISOString().split('T')[0];
  const to = today.toISOString().split('T')[0];
  const pl = await api(`/api/attendance/punch-log?from=${from}&to=${to}&limit=1000`, { headers: H });
  console.log(`\n=== /api/attendance/punch-log?from=${from}&to=${to} → status ${pl.status}`);
  console.log('  events:', (pl.data.events || []).length, 'days:', (pl.data.days || []).length, 'summary:', JSON.stringify(pl.data.summary || null));
  (pl.data.events || []).slice(0, 3).forEach(e => console.log('   ev:', e.date, e.type, e.employeeCode, e.employeeName));
  (pl.data.days || []).slice(0, 3).forEach(d => console.log('   day:', d.date, 'in=', d.checkIn, 'out=', d.checkOut, d.employeeCode));
  if (pl.status !== 200) console.log('  ERROR:', JSON.stringify(pl.data).slice(0, 400));

  // 2. Self view: MARQ001 attendance
  const emps = await api('/api/employees?limit=500&status=active', { headers: H });
  const me = (emps.data.employees || []).find(e => e.employeeId === 'MARQ001');
  console.log('\n=== MARQ001 id:', me?.id);
  if (me) {
    const self = await api(`/api/attendance?employeeId=${me.id}&limit=100`, { headers: H });
    console.log('  self attendance rows:', (self.data.attendance || []).length, 'of total', self.data.pagination?.total);
    (self.data.attendance || []).slice(0, 3).forEach(a => console.log('   ', a.date, a.status, a.checkIn));
  }

  // 3. Employees include department? (for biometric filters)
  console.log('\n=== employee sample fields:', me ? Object.keys(me).filter(k => /dept|designation/i.test(k)).join(',') || 'NONE' : '-');
  if (me?.department) console.log('  department:', JSON.stringify(me.department));
}
main().catch(e => { console.error(e); process.exit(1); });
