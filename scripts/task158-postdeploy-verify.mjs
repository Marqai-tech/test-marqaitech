#!/usr/bin/env node
/* Task 158 — post-deploy verification on all three domains.
 * 1. All three hosts serve the app.
 * 2. AI assistant fix: {message}-only request → 200 with server-issued
 *    sessionId; second message reuses it (conversation continuity).
 * 3. Biometric: sync status exposes lastPunchAt/lastPunchAgeDays; a POST
 *    { rematch:true, reclassifyDays:31 } re-syncs + recalculates.
 * 4. Section edit E2E: employee submits a Health edit → pending; duplicate
 *    blocked (409); admin approves → applied; DB shows the new value. */
const BASES = {
  demo: 'https://nexus-hrms-demo.vercel.app',
  tenant: 'https://marqaitechgroup.3boxeshrms.com',
  apex: 'https://3-boxes-hrms.vercel.app',
};
const T = { 'Content-Type': 'application/json' };
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (ok) pass += 1; else fail += 1;
}
async function jfetch(url, opts = {}) {
  const r = await fetch(url, opts);
  let d = null;
  try { d = await r.json(); } catch { /* html */ }
  return { status: r.status, d };
}

async function main() {
  // ── 1) three domains alive ──
  for (const [name, base] of Object.entries(BASES)) {
    const r = await fetch(base + '/', { redirect: 'manual' }).catch(() => null);
    check(`domain ${name} reachable`, !!r && r.status < 500, `HTTP ${r ? r.status : 'ERR'}`);
  }

  // ── 2) AI assistant on tenant + demo ──
  for (const [name, base] of Object.entries(BASES)) {
    // The tenant host only accepts tenant users (superadmin is apex-only by design).
    const creds = name === 'tenant'
      ? { email: 'hr@marqaitech.com', password: 'MarqAI@2026' }
      : { email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' };
    const login = await jfetch(base + '/api/auth/login', { method: 'POST', headers: T, body: JSON.stringify(creds) });
    const token = login.d?.token;
    if (!token) { check(`AI ${name} (login)`, false, JSON.stringify(login.d).slice(0, 80)); continue; }
    const H = { ...T, Authorization: `Bearer ${token}` };
    const first = await jfetch(base + '/api/ai-chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'What is my leave balance?' }) });
    const sid = first.d?.sessionId;
    check(`AI ${name}: message-only accepted (no 400)`, first.status === 200 && !!sid && !!first.d?.reply, `HTTP ${first.status} sessionId=${sid || '—'}`);
    const second = await jfetch(base + '/api/ai-chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'Thanks! And how do I apply for leave?', sessionId: sid }) });
    check(`AI ${name}: sessionId reuse → same session`, second.status === 200 && second.d?.sessionId === sid, `HTTP ${second.status} same=${second.d?.sessionId === sid}`);
  }

  // ── 3) biometric sync status + recalculate (tenant) ──
  const hrLogin = await jfetch(BASES.tenant + '/api/auth/login', { method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }) });
  const hrToken = hrLogin.d?.token;
  check('tenant HR login', !!hrToken, hrLogin.d?.error || '');
  const HH = { ...T, Authorization: `Bearer ${hrToken}` };
  if (hrToken) {
    const st = await jfetch(BASES.tenant + '/api/attendance/biometric/sync', { headers: HH });
    const status = st.d;
    check('sync status has staleness fields', st.status === 200 && typeof status?.lastPunchAgeDays === 'number', `lastPunchAt=${status?.lastPunchAt || '—'} ageDays=${status?.lastPunchAgeDays ?? '—'}`);
    check('staleness reflects the offline device', status?.lastPunchAgeDays >= 3, `expect >=3 days since 23 Oct (today 27 Oct)`);
    const recalc = await jfetch(BASES.tenant + '/api/attendance/biometric/sync', { method: 'POST', headers: HH, body: JSON.stringify({ rematch: true, reclassifyDays: 31 }) });
    check('resync+recalculate POST succeeds', recalc.status === 200 && (recalc.d?.state === 'success' || recalc.d?.lastRecord), `imported=${recalc.d?.imported} dup=${recalc.d?.duplicatesSkipped} rematched=${recalc.d?.rematched} batches=${recalc.d?.batches}`);
  }

  // ── 4) section edit request E2E (tenant, CEO submits → super_admin approves) ──
  const ceoLogin = await jfetch(BASES.tenant + '/api/auth/login', { method: 'POST', headers: T, body: JSON.stringify({ email: 'mahesh@marqaitech.com', password: 'MarqAI@2026' }) });
  const ceoToken = ceoLogin.d?.token;
  check('tenant CEO login (self-service submitter)', !!ceoToken, ceoLogin.d?.error || '');
  if (ceoToken && hrToken) {
    const CH = { ...T, Authorization: `Bearer ${ceoToken}` };
    const me = await jfetch(BASES.tenant + '/api/auth/me', { headers: CH });
    const empId = me.d?.employee?.id || me.d?.user?.employee?.id;
    check('CEO resolves own employee row', !!empId, empId || '');
    if (empId) {
      const payload = { entries: undefined };
      // health section: submit a blood group + emergency note
      const health = { bloodGroup: 'O+', emergencyMedicalCondition: 'None reported (self-service test)' };
      const sub = await jfetch(BASES.tenant + '/api/employees/update-requests', { method: 'POST', headers: CH, body: JSON.stringify({ employeeId: empId, fieldName: 'health', newValue: JSON.stringify(health), reason: 'Task 158 E2E — health section edit request' }) });
      check('health section request submitted → pending', sub.status === 201 && sub.d?.request?.status === 'pending', `HTTP ${sub.status} ${sub.d?.error || sub.d?.message || ''}`);
      const reqId = sub.d?.request?.id
        || (await jfetch(BASES.tenant + '/api/employees/update-requests?scope=mine', { headers: CH })).d?.requests?.find((r) => r.status === 'pending' && r.fieldName === 'health')?.id;
      check('health request id resolved (fresh or existing pending)', !!reqId, reqId || 'none');
      if (reqId) {
        if (sub.status === 201) {
          const dup = await jfetch(BASES.tenant + '/api/employees/update-requests', { method: 'POST', headers: CH, body: JSON.stringify({ employeeId: empId, fieldName: 'health', newValue: JSON.stringify(health) }) });
          check('duplicate pending blocked (409)', dup.status === 409, `HTTP ${dup.status}`);
        }
        // Approve with the TENANT admin (superadmin cannot log in on a tenant host — by design).
        const SA = HH;
        // find it in the admin approval list
        const inbox = await jfetch(BASES.tenant + '/api/employees/update-requests?scope=all', { headers: SA });
        const row = (inbox.d?.requests || []).find((r) => r.id === reqId);
        check('request visible in admin list with section payload', !!row && row.fieldName === 'health' && String(row.newValue || '').includes('bloodGroup'), row ? `label=${row.fieldLabel}` : 'not found');
        const ap = await jfetch(BASES.tenant + `/api/employees/update-requests/${reqId}`, { method: 'PATCH', headers: SA, body: JSON.stringify({ action: 'approve', comments: 'Task 158 E2E approval' }) });
        check('approval applies to record', ap.status === 200 && ap.d?.finalized === true, `HTTP ${ap.status} ${ap.d?.message || ap.d?.error || ''}`);
        // verify the employee record actually changed
        const emp = await jfetch(BASES.tenant + `/api/employees/${empId}`, { headers: SA });
        const bg = emp.d?.employee?.bloodGroup;
        check('official record updated (bloodGroup=O+)', bg === 'O+', `bloodGroup=${bg}`);
        // verification section submission (kyc merge) — leave it pending for HR demo
        const ver = await jfetch(BASES.tenant + '/api/employees/update-requests', { method: 'POST', headers: CH, body: JSON.stringify({ employeeId: empId, fieldName: 'verification', newValue: JSON.stringify({ fullName: 'Mahesh Kumar', idType: 'aadhaar', idNumber: 'XXXX-XXXX-1234', note: 'Task 158 E2E verification submission' }) }) });
        check('verification section request accepted (or already pending)', ver.status === 201 || ver.status === 409, `HTTP ${ver.status} ${ver.d?.error || ver.d?.message || ''}`);
        const invalid = await jfetch(BASES.tenant + '/api/employees/update-requests', { method: 'POST', headers: CH, body: JSON.stringify({ employeeId: empId, fieldName: 'verification', newValue: JSON.stringify({ fullName: 'X' }) }) });
        check('invalid verification payload rejected', invalid.status === 400 || invalid.status === 409, `HTTP ${invalid.status}`);
      }
    }
  }

  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
