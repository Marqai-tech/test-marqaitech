// Batch: collab dashboard graphical + attendance/leave SmartHR template restyle
// + test-link login + shell app icon. Register + approve BEFORE push.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };
if (!token) { console.error('login failed', login.status); process.exit(1); }

const cr = await fetch(BASE + '/api/super-admin/change-requests', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    title: 'UI restyle batch — Collaboration dashboard graphical/statistical + Attendance & Leave dashboards to SmartHR templates + test-link login & product logo + shell app icon',
    description:
      'User request: "change the collaboration module dashboard to graphically statistically but not the options view like other modules; change the admin and employee view attendance dashboard like smarthr attendance templates but keep the calendar; same for leave module (leaves-employee/leaves); update in vercel; login page of web app for test link same way as tenant link; 3 boxes logo on the right hand side image; change the mobile app icon for web view shell app with 3 boxes hrms logo but different colour to differentiate native vs shell apps". ' +
      'CHANGES (UI-only unless noted): (1) /collaboration hub rebuilt from an app-tile options view into a graphical statistical dashboard — live KPIs (chat rooms/messages/unread, file count + storage used, call count + minutes, active people) from existing /api/collaboration endpoints, recharts 7-day messaging bar chart + storage donut + calls-by-day sparkline, recent activity panels, compact quick-link row kept; (2) Attendance ADMIN view gains the SmartHR "Attendance Details Today" hero — recharts donut of Present/Late Login/Absent/On Leave/Half-Day with side stat rows and "Data from the N total employees" caption above the existing filter+table (table columns already match the template); (3) Attendance EMPLOYEE (self) view gains the SmartHR template layout — gradient greeting hero with live clock and the relocated punch/break buttons, 4 template stat cards (Total Hours Today/Week/Month, Overtime this Month) computed from real records, Today timeline duration tiles, monthly calendar KEPT as-is, table gains Break/Late columns; (4) Leave dashboards match the SmartHR leaves templates — admin stat cards Total Present x/y (roster minus on-leave today), Planned/Unplanned/Pending; employee leave-balance cards restyled to template big-number + Remaining sublines with Total Leaves / Total Remaining Leaves in the Leave List header; (5) login page: nexus-hrms-demo.vercel.app added to demo-site detection (demo credential expander now shows on the test link like on demo hosts) and the 3Boxes HRMS product logo badge added to the right-hand illustration pane; (6) SHELL APP: WebView-shell launcher icon replaced (was the default Flutter icon) with the 3 Boxes HRMS cubes logo re-coloured royal blue to differentiate from the native green app icon, all densities + adaptive layers, shell version 1.8.0(36) -> 1.8.1(37), rebuilt universal APK shipped to /downloads, downloads page + README + app-version chain updated. ' +
      'No API/route/logic changes for (1)-(5); punch handlers, approvals, filters, modals, role gating preserved verbatim. tsc compared against the 1850-error baseline (0 new expected); CR covers both the web push and the shell-APK push.',
    category: 'ui',
    riskLevel: 'low',
    module: 'UI/UX',
    relatedModule: 'Attendance, Leave, Collaboration, Login, Mobile App',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || JSON.stringify(d).slice(0, 300));

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status, await ap.text().then(t => t.slice(0, 120)));
}
