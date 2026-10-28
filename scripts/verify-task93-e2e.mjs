/**
 * Task 93 E2E — full probation workflow on DEMO (super_admin actor).
 * A) Workflow 3: complete the in-flight md_review (Arjun Kumar) with approve
 *    → probation.confirmed delivery + employee confirmed + letter document.
 * B) Workflows 1+2+4: submit a new extension review for the confirmed
 *    employee → assigned-HR notification (submitter excluded) + employee
 *    heads-up + submission ack → tier1 extend → extension_requested to MD →
 *    tier2 extend (final) → extension_approved with revised end date.
 */
const S = { url: 'https://nexus-hrms-mu.vercel.app', slug: '3boxes-hrms-demo' };
const SA = { email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }; // super_admin (MD seat)
const HR = { email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' };      // submitter (HR seat)

async function login(email, password) {
  const r = await fetch(`${S.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const d = await r.json();
  if (!r.ok || !d.token) throw new Error(`login ${email} failed ${r.status}: ${JSON.stringify(d).slice(0, 150)}`);
  return { token: d.token, user: d.user };
}
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

async function deliveries(token, reviewId) {
  const r = await fetch(`${S.url}/api/notifications/log?limit=100`, { headers: H(token) });
  const d = await r.json();
  return (d.deliveries || d.log || d.items || []).filter((x) => x.module === 'probation' && x.entityId === reviewId);
}
const show = (rows, label) => {
  console.log(`${label}: ${rows.length} delivery row(s)`);
  rows.forEach((x) => console.log(`  [${x.eventKey}] ${x.channel}/${x.status} → ${x.recipientName || x.recipientAddress || x.recipientId}`));
};

const sa = await login(SA.email, SA.password);
const hr = await login(HR.email, HR.password);
console.log(`actors: superadmin=${sa.user?.role}, hr=${hr.user?.role}`);

// find Arjun
const er = await fetch(`${S.url}/api/employees?limit=100`, { headers: H(hr.token) });
const emps = (await er.json()).employees || [];
const arjun = emps.find((e) => (e.firstName || '').toLowerCase() === 'arjun');
if (!arjun) throw new Error('Arjun not found');
console.log(`employee: ${arjun.firstName} ${arjun.lastName} (${arjun.employeeId}) status=${arjun.employeeStatus || arjun.status}`);

// existing reviews
const prr = await fetch(`${S.url}/api/employees/probation?limit=20`, { headers: H(sa.token) });
const reviews = (await prr.json()).probations || [];
const inflight = reviews.find((p) => p.employeeId === arjun.id && p.status === 'pending');
console.log(`in-flight pending review for Arjun: ${inflight ? inflight.id + ' stage=' + inflight.workflowStage : 'none'}`);

// ── A) Workflow 3: finalize the in-flight review with approve ──
if (inflight && ['md_review', 'completed'].includes(inflight.workflowStage) && inflight.workflowStage !== 'completed') {
  const pr = await fetch(`${S.url}/api/employees/probation/${inflight.id}`, {
    method: 'PATCH', headers: H(sa.token), body: JSON.stringify({ action: 'approve', comments: 'Task 93 E2E — MD final confirmation (Workflow 3)' }),
  });
  const pd = await pr.json();
  console.log(`A) final approve → ${pr.status} ${pr.ok ? '✅ ' + (pd.message || '') : '❌ ' + JSON.stringify(pd).slice(0, 200)}`);
  await new Promise((r) => setTimeout(r, 3000));
  show(await deliveries(sa.token, inflight.id), 'A) deliveries');
  const empR = await fetch(`${S.url}/api/employees/${arjun.id}`, { headers: H(sa.token) });
  const emp = await empR.json();
  const eo = emp.employee || emp;
  console.log(`A) employee status: ${eo.employeeStatus || eo.status}`);
}

// ── B) Workflows 1+2+4: new extension review ──
const subR = await fetch(`${S.url}/api/employees/probation`, {
  method: 'POST', headers: H(hr.token),
  body: JSON.stringify({ employeeId: arjun.id, probationStartDate: '2026-04-01', probationPeriod: 6, performanceRating: 3, reviewComments: 'Task 93 E2E — extension verification', kpiStatus: 'partially_met', decision: 'extend' }),
});
const subD = await subR.json();
console.log(`B) submit (as HR user ${hr.user?.role}) → ${subR.status} ${subR.ok ? '✅ id=' + subD.probation?.id : '❌ ' + JSON.stringify(subD).slice(0, 250)}`);
if (subR.ok) {
  const rid = subD.probation.id;
  await new Promise((r) => setTimeout(r, 3000));
  show(await deliveries(sa.token, rid), 'B) after submit');

  // tier1: extend (HR clicks Extend → MD must decide — template 2)
  const t1 = await fetch(`${S.url}/api/employees/probation/${rid}`, { method: 'PATCH', headers: H(sa.token), body: JSON.stringify({ action: 'extend', extensionPeriod: 3, comments: 'Performance below bar — extend 3 months (Task 93 E2E)' }) });
  const t1d = await t1.json();
  console.log(`B) tier1 extend → ${t1.status} ${t1.ok ? '✅ ' + (t1d.message || '') : '❌ ' + JSON.stringify(t1d).slice(0, 200)}`);
  await new Promise((r) => setTimeout(r, 3000));
  show(await deliveries(sa.token, rid), 'B) after tier1 extend');

  // tier2 (final): extend → extension approved (template 4)
  const t2 = await fetch(`${S.url}/api/employees/probation/${rid}`, { method: 'PATCH', headers: H(sa.token), body: JSON.stringify({ action: 'extend', extensionPeriod: 3, comments: 'Extension approved (Task 93 E2E Workflow 4)' }) });
  const t2d = await t2.json();
  console.log(`B) tier2 extend (final) → ${t2.status} ${t2.ok ? '✅ ' + (t2d.message || '') : '❌ ' + JSON.stringify(t2d).slice(0, 200)}`);
  await new Promise((r) => setTimeout(r, 3000));
  show(await deliveries(sa.token, rid), 'B) after final extend');

  // dedup check: repeat final action must be rejected by stage gate
  const t3 = await fetch(`${S.url}/api/employees/probation/${rid}`, { method: 'PATCH', headers: H(sa.token), body: JSON.stringify({ action: 'extend', comments: 'refresh replay' }) });
  console.log(`B) replay guard → ${t3.status} ${t3.status === 400 ? '✅ blocked' : '⚠️ ' + JSON.stringify(await t3.json()).slice(0, 120)}`);

  // employee docs — letter from step A
  const docsR = await fetch(`${S.url}/api/employees/${arjun.id}/documents`, { headers: H(sa.token) });
  if (docsR.ok) {
    const docs = await docsR.json();
    const list = docs.documents || docs.docs || (Array.isArray(docs) ? docs : []);
    const letter = list.find((x) => (x.name || '').includes('Probation Confirmation Letter'));
    console.log(`B) confirmation letter document: ${letter ? '✅ ' + letter.name : 'not found (' + list.length + ' docs)'}`);
  } else console.log(`B) documents API ${docsR.status} — skipped`);
}
console.log('\nTask 93 E2E complete.');
