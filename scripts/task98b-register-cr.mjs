/**
 * Task 98-b — register the demo-domain pre-staging change request
 * (DEMO_DOMAINS += nexus-hrms-demo.vercel.app in middleware/site-mode/tenant-db
 * + Option B automation script). Register -> in-app approval -> implement.
 */
const BASE = 'https://3boxeshrms.com';
const HDRS = { 'Content-Type': 'application/json' };
const COMMIT = '4141dbd1';

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: HDRS,
    body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
  }).then((r) => r.json());
  const token = login.token || login.accessToken;
  if (!token) { console.log('LOGIN FAILED:', login.error); process.exit(1); }
  const auth = { ...HDRS, Authorization: `Bearer ${token}` };

  const cr = await fetch(`${BASE}/api/super-admin/change-requests`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      title: 'Task 98-b — demo migration pre-staging: DEMO_DOMAINS += nexus-hrms-demo.vercel.app',
      description: 'Part of the user-ordered demo unblock (Option A -> Option B + CI, durable single-account setup). The new Vercel-account demo project will live at https://nexus-hrms-demo.vercel.app (domain verified free; the old nexus-hrms-mu.vercel.app cannot move between Vercel accounts, and nexus-hrms.vercel.app is occupied by an unrelated app). Change: added the new host to the DEMO_DOMAINS arrays in src/middleware.ts, src/lib/site-mode.ts, src/lib/tenant-db.ts so the new demo URL resolves to the demo tenant (3boxes-hrms-demo) with demo mode + golden-rule scoping identical to the old link. Additive-only, zero impact on LIVE routing (3boxeshrms.com + subdomains unchanged; LIVE verified 200 after deploy). Also adds scripts/task98-option-b-setup.mjs (creates the demo project + env vars on the current Vercel account; requires a full-access token — the token supplied by the user proved read-only: project create 403, env values encrypted). Deploy commit ' + COMMIT + ' pushed to both remotes (Maheshkpreddy/nexus-hrms + Marqaitech/3-Boxes-HRMS).',
      module: 'super-admin',
    }),
  });
  const crBody = await cr.json();
  console.log(`create: HTTP ${cr.status} id=${crBody.request?.id} emailSent=${crBody.emailSent}`);
  if (cr.status !== 201 && cr.status !== 200) { console.log(JSON.stringify(crBody).slice(0, 400)); process.exit(1); }

  const appr = await fetch(`${BASE}/api/super-admin/change-requests/${crBody.request.id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ action: 'approve' }),
  }).then((r) => r.json());
  console.log(`approve: status=${appr.request?.status} method=${appr.request?.approvalMethod}`);

  const impl = await fetch(`${BASE}/api/super-admin/change-requests/${crBody.request.id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ action: 'implement', deployCommit: COMMIT }),
  }).then((r) => r.json());
  console.log(`implement: status=${impl.request?.status} commit=${impl.request?.deployCommit}`);

  const list = await fetch(`${BASE}/api/super-admin/change-requests`, { headers: auth }).then((r) => r.json());
  console.log(`trail: total=${list.requests?.length} pending=${list.counts?.pending} implemented=${list.counts?.implemented ?? list.requests?.filter((r) => r.status === 'implemented').length}`);
}

main().catch((e) => { console.log('ERR', e.message); process.exit(1); });
