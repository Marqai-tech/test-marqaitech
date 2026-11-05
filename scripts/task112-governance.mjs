// Task 112 governance: register the change request, then approve / implement.
// Usage: node scripts/task112-governance.mjs register|implement <crId> <commitSha>
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
    title: 'Task 112: dynamic profile/settings/notifications + design-set mobile screens (Home Check/Break/Leave tabs, Employee Directory, Attendance Report, Terms/Privacy) + self-profile photo API + my-leave-balance API — APK v1.2.0+12',
    description: [
      'User report: "profile pages, settings pages are all static and not showing any data; build the attached screens in the respective modules and make them dynamic instead of static; update Vercel."',
      'MOBILE (Flutter, v1.2.0+12, permanent release key — upgrades over v1.0.9/v1.1.0 without uninstall):',
      '1. Home rebuilt to design set 03/04/05 — date+greeting header with LIVE unread notification badge; Check / Break Time / Leave tabs with fingerprint punch buttons (GPS + WFH pre-approval banner + holiday-approval dialog preserved); Today Time Log (late-in, early-out, break, worked, overtime) from the real attendance row; This Month attendance card from my-summary.',
      '2. NEW Employee Directory screen (design 16) — designation filter chips, search, 2-column cards with ringed avatars, online dot, live "Checked In / Not Checked" status, call/mail/chat quick actions; detail screen restyled to design 17.',
      '3. NEW Attendance Report screen (design 17) — period dropdown (This/Last Month, Last 7 Days), Date/In Time/Out Time/Status table with colored P/L/A/W/H/O/HD letter badges, own-rows from the attendance range API.',
      '4. Notifications (design 18) — LIVE from /api/notifications: Total/Unread/Read stat cards, unread dots, tap-to-mark-read + mark-all-read (both persisted server-side).',
      '5. My Profile (design 19) — dynamic: employee record fields (email, phone, salary, join date, employment type, designation, department, branch, reporting manager, gender, blood group, shift when present), profile-completeness meter, Image Change via new PATCH /api/auth/me (photo writes to User + linked Employee).',
      '6. Settings — real account identity, live workspace URL + tenant name, persisted notification preferences, update check, connection check, Terms/Privacy, logout.',
      '7. App drawer (design 87) — profile header, blue Presents/Late/Absent bar from my-summary, Terms of Services + Privacy Policy pages.',
      '8. App-wide bottom navigation Home/Directory/Settings/Profile; sign-in restyled to design 02 ("Hey 👋 Login Now!").',
      'SERVER: PATCH /api/auth/me (self-service avatar/phone with the shared photo validator; employee row kept in sync) + GET /api/leaves/my-balance (LeaveBalance aggregation + pending days; linked:false for accounts without an employee row). Version chain synced 1.2.0 (12): pubspec, app_info.dart, constants.dart, app-version.ts, downloads page + README.',
      'TESTING: flutter analyze 0 errors; 17/17 flutter tests; APK aapt2-verified versionCode 12 / versionName 1.2.0; apksigner cert = committed release key (590a456e…3749c); new feature strings verified in libapp.so; post-deploy curl/node matrix (scripts/task112-verify.mjs) on LIVE + demo.',
    ].join('\n'),
    category: 'attendance',
    priority: 'high',
    requestedBy: 'automation (Task 112)',
  }, token);
  console.log('REGISTER', r.status, JSON.stringify(r.data).slice(0, 300));
  const id = r.data?.request?.id || r.data?.id;
  if (!id) process.exit(1);
  const a = await patch(`${DEMO}/api/super-admin/change-requests/${id}`, { action: 'approve' }, token);
  console.log('APPROVE', a.status, id);
  console.log('CR_ID=' + id);
} else if (mode === 'implement') {
  const [, , crId, sha] = process.argv;
  const r = await patch(`${DEMO}/api/super-admin/change-requests/${crId}`, { action: 'implement', implementationNotes: `Deployed to LIVE (git auto-deploy) and demo (CLI via deploy-release.sh guard). Commit ${sha}. Dynamic screens (Home tabs, Directory, Attendance Report, Notifications, Profile, Settings, Drawer, Terms/Privacy), PATCH /api/auth/me + /api/leaves/my-balance verified on both hosts. APK v1.2.0+12 live on all three hosts.` }, token);
  console.log('IMPLEMENT', r.status, crId, JSON.stringify(r.data).slice(0, 200));
} else {
  console.error('unknown mode');
  process.exit(1);
}
