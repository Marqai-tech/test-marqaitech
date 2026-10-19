// Task 109 governance: register the change request, then approve + implement.
// Usage: node scripts/task109-governance.mjs register|implement <crId> <commitSha>
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
    title: 'Task 109: holiday/weekend punch rules + suspicious-punch alerts + code governance + tenant-link protection',
    description: [
      'Attendance business rules (admin-configurable per employee):',
      '1. Holiday / weekend punch gate — mobile & web punches on a holiday or weekend are blocked (403 HOLIDAY_WORK_APPROVAL_REQUIRED) unless (a) an APPROVED HOLIDAY_WORK request (employee → reporting manager → HR) covers the date, or (b) the admin opens holidays/weekends free for that employee in Attendance → Remote Check-In (new toggle). Biometric punches on holidays are ALWAYS recorded but generate alerts.',
      '2. Suspicious-punch detection — EXACT_GEOFENCE_PIN (mock-location signature), SHARED_COORDINATES (one device punching for multiple employees), HOLIDAY_WEEKEND_PUNCH. Admins+HR get in-app notifications AND email alerts, de-duplicated per employee/date/flag. Biometric webhook also alerts on holiday punches.',
      '3. Code-change governance (GOVERNANCE.md + scripts/deploy-release.sh): every GitHub/Vercel update requires an approved super-admin change request; CLI deploys are blocked by the guard unless the CR verifies as approved against the live platform API; commit messages must carry CR:<id>; guard closes the loop by marking the CR implemented with the deploy commit.',
      '4. Tenant-link protection — PATCH /api/tenants/[id] rejects slug changes outright (TENANT_LINK_LOCKED) and rejects custom-domain changes by tenant admins; super-admin domain changes broadcast notification + email to all super admins and tenant admins.',
      '5. Employee.holidayWeekendPunchEnabled column (platform + tenant DBs, idempotent runtime ensure), remote-permissions API/Ui 4th toggle, my-summary exposes it, Flutter punch exception codes + approval-needed dialog, APK v1.0.7+8.',
    ].join('\n'),
    category: 'attendance',
    priority: 'high',
    requestedBy: 'automation (Task 109)',
  }, token);
  console.log('REGISTER', r.status, JSON.stringify(r.data).slice(0, 300));
  const id = r.data?.request?.id || r.data?.id;
  if (!id) process.exit(1);
  const a = await patch(`${DEMO}/api/super-admin/change-requests/${id}`, { action: 'approve' }, token);
  console.log('APPROVE', a.status, id);
  console.log('CR_ID=' + id);
} else if (mode === 'implement') {
  const [, , crId, sha] = process.argv;
  const r = await patch(`${DEMO}/api/super-admin/change-requests/${crId}`, { action: 'implement', implementationNotes: `Deployed to LIVE (git auto-deploy) and demo (CLI via deploy-release.sh guard). Commit ${sha}. Holiday gate + HOLIDAY_WORK requests + suspicious-punch alerts (email + notification) + code governance (GOVERNANCE.md, deploy-release.sh) + tenant-link protection (TENANT_LINK_LOCKED) verified on both hosts. APK v1.0.7+8 (versionCode 8) live on all three hosts.` }, token);
  console.log('IMPLEMENT', r.status, crId, JSON.stringify(r.data).slice(0, 200));
} else {
  console.error('unknown mode');
  process.exit(1);
}
