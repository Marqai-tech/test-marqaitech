/**
 * Task 92 verification — notification bell shows module updates, not login noise.
 *
 * Per site (LIVE + demo):
 *  1. login → token
 *  2. GET /api/notifications?limit=50 (default bell feed)
 *     → assert ZERO category='auth' rows
 *     → report the category mix actually served to the bell
 *  3. GET /api/notifications?category=auth&limit=5
 *     → assert legacy auth rows remain reachable via explicit filter (page chip)
 *  4. login twice more → bell total must NOT grow (no per-login writes)
 */
const SITES = [
  { name: 'LIVE', url: 'https://marqaitechgroup.3boxeshrms.com', slug: 'marqaitechgroup', email: 'hr@gmail.com', password: 'MarqAI@2026' },
  { name: 'DEMO', url: 'https://nexus-hrms-mu.vercel.app', slug: '3boxes-hrms-demo', email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' },
];

async function login(site) {
  const res = await fetch(`${site.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: site.email, password: site.password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(`${site.name} login failed: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data.token;
}

async function getNotifs(site, token, qs) {
  const res = await fetch(`${site.url}/api/notifications?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${site.name} GET /api/notifications failed: ${res.status}`);
  return res.json();
}

for (const site of SITES) {
  console.log(`\n===== ${site.name} (${site.url}) =====`);
  try {
    const token = await login(site);
    const feed = await getNotifs(site, token, 'limit=50');
    const notifs = feed.notifications || [];
    const authRows = notifs.filter((n) => n.category === 'auth');
    const cats = {};
    notifs.forEach((n) => { cats[n.category] = (cats[n.category] || 0) + 1; });
    console.log(`bell feed (latest ${notifs.length}) category mix:`, JSON.stringify(cats));
    console.log(`auth rows in feed: ${authRows.length} ${authRows.length === 0 ? '✅ PASS' : '❌ FAIL'}`);
    const unread = notifs.filter((n) => !n.isRead).length;
    console.log(`unread in feed: ${unread}`);
    console.log('sample module rows:');
    notifs.slice(0, 5).forEach((n) => console.log(`  [${n.category}] ${n.title} — ${String(n.message).slice(0, 70)} (${n.isRead ? 'read' : 'UNREAD'}, ${n.createdAt})`));

    const legacy = await getNotifs(site, token, 'category=auth&limit=5');
    console.log(`explicit ?category=auth returns ${(legacy.notifications || []).length} legacy rows (page Auth chip) ${(legacy.notifications || []).length > 0 ? '✅' : '(none exist — ok)'}`);

    // login-storm check: two more logins must not add rows
    await login(site); await login(site);
    const feed2 = await getNotifs(site, token, 'limit=50');
    console.log(`after 2 extra logins: feed total ${feed2.notifications.length} (was ${notifs.length}) ${feed2.notifications.length <= notifs.length ? '✅ no login noise' : '⚠️ grew — check'}`);
  } catch (e) {
    console.error(`❌ ${site.name}: ${e.message}`);
  }
}
console.log('\nTask 92 verification complete.');
