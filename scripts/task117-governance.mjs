// Task 117 governance: register the change request, then approve / implement.
// Usage: node scripts/task117-governance.mjs register|implement <crId> <commitSha>
const DEMO = 'https://nexus-hrms-demo.vercel.app';
const EMAIL = 'superadmin@3boxeshrms.com';
const PASSWORD = 'MarqAI@2026';

async function post(url, payload, token) {
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text.slice(0, 200) } }; }
}
async function patch(url, payload, token) {
  const res = await fetch(url, {
    method: 'PATCH',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text.slice(0, 200) } }; }
}

const login = await post(`${DEMO}/api/auth/login`, { email: EMAIL, password: PASSWORD });
if (!login.data.token) { console.error('LOGIN FAILED', login.status, JSON.stringify(login.data).slice(0, 200)); process.exit(1); }
const token = login.data.token;
console.log('super-admin login OK');

const mode = process.argv[2] || 'register';

if (mode === 'register') {
  const r = await post(`${DEMO}/api/super-admin/change-requests`, {
    title: 'Task 117: Collaboration Chat on mobile — rooms + threads + send wired to the live /api/collaboration/chat endpoints, APK v1.5.0+17',
    description: [
      'User request: "now work on the chat which is in collaboration module and build the same in mobile app and integrate it. pls update the same in the mobile app and vercel now".',
      'SCOPE: bring the web Collaboration → Chat module to the Flutter app with ZERO server/API changes — the mobile client consumes the exact same endpoints the web chat page uses (GET/POST /api/collaboration/chat/rooms, GET/POST /api/collaboration/chat/rooms/[id]/messages); scoping, RBAC, E2EE flags and DLP policy stay server-side and untouched.',
      'MOBILE (Flutter v1.5.0+17, permanent release key — upgrades over v1.4.2/v1.4.1/v1.4.0/v1.3.0 without uninstall):',
      '1. models/chat.dart — ChatRoomModel/ChatMessageModel/ChatMemberRef/ChatSenderRef/ChatDirectoryPerson parsing the real payload shapes; ALL collection/nested reads via the Task 116 shape-agnostic json_safe helpers (no List<dynamic> crash class anywhere).',
      '2. providers/chat_provider.dart — ChatRoomsProvider (rooms list, local search, direct-room display naming via employee directory, unread badges, create room) + ChatThreadProvider (chronological thread, cursor pagination for older history, send with error-preserving draft, 12s poll while the screen is open).',
      '3. ApiService + ApiConfig: getChatRooms / getChatMessages / sendChatMessage / createChatRoom. IDENTITY CONTRACT: member userId + senderId are EMPLOYEE ids — the signed-in employee resolves via the production resolveOwnEmployeeId() (my-summary → directory-email fallback), never the User-table id (the web page compares user.id and has a latent mismatch there; mobile does it correctly).',
      '4. Screens: ChatHomeScreen (search, type-colored avatars, E2EE lock, unread badges, last-message previews, New Chat sheet with Direct/Group toggle + role-scoped employee picker) + ChatRoomScreen (room header with member count/E2EE/announcement badges, own-vs-other teal/white bubbles, day dividers, timestamps, DLP-flag markers, load-older on scroll, pull-to-refresh, send bar).',
      '5. Entry points: Home Modules grid tile + drawer item + /chat route + /chat/room onGenerateRoute (full ChatRoomModel argument).',
      'TESTING: flutter analyze 0 errors; flutter test 45/45 (13 NEW chat regression tests incl. REAL demo probe fixtures + 9 adversarial shapes: rooms-as-Map, members-as-Map, sender-as-string, string counts, scalar replies); tsc clean for app-version.ts; aapt2 verified versionCode 17 / versionName 1.5.0 / permissions intact; apksigner cert = permanent release key 590a456e…3749c; libapp.so contains the chat endpoints + screen strings.',
      'LIVE DATA PROBES: demo workspace had 0 rooms (probe created one group room + 1 message for fixtures — stays as sample data); LIVE tenant marqaitechgroup has 2 real direct rooms (e.g. Vardhani → "hi manoj") which the module will render.',
      'VERSION CHAIN 1.5.0(17): pubspec.yaml, src/lib/app-version.ts (+release notes), config/app_info.dart, config/constants.dart, downloads page + README.',
      'NO WEB/SERVER CHANGES.',
    ].join('\n'),
    category: 'employees',
    priority: 'high',
    requestedBy: 'automation (Task 117)',
  }, token);
  console.log('REGISTER', r.status, JSON.stringify(r.data).slice(0, 300));
  const id = r.data?.request?.id || r.data?.id;
  if (!id) process.exit(1);
  const a = await patch(`${DEMO}/api/super-admin/change-requests/${id}`, { action: 'approve' }, token);
  console.log('APPROVE', a.status, id);
  console.log('CR_ID=' + id);
} else if (mode === 'implement') {
  const [, , crId, sha] = process.argv;
  const r = await patch(`${DEMO}/api/super-admin/change-requests/${crId}`, { action: 'implement', implementationNotes: `Deployed to LIVE (git auto-deploy) and demo (CLI). Commit ${sha}. APK v1.5.0+17 live on all hosts (alias + versioned); chat module consumes the same /api/collaboration/chat endpoints as web; regression suite 45/45 green.` }, token);
  console.log('IMPLEMENT', r.status, crId, JSON.stringify(r.data).slice(0, 200));
} else {
  console.error('unknown mode');
  process.exit(1);
}
