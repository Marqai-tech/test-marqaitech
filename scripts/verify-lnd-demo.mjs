// Task 38 E2E — L&D module on the demo Vercel deployment (read-only on existing data)
const BASE = 'https://nexus-hrms-mu.vercel.app';
const EMAIL = 'admin@3boxeshrms.com';
const PASSWORD = 'MarqAI@2026';
let token = '';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); } else { fail++; console.log(`  FAIL ${name} ${extra}`); } };
async function api(path, method = 'GET', body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-tenant-slug': '3boxes-hrms-demo', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* html */ }
  return { status: res.status, json };
}
async function main() {
  const login = await api('/api/auth/login', 'POST', { email: EMAIL, password: PASSWORD });
  ok('login', login.status === 200 && !!login.json?.token);
  token = login.json?.token || '';
  if (!token) { console.log('no token — abort'); process.exit(1); }

  const dash = await api('/api/learning/dashboard');
  ok('dashboard', dash.status === 200 && dash.json?.data?.admin?.courseCount >= 10, `courses=${dash.json?.data?.admin?.courseCount} paths=${dash.json?.data?.admin?.pathCount}`);
  const courses = await api('/api/learning/courses');
  ok('catalog', courses.status === 200 && courses.json?.data?.length >= 10, `count=${courses.json?.data?.length}`);
  const paths = await api('/api/learning/paths');
  ok('paths', paths.status === 200 && paths.json?.data?.length >= 3, `count=${paths.json?.data?.length} (promotion=${paths.json?.data?.filter(p=>p.isPromotionTrack).length})`);
  const enr = await api('/api/learning/enrollments');
  ok('enrollments', enr.status === 200 && enr.json?.data?.length >= 60, `count=${enr.json?.data?.length} overdue=${enr.json?.stats?.overdue}`);
  const certs = await api('/api/learning/certificates');
  ok('certificates', certs.status === 200 && certs.json?.data?.length >= 40, `count=${certs.json?.data?.length} expiring60=${certs.json?.stats?.expiring60}`);
  const comp = await api('/api/learning/compliance');
  ok('compliance', comp.status === 200 && comp.json?.data?.requirements?.length === 3, `overall=${comp.json?.data?.overall}% depts=${comp.json?.data?.departments?.length}`);
  const so = await api('/api/learning/signoffs');
  ok('signoffs', so.status === 200 && so.json?.data?.length >= 2, `campaigns=${so.json?.data?.length}`);
  const gaps = await api('/api/learning/skill-gaps');
  ok('skill gaps (TNI)', gaps.status === 200 && gaps.json?.data?.length >= 6, `count=${gaps.json?.data?.length}`);
  const reqs = await api('/api/learning/requests');
  ok('requests', reqs.status === 200 && reqs.json?.data?.length >= 1, `count=${reqs.json?.data?.length}`);
  const an = await api('/api/learning/analytics');
  const k = an.json?.data?.kirkpatrick;
  ok('analytics totals', an.status === 200 && an.json?.data?.totals?.total >= 60, `total=${an.json?.data?.totals?.total} rate=${an.json?.data?.totals?.completionRate}%`);
  ok('Kirkpatrick L1', k?.l1?.overall != null, `overall=${k?.l1?.overall}/5 (n=${k?.l1?.responses})`);
  ok('Kirkpatrick L2', k?.l2?.delta != null, `pre=${k?.l2?.avgPre} → post=${k?.l2?.avgPost} (+${k?.l2?.delta})`);
  ok('Kirkpatrick L4', k?.l4?.spendINR > 0, `spend=₹${k?.l4?.spendINR?.toLocaleString('en-IN')} roi=${k?.l4?.roiPct}%`);

  // India payroll INR sample data visible?
  const runs = await api('/api/payroll/runs');
  ok('payroll runs', runs.status === 200 && (runs.json?.data || runs.json?.runs || []).length >= 5, `runs=${(runs.json?.data || runs.json?.runs || []).length}`);
  const ctcs = await api('/api/payroll/ctc-templates');
  ok('CTC template ACTIVE', ctcs.status === 200 && (ctcs.json?.data || []).some(t => t.status === 'ACTIVE'), '');
  console.log(`\nRESULT: ${pass} passed / ${fail} failed (demo deployment E2E)`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('E2E fatal:', e.message); process.exit(1); });
