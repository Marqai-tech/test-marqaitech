#!/usr/bin/env node
/* Task 117 — probe the collaboration chat API with a real session.
 * 1) login as demo admin on the demo workspace
 * 2) GET /api/collaboration/chat/rooms            → list shape
 * 3) GET messages of the first room w/ messages   → message shape
 * 4) POST a message into a scratch room (only if a demo room exists) — NO, do NOT
 *    write anything in this probe; read-only except a scratch direct room check.
 * 5) GET /api/employees?limit=5                    → member picker shape
 * Saves fixtures for Flutter model tests under scripts/fixtures/.
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const BASE = process.env.BASE || 'https://nexus-hrms-demo.vercel.app';
const EMAIL = 'admin@acme-global.com';
const PASS = 'MarqAI@2026';

const FIX = path.join(__dirname, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });

(async () => {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const login = await loginRes.json();
  if (!login.token) { console.error('LOGIN FAILED', loginRes.status, login.error); process.exit(1); }
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };
  console.log('LOGIN OK, role =', login.user?.role);

  // 1) rooms
  const roomsRes = await fetch(`${BASE}/api/collaboration/chat/rooms`, { headers: H });
  const roomsData = await roomsRes.json();
  console.log('ROOMS status', roomsRes.status, 'count', roomsData.rooms?.length ?? 0);
  fs.writeFileSync(path.join(FIX, 'chat_rooms.json'), JSON.stringify(roomsData, null, 2));

  const rooms = roomsData.rooms || [];
  // pick a room that has at least one message
  const withMsgs = rooms.find((r) => (r._count?.messages ?? 0) > 0) || rooms[0];

  // 2) messages
  if (withMsgs) {
    const msgsRes = await fetch(`${BASE}/api/collaboration/chat/rooms/${withMsgs.id}/messages?limit=50`, { headers: H });
    const msgsData = await msgsRes.json();
    console.log('MESSAGES status', msgsRes.status, 'count', msgsData.messages?.length ?? 0, 'nextCursor', msgsData.nextCursor);
    fs.writeFileSync(path.join(FIX, 'chat_messages.json'), JSON.stringify(msgsData, null, 2));
    console.log('ROOM PICKED:', JSON.stringify({ id: withMsgs.id, name: withMsgs.name, type: withMsgs.roomType, members: withMsgs.members?.length }));
  } else {
    console.log('NO ROOMS — creating one for a full-shape probe…');
    // employees for member ids
    const empRes = await fetch(`${BASE}/api/employees?limit=5`, { headers: H });
    const empData = await empRes.json();
    fs.writeFileSync(path.join(FIX, 'chat_employees.json'), JSON.stringify(empData, null, 2));
    const emps = (empData.employees || []).filter((e) => e.id);
    if (emps.length >= 1) {
      const createRes = await fetch(`${BASE}/api/collaboration/chat/rooms`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ roomType: 'group', name: 'Mobile Probe Group', memberIds: [emps[0].id] }),
      });
      const createData = await createRes.json();
      console.log('CREATE ROOM status', createRes.status, createData.room?.id, createData.alreadyExisted ? '(already existed)' : '');
      if (createData.room?.id) {
        const sendRes = await fetch(`${BASE}/api/collaboration/chat/rooms/${createData.room.id}/messages`, {
          method: 'POST', headers: H, body: JSON.stringify({ body: 'Hello from the mobile probe — Task 117 fixture capture.' }),
        });
        const sendData = await sendRes.json();
        console.log('SEND status', sendRes.status, sendData.message?.id);
        const msgsRes = await fetch(`${BASE}/api/collaboration/chat/rooms/${createData.room.id}/messages?limit=50`, { headers: H });
        const msgsData = await msgsRes.json();
        fs.writeFileSync(path.join(FIX, 'chat_messages.json'), JSON.stringify(msgsData, null, 2));
        // re-pull rooms so the fixture includes the new room
        const rooms2 = await fetch(`${BASE}/api/collaboration/chat/rooms`, { headers: H });
        fs.writeFileSync(path.join(FIX, 'chat_rooms.json'), JSON.stringify(await rooms2.json(), null, 2));
        console.log('MESSAGES count', msgsData.messages?.length ?? 0);
      }
    }
  }

  // employees fixture (member picker)
  const empRes2 = await fetch(`${BASE}/api/employees?limit=50`, { headers: H });
  const empData2 = await empRes2.json();
  fs.writeFileSync(path.join(FIX, 'chat_employees.json'), JSON.stringify(empData2, null, 2));
  console.log('EMPLOYEES status', empRes2.status, 'count', empData2.employees?.length ?? 0);

  console.log('\nFIXTURES SAVED:', fs.readdirSync(FIX).filter((f) => f.startsWith('chat_')).join(', '));
})().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
