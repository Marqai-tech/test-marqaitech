/**
 * Task 132 — post-deploy E2E: mobile login ladder for mahesh@marqaitech.com
 * (plus regressions). Simulates the app's ladder: demo workspace → apex →
 * suggested tenant subdomain → authenticated session.
 */
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const APEX = 'https://3boxeshrms.com';
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function post(base, body) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function main() {
  console.log('=== 1. Full mobile ladder for mahesh@marqaitech.com ===');
  // Hop 1 — demo workspace (app default)
  const h1 = await post(DEMO, { email: 'mahesh@marqaitech.com', password: 'MarqAI@2026', rememberMe: true });
  // 401 before the mirror row; 403 "use your organization's login page" now that
  // the platform mirror exists (Rule 2) — both are correct rejections for the ladder.
  check('hop1 demo rejects (401/403)', h1.status === 401 || h1.status === 403, `${h1.status} ${String(h1.data.error).slice(0, 60)}`);
  // Hop 2 — apex (auto-fallback) → must SUGGEST the tenant workspace
  const h2 = await post(APEX, { email: 'mahesh@marqaitech.com', password: 'MarqAI@2026', rememberMe: true });
  check('hop2 apex answers 403 + suggestedUrl', h2.status === 403 && !!h2.data.suggestedUrl, h2.data.suggestedUrl || h2.data.error);
  const target = (h2.data.suggestedUrl || '').replace('/login', '');
  check('suggested target is marqaitechgroup', target === TENANT, target);
  // Hop 3 — tenant host → authenticated session
  const h3 = await post(target, { email: 'mahesh@marqaitech.com', password: 'MarqAI@2026', rememberMe: true });
  check('hop3 tenant login 200', h3.status === 200, '');
  check('token minted', typeof h3.data.token === 'string' && h3.data.token.length > 40, '');
  check('user role = ceo', h3.data.user?.role === 'ceo', h3.data.user?.role);
  check('user id = tenant id cmvjrt0ja000008i6vmvw0hbn', h3.data.user?.id === 'cmvjrt0ja000008i6vmvw0hbn', h3.data.user?.id);
  // rememberMe → 30-day token (iat/exp gap ≈ 30d)
  const payload = JSON.parse(Buffer.from(h3.data.token.split('.')[1], 'base64').toString());
  const days = (payload.exp - payload.iat) / 86400;
  check('rememberMe token ≈ 30 days', days > 28, `${days.toFixed(1)}d`);

  console.log('=== 2. Session actually works (CEO sees company) ===');
  const me = await fetch(`${TENANT}/api/auth/me`, { headers: { Authorization: `Bearer ${h3.data.token}` }, signal: AbortSignal.timeout(30000) }).then(r => r.json()).catch(() => null);
  const meEmail = me?.user?.email ?? me?.email;
  check('GET /api/auth/me 200 + same user', meEmail === 'mahesh@marqaitech.com', String(meEmail || JSON.stringify(me).slice(0, 80)));
  const emps = await fetch(`${TENANT}/api/employees?limit=200`, { headers: { Authorization: `Bearer ${h3.data.token}` }, signal: AbortSignal.timeout(30000) }).then(r => r.json()).catch(() => null);
  const list = emps?.employees || emps?.data || [];
  check('CEO sees full employee directory (scope=all)', Array.isArray(list) && list.length >= 10, `count=${Array.isArray(list) ? list.length : 'n/a'}`);

  console.log('=== 3. Regressions ===');
  const wrongPw = await post(APEX, { email: 'mahesh@marqaitech.com', password: 'WrongPassword1!', rememberMe: true });
  check('apex + WRONG password → 401 (no tenant leak)', wrongPw.status === 401 && !wrongPw.data.suggestedUrl, wrongPw.data.error?.slice(0, 50));
  const unknown = await post(APEX, { email: 'nobody@nowhere.example', password: 'Whatever#123', rememberMe: true });
  check('apex + unknown email → 401', unknown.status === 401 && !unknown.data.suggestedUrl, '');
  const hr = await post(APEX, { email: 'hr@marqaitech.com', password: 'MarqAI@2026', rememberMe: true });
  check('apex + hr@marqaitech.com → 403 + suggestedUrl (mirror path unchanged)', hr.status === 403 && hr.data.suggestedUrl === 'https://marqaitechgroup.3boxeshrms.com/login', '');
  const wrongPwTenant = await post(TENANT, { email: 'mahesh@marqaitech.com', password: 'WrongPassword1!', rememberMe: true });
  check('tenant + WRONG password → 401', wrongPwTenant.status === 401, '');
  const demoLogin = await post(DEMO, { email: 'admin@acme-global.com', password: 'MarqAI@2026', rememberMe: true });
  check('demo login unaffected → 200', demoLogin.status === 200 && !!demoLogin.data.token, '');
  const superadmin = await post(APEX, { email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026', rememberMe: true });
  check('superadmin at apex unaffected → 200', superadmin.status === 200 && !!superadmin.data.token, '');
  const hrTenant = await post(TENANT, { email: 'hr@marqaitech.com', password: 'MarqAI@2026', rememberMe: true });
  check('tenant + hr login unaffected → 200', hrTenant.status === 200 && hrTenant.data.user?.role === 'tenant_admin', '');

  console.log(`\nRESULT: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
