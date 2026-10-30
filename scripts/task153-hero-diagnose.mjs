/* Task 153 — diagnose the EMPTY hero card on the employee dashboard.
 * Logs in as the MarqAI CEO + HR (tenant_admin) and a regular employee and
 * checks what /api/auth/me + /api/employees/[id] actually return LIVE.
 */
const BASE = 'https://marqaitechgroup.3boxeshrms.com';

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function me(token) {
  const res = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

(async () => {
  for (const [label, email, pw] of [
    ['CEO', 'mahesh@marqaitech.com', 'MarqAI@2026'],
    ['HR', 'hr@gmail.com', 'MarqAI@2026'],
  ]) {
    const l = await login(email, pw);
    console.log(`\n=== ${label} ${email} → login ${l.status}`);
    const token = l.data?.token || l.data?.accessToken;
    if (!token) { console.log('  no token:', JSON.stringify(l.data).slice(0, 300)); continue; }
    const m = await me(token);
    const u = m.data || {};
    console.log(`  auth/me ${m.status}: role=${u.role} userId=${u.id}`);
    console.log(`  employee:`, u.employee ? JSON.stringify({ id: u.employee.id, employeeId: u.employee.employeeId, dept: u.employee.department, desig: u.employee.designation, phone: u.employee.phone ?? '(phone not selected)' }) : 'NULL');
    const empId = u.employee?.id;
    if (empId) {
      const r = await fetch(`${BASE}/api/employees/${empId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      const e = d.employee || {};
      console.log(`  /api/employees/${empId} → ${r.status}: employeeId=${e.employeeId} phone=${e.phone} doj=${e.dateOfJoining} dept=${e.department?.name || e.department} desig=${e.designation?.title || e.designation} rm=${e.reportingManager ? (e.reportingManager.firstName + ' ' + e.reportingManager.lastName) : e.reportingManagerId}`);
    } else {
      console.log('  NO employee.id → hero card would show all "—" rows');
    }
  }
})();
