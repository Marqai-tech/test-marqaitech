// Task 106 — governance: register + approve + implement the mobile login fix
// (auto-discovering workspace login for tenant admins; v1.0.4+5).
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
    title: 'Task 106 — Mobile app fix: tenant-admin login auto-discovers the company workspace (v1.0.4, versionCode 5)',
    description:
      'Root cause of "tenant admin cannot log in on mobile": the sign-in form hid the workspace field and defaulted to the demo server (tenant emails are unknown there -> 401), the "Use live workspace" preset pointed at the apex domain which rejects tenant admins (403 super-admins-only), typed workspace URLs without https:// broke the request, and the workspace was never persisted so sessions broke on restart. Fix: smart login ladder — try configured workspace, fall back to the live platform apex (which answers 403 with suggestedUrl for tenant users), auto-retry at the suggested tenant subdomain (marqaitechgroup.3boxeshrms.com for hr@gmail.com); persist the workspace that authenticated; normalize scheme/bare-subdomain input; surface the server\'s real error message. Verified via curl ladder: demo 403 -> apex 403+suggestedUrl -> subdomain 200 tenant_admin (Vardhani Reddy); demo + super-admin logins unchanged (200 direct); wrong password = clean 401 message. APK v1.0.4+5 (21.0MB arm64) live on 3boxeshrms.com, marqaitechgroup.3boxeshrms.com and nexus-hrms-demo.vercel.app (20,972,118 bytes each).',
    category: 'mobile-app',
    riskLevel: 'medium',
    module: 'Mobile App',
  }),
});
const d = await cr.json();
const id = d?.request?.id || d?.data?.id || d?.id || d?.changeRequest?.id;
console.log('change-request created:', id || d);

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
  const im = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ action: 'implement', implementationNotes: 'Commit 10a78b63 pushed (LIVE git auto-deploy) + demo CLI deploy Ready; APK v1.0.4+5 = HTTP 200 with content-length 20972118 on all three hosts.' }),
  });
  console.log('implement:', im.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const rows = ld?.data?.requests || ld?.data || ld?.requests || [];
console.log('trail:', Array.isArray(rows) ? rows.length : '?', 'requests');
