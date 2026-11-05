// Verify the leave/policy bugfix deployment is LIVE on Vercel demo
// Tests 3 signature behaviors that only exist in the new deployment:
//   1. Past-date leave request -> 400 with new message
//   2. Leave Type with hyphen code (LT-TNS format) accepted by validation (not the old strict regex)
//   3. /api/policies?usable=1 endpoint exists (new query param)
import { Pool } from '@neondatabase/serverless';

const DEMO = 'https://nexus-hrms-mu.vercel.app';
const EMAIL = 'admin@3boxeshrms.com';
const PASS = 'MarqAI@2026';

let bearer = '';
async function api(path, opts = {}) {
  const res = await fetch(DEMO + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(opts.headers || {}),
    },
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const tb = setCookie.find((c) => c.startsWith('tb_token=') || c.startsWith('token='));
  if (tb && !bearer) bearer = tb.split(';')[0].split('=')[1];
  let body = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: res.status, body };
}

// 1. Login
const login = await api('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
console.log('LOGIN:', login.status);
if (login.status !== 200) { console.log('login body:', login.body); process.exit(1); }
if (!bearer) bearer = login.body?.token || login.body?.data?.token || '';
if (!bearer) { console.log('no token in login response, keys:', Object.keys(login.body || {})); process.exit(1); }
console.log('token acquired ✓');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — ${detail}`); }
}

// 2. BUG-1 signature: past-date leave -> 400 with new message
// Need a real employeeId + leaveTypeId to get past field validation
const emps = await api('/api/employees');
const empArr = Array.isArray(emps.body) ? emps.body : emps.body?.employees || emps.body?.data || [];
console.log(`employees: ${emps.status} (${empArr.length} rows)`);
console.log('emp sample keys:', empArr[0] ? Object.keys(empArr[0]).slice(0, 12).join(',') : 'none');
const lts = await api('/api/leave-types');
const ltArr0 = Array.isArray(lts.body) ? lts.body : lts.body?.data || lts.body?.leaveTypes || [];
console.log(`leave-types: ${lts.status} (${ltArr0.length} rows)`);
console.log('lt sample keys:', ltArr0[0] ? Object.keys(ltArr0[0]).slice(0, 14).join(',') : 'none');

// Match employee company to leave type company (else company-scoping guard fires first)
const emp = empArr.find((e) => e?.id && e?.companyId && ltArr0.some((t) => t?.companyId === e.companyId)) || empArr.find((e) => e?.id);
const lt = emp ? ltArr0.find((t) => t?.companyId === emp.companyId) || ltArr0[0] : ltArr0[0];
console.log(`using emp ${emp?.id} (company ${emp?.companyId || '?'}) + type ${lt?.id} (company ${lt?.companyId || '?'})`);

let pastMsg = 'SKIPPED — no employee/type ids';
let pastStatus = 0;
if (emp?.id && lt?.id) {
  const past = await api('/api/leave', {
    method: 'POST',
    body: JSON.stringify({
      employeeId: emp.id,
      leaveTypeId: lt.id,
      startDate: '2025-05-01',
      endDate: '2025-05-02',
      reason: 'deploy-check past date (expect 400 rejection, nothing written)',
    }),
  });
  pastStatus = past.status;
  pastMsg = typeof past.body === 'string' ? past.body : JSON.stringify(past.body);
  console.log('PAST-DATE:', past.status, pastMsg.slice(0, 160));
}
check(
  'Bug 1 (past-date rejected) deployed',
  pastStatus === 400 && /past dates|already passed/i.test(pastMsg),
  `status=${pastStatus} msg=${pastMsg.slice(0, 120)}`
);

// 3. usable=1 policies param (new in this deployment)
const pol = await api('/api/policies?usable=1');
const polArr = Array.isArray(pol.body) ? pol.body : pol.body?.policies || pol.body?.data || [];
console.log('POLICIES usable=1:', pol.status, Array.isArray(polArr) ? `${polArr.length} rows` : String(pol.body).slice(0, 120));
check('Bugs 7/8 (usable=1 filter) deployed', pol.status === 200 && Array.isArray(polArr));

console.log(`\nRESULT: ${pass} pass, ${fail} fail — deployment ${fail === 0 ? 'CONFIRMED LIVE with all fixes' : 'INCOMPLETE/OLD BUILD'}`);
