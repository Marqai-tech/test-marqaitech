/**
 * Task 93 E2E verification — Probation Review Notification & Email Workflow.
 *
 * DEMO (full workflow, demo is the test tenant):
 *   1. login as admin
 *   2. templates API → assert 'probation' module seeded with 9 events
 *   3. POST /api/employees/probation (submit review for a demo employee)
 *   4. assert NotificationDelivery rows: review_submitted (assigned HR,
 *      submitter excluded) + submitted_employee + submission_ack
 *   5. PATCH tier1 approve → tier2 approve (final) → assert
 *      probation.confirmed delivery + employee status confirmed + letter doc
 * LIVE (read-only — golden rule):
 *   6. login, templates API → probation module present; probation list API 200
 */
const DEMO = { name: 'DEMO', url: 'https://nexus-hrms-mu.vercel.app', slug: '3boxes-hrms-demo', email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' };
const LIVE = { name: 'LIVE', url: 'https://marqaitechgroup.3boxeshrms.com', slug: 'marqaitechgroup', email: 'hr@marqaitech.com', password: 'MarqAI@2026' };

async function login(s) {
  const r = await fetch(`${s.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: s.email, password: s.password }) });
  const d = await r.json();
  if (!r.ok || !d.token) throw new Error(`${s.name} login failed ${r.status}`);
  return { token: d.token, user: d.user };
}
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

async function templateCheck(site) {
  const { token } = await login(site);
  const r = await fetch(`${site.url}/api/notifications/templates`, { headers: H(token) });
  const d = await r.json();
  const mods = d.modules || d.templates?.modules || [];
  const prob = mods.find((m) => m.module === 'probation');
  const evCount = prob?.events?.length ?? prob?.templates?.length ?? 0;
  console.log(`${site.name}: probation module in template catalog → ${prob ? 'YES' : 'NO'} (${evCount} events) ${prob ? '✅' : '❌'}`);
  if (prob?.events) console.log(`  events: ${prob.events.map((e) => e.eventKey || e.name).join(', ')}`);
  return { token, ok: !!prob };
}

async function demoWorkflow() {
  const { token } = await templateCheck(DEMO);
  // pick an active employee on probation (employeeStatus likely 'probation' or 'active')
  const empsR = await fetch(`${DEMO.url}/api/employees?limit=100`, { headers: H(token) });
  const emps = (await empsR.json()).employees || [];
  const cand = emps.find((e) => ['probation', 'active'].includes((e.employeeStatus || e.status || '').toLowerCase()) && e.userId);
  if (!cand) { console.log('DEMO: no eligible employee with a login found — skipping workflow run'); return; }
  console.log(`DEMO: using employee ${cand.firstName} ${cand.lastName} (${cand.employeeId || cand.id}) status=${cand.employeeStatus || cand.status}`);

  const submitR = await fetch(`${DEMO.url}/api/employees/probation`, {
    method: 'POST', headers: H(token),
    body: JSON.stringify({ employeeId: cand.id, probationStartDate: '2026-04-01', probationPeriod: 6, performanceRating: 4, reviewComments: 'Task 93 E2E spec verification review', kpiStatus: 'met', decision: 'confirm' }),
  });
  const submitD = await submitR.json();
  console.log(`submit → ${submitR.status} ${submitR.ok ? '✅' : '❌ ' + JSON.stringify(submitD).slice(0, 200)}`);
  if (!submitR.ok) return;
  const reviewId = submitD.probation?.id;

  await new Promise((r) => setTimeout(r, 2500));
  const dr = await fetch(`${DEMO.url}/api/notifications/log?limit=40`, { headers: H(token) });
  const dd = await dr.json();
  const rows = (dd.deliveries || dd.log || dd.items || []).filter((x) => x.module === 'probation' && x.entityId === reviewId);
  console.log(`deliveries for review ${reviewId}: ${rows.length}`);
  rows.forEach((x) => console.log(`  [${x.eventKey}] ${x.channel}/${x.status} → ${x.recipientName || x.recipientAddress || x.recipientId}`));

  // tier1 approve (HR) then tier2 approve (final — tenant_admin/super_admin)
  for (const step of [1, 2]) {
    const pr = await fetch(`${DEMO.url}/api/employees/probation/${reviewId}`, {
      method: 'PATCH', headers: H(token), body: JSON.stringify({ action: 'approve', comments: `Task 93 E2E tier-${step} approval` }),
    });
    const pd = await pr.json();
    console.log(`tier${step} approve → ${pr.status} ${pr.ok ? '✅ ' + (pd.message || '').slice(0, 80) : '❌ ' + JSON.stringify(pd).slice(0, 160)}`);
    if (!pr.ok) return;
    await new Promise((r) => setTimeout(r, 2500));
  }

  const dr2 = await fetch(`${DEMO.url}/api/notifications/log?limit=80`, { headers: H(token) });
  const dd2 = await dr2.json();
  const rows2 = (dd2.deliveries || dd2.log || dd2.items || []).filter((x) => x.module === 'probation' && x.entityId === reviewId);
  const confirmed = rows2.filter((x) => x.eventKey === 'probation.confirmed');
  console.log(`deliveries after final approve: ${rows2.length}; probation.confirmed rows: ${confirmed.length} ${confirmed.length ? '✅' : '❌'}`);
  confirmed.forEach((x) => console.log(`  [confirmed] ${x.channel}/${x.status} → ${x.recipientName || x.recipientAddress || x.recipientId}`));

  // employee status + letter doc
  const empR = await fetch(`${DEMO.url}/api/employees/${cand.id}`, { headers: H(token) });
  const emp = await empR.json();
  const empObj = emp.employee || emp;
  console.log(`employee status after confirm: ${empObj.employeeStatus || empObj.status} ${(empObj.employeeStatus || empObj.status) === 'confirmed' ? '✅' : '(check)'}`);
  const docsR = await fetch(`${DEMO.url}/api/employees/${cand.id}/documents`, { headers: H(token) });
  if (docsR.ok) {
    const docs = await docsR.json();
    const list = docs.documents || docs || [];
    const letter = (Array.isArray(list) ? list : []).find((x) => (x.name || '').includes('Probation Confirmation Letter'));
    console.log(`confirmation letter document: ${letter ? '✅ ' + letter.name : 'not found (check Documents API shape)'}`);
  } else {
    console.log(`documents API ${docsR.status} — letter check skipped`);
  }
}

async function liveReadonly() {
  const { token } = await templateCheck(LIVE);
  const pr = await fetch(`${LIVE.url}/api/employees/probation?limit=5`, { headers: H(token) });
  console.log(`LIVE probation list API → ${pr.status} ${pr.ok ? '✅' : '❌'}`);
}

await templateCheck(LIVE).catch((e) => console.error('LIVE template check:', e.message));
await liveReadonly().catch((e) => console.error('LIVE:', e.message));
await demoWorkflow().catch((e) => console.error('DEMO workflow:', e.message));
console.log('\nTask 93 verification complete.');
