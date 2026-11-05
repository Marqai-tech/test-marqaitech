#!/usr/bin/env node
/**
 * Task 112 — post-deploy verification matrix.
 * Verifies on LIVE (3boxeshrms.com + marqaitechgroup.3boxeshrms.com) and DEMO:
 *  1. /api/public/app-version → 1.2.0 (12) + versioned apkUrl
 *  2. APK URLs (versioned + alias) → 200 with byte-length
 *  3. NEW /api/leaves/my-balance → 200 with totals (token required)
 *  4. /api/attendance with startDate/endDate/employeeId/limit → rows (report screen source)
 *  5. /api/notifications → 200 + counts (token required)
 *  6. PATCH /api/auth/me → avatar round-trip on DEMO (then restored); 400 no-body on LIVE (no mutation)
 *  7. module matrix: dashboard/employees/leaves/attendance/payroll/my-summary → 200
 * Usage: node scripts/task112-verify.mjs <baseUrl> [--demo-patch]
 */
const BASE = process.argv[2] || 'https://3boxeshrms.com';
const ALLOW_PATCH = process.argv.includes('--demo-patch');

const TENANT = { email: 'hr@gmail.com', password: 'MarqAI@2026' };   // live tenant admin (has employee profile)
const DEMO = { email: 'admin@acme-global.com', password: 'MarqAI@2026' }; // demo admin
const isDemo = BASE.includes('demo');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  cond ? pass++ : fail++;
};

async function j(method, url, { token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* html */ }
  return { status: res.status, json, ct: res.headers.get('content-type') || '' };
}

async function login(creds) {
  const r = await j('POST', `${BASE}/api/auth/login`, { body: creds });
  const token = r.json?.token ?? r.json?.data?.token;
  ok(`login ${creds.email}`, r.status === 200 && !!token, `status=${r.status}`);
  return token;
}

(async () => {
  console.log(`\n=== Task 112 verify @ ${BASE} ===`);

  // 1. app-version
  const v = await j('GET', `${BASE}/api/public/app-version`);
  const ver = v.json;
  ok('app-version 1.2.0 (12)', v.status === 200 && ver?.versionName === '1.2.0' && ver?.versionCode === 12, JSON.stringify({ v: ver?.versionName, c: ver?.versionCode }));
  ok('app-version apkUrl versioned', typeof ver?.apkUrl === 'string' && ver.apkUrl.includes('v1.2.0'), ver?.apkUrl);

  // 2. APK artifacts
  const apkUrl = ver?.apkUrl?.startsWith('http') ? ver.apkUrl : `${BASE}${ver?.apkUrl}`;
  for (const u of [apkUrl, `${BASE}/downloads/3boxes-hrms-mobile.apk`]) {
    try {
      const res = await fetch(u);
      const len = Number(res.headers.get('content-length') || 0);
      ok(`APK 200 ${u.replace(BASE, '')}`, res.status === 200 && len > 15_000_000, `${res.status} ${len}B`);
    } catch (e) { ok(`APK 200 ${u}`, false, e.message); }
  }

  // 3. auth + NEW endpoints
  const creds = isDemo ? DEMO : TENANT;
  const token = await login(creds);
  if (!token) { console.log('ABORT: no token'); process.exit(1); }

  const bal = await j('GET', `${BASE}/api/leaves/my-balance`, { token });
  ok('my-balance 200 + numeric totals', bal.status === 200 && typeof bal.json?.total === 'number' && typeof bal.json?.used === 'number', JSON.stringify(bal.json && { total: bal.json.total, used: bal.json.used, pending: bal.json.pending, linked: bal.json.linked }));
  const balNoAuth = await j('GET', `${BASE}/api/leaves/my-balance`);
  ok('my-balance 401 without token', balNoAuth.status === 401, `status=${balNoAuth.status}`);

  // 4. attendance range query (report screen)
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
  const me = await j('GET', `${BASE}/api/auth/me`, { token });
  const empId = me.json?.employee?.id || me.json?.data?.employee?.id;
  const att = await j('GET', `${BASE}/api/attendance?startDate=${start}&endDate=${end}&limit=62${empId ? `&employeeId=${empId}` : ''}`, { token });
  const rows = (att.json?.attendance ?? att.json?.data) ?? [];
  ok('attendance range query 200', att.status === 200, `rows=${Array.isArray(rows) ? rows.length : 'n/a'}`);

  // 5. notifications
  const n = await j('GET', `${BASE}/api/notifications`, { token });
  const nlist = n.json?.notifications ?? [];
  ok('notifications 200 + list', n.status === 200 && Array.isArray(nlist), `count=${nlist.length}`);

  // 6. PATCH /api/auth/me
  const patchNoBody = await j('PATCH', `${BASE}/api/auth/me`, { token, body: {} });
  ok('PATCH /me 400 on empty body (no mutation)', patchNoBody.status === 400, `status=${patchNoBody.status}`);
  if (ALLOW_PATCH && empId) {
    const before = await j('GET', `${BASE}/api/employees/${empId}`, { token });
    const origAvatar = before.json?.data?.avatar ?? before.json?.avatar ?? null;
    const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const p1 = await j('PATCH', `${BASE}/api/auth/me`, { token, body: { avatar: tiny } });
    ok('PATCH /me avatar 200', p1.status === 200 && p1.json?.user?.avatar === tiny, `status=${p1.status}`);
    const after = await j('GET', `${BASE}/api/employees/${empId}`, { token });
    const empAvatar = after.json?.data?.avatar ?? after.json?.avatar;
    ok('employee row avatar synced', empAvatar === tiny, `len=${(empAvatar || '').length}`);
    const restore = await j('PATCH', `${BASE}/api/auth/me`, { token, body: { avatar: origAvatar || '' } });
    ok('avatar restored', restore.status === 200, `status=${restore.status}`);
  }

  // 7. module matrix
  for (const path of ['/api/dashboard', '/api/employees?limit=1', '/api/leaves', '/api/attendance?limit=1', '/api/payroll?limit=1', '/api/attendance/my-summary']) {
    const r = await j('GET', `${BASE}${path}`, { token });
    ok(`module ${path} 200`, r.status === 200, `status=${r.status}`);
  }
  const empNoAuth = await j('GET', `${BASE}/api/employees?limit=1`);
  ok('employees 401 without token', empNoAuth.status === 401, `status=${empNoAuth.status}`);

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
