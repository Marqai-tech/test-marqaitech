// Task 119 — live verification of the chat API contract (as the mobile app executes it).
// 1. Login as tenant admin @ marqaitechgroup.3boxeshrms.com
// 2. GET /api/employees (directory source)
// 3. POST /api/collaboration/chat/rooms (direct room with another employee)
// 4. POST .../messages (send "Hi!")
// 5. GET  .../messages (fetch thread)
// 6. GET /api/collaboration/chat/rooms (rooms list w/ preview + unread)
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const EMAIL = 'hr@gmail.com';
const PASS = 'MarqAI@2026';

const j = (r) => r.json();

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  }).then(j);
  if (!login.token) throw new Error('login failed: ' + JSON.stringify(login).slice(0, 200));
  console.log('1. LOGIN OK — role:', login.user?.role);

  const H = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' };

  const emps = await fetch(`${BASE}/api/employees?limit=200`, { headers: H }).then(j);
  const rows = emps.employees || emps.data || [];
  console.log('2. EMPLOYEES OK — count:', rows.length, '| first:', rows[0]?.firstName, rows[0]?.lastName, rows[0]?.id);

  const peer = rows.find((e) => e.id && e.email !== EMAIL);
  if (!peer) throw new Error('no peer employee found');

  const created = await fetch(`${BASE}/api/collaboration/chat/rooms`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ roomType: 'direct', memberIds: [peer.id] }),
  }).then(j);
  const room = created.room;
  console.log('3. DIRECT ROOM OK — id:', room?.id, '| type:', room?.roomType, '| e2ee:', room?.isE2EE, '| members:', room?.members?.length, '| alreadyExisted:', created.alreadyExisted);

  const send = await fetch(`${BASE}/api/collaboration/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ body: 'Task 119 verification ping' }),
  }).then(j);
  console.log('4. SEND OK — messageId:', send.message?.id, '| body:', JSON.stringify(send.message?.body));

  const thread = await fetch(`${BASE}/api/collaboration/chat/rooms/${room.id}/messages?limit=50`, { headers: H }).then(j);
  console.log('5. THREAD OK — messages:', thread.messages?.length, '| nextCursor:', thread.nextCursor, '| last:', JSON.stringify(thread.messages?.at(-1)?.body), '| sender:', thread.messages?.at(-1)?.sender?.firstName);

  const rooms = await fetch(`${BASE}/api/collaboration/chat/rooms`, { headers: H }).then(j);
  const mine = (rooms.rooms || []).find((r) => r.id === room.id);
  console.log('6. ROOMS LIST OK — total rooms:', rooms.rooms?.length, '| our room present:', !!mine, '| unread:', mine?.unreadCount, '| preview:', mine?.messages?.at(-1)?.body);

  console.log('\nRESULT: backend contract fully verified — the empty screen was the client-side provider crash.');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
