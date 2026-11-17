// Focused HOLIDAY/weekend gate test: employee WITH mobile permission.
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
const empId = ms.data.employee.id;
const empIdCode = ms.data.employee.employeeId;
console.log('employee:', empIdCode, ms.data.employee.firstName);

// enable mobile for Priya
const rp = await j('GET', '/api/attendance/remote-permissions', at);
const row = (rp.data.employees || []).find(e => e.employeeId === empIdCode);
await j('PATCH', '/api/attendance/remote-permissions', at, { employeeId: row.id, mobileCheckInEnabled: true });
console.log('mobile enabled for', empIdCode);

// Saturday punch WITHOUT holiday approval → expect 403 HOLIDAY_WORK_APPROVAL_REQUIRED
const blocked = await j('POST', '/api/attendance/punch', et, {
  employeeId: empId, action: 'checkin', date: '2026-10-24', localTime: '09:00',
  method: 'mobile', gps: { lat: 12.9716, lng: 77.5946, accuracy: 8 },
});
log('A weekend punch w/o approval', { status: blocked.status, code: blocked.data.code, error: String(blocked.data.error || '').slice(0, 160) });

// create + approve HOLIDAY_WORK (L1, L2)
const req = await j('POST', '/api/attendance/requests', et, {
  requestType: 'HOLIDAY_WORK', startDate: '2026-10-24', endDate: '2026-10-24',
  expectedHours: 4, reason: 'Task109: gate unlock verification' });
const reqId = req.data.request?.id || req.data.id;
const a1 = await j('PATCH', `/api/attendance/requests/${reqId}`, at, { action: 'approve' });
const a2 = await j('PATCH', `/api/attendance/requests/${reqId}`, at, { action: 'approve' });
log('B HOLIDAY_WORK approved', { id: reqId, l1: a1.status, l2: a2.status, final: a2.data.request?.status });

// punch again → expect 200
const ok = await j('POST', '/api/attendance/punch', et, {
  employeeId: empId, action: 'checkin', date: '2026-10-24', localTime: '09:30',
  method: 'mobile', gps: { lat: 12.9716, lng: 77.5946, accuracy: 8 },
});
log('C weekend punch WITH approval', { status: ok.status, code: ok.data.code, notes: String(ok.data.attendance?.notes || ok.data.notes || '').slice(0, 130) });
const co = await j('POST', '/api/attendance/punch', et, {
  employeeId: empId, action: 'checkout', date: '2026-10-24', localTime: '13:30',
  method: 'mobile', gps: { lat: 12.9716, lng: 77.5946, accuracy: 8 },
});
log('D checkout', { status: co.status });

// disable mobile again (restore state)
await j('PATCH', '/api/attendance/remote-permissions', at, { employeeId: row.id, mobileCheckInEnabled: false });
console.log('mobile disabled again (state restored)');

// WEEKDAY sanity: mobile enabled → weekday punch should NOT hit the holiday gate (tested via 403 vs 200 differences; do a real weekday punch then leave it — it's demo data)
await j('PATCH', '/api/attendance/remote-permissions', at, { employeeId: row.id, mobileCheckInEnabled: true });
const weekday = await j('POST', '/api/attendance/punch', et, {
  employeeId: empId, action: 'checkin', date: '2026-10-20', localTime: '09:55',
  method: 'mobile', gps: { lat: 12.9750, lng: 77.5990, accuracy: 12 },
});
log('E weekday punch (no holiday gate)', { status: weekday.status, code: weekday.data.code, notes: String(weekday.data.attendance?.notes || weekday.data.notes || '').slice(0, 110) });
await j('PATCH', '/api/attendance/remote-permissions', at, { employeeId: row.id, mobileCheckInEnabled: false });
console.log('state restored: mobile disabled');
