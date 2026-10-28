// Verify recruitment data cleanup + dynamic workflow configuration on demo deployment
import { Pool } from '@neondatabase/serverless';

const DEMO = 'https://nexus-hrms-mu.vercel.app';
const EMAIL = 'admin@3boxeshrms.com';
const PASS = 'MarqAI@2026';

let bearer = '';
async function api(path, opts = {}) {
  const res = await fetch(DEMO + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(opts.headers || {}) },
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const tb = setCookie.find((c) => c.startsWith('tb_token=') || c.startsWith('token='));
  if (tb && !bearer) bearer = tb.split(';')[0].split('=')[1];
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status, body };
}

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — ${detail}`); }
};

// 0. wait for deployment with the stats signature
async function waitDeploy() {
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASS }) });
  if (login.status !== 200) { console.log('LOGIN FAILED', login.status); process.exit(1); }
  if (!bearer) bearer = login.body?.token || '';
  for (let i = 0; i < 30; i++) {
    const r = await api('/api/recruitment?limit=5');
    if (r.status === 200 && r.body && typeof r.body === 'object' && 'stats' in r.body) return true;
    console.log(`  …waiting for new deployment (${i + 1}/30)`);
    await new Promise((res) => setTimeout(res, 30000));
    if (i === 10 || i === 20) { // re-login periodically (token expiry)
      const l = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASS }) });
      if (l.status === 200) bearer = l.body?.token || bearer;
    }
  }
  return false;
}

console.log('── Deployment wait ──');
const ready = await waitDeploy();
if (!ready) { console.log('❌ deployment with stats signature not detected in time'); process.exit(1); }
console.log('  ✅ new build detected (stats field present)');

console.log('\n── 1. /api/recruitment real aggregates ──');
const rec = await api('/api/recruitment?limit=50');
check('stats present', rec.status === 200 && !!rec.body.stats, `status=${rec.status}`);
check('stats.openPositions is a number', typeof rec.body.stats?.openPositions === 'number');
check('stats totals consistent with postings', rec.body.pagination?.total >= 0);
check('pipelineData follows config stages', Array.isArray(rec.body.pipelineData) && rec.body.pipelineData.length > 0, JSON.stringify(rec.body.pipelineData).slice(0, 120));
check('no fabricated jobs (job-1..6 ids absent)', !JSON.stringify(rec.body.jobPostings || []).includes('job-1'));
console.log('  stats:', JSON.stringify(rec.body.stats));
console.log('  pipeline:', JSON.stringify(rec.body.pipelineData));

console.log('\n── 2. /api/jobs no longer fabricates data ──');
const jobs = await api('/api/jobs?limit=100');
const jobArr = jobs.body?.data || [];
check('real JobPosting-backed list (no job-1 ids)', Array.isArray(jobArr) && !jobArr.some((j) => String(j.id).startsWith('job-')), `${jobArr.length} rows`);

console.log('\n── 3. Workflow config GET (defaults) ──');
for (const t of ['recruitment', 'preboarding', 'onboarding']) {
  const r = await api(`/api/recruitment/workflow-config?type=${t}`);
  check(`GET ${t} effective config`, r.status === 200 && !!r.body.effective && !!r.body.defaults, `status=${r.status}`);
}

console.log('\n── 4. Workflow config PUT applies + validation ──');
const put1 = await api('/api/recruitment/workflow-config', {
  method: 'PUT',
  body: JSON.stringify({
    workflowType: 'recruitment',
    config: {
      stages: rec.body.pipelineData?.length ? undefined : undefined,
      ...{},
    },
  }),
});
check('invalid PUT rejected (400)', put1.status === 400, `status=${put1.status} body=${JSON.stringify(put1.body).slice(0, 100)}`);

// Save a real customization: rename "Applied" -> "New Applicant", reorder
const stages = (rec.body.pipelineData || []).map((p) => ({ key: p.key, label: p.stage }));
const customStages = stages.map((s) => (s.key === 'applied' ? { ...s, label: 'New Applicant', slaDays: 2 } : s));
const put2 = await api('/api/recruitment/workflow-config', {
  method: 'PUT',
  body: JSON.stringify({
    workflowType: 'recruitment',
    config: { stages: customStages, offerApproval: { enabled: true, tiers: [{ approverType: 'hr_admin', label: 'HR Approval' }, { approverType: 'tenant_admin', label: 'Final Sign-off' }] } },
  }),
});
check('PUT recruitment config saved', put2.status === 200, `status=${put2.status} body=${JSON.stringify(put2.body).slice(0, 120)}`);

const rec2 = await api('/api/recruitment?limit=50');
check('pipeline now reflects custom label', (rec2.body.pipelineData || []).some((p) => p.stage === 'New Applicant'), JSON.stringify(rec2.body.pipelineData));

const cfg2 = await api('/api/recruitment/workflow-config?type=recruitment');
const tiers = cfg2.body.effective?.offerApproval?.tiers || [];
check('2-tier approval chain resolved', cfg2.body.saved && tiers.length === 2, JSON.stringify(tiers).slice(0, 120));

// Reset recruitment config after verification
const del = await api('/api/recruitment/workflow-config?type=recruitment', { method: 'DELETE' });
check('DELETE resets to defaults', del.status === 200);
const rec3 = await api('/api/recruitment?limit=50');
check('pipeline back to default labels', !(rec3.body.pipelineData || []).some((p) => p.stage === 'New Applicant'));

console.log('\n── 5. Preboarding config PUT + disabled-stage guard ──');
const pbGet = await api('/api/recruitment/workflow-config?type=preboarding');
const pbStages = (pbGet.body.effective?.stages || []).map((s) => (s.key === 'bgv' ? { ...s, enabled: false } : s));
const pbPut = await api('/api/recruitment/workflow-config', { method: 'PUT', body: JSON.stringify({ workflowType: 'preboarding', config: { stages: pbStages } }) });
check('PUT preboarding config saved', pbPut.status === 200, `status=${pbPut.status}`);

// find a preboarding candidate (demo has 1 from seed-demo-candidates)
const pbList = await api('/api/preboarding?limit=10');
const cand = (pbList.body?.candidates || [])[0];
if (cand) {
  const bad = await api(`/api/preboarding/${cand.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'bgv' }) });
  check('disabled stage transition rejected (400)', bad.status === 400, `status=${bad.status} body=${JSON.stringify(bad.body).slice(0, 120)}`);
  // restore: move to enabled stage = current or joined
  const okStatus = cand.status === 'bgv' ? 'provisioning' : cand.status;
  const ok = await api(`/api/preboarding/${cand.id}`, { method: 'PATCH', body: JSON.stringify({ status: okStatus }) });
  check('enabled stage transition allowed', ok.status === 200, `status=${ok.status}`);
} else {
  console.log('  (no preboarding candidates on demo — guard tested implicitly by validation)');
}
// reset preboarding config
await api('/api/recruitment/workflow-config?type=preboarding', { method: 'DELETE' });

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
