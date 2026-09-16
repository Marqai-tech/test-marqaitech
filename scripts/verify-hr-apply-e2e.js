/**
 * Task 48 E2E — Apply Attendance by HR + employee-side request flows
 * Verifies on the DEMO tenant (nexus-hrms-mu.vercel.app):
 *  1. Employee permission submit → visible in employee's GET list (was: empty list)
 *  2. Employee gatepass submit → 201 (was: Gatepass_employeeId_fkey FK violation)
 *  3. Employee overtime submit → 201 (was: OvertimeRequest_employeeId_fkey FK violation)
 *  4. HR permission on behalf → 201, record attributed to the SELECTED employee
 *  5. HR gatepass on behalf (type + requestedAt) → 201 (was: Invalid gatepass type)
 *  6. HR overtime on behalf → 201 with positive estimatedHours (was: Invalid Date / NaN)
 *  7. HR comp-off grant → 201 JSON (was: empty 405 → "Unexpected end of JSON input")
 *  8. HR WFH on behalf via /api/attendance/wfh → 201 (was: Invalid punch type)
 *  9. Duplicate WFH for overlapping range → 409 with clear message
 * 10. Defensive: raw "HH:mm" times → clear 400 (no Invalid Date reaching Prisma)
 */
const BASE = 'https://nexus-hrms-mu.vercel.app';
const TENANT = '3boxes-hrms-demo';
const PASSWORD = 'MarqAI@2026';

let pass = 0, failCount = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { failCount++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-tenant-slug': TENANT,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text.slice(0, 120) }; }
  return { status: res.status, data };
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-slug': TENANT },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const d = await res.json();
  if (!res.ok || !d.token) throw new Error(`login failed for ${email}: ${JSON.stringify(d).slice(0, 200)}`);
  return d.token;
}

(async () => {
  console.log('=== Task 48 E2E — HR apply + employee flows ===');
  const adminToken = await login('admin@3boxeshrms.com');
  const empToken = await login('bala.mukherjee@innovatech.demo');
  console.log('logins OK (admin + employee Bala)');

  // Resolve Bala's employee id via admin employees list
  const empList = await api(adminToken, 'GET', '/api/employees?limit=200&search=Bala');
  const bala = (empList.data.employees || []).find(e => (e.email || '').includes('bala.mukherjee'));
  check('resolve Bala employee record', !!bala, bala ? bala.id : 'not found');
  if (!bala) process.exit(1);
  const BALA_ID = bala.id;

  // ── 1. Employee permission submit + visible in list ──
  console.log('\n── Employee: Hourly Permission ──');
  const today = new Date();
  const futureDate = new Date(today.getTime() + 3 * 86400000);
  const dateStr = futureDate.toISOString().split('T')[0];
  const permStart = new Date(`${dateStr}T11:00`);
  const permEnd = new Date(`${dateStr}T12:00`);
  const r1 = await api(empToken, 'POST', '/api/attendance/permission', {
    date: dateStr, startTime: permStart, endTime: permEnd, reason: '[E2E] Task48 permission flow test',
  });
  check('employee permission POST → 201', r1.status === 201, `status=${r1.status} ${JSON.stringify(r1.data).slice(0, 160)}`);
  const list1 = await api(empToken, 'GET', '/api/attendance/permission');
  const mine = (list1.data.permissions || []).filter(p => p.reason && p.reason.includes('[E2E] Task48'));
  check('employee permission list SHOWS submitted request (was: empty list)', mine.length > 0, `count=${mine.length}`);

  // ── 2. Employee gatepass (was FK violation) ──
  console.log('\n── Employee: Gatepass ──');
  const gpAt = new Date(`${dateStr}T16:30`);
  const r2 = await api(empToken, 'POST', '/api/attendance/gatepass', {
    type: 'early_departure', requestedAt: gpAt, reason: '[E2E] Task48 gatepass flow test',
  });
  check('employee gatepass POST → 201 (FK violation fixed)', r2.status === 201, `status=${r2.status} ${JSON.stringify(r2.data).slice(0, 160)}`);

  // ── 3. Employee overtime (was FK violation) ──
  console.log('\n── Employee: Overtime ──');
  const otStart = new Date(`${dateStr}T19:00`);
  const otEnd = new Date(`${dateStr}T21:00`);
  const r3 = await api(empToken, 'POST', '/api/attendance/overtime-request', {
    date: dateStr, startTime: otStart, endTime: otEnd, reason: '[E2E] Task48 overtime flow test', payoutPreference: 'payout',
  });
  const otHours = r3.data && r3.data.overtimeRequest ? r3.data.overtimeRequest.estimatedHours : null;
  check('employee overtime POST → 201 (FK violation fixed)', r3.status === 201, `status=${r3.status} ${JSON.stringify(r3.data).slice(0, 160)}`);
  check('overtime estimatedHours is a positive number (was NaN)', typeof otHours === 'number' && otHours > 0 && Number.isFinite(otHours), `hours=${otHours}`);

  // ── 4. HR permission on behalf ──
  console.log('\n── HR (Apply Attendance by HR): Permission on behalf ──');
  const hrPermStart = new Date(`${dateStr}T14:00`);
  const hrPermEnd = new Date(`${dateStr}T15:00`);
  const r4 = await api(adminToken, 'POST', '/api/attendance/permission', {
    employeeId: BALA_ID, date: dateStr, startTime: hrPermStart, endTime: hrPermEnd, reason: '[HR] [E2E] Task48 permission on behalf',
  });
  check('HR permission on behalf → 201', r4.status === 201, `status=${r4.status} ${JSON.stringify(r4.data).slice(0, 160)}`);
  const list4 = await api(adminToken, 'GET', `/api/attendance/permission?employeeId=${BALA_ID}`);
  const hrOwned = (list4.data.permissions || []).find(p => p.reason && p.reason.includes('Task48 permission on behalf'));
  check('HR-submitted permission attributed to Bala (not the HR)', !!hrOwned && hrOwned.employee && hrOwned.employee.employeeId === bala.employeeId,
    hrOwned ? `owner=${hrOwned.employee ? hrOwned.employee.employeeId : '??'}` : 'not found');

  // ── 5. HR gatepass on behalf (was Invalid gatepass type) ──
  console.log('\n── HR: Gatepass on behalf ──');
  const hrGpAt = new Date(`${dateStr}T10:30`);
  const r5 = await api(adminToken, 'POST', '/api/attendance/gatepass', {
    employeeId: BALA_ID, type: 'early_departure', requestedAt: hrGpAt, date: dateStr, outTime: '10:30', reason: '[HR] [E2E] Task48 gatepass on behalf',
  });
  check('HR gatepass on behalf → 201 (Invalid gatepass type fixed)', r5.status === 201, `status=${r5.status} ${JSON.stringify(r5.data).slice(0, 160)}`);

  // ── 6. HR overtime on behalf (was Invalid Date / NaN) ──
  console.log('\n── HR: Overtime on behalf ──');
  const r6 = await api(adminToken, 'POST', '/api/attendance/overtime-request', {
    employeeId: BALA_ID, date: dateStr,
    startTime: new Date(`${dateStr}T18:30`), endTime: new Date(`${dateStr}T20:30`),
    reason: '[HR] [E2E] Task48 overtime on behalf',
  });
  const hrOtHours = r6.data && r6.data.overtimeRequest ? r6.data.overtimeRequest.estimatedHours : null;
  check('HR overtime on behalf → 201 (Invalid Date fixed)', r6.status === 201, `status=${r6.status} ${JSON.stringify(r6.data).slice(0, 200)}`);
  check('HR overtime estimatedHours = 2.0 (was NaN)', hrOtHours === 2, `hours=${hrOtHours}`);

  // ── 7. HR comp-off grant (was empty-body 405) ──
  console.log('\n── HR: Comp-off grant ──');
  const r7 = await api(adminToken, 'POST', '/api/attendance/comp-off', {
    employeeId: BALA_ID, date: dateStr, hours: 8, reason: '[HR] [E2E] Task48 comp-off grant',
  });
  check('HR comp-off POST → 201 JSON (Unexpected end of JSON input fixed)', r7.status === 201 && !!r7.data && !!r7.data.compOff,
    `status=${r7.status} ${JSON.stringify(r7.data).slice(0, 160)}`);
  const list7 = await api(adminToken, 'GET', `/api/attendance/comp-off?employeeId=${BALA_ID}`);
  check('comp-off balance list includes the grant', (list7.data.compOffs || []).some(c => c.hours === 8), `count=${(list7.data.compOffs || []).length}`);

  // ── 8. HR WFH on behalf (was Invalid punch type) ──
  console.log('\n── HR: WFH on behalf ──');
  const wfhStart = '2026-10-05', wfhEnd = '2026-10-07';
  const r8 = await api(adminToken, 'POST', '/api/attendance/wfh', {
    employeeId: BALA_ID, startDate: wfhStart, endDate: wfhEnd, requestType: 'full_day', reasonCategory: 'other',
    reason: '[HR WFH] [E2E] Task48 wfh on behalf test',
  });
  const totalDays = r8.data && r8.data.request ? r8.data.request.totalDays : null;
  check('HR WFH on behalf → 201 (Invalid punch type fixed)', r8.status === 201, `status=${r8.status} ${JSON.stringify(r8.data).slice(0, 200)}`);
  check('WFH totalDays = 3 working days (Mon-Wed, holiday-excluded)', totalDays === 3, `totalDays=${totalDays}`);

  // ── 9. Duplicate WFH → 409 ──
  console.log('\n── Duplicate WFH guard ──');
  const r9 = await api(adminToken, 'POST', '/api/attendance/wfh', {
    employeeId: BALA_ID, startDate: '2026-10-06', endDate: '2026-10-08', requestType: 'full_day', reasonCategory: 'other',
    reason: '[HR WFH] [E2E] Task48 duplicate wfh attempt',
  });
  check('overlapping WFH POST → 409 with clear message', r9.status === 409 && typeof r9.data.error === 'string' && r9.data.error.includes('already exists'),
    `status=${r9.status} msg=${JSON.stringify(r9.data).slice(0, 180)}`);

  // ── 10. Defensive: raw HH:mm times → clear 400 ──
  console.log('\n── Defensive validation ──');
  const r10 = await api(adminToken, 'POST', '/api/attendance/overtime-request', {
    employeeId: BALA_ID, date: dateStr, startTime: '18:30', endTime: '20:30', reason: '[E2E] raw time strings',
  });
  check('raw HH:mm overtime → 400 clear message (not Prisma Invalid Date)', r10.status === 400 && /Invalid (start|end) time/.test(r10.data.error || ''),
    `status=${r10.status} msg=${r10.data.error}`);

  // ── Cleanup: cancel the WFH request so the demo stays tidy ──
  if (r8.data && r8.data.request && r8.data.request.id) {
    const rc = await api(adminToken, 'PATCH', `/api/attendance/wfh/${r8.data.request.id}`, { status: 'cancelled' });
    console.log(`cleanup: WFH request cancelled (${rc.status})`);
  } else {
    // fallback: find it
    const l = await api(adminToken, 'GET', '/api/attendance/wfh?status=pending');
    const mine8 = (l.data.requests || []).find(x => x.reason && x.reason.includes('Task48 wfh on behalf'));
    if (mine8) { const rc = await api(adminToken, 'PATCH', `/api/attendance/wfh/${mine8.id}`, { status: 'cancelled' }); console.log(`cleanup: WFH request cancelled (${rc.status})`); }
  }

  console.log(`\n=== RESULT: ${pass} PASS / ${failCount} FAIL ===`);
  process.exit(failCount > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
