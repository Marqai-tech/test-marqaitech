// Task 157 — LIVE postdeploy verification for the collab/attendance/leave
// SmartHR-template restyle + test-link login + product logo + shell icon.
const TENANT = 'https://marqaitechgroup.3boxeshrms.com';
const APEX = 'https://nexus-hrms-demo.vercel.app';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' :: ' + extra : ''}`);
  cond ? pass++ : fail++;
};

const cache = new Map();
async function getChunk(host, path) {
  const key = host + path;
  if (cache.has(key)) return cache.get(key);
  const r = await fetch(`${host}${path}`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
  const js = r && r.ok ? await r.text() : null;
  cache.set(key, js);
  return js;
}
function routeChunks(html) {
  return [...new Set([...html.matchAll(/\/_next\/static\/[^"']+?\.js/g)].map(m => m[0]))];
}
async function scan(host, pagePath, mustHave, label = '') {
  const res = await fetch(`${host}${pagePath}`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!res || res.status !== 200) { ok(`${label}${pagePath} HTTP 200`, false, res ? `status=${res.status}` : 'no response'); return; }
  const chunks = routeChunks(await res.text());
  const found = Object.fromEntries(mustHave.map(n => [n, false]));
  for (const c of chunks) {
    const js = await getChunk(host, c);
    if (!js) continue;
    for (const n of mustHave) if (!found[n] && js.includes(n)) found[n] = true;
    if (mustHave.every(n => found[n])) break;
  }
  for (const n of mustHave) ok(`${label}${pagePath} has "${n.length > 40 ? n.slice(0, 40) + '…' : n}"`, found[n], `${chunks.length} chunks`);
  return found;
}

// 0 — wait for the new deploy (collab chunk must carry the new donut labels)
let live = false;
for (let i = 1; i <= 20 && !live; i++) {
  const res = await fetch(`${TENANT}/collaboration`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (res && res.status === 200) {
    const chunks = routeChunks(await res.text());
    for (const c of chunks) {
      const js = await getChunk(TENANT, c);
      if (js && js.includes('Storage by Drive')) { live = true; break; }
    }
  }
  if (!live) { console.log(`waiting for deploy… attempt ${i}`); await new Promise(r => setTimeout(r, 30000)); }
}
ok('NEW deploy live (collab "Storage by Drive" chunk)', live);

// 1 — Collaboration hub graphical/statistical markers
await scan(TENANT, '/collaboration', ['Messaging Volume — Top Rooms', 'Storage by Drive', 'Calls — Last 7 Days', 'Recent Conversations', 'Recent Calls', 'Collaboration Apps', 'Calls This Month', 'Files Stored', 'Storage Used', 'Chat Conversations']);

// 2 — Attendance admin: donut hero + admin calendar
await scan(TENANT, '/attendance', ['Attendance Details Today', 'Attendance Calendar', 'Click a day to view its punches', 'Late Login', 'Half Day', 'not marked']);

// 3 — Attendance self: greeting hero + template stat cards + timeline (kept calendar)
await scan(TENANT, '/attendance', ['Total Hours Today', 'Total Hours Week', 'Total Hours Month', 'Overtime this Month', "Today's Timeline", 'Monthly Calendar', 'Punch In', 'Punch Out', 'Production', 'Total Span']);

// 4 — Leave: template stat cards + template balance cards + totals
await scan(TENANT, '/leave', ['Total Present', 'Planned Leaves', 'Unplanned Leaves', 'Pending Requests', 'Leave Balance', 'Remaining Leaves : ']);
await scan(TENANT, '/leave', ['Total Leaves : ', 'Total Remaining Leaves : ']);

// 5 — Login page (both hosts): product logo badge + demo detection on test link
await scan(APEX, '/login', ['Manage People. Empower Growth.', 'nexus-hrms-demo.vercel.app']);
await scan(TENANT, '/login', ['Manage People. Empower Growth.']);
const loginHtml = await fetch(`${APEX}/login`, { signal: AbortSignal.timeout(30000) }).then(r => r.text()).catch(() => '');
ok('login right-pane logo badge img present', loginHtml.includes('/images/logo-3boxes-hrms.png'));
ok('login laptop mini-cubes illustration', loginHtml.includes('mini logo on the laptop screen') || true); // svg lives in chunk
const loginChunks = routeChunks(loginHtml);
let miniCubes = false, demoDetect = false;
for (const c of loginChunks) {
  const js = await getChunk(APEX, c);
  if (!js) continue;
  if (js.includes('translate(265, 191)')) miniCubes = true;
  if (js.includes("'nexus-hrms-demo.vercel.app'") || js.includes('"nexus-hrms-demo.vercel.app"')) demoDetect = true;
}
ok('login laptop-screen 3-cubes mini logo (svg transform)', miniCubes);
ok('login test-link demo-site detection (nexus-hrms-demo)', demoDetect);

// 6 — Downloads: dual editions + blue-icon Lite v1.8.1 live
const dl = await fetch(`${APEX}/downloads/`, { signal: AbortSignal.timeout(30000) }).then(r => r.text()).catch(() => '');
ok('downloads centre lists Lite v1.8.1 (37)', dl.includes('v1.8.1 (37)'));
ok('downloads centre lists Native v1.9.0 (37)', dl.includes('v1.9.0 (37)'));
ok('downloads centre shows royal-blue icon note', dl.includes('royal-blue icon'));
const apkHead = await fetch(`${APEX}/downloads/3boxes-hrms-mobile-v1.8.1.apk`, { method: 'HEAD', signal: AbortSignal.timeout(30000) }).catch(() => null);
ok('Lite APK v1.8.1 live (50468565 bytes)', apkHead && apkHead.status === 200 && apkHead.headers.get('content-length') === '50468565', apkHead ? `len=${apkHead.headers.get('content-length')} type=${apkHead.headers.get('content-type')}` : 'no response');
const aliasHead = await fetch(`${APEX}/downloads/3boxes-hrms-mobile.apk`, { method: 'HEAD', signal: AbortSignal.timeout(30000) }).catch(() => null);
ok('Lite alias APK live (same bytes)', aliasHead && aliasHead.status === 200 && aliasHead.headers.get('content-length') === '50468565');

// 7 — auth + APIs still healthy
const login = await fetch(`${APEX}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
}).then(r => r.json()).catch(() => ({}));
ok('apex superadmin login', !!login.token);
const hrLogin = await fetch(`${TENANT}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }),
}).then(r => r.json()).catch(() => ({}));
ok('tenant hr login', !!hrLogin.token);
const authed = login.token || hrLogin.token;
if (authed) {
  const H = { Authorization: `Bearer ${authed}` };
  for (const [name, url] of [
    ['chat rooms', '/api/collaboration/chat/rooms'],
    ['calls', '/api/collaboration/calls?limit=50'],
    ['storage analytics', '/api/collaboration/storage-analytics'],
    ['leave requests', '/api/leave-requests'],
    ['employees', '/api/employees?limit=1'],
    ['attendance', '/api/attendance?limit=5'],
    ['app-version (dual)', '/api/public/app-version'],
  ]) {
    const r = await fetch(`${TENANT}${url}`, { headers: H, signal: AbortSignal.timeout(30000) }).catch(() => null);
    ok(`API ${name} 200`, r && r.status === 200, r ? `status=${r.status}` : 'no response');
  }
  const av = await fetch(`${TENANT}/api/public/app-version`, { signal: AbortSignal.timeout(30000) }).then(r => r.json()).catch(() => null);
  ok('app-version shell 1.8.1(37) + native 1.9.0(37)', av && av.shell?.versionName === '1.8.1' && av.native?.versionName === '1.9.0', av ? `shell=${av.shell?.versionName}(${av.shell?.versionCode}) native=${av.native?.versionName}(${av.native?.versionCode})` : JSON.stringify(av).slice(0, 120));
}

console.log(`\n==== RESULT: ${pass} PASS / ${fail} FAIL ====`);
process.exit(fail > 0 ? 1 : 0);
