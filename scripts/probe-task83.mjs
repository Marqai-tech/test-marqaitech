/**
 * Task 83 probe — read-only LIVE investigation
 * 1. Attendance dashboard logs: how many attendance rows exist per recent date?
 * 2. Muster roll: simulate its API call (employeeIds/startDate/endDate/limit=10000)
 * 3. Biometric punch-log: what does the API return?
 */
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const EMAIL = 'hr@marqaitech.com';
const PASSWORD = 'MarqAI@2026';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data };
}

async function main() {
  // 1. Login
  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (login.status !== 200) { console.log('LOGIN FAILED', login.status, JSON.stringify(login.data).slice(0, 300)); return; }
  const token = login.data.token;
  console.log('LOGIN OK — role:', login.data.user?.role, '| dataScope:', login.data.user?.dataScope);
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-tenant-slug': 'marqaitechgroup' };

  // 2. Total attendance rows
  const total = await api('/api/attendance?limit=1', { headers: H });
  console.log('\n=== /api/attendance?limit=1 → total:', total.data.pagination?.total, '| status', total.status);

  // 3. Per-day counts for recent dates (Oct 2026)
  for (const d of ['2026-10-01','2026-10-03','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10']) {
    const r = await api(`/api/attendance?date=${d}&limit=100`, { headers: H });
    const rows = r.data.attendance || [];
    const summary = rows.slice(0, 3).map(a => `${a.employee?.employeeId || a.employeeId || '?'}:${a.status}:in=${a.checkIn ? new Date(a.checkIn).toISOString().slice(11,16) : '-'}:out=${a.checkOut ? new Date(a.checkOut).toISOString().slice(11,16) : '-'}:date=${a.date}`);
    console.log(`  date=${d} → status ${r.status}, rows=${rows.length}`, rows.length ? 'e.g. ' + summary.join(' | ') : '');
  }

  // 4. Muster-roll style call (what the page actually sends)
  const emps = await api('/api/employees?limit=500&status=active', { headers: H });
  const empRows = emps.data.employees || [];
  console.log('\n=== employees(active):', empRows.length);
  const ids = empRows.map(e => e.id).join(',');
  const now = new Date();
  const startDate = new Date(now.getFullYear(), 9, 1).toISOString();
  const endDate = new Date(now.getFullYear(), 10, 0).toISOString();
  const mr = await api(`/api/attendance?employeeIds=${ids}&startDate=${startDate}&endDate=${endDate}&limit=10000`, { headers: H });
  const mrRows = mr.data.attendance || [];
  console.log(`=== MUSTER-ROLL CALL → status ${mr.status}, rows=${mrRows.length}, pagination=`, JSON.stringify(mr.data.pagination));
  // how the page maps them
  const byDay = {};
  mrRows.slice(0, 200).forEach(r => {
    const day = new Date(r.date).getDate();
    byDay[day] = (byDay[day] || 0) + 1;
  });
  console.log('  mapped day-count (browser-local getDate(), IST):', JSON.stringify(byDay));
  console.log('  sample record dates:', mrRows.slice(0, 5).map(r => r.date));

  // 5. Biometric punch log
  const pl = await api('/api/attendance/biometric/punch-log?limit=200', { headers: H });
  console.log('\n=== /api/attendance/biometric/punch-log → status', pl.status, 'total:', pl.data.pagination?.total, 'returned:', (pl.data.punches || []).length);
  (pl.data.punches || []).slice(0, 5).forEach(p => {
    console.log(`   ${p.punchTime} ${p.punchType} emp=${p.employee?.employeeId || 'unmatched'} device=${p.device?.name || '?'}`);
  });
  // does the punch-log API accept a punchType filter already?
  const plType = await api('/api/attendance/biometric/punch-log?limit=10&punchType=check_in', { headers: H });
  const inRows = (plType.data.punches || []).filter(p => p.punchType === 'check_in');
  console.log('  punchType=check_in filter → returned', (plType.data.punches || []).length, 'all check_in?', inRows.length === (plType.data.punches || []).length);

  // 6. biometricPunch total vs attendance-linked
  const devices = await api('/api/attendance/biometric/devices', { headers: H });
  console.log('\n=== devices:', (devices.data.devices || []).length, (devices.data.devices || []).map(d => `${d.name}(${d._count?.punches ?? 0} punches)`).join(', '));
}

main().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
