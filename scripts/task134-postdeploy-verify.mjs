#!/usr/bin/env node
/* Task 134 — post-deploy E2E for the Change Password feature on LIVE.
 *
 * Strategy: use two REAL MarqAI accounts that cover BOTH mirror-sync paths
 * proven by scripts/task134-mirror-sanity.cjs:
 *   - hr@marqaitech.com   (tenant_admin, platform mirror has a DIFFERENT id
 *                           → exercises the by-EMAIL fallback)
 *   - amrutha@marqaitech.com (employee, mirror shares the id
 *                           → exercises the by-ID path)
 * Each account: validation probes → real change → old rejected on tenant +
 * apex, new accepted on tenant + apex (mirror proof) → RESTORE → ladder
 * regression (demo → apex → tenant) with the original password.
 * Every password is restored to MarqAI@2026 before the script exits.
 */
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const APEX = 'https://3boxeshrms.com';
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const OLD_PW = 'MarqAI@2026';
const NEW_PW = 'Task134-Verify#2026';

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const j = async (url, opts = {}) => {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
};

async function loginTenant(email, password) {
  const r = await j(`${TENANT}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }) });
  return { status: r.status, token: r.body?.token || r.body?.data?.token || null, body: r.body };
}
async function loginApex(email, password) {
  return j(`${APEX}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }) });
}
async function changePassword(token, currentPassword, newPassword) {
  return j(`${TENANT}/api/auth/change-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

async function fullCycle(email) {
  console.log(`\n═══ ${email} ═══`);
  const first = await loginTenant(email, OLD_PW);
  ok('login with ORIGINAL password', first.status === 200 && first.token, `status ${first.status}`);
  if (!first.token) return false;
  const token = first.token;

  // ── validation probes (no state change) ──
  const noTok = await fetch(`${TENANT}/api/auth/change-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: OLD_PW, newPassword: NEW_PW }),
  });
  ok('unauthenticated change → 401', noTok.status === 401, `status ${noTok.status}`);

  const wrongCur = await changePassword(token, 'Definitely-Wrong-1!', NEW_PW);
  ok('wrong current password → 400', wrongCur.status === 400 && /incorrect/i.test(wrongCur.body?.error || ''), `status ${wrongCur.status}`);

  const tooShort = await changePassword(token, OLD_PW, 'short1!');
  ok('new < 8 chars → 400', tooShort.status === 400, `status ${tooShort.status}`);

  const same = await changePassword(token, OLD_PW, OLD_PW);
  ok('new == current → 400', same.status === 400 && /different/i.test(same.body?.error || ''), `status ${same.status}`);

  // ── REAL CHANGE ──
  const change = await changePassword(token, OLD_PW, NEW_PW);
  ok('change-password → 200', change.status === 200, `status ${change.status} mirrored=${change.body?.mirrored}`);

  const oldTenant = await loginTenant(email, OLD_PW);
  ok('OLD password rejected on tenant host', oldTenant.status === 401, `status ${oldTenant.status}`);

  const newTenant = await loginTenant(email, NEW_PW);
  ok('NEW password works on tenant host', newTenant.status === 200 && !!newTenant.token, `status ${newTenant.status}`);

  const newApex = await loginApex(email, NEW_PW);
  const suggested = newApex.body?.suggestedUrl || '';
  ok('NEW password verified at apex (mirror updated) → 403 + suggestedUrl', newApex.status === 403 && suggested.includes('marqaitechgroup'), `status ${newApex.status} suggestedUrl=${suggested}`);

  const oldApex = await loginApex(email, OLD_PW);
  ok('OLD password rejected at apex (mirror really rotated)', oldApex.status === 401, `status ${oldApex.status}`);

  // ── RESTORE ──
  const restore = await changePassword(newTenant.token || token, NEW_PW, OLD_PW);
  ok('restore original password → 200', restore.status === 200, `status ${restore.status}`);

  const backTenant = await loginTenant(email, OLD_PW);
  ok('original password works again', backTenant.status === 200 && !!backTenant.token, `status ${backTenant.status}`);
  return backTenant.status === 200;
}

async function ladderRegression(email) {
  console.log(`\n═══ mobile ladder regression: ${email} ═══`);
  const hop1 = await j(`${DEMO}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email, password: OLD_PW }) });
  ok('hop1 demo → 401/403 (not this workspace)', hop1.status === 401 || hop1.status === 403, `status ${hop1.status}`);
  const hop2 = await loginApex(email, OLD_PW);
  ok('hop2 apex → 403 + suggestedUrl (mirror verified)', hop2.status === 403 && (hop2.body?.suggestedUrl || '').includes('marqaitechgroup'), `status ${hop2.status}`);
  const hop3 = await loginTenant(email, OLD_PW);
  ok('hop3 tenant → 200 + token', hop3.status === 200 && !!hop3.token, `status ${hop3.status}`);
}

async function main() {
  const hrOk = await fullCycle('hr@marqaitech.com');
  if (hrOk) {
    await fullCycle('amrutha@marqaitech.com');
    await ladderRegression('hr@marqaitech.com');
  }
  // Super admin path stays intact (no password change — just proves apex login still fine).
  const sa = await j(`${APEX}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: OLD_PW }) });
  ok('superadmin apex login unchanged', sa.status === 200, `status ${sa.status}`);

  console.log(`\n${pass}/${pass + fail} checks pass`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
