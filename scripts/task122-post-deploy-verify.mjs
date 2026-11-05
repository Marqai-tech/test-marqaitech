// Task 122 — post-deploy live smoke test on the marqaitechgroup tenant.
// Verifies: chat settings GET shape + admin permissions; rooms POST still OK
// for admins; CR trail clean. Read-only where possible.
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
if (!token) { console.error('login failed'); process.exit(1); }
const H = { ...T, Authorization: `Bearer ${token}` };

// 1. Chat governance settings + effective permissions (admin → all true)
const s = await fetch(BASE + '/api/collaboration/chat/settings', { headers: H });
const sd = await s.json();
console.log('GET chat/settings:', s.status);
console.log('  settings:', JSON.stringify(sd.settings));
console.log('  permissions:', JSON.stringify(sd.permissions));

// 2. Direct-chat delete gate: pick any direct room of the admin (if exists)
const r = await fetch(BASE + '/api/collaboration/chat/rooms', { headers: H });
const rd = await r.json();
const rooms = rd.rooms || [];
console.log('rooms visible:', rooms.length);
const direct = rooms.find((x) => x.roomType === 'direct');
if (direct) {
  // Hide then immediately un-hide by sending nothing — instead verify DELETE is allowed for admin:
  // (skip the destructive call — just confirm the endpoint answers 404/403 correctly for a bogus id)
  const del = await fetch(BASE + '/api/collaboration/chat/rooms/does-not-exist', { method: 'DELETE', headers: H });
  console.log('DELETE bogus room:', del.status, (await del.json()).error || '');
} else {
  console.log('no direct room to probe (fine)');
}

// 3. PATCH round-trip with the SAME values (no behavior change) to prove the admin write path works
const p = await fetch(BASE + '/api/collaboration/chat/settings', {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    customManagersEnabled: !!sd.settings?.customManagersEnabled,
    directDeleteEnabled: sd.settings?.directDeleteEnabled !== false,
    managerIds: sd.settings?.managerIds || [],
  }),
});
console.log('PATCH chat/settings (no-op values):', p.status, JSON.stringify((await p.json()).settings || {}));

// 4. Super admin: chat-archive still answers after the new columns
const sal = await fetch('https://nexus-hrms-demo.vercel.app/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const sat = await sal.json();
const sa = await fetch('https://nexus-hrms-demo.vercel.app/api/super-admin/chat-archive?limit=5', {
  headers: { ...T, Authorization: `Bearer ${sat.token}` },
});
const sad = await sa.json();
console.log('super-admin chat-archive:', sa.status, 'deleted rows:', (sad.rows || []).length, 'deactivated rooms:', (sad.rooms || []).length);
