// Task 134 — governance: register + approve BEFORE push.
// (Change Password for ALL users: web avatar dropdown + My Profile page +
// mobile profile screen; new POST /api/auth/change-password verifies the
// current password and mirror-syncs the new bcrypt hash across the tenant DB
// and the platform mirror so every login path accepts it immediately.
// APK v1.6.2 (29).)
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
    title: 'Task 134 — Change Password for every user (web avatar menu + My Profile + mobile profile) with cross-DB mirror sync; APK v1.6.2 (29)',
    description:
      'User request: "Give a change password option to the all users in both web and mobile under their photo right side corner under my profile so that the users can change their password anytime. Pls update it now in vercel". ' +
      'API — new POST /api/auth/change-password (Bearer-auth): body {currentPassword, newPassword}; resolves the DB that holds the identity with the same ladder as /api/auth/me (x-tenant-slug → tenant DB, else JWT tenantId → tenant DB, else platform DB; super_admin → platform), verifies the CURRENT password with bcrypt against that row (accounts provisioned without a password are routed to the Forgot-Password flow), enforces 8–128 chars and new ≠ current, then writes hashPassword(new) (bcrypt cost 12). MIRROR SYNC (Task 132 constraint): tenant users exist in BOTH their tenant DB (canonical — tenant-host login authenticates there first) and the platform DB (mirror rows used by apex Rule 0/Rule 2 and the mobile workspace ladder) — production diff shows 4 of 17 marqaitechgroup mirror pairs carry DIFFERENT ids (hr@gmail.com among them), so the same new hash is written by id FIRST then by email in BOTH directions (tenant→platform mirror and platform→tenant row) so no login path can keep the old password. Stateless JWT session stays valid. ' +
      'WEB — new shared src/components/ChangePasswordModal.tsx (current/new/confirm with show-hide toggles, client validation mirroring the server, inline error panel, Esc/backdrop close, disabled while submitting); Header.tsx avatar dropdown gains a Change Password item for EVERY role directly under My Profile (not role-gated); My Profile page gains a Change Password button in the header card that opens the same modal. ' +
      'MOBILE (v1.6.2/29) — ApiService.changePassword + ApiConfig.changePassword; profile screen gains a Change Password outlined button under Image Change opening a dialog identical to the web modal (obscure toggles, validation, server error surfaced inline), success snackbar on 200. ' +
      'NO DATA MIGRATION — additive route + UI only; no schema change. Verification: contract check 17/17 (scripts/task134-contract-check.cjs); tsc zero NEW errors vs stash baseline (2362 = 2362); flutter analyze 0 errors on changed files; APK v1.6.2 (29) built with the permanent key 590a456e…3749c (aapt2 verified versionCode 29 / versionName 1.6.2). Post-deploy E2E will change+restore real passwords end-to-end across tenant host, apex mirror path and full mobile ladder.',
    category: 'security',
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
