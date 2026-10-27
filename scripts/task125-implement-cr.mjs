// Task 125 — mark the change request IMPLEMENTED with live E2E evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvj9iz3s000008l08w9scrfu';

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
      'Deployed to LIVE via commits 405e838c (fixed-gross engine + schema + web) + 42ce7758 (v1.5.7/24 version chain + APK). ' +
      'LIVE E2E on marqaitechgroup tenant (hr@marqaitech.com): POST /api/payroll/process {backfill, force} 200 → 49 payslips recomputed Feb→Oct 2026 under the fixed-gross engine. Verification over GET /api/payroll/payslips: 41 full-month rows checked — wrong gross 0, wrong deductions 0. EVERY full-month payslip now shows GROSS exactly at the structure band: mallesh/madhuri/amrutha/syed/bharath ₹15,000, manoj ₹20,000, shiraj/divya ₹25,000, vardhani ₹1,00,200; deductions are ONLY Professional Tax + Loss of Pay (lopDeduction column) — e.g. September: mallesh gross ₹15,000 − LOP ₹500 (1d) = net ₹14,500 (identical money to before, now with fixed gross and a visible LOP line); divya ₹25,000 − PT ₹200 − LOP ₹833.33 = ₹23,966.67; vardhani ₹1,00,200 − PT ₹200 − LOP ₹1,670 = ₹98,330 (full-attendance month still EXACTLY ₹1,00,000 on-hand). DOJ months keep legitimate employment-window proration. Net parity vs the old paid-days proration proven (G×(E−lop)/D ≡ G×E/D − G×lop/D, 6-scenario script). ' +
      'Cron now force-finalizes the previous complete month on the 1st. Schema Payroll.lopDeduction applied 3/3 DBs (platform + demo + marqaitechgroup). ' +
      'WEB: payslip detail shows the Loss of Pay deduction row (zero rows hidden). MOBILE v1.5.7 (24): PayrollModel parses lopDeduction; payslip sheet shows the Loss of Pay row; APK rebuilt after full toolchain reinstall (Flutter 3.47.7/Dart 3.13.5, Temurin JDK 17.0.20.1, platform-36 + build-tools 36 + cmake 3.22.1 + selectively-extracted NDK r28c with sysroot, file_picker pub-cache compileSdk 34→36 patch replicated) — aapt2 versionCode 24/versionName 1.5.7, permanent key SHA-256 590a456e…3749c verified. ' +
      '/api/public/app-version → 1.5.7/24 on marqaitechgroup.3boxeshrms.com + 3boxeshrms.com + nexus-hrms-demo.vercel.app; APK v1.5.7 HTTP 200 on all three hosts (22,165,431 B) incl. the 3boxes-hrms-mobile.apk alias; /payroll/payslips 200. 13/13 task125 + 23/23 task124 node source-contract checks pass; tsc clean on changed files.',
  }),
});
console.log('implement:', res.status, await res.text().then(t => t.slice(0, 120)));
