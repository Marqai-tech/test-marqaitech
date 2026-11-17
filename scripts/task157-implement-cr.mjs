// Task 157 — mark the approved CR implemented with deploy evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvoso1k0000008jgwaci4u9j';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const res = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    implementCommit: '62cec473',
    implementNotes:
      'IMPLEMENTED @ deployCommit 62cec473 (web batch c526b2a4 + shell-APK batch 62cec473, both Vercel projects). LIVE E2E evidence (scripts/task157-postdeploy-verify.mjs): 57/57 PASS — /collaboration serves the new graphical statistical hub (Messaging Volume — Top Rooms bar, Storage by Drive donut + per-drive tiles, Calls — Last 7 Days grouped bars, Recent Conversations/Recent Calls, compact Collaboration Apps row, KPI StatCards) on the tenant; /attendance serves the SmartHR attendance-admin hero (Attendance Details Today donut + Late Login/Half Day breakdown + not-marked chip) AND the new admin Attendance Calendar (punch counts + click-to-load) AND the self-view template layout (greeting hero + Punch In/Out, Total Hours Today/Week/Month + Overtime this Month cards, Today\'s Timeline, Monthly Calendar KEPT); /leave serves the SmartHR leaves template (Total Present 12/12 workforce-minus-on-leave, Planned/Unplanned/Pending, Leave Balance panel with big-number + Remaining Leaves cards + Total Leaves/Total Remaining Leaves self-view header); /login on BOTH hosts carries the 3Boxes HRMS product-logo badge (Manage People. Empower Growth.) + laptop-screen mini cubes + nexus-hrms-demo test-link demo-credential detection; /downloads centre lists BOTH editions (Native v1.9.0 (37) + Lite v1.8.1 (37) with royal-blue icon note) and the blue-icon Lite APK serves LIVE at /downloads/3boxes-hrms-mobile-v1.8.1.apk (50,468,565 bytes, application/vnd.android.package-archive) — verified INSIDE the APK: versionCode 37 / versionName 1.8.1 / applicationId com.threeboxes.hrms_app / cert SHA-256 590a456e... (permanent key, installs over v1.8.0/v1.7.x) / xxxhdpi ic_launcher = 3 Boxes HRMS cubes in royal blue; auth + 7 APIs 200 on the tenant (superadmin @ apex, hr @ tenant, chat/calls/storage/leave/employees/attendance/app-version); real-browser walkthrough (Chromium): collab + attendance admin/self + leave render with zero page errors. No logic/API/route changes; tsc 2337 == 2337 stash baseline (0 new); eslint 18 == 18 on the four changed files.',
  }),
});
console.log('implement:', res.status, (await res.text()).slice(0, 160));
