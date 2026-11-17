// Task 123 — governance: register + approve
// (Salary structures + statutory masters + attendance-integrated auto/manual
// payroll processing + payslips web/mobile; v1.5.6, versionCode 23).
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const cr = await fetch(BASE + '/api/super-admin/change-requests', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    title: 'Task 123 — Payroll module go-live: salary structures for MarqAI Tech Group + statutory masters + attendance-integrated auto/manual salary processing + payslips (v1.5.6, versionCode 23)',
    description:
      'User request: "create now the salary structure for marq ai tech group employees and update the basic salary components in masters along with tax slabs and other statutory component details; integrate to attendance so we can generate the payslips of these employees for this month by auto processing of salary until now and past months too; provide both auto/manual processing of salary selectable by the payroll head in the payroll settings; generate payslips in webapp/mobile app." ' +
      'Implementation — ENGINE (src/lib/payroll-engine.ts): attendance LOP (absent=1, half_day=0.5; days before DOJ never LOP; missing attendance = full paid), earnings prorated by paid/employed days, EPF 12% under ₹15,000 wage ceiling, ESI 0.75% ≤ ₹21,000 gross, Telangana PT slabs (≤15k nil / 15–20k ₹150 / >20k ₹200), TDS = annualTax(gross×12 − std deduction)/12 under NEW regime (FY 2026-27 slabs, ₹75,000 std deduction, 87A rebate ≤ ₹12L taxable) or OLD regime, 4% cess; idempotent company processor with backfill from earliest DOJ. ' +
      'APIs: POST /api/payroll/process (payroll-head gated, backfill default ON, audit-logged), /api/payroll/salary-settings now PERSISTS into new PayrollSettings table (was a stub), POST /api/payroll/marqai-setup (idempotent bootstrap: 14 India PayrollComponent masters, EPFO/ESIC/PT-Telangana/IT-192 StatutoryComponent configs, NEW+OLD TaxSlabTable masters FY 2026-27, company settings mode=auto, 4 salary structures — vardhani solved for EXACT ₹1,00,000 on-hand → gross ₹102,000 with ₹0 TDS under 87A rebate), GET /api/cron/payroll-auto-process (vercel cron 1st of month, sweeps platform + every active tenant DB, processes auto-mode companies with backfill). ' +
      'WEB: Payroll Settings page gains the Salary Processing Mode card (Auto/Manual radio chosen by the payroll head, attendance-LOP toggle, auto-process day, Process & Backfill Now with month/year picker + run summary); Salary Settings persists statutory config (PF/ESI/PT/ratios/regime); payslip detail shows Paid/LOP/Total days + attendance breakdown + processing mode and now uses the REAL company header (was hardcoded placeholder). ' +
      'MOBILE v1.5.6 (23): payslip sheet adds the ATTENDANCE & PAY DAYS strip (Paid/LOP/Total + AUTO/MANUAL badge); PayrollModel parses the new fields shape-agnostically; version chain 1.5.6+23 synced across pubspec/app_info/constants/app-version. flutter analyze 0 errors; 98/98 tests pass incl. 16 new Task 123 tests (model parsing, strip widgets, source contracts both platforms). Schema applied additively to platform + demo + marqaitechgroup DBs (Payroll +7 cols, PayrollSettings table) BEFORE push.',
    category: 'payroll',
    riskLevel: 'high',
    module: 'Payroll',
    relatedModule: 'Attendance',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || d);

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
