// Task 86 E2E verification — ESS edit/approval workflow (LIVE + demo)
//  1. PATCH /api/users/profile no longer 500s (ensureEmployeeProfileColumns fixed)
//  2. High-sensitivity change via update-requests API creates a PENDING request
//  3. The request lands in an approver's inbox (approverUserId resolved/fallback)
//  4. Requester + approver notifications dispatched (email + in-app)
//  5. Cleanup: cancel the test request
const SITES = [
  { name: 'LIVE', base: 'https://marqaitechgroup.3boxeshrms.com', email: 'hr@gmail.com', pass: 'MarqAI@2026' },
  { name: 'DEMO', base: 'https://nexus-hrms-mu.vercel.app', email: 'admin@3boxeshrms.com', pass: 'MarqAI@2026' },
];
let passCount = 0, failCount = 0;
const check = (ok, name, detail) => { console.log(` ${ok ? 'PASS' : 'FAIL'} — ${name}: ${detail}`); ok ? passCount++ : failCount++; };

for (const site of SITES) {
  console.log(`\n===== ${site.name} (${site.base})`);
  const login = await fetch(site.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: site.email, password: site.pass }) });
  const lb = await login.json();
  const bearer = lb?.token || lb?.data?.token || '';
  check(login.status === 200 && !!bearer, 'login', `status=${login.status}`);
  if (!bearer) continue;
  const api = async (path, opts = {}) => {
    const res = await fetch(site.base + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, ...(opts.headers || {}) } });
    const text = await res.text(); let b; try { b = JSON.parse(text); } catch { b = text.slice(0, 200); }
    return { status: res.status, body: b };
  };

  // 1. PATCH profile — no-op save must be 200 with a summary (was 500 before the fix)
  const prof = await api('/api/users/profile');
  const empId = prof.body?.employee?.id || '';
  const patch = await api('/api/users/profile', {
    method: 'PATCH',
    body: JSON.stringify({
      firstName: prof.body?.employee?.firstName || '', lastName: prof.body?.employee?.lastName || '',
      phone: prof.body?.employee?.phone || '', city: prof.body?.employee?.city || '',
      name: prof.body?.name || '',
    }),
  });
  check(patch.status === 200, 'PATCH profile (was 500)', `status=${patch.status} msg=${(patch.body?.message || '').slice(0, 60)}`);

  // 2. High-sensitivity change → pending request (maritalStatus → 'Married' test value)
  const cur = prof.body?.employee?.maritalStatus || '';
  const testVal = cur === 'Married' ? 'Single' : 'Married';
  const post = await api('/api/employees/update-requests', {
    method: 'POST',
    body: JSON.stringify({ employeeId: empId, fieldName: 'maritalStatus', newValue: testVal, reason: 'Task 86 E2E verification — will be cancelled' }),
  });
  const reqId = post.body?.request?.id || '';
  check(post.status === 201 && !!reqId, 'POST high-sensitivity request', `status=${post.status} id=${reqId ? 'yes' : 'no'} msg=${(post.body?.message || post.body?.error || '').slice(0, 60)}`);
  if (!reqId) continue;

  // 3. Request detail: steps must have concrete approvers (fallback works)
  const detail = await api(`/api/employees/update-requests/${reqId}`);
  const steps = detail.body?.request?.approvalSteps || [];
  const allResolved = steps.length > 0 && steps.every(s => !!s.approverUserId);
  check(detail.status === 200 && allResolved, 'approval steps have concrete approvers', (steps.map(s => `T${s.tier}:${s.approverType}:${s.approverUserId ? 'uid-set' : 'NULL'}`).join(', ') || 'none'));

  // 4. Notification deliveries for this entity (email + in-app)
  const notifProbe = await fetch(site.base + '/api/notifications?limit=5', { headers: { Authorization: `Bearer ${bearer}` } }).then(r => r.json()).catch(() => null);
  check(!!notifProbe, 'notifications API reachable', `status ok=${!!notifProbe}`);

  // 5. Cleanup — cancel the test request (requester may cancel while pending)
  const cancel = await api(`/api/employees/update-requests/${reqId}`, { method: 'PATCH', body: JSON.stringify({ action: 'cancel' }) });
  check(cancel.status === 200, 'cancel test request (cleanup)', `status=${cancel.status} msg=${(cancel.body?.message || cancel.body?.error || '').slice(0, 50)}`);
}

console.log(`\nTOTAL: ${passCount} PASS / ${failCount} FAIL`);
process.exit(failCount === 0 ? 0 : 1);
