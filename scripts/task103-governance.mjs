// Task 103 — governance: register + approve + implement the mobile login fix & rebrand
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
    title: 'Task 103 — Mobile app login fix (INTERNET permission) + official 3Boxes branding (name/logo/icons), APK v1.0.1 (versionCode 2)',
    description:
      'Release APK shipped without android.permission.INTERNET (Flutter template grants it only to debug/profile builds) — the published Android app could not reach the server, so sign-in always failed. Fixed + rebranded: app name "3 Boxes HRMS", launcher icon / native launch screen / iOS AppIcon set / in-app logo mark replaced with the official green 3-boxes logo, branded launch background, versionCode 2. New arm64 APK (20.4MB) published to /downloads/ on live + demo. Commit 352ce7d7.',
    category: 'mobile-app',
    riskLevel: 'high',
    module: 'Mobile App',
  }),
});
const d = await cr.json();
const id = d?.data?.id || d?.id || d?.changeRequest?.id;
console.log('change-request created:', id || d);

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
  const im = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ action: 'implement', implementationNotes: 'Deployed via commit 352ce7d7; APK live on both hosts (20.4MB, versionCode 2).' }),
  });
  console.log('implement:', im.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const L = await list.json();
const rows = L?.data?.requests || L?.data || L || [];
console.log('trail total:', Array.isArray(rows) ? rows.length : '?');
