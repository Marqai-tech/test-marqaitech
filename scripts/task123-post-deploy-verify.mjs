// Task 123 — post-deploy: wait for v1.5.6, run marqai-setup + process backfill
// on the LIVE tenant, then verify payslips / masters / cron / app-version.
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const APEX = 'https://3boxeshrms.com';
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: res.status, body };
}

// ── 1. Wait for the new release on the tenant host ──
let live = false;
for (let i = 0; i < 40; i++) {
  const v = await j(`${TENANT}/api/public/app-version`).catch(() => null);
  if (v && v.status === 200 && v.body && v.body.versionName === '1.5.6') { live = true; console.log(`deploy LIVE (attempt ${i + 1}): 1.5.6 / ${v.body.versionCode}`); break; }
  process.stdout.write('.');
  await sleep(15000);
}
if (!live) { console.error('\ndeploy did not reach 1.5.6 in time'); process.exit(1); }

// ── 2. Tenant admin login ──
const login = await j(`${TENANT}/api/auth/login`, { method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }) });
if (login.status !== 200) { console.error('tenant login failed', login.status, login.body); process.exit(1); }
const H = { ...T, Authorization: `Bearer ${login.body.token}` };
console.log('tenant admin login OK');

// Resolve the MarqAI Tech Group companyId (admins carry it via ?companyId=)
const emps = await j(`${TENANT}/api/employees?limit=5`, { headers: H });
const empList = emps.body?.employees || emps.body?.data || [];
const companyId = empList[0]?.companyId;
if (!companyId) { console.error('could not resolve companyId from employees API'); process.exit(1); }
const SQ = `companyId=${companyId}&`;
console.log('companyId:', companyId, `(${empList.length}+ employees)`);

// ── 3. marqai-setup (idempotent bootstrap) ──
const setup = await j(`${TENANT}/api/payroll/marqai-setup?${SQ}`, { method: 'POST', headers: H, body: '{}' });
console.log('setup:', setup.status);
if (setup.status === 200) {
  for (const l of setup.body.data?.log || []) console.log('  •', l);
  for (const r of setup.body.data?.results || []) {
    console.log(`  → ${r.label}: ${r.employee} gross ₹${r.gross} net ₹${r.net} [${r.action}]`);
  }
} else { console.error(setup.body); process.exit(1); }

// ── 4. Process salary (backfill: current + past months since joining) ──
const now = new Date();
const proc = await j(`${TENANT}/api/payroll/process?${SQ}`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ month: now.getUTCMonth() + 1, year: now.getUTCFullYear(), backfill: true }),
});
console.log('process:', proc.status, proc.body?.message || proc.body?.error || '');
if (proc.status !== 200) { console.error(proc.body); process.exit(1); }
const det = proc.body.data?.details || [];
const byEmp = {};
for (const d of det) {
  if (d.status === 'created') byEmp[d.employeeName] = `${byEmp[d.employeeName] || ''}${d.month}/${String(d.year).slice(2)}:net${d.net} `;
}
for (const [name, s] of Object.entries(byEmp)) console.log('  ', name, '→', s.trim());

// ── 5. Verify payslips + vardhani on-hand ──
const payslips = await j(`${TENANT}/api/payroll/payslips?${SQ}limit=100`, { headers: H });
const rows = payslips.body?.data || [];
console.log('payslips visible:', rows.length, '(processed/paid only)');
const vardhani = rows.filter((r) => /vardhani/i.test(r.employee?.firstName || ''));
if (vardhani.length > 0) {
  const fullMonth = vardhani.filter((r) => r.totalDays >= 28);
  console.log('vardhani full-month gross:', fullMonth.map((r) => r.grossSalary).join(', '), '→ expect all 102000 (structure solved for ₹1L on-hand at full attendance)');
  console.log('vardhani full-month nets (LOP-adjusted):', fullMonth.map((r) => `${r.month}/${String(r.year).slice(2)}:${r.netSalary} (lop ${r.lopDays})`).join('  '));
} else console.log('vardhani payslips: none visible (check scope)');

// ── 6. Masters APIs populated ──
for (const [label, path] of [['components', '/api/payroll/components?countryCode=IND'], ['tax-slabs', '/api/payroll/tax-slabs'], ['statutory', '/api/payroll/statutory?countryCode=IND'], ['salary-settings', `/api/payroll/salary-settings?${SQ}`]]) {
  const r = await j(`${TENANT}${path}`, { headers: H });
  const data = r.body?.data;
  const n = Array.isArray(data) ? data.length : data ? 'object' : '?';
  console.log(`${label}: ${r.status} → ${n}${Array.isArray(data) ? ' rows' : ''}`);
}

// ── 7. Cron endpoint (platform-wide sweep, auto-mode companies only) ──
// CRON_SECRET is a real production secret — sourced from the pulled env.
import { readFileSync } from 'node:fs';
let cronSecret = '3boxes-hrms-cron-2026';
try {
  for (const line of readFileSync('.env.production.local', 'utf8').split('\n')) {
    if (line.startsWith('CRON_SECRET=')) cronSecret = line.slice('CRON_SECRET='.length).replace(/^"|"$/g, '');
  }
} catch { /* default */ }
const cron = await j(`${DEMO}/api/cron/payroll-auto-process?secret=${encodeURIComponent(cronSecret)}&ignoreDay=1`);
console.log('cron:', cron.status, JSON.stringify(cron.body?.data?.summary || cron.body).slice(0, 220));

// ── 8. app-version + APK on all three hosts ──
for (const host of [TENANT, APEX, DEMO]) {
  const v = await j(`${host}/api/public/app-version`);
  console.log(`app-version ${host.replace('https://', '')}: ${v.status} → ${v.body?.versionName}/${v.body?.versionCode}`);
  const apkPath = (v.body?.apkUrl || '/downloads/3boxes-hrms-mobile-v1.5.6.apk').replace(/^https?:\/\/[^/]+/, '');
  const apk = await fetch(`${host}${apkPath}`, { method: 'HEAD' });
  console.log(`  apk ${apk.status} ${apk.headers.get('content-length') || ''}`);
}
console.log('TASK123 POST-DEPLOY COMPLETE');
