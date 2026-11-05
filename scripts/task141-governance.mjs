// Task 141 — governance: register + approve BEFORE push.
// (Mobile app flow + login redesign (welcome screen, Mobile Number | Employee ID
// tabs, OTP verification, fingerprint), home icons/layout (announcements banner,
// last-week attendance chart, quick links, chat FAB, bottom nav Home·Chat·
// Attendance·Profile), Birthdays + Quick Links, HR Help Desk wired to the web
// Support ticketing system, chat icon on web dashboard, feed/announcement
// banners on web + mobile, APK v1.6.6 (33).)
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const cr = await fetch(BASE + '/api/super-admin/change-requests', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    title: 'Task 141 — Mobile app flow + login redesign (welcome / OTP / fingerprint), home dashboard upgrade (announcements banner, last-week attendance chart, quick links), HR Help Desk on mobile wired to web Support ticketing, chat icons on web + mobile dashboards, feed/announcement banners (web + mobile), APK v1.6.6 (33)',
    description:
      'User request: "pls check the attached mobile app flow and make sure the data flow is in that flow itself along with reports. check the login page design and options and change the login page in that style and process with 3boxes hrms logo in the mobile app. update the icons accordingly. Also add birthdays and quick links sections in the mobile app. Build a HR help desk connected to the support ticketing system in the web app (Support and AI). Build/add a chat icon in the dashboard of web app and mobile app for employees to chat on specific projects or other issues. Also add feed/announcements banners in the mobile app and web app. Update these in vercel; once done update these in the mobile app ppt and pdf for documentation." ' +
      'IMPLEMENTATION: (1) LOGIN FLOW (image 2): new starry Welcome screen (3Boxes HRMS logo card, tagline, feature strip, continue arrow) as the post-splash landing; Sign In redesigned with Mobile Number | Employee ID tabs on a violet gradient header — Mobile tab: working country selector (India +91 default) + number + Continue → OTP screen; Employee ID tab: employee ID/email + password + Remember me + Forgot password + Sign in; Face ID/fingerprint unlock row + Contact HR sheet on both tabs; all previous engine behaviour preserved (workspace auto-detect, Task 132 ladder, biometric setup, demo hints). (2) OTP BACKEND: new POST /api/auth/otp {action:request|verify} — account resolved from Employee.phone with the SAME candidate set as password login; 6-digit code stored ONLY as SHA-256 hash in a runtime-created LoginOtp table (per tenant DB), 5-minute expiry, max 5 verify attempts, max 3 requests per 15 min; code delivered to the registered email; platform apex sweep answers 403+suggestedUrl (Task 132 ladder parity — apex never mints sessions/OTPs); verify returns the EXACT login response shape { token, user } with hidden-tenant scrub + audit LOGIN + lastLogin. (3) FLOW PARITY (image 1): splash → onboarding (first run) → welcome → sign-in (OTP or password) → biometric setup offer → role routing (super admin → tenant picker, else Home) → My Profile / Leave / Attendance / Payrolls / Notifications modules + admin Reports — all existing modules unchanged. (4) HOME DASHBOARD (image 3): announcements banner (pinned + announcement social feeds, auto-rotating, tap → full Announcements list), Last Week Attendance bar chart (worked hours per day, trailing 7 days, absent days marked red), Quick Links horizontal shortcuts (Requests, Directory, Payslips, Documents, Help Desk, Feeds, Reports role-gated, Attendance Report), Birthdays + Send Wishes kept, Help Desk + Announcements module tiles, chat FAB; bottom nav is now Home · Chat · Attendance · Profile (Directory/Settings remain in the drawer + quick links). (5) HR HELP DESK (mobile): new screen connected to the SAME web Support ticketing system — GET /api/tickets?mine=1 (NEW server-enforced self-scope so the caller cannot widen the view), create ticket (subject/category/priority/description → reaches HR/Admin instantly), full thread view, replies via /api/tickets/[id]/comments, HR/Admin status actions (Start/Resolve/Close via PUT /api/helpdesk); stats chips (Open / In Progress / Resolved). (6) WEB DASHBOARD: announcements banner above the hero (pinned + announcement posts, auto-rotate 6s, dot navigation, View feeds → /collaboration), Chat quick action + floating chat FAB → /collaboration/chat. (7) DOCS: mobile-app SOP PDF + PPT updated with the new login/OTP flow, HR Help Desk, Quick Links, announcements banner and chat. APK v1.6.6 (33) built with the permanent release key (590a456e…), version chain synced (pubspec/app_info/constants/app-version/downloads/task123 test). Tests: task141-contract-check 66/66; scoped tsc (tsconfig.task141.json) vs git-stash baseline — 29 identical errors before and after = ZERO new; flutter analyze 0 errors repo-wide; task123 version-chain tests 10/10 (2 payslip widget tests fail identically before and after — pre-existing environment drift, no payroll code touched).',
    category: 'mobile_app',
    riskLevel: 'medium',
    module: 'Mobile App',
    relatedModule: 'Authentication / Support & AI (Help Desk) / Collaboration (Feeds & Chat)',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || d);

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
