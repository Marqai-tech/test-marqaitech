/**
 * Task 84 probe — admin view dashboard punches not showing (READ-ONLY)
 * Simulates exactly what /attendance admin view does:
 *   1. POST /api/attendance/auto-present  (sync for selected day)
 *   2. GET  /api/attendance?date=YYYY-MM-DD&limit=200
 *   3. GET  /api/employees?limit=500&status=active
 * Then checks whether returned rows carry checkIn/checkOut.
 */
const BASES = {
  LIVE: 'https://marqaitechgroup.3boxeshrms.com',
  DEMO: 'https://nexus-hrms-mu.vercel.app',
};
const CREDS = {
  LIVE: { email: 'hr@gmail.com', password: 'MarqAI@2026' },
  DEMO: { email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' },
};
const SLUGS = { LIVE: 'marqaitechgroup', DEMO: '3boxes-hrms-demo' };

async function jfetch(base, path, opts = {}) {
  const res = await fetch(`${base}${path}`, opts);
  let data; try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

for (const [name, base] of Object.entries(BASES)) {
  console.log(`\n===== ${name} (${base}) =====`);
  const lr = await jfetch(base, '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CREDS[name]),
  });
  const token = lr.data?.token;
  console.log(`login: ${lr.status} role=${lr.data?.user?.role}`);
  if (!token) continue;
  const H = { Authorization: `Bearer ${token}`, 'x-tenant-slug': SLUGS[name], 'Content-Type': 'application/json' };

  // browser-local today (IST) — emulate client
  const nowMs = Date.now() + 5.5 * 3600 * 1000;
  const nowIst = new Date(nowMs);
  const today = localDateKey(nowIst);
  console.log(`client-today (IST): ${today}`);

  // step 1: auto-present sync (same as the page does — it's idempotent)
  const ap = await jfetch(base, '/api/attendance/auto-present', {
    method: 'POST', headers: H,
    body: JSON.stringify({ date: today, tzOffset: -330, todayKey: today }),
  });
  console.log(`auto-present sync: ${ap.status} ${JSON.stringify(ap.data).slice(0, 200)}`);

  // step 2: the admin-view attendance fetch
  const att = await jfetch(base, `/api/attendance?date=${today}&limit=200`, { headers: H });
  const rows = att.data?.attendance || [];
  console.log(`attendance for ${today}: status=${att.status} rows=${rows.length}`);
  rows.slice(0, 12).forEach(r => {
    console.log(`  ${r.employee?.employeeId || r.employeeId || '?'} ${String(r.employee?.firstName || '')} date=${(r.date || '').slice(0, 16)} status=${r.status} in=${r.checkIn ? new Date(r.checkIn).toISOString() : 'null'} out=${r.checkOut ? new Date(r.checkOut).toISOString() : 'null'} method=${r.punchMethod || '-'}`);
  });

  // step 3: employees roster
  const emps = await jfetch(base, `/api/employees?limit=500&status=active`, { headers: H });
  const erows = emps.data?.employees || [];
  console.log(`employees active: ${erows.length}`);

  // yesterday too (data day with punches)
  const yst = localDateKey(new Date(nowMs - 24 * 3600 * 1000));
  const attY = await jfetch(base, `/api/attendance?date=${yst}&limit=200`, { headers: H });
  const yrows = attY.data?.attendance || [];
  const withPunch = yrows.filter(r => r.checkIn);
  console.log(`yesterday ${yst}: rows=${yrows.length} withCheckIn=${withPunch.length}`);
  withPunch.slice(0, 8).forEach(r => {
    console.log(`  ${r.employee?.employeeId || '?'} date=${(r.date || '').slice(0, 16)} in=${r.checkIn ? new Date(r.checkIn).toISOString() : 'null'} out=${r.checkOut ? new Date(r.checkOut).toISOString() : 'null'}`);
  });

  // raw DB dates sample via month window for Oct
  const attM = await jfetch(base, `/api/attendance?startDate=${today.slice(0, 7)}-01&endDate=${today.slice(0, 7)}-28&limit=10000`, { headers: H });
  const mrows = attM.data?.attendance || [];
  const dateCounts = {};
  mrows.forEach(r => { const k = (r.date || '').slice(0, 10); dateCounts[k] = (dateCounts[k] || 0) + 1; });
  console.log(`month rows: ${mrows.length}, per-date:`, JSON.stringify(dateCounts));
}
