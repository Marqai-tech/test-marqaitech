// Task 157 (f041bd5a) post-deploy E2E v2 — regularize month view + bulk update,
// Production Less Hours, Company Policies wiring, feed broadcast.
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };
const { neon } = require('@neondatabase/serverless');
const fs = require('node:fs');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); cond ? pass++ : fail++; };

const envLine = fs.readFileSync('/tmp/my-project/.env.production.local', 'utf8')
  .split('\n').find(l => l.startsWith('DATABASE_URL='));
const PLATFORM = envLine.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim();

async function pageChunks(route, cookie) {
  const html = await (await fetch(BASE + route, { headers: { Cookie: `tb_token=${cookie}` } })).text();
  return [...new Set([...html.matchAll(/src="(\/_next\/static\/[^"]+\.js[^"]*)"/g)].map(m => m[1]))];
}
async function bundleMarkers(route, markers, cookie) {
  const chunks = await pageChunks(route, cookie);
  const found = [], missing = [];
  for (const mk of markers) {
    let hit = false;
    for (const c of chunks) {
      const js = await (await fetch(BASE + c)).text();
      if (js.includes(mk)) { hit = true; break; }
    }
    (hit ? found : missing).push(mk);
  }
  return { found, missing, chunkCount: chunks.length };
}

(async () => {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }) });
  const { token } = await login.json();
  if (!token) { console.log('LOGIN FAILED'); process.exit(1); }
  const H = { ...T, Authorization: `Bearer ${token}` };

  console.log('=== 1. BUNDLE MARKERS (authenticated page chunks) ===');
  const reg = await bundleMarkers('/attendance/regularize', ['Direct Attendance Update', 'Raise Regularization Requests', 'Production Less Hours'], token);
  ok('regularize chunks contain bulk-action labels', reg.missing.length === 0, `chunks=${reg.chunkCount} found=[${reg.found}] missing=[${reg.missing}]`);
  const pol = await bundleMarkers('/company/policies', ['Appears In', 'Module Mapping'], token);
  ok('company/policies chunks contain mapping labels', pol.missing.length === 0, `chunks=${pol.chunkCount} found=[${pol.found}] missing=[${pol.missing}]`);

  console.log('=== 2. BULK-UPDATE API CONTRACT ===');
  const anon = await fetch(BASE + '/api/attendance/bulk-update', { method: 'POST', headers: T, body: '{}' });
  ok('unauthenticated POST -> 401 JSON', anon.status === 401, String(anon.status));
  const empty = await fetch(BASE + '/api/attendance/bulk-update', { method: 'POST', headers: H, body: '{}' });
  const emptyBody = await empty.json().catch(() => ({}));
  ok('auth POST updates:[] -> 422 No updates provided', empty.status === 422, empty.status + ' ' + JSON.stringify(emptyBody).slice(0, 60));

  console.log('=== 3. COMPANY POLICIES API ===');
  const pol2 = await fetch(BASE + '/api/policies', { headers: H });
  const pol2j = await pol2.json().catch(() => null);
  const list = Array.isArray(pol2j) ? pol2j : (pol2j?.policies || pol2j?.data || []);
  ok('GET /api/policies returns list', pol2.status === 200 && Array.isArray(list), pol2.status + ' n=' + list.length);
  console.log('   categories:', [...new Set(list.map(p => p.category).filter(Boolean))].join(', '));

  console.log('=== 4. FEED BROADCAST E2E ===');
  const platform = neon(PLATFORM);
  const tenants = await platform.query(`SELECT t.slug, td."connectionString" AS cs FROM "TenantDatabase" td JOIN "Tenant" t ON t.id = td."tenantId" WHERE td."isActive" = true`);
  const trow = tenants.find(x => /marqai/i.test(x.slug));
  const db = neon(trow.cs);

  // reuse the post created by the first E2E pass (its broadcast already fired)
  let posts = await db.query(`SELECT id, content FROM "SocialPost" WHERE content LIKE '%Feed broadcast check%' ORDER BY "createdAt" DESC LIMIT 1`);
  let postId = posts[0]?.id;
  ok('verification feed post exists', Boolean(postId), postId || 'none');
  if (!postId) {
    const stamp = new Date().toISOString().slice(0, 16);
    const fp = await fetch(BASE + '/api/social-feed', { method: 'POST', headers: H, body: JSON.stringify({ content: `[Verification] Feed broadcast check at ${stamp} — every active user should receive this as an in-app notification and an email. — automated Task 157 verify`, postType: 'general' }) });
    postId = (await fp.json().catch(() => null))?.post?.id;
    ok('HR feed post created (201)', fp.status === 201, fp.status + ' id=' + postId);
  }

  const del = await db.query(`SELECT channel, status, COUNT(*)::int AS n FROM "NotificationDelivery" WHERE "eventKey" = 'core_hr.announcement.published' AND "entityId" = $1 GROUP BY channel, status`, [postId]);
  const inApp = del.filter(r => r.channel === 'in_app').reduce((a, r) => a + r.n, 0);
  const email = del.filter(r => r.channel === 'email').reduce((a, r) => a + r.n, 0);
  const sent = del.filter(r => r.status === 'sent').reduce((a, r) => a + r.n, 0);
  console.log('   delivery rows:', JSON.stringify(del));
  ok('in-app notifications fanned out', inApp > 0, 'in_app=' + inApp);
  ok('email dispatch logged', email > 0, 'email=' + email + ' (sent=' + sent + ')');

  const notif = await db.query(`SELECT COUNT(*)::int AS n FROM "Notification" WHERE "link" = '/social-feed' AND "createdAt" >= NOW() - INTERVAL '30 minutes'`);
  ok('mobile-visible Notification rows created', (notif[0]?.n || 0) > 0, 'rows=' + (notif[0]?.n || 0));

  const users = await db.query(`SELECT COUNT(*)::int AS n FROM "User" WHERE status = 'active'`);
  console.log(`   active tenant users: ${users[0]?.n} (broadcast target)`);

  // cleanup: remove the verification post
  const rm = await db.query(`DELETE FROM "SocialPost" WHERE id = $1 RETURNING id`, [postId]);
  console.log('   cleanup: test post removed', rm.length ? postId : '(already gone)');

  console.log(`\nTOTAL: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('E2E ERROR:', e.message); process.exit(1); });
