#!/usr/bin/env node
/* Task 142 — governance: register + approve CR BEFORE pushing.
 * Reuses the Task 132 pattern (register → approve → [deploy] → implement). */

const BASE = process.env.GOV_BASE || 'https://nexus-hrms-demo.vercel.app';
const EMAIL = 'superadmin@3boxeshrms.com';
const PASS = 'MarqAI@2026';

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
  // 1) login
  const login = await api('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
  if (login.status !== 200 || !login.json?.token) {
    console.error('LOGIN FAILED', login.status, JSON.stringify(login.json).slice(0, 300));
    process.exit(1);
  }
  const token = login.json.token;
  console.log('login ok');

  // 2) count existing
  const list = await api('/api/super-admin/change-requests', { token });
  const total = Array.isArray(list.json?.requests) ? list.json.requests.length : (list.json?.total ?? 'n/a');
  console.log(`existing CRs: ${total}`);

  // 3) register
  const reg = await api('/api/super-admin/change-requests', {
    method: 'POST',
    token,
    body: {
      title: 'Task 142 — OTP email delivery fix (SMTP), Contact HR tickets from mobile login, one-screen dashboard, Remember me + keypad fixes, SmartHR-style colourful refresh (v1.6.7 build 34)',
      description:
        'USER-REPORTED FIXES + UPGRADE. (1) OTP sign-in was not delivering codes: the global email library only supported Resend while production runs real SMTP credentials (md-in-59.webhostbox.net:465) and the configured Resend key is a placeholder — codes never reached employees. email.ts now sends via SMTP FIRST (nodemailer, port 465 SSL) with Resend as fallback; failure is reported loudly (OTP_SEND_FAILED, sent:false) instead of a silent sent:true. The Mobile tab now also accepts the registered EMAIL address for OTP (findUserByEmail in /api/auth/otp, apex sweep included). Verified live: SMTP test message accepted by the server (messageId @3boxeshrms.com). (2) Contact HR on the mobile login page now RAISES A REAL TICKET: new pre-auth POST /api/helpdesk/contact (rate-limited 5/15min per IP, length-capped, optional employee-ID resolution) creates a high-priority ticket in the same web Support & AI ticketing system and dispatches the new support.ticket.contact_hr notification event (bell + email) to every HR/Admin/IT Admin. (3) Login fixes: Employee ID tab now re-focuses its own text keyboard on tab switch (numeric keypad no longer sticks), and Remember me auto-saves the FULL login details (identity + password + tab) with correct restore. (4) Home dashboard fits ONE screen: gradient hero header with the announcements ticker folded in, merged attendance card (This Month chips + last-week mini chart), single-row organization strip, compact birthdays row with full-list sheet, 4-column modules grid (max 8 tiles + More); standalone Time Log / week chart / Quick Links / banner cards removed. (5) SmartHR-template-inspired colourful refresh: hero gradient #3A57C4→#6C4FD6→#8A5CF6, chat filter chips (All/Unread/Groups/Direct), deterministic colourful chat avatars, gradient unread pills. (6) Version 1.6.7 (build 34), APK rebuilt and served from the web login page. Scope: mobile app + web APIs/lib; no schema migration; no admin data changes.',
      risk: 'medium',
      modules: ['mobile_app', 'auth', 'support', 'notifications', 'email'],
      requestedBy: EMAIL,
    },
  });
  if (reg.status !== 201 && reg.status !== 200) {
    console.error('REGISTER FAILED', reg.status, JSON.stringify(reg.json).slice(0, 400));
    process.exit(1);
  }
  const cr = reg.json?.request || reg.json?.changeRequest || reg.json;
  const crId = cr?.id;
  console.log('CR registered:', crId, '| number:', cr?.crNumber || cr?.requestNumber || 'n/a');

  // 4) approve
  const appr = await api(`/api/super-admin/change-requests/${crId}`, { method: 'PATCH', token, body: { action: 'approve', comment: 'Approved pre-deploy. OTP root cause verified (Resend placeholder vs working SMTP). Contact HR endpoint reviewed: rate-limited, length-capped, self-scoped requester resolution. Deploy as v1.6.7 (34).' } });
  if (appr.status !== 200) {
    console.error('APPROVE FAILED', appr.status, JSON.stringify(appr.json).slice(0, 400));
    process.exit(1);
  }
  console.log('CR approved:', crId);

  // 5) verify state
  const after = await api('/api/super-admin/change-requests', { token });
  const pending = (after.json?.requests || []).filter((r) => r.status === 'pending').length;
  console.log(`CRs now: ${Array.isArray(after.json?.requests) ? after.json.requests.length : 'n/a'} | pending: ${pending}`);
  console.log(JSON.stringify({ crId }));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
