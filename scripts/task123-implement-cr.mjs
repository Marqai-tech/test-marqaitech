// Task 123 — mark the change request IMPLEMENTED with live E2E evidence.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvj1b7og000108l98vaky6uh';

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
      'Deployed to LIVE via commits 025a1704 (main Task 123) + dbea7e77 (proration hotfix, same CR). ' +
      'LIVE E2E on marqaitechgroup tenant (hr@gmail.com): marqai-setup 200 → 14 India component masters, 4 statutory configs (EPFO/ESIC/PT-Telangana/IT-192), NEW+OLD tax slab tables FY 2026-27, company PayrollSettings mode=auto; 9 salary structures assigned — mallesh/madhuri/amrutha/syed/bharath ₹15,000 (net ₹14,167.50), manoj ₹20,000 (net ₹18,740), shiraj/divya ₹25,000 (net ₹23,600), vardhani SOLVED gross ₹102,000 → on-hand EXACTLY ₹100,000 (₹0 TDS under 87A rebate). ' +
      'POST /api/payroll/process backfill created 49 payslips May→Oct 2026 (this month + all past months since joining) with attendance LOP integration (vardhani Oct: 2.5 LOP days → net ₹91,774.19; all DOJ months correctly prorated e.g. mallesh May 26/31 → ₹11,882.43). Payslips API returns 49 processed rows (web + mobile v1.5.6). Force reprocess after hotfix dbea7e77 verified corrected proration (vardhani Jul: 10/31 → ₹31,123.88). ' +
      'Cron /api/cron/payroll-auto-process 200 on tenant+apex: swept tenant DBs, found 1 auto-mode company, 72 idempotent skips, 0 errors (demo host 401 = separate Vercel project env, baseline policy-ack cron 401s identically). ' +
      '/api/public/app-version → 1.5.6/23 on marqaitechgroup.3boxeshrms.com + 3boxeshrms.com + nexus-hrms-demo.vercel.app; APK v1.5.6 HTTP 200 (22,165,435 B) on all three; aapt2 versionCode 23 / versionName 1.5.6, permanent key 590a456e…3749c; 98/98 flutter tests.',
  }),
});
console.log('implement:', res.status, await res.text().then(t => t.slice(0, 120)));
