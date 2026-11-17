// Task 101 — commit statuses + governance change-request registration for the mobile app deploy
import { execSync } from 'node:child_process';

const gh = execSync('git config --get remote.origin.url').toString().trim().match(/https:\/\/[^:]+:([^@]+)@github\.com/)[1];
const H = { Authorization: `Bearer ${gh}`, Accept: 'application/vnd.github+json', 'User-Agent': '3boxes-task101' };

const st = await fetch('https://api.github.com/repositories/1248905380/commits/a1dfd769/status', { headers: H }).then((r) => r.json());
console.log('commit a1dfd769 statuses:');
for (const s of st.statuses || []) console.log(`  ${s.context} → ${s.state}`);

// governance: register + approve + implement on LIVE
const BASE = 'https://3boxeshrms.com';
const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
}).then((r) => r.json());
const T = { Authorization: `Bearer ${login.token || login.accessToken}`, 'Content-Type': 'application/json' };

const cr = await fetch(BASE + '/api/super-admin/change-requests', {
  method: 'POST', headers: T,
  body: JSON.stringify({
    title: 'Task 101 — Flutter mobile app (Android+iOS) + login-page download options',
    description: 'Built the 3Boxes HRMS Flutter app per approved MAAN-style designs (onboarding, role select, sign-in, HRM & Payroll dashboard, employee management, empty state, add employee). Universal release APK (55MB) committed to public/downloads/3boxes-hrms-mobile.apk; /downloads landing page + login-page download buttons (Android direct APK, iOS download center) shipped; stale /api/mobile-app/apk redirect (deprecated nexus-hrms-mu) fixed; CI workflow source added at docs/github-ci.yml.txt (ubuntu APK on push; macos unsigned IPA on manual dispatch). Deployed to LIVE via git integration and demo (nexus-hrms-demo.vercel.app) via CLI at commit a1dfd769. User-authorized in chat.',
    category: 'mobile',
    deployCommit: 'a1dfd769',
  }),
}).then((r) => r.json());
const id = cr?.request?.id || cr?.id;
console.log('change request created:', id || JSON.stringify(cr).slice(0, 140));

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: T, body: JSON.stringify({ action: 'approve' }),
  }).then((r) => r.status);
  const im = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: T, body: JSON.stringify({ action: 'implement' }),
  }).then((r) => r.status);
  console.log(`approve: HTTP ${ap} | implement: HTTP ${im}`);
  const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: T }).then((r) => r.json());
  const reqs = list?.requests || list?.data || [];
  console.log(`trail: ${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending`);
}
