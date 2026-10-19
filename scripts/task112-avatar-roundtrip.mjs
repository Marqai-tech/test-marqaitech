// Task 112 — one-off avatar round-trip on the LIVE tenant (with restore).
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const CREDS = { email: 'hr@marqaitech.com', password: 'MarqAI@2026' };
const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function j(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const login = await j('POST', `${BASE}/api/auth/login`, null, CREDS);
const token = login.json?.token;
if (!token) { console.log('FAIL login', login.status); process.exit(1); }
console.log('PASS login');

const me = await j('GET', `${BASE}/api/auth/me`, token);
let empId = me.json?.employee?.id;
if (!empId) {
  // /auth/me may omit the employee block for linked admins — my-summary is
  // the canonical resolver (same chain the mobile app uses).
  const s = await j('GET', `${BASE}/api/attendance/my-summary`, token);
  empId = s.json?.employee?.id;
}
console.log(empId ? `PASS own employee id=${empId}` : 'FAIL no employee link');

// GET /api/employees/[id] returns { employee: {...} } — read that shape.
const empOf = (r) => r.json?.employee ?? r.json?.data ?? r.json ?? {};

const before = await j('GET', `${BASE}/api/employees/${empId}`, token);
const orig = empOf(before).avatar ?? null;
console.log(`INFO original avatar length=${(orig || '').length}`);

const p = await j('PATCH', `${BASE}/api/auth/me`, token, { avatar: tiny });
console.log(p.status === 200 && p.json?.user?.avatar === tiny ? 'PASS PATCH avatar 200 + user updated' : `FAIL PATCH ${p.status} ${JSON.stringify(p.json).slice(0,120)}`);
console.log(p.json?.employeeUpdated === true ? 'PASS employeeUpdated flag true' : 'WARN employeeUpdated flag not true');

const after = await j('GET', `${BASE}/api/employees/${empId}`, token);
const empAvatar = empOf(after).avatar;
console.log(empAvatar === tiny ? 'PASS employee row avatar synced' : `FAIL employee avatar len=${(empAvatar || '').length}`);

const r = await j('PATCH', `${BASE}/api/auth/me`, token, { avatar: orig || '' });
console.log(r.status === 200 ? 'PASS avatar restored' : `FAIL restore ${r.status}`);
const fin = await j('GET', `${BASE}/api/employees/${empId}`, token);
const finAvatar = empOf(fin).avatar;
console.log(finAvatar === orig ? 'PASS verified restore matches original' : 'FAIL restore mismatch');
