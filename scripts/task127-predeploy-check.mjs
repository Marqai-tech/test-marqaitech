// Task 127 — pre-deploy production E2E: attendance view + phone login probe
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(`${TENANT}/api/auth/login`, {
  method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
if (!token) { console.error('admin login failed'); process.exit(1); }
const H = { Authorization: `Bearer ${token}` };

// 1. Phone-number login probe (backend phone-matching — needs the NEW code
// deployed, so BEFORE deploy this should FAIL with invalid credentials; we
// record the baseline).
const ph = await fetch(`${TENANT}/api/auth/login`, {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: '7671813161', dialCode: '+91', password: 'MarqAI@2026' }),
});
const phd = await ph.json().catch(() => ({}));
console.log(`phone-login probe (baseline): ${ph.status} ${phd.error || phd.user?.email || 'ok'}`);

// 2. Attendance rows Oct 20-22 as the app serves them
const att = await (await fetch(`${TENANT}/api/attendance?limit=100&startDate=2026-10-20&endDate=2026-10-22`, { headers: H }).catch(() => null))?.json();
if (att) {
  const rows = att.attendance || att.data || att.rows || [];
  const byDay = {};
  for (const r of rows) {
    const d = new Date(r.date).toISOString().slice(0, 10);
    byDay[d] = byDay[d] || {};
    byDay[d][r.status] = (byDay[d][r.status] || 0) + 1;
  }
  console.log('attendance via API:', JSON.stringify(byDay));
} else {
  console.log('attendance endpoint shape differs — checking alternate param style');
  const alt = await (await fetch(`${TENANT}/api/attendance?month=10&year=2026`, { headers: H })).json();
  const rows = alt.attendance || alt.data || [];
  const pick = rows.filter((r) => ['2026-10-20', '2026-10-21', '2026-10-22'].includes(new Date(r.date).toISOString().slice(0, 10)));
  const byDay = {};
  for (const r of pick) {
    const d = new Date(r.date).toISOString().slice(0, 10);
    byDay[d] = byDay[d] || {};
    byDay[d][r.status] = (byDay[d][r.status] || 0) + 1;
  }
  console.log('attendance via API (alt):', JSON.stringify(byDay));
}

// 3. Payslip sample (September): full component rows must be parseable
const ps = await (await fetch(`${TENANT}/api/payroll/payslips?limit=200`, { headers: H })).json();
const sep = (ps.data || []).filter((r) => r.year === 2026 && r.month === 9);
console.log(`sept payslips: ${sep.length}`);
for (const r of sep.slice(0, 3)) {
  console.log(`  ${r.employee?.firstName}: gross ${r.grossSalary} pt ${r.professionalTax} lop ${r.lopDeduction ?? 0} net ${r.netSalary}`);
}

// 4. App version endpoint (still 1.5.7 before deploy)
const ver = await (await fetch(`${TENANT}/api/public/app-version`)).json();
console.log('live app-version:', ver?.versionName, ver?.versionCode);
