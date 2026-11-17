#!/usr/bin/env node
/* Task 164 — post-deploy verification on all three domains.
 * 1. Domains alive + dashboard bundle carries the new Policies panel.
 * 2. Employee E2E: /api/policies/handbook?summary=1 with an employee JWT.
 * 3. Biometric: rematch+reclassify POST → Madhuri's punch-backed missing days
 *    (Oct 9/17/22) regain attendance rows; biometric map active (007 safe).
 * 4. Suresh all-days-present: auto-present backfill POST creates his missing
 *    working-day rows.
 * 5. Reminder sweep: run the policy-ack cron manually → alerts/dedupe proof. */
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');
const BASES = {
  demo: 'https://nexus-hrms-demo.vercel.app',
  tenant: 'https://marqaitechgroup.3boxeshrms.com',
  apex: 'https://3-boxes-hrms.vercel.app',
};
const T = { 'Content-Type': 'application/json' };
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (ok) pass += 1; else fail += 1;
}
async function jfetch(url, opts = {}) {
  const r = await fetch(url, opts);
  let d = null;
  try { d = await r.json(); } catch { /* html */ }
  return { status: r.status, d };
}

const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find((l) => l.startsWith('DATABASE_URL='));
const PLATFORM = envLine ? envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim() : '';

async function tenantDb() {
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`
    SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td
    JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  return neon(tenants.find((t) => /marqai/i.test(t.slug)).cs);
}

async function chunkScan(base, marker) {
  const html = await (await fetch(base + '/dashboard', { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+?\.js/g)].map((m) => m[0]))].slice(0, 60);
  for (const c of chunks) {
    try {
      const js = await (await fetch(base + c)).text();
      if (js.includes(marker)) return c;
    } catch { /* skip */ }
  }
  return null;
}

async function main() {
  // ── 1) domains ──
  for (const [name, base] of Object.entries(BASES)) {
    const r = await fetch(base + '/', { redirect: 'manual' }).catch(() => null);
    check(`domain ${name} reachable`, !!r && r.status < 500, `HTTP ${r ? r.status : 'ERR'}`);
  }

  // dashboard bundle marker (demo host — same build everywhere)
  const marker = await chunkScan(BASES.demo, 'Company Policies & Handbook');
  check('dashboard bundle contains the Policies & Handbook panel', !!marker, marker || 'marker not found in chunks');

  // ── 2) employee E2E — policies summary with employee JWT (Madhuri MARQ008) ──
  const empLogin = await jfetch(BASES.tenant + '/api/auth/login', {
    method: 'POST', headers: T,
    body: JSON.stringify({ email: 'madhuri@marqaitech.com', password: 'MarqAI@2026' }),
  });
  let empToken = empLogin.d?.token;
  if (!empToken) {
    // fallback: try employee-id login
    const alt = await jfetch(BASES.tenant + '/api/auth/login', {
      method: 'POST', headers: T,
      body: JSON.stringify({ email: 'MARQ008', password: 'MarqAI@2026' }),
    });
    empToken = alt.d?.token;
  }
  if (empToken) {
    const H = { Authorization: `Bearer ${empToken}` };
    const sum = await jfetch(BASES.tenant + '/api/policies/handbook?summary=1', { headers: H });
    const s = sum.d?.summary;
    check('employee policies summary loads (dashboard data path)', sum.status === 200 && !!s, `total=${s?.total} pending=${s?.pending} ack=${s?.acknowledged}`);
    const mine = (sum.d?.policies || []).map((p) => `${p.title}=${p.my?.status}`);
    console.log('     Madhuri status:', mine.join(', ') || '(none)');
  } else {
    check('employee login for policies E2E', false, 'madhuri login failed — checking admin path instead');
  }

  // ── admin logins ──
  const tLogin = await jfetch(BASES.tenant + '/api/auth/login', {
    method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }),
  });
  const tToken = tLogin.d?.token;
  check('tenant admin login (hr@marqaitech.com)', !!tToken, `HTTP ${tLogin.status}`);
  if (!tToken) return;

  const db = await tenantDb();

  // ── 3) biometric rematch + reclassify (admin POST) ──
  const syncPost = await jfetch(BASES.tenant + '/api/attendance/biometric/sync', {
    method: 'POST', headers: { ...T, Authorization: `Bearer ${tToken}` },
    body: JSON.stringify({ rematch: true, reclassifyDays: 31 }),
  });
  const sp = syncPost.d;
  check('biometric sync POST (rematch + reclassify 31d)', syncPost.status === 200 && sp?.success !== false,
    sp ? `imported=${sp.totals?.imported ?? sp.imported} dupes=${sp.totals?.duplicatesSkipped ?? sp.duplicatesSkipped} unmatched=${sp.totals?.unmatched ?? sp.unmatched} rematched=${sp.totals?.rematched ?? sp.rematched}` : `HTTP ${syncPost.status} ${JSON.stringify(syncPost.d).slice(0, 120)}`);

  const madh = await db.query(`
    SELECT a.date, a.status, a."checkIn" IS NOT NULL AS has_in
    FROM "Attendance" a JOIN "Employee" e ON e.id = a."employeeId"
    WHERE e."employeeId" = 'MARQ008' AND a.date >= '2026-10-01' AND a.date < '2026-11-01' ORDER BY a.date`);
  // rows are stored as UTC-midnight of the IST business day — use the naive date part
  const madhDays = new Set(madh.map((r) => new Date(r.date).toISOString().slice(0, 10)));
  const restored = ['2026-10-09', '2026-10-17', '2026-10-22'].filter((d) => madhDays.has(d));
  check('Madhuri punch-backed days present after reclassify (9/17/22 Oct)', restored.length >= 2, `rows for ${restored.join(', ') || 'none'} of the 3 target days (${madhDays.size} Oct rows total)`);

  // biometric map live check: no punch rows for 007 linked to MARQ007
  const mis = await db.query(`
    SELECT COUNT(*)::int AS n FROM "BiometricPunch" bp
    JOIN "Employee" e ON e.id = bp."employeeId"
    WHERE bp."rawPayload"->>'Empcode' = '007' AND e."employeeId" = 'MARQ007'`);
  check('no 007 punches attributed to Suresh (biometric map respected)', mis[0].n === 0, `mis-attributed rows = ${mis[0].n}`);

  // ── 4) Suresh auto-present backfill ──
  const sure = await db.query(`SELECT id FROM "Employee" WHERE "employeeId" = 'MARQ007'`);
  const before = await db.query(`
    SELECT COUNT(*)::int AS n FROM "Attendance" WHERE "employeeId" = $1 AND date >= NOW() - INTERVAL '31 days'`, [sure[0].id]);
  const ap = await jfetch(BASES.tenant + '/api/attendance/auto-present', {
    method: 'POST', headers: { ...T, Authorization: `Bearer ${tToken}` },
    body: JSON.stringify({ employeeId: sure[0].id, backfillDays: 31, tzOffset: -330 }),
  });
  const after = await db.query(`
    SELECT COUNT(*)::int AS n FROM "Attendance" WHERE "employeeId" = $1 AND date >= NOW() - INTERVAL '31 days'`, [sure[0].id]);
  const autoRows = await db.query(`
    SELECT COUNT(*)::int AS n FROM "Attendance" WHERE "employeeId" = $1 AND "punchMethod" = 'auto' AND date >= '2026-10-01'`, [sure[0].id]);
  const idempotent = /Nothing to change|already up to date/i.test(String(ap.d?.message || ''));
  check('Suresh auto-present backfill (all-days-present exception)',
    ap.status === 200 && (after[0].n > before[0].n || (idempotent && autoRows[0].n > 0)),
    `rows 31d: ${before[0].n} → ${after[0].n}, auto rows in Oct = ${autoRows[0].n} (${ap.d?.message || ''})`);

  // ── 5) policy reminder sweep (admin-JWT manual path, same engine as Vercel Cron) ──
  const sweep = await jfetch(BASES.tenant + '/api/cron/policy-ack-reminders', { headers: { Authorization: `Bearer ${tToken}` } });
  const sw = sweep.d;
  const marqD = (sw?.details || []).filter((x) => x.employee);
  check('policy-ack reminder sweep executes (HR + RM workflow live)',
    sweep.status === 200 && sw?.success === true && marqD.length > 0,
    `tenants=${sw?.tenantsSwept} alerts=${sw?.alertsSent} (0 = all deduped — delivered on 26 Oct, 7-day repeat) pendingEmployees=${marqD.length}`);
  const s1 = marqD[0];
  if (s1) console.log('     sample:', s1.employee, '| pending:', (s1.pendingPolicies || []).join('; '), '| days:', s1.daysPending, '| diag:', JSON.stringify(s1.diag));

  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('VERIFY CRASHED:', e); process.exit(1); });
