// Task 108 verification — LIVE (non-mutating) then DEMO (full matrix incl. authorized punch)
const LIVE = 'https://marqaitechgroup.3boxeshrms.com';
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const APEX = 'https://3boxeshrms.com';

async function j(url, opts = {}) {
  const r = await fetch(url, opts);
  let b = null; try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
}
const post = (url, token, data) => j(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
const patch = (url, token, data) => j(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
const get = (url, token) => j(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

console.log('========== LIVE (marqaitechgroup) — non-mutating ==========');
const li = await post(`${LIVE}/api/auth/login`, null, { email: 'hr@marqaitech.com', password: 'MarqAI@2026' });
console.log('1. tenant admin login:', li.status);
const lt = li.body?.token;
const lp = await get(`${LIVE}/api/attendance/remote-permissions`, lt);
console.log('2. GET remote-permissions:', lp.status, '| employees:', lp.body?.employees?.length, '| degraded:', lp.body?.degraded ?? false);
const sample = lp.body?.employees?.slice(0, 4).map(e => `${e.employeeId} wfh=${e.wfhPreApproved} mob=${e.mobileCheckInEnabled} web=${e.webCheckInEnabled}`).join(' | ');
console.log('   sample flags:', sample);
const madhuri = lp.body?.employees?.find(e => e.employeeId === 'MARQ008');
const siraj = lp.body?.employees?.find(e => e.employeeId === 'MARQ011');
console.log('   MARQ008/MARQ011 present:', !!madhuri, !!siraj);

// mobile punch attempt WITHOUT permission → expect 403 REMOTE_CHECKIN_NOT_ENABLED (no mutation)
if (madhuri) {
  const t = new Date().toISOString();
  const p1 = await post(`${LIVE}/api/attendance/punch`, lt, { employeeId: madhuri.id, action: 'checkin', date: '2026-10-19', localTime: '18:00', utcTimestamp: t, gps: { lat: 13.098275, lng: 77.585622, accuracy: 10 }, method: 'mobile' });
  console.log('3. mobile punch w/o permission:', p1.status, '| code:', p1.body?.code, '|', (p1.body?.error || '').slice(0, 90));
  // method spoof attempt → expect 400
  const p2 = await post(`${LIVE}/api/attendance/punch`, lt, { employeeId: madhuri.id, action: 'checkin', date: '2026-10-19', localTime: '18:00', utcTimestamp: t, gps: { lat: 13.098275, lng: 77.585622, accuracy: 10 }, method: 'biometric' });
  console.log('4. spoofed method=biometric:', p2.status, '| code:', p2.body?.code);
  // breakin without permission → expect 403
  const p3 = await post(`${LIVE}/api/attendance/punch`, lt, { employeeId: madhuri.id, action: 'breakin', date: '2026-10-19', localTime: '14:00', utcTimestamp: t, method: 'mobile' });
  console.log('5. breakin w/o permission:', p3.status, '| code:', p3.body?.code);
}
// geofence state on LIVE
const lg = await get(`${LIVE}/api/attendance/geofence`, lt);
console.log('6. LIVE geofences configured:', lg.body?.geofences?.length, lg.body?.geofences?.map(g => `${g.name} r=${g.radiusMeters}`).join('; ') || '(empty)');

console.log('\n========== LIVE apex (3boxeshrms.com) — APK + admin console ==========');
const apkHead = await fetch(`${APEX}/downloads/3boxes-hrms-mobile.apk`);
console.log('7. apex APK status:', apkHead.status, 'bytes:', apkHead.headers.get('content-length'));

console.log('\n========== DEMO (nexus-hrms-demo) — full matrix ==========');
const di = await post(`${DEMO}/api/auth/login`, null, { email: 'admin@acme-global.com', password: 'MarqAI@2026' });
console.log('8. demo admin login:', di.status);
const dt = di.body?.token;
const dp = await get(`${DEMO}/api/attendance/remote-permissions`, dt);
console.log('9. GET remote-permissions:', dp.status, '| employees:', dp.body?.employees?.length);
const emp = dp.body?.employees?.find(e => e.mobileCheckInEnabled === false) || dp.body?.employees?.[0];
if (emp) {
  const t = new Date().toISOString();
  const before = await post(`${DEMO}/api/attendance/punch`, dt, { employeeId: emp.id, action: 'checkin', date: '2026-10-19', localTime: '18:00', utcTimestamp: t, gps: { lat: 12.9716, lng: 77.5946, accuracy: 12 }, method: 'mobile' });
  console.log('10. demo mobile punch BEFORE enable:', before.status, '| code:', before.body?.code);
  // enable mobile + WFH
  const en = await patch(`${DEMO}/api/attendance/remote-permissions`, dt, { employeeId: emp.id, wfhPreApproved: true, mobileCheckInEnabled: true });
  console.log('11. PATCH enable mobile:', en.status, '| now mob=', en.body?.employee?.mobileCheckInEnabled, 'wfh=', en.body?.employee?.wfhPreApproved);
  // authorized punch from OUTSIDE radius (WFH) → expect 200 with [Remote WFH] note
  const inP = await post(`${DEMO}/api/attendance/punch`, dt, { employeeId: emp.id, action: 'checkin', date: '2026-10-19', localTime: '18:05', utcTimestamp: new Date().toISOString(), gps: { lat: 12.9900, lng: 77.6100, accuracy: 15 }, method: 'mobile' });
  console.log('12. authorized mobile punch (outside radius):', inP.status, '| notes:', (inP.body?.attendance?.notes || '').slice(0, 110));
  // pin-identical punch → GeoAudit note (checkout to same day? use breakout-free: second checkin same day would overwrite; use checkout)
  const pinP = await post(`${DEMO}/api/attendance/punch`, dt, { employeeId: emp.id, action: 'checkout', date: '2026-10-19', localTime: '18:30', utcTimestamp: new Date().toISOString(), gps: { lat: 12.9716, lng: 77.5946, accuracy: 10 }, method: 'mobile' });
  console.log('13. checkout at pin-identical coords:', pinP.status, '| notes:', (pinP.body?.attendance?.notes || '').slice(0, 130));
  // breakin while mobile-authorized → should pass permission stage (may 400 on business rule)
  const brP = await post(`${DEMO}/api/attendance/punch`, dt, { employeeId: emp.id, action: 'breakin', date: '2026-10-19', localTime: '14:00', utcTimestamp: new Date().toISOString(), method: 'mobile' });
  console.log('14. breakin (authorized):', brP.status, brP.status === 400 ? '| business rule (checked-out day): ' + (brP.body?.error || '').slice(0, 70) : '');
  // disable again → punch blocked
  const dis = await patch(`${DEMO}/api/attendance/remote-permissions`, dt, { employeeId: emp.id, wfhPreApproved: false, mobileCheckInEnabled: false });
  const after = await post(`${DEMO}/api/attendance/punch`, dt, { employeeId: emp.id, action: 'checkout', date: '2026-10-19', localTime: '19:00', utcTimestamp: new Date().toISOString(), gps: { lat: 12.9716, lng: 77.5946, accuracy: 10 }, method: 'mobile' });
  console.log('15. after disable, punch:', dis.status, '→', after.status, '| code:', after.body?.code);
}
// my-summary remotePermissions on demo
const ms = await get(`${DEMO}/api/attendance/my-summary`, dt);
console.log('16. my-summary remotePermissions:', JSON.stringify(ms.body?.remotePermissions));
