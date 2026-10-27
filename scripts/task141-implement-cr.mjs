// Task 141 — mark CR implemented (after deploy + live E2E 30/30).
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvnfibwo000007jvkc0w4ypv';
const DEPLOY_COMMIT = '5ff95ae0';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const r = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    deployCommit: DEPLOY_COMMIT,
    implementationNotes:
      'DEPLOYED (commits 425e5aa0 + 5ff95ae0, both Vercel projects success) + LIVE E2E 30/30 PASS (scripts/task141-postdeploy-verify.cjs). ' +
      'Shipped: (1) MOBILE LOGIN REDESIGN per the approved mock — starry Welcome screen (3Boxes HRMS logo card + tagline + feature strip + continue arrow) as the post-splash landing; Sign In with Mobile Number | Employee ID tabs on a violet gradient header; Mobile tab (country selector + number + Continue) flows into a 6-box OTP Verify screen with 30s resend cooldown, Verify & Continue and Change number; Employee ID tab keeps ID/email + password + Remember me + Forgot password + Sign in; Face ID/fingerprint row + Contact HR sheet on both tabs; post-login pipeline (biometric setup offer, super-admin tenant picker vs Home) shared by password AND OTP sessions. (2) OTP BACKEND — POST /api/auth/otp request|verify: account resolved from Employee.phone (exact candidate fast path + digit-normalised regexp fallback so free-form stored numbers like +91-9828803789 match; requires a linked User), 6-digit code stored ONLY as SHA-256 hash in a runtime-created LoginOtp table (per tenant DB), 5-minute expiry, 5-attempt cap, 3-requests-per-15-min rate limit, delivered to the registered email (demo E2E: emailDelivered=true); apex sweep answers 403+suggestedUrl and never mints; verify returns the exact login shape { token, user } with hidden-tenant scrub + audit LOGIN + lastLogin. (3) FLOW PARITY with the approved flow image — splash → onboarding (first run) → welcome → sign-in (OTP or password) → fingerprint setup offer → Home with My Profile / Leave / Attendance / Payrolls / Notifications + admin Reports all reachable (existing modules unchanged). (4) HOME DASHBOARD per the home mock — announcements banner (pinned + announcement feeds, auto-rotating, tap → full Announcements list with likes), Last Week Attendance bar chart (worked hours/day, trailing 7 days, absent days red), Quick Links horizontal shortcuts (Requests, Directory, Payslips, Documents, Help Desk, Feeds, Reports role-gated, Attendance Report), Birthdays + Send Wishes kept, HR Help Desk + Announcements module tiles, chat FAB, bottom nav now Home · Chat · Attendance · Profile (Directory/Settings remain in drawer/quick links). (5) HR HELP DESK (mobile) connected to the SAME web Support ticketing system — mine=1 server-enforced self-scope (NEW on GET /api/tickets; forged requesterId cannot widen), raise ticket, full thread + replies, HR/Admin status actions via PUT /api/helpdesk, stats chips. (6) WEB ESS DASHBOARD — announcements banner above the hero (auto-rotate 6s, dots, View feeds) + Chat quick action + floating chat FAB to /collaboration/chat. (7) DEMO + MARQAI tenants seeded with pinned announcements so the banners render. (8) DOCS — mobile-app SOP PDF + PPT updated with the new login/OTP flow, HR Help Desk, Quick Links and banners. APK v1.6.6 (33) built with the permanent release key 590a456e… (22.6MB, arm64), artifacts at /downloads/3boxes-hrms-mobile-v1.6.6.apk + alias; version chain synced (pubspec/app_info/constants/app-version/downloads/task123 test). Tests pre-push: task141-contract-check 66/66; scoped tsc vs stash baseline 29==29 (zero new); flutter analyze 0 errors; task123 version-chain tests 10/10. LIVE E2E evidence: app-version 1.6.6(33) both hosts; APK serves; tickets mine=1 self-owned only + forged requesterId ignored; ticket create/comment/close round-trip; social-feed pinned announcement sorts first; OTP unknown→404, request→sent:true(emailDelivered=true), wrong→401 w/ attempts, 429 after 3, injected-code verify→200{token,user}→/api/auth/me OK, apex 404; marqai HR login + tickets + feed + OTP request; /dashboard + /login serve 200.',
  }),
});
console.log('implement:', r.status, await r.text().then((t) => t.slice(0, 160)));

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
const mine = Array.isArray(reqs) ? reqs.find((x) => x.id === CR_ID) : null;
console.log('CR status:', mine ? `${mine.status} (deployCommit=${mine.deployCommit || '-'})` : 'not found');
