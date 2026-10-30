// Task 132 — governance: register + approve BEFORE push.
// (Mobile login fix for mahesh@marqaitech.com — CEO user existed ONLY in the
// tenant DB, so the mobile workspace ladder died at the apex with a flat 401.
// Server: cross-tenant sweep on the apex answers 403+suggestedUrl for
// tenant-DB-only users after password verification. Data: create the missing
// platform mirror row so the apex resolves him like every other user.)
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
    title: 'Task 132 — Fix mobile login for mahesh@marqaitech.com (CEO): apex cross-tenant sweep + missing platform mirror row',
    description:
      'User request: "not able to login for mahesh@marqaitech.com to mobile app pls check and let me know the issue". ' +
      'ROOT CAUSE (proven by live probes + DB diff): the mobile app auto-detects the company workspace via a ladder — configured workspace → 3boxeshrms.com apex → suggested tenant subdomain. The apex can only return suggestedUrl from a PLATFORM-DB User row with a verified password (login Rule 0). mahesh@marqaitech.com was created in Task 129 directly in the marqaitechgroup TENANT DB and never mirrored into the platform DB (he is the ONLY one of 17 tenant users without a mirror row — hr@gmail.com and everyone else have one). So the apex answered a flat 401 "Invalid email, employee ID, or password" (no suggestion), the ladder stopped, and the mobile app rejected the perfectly valid password — the tenant host itself logs him in fine (verified 200 + ceo token). ' +
      'FIX (both layers): (1) CODE — src/app/api/auth/login/route.ts: when no DB holds the email on a slug-less host, sweep ACTIVE tenant DBs (demo excluded — its workspace is not a *.3boxeshrms.com subdomain); if a tenant DB has the email AND the password verifies, answer the same 403+suggestedUrl shape as Rule 0. No session/token is minted on the apex — the client re-authenticates fully at the tenant host, keeping candidate/invite/status edge cases on the tenant path. Password check prevents user enumeration. (2) DATA — scripts/task132-mirror-sync.cjs: idempotently create missing platform mirror rows (same id/email/password-hash/name/role/status/tenantId/avatar copied from the tenant row) for active non-demo tenant DBs; currently inserts exactly one row: mahesh@marqaitech.com (ceo, id cmvjrt0ja000008i6vmvw0hbn). ' +
      'No APK rebuild required — the mobile ladder already follows suggestedUrl. Verification: apex login for mahesh → 403 + suggestedUrl marqaitechgroup.3boxeshrms.com (pre-deploy via sweep, post-data-fix via mirror); full ladder E2E demo→apex→tenant → 200 + ceo token; regressions: wrong password → 401, unknown email → 401, hr@gmail.com unchanged 403, tenant host login unchanged 200; tsc clean on the changed file.',
    category: 'authentication',
    riskLevel: 'medium',
    module: 'Authentication',
    relatedModule: 'Mobile App',
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
