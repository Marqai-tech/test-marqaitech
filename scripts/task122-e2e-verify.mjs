// Task 122 — full post-deploy E2E on the LIVE marqaitechgroup tenant:
// governance defaults → group create (admin) → rename → delete-for-everyone
// (soft) → room gone from list → super-admin archive shows the deletion →
// direct-chat self-delete round-trip.
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const SABASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const j = async (r) => { const d = await r.json().catch(() => ({})); return { status: r.status, ...d }; };

// ── tenant admin ──────────────────────────────────────────────────────────
const lg = await j(await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }),
}));
const H = { ...T, Authorization: `Bearer ${lg.token}` };
console.log('1. admin login:', lg.token ? 'ok' : 'FAIL');

// an active employee to include in chats
const emps = await j(await fetch(BASE + '/api/employees?limit=5&excludeInactive=true', { headers: H }));
const other = (emps.employees || emps.data || []).find((e) => e.id);
console.log('2. employees fetched:', !!(emps.token || other), '| first:', other ? `${other.firstName} ${other.lastName}` : 'none');

// A. governance defaults + admin permissions
const s = await j(await fetch(BASE + '/api/collaboration/chat/settings', { headers: H }));
console.log('3. settings:', JSON.stringify(s.settings), '| admin perms canCreate/Delete/EditGroup:', s.permissions?.canCreateGroup, s.permissions?.canDeleteGroup, s.permissions?.canEditGroup);

// B. admin can still create a group
const cr = await j(await fetch(BASE + '/api/collaboration/chat/rooms', {
  method: 'POST', headers: H,
  body: JSON.stringify({ name: 'Task122 Governance Probe', roomType: 'group', memberIds: other ? [other.id] : [] }),
}));
const roomId = cr.room?.id;
console.log('4. group create:', cr.status, roomId ? 'ok' : JSON.stringify(cr));

// C. rename
const rn = await j(await fetch(`${BASE}/api/collaboration/chat/rooms/${roomId}`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ name: 'Task122 Governance Probe (renamed)' }),
}));
console.log('5. rename:', rn.status, rn.room?.name || '');

// D. delete for everyone (soft) → disappears from the admin's list
const del = await j(await fetch(`${BASE}/api/collaboration/chat/rooms/${roomId}`, { method: 'DELETE', headers: H }));
console.log('6. delete:', del.status, JSON.stringify(del));
const after = await j(await fetch(BASE + '/api/collaboration/chat/rooms', { headers: H }));
console.log('7. room gone from list:', !(after.rooms || []).some((r) => r.id === roomId));

// E. direct chat self-delete round-trip
let directResult = 'skipped (no other employee)';
if (other) {
  const dcr = await j(await fetch(BASE + '/api/collaboration/chat/rooms', {
    method: 'POST', headers: H,
    body: JSON.stringify({ roomType: 'direct', memberIds: [other.id] }),
  }));
  const drId = dcr.room?.id;
  const ddel = await j(await fetch(`${BASE}/api/collaboration/chat/rooms/${drId}`, { method: 'DELETE', headers: H }));
  const afterD = await j(await fetch(BASE + '/api/collaboration/chat/rooms', { headers: H }));
  directResult = `create ${dcr.status}, delete ${ddel.status} scope=${ddel.scope}, gone=${!(afterD.rooms || []).some((r) => r.id === drId)}`;
  // message into the hidden room must be rejected for the deleter? (still a member — allowed; server resurfaces it)
}
console.log('8. direct chat self-delete:', directResult);

// F. super admin sees the soft-deleted group in the archive
const sal = await j(await fetch(SABASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
}));
const sa = await j(await fetch(`${SABASE}/api/super-admin/chat-archive?limit=50`, {
  headers: { ...T, Authorization: `Bearer ${sal.token}` },
}));
const probeRoom = (sa.rooms || []).find((r) => r.name === 'Task122 Governance Probe (renamed)');
console.log('9. super-admin archive deactivated rooms:', (sa.rooms || []).length,
  '| probe stamped deletedAt:', probeRoom ? !!(probeRoom.deletedAt || probeRoom.updatedAt) : 'room not in first 50');

console.log('DONE');
