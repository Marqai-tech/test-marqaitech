/**
 * E2E verification: reporting-manager ADD/EDIT/VIEW parity on the DEMO site.
 * 1. Wait until the deployed list API returns the reportingManager relation.
 * 2. API: list row carries manager name; detail GET carries manager + directReports.
 * 3. Simulate the user's exact flow: PUT a manager change, confirm persisted + list shows new name, restore.
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
  try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  return { status: res.status, data };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 0. Wait for deployment: list API must include reportingManager relation
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' }) });
  if (login.status !== 200) { console.error('LOGIN FAILED', login.status); process.exit(1); }
  const H = { Authorization: `Bearer ${login.data.token}` };
  console.log('✓ logged in as admin');

  let deployed = false;
  for (let i = 0; i < 30; i++) {
    const list = await api('/api/employees?limit=500', { headers: H });
    const emps = list.data.employees || [];
    if (emps.some(e => 'reportingManager' in e)) { deployed = true; console.log(`✓ deployment live (attempt ${i + 1}) — list rows carry reportingManager relation`); break; }
    console.log(`  waiting for deployment... (${i + 1})`);
    await sleep(20000);
  }
  if (!deployed) { console.error('✗ deployment did not propagate in time'); process.exit(1); }

  // 1. List rows show manager names
  const list = await api('/api/employees?limit=500', { headers: H });
  const emps = list.data.employees || [];
  const withMgr = emps.filter(e => e.reportingManager);
  console.log(`✓ list: ${withMgr.length}/${emps.length} employees show a manager name, e.g. ${withMgr.slice(0, 3).map(e => `${e.firstName} ${e.lastName} → ${e.reportingManager.firstName} ${e.reportingManager.lastName}`).join(' | ')}`);

  // 2. Detail GET carries manager + directReports
  const manu = emps.find(e => `${e.firstName} ${e.lastName}` === 'Manu Tilak');
  const det = await api(`/api/employees/${manu.id}`, { headers: H });
  const d = det.data.employee;
  console.log(`✓ detail GET: reportingManager=${d.reportingManager ? `${d.reportingManager.firstName} ${d.reportingManager.lastName} (${d.reportingManager.employeeId})` : '(none)'} | directReports=${d._count?.directReports ?? '?'}`);

  // 3. User's exact flow: EDIT → change manager → verify → restore
  const original = manu.reportingManagerId || null;
  const cand = emps.find(e => e.companyId === manu.companyId && e.status === 'active' && e.id !== manu.id && e.id !== original);
  console.log(`\n→ EDIT flow: change Manu's manager from original (${original ?? 'none'}) to ${cand.firstName} ${cand.lastName}`);
  const put = await api(`/api/employees/${manu.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ reportingManagerId: cand.id }) });
  console.log(`  PUT status: ${put.status}`);
  const list2 = await api('/api/employees?limit=500', { headers: H });
  const manu2 = (list2.data.employees || []).find(e => e.id === manu.id);
  const shownOk = manu2?.reportingManager?.id === cand.id;
  console.log(`  list now shows: ${manu2?.reportingManager ? `${manu2.reportingManager.firstName} ${manu2.reportingManager.lastName}` : '(none)'} — ${shownOk ? '✓ UPDATE VISIBLE IN LIST' : '✗ NOT VISIBLE'}`);
  const det2 = await api(`/api/employees/${manu.id}`, { headers: H });
  const viewOk = det2.data.employee.reportingManager?.id === cand.id;
  console.log(`  view page would show: ${det2.data.employee.reportingManager ? `${det2.data.employee.reportingManager.firstName} ${det2.data.employee.reportingManager.lastName}` : '(none)'} — ${viewOk ? '✓ UPDATE VISIBLE IN VIEW' : '✗ NOT VISIBLE'}`);

  // 4. Restore original manager
  const put2 = await api(`/api/employees/${manu.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ reportingManagerId: original }) });
  console.log(`\n→ RESTORE original manager: status ${put2.status}`);
  const det3 = await api(`/api/employees/${manu.id}`, { headers: H });
  console.log(`✓ final: ${det3.data.employee.reportingManager ? `${det3.data.employee.reportingManager.firstName} ${det3.data.employee.reportingManager.lastName}` : '(none)'} (expected original ${original ?? 'none'})`);

  console.log('\nALL API CHECKS ' + (shownOk && viewOk ? 'PASSED' : 'FAILED'));
  process.exit(shownOk && viewOk ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
