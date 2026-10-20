#!/usr/bin/env node
/* Task 117 — READ-ONLY probe of the LIVE tenant chat (no writes). */
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const EMAIL = 'hr@marqaitech.com';
const PASS = 'MarqAI@2026';
(async () => {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const login = await loginRes.json();
  if (!login.token) { console.error('LOGIN FAILED', loginRes.status, login.error); process.exit(1); }
  const H = { Authorization: `Bearer ${login.token}` };
  const roomsRes = await fetch(`${BASE}/api/collaboration/chat/rooms`, { headers: H });
  const roomsData = await roomsRes.json();
  const rooms = roomsData.rooms || [];
  console.log('LIVE TENANT rooms:', rooms.length);
  for (const r of rooms.slice(0, 10)) {
    console.log(` - ${r.name ?? '(direct)'} [${r.roomType}] members=${r.members?.length} msgs=${r._count?.messages ?? 0} unread=${r.unreadCount} last=${r.lastMessageAt}`);
  }
  if (rooms.length > 0) {
    const withMsgs = rooms.find((r) => (r._count?.messages ?? 0) > 0) || rooms[0];
    const msgsRes = await fetch(`${BASE}/api/collaboration/chat/rooms/${withMsgs.id}/messages?limit=20`, { headers: H });
    const msgsData = await msgsRes.json();
    console.log('MESSAGES of first room:', (msgsData.messages || []).length, 'status', msgsRes.status);
    for (const m of (msgsData.messages || []).slice(-3)) {
      console.log(`   [${m.createdAt}] ${m.sender?.firstName ?? '?'}: ${(m.body || '').slice(0, 60)}`);
    }
  }
})().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
