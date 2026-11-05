// Task 121 — post-deploy verification against LIVE.
// 1) tenant admin login → projects → workspace ensure → files (empty)
// 2) send attachment message into the workspace room → files aggregate shows it
// 3) chat message GET returns attachments
// 4) super-admin chat-archive endpoint
// 5) APK v1.5.4 URL 200
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'hr@gmail.com', password: 'MarqAI@2026' }),
});
const ld = await login.json();
const token = ld.token || ld.accessToken;
console.log('login:', login.status, token ? 'token ok' : 'NO TOKEN');
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

// 1. pick a project
const pr = await fetch(BASE + '/api/projects?limit=10', { headers: H });
const pj = await pr.json();
const projects = pj.projects || pj.data || [];
console.log('projects:', pr.status, projects.length);
const project = projects[0];
if (!project) throw new Error('no projects');
console.log('project:', project.id, project.name);

// 2. ensure workspace
const ws = await fetch(`${BASE}/api/projects/${project.id}/workspace`, { method: 'POST', headers: H });
const wj = await ws.json();
console.log('workspace:', ws.status, 'roomId:', (wj.roomId || '').slice(0, 10), 'createdNow:', wj.createdNow, 'joinedNow:', wj.joinedNow);
if (!wj.roomId) throw new Error('no workspace room');

// 3. files (before)
const f0 = await fetch(`${BASE}/api/projects/${project.id}/files`, { headers: H });
const f0j = await f0.json();
console.log('files(before):', f0.status, 'chat files:', (f0j.files || []).length, 'drive:', (f0j.driveFiles || []).length);

// 4. send attachment message (tiny png)
const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sm = await fetch(`${BASE}/api/collaboration/chat/rooms/${wj.roomId}/messages`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    body: '📎 task121-verify.png',
    attachments: [{ name: 'task121-verify.png', mimeType: 'image/png', sizeBytes: 70, dataUrl: `data:image/png;base64,${pngB64}` }],
  }),
});
const smj = await sm.json();
console.log('send attachment:', sm.status, smj.message ? 'message created ' + smj.message.id : smj);

// 5. files (after) — must include the attachment
const f1 = await fetch(`${BASE}/api/projects/${project.id}/files`, { headers: H });
const f1j = await f1.json();
const hit = (f1j.files || []).find(f => f.name === 'task121-verify.png');
console.log('files(after):', f1.status, 'count:', (f1j.files || []).length, 'attachment found:', !!hit, hit ? `(sender ${hit.senderName})` : '');

// 6. thread GET returns attachments
const th = await fetch(`${BASE}/api/collaboration/chat/rooms/${wj.roomId}/messages?limit=5`, { headers: H });
const thj = await th.json();
const last = (thj.messages || []).slice(-1)[0] || {};
let atts = [];
try { atts = JSON.parse(last.attachments || '[]'); } catch {}
console.log('thread fetch:', th.status, 'last msg attachments:', atts.length, atts[0]?.name || '');

// 7. super-admin chat archive
const slogin = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const st = (await slogin.json()).token;
const arch = await fetch(BASE + '/api/super-admin/chat-archive?limit=20', { headers: { Authorization: `Bearer ${st}` } });
const aj = await arch.json();
console.log('chat-archive:', arch.status, 'rows:', (aj.rows || []).length, 'tenants:', (aj.tenants || []).length);

// 8. soft-delete the verify message (retention: must still be queryable later)
const del = await fetch(`${BASE}/api/collaboration/chat/rooms/${wj.roomId}/messages/${smj.message.id}`, { method: 'DELETE', headers: H });
console.log('soft-delete message:', del.status);

// 9. member feed hides it
const th2 = await fetch(`${BASE}/api/collaboration/chat/rooms/${wj.roomId}/messages?limit=10`, { headers: H });
const th2j = await th2.json();
const stillThere = (th2j.messages || []).some(m => m.id === smj.message.id);
console.log('member feed hides deleted:', !stillThere);

// 10. APK
const apk = await fetch(BASE + '/downloads/3boxes-hrms-mobile-v1.5.4.apk', { method: 'HEAD' });
console.log('APK v1.5.4:', apk.status, apk.headers.get('content-length'), 'bytes');
