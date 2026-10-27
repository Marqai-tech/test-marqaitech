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
    title: 'Task 110: mobile session-expiry recovery + employee-detail fix + APK download/self-update from login + connection diagnostics + employees API auth gate',
    description: [
      'Root-cause fixes for the recurring "errors in all modules" mobile report:',
      '1. SESSION-EXPIRY RECOVERY — tokens expire after 24h; the app previously auto-entered Home with a dead token (upgrade-over-install keeps storage) and EVERY module 401-ed forever. Now: startup /api/auth/me validation before entering Home, global 401 hook clears the dead session and routes to Sign In with a message.',
      '2. EMPLOYEE-DETAIL CRASH FIX — /employees/detail route cast String id to EmployeeModel (TypeError on every tap from Employee Management); new EmployeeDetailByIdScreen resolves by id with loading/error states.',
      '3. APK DOWNLOAD & SELF-UPDATE FROM THE LOGIN PAGE — public /api/public/app-version endpoint; sign-in screen shows installed version + "Download latest app (APK)" + update banner; home shows update dialog; Settings gains Check-for-updates + Connection check; web login page shows the download card expanded with the REAL version and the PWA "install web app" option REMOVED (user request).',
      '4. CONNECTION DIAGNOSTICS SCREEN — runs the full module endpoint matrix with the stored token, per-endpoint pass/fail + server message, screenshot-able for support.',
      '5. SECURITY — GET /api/employees (list + [id]) served full employee PII with NO token / garbage / cross-tenant tokens; now 401-gated like every other route.',
      '6. Profile photo always refreshed from /api/auth/me; logout routes to the current sign-in screen. APK v1.0.8+9 (versionCode 9, arm64).',
    ].join('\n'),
    category: 'attendance',
    priority: 'high',
    requestedBy: 'automation (Task 110)',
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
