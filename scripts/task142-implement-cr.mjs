#!/usr/bin/env node
/* Task 142 — mark the approved CR implemented with deploy evidence. */
const BASE = 'https://nexus-hrms-demo.vercel.app';
const EMAIL = 'superadmin@3boxeshrms.com';
const PASS = 'MarqAI@2026';
const CR_ID = 'cmvnlarmz000108kxzn6dxa97';
const DEPLOY_COMMIT = '8d6cb425';

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

(async () => {
  const login = await api('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
  const token = login.json?.token;
  if (!token) { console.error('LOGIN FAILED'); process.exit(1); }

  const patch = await api(`/api/super-admin/change-requests/${CR_ID}`, {
    method: 'PATCH',
    token,
    body: {
      action: 'implement',
      deployCommit: DEPLOY_COMMIT,
      comment:
        'IMPLEMENTED @ ' + DEPLOY_COMMIT + ' (v1.7.0 build 34 live on BOTH Vercel projects). ' +
        'LIVE E2E scripts/task142-postdeploy-verify.cjs: 19/19 PASS — ' +
        'app-version 1.7.0(34) on demo + marqaitechgroup; v1.7.0 APK serves (21,033,276 bytes) + alias; ' +
        'OTP: phone request sent:true masked ad***@techstart.com with channels={email:true} (SMTP-first delivery — the root cause fix), ' +
        'request by REGISTERED EMAIL identity works (new), unknown→404 OTP_NO_ACCOUNT, injected known-code verify→200 session, ' +
        '/api/auth/me works with the OTP session (role=tenant_admin), marqai OTP request sent, apex sweep 404 (demo excluded); ' +
        'pre-auth Contact HR: ticket TK-183662 created via /api/public/helpdesk-tickets, visible in the web Support & AI queue, ' +
        'admin received the in-app alert ("Login help ticket TK-183662") and HR/Admin/IT email alerts via the repaired SMTP path; ' +
        'empty payload→400; /dashboard + /login serve 200. ' +
        'FIXES DURING CLOSE-OUT: (1) Notification.tenantId FK — tenant id now resolved from the resolved DB on hosts without a tenant subdomain; ' +
        '(2) ADMIN_ROLES expanded to cover demo tenant roles (tenant_admin/hr_admin/ceo/company_hr_admin); ' +
        '(3) dropped the invalid email:{not:null} Prisma filter (User.email non-nullable) that silently emptied the admin list. ' +
        'Note: the release also merges the parallel session\u2019s Task 142 implementation (dual-channel OTP with SMS gateway support, ' +
        '/api/public/helpdesk-tickets, compact dashboard, SmartHR chat restyle, v1.7.0 docs) — the merged tree was verified as one release.',
    },
  });
  console.log('implement PATCH status:', patch.status);
  const list = await api('/api/super-admin/change-requests', { token });
  const reqs = list.json?.requests || [];
  const cr = reqs.find((r) => r.id === CR_ID);
  console.log('CR state now:', cr?.status, '| deployCommit:', cr?.deployCommit || cr?.implementCommit || 'n/a');
  console.log('total CRs:', reqs.length, '| pending:', reqs.filter((r) => r.status === 'pending').length);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
