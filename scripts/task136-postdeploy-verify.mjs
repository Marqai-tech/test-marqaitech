#!/usr/bin/env node
/* Task 136 — post-deploy E2E for the birthday feature on LIVE.
 *
 * Strategy: wait for v1.6.4 to land → probe GET /api/birthdays shape → pick a
 * REAL employee (amrutha@marqaitech.com), remember her originalBirthday, set
 * it to TODAY via the tenant DB (direct), then:
 *   1. GET /api/birthdays shows her under `today`.
 *   2. POST /api/birthdays/wish (hr@marqaitech.com sender) → success +
 *      delivered counters; repeat → alreadyWished (idempotent).
 *   3. Admin-JWT cron run (sweeps ONLY marqaitechgroup) → greetingsSent >= 1
 *      with an auto row for her.
 *   4. RESTORE her original birthday value (NULL or the prior date) and
 *      verify /api/birthdays no longer lists her under today.
 * Every probe prints PASS/FAIL; exits non-zero on any failure.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { neon } = require('@neondatabase/serverless');

const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const HR_EMAIL = 'hr@marqaitech.com';
const HR_PW = 'MarqAI@2026';
const TARGET_EMAIL = 'amrutha@marqaitech.com';

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const j = async (url, opts = {}) => {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let body = null; try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
};

function istTodayKey() {
  const n = new Date(Date.now() + 5.5 * 3600 * 1000);
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
}

async function main() {
  // ── 0. wait for the deploy ──
  console.log('waiting for v1.6.4 deploy…');
  let live = null;
  for (let i = 0; i < 40; i++) {
    const v = await j(`${TENANT}/api/public/app-version`).catch(() => null);
    if (v?.body?.versionName === '1.6.4') { live = v.body; break; }
    await new Promise((r) => setTimeout(r, 15000));
  }
  ok('deploy live (app-version 1.6.4)', Boolean(live), live ? `apk=${live.apkUrl}` : 'timed out');
  if (!live) process.exit(1);

  // ── 1. login HR ──
  const hr = await j(`${TENANT}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email: HR_EMAIL, password: HR_PW }) });
  const hrToken = hr.body?.token || hr.body?.data?.token;
  ok('hr@marqaitech.com login', hr.status === 200 && hrToken, `status ${hr.status}`);
  if (!hrToken) process.exit(1);
  const H = { Authorization: `Bearer ${hrToken}` };

  // ── 2. birthdays shape probe ──
  const b0 = await j(`${TENANT}/api/birthdays`, { headers: H });
  ok('GET /api/birthdays → 200', b0.status === 200, `status ${b0.status}`);
  ok('shape: today + upcoming arrays', Array.isArray(b0.body?.today) && Array.isArray(b0.body?.upcoming), `today=${b0.body?.today?.length}, upcoming=${b0.body?.upcoming?.length}, date=${b0.body?.date}`);

  // ── 3. set the target employee's originalBirthday to TODAY (IST) ──
  const plat = neon(process.env.DATABASE_URL);
  const trow = await plat`SELECT td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE t.slug = 'marqaitechgroup' LIMIT 1`;
  const tdb = neon(trow[0].cs);
  const before = await tdb`SELECT id, "originalBirthday" FROM "Employee" WHERE lower(email) = ${TARGET_EMAIL} LIMIT 1`;
  ok('target employee found in tenant DB', before.length === 1, before[0]?.id || 'not found');
  if (!before.length) process.exit(1);
  const empId = before[0].id;
  const priorBirthday = before[0].originalBirthday; // may be null
  await tdb`UPDATE "Employee" SET "originalBirthday" = ${istTodayKey() + 'T00:00:00.000Z'}::timestamptz WHERE id = ${empId}`;
  console.log(`  … set originalBirthday=${istTodayKey()} (prior: ${priorBirthday || 'NULL'}) for ${TARGET_EMAIL}`);

  try {
    // ── 4. she appears under today ──
    const b1 = await j(`${TENANT}/api/birthdays`, { headers: H });
    const her = (b1.body?.today || []).find((p) => p.employeeId === empId);
    ok('birthday employee appears under today', Boolean(her), her ? `${her.name} (${her.employeeCode})` : 'missing');

    // ── 5. manual wish + idempotency ──
    const w1 = await j(`${TENANT}/api/birthdays/wish`, { method: 'POST', headers: H, body: JSON.stringify({ employeeId: empId }) });
    ok('send wish → success', w1.status === 200 && w1.body?.success === true, JSON.stringify(w1.body?.delivered || w1.body?.error || {}));
    const w2 = await j(`${TENANT}/api/birthdays/wish`, { method: 'POST', headers: H, body: JSON.stringify({ employeeId: empId }) });
    ok('repeat wish → alreadyWished (one per sender per year)', w2.status === 200 && w2.body?.alreadyWished === true, `status ${w2.status}`);

    // ── 6. auto cron (admin-JWT mode → only this tenant) ──
    const c1 = await j(`${TENANT}/api/cron/birthday-greetings`, { headers: H });
    const det = c1.body?.details?.[0] || {};
    const autoForHer = await tdb`SELECT id, source, year, "senderName" FROM "BirthdayGreeting" WHERE "employeeId" = ${empId} AND source = 'auto' LIMIT 1`;
    ok('cron run → success + auto greeting row created', c1.status === 200 && c1.body?.success === true && autoForHer.length === 1,
      `tenants=${c1.body?.tenantsSwept}, birthdays=${c1.body?.birthdaysFound}, sent=${c1.body?.greetingsSent}, emails=${c1.body?.emails}, notif=${c1.body?.notifications}`);
    ok('cron dedupe label', det.tenant === 'MarqAI Tech Group' || Boolean(det.tenant), `tenant=${det.tenant || c1.body?.details?.[0]?.tenant}`);
    const c2 = await j(`${TENANT}/api/cron/birthday-greetings`, { headers: H });
    const autoRowsAfter = await tdb`SELECT count(*)::int AS n FROM "BirthdayGreeting" WHERE "employeeId" = ${empId} AND source = 'auto'`;
    ok('cron rerun does NOT duplicate auto greeting (one per year)', c2.status === 200 && autoRowsAfter[0].n === 1, `auto rows=${autoRowsAfter[0].n}`);

    // ── 7. wish list reflects the greetings ──
    const b2 = await j(`${TENANT}/api/birthdays`, { headers: H });
    const her2 = (b2.body?.today || []).find((p) => p.employeeId === empId);
    ok('wish count >= 2 (manual + auto) and wishedByMe', Boolean(her2) && (her2.wishCount || 0) >= 2 && her2.wishedByMe === true,
      `wishCount=${her2?.wishCount}`);
  } finally {
    // ── 8. restore ──
    if (priorBirthday) {
      await tdb`UPDATE "Employee" SET "originalBirthday" = ${priorBirthday.toISOString()} WHERE id = ${empId}`;
    } else {
      await tdb`UPDATE "Employee" SET "originalBirthday" = NULL WHERE id = ${empId}`;
    }
    console.log(`  … restored originalBirthday for ${TARGET_EMAIL} (${priorBirthday ? priorBirthday.toISOString().slice(0, 10) : 'NULL'})`);
  }

  const b3 = await j(`${TENANT}/api/birthdays`, { headers: H });
  const stillToday = (b3.body?.today || []).some((p) => p.employeeId === empId);
  ok('employee no longer under today after restore', b3.status === 200 && !stillToday);

  console.log(`\n${pass}/${pass + fail} PASS`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
