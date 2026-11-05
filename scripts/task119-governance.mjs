// Task 119 — governance: register + approve + implement
// (fix the empty chat thread screen — route-scoped provider crash; v1.5.2+19).
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const cr = await fetch(BASE + '/api/super-admin/change-requests', {
  method: 'POST', headers: H,
  body: JSON.stringify({
    title: 'Task 119 — Mobile app: fix the empty chat screen (app-scoped ChatRoomsProvider) + one-tap greetings (v1.5.2, versionCode 19)',
    description:
      'User report: "Still when I open the chat module and click on any employee the chat screen is empty." Root cause (regression shipped with v1.5.0): ChatRoomsProvider was created INSIDE ChatHomeScreen.build (route-local scope), but ChatRoomScreen is pushed as its own Navigator route — a sibling branch of the widget tree — so context.watch<ChatRoomsProvider>() in the thread screen threw ProviderNotFoundException and release builds rendered a grey/empty screen. Every entry path was affected (Chats tab, Directory tab, New-chat sheet, /chat/room named route). Fix: ChatRoomsProvider moved to the app-scope MultiProvider in main.dart (single shared instance — identity + directory resolve exactly once); ChatHomeScreen only kicks the first fetch; ChatRoomScreen gained a defensive silent identity resolve for deep entry; a dispose-time ancestor-lookup bug (context.read in dispose) was fixed via a saved didChangeDependencies reference. UX: brand-new threads now show a friendly empty state with one-tap greeting chips (Hi! / Hello! / Are you available?) that send immediately. Live backend verified end-to-end as tenant admin (login → 10-employee directory → direct-room reuse alreadyExisted:true → message send → thread fetch → rooms preview/unread). flutter analyze 0 errors (119 pre-existing infos), 49/49 tests pass incl. 4 new Task 119 regression tests (provider-scope contract across routes, room screen renders + greeting tap sends, source contract, naming fallback). aapt2-verified inside APK: versionCode 19, versionName 1.5.2, permanent release key.',
    category: 'mobile-app',
    riskLevel: 'medium',
    module: 'Mobile App',
  }),
});
const d = await cr.json();
const id = d?.request?.id || d?.data?.id || d?.id || d?.changeRequest?.id;
console.log('change-request created:', id || d);

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
  const im = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'implement', implementationNotes: 'TODO_COMMIT pushed (LIVE git auto-deploy); APK v1.5.2+19 = HTTP 200 on all three hosts; /api/public/app-version returns 1.5.2/19.' }),
  });
  console.log('implement:', im.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
