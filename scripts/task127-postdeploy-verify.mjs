// Task 127 — post-deploy production verification (all 3 hosts + E2E probes)
const hosts = [
  'https://marqaitechgroup.3boxeshrms.com',
  'https://3boxeshrms.com',
  'https://nexus-hrms-demo.vercel.app',
];
let fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fail += 1;
};

// 1. app-version on all hosts
for (const h of hosts) {
  try {
    const r = await fetch(`${h}/api/public/app-version`, { signal: AbortSignal.timeout(20000) });
    const d = await r.json();
    ok(`app-version ${h.replace('https://', '')}`, r.status === 200 && d.versionName === '1.5.8' && d.versionCode === 25, `v${d.versionName}(${d.versionCode})`);
  } catch (e) { ok(`app-version ${h}`, false, e.message); }
}

// 2. APK URL reachable
try {
  const r = await fetch('https://marqaitechgroup.3boxeshrms.com/downloads/3boxes-hrms-mobile-v1.5.8.apk', { method: 'HEAD', signal: AbortSignal.timeout(30000) });
  const size = Number(r.headers.get('content-length') || 0);
  ok('APK v1.5.8 downloadable', r.status === 200 && size > 20_000_000, `${size} bytes`);
} catch (e) { ok('APK v1.5.8 downloadable', false, e.message); }

// 3. tenant login + attendance/payslip/validations probes
const TENANT = hosts[0];
const T = { 'Content-Type': 'application/json' };
const login = await fetch(`${TENANT}/api/auth/login`, { method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }) });
const { token } = await login.json();
ok('tenant admin login', Boolean(token));
const H = { Authorization: `Bearer ${token}` };

// phone-number login (THE new feature — must succeed now)
const ph = await fetch(`${TENANT}/api/auth/login`, { method: 'POST', headers: T, body: JSON.stringify({ email: '7671813161', dialCode: '+91', password: 'MarqAI@2026' }) });
const phd = await ph.json().catch(() => ({}));
ok('phone-number login (7671813161 +91)', ph.status === 200 && Boolean(phd.token), ph.status === 200 ? 'matched Employee.phone' : (phd.error || String(ph.status)));

// 4. validations page + history API (Task 126 regression guard)
try {
  const page = await fetch(`${TENANT}/payroll/validations`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
  ok('/payroll/validations page 200', page.status === 200);
  const list = await (await fetch(`${TENANT}/api/payroll/validations?limit=3`, { headers: H })).json();
  const rows = list?.data || list?.validations || [];
  const first = rows[0];
  let detailOk = false;
  if (first?.id) {
    const det = await fetch(`${TENANT}/api/payroll/validations/${first.id}`, { headers: H });
    const dd = await det.json().catch(() => ({}));
    detailOk = det.status === 200 && Array.isArray(dd?.errors ?? dd?.data?.errors ?? dd?.request?.errors ?? []);
  }
  ok('validations detail API returns array errors', detailOk);
} catch (e) { ok('validations page/api', false, e.message); }

// 5. attendance holidays intact
const att = await (await fetch(`${TENANT}/api/attendance?startDate=2026-10-20&endDate=2026-10-22&limit=100`, { headers: H })).json();
const rows = att.attendance || att.data || att.rows || [];
const byDay = {};
for (const r of rows) {
  const d = new Date(r.date).toISOString().slice(0, 10);
  byDay[d] = byDay[d] || {};
  byDay[d][r.status] = (byDay[d][r.status] || 0) + 1;
}
ok('Oct 20 holiday ×9', byDay['2026-10-20']?.holiday === 9, JSON.stringify(byDay['2026-10-20']));
ok('Oct 21 holiday ×9 (no punches)', byDay['2026-10-21']?.holiday === 9, JSON.stringify(byDay['2026-10-21']));
ok('Oct 22 real punches only', (byDay['2026-10-22']?.present || 0) === 5 && (byDay['2026-10-22']?.late || 0) === 1 && (byDay['2026-10-22']?.half_day || 0) === 1, JSON.stringify(byDay['2026-10-22']));

// 6. chat members API still healthy (mobile members sheet source)
const mem = await fetch(`${TENANT}/api/collaboration/chat/rooms`, { headers: H });
ok('chat rooms API 200', mem.status === 200);

console.log(fail === 0 ? '\nTASK 127 POST-DEPLOY VERIFY: ALL PASS' : `\nTASK 127 POST-DEPLOY VERIFY: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
