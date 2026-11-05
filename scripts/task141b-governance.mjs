// Task 141 close-out — governance: register + approve BEFORE push.
// Docs-only: mobile-app SOP PPT (13 → 15 slides) + PDF (12 → 14 pages) updated
// with the v1.6.6 features — new login flow (welcome / Mobile Number | Employee
// ID tabs / OTP / fingerprint), What's New slide, HR Help Desk chapter + slide,
// dashboard upgrade (announcements banner, last-week attendance chart, Quick
// Links, birthdays), chat in bottom nav + web chat FAB parity, roles matrix
// rows, troubleshooting rows. Plus worklog Task 141 entry + doc render/QA
// scripts. No app code, no schema, no env changes.
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
    title: 'Task 141 close-out — mobile app SOP PPT + PDF documentation updated to v1.6.6 (login flow, HR Help Desk, dashboard, chat), worklog entry; docs-only',
    description:
      'User request: "once done update these in the mobile app ppt and pdf too for documentation purpose to download and explain." ' +
      'The Task 140 SOP documents predate the Task 141 features, so both are refreshed to v1.6.6 (build 33): ' +
      '(1) PPT 13 → 15 slides — new "What\'s New in v1.6.6" highlights slide; Signing In rewritten to the shipped flow (starry welcome, Mobile Number | Employee ID tabs, OTP verification with resend countdown, Face ID/fingerprint unlock, Contact HR); Home Dashboard Tour rewritten (announcements banner, Last week Attendance chart with absent-red bars, Quick Links rail incl. Help Desk/Feeds/Reports, birthdays today + 45 days, bottom nav Home·Chat·Attendance·Profile, floating chat bubble); new HR Help Desk slide (raise/track/reply, web Support & AI parity flow diagram, ticket hygiene); Projects/Tasks/Chat updated for bottom-nav chat + web chat FAB; HR/Admin gains Help Desk Ops card; Roles matrix + raise/reply/view-status/chat rows; Golden Rules gains ticket habit + OTP/ticket fixes; cover/getting-started/closing bumped to v1.6.6. slides_brief.json + global.css synced; slide QA (overflow check) clean; exported via skills/pptx/batch_html2pptx.js to download/3boxes-hrms-mobile-app-sop-training.pptx (15 slides, 16:9). ' +
      '(2) PDF 12 → 14 pages — Chapter 2 login rewritten to the shipped flow; Chapter 3 dashboard rewritten (banner, chart, quick links, birthdays, org card, bottom nav); NEW Chapter 4 HR Help Desk (ticket lifecycle, self-scope, HR/Admin ops view, hygiene); chapters renumbered 5–12; chat bullet updated for bottom-nav + web FAB; HR/Admin adds ticket operations; roles matrix +3 rows; troubleshooting + OTP/ticket rows; cover/ending v1.6.6. Rendered via Playwright (720x1020) to download/3boxes-hrms-mobile-app-sop-training.pdf; content needles verified. ' +
      '(3) Repo worklog.md gains the missing Task 141 entry; new render/QA scripts persisted under scripts/. NO app code, schema, env, tenant or APK changes — version chain untouched (live v1.6.6 (33) already verified).',
    category: 'documentation',
    riskLevel: 'low',
    module: 'Documentation',
    relatedModule: 'Mobile App / Support & AI (Help Desk) / Collaboration (Chat, Feeds)',
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
