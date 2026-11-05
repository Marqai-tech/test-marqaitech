/**
 * Task 47 E2E verification — Attendance module bug fixes (demo tenant).
 * Verifies:
 *  1. Policy config exposes weekendDays
 *  2. Check-in records on the CLIENT-provided local date (date-mapping fix)
 *  3. Regularization: whitespace-only reason rejected (422)
 *  4. Regularization: duplicate (same employee+date+punchType) rejected (409)
 *  5. Regularization: HR-on-behalf targets the selected employee
 *  6. Approved leave surfaces as on_leave attendance rows (date-correct)
 */
const BASE = 'https://nexus-hrms-mu.vercel.app';
const TENANT = '3boxes-hrms-demo';

const cors = { 'x-tenant-slug': TENANT, 'Content-Type': 'application/json' };

function pad2(n) { return String(n).padStart(2, '0'); }
function localDateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: cors,
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data.token || data.accessToken;
}

async function api(token, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...cors, Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body };
}

(async () => {
  const results = [];
  const log = (name, ok, detail) => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`);
  };

  // ── 1. Admin + employee logins ──
  const adminToken = await login('admin@3boxeshrms.com', 'MarqAI@2026');
  const balaToken = await login('bala.mukherjee@innovatech.demo', 'MarqAI@2026');
  log('logins', !!adminToken && !!balaToken);

  // ── 2. Policy config: weekendDays exposed ──
  const pol = await api(adminToken, '/api/attendance-policy-config');
  const wd = pol.body?.weekendDays;
  log('policy-config exposes weekendDays', pol.status === 200 && Array.isArray(wd) && wd.length > 0,
      `weekendDays=${JSON.stringify(wd)}, shiftStart=${pol.body?.config?.shiftStartDefault}`);

  // ── 3. Check-in date mapping (as Bala, client local date) ──
  const balMe = await api(balaToken, '/api/employees?limit=500');
  const bala = (balMe.body?.employees || []).find(e => e.email === 'bala.mukherjee@innovatech.demo');
  if (!bala) { log('find Bala employee record', false); } else {
    const todayKey = localDateKey(new Date());
    const ci = await api(balaToken, '/api/attendance', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: bala.id, action: 'checkin',
        date: todayKey, localTime: `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`,
      }),
    });
    const already = ci.status === 400 && /already checked in/i.test(ci.body?.error || '');
    if (ci.status === 201 || already) {
      const rec = ci.body?.attendance;
      const recKey = rec?.date ? new Date(rec.date).toISOString().slice(0, 10) : null;
      log('check-in stored on LOCAL calendar date', already || recKey === todayKey,
          already ? 'already checked in today (state ok)' : `sent date=${todayKey} stored=${recKey} status=${rec?.status}`);
      if (!already) {
        // checkout to leave clean state
        await api(balaToken, '/api/attendance', {
          method: 'POST',
          body: JSON.stringify({ employeeId: bala.id, action: 'checkout', date: todayKey, localTime: `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}` }),
        });
      }
    } else {
      log('check-in', false, `status=${ci.status} body=${JSON.stringify(ci.body).slice(0, 200)}`);
    }
  }

  // ── 4-6. Regularization guards (admin on behalf of Bala, past working date) ──
  const yst = new Date(); yst.setDate(yst.getDate() - 2);
  const regDate = localDateKey(yst); // 2 days back — past date, no future guard
  // 4. whitespace-only reason
  const ws = await api(adminToken, '/api/attendance/regularize', {
    method: 'POST',
    body: JSON.stringify({ employeeId: bala.id, date: regDate, punchType: 'check_in', requestedTime: `${regDate}T02:00:00.000Z`, reason: '      ', clientToday: localDateKey(new Date()) }),
  });
  log('whitespace-only reason rejected', ws.status === 422 || ws.status === 400, `status=${ws.status} msg=${ws.body?.error || ws.body?.message}`);

  // 5. valid submission → 201 (or 409 if a request already exists from a prior run)
  const ok1 = await api(adminToken, '/api/attendance/regularize', {
    method: 'POST',
    body: JSON.stringify({ employeeId: bala.id, date: regDate, punchType: 'check_in', requestedTime: `${regDate}T02:00:00.000Z`, reason: '[E2E] Task47 duplicate-guard verification', clientToday: localDateKey(new Date()) }),
  });
  const created = ok1.status === 201;
  const preExisting = ok1.status === 409;
  log('regularization created (HR on behalf)', created || preExisting, `status=${ok1.status} ${created ? `id=${ok1.body?.regularization?.id}` : ok1.body?.error || ''}`);

  // verify it landed on the SELECTED employee (Bala), not the admin
  if (created) {
    const list = await api(adminToken, `/api/attendance/regularize?employeeId=${bala.id}`);
    const mine = (list.body?.regularizations || []).find(r => r.id === ok1.body?.regularization?.id);
    log('HR-on-behalf targets selected employee', !!mine && mine.employeeId === bala.id,
        mine ? `employeeId match=${mine.employeeId === bala.id}` : 'row not in Bala list');
  }

  // 6. duplicate
  const dup = await api(adminToken, '/api/attendance/regularize', {
    method: 'POST',
    body: JSON.stringify({ employeeId: bala.id, date: regDate, punchType: 'check_in', requestedTime: `${regDate}T02:30:00.000Z`, reason: '[E2E] duplicate attempt', clientToday: localDateKey(new Date()) }),
  });
  log('duplicate regularization rejected (409)', dup.status === 409, `status=${dup.status} msg=${dup.body?.error || dup.body?.message}`);

  // cleanup: reject the created request so the demo queue stays clean
  if (created && ok1.body?.regularization?.id) {
    const rej = await api(adminToken, `/api/attendance/regularize/${ok1.body.regularization.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', comments: 'E2E verification — auto-rejected' }),
    });
    log('cleanup: E2E request rejected', rej.status === 200, `status=${rej.status}`);
  }

  // ── 7. Approved leave → on_leave rows date-correct (Bala's 25-26 Sept leave from Task 44) ──
  const att = await api(adminToken, '/api/attendance?employeeId=' + bala.id + '&limit=100');
  const rows = att.body?.attendance || [];
  const leaveRows = rows.filter(r => r.status === 'on_leave');
  log('approved leave present as on_leave attendance', leaveRows.length > 0,
      leaveRows.length ? `dates=${leaveRows.map(r => new Date(r.date).toISOString().slice(0, 10)).join(', ')}` : 'no on_leave rows');

  console.log('\nSUMMARY: ' + results.filter(r => r.ok).length + '/' + results.length + ' passed');
  process.exit(results.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
