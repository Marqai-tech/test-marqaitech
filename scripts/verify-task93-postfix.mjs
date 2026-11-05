/** Task 93 re-verify on deployed demo: submit → review_submitted rows must appear. */
const S = { url: 'https://nexus-hrms-mu.vercel.app' };
async function login(email, password) {
  const r = await fetch(`${S.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const d = await r.json();
  if (!r.ok || !d.token) throw new Error(`login failed ${r.status}`);
  return d.token;
}
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

const token = await login('admin@3boxeshrms.com', 'MarqAI@2026');
const er = await fetch(`${S.url}/api/employees?limit=100`, { headers: H(token) });
const emps = (await er.json()).employees || [];
const arjun = emps.find((e) => (e.firstName || '').toLowerCase() === 'arjun');
console.log(`employee: ${arjun.firstName} ${arjun.lastName} (${arjun.employeeId})`);

// pick a decision that keeps the employee active: 'extend'
const subR = await fetch(`${S.url}/api/employees/probation`, {
  method: 'POST', headers: H(token),
  body: JSON.stringify({ employeeId: arjun.id, probationStartDate: '2026-07-01', probationPeriod: 6, performanceRating: 3, reviewComments: 'Task 93 post-fix E2E', kpiStatus: 'met', decision: 'extend' }),
});
const subD = await subR.json();
console.log(`submit → ${subR.status} ${subR.ok ? 'id=' + subD.probation.id : '❌ ' + JSON.stringify(subD).slice(0, 200)}`);
if (!subR.ok) process.exit(1);
const rid = subD.probation.id;

await new Promise((r) => setTimeout(r, 3500));
const dr = await fetch(`${S.url}/api/notifications/log?limit=60`, { headers: H(token) });
const dd = await dr.json();
const rows = (dd.deliveries || dd.log || dd.items || []).filter((x) => x.module === 'probation' && x.entityId === rid);
const byEvent = {};
rows.forEach((x) => { byEvent[x.eventKey] = byEvent[x.eventKey] || []; byEvent[x.eventKey].push(`${x.channel}/${x.status}`); });
console.log('deliveries:', JSON.stringify(byEvent, null, 0));
const submitted = rows.filter((x) => x.eventKey === 'probation.review_submitted');
console.log(`probation.review_submitted rows: ${submitted.length} ${submitted.length > 0 ? '✅ FIXED — assigned-HR notification dispatches' : '❌ still missing'}`);
submitted.forEach((x) => console.log(`  ${x.channel}/${x.status} → ${x.recipientName || x.recipientAddress || x.recipientId}`));
const empRows = rows.filter((x) => x.eventKey === 'probation.submitted_employee');
console.log(`probation.submitted_employee rows: ${empRows.length} ${empRows.length ? '✅' : '❌'}`);
const ack = rows.filter((x) => x.eventKey === 'probation.submission_ack');
console.log(`probation.submission_ack rows: ${ack.length} ${ack.length ? '✅' : '❌'}`);
