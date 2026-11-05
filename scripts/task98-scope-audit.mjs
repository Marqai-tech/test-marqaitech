/**
 * Task 98 — golden-rule audit: scoped vs unscoped data on LIVE + demo super admins.
 * READ-ONLY.
 */
const HDRS = { 'Content-Type': 'application/json' };

async function probe(name, base, creds) {
  console.log(`\n===== ${name} =====`);
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: HDRS, body: JSON.stringify(creds) }).then((r) => r.json());
  const token = login.token || login.accessToken;
  if (!token) { console.log('LOGIN FAIL', JSON.stringify(login).slice(0, 150)); return; }
  const auth = { Authorization: `Bearer ${token}` };

  const ctx = await fetch(`${base}/api/me/context`, { headers: auth }).then((r) => r.json()).catch(() => ({}));
  const tenants = (ctx.availableTenants || []).map((t) => `${t.slug}(${t.id.slice(-6)})`);
  console.log(`switcher tenants: ${tenants.join(', ') || '(none)'}`);
  const realId = ctx.tenant?.id;

  // unscoped views
  for (const p of ['/api/tenants', '/api/subscriptions?limit=100', '/api/companies', '/api/super-admin/trial-stats']) {
    const b = await fetch(`${base}${p}`, { headers: auth }).then((r) => r.json()).catch(() => ({}));
    const arr = b.tenants || b.subscriptions || b.companies || b.requests || b || [];
    const names = Array.isArray(arr) ? arr.slice(0, 8).map((x) => x.slug || x.name || x.companyName || x.tenant?.slug || x.tenant?.name || x.id?.slice(-6)) : '(obj)';
    console.log(`unscoped GET ${p}: count=${Array.isArray(arr) ? arr.length : '?'} [${Array.isArray(names) ? names.join(', ') : names}]`);
  }

  // scoped views
  if (realId) {
    for (const p of [`/api/subscriptions?limit=100&tenantId=${realId}`, `/api/companies?tenantId=${realId}`, `/api/super-admin/dashboard?tenantId=${realId}&full=1`]) {
      const b = await fetch(`${base}${p}`, { headers: auth }).then((r) => r.json()).catch(() => ({}));
      const arr = b.subscriptions || b.companies || b.recentTransactions || b || [];
      const extra = b.totalCompanies !== undefined ? ` companies=${b.totalCompanies} tenants=${b.totalTenants} scopeTenant=${b.scopeTenant?.slug}` : '';
      const names = Array.isArray(arr) ? arr.slice(0, 8).map((x) => x.slug || x.name || x.companyName || x.tenant?.name || x.id?.slice(-6)) : '(obj)';
      console.log(`scoped  GET ${p.split('?')[0]}: count=${Array.isArray(arr) ? arr.length : '?'} [${Array.isArray(names) ? names.join(', ') : names}]${extra}`);
    }
  }
}

await probe('LIVE super admin (3boxeshrms.com)', 'https://3boxeshrms.com', { email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' });
await probe('DEMO super admin (nexus-hrms-mu.vercel.app — OLD build)', 'https://nexus-hrms-mu.vercel.app', { email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' });
