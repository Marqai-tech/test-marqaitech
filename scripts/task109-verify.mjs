// Task 109 end-to-end verification on DEMO (writes) + LIVE (reads only).
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const LIVE = 'https://marqaitechgroup.3boxeshrms.com';

async function j(base, method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data };
}
const log = (label, obj) => console.log(label, JSON.stringify(obj).slice(0, 260));

// ── DEMO logins ──
const admin = await j(DEMO, 'POST', '/api/auth/login', null, { email: 'admin@acme-global.com', password: 'MarqAI@2026' });
const emp = await j(DEMO, 'POST', '/api/auth/login', null, { email: 'employee.demo@3boxeshrms.com', password: 'MarqAI@2026' });
const at = admin.data.token || ''; const et = emp.data.token || '';
log('DEMO logins', { admin: admin.status, employee: emp.status });
if (!at || !et) process.exit(1);

// 1. remote-permissions: 4 flags present
const rp = await j(DEMO, 'GET', '/api/attendance/remote-permissions', at);
const row0 = (rp.data.employees || [])[0] || {};
log('1 remote-permissions', { status: rp.status, count: (rp.data.employees || []).length, flags: ['wfhPreApproved','mobileCheckInEnabled','webCheckInEnabled','holidayWeekendPunchEnabled'].map(f => `${f}=${f in row0}`) });

// 2. HOLIDAY gate: employee punches on Saturday 2026-10-24 → expect 403
// resolve employee id via my-summary (ownEmployeeId absent from login payload)
const ms = await j(DEMO, 'GET', '/api/attendance/my-summary', et);
const demoEmpId = ms.data.employee?.id;
console.log('employee resolved:', demoEmpId ? (ms.data.employee.employeeId + ' ' + ms.data.employee.firstName) : 'FAILED', '| remotePermissions:', JSON.stringify(ms.data.remotePermissions || null));
const sat = await j(DEMO, 'POST', '/api/attendance/punch', et, {
  employeeId: demoEmpId, action: 'checkin', date: '2026-10-24', localTime: '10:00',
  method: 'mobile', gps: { lat: 12.9716, lng: 77.5946, accuracy: 8 },
});
log('2 weekend punch blocked?', { status: sat.status, code: sat.data.code, error: String(sat.data.error || '').slice(0, 130) });

// 3. HOLIDAY_WORK request → admin approves → punch unlocked
const req = await j(DEMO, 'POST', '/api/attendance/requests', et, {
  requestType: 'HOLIDAY_WORK', startDate: '2026-10-24', endDate: '2026-10-24',
  expectedHours: 4, reason: 'Task109 verification: festival-day release push',
});
log('3a HOLIDAY_WORK created', { status: req.status, id: req.data.request?.id || req.data.id, status2: req.data.request?.status });
const reqId = req.data.request?.id || req.data.id;
if (reqId) {
  const appr1 = await j(DEMO, 'PATCH', `/api/attendance/requests/${reqId}`, at, { action: 'approve', comments: 'L1 approved for verification' });
  log('3b L1 approved', { status: appr1.status, status2: appr1.data.request?.status, level: appr1.data.request?.currentLevel, msg: String(appr1.data.message || '').slice(0, 60) });
  const appr2 = await j(DEMO, 'PATCH', `/api/attendance/requests/${reqId}`, at, { action: 'approve', comments: 'L2 approved for verification' });
  log('3b2 L2 approved', { status: appr2.status, status2: appr2.data.request?.status, msg: String(appr2.data.message || '').slice(0, 60) });
  const sat2 = await j(DEMO, 'POST', '/api/attendance/punch', et, {
    employeeId: demoEmpId, action: 'checkin', date: '2026-10-24', localTime: '10:15',
    method: 'mobile', gps: { lat: 12.9716, lng: 77.5946, accuracy: 8 },
  });
  log('3c punch after approval', { status: sat2.status, code: sat2.data.code, notes: String(sat2.data.attendance?.notes || sat2.data.notes || '').slice(0, 150) });
  // cleanup: checkout + cancel the verification request so demo stays clean
  const co = await j(DEMO, 'POST', '/api/attendance/punch', et, {
    employeeId: demoEmpId, action: 'checkout', date: '2026-10-24', localTime: '14:15',
    method: 'mobile', gps: { lat: 12.9716, lng: 77.5946, accuracy: 8 },
  });
  log('3c2 checkout', { status: co.status });
  const cancel = await j(DEMO, 'PATCH', `/api/attendance/requests/${reqId}`, at, { action: 'cancel', comments: 'verification cleanup' });
  log('3d cleanup(cancel)', { status: cancel.status });
}

// 4. Suspicious punch: employee with mobile permission, exact-pin coordinates → GeoAudit + alert
// enable mobile for the demo employee first
const empList = await j(DEMO, 'GET', '/api/attendance/remote-permissions', at);
const me = (empList.data.employees || []).find(e => e.employeeId && e.email === 'employee.demo@3boxeshrms.com') || (empList.data.employees || [])[0];
if (me) {
  await j(DEMO, 'PATCH', '/api/attendance/remote-permissions', at, { employeeId: me.id, mobileCheckInEnabled: true });
  const susp = await j(DEMO, 'POST', '/api/attendance/punch', et, {
    employeeId: me.id, action: 'checkin', date: '2026-10-19', localTime: '11:00',
    method: 'mobile', gps: { lat: 12.9716, lng: 77.5946, accuracy: 10 },
  });
  log('4 suspicious exact-pin punch', { status: susp.status, notes: String(susp.data.attendance?.notes || susp.data.notes || '').slice(0, 160) });
  const notifs = await j(DEMO, 'GET', '/api/notifications', at);
  const suspN = (notifs.data.notifications || notifs.data.data || []).filter(n => /Suspicious punch/i.test(n.title || ''));
  log('4b admin notifications', { count: suspN.length, latest: suspN[0] ? { title: suspN[0].title, msg: String(suspN[0].message || '').replace(/#AUD#\S+/, '').slice(0, 100) } : null });
  // disable again (leave permissions as found)
  await j(DEMO, 'PATCH', '/api/attendance/remote-permissions', at, { employeeId: me.id, mobileCheckInEnabled: false });
}

// 5. Tenant-link lock: tenant admin tries to change domain → 403 TENANT_LINK_LOCKED
const me5 = await j(DEMO, 'GET', '/api/auth/me', at);
const tenantId = me5.data.tenantId;
if (tenantId) {
  const lock = await j(DEMO, 'PATCH', `/api/tenants/${tenantId}`, at, { domain: 'evil-redirect.example.com' });
  log('5 tenant-admin domain change', { status: lock.status, code: lock.data.code, error: String(lock.data.error || '').slice(0, 110) });
}
// slug change as super admin also blocked
const sa = await j(DEMO, 'POST', '/api/auth/login', null, { email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' });
const slugTry = await j(DEMO, 'PATCH', `/api/tenants/${tenantId}`, sa.data.token, { slug: 'renamed-slug' });
log('5b super-admin slug change', { status: slugTry.status, code: slugTry.data.code });

// ── LIVE (read-only) ──
const ladmin = await j(LIVE, 'POST', '/api/auth/login', null, { email: 'hr@marqaitech.com', password: 'MarqAI@2026' });
const lt = ladmin.data.token || '';
const lrp = await j(LIVE, 'GET', '/api/attendance/remote-permissions', lt);
const lrow = (lrp.data.employees || [])[0] || {};
log('LIVE remote-permissions', { status: lrp.status, count: (lrp.data.employees || []).length, hasFlag: 'holidayWeekendPunchEnabled' in lrow });
const lsum = await j(LIVE, 'GET', '/api/attendance/my-summary', lt);
log('LIVE my-summary flags', { status: lsum.status, rp: JSON.stringify(lsum.data.remotePermissions || null) });
const lme = await j(LIVE, 'GET', '/api/auth/me', lt);
log('LIVE auth/me', { status: lme.status, name: lme.data.name, role: lme.data.role, avatarLen: String(lme.data.avatar || '').length });
