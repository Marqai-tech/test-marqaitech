/**
 * Task 95 — READ-ONLY inspection: what does the SUPER ADMIN actually see on LIVE + demo?
 * No writes anywhere. Dumps the data sources behind the super-admin UI so we can
 * identify every piece of dummy/sample data the user is complaining about.
 */
const SITES = [
  { name: 'LIVE', base: 'https://3boxeshrms.com' },
  { name: 'DEMO', base: 'https://nexus-hrms-mu.vercel.app' },
];
const EMAIL = 'superadmin@3boxeshrms.com';
const PASSWORD = 'MarqAI@2026';
const HDRS = { 'Content-Type': 'application/json' };

async function jget(url, auth) {
  const res = await fetch(url, { headers: { ...HDRS, ...(auth || {}) } });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

function brief(v, n = 160) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s == null) return 'null';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function inspect(site) {
  console.log(`\n═══════════════ ${site.name} — ${site.base} ═══════════════`);
  // 1. Login (platform super admin). On vercel.app host, middleware forces demo slug;
  //    platform users are the fallback there. On LIVE host, x-tenant-slug=marqaitechgroup,
  //    platform fallback again. No ?tenant= override needed for platform login.
  const loginRes = await fetch(`${site.base}/api/auth/login`, { method: 'POST', headers: HDRS, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const login = await loginRes.json().catch(() => ({}));
  const token = login.token || login.accessToken;
  console.log(`login: status=${loginRes.status} token=${token ? 'yes' : 'no'} err=${brief(login.error)}`);
  if (!token) return;
  const auth = { Authorization: `Bearer ${token}` };

  // 2. /api/me/context — what the company switcher shows
  const ctx = await jget(`${site.base}/api/me/context`, auth);
  console.log(`\n── /api/me/context status=${ctx.status}`);
  const c = ctx.body || {};
  console.log(`  role=${c.role} tenantId=${c.tenantId}`);
  (c.availableTenants || []).forEach((t) => console.log(`  tenant: ${t.name} [${t.slug}] id=${t.id} plan=${t.plan} status=${t.status}`));
  (c.availableCompanyGroups || []).forEach((g) => console.log(`  group: ${g.name} tenantId=${g.tenantId}`));
  (c.availableCompanies || []).forEach((k) => console.log(`  company: ${k.name} [${k.code}] group=${k.companyGroup?.name || k.companyGroupId}`));

  // 3. /api/tenants — tenant management list
  const tn = await jget(`${site.base}/api/tenants`, auth);
  console.log(`\n── /api/tenants status=${tn.status}`);
  const tenants = tn.body?.tenants || tn.body || [];
  if (Array.isArray(tenants)) {
    tenants.forEach((t) => {
      const comps = (t.companyGroups || []).flatMap((g) => g.companies || []);
      console.log(`  tenant: ${t.name} [${t.slug}] plan=${t.plan} status=${t.status} companies=${comps.length} (${comps.slice(0, 8).map((x) => x.code || x.name).join(', ')}) users=${t.users?.length ?? t._count?.users ?? '?'} employees=${t._count?.employees ?? t.employees?.length ?? '?'}`);
    });
  } else { console.log(`  body=${brief(tn.body, 400)}`); }

  // 4. /api/super-admin/dashboard — KPI cards + lists
  const dash = await jget(`${site.base}/api/super-admin/dashboard?full=1`, auth);
  console.log(`\n── /api/super-admin/dashboard?full=1 status=${dash.status}`);
  const d = dash.body || {};
  console.log(`  totals: tenants=${d.totalTenants} active=${d.activeTenants} companies=${d.totalCompanies} employees=${d.totalEmployees} revenue=${d.totalRevenue} health=${d.platformHealth}`);
  (d.recentTransactions || []).forEach((t) => console.log(`  recentTxn: ${t.company} ${t.currency}${t.amount} status=${t.status} date=${t.date}`));
  (d.recentlyRegistered || []).forEach((t) => console.log(`  recentReg: ${t.name} plan=${t.plan} date=${t.date}`));
  (d.expiringSubscriptions || []).forEach((t) => console.log(`  expiring: ${t.company} plan=${t.plan} end=${t.expiredDate} email=${t.email}`));
  (d.recentActivity || []).forEach((a) => console.log(`  recentAct: [${a.module}] ${a.action} by=${a.user?.email || a.userId} at=${a.createdAt}`));

  // 5. /api/tickets — super admin tickets page
  const tk = await jget(`${site.base}/api/tickets`, auth);
  console.log(`\n── /api/tickets status=${tk.status}`);
  const tickets = tk.body?.tickets || tk.body?.data || tk.body || [];
  if (Array.isArray(tickets)) {
    console.log(`  count=${tickets.length}`);
    tickets.slice(0, 12).forEach((t) => console.log(`  ticket: ${brief(t.subject || t.title)} tenant=${t.tenant?.name || t.tenantId || 'NONE'} status=${t.status}`));
  } else { console.log(`  body=${brief(tk.body, 300)}`); }

  // 6. /api/subscriptions — apply plan / transactions data
  const subs = await jget(`${site.base}/api/subscriptions`, auth);
  console.log(`\n── /api/subscriptions status=${subs.status}`);
  const subArr = subs.body?.subscriptions || subs.body || [];
  if (Array.isArray(subArr)) {
    console.log(`  count=${subArr.length}`);
    subArr.slice(0, 12).forEach((s) => console.log(`  sub: tenant=${s.tenant?.name || s.tenantId} plan=${s.plan?.name || s.planId} amount=${s.amount} status=${s.status} payment=${s.paymentStatus}`));
  } else { console.log(`  body=${brief(subs.body, 300)}`); }

  // 7. audit logs (super-admin audit page)
  const al = await jget(`${site.base}/api/super-admin/audit-logs?page=1&limit=10`, auth);
  console.log(`\n── /api/super-admin/audit-logs status=${al.status}`);
  const logs = al.body?.logs || al.body?.auditLogs || al.body?.data || [];
  if (Array.isArray(logs)) {
    console.log(`  total=${al.body?.total ?? logs.length}`);
    logs.slice(0, 10).forEach((l) => console.log(`  audit: [${l.module}] ${l.action} user=${l.user?.email || l.userId} at=${l.createdAt}`));
  } else { console.log(`  body=${brief(al.body, 300)}`); }
}

async function main() {
  for (const s of SITES) {
    try { await inspect(s); } catch (e) { console.log(`${s.name} FAILED: ${e.message}`); }
  }
}
main();
