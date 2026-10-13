/**
 * Task 94 — register the `demo` tenant in the REAL platform DB via the deployed super-admin APIs
 * (the demo project's platform DB is a separate endpoint unreachable directly — same topology as LIVE).
 * Steps: superadmin login → POST /api/tenants → POST /api/tenant-database/provision → test → list.
 */
const BASE = 'https://nexus-hrms-mu.vercel.app';
const POOLER_CS = 'postgresql://neondb_owner:npg_pxZd8woKe4WB@ep-blue-fire-aqk8jxd2-pooler.c-8.us-east-1.aws.neon.tech/tenant_demo?sslmode=require&connect_timeout=10';

async function main() {
  // 1. super admin login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
  });
  const login = await loginRes.json();
  if (!login.token) { console.error('superadmin login failed:', loginRes.status, JSON.stringify(login).slice(0, 300)); process.exit(1); }
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };
  console.log('✓ superadmin logged in');

  // 2. create the tenant
  const createRes = await fetch(`${BASE}/api/tenants`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      name: '3Boxes Test Demo', slug: 'demo', domain: 'demo.3boxeshrms.com',
      plan: 'enterprise', country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata',
      language: 'en', baseCurrency: 'INR', maxCompaniesAllowed: 10,
      adminName: 'Demo Admin', adminEmail: 'admin@demo.3boxeshrms.com', adminPassword: 'MarqAI@2026',
    }),
  });
  const created = await createRes.json();
  if (createRes.status === 409) {
    console.log('tenant already exists (409) — fetching existing');
  } else if (!createRes.ok) {
    console.error('CREATE TENANT FAILED:', createRes.status, JSON.stringify(created).slice(0, 400));
    process.exit(1);
  } else {
    console.log('✓ tenant created in REAL platform DB');
  }
  const tenantId = created.tenant?.id;
  console.log('REAL tenantId:', tenantId || '(409 path — will look up)');

  // 3. look up the tenant id (robust either way)
  const listRes = await fetch(`${BASE}/api/tenants?query=demo&limit=50`, { headers: auth });
  const list = await listRes.json();
  const tenants = list.tenants || list.data || list;
  const arr = Array.isArray(tenants) ? tenants : tenants?.tenants || [];
  const demo = arr.find(t => t.slug === 'demo');
  console.log('tenant list hit:', demo ? JSON.stringify({ id: demo.id, name: demo.name, slug: demo.slug, status: demo.status, domain: demo.domain }) : 'NOT FOUND');
  const realId = demo?.id || tenantId;
  if (!realId) { console.error('No tenant id resolved — aborting'); process.exit(1); }

  // 4. provision (register) the tenant database connection
  const provRes = await fetch(`${BASE}/api/tenant-database/provision`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ tenantId: realId, connectionString: POOLER_CS, databaseName: 'tenant_demo' }),
  });
  const prov = await provRes.json();
  console.log('provision:', provRes.status, JSON.stringify(prov).slice(0, 300));

  // 5. test connectivity from the deployed runtime
  const testRes = await fetch(`${BASE}/api/tenant-database/test`, { method: 'POST', headers: auth, body: JSON.stringify({ slug: 'demo' }) });
  const test = await testRes.json();
  console.log('test:', testRes.status, JSON.stringify(test).slice(0, 300));

  // 6. flush the tenant DB client cache server-side
  const flushRes = await fetch(`${BASE}/api/tenant-database/flush-cache`, { method: 'POST', headers: auth, body: JSON.stringify({ slug: 'demo' }) });
  console.log('flush-cache:', flushRes.status);

  // 7. database list to confirm registration
  const dbListRes = await fetch(`${BASE}/api/tenant-database/list`, { headers: auth });
  const dbList = await dbListRes.json();
  const rows = dbList.databases || dbList.data || dbList;
  const rowArr = Array.isArray(rows) ? rows : rows?.databases || [];
  const mine = rowArr.find(r => r.databaseName === 'tenant_demo' || r.slug === 'demo');
  console.log('registry row:', mine ? JSON.stringify(mine).slice(0, 300) : JSON.stringify(rowArr).slice(0, 300));
}
main().catch(e => { console.error('API REGISTRATION FAILED:', e.message); process.exit(1); });
