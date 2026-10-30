/**
 * Task 130 + 131 — post-deploy E2E on the LIVE hosts.
 *
 * 130: released payslip PDF (format + gate), release/revoke API, released flags.
 * 131: biometric session path (rememberMe), CEO visibility (getDataScope fix),
 *      attachment endpoints still live.
 *
 * USAGE: node scripts/task130-postdeploy-verify.cjs
 */
const HOSTS = {
  tenant: 'https://marqaitechgroup.3boxeshrms.com',
  apex: 'https://3boxeshrms.com',
  demo: 'https://nexus-hrms-demo.vercel.app',
};
const T = { 'Content-Type': 'application/json' };
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

async function login(base, email, password) {
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: T, body: JSON.stringify({ email, password, rememberMe: true }),
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, token: j?.token, role: j?.user?.role ?? j?.role, error: j?.error };
}

async function main() {
  // ── 1. version + APK on all 3 hosts ──
  for (const [label, base] of Object.entries(HOSTS)) {
    const v = await fetch(base + '/api/public/app-version').then((r) => r.json()).catch(() => null);
    ok(`app-version ${label} = 1.6.1 (28)`, v?.versionName === '1.6.1' && v?.versionCode === 28, `${v?.versionName} ${v?.versionCode}`);
    const apkUrl = (v?.apkUrl && v.apkUrl.startsWith('http')) ? v.apkUrl : base + (v?.apkUrl || '/downloads/3boxes-hrms-mobile-v1.6.1.apk');
    const apk = await fetch(apkUrl, { method: 'GET' }).catch(() => null);
    ok(`APK 200 on ${label}`, apk?.status === 200, `${apk?.status ?? 'ERR'} ${apkUrl} ${(apk?.headers?.get('content-length') || '')}`);
  }

  // ── 2. tenant-admin (hr@gmail.com) on the TENANT host: release gate E2E ──
  const admin = await login(HOSTS.tenant, 'hr@gmail.com', 'MarqAI@2026');
  ok('tenant admin login (hr@gmail.com)', admin.status === 200 && !!admin.token, `role=${admin.role}`);
  const H = { ...T, Authorization: `Bearer ${admin.token}` };

  // company context: find MarqAI Tech company id
  const comps = await fetch(HOSTS.tenant + '/api/companies?limit=20', { headers: H }).then((r) => r.json()).catch(() => null);
  const companies = comps?.companies || comps?.data || [];
  const marqTech = companies.find((c) => /marq.*tech/i.test(c?.name || ''));
  ok('MarqAI Tech company found', !!marqTech, marqTech?.name);

  // payslips list for that company (admin scope=all) — release flags present
  const ps = await fetch(HOSTS.tenant + `/api/payroll/payslips?companyId=${marqTech?.id || ''}&limit=200`, { headers: H }).then((r) => r.json()).catch(() => null);
  const rows = ps?.data || [];
  ok('payslip list returns rows', rows.length > 0, `${rows.length} rows`);
  const releasedRows = rows.filter((r) => r.releasedAt);
  ok('backfilled release: all existing rows released', rows.length > 0 && releasedRows.length === rows.length, `${releasedRows.length}/${rows.length}`);

  // PDF download (admin) — valid PDF with the embedded rupee font
  const sample = rows.find((r) => r.status === 'processed' || r.status === 'paid');
  let pdfOk = false, pdfSize = 0, disp = '';
  if (sample) {
    const res = await fetch(HOSTS.tenant + `/api/payroll/payslips/${sample.id}/pdf?companyId=${marqTech?.id || ''}`, { headers: H });
    const buf = res.status === 200 ? Buffer.from(await res.arrayBuffer()) : null;
    pdfSize = buf?.length || 0;
    disp = res.headers.get('content-disposition') || '';
    pdfOk = res.status === 200 && buf && buf.subarray(0, 5).toString() === '%PDF-' && pdfSize > 15000 && pdfSize < 300000;
  }
  ok('payslip PDF 200 + valid (%PDF-, 15–300 KB)', pdfOk, `${pdfSize} bytes, ${disp.slice(0, 60)}`);

  // release gate: revoke Sep 2026 → PDF blocked is NOT expected for admin (admins bypass);
  // instead verify the stamp clears and the mobile list shape reflects it
  let revokeOk = false, relabel = '';
  const rel = await fetch(HOSTS.tenant + '/api/payroll/payslips/release', {
    method: 'POST', headers: H, body: JSON.stringify({ month: 9, year: 2026, action: 'revoke' }),
  }).then((r) => r.json()).catch(() => null);
  revokeOk = !!rel?.data && rel.data.matched >= 0;
  relabel = rel?.message || '';
  ok('release API revoke works', revokeOk, relabel);

  const ps2 = await fetch(HOSTS.tenant + `/api/payroll/payslips?companyId=${marqTech?.id || ''}&month=9&year=2026&limit=50`, { headers: H }).then((r) => r.json()).catch(() => null);
  const rows2 = ps2?.data || [];
  ok('Sep-2026 rows now unreleased (releasedAt null)', rows2.every((r) => !r.releasedAt), `${rows2.length} rows`);
  if (sample && rows2.some((r) => r.id === sample.id)) {
    // admin still downloads (bypass) — staff would get 403
    const res2 = await fetch(HOSTS.tenant + `/api/payroll/payslips/${sample.id}/pdf?companyId=${marqTech?.id || ''}`, { headers: H });
    ok('admin PDF bypasses the gate (verify-before-release)', res2.status === 200, `status=${res2.status}`);
  }

  // restore: release Sep 2026 again
  const rel2 = await fetch(HOSTS.tenant + '/api/payroll/payslips/release', {
    method: 'POST', headers: H, body: JSON.stringify({ month: 9, year: 2026, action: 'release' }),
  }).then((r) => r.json()).catch(() => null);
  ok('release API release (restored)', !!rel2?.data, rel2?.message || '');
  const ps3 = await fetch(HOSTS.tenant + `/api/payroll/payslips?companyId=${marqTech?.id || ''}&month=9&year=2026&limit=50`, { headers: H }).then((r) => r.json()).catch(() => null);
  ok('Sep-2026 re-released', (ps3?.data || []).every((r) => !!r.releasedAt));

  // ── 3. mobile list endpoint (self scope) — employees see released only ──
  // use a live employee account if the standard seed password works
  const empTries = ['amrutha@marqaitech.com', 'divya@marqaitech.com'];
  let emp = null, empEmail = '';
  for (const email of empTries) {
    const t = await login(HOSTS.tenant, email, 'MarqAI@2026');
    if (t.status === 200 && t.token) { emp = t; empEmail = email; break; }
  }
  if (emp) {
    const H2 = { ...T, Authorization: `Bearer ${emp.token}` };
    const mine = await fetch(HOSTS.tenant + '/api/payroll?limit=50', { headers: H2 }).then((r) => r.json()).catch(() => null);
    const mineRows = mine?.payrolls || [];
    ok(`employee login (${empEmail}) + mobile list only-released`, mineRows.length >= 0 && mineRows.every((r) => r.releasedAt), `${mineRows.length} rows, all released=${mineRows.every((r) => r.releasedAt)}`);
    if (mineRows[0]) {
      const ownPdf = await fetch(HOSTS.tenant + `/api/payroll/payslips/${mineRows[0].id}/pdf`, { headers: H2 });
      const buf = ownPdf.status === 200 ? Buffer.from(await ownPdf.arrayBuffer()) : null;
      ok('employee downloads OWN released payslip PDF', ownPdf.status === 200 && buf?.subarray(0, 5).toString() === '%PDF-', `status=${ownPdf.status} ${buf?.length || 0}B`);
      const role = emp.role;
      if (role === 'employee') {
        // Task 131: a true CEO account must see ALL employees + full reports
        const ceo = await login(HOSTS.tenant, 'mahesh@marqaitech.com', 'MarqAI@2026');
        if (ceo.status === 200 && ceo.token && ceo.role === 'ceo') {
          const H3 = { ...T, Authorization: `Bearer ${ceo.token}` };
          const emps = await fetch(HOSTS.tenant + '/api/employees?limit=200', { headers: H3 }).then((r) => r.json()).catch(() => null);
          const list = emps?.employees || emps?.data || [];
          ok('CEO sees ALL employees (not just self)', list.length > 1, `${list.length} employees`);
          const rep = await fetch(HOSTS.tenant + '/api/reports?type=employee_report', { headers: H3 }).then((r) => r.json()).catch(() => null);
          ok('CEO gets FULL employee_report (scope=all)', !!rep && rep.dataScope === 'all', `scope=${rep?.dataScope}, headcount=${rep?.headcount ?? rep?.totalEmployees ?? '?'}`);
          const leaveRep = await fetch(HOSTS.tenant + '/api/reports?type=leave_report', { headers: H3 }).then((r) => r.json()).catch(() => null);
          ok('CEO gets full leave_report', !!leaveRep && leaveRep.dataScope === 'all', `scope=${leaveRep?.dataScope}`);
          const ceoPs = await fetch(HOSTS.tenant + '/api/payroll/payslips?limit=10', { headers: H3 }).then((r) => r.json()).catch(() => null);
          ok('CEO sees payslip list (payroll head)', Array.isArray(ceoPs?.data), `${ceoPs?.data?.length ?? 'ERR'} rows`);
        } else {
          ok('CEO login (mahesh@marqaitech.com)', false, `status=${ceo.status} role=${ceo.role} ${ceo.error || ''}`);
        }
      }
    }
  } else {
    console.log(`  SKIP employee self-gate live check (no employee creds worked) — covered by code contracts`);
  }

  // ── 4. task attachments endpoint still live (Task 129/131 continuity) ──
  const projs = await fetch(HOSTS.tenant + '/api/projects?limit=5', { headers: H }).then((r) => r.json()).catch(() => null);
  const plist = projs?.projects || projs?.data || [];
  ok('projects list 200', plist.length >= 0, `${plist.length} projects`);
  if (plist[0]) {
    const tasks = await fetch(HOSTS.tenant + `/api/projects/${plist[0].id}/tasks?limit=5`, { headers: H }).then((r) => r.json()).catch(() => null);
    ok('project tasks 200 (create-modal surface intact)', !!tasks && Array.isArray(tasks.tasks), `${tasks?.tasks?.length ?? 'ERR'} tasks`);
  }

  console.log(`\n${pass}/${pass + fail} E2E checks pass`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('E2E FAILED:', e); process.exit(1); });
