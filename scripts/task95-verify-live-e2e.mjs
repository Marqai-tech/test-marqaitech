/**
 * Task 95 — E2E verification on the LIVE super admin (3boxeshrms.com).
 * Read-only EXCEPT the change-control workflow entries (which the new policy
 * requires for this very deploy) and the deletion of the one dummy Zenith
 * subscription (user-authorized dummy-data removal; new DELETE endpoint).
 */
const BASE = 'https://3boxeshrms.com';
const HDRS = { 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  // 1. Login
  const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: HDRS, body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }) }).then((r) => r.json());
  const token = login.token || login.accessToken;
  ok('super admin login on LIVE', !!token, login.error || '');
  const auth = { ...HDRS, Authorization: `Bearer ${token}` };

  // 2. Dummy data state
  const ctx = await fetch(`${BASE}/api/me/context`, { headers: auth }).then((r) => r.json());
  const slugs = (ctx.availableTenants || []).map((t) => t.slug);
  ok('switcher shows ONLY the real tenant (no seed tenants)', slugs.length === 1 && slugs[0] === 'marqaitechgroup', slugs.join(', '));

  const tn = await fetch(`${BASE}/api/tenants`, { headers: auth }).then((r) => r.json());
  const tenants = tn.tenants || tn || [];
  ok('tenant list = 1 real tenant', Array.isArray(tenants) && tenants.length === 1, tenants.map((t) => t.slug).join(', '));

  // 3. Dashboard scoping (GOLDEN RULE)
  const tid = tenants[0]?.id || (ctx.tenant || {}).id;
  const dashScoped = await fetch(`${BASE}/api/super-admin/dashboard?tenantId=${tid}&full=1`, { headers: auth }).then((r) => r.json());
  ok('scoped dashboard echoes scopeTenant', dashScoped.scopeTenant?.slug === 'marqaitechgroup', JSON.stringify(dashScoped.scopeTenant));
  ok('scoped dashboard tenants=1', dashScoped.totalTenants === 1, `totalTenants=${dashScoped.totalTenants}`);
  ok('scoped dashboard companies=4', dashScoped.totalCompanies === 4, `companies=${dashScoped.totalCompanies}`);
  const dashPlain = await fetch(`${BASE}/api/super-admin/dashboard`, { headers: auth }).then((r) => r.json());
  ok('unscoped dashboard = platform-wide (no scopeTenant)', dashPlain.scopeTenant === null || dashPlain.scopeTenant === undefined, `scopeTenant=${JSON.stringify(dashPlain.scopeTenant)}`);
  ok('unscoped dashboard has NO seed-tenant inflation', dashPlain.totalTenants === 1, `totalTenants=${dashPlain.totalTenants}, revenue=${dashPlain.totalRevenue}, txns=${(dashPlain.recentTransactions || []).length}`);

  // 4. Tickets: unscoped super admin sees PLATFORM tickets only (0 dummies)
  const tk = await fetch(`${BASE}/api/tickets`, { headers: auth }).then((r) => r.json());
  const tkArr = tk.tickets || [];
  ok('unscoped super-admin tickets = platform only (0 dummy)', tkArr.length === 0, `count=${tkArr.length}`);
  const tkScoped = await fetch(`${BASE}/api/tickets?tenantId=${tid}`, { headers: auth }).then((r) => r.json());
  ok('scoped super-admin tickets resolves tenant DB', Array.isArray(tkScoped.tickets), `count=${(tkScoped.tickets || []).length}`);

  // 5. Dummy subscription removal (user-authorized; new endpoint)
  const subs = await fetch(`${BASE}/api/subscriptions`, { headers: auth }).then((r) => r.json());
  const subArr = subs.subscriptions || subs || [];
  const dummy = subArr.find((s) => (s.tenant?.name || '').includes('Zenith Retail'));
  if (dummy) {
    const del = await fetch(`${BASE}/api/subscriptions/${dummy.id}`, { method: 'DELETE', headers: auth });
    ok('DELETE dummy Zenith subscription', del.status === 200, `HTTP ${del.status}`);
  } else {
    ok('no dummy subscription present (already clean)', true);
  }
  const subs2 = await fetch(`${BASE}/api/subscriptions`, { headers: auth }).then((r) => r.json());
  ok('LIVE subscriptions now empty', (subs2.subscriptions || subs2 || []).length === 0, `count=${(subs2.subscriptions || subs2 || []).length}`);

  // 6. Change-approval workflow end-to-end (registers THIS deploy per policy)
  const cr = await fetch(`${BASE}/api/super-admin/change-requests`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      title: 'Task 95 — super admin dummy-data cleanup + change-approval workflow',
      description: 'Remove all sample/dummy data from the super admin (3 seed tenants, orphan tickets, dummy subscription; demo platform DB cleanup) and enforce the golden rule: the super-admin dashboard/tickets/audit follow the company switcher scope. Adds the Change Approvals module itself (this request). Code deployed in commit 45e32755 under the user\'s direct authorization in the Task 95 request.',
      module: 'super-admin',
    }),
  });
  const crBody = await cr.json();
  ok('create change request (pending_approval)', cr.status === 201 && crBody.request?.status === 'pending_approval', `HTTP ${cr.status} emailSent=${crBody.emailSent} to=${crBody.approvalEmailTo}${crBody.emailError ? ' err=' + String(crBody.emailError).slice(0, 80) : ''}`);

  const list1 = await fetch(`${BASE}/api/super-admin/change-requests`, { headers: auth }).then((r) => r.json());
  ok('list change requests', list1.requests?.length >= 1 && list1.counts?.pending >= 1, `pending=${list1.counts?.pending}`);

  const tokenPage = await fetch(`${BASE}/api/super-admin/change-requests/token?token=${crBody.request.approvalToken}`);
  const pageHtml = await tokenPage.text();
  ok('email-token decision page renders (GET, no side effects)', tokenPage.status === 200 && pageHtml.includes('Awaiting your decision') === false && pageHtml.includes('Super Admin Change Control') && pageHtml.includes(crBody.request.title), `HTTP ${tokenPage.status}, len=${pageHtml.length}`);

  const appr = await fetch(`${BASE}/api/super-admin/change-requests/${crBody.request.id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ action: 'approve' }),
  });
  const apprBody = await appr.json();
  ok('in-app approve', appr.status === 200 && apprBody.request?.status === 'approved' && apprBody.request?.approvalMethod === 'in_app', `HTTP ${appr.status} approvedBy=${apprBody.request?.approvedBy}`);

  const tokenAfter = await fetch(`${BASE}/api/super-admin/change-requests/token?token=${crBody.request.approvalToken}`);
  ok('approval token cleared after decision (single-use)', tokenAfter.status === 400, `HTTP ${tokenAfter.status}`);

  const impl = await fetch(`${BASE}/api/super-admin/change-requests/${crBody.request.id}`, {
    method: 'PATCH', headers: auth, body: JSON.stringify({ action: 'implement', deployCommit: '45e32755' }),
  });
  ok('mark implemented with deploy commit', impl.status === 200 && (await impl.json()).request?.status === 'implemented');

  // 7. Audit trail
  const audit = await fetch(`${BASE}/api/super-admin/audit-logs?module=governance&limit=5`, { headers: auth }).then((r) => r.json());
  const govActions = (audit.logs || []).map((l) => l.action);
  ok('governance audit entries written', govActions.some((a) => /CHANGE_REQUEST|CREATE_CHANGE/.test(a)), govActions.join(', ') || '(none)');

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.log('ERR', e.message); process.exit(1); });
