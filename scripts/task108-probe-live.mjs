// Task 108/109 probe: reproduce mobile-app module errors on the LIVE tenant
// (marqaitechgroup) exactly as the Flutter app calls them.
const BASE = 'https://marqaitechgroup.3boxeshrms.com';

async function j(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  return { status: res.status, data };
}

const login = await j('POST', '/api/auth/login', null, {
  email: 'hr@gmail.com',
  password: 'MarqAI@2026',
});
console.log('LOGIN', login.status, JSON.stringify({
  user: login.data.user ? {
    id: login.data.user.id,
    name: login.data.user.name,
    email: login.data.user.email,
    avatar: login.data.user.avatar,
    role: login.data.user.role,
    tenantId: login.data.user.tenantId,
    ownEmployeeId: login.data.user.ownEmployeeId,
    keys: Object.keys(login.data.user || {}),
  } : null,
}));

const token = login.data.token;
if (!token) { console.error('no token, abort'); process.exit(1); }

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const endpoints = [
  `/api/employees?page=1&limit=20`,
  `/api/leaves?page=1&status=pending`,
  `/api/attendance?date=${today}`,
  `/api/payrolls?page=1&limit=20`,
  `/api/attendance/my-summary`,
  `/api/notifications`,
  `/api/departments`,
  `/api/designations`,
  `/api/companies`,
  `/api/dashboard`,
];

for (const ep of endpoints) {
  const r = await j('GET', ep, token);
  const d = r.data;
  const summary = {
    status: r.status,
    keys: d && typeof d === 'object' ? Object.keys(d).slice(0, 8) : typeof d,
    error: d?.error,
  };
  if (ep.startsWith('/api/employees') && Array.isArray(d?.employees)) {
    const e = d.employees[0];
    summary.firstEmployeeKeys = e ? Object.keys(e).slice(0, 25) : null;
    summary.count = d.employees.length;
  }
  if (ep === '/api/dashboard') summary.preview = JSON.stringify(d).slice(0, 200);
  if (ep === '/api/attendance/my-summary') summary.preview = JSON.stringify(d).slice(0, 300);
  console.log(ep, JSON.stringify(summary));
}

// Punches for 2026-10-18 — check stored GPS for MARQ008 / MARQ011
const att = await j('GET', `/api/attendance?date=2026-10-18`, token);
const rows = att.data?.attendance || att.data?.data?.attendance || [];
console.log('ATT-2026-10-18', att.status, 'rows:', rows.length);
for (const row of rows) {
  const emp = row.employee || {};
  console.log(JSON.stringify({
    emp: `${emp.firstName || ''} ${emp.lastName || ''} (${emp.employeeId || '?'})`,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    method: row.punchMethod,
    location: row.location,
    lat: row.checkInGpsLat,
    lng: row.checkInGpsLng,
    acc: row.checkInGpsAccuracy,
    label: row.checkInGpsLabel,
    status: row.status,
  }));
}
