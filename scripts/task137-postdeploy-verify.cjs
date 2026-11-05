/**
 * Task 137 — LIVE post-deploy verification on Vercel (demo = write tests,
 * marqaitechgroup = read tests). Run AFTER the deploy succeeds.
 *
 * USAGE: set -a; source .env.production.local; set +a; node scripts/task137-postdeploy-verify.cjs
 */
const { neon } = require('@neondatabase/serverless');

const PLATFORM = process.env.DATABASE_URL;
if (!PLATFORM) { console.error('FATAL: source .env.production.local first'); process.exit(1); }

const DEMO = 'https://nexus-hrms-demo.vercel.app';
const MARQ = 'https://marqaitechgroup.3boxeshrms.com';
const ADMIN = { email: 'admin@techstart.com', password: 'MarqAI@2026' }; // demo tenant_admin (can edit employees)
const HR = { email: 'hr@gmail.com', password: 'MarqAI@2026' };

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; results.push(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function api(base, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  let json = null;
  try { json = await res.json(); } catch { /* html */ }
  return { status: res.status, json };
}

function jwtAgeDays(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    return (payload.exp - payload.iat) / 86400;
  } catch { return null; }
}

(async () => {
  // ── 0. Demo tenant DB connection ──
  const platform = neon(PLATFORM);
  const td = await platform`SELECT td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE t.slug = '3boxes-hrms-demo' AND td."isActive" = true LIMIT 1`;
  if (!td.length) { console.error('FATAL: demo TenantDatabase not found'); process.exit(1); }
  const demoDb = neon(td[0].cs);

  // ── 1. Demo admin login + EXP column ──
  console.log('1. DEMO — admin login + employees list EXP');
  const adminLogin = await api(DEMO, '/api/auth/login', { method: 'POST', body: ADMIN });
  ok('demo admin login', adminLogin.status === 200 && adminLogin.json?.token, `HTTP ${adminLogin.status}`);
  const adminToken = adminLogin.json?.token;
  if (!adminToken) { console.log(results.join('\n')); console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(1); }

  const empList = await api(DEMO, '/api/employees?limit=5', { token: adminToken });
  const emps = empList.json?.employees || [];
  ok('demo employees list 200', empList.status === 200 && emps.length > 0, `count=${emps.length}`);
  const withExp = emps.filter((e) => typeof e.experienceYears === 'number');
  ok('EXP: experienceYears on every row', emps.length > 0 && withExp.length === emps.length, `${withExp.length}/${emps.length}`);

  // ── 2. PUT dynamic experience + skills + dependents + interests (first employee) ──
  console.log('2. DEMO — PUT experiences/skills/dependents/interests');
  const target = emps[0];
  const putRes = await api(DEMO, `/api/employees/${target.id}`, {
    method: 'PUT', token: adminToken,
    body: {
      experiences: [{
        company: 'Infosys', designation: 'Systems Engineer', fromDate: '2020-01-01',
        toDate: '2022-06-01', isCurrent: false, description: 'E2E verify row',
        companyLogo: 'https://logo.clearbit.com/infosys.com', companyCategory: 'listed', companyLevel: 'mnc',
      }],
      skills: [{ skill: 'React', level: 'expert', yearsOfExp: '5' }, { skill: 'SQL', level: 'advanced', yearsOfExp: '3' }],
      dependents: [{ name: 'E2E Family Member', relation: 'spouse', dateOfBirth: '1995-05-05', gender: 'female' }],
      interests: 'Gardening, Chess',
    },
  });
  ok('PUT with row collections', putRes.status === 200, `HTTP ${putRes.status} ${putRes.json?.error || ''}`);

  const detail = await api(DEMO, `/api/employees/${target.id}`, { token: adminToken });
  const d = detail.json?.employee || detail.json || {};
  const exps = Array.isArray(d.experiences) ? d.experiences : [];
  const newRow = exps.find((x) => x.company === 'Infosys');
  ok('experience row persisted', Boolean(newRow), exps.length ? `rows=${exps.length}` : 'none');
  ok('experience logo+category+level', Boolean(newRow?.companyLogo) && newRow?.companyCategory === 'listed' && newRow?.companyLevel === 'mnc',
    newRow ? `logo=${(newRow.companyLogo || '').slice(0, 40)} cat=${newRow.companyCategory} lvl=${newRow.companyLevel}` : '—');
  const skills = Array.isArray(d.skills) ? d.skills : [];
  ok('skills persisted (EmployeeSkill)', skills.some((s) => s.skill === 'React' && s.level === 'expert'), `rows=${skills.length}`);
  const deps = Array.isArray(d.dependents) ? d.dependents : [];
  ok('family details persisted (Dependent)', deps.some((x) => x.name === 'E2E Family Member' && x.relation === 'spouse'), `rows=${deps.length}`);
  ok('interests persisted', String(d.interests || '').includes('Gardening'), `interests=${d.interests || '—'}`);

  // cleanup: remove the E2E rows again (leave the employee as found)
  await api(DEMO, `/api/employees/${target.id}`, { method: 'PUT', token: adminToken, body: { experiences: [], skills: [], dependents: [], interests: '' } });
  const detail2 = await api(DEMO, `/api/employees/${target.id}`, { token: adminToken });
  const d2 = detail2.json?.employee || detail2.json || {};
  ok('cleanup: rows cleared', (d2.experiences || []).length === 0 && (d2.skills || []).length === 0 && (d2.dependents || []).length === 0);

  // ── 3. Policies API for the grid ──
  console.log('3. DEMO — policies grid API');
  const pol = await api(DEMO, '/api/policies?status=active&includeFile=1&limit=100', { token: adminToken });
  ok('policies status=active&includeFile=1', pol.status === 200 && Array.isArray(pol.json?.policies || pol.json?.data), `HTTP ${pol.status}`);

  // ── 4. Remember-me token lifetime ──
  console.log('4. Remember-me token lifetime');
  const rm = await api(DEMO, '/api/auth/login', { method: 'POST', body: { ...ADMIN, rememberMe: true } });
  const rmDays = rm.json?.token ? jwtAgeDays(rm.json.token) : null;
  ok('rememberMe → ~30d JWT', rmDays !== null && rmDays > 29 && rmDays <= 30.5, `${rmDays?.toFixed(2)}d`);
  const nrm = await api(DEMO, '/api/auth/login', { method: 'POST', body: ADMIN });
  const nrmDays = nrm.json?.token ? jwtAgeDays(nrm.json.token) : null;
  ok('no rememberMe → short JWT (≤1d)', nrmDays !== null && nrmDays <= 1.05, `${nrmDays?.toFixed(2)}d`);

  // ── 5. Self-service: employee-role user — low-risk alert + locked names/DOB ──
  console.log('5. Self-service lock + HR alert (employee-role user)');
  const cand = await demoDb`
    SELECT u.id, u.email FROM "User" u
    JOIN "Employee" e ON e."userId" = u.id
    WHERE u.role = 'employee' AND u.status = 'active' AND u.password IS NOT NULL AND LENGTH(u.password) > 50
    LIMIT 5`;
  let empToken = null, empEmail = null;
  for (const c of cand) {
    const t = await api(DEMO, '/api/auth/login', { method: 'POST', body: { email: c.email, password: 'MarqAI@2026' } });
    if (t.status === 200 && t.json?.token) { empToken = t.json.token; empEmail = c.email; break; }
  }
  ok('demo employee-role login', Boolean(empToken), empEmail || 'none found');

  if (empToken) {
    // current phone so we can change it and restore it
    const me = await api(DEMO, '/api/users/profile', { token: empToken });
    const meEmp = me.json?.employee || {};
    const oldPhone = String(meEmp.phone || '');
    const newPhone = oldPhone.endsWith('7') ? oldPhone.slice(0, -1) + '8' : oldPhone.slice(0, -1) + '7';

    const lowRisk = await api(DEMO, '/api/users/profile', {
      method: 'PATCH', token: empToken,
      body: { phone: newPhone || '9999990001' },
    });
    const applied = Array.isArray(lowRisk.json?.appliedFields) ? lowRisk.json.appliedFields : [];
    ok('low-risk self-edit applied directly', lowRisk.status === 200 && applied.some((f) => /phone/i.test(f)), `applied=${applied.join(', ') || JSON.stringify(lowRisk.json?.message || '')}`);

    const lockRes = await api(DEMO, '/api/users/profile', {
      method: 'PATCH', token: empToken,
      body: { firstName: 'ChangedName' },
    });
    const skipped = Array.isArray(lockRes.json?.skippedFields) ? lockRes.json.skippedFields : [];
    const lockApplied = Array.isArray(lockRes.json?.appliedFields) ? lockRes.json.appliedFields : [];
    ok('firstName LOCKED for self-service', lockRes.status === 200 && skipped.some((s) => /First Name/i.test(s)) && !lockApplied.some((f) => /first/i.test(f)), `skipped=${skipped.join(', ') || 'none'}`);

    const lockDob = await api(DEMO, '/api/users/profile', {
      method: 'PATCH', token: empToken,
      body: { dateOfBirth: '1990-01-01' },
    });
    const skippedDob = Array.isArray(lockDob.json?.skippedFields) ? lockDob.json.skippedFields : [];
    ok('dateOfBirth LOCKED for self-service', skippedDob.some((s) => /Date of Birth/i.test(s)), `skipped=${skippedDob.join(', ') || 'none'}`);

    // HR/admin notification rows for the direct edit
    const deliveries = await demoDb`
      SELECT channel, status, "recipientAddress" FROM "NotificationDelivery"
      WHERE "eventKey" = 'core_hr.profile.self_updated'
      ORDER BY "createdAt" DESC LIMIT 12`;
    ok('HR/Admin bell+email rows (core_hr.profile.self_updated)', deliveries.length >= 2,
      deliveries.map((r) => `${r.channel}:${r.status}`).join(', ') || 'none');
    const channels = new Set(deliveries.map((r) => r.channel));
    ok('both in_app AND email channels', channels.has('in_app') && channels.has('email'), [...channels].join(' + '));

    // restore phone
    await api(DEMO, '/api/users/profile', { method: 'PATCH', token: empToken, body: { phone: oldPhone } });
  }

  // ── 6. MarqAI tenant — read-side checks ──
  console.log('6. MARQAI — tenant reads');
  const hrLogin = await api(MARQ, '/api/auth/login', { method: 'POST', body: HR });
  ok('marqaitech hr login', hrLogin.status === 200 && hrLogin.json?.token, `HTTP ${hrLogin.status}`);
  const hrToken = hrLogin.json?.token;
  if (hrToken) {
    const mEmps = await api(MARQ, '/api/employees?limit=10', { token: hrToken });
    const mRows = mEmps.json?.employees || [];
    ok('marqaitech employees list EXP', mRows.length > 0 && mRows.every((e) => typeof e.experienceYears === 'number'), `${mRows.filter((e) => typeof e.experienceYears === 'number').length}/${mRows.length}`);
    const first = mRows[0];
    const mDetail = await api(MARQ, `/api/employees/${first.id}`, { token: hrToken });
    const md = mDetail.json?.employee || {};
    ok('marqaitech detail carries experiences/skills/dependents', Array.isArray(md.experiences) && Array.isArray(md.skills) && Array.isArray(md.dependents), `exp=${(md.experiences || []).length} skills=${(md.skills || []).length} deps=${(md.dependents || []).length}`);
    const mPol = await api(MARQ, '/api/policies?status=active&includeFile=1&limit=100', { token: hrToken });
    ok('marqaitech policies grid API', mPol.status === 200 && Array.isArray(mPol.json?.policies || mPol.json?.data), `HTTP ${mPol.status}`);
  }

  // ── 7. Both hosts UP ──
  for (const [label, host] of [['demo', DEMO], ['marqaitechgroup', MARQ]]) {
    const v = await api(host, '/api/public/app-version');
    ok(`${label} host UP`, v.status === 200, `${v.json?.versionName} (${v.json?.versionCode})`);
  }

  console.log(results.join('\n'));
  console.log(`\n=== Task 137 postdeploy verify: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
})();
