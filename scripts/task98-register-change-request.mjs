/**
 * Task 98 — register the golden-rule change request (governance trail).
 * Registered under the user's direct authorization in the Task 98 request;
 * approval email goes to mahesh@marqaitech.com; marked implemented after deploy.
 */
const BASE = 'https://3boxeshrms.com';
const HDRS = { 'Content-Type': 'application/json' };

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: HDRS, body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }) }).then((r) => r.json());
  const token = login.token || login.accessToken;
  if (!token) { console.log('LOGIN FAILED'); process.exit(1); }
  const auth = { ...HDRS, Authorization: `Bearer ${token}` };

  const cr = await fetch(`${BASE}/api/super-admin/change-requests`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      title: 'Task 98 — golden rule enforcement: /api/companies + switcher scope on subscriptions/transactions',
      description: 'Deployed under the user\'s direct authorization in the Task 98 request ("make it a golden rule now and update it in vercel now"). (1) GET /api/companies, super-admin unscoped view: excludes ALL hidden/seed tenants\' companies (resolved per request host via tenant-filter) — previously returned the seed tenants\' 7 dummy companies (Apex Services, Global Dynamics, Innovatech, Prime Healthcare, SparkL-ight, Stellar, TechNova) and no real data; with a switcher tenant selected it strictly returns that tenant\'s companies from its dedicated DB. (2) /super-admin subscriptions + purchase-transactions pages now send the company-switcher tenantId (API scoping already existed). Commit 3b5b3d3a.',
      module: 'super-admin',
    }),
  });
  const body = await cr.json();
  console.log(`create: HTTP ${cr.status} id=${body.request?.id} emailSent=${body.emailSent} to=${body.approvalEmailTo}`);
  if (cr.status !== 201 && cr.status !== 200) process.exit(1);

  const appr = await fetch(`${BASE}/api/super-admin/change-requests/${body.request.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ action: 'approve' }) }).then((r) => r.json());
  console.log(`approve: ${appr.request?.status} (${appr.request?.approvalMethod})`);

  const impl = await fetch(`${BASE}/api/super-admin/change-requests/${body.request.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ action: 'implement', deployCommit: '3b5b3d3a' }) }).then((r) => r.json());
  console.log(`implement: ${impl.request?.status} commit=${impl.request?.deployCommit}`);

  const list = await fetch(`${BASE}/api/super-admin/change-requests`, { headers: auth }).then((r) => r.json());
  console.log(`trail: total=${list.requests?.length} pending=${list.counts?.pending}`);
}

main().catch((e) => { console.log('ERR', e.message); process.exit(1); });
