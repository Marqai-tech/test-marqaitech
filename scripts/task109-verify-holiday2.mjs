// Re-test A cleanly: remove approved HOLIDAY_WORK coverage, then punch → expect 403.
// Also verify the settings bypass (holidayWeekendPunchEnabled=true → 200 w/o request).
const DEMO = 'https://nexus-hrms-demo.vercel.app';
async function j(method, path, token, body) {
  const res = await fetch(DEMO + path, { method, signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = { raw: t.slice(0, 150) }; }
  return { status: res.status, data: d };
}
const log = (l, o) => console.log(l, JSON.stringify(o).slice(0, 240));
const admin = await j('POST', '/api/auth/login', null, { email: 'admin@acme-global.com', password: 'MarqAI@2026' });
const emp = await j('POST', '/api/auth/login', null, { email: 'employee.demo@3boxeshrms.com', password: 'MarqAI@2026' });
const at = admin.data.token, et = emp.data.token;
const ms = await j('GET', '/api/attendance/my-summary', et);
const empId = ms.data.employee.id; const code = ms.data.employee.employeeId;

// list all my HOLIDAY_WORK requests
const list = await j('GET', '/api/attendance/requests?requestType=HOLIDAY_WORK&status=all&employeeId=' + empId, et);
const rows = list.data.requests || list.data.data || [];
console.log('HOLIDAY_WORK requests found:', rows.length, rows.map(r => `${r.id.slice(-6)}:${r.status}`).join(','));

// reject any approved ones (admin override) so no coverage remains for 2026-10-24
for (const r of rows) {
  if (r.status === 'approved' || r.status === 'pending') {
    const rej = await j('PATCH', `/api/attendance/requests/${r.id}`, at, { action: 'reject', comments: 'Task109 retest cleanup' });
    console.log('rejected', r.id.slice(-6), rej.status, rej.data.request?.status || rej.data.status);
  }
}

// enable mobile, punch Saturday WITHOUT any approved request → expect 403 HOLIDAY_WORK_APPROVAL_REQUIRED
const rp = await j('GET', '/api/attendance/remote-permissions', at);
const row = (rp.data.employees || []).find(e => e.employeeId === code);
await j('PATCH', '/api/attendance/remote-permissions', at, { employeeId: row.id, mobileCheckInEnabled: true });
const blocked = await j('POST', '/api/attendance/punch', et, {
  employeeId: empId, action: 'breakin', date: '2026-10-24', localTime: '10:00',
  method: 'mobile', gps: { lat: 12.9716, lng: 77.5946, accuracy: 8 },
});
log('A2 holiday punch w/o approval (breakin)', { status: blocked.status, code: blocked.data.code, error: String(blocked.data.error || '').slice(0, 150) });

// settings bypass: holidayWeekendPunchEnabled=true → punch allowed WITHOUT request
await j('PATCH', '/api/attendance/remote-permissions', at, { employeeId: row.id, holidayWeekendPunchEnabled: true });
const free = await j('POST', '/api/attendance/punch', et, {
  employeeId: empId, action: 'breakout', date: '2026-10-24', localTime: '11:00',
  method: 'mobile', gps: { lat: 12.9716, lng: 77.5946, accuracy: 8 },
});
log('B2 holiday punch with settings-open toggle', { status: free.status, code: free.data.code });

// restore: both toggles off
await j('PATCH', '/api/attendance/remote-permissions', at, { employeeId: row.id, holidayWeekendPunchEnabled: false, mobileCheckInEnabled: false });
console.log('state restored: mobile + holiday toggles OFF for', code);
