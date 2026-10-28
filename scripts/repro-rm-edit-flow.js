/**
 * Reproduce the user's reported flow on the DEMO site:
 * 1. Login as admin
 * 2. GET employee (Manu Tilak) -> read current reportingManagerId
 * 3. PUT (same as the Edit Employee form does) with a DIFFERENT manager
 * 4. GET again -> verify persisted
 * 5. PUT back to the original manager (restore state)
 * Read-only with respect to final state (restores original manager).
 */
const BASE = 'https://nexus-hrms-mu.vercel.app';
const TENANT = '3boxes-hrms-demo';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-tenant-slug': TENANT, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 300); }
  return { status: res.status, data };
}

(async () => {
  // 1. Login
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' }),
  });
  if (login.status !== 200) { console.error('LOGIN FAILED', login.status, login.data); process.exit(1); }
  const token = login.data.token;
  const H = { Authorization: `Bearer ${token}` };
  console.log('✓ logged in as admin');

  // 2. List employees to pick Manu Tilak + candidate managers
  const list = await api('/api/employees?limit=500', { headers: H });
  const emps = (list.data.employees || list.data.data || list.data.items || []);
  console.log(`✓ fetched ${emps.length} employees`);

  const manu = emps.find(e => `${e.firstName} ${e.lastName}` === 'Manu Tilak');
  if (!manu) { console.error('Manu Tilak not found. Names:', emps.map(e => `${e.firstName} ${e.lastName}`).join(', ')); process.exit(1); }
  console.log(`Manu Tilak: id=${manu.id} company=${manu.companyId} currentManagerId=${manu.reportingManagerId ?? '(none)'}`);

  // Same-company active candidates
  const candidates = emps.filter(e => e.id !== manu.id && e.companyId === manu.companyId && e.status === 'active');
  console.log('Same-company candidates:', candidates.map(e => `${e.firstName} ${e.lastName} (${e.employeeId})`).join(' | '));

  const original = manu.reportingManagerId || null;
  const alt = candidates.find(e => e.id !== original);

  // 3. PUT with the alternate manager (exactly what the Edit form sends)
  if (alt) {
    console.log(`\n→ PUT: assign manager -> ${alt.firstName} ${alt.lastName} (${alt.id})`);
    const put1 = await api(`/api/employees/${manu.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ reportingManagerId: alt.id }),
    });
    console.log('PUT status:', put1.status, put1.status !== 200 ? JSON.stringify(put1.data) : 'OK');

    // 4. GET fresh -> check persisted
    const get1 = await api(`/api/employees/${manu.id}`, { headers: H });
    const fresh = get1.data.employee;
    console.log(`After PUT: reportingManagerId=${fresh.reportingManagerId ?? '(none)'} | expected=${alt.id} | ${fresh.reportingManagerId === alt.id ? '✓ PERSISTED' : '✗ NOT PERSISTED'}`);

    // 5. Restore original
    console.log(`\n→ RESTORE: original manager -> ${original ?? '(none)'}`);
    const put2 = await api(`/api/employees/${manu.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ reportingManagerId: original }),
    });
    console.log('RESTORE status:', put2.status);
    const get2 = await api(`/api/employees/${manu.id}`, { headers: H });
    console.log(`Final state: reportingManagerId=${get2.data.employee.reportingManagerId ?? '(none)'} (original: ${original ?? '(none)'})`);
  }

  // 6. Also check what the LIST endpoint returns per employee (for list-column work)
  const sample = emps.find(e => e.reportingManagerId);
  console.log('\nList row keys sample:', sample ? Object.keys(sample).sort().join(', ') : '(none with manager)');
  console.log('List row has reportingManager relation?', sample ? ('reportingManager' in sample ? JSON.stringify(sample.reportingManager) : 'NO — only raw id') : '-');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
