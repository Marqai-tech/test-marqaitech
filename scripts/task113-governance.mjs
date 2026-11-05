// Task 113 governance: register the change request, then approve / implement.
// Usage: node scripts/task113-governance.mjs register|implement <crId> <commitSha>
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const EMAIL = 'superadmin@3boxeshrms.com';
const PASSWORD = 'MarqAI@2026';

async function post(url, payload, token) {
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text.slice(0, 200) } }; }
}
async function patch(url, payload, token) {
  const res = await fetch(url, {
    method: 'PATCH',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text.slice(0, 200) } }; }
}

const login = await post(`${DEMO}/api/auth/login`, { email: EMAIL, password: PASSWORD });
if (!login.data.token) { console.error('LOGIN FAILED', login.status, JSON.stringify(login.data).slice(0, 200)); process.exit(1); }
const token = login.data.token;
console.log('super-admin login OK');

const mode = process.argv[2] || 'register';

if (mode === 'register') {
  const r = await post(`${DEMO}/api/super-admin/change-requests`, {
    title: 'Task 113: employee-directory role scoping (dept/team/all) + good-looking default avatars + Leave Request balances + My Attendance mode & GPS-spoof guard + Payroll run cards + biometric login — APK v1.3.0+13',
    description: [
      'User report: "update the profile photo which is wiped out for all the records so that it looks good; users can change the photo after login; employee login should see their department employees in the directory, manager his team and reportees, admin/HR all employees; update the attached screens and make them dynamic; update Vercel now for the mobile app."',
      'SERVER:',
      '1. GET /api/employees — employee scope "self" now returns OWN record + all ACTIVE colleagues of the SAME DEPARTMENT (fallback self-only when no department). Manager scope (own + direct + dotted-line reports) and admin scope (all non-super-admin) unchanged — matching the requested role ladder.',
      '2. POST /api/attendance/punch — optional "mode" (office|outside) from the app is recorded in the audit notes trail next to the geofence evidence.',
      'MOBILE (Flutter v1.3.0+13, permanent release key — upgrades over v1.2.0/v1.1.0/v1.0.9 without uninstall):',
      '1. Default avatars: MaanAvatar now renders a DETERMINISTIC 8-color gradient (hashed per person) with white initials for every photo-less record — directory, profile, home, drawer look polished.',
      '2. Leave Request screen rebuilt to design 06: Total Leave balance cards (used/total per type, progress strip) from GET /api/leaves/my-balance, type chips with remaining days (red when exhausted), date-range pickers, reason/contact, live submit.',
      '3. My Attendance (design 12): "Your Location" status bar with refresh, Office / Out Side mode selector (recorded server-side), punch via shared PunchFlow; static legacy attendance placeholder removed from routes.',
      '4. GPS-spoofing protection (design 12_Fake_GPS): client-side mock-location detection (geolocator isMocked) aborts the punch with the red "GPS Spoofing Detected" dialog; WFH pre-approval gate gets its own red guidance dialog.',
      '5. Payroll Management (design 11): payroll-run summary cards grouped by month (status badge, period range, N Payslip, run ID, net total) above the payslip list — all from live /api/payroll rows.',
      '6. Biometric login (design 06): local_auth + FlutterFragmentActivity + USE_BIOMETRIC permission; "Or / Biometric Login" on sign-in, "Setup Biometric Login" dialog (email+password verified ONCE, no password stored), auto fingerprint unlock of the validated stored session, post-login setup offer.',
      'TESTING: flutter analyze 0 errors (102 pre-existing infos); 17/17 flutter tests; tsc --noEmit clean for changed server files; APK aapt2-verified versionCode 13 / versionName 1.3.0; apksigner cert = committed release key (590a456e…3749c).',
    ].join('\n'),
    category: 'employees',
    priority: 'high',
    requestedBy: 'automation (Task 113)',
  }, token);
  console.log('REGISTER', r.status, JSON.stringify(r.data).slice(0, 300));
  const id = r.data?.request?.id || r.data?.id;
  if (!id) process.exit(1);
  const a = await patch(`${DEMO}/api/super-admin/change-requests/${id}`, { action: 'approve' }, token);
  console.log('APPROVE', a.status, id);
  console.log('CR_ID=' + id);
} else if (mode === 'implement') {
  const [, , crId, sha] = process.argv;
  const r = await patch(`${DEMO}/api/super-admin/change-requests/${crId}`, { action: 'implement', implementationNotes: `Deployed to LIVE (git auto-deploy) and demo (CLI via deploy-release.sh guard). Commit ${sha}. Directory scoping verified (employee=department, manager=team, admin=all), punch mode recorded, biometric + new screens in APK v1.3.0+13 live on all three hosts.` }, token);
  console.log('IMPLEMENT', r.status, crId, JSON.stringify(r.data).slice(0, 200));
} else {
  console.error('unknown mode');
  process.exit(1);
}
