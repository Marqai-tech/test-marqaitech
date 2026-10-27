// Task 105 — governance: register + approve + implement the super-admin tenant
// switching in the mobile app + GPS geofenced attendance check-in.
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
    title: 'Task 105 — Mobile app: super-admin workspace switching + GPS geofenced attendance check-in, APK v1.0.3 (versionCode 4)',
    description:
      'Mobile app now links to BOTH tenant and super-admin logins: super admins land on a workspace picker (GET /api/tenants + POST /api/auth/switch-tenant) and the selected tenant data flows through Employee/Leave/Attendance/Payroll — identical to the web switcher, with a Switch Workspace tile on the dashboard. Attendance check-in/out now captures real device GPS (geolocator; ACCESS_FINE/COARSE_LOCATION) and sends {lat,lng,accuracy} + utcTimestamp to /api/attendance/punch, which enforces the office geofence (MarqAI Tech office fallback for marqaitechgroup; "Acme Global Demo Office" geofence seeded for the demo tenant) and stores coordinates + punchMethod=mobile on the Attendance row and PunchEvent audit. /api/attendance/my-summary now returns the resolved employee identity (canonical punch target). Admin/HR accounts resolve their linked employee by email so GPS punch works for them too. Verified: demo GPS check-in OK inside radius, 403 outside radius; LIVE tenant data (employees/leaves/attendance with location) confirmed; super-admin switch flow confirmed on 3boxeshrms.com. APK v1.0.3+4 (21.0MB arm64) live on both hosts.',
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
    body: JSON.stringify({ action: 'implement', implementationNotes: 'Deployed to Vercel (LIVE git-integration + demo CLI); APK v1.0.3+4 200 on both hosts; GPS punch verified on demo (inside/outside geofence).' }),
  });
  console.log('implement:', im.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const L = await list.json();
const rows = L?.data?.requests || L?.data || L || [];
console.log('trail total:', Array.isArray(rows) ? rows.length : '?');
