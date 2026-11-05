/**
 * Probe LIVE tenant users/roles via the app API (LIVE DB is on an
 * undocumented endpoint — app API is the only access path).
 * READ-ONLY.
 */
const LIVE = 'https://marqaitechgroup.3boxeshrms.com';

async function main() {
  const login = await fetch(`${LIVE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }),
    signal: AbortSignal.timeout(30000),
  }).then(r => r.json());
  console.log('login ok:', !!login.token, '| hr role:', login.user?.role, '| status:', login.user?.status ?? '(n/a)');
  const H = { Authorization: `Bearer ${login.token}`, 'x-tenant-slug': 'marqaitechgroup' };

  // hr user's own record
  const me = await fetch(`${LIVE}/api/auth/me`, { headers: H, signal: AbortSignal.timeout(30000) }).then(r => r.json()).catch(() => null);
  if (me?.user) console.log('me:', JSON.stringify({ id: me.user.id, email: me.user.email, role: me.user.role, status: me.user.status }));

  // user directory
  for (const path of ['/api/users?limit=200', '/api/users?limit=200&status=active']) {
    const res = await fetch(`${LIVE}${path}`, { headers: H, signal: AbortSignal.timeout(30000) });
    if (!res.ok) { console.log(`${path} -> ${res.status}`); continue; }
    const body = await res.json().catch(() => ({}));
    const users = body.users || body.data || body.employees || [];
    console.log(`\n=== ${path} -> ${res.status}, count=${users.length} ===`);
    for (const u of users) {
      console.log(`  ${String(u.email).padEnd(34)} role=${String(u.role).padEnd(16)} status=${String(u.status).padEnd(10)} name=${u.name || (u.firstName ? u.firstName + ' ' + (u.lastName || '') : '?')}`);
    }
    break; // one listing is enough
  }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
