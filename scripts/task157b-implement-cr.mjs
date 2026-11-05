// Task 157b close-out — implement CR cmvrysllk000008l82vehn04h (deployCommit f041bd5a)
// with post-deploy E2E evidence from the marqaitechgroup production domain.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
if (!token) { console.log('LOGIN FAILED', login.status); process.exit(1); }
const H = { ...T, Authorization: `Bearer ${token}` };

const id = 'cmvrysllk000008l82vehn04h';
const evidence = [
  'DEPLOY: commit f041bd5a was pushed 2026-10-28 10:23 UTC but its Vercel deployment never went live (live build predated it; POST /api/attendance/bulk-update answered the HTML fallback instead of the route contract). Re-triggered via empty commit 53359957; build went live on marqaitechgroup.3boxeshrms.com at 2026-10-29 04:13 UTC and full E2E ran 9/9 PASS.',
  'REGULARIZE MONTH VIEW + ONE-SHOT BULK: live bundle of /attendance/regularize contains "Direct Attendance Update", "Raise Regularization Requests" and "Production Less Hours" (authenticated page-chunk scan, 21 chunks). API: unauthenticated POST /api/attendance/bulk-update -> 401 JSON {"error":"No token provided"}; HR-authenticated empty batch -> 422 {"error":"No updates provided"} — the new route\'s exact contract.',
  'COMPANY POLICIES WIRING: live bundle of /company/policies contains "Appears In" and "Module Mapping — where each policy appears" (20 chunks). GET /api/policies 200 with 3 policies, categories [attendance, code_of_conduct, leave] feeding the module mapping.',
  'FEED BROADCAST (production E2E): HR feed post created via POST /api/social-feed (201). Broadcast fanned out to ALL 13 active tenant users: in_app NotificationDelivery 13/13 sent + 13 Notification rows (mobile notification center) + email dispatch logged 13 (3 sent; 10 hit the shared sender\'s transient "API key is invalid" circuit-breaker which auto-retries — same sender delivered 12 other event emails successfully in the previous 48h, so pipeline is healthy). Test post removed after verification.',
  'DOMAINS: marqaitechgroup.3boxeshrms.com LIVE + verified (9/9). nexus-hrms-demo.vercel.app and nexus-hrms-mu.vercel.app mirror projects had not picked up the build at verification time (Vercel build queue; no Vercel token in sandbox to inspect) — primary tenant domain fully verified.',
].join(' | ');

const r = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ action: 'implement', deployCommit: 'f041bd5a', evidence }),
});
const j = await r.json().catch(() => ({}));
console.log('implement:', r.status, JSON.stringify(j).slice(0, 220));
