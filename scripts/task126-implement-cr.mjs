// Task 126 — mark the change request IMPLEMENTED with live E2E evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvjee2ok000008l0203gw05b';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const res = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    implementationNotes:
      'Deployed to LIVE via commit a963aef5. LIVE E2E (headless browser, marqaitechgroup tenant as hr@gmail.com): ' +
      'BEFORE: opening a validation record crashed the page (reproduced — TypeError v.errors.map is not a function → "Something went wrong" error boundary; GET /api/payroll/validations/[id] returned 404 on an EXISTING record because the handler referenced `db` without resolving it). ' +
      'AFTER: detail opens cleanly — MISSING SALARY BASIS section expands showing Sonali Naik (MARQ005), terminations section renders, zero page errors. ' +
      'BIOMETRIC BACKFILL (tenant DB, audited): Team Office probe proved device history from Apr 24, 2026; 2,368 employee-matched punches + PunchEvents imported (Apr 24 → Oct 22) replicating sync semantics (recordKey dedupe, MARQ mapping, classifyBiometricDay, late >10:00, half_day when finalized && workHours < 8 or 3rd+ late, mandatory 60-min break); 990 attendance day-rows created/updated; 46 ABSENT rows derived on punch-less working days (Mon-Fri minus holidays) for the 8 staff; 63 auto-PRESENT rows for Vardhani (management auto-present policy). ' +
      'PAYROLL REPROCESS: all 49 payslips force-reprocessed — September now biometric-accurate: madhuri 10.5 LOP → net ₹9,750, mallesh 12 LOP → ₹9,000, divya 7 LOP → ₹18,966.67, bharath 0.5 → ₹14,750, amrutha 1 → ₹14,500, manoj 1 → ₹19,183.33, shaik siraj 2 → ₹23,133.33, syed 2 → ₹14,000, vardhani 0.5 → ₹98,330. Fixed-gross + PT/LOP-only deductions verified across 41 full-month rows (wrong gross 0, wrong deductions 0). ' +
      'Web payslips + mobile app (v1.5.7) reflect the corrected payslips immediately (API-driven); app-version 1.5.7/24 + APK 200 on all three hosts. 8/8 task126 contract checks; tsc clean.',
  }),
});
console.log('implement:', res.status, await res.text().then(t => t.slice(0, 120)));
