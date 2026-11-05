/* Diagnostic: reproduce "attendance reports not projecting any data" on demo tenant */
const BASE = 'https://nexus-hrms-mu.vercel.app';

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-slug': '3boxes-hrms-demo' },
    body: JSON.stringify({ email, password: 'MarqAI@2026' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(data)}`);
  return data.token;
}

async function get(token, url) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': '3boxes-hrms-demo' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: res.status, body };
}

(async () => {
  const admin = await login('admin@3boxeshrms.com');
  console.log('✓ admin logged in');

  const types = ['attendance_report', 'employee_report', 'leave_report'];
  for (const t of types) {
    const r = await get(admin, `/api/reports?type=${t}`);
    if (t === 'attendance_report' && r.status === 200) {
      const b = r.body;
      console.log(`\n== ${t} ==`);
      console.log('attendanceRate:', b.attendanceRate, '| lateArrivals:', b.lateArrivals, '| totalOvertime:', b.totalOvertime, '| total:', b.total, '| scope:', b.dataScope);
      console.log('byStatus:', JSON.stringify(b.byStatus));
      console.log('first 3 records:', JSON.stringify((b.records || []).slice(0, 3), null, 1));
    } else {
      console.log(`\n== ${t} == status ${r.status}, total=${r.body?.total}, keys=${Object.keys(r.body || {}).join(',')}`);
    }
  }

  // check raw attendance rows count via attendance API (admin view style)
  const att = await get(admin, '/api/attendance?limit=5');
  console.log('\n== /api/attendance?limit=5 ==', att.status, 'keys:', Object.keys(att.body || {}));
  if (att.body?.records) console.log('records:', att.body.records.length, JSON.stringify(att.body.records[0] || null));
  else if (att.body?.data) console.log('data:', att.body.data.length, JSON.stringify(att.body.data[0] || null));
  else console.log(JSON.stringify(att.body).slice(0, 500));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
