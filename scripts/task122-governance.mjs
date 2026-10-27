// Task 122 — governance: register + approve
// (chat governance: admin-only group-chat create/edit/delete by default with
// optional custom manager list, direct-chat delete for all users, soft-delete
// retention for Super Admin audit; v1.5.5+22).
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
    title: 'Task 122 — Chat governance: HR/tenant-admin-only group chat create/edit/delete (default) with configurable manager list + direct-chat delete for all users + soft-delete retention (web + mobile v1.5.5, versionCode 22)',
    description:
      'User request: "only the hr admin or tenant admin can create group chats and delete them. Also give a option in the chat settings in the collaboration module settings that optional to select any of the users or employees to select who can create or delete or edit the chats or group chats. also give option to all the users to delete the direct chats. all these settings should be available in the chat settings option to enable or disable." Implementation: new CollaborationSettings columns chatCustomManagersEnabled (default false), chatGroupManagerIds (JSON employee-id list), chatDirectDeleteEnabled (default true) applied to the platform DB + every dedicated tenant DB via an idempotent additive script BEFORE deploy; new src/lib/chat-permissions.ts resolves the tenant settings and computes effective permissions (CHAT_ADMIN_ROLES = tenant_admin/admin/hr_admin/company_hr_admin + super_admin; custom managers additive when enabled); new GET/PATCH /api/collaboration/chat/settings (PATCH admin-only, audit-logged CHAT_GOVERNANCE_UPDATE); POST rooms now rejects non-direct creation for non-managers (403); new PATCH/DELETE /api/collaboration/chat/rooms/[id] — rename is manager-only, group deletion is a SOFT delete (isActive=false + deletedAt/deletedBy stamps, messages retained for Super Admin eDiscovery where deleted rooms surface in the chat-archive sweep with deletion stamps), direct deletion hides the caller copy (ChatRoomMember.isHidden, scope self) and any new incoming message resurfaces it; members POST is now a manager-only edit right; messages POST rejects deactivated rooms. Web: Chat Governance card in Collaboration Settings (Additional Chat Managers toggle + employee picker, Allow Users To Delete Direct Chats toggle) + chat page permission fetch gating the Group option, add-members button and a new header ⋮ menu with rename/delete + rename modal. Mobile: ChatGovernance model + provider seams (fetchChatSettings/deleteRoom/renameRoom), Group option hidden in the new-chat sheet without rights, room-tile long-press actions sheet, thread-screen ⋮ menu with rename/delete + confirms. flutter analyze 0 errors; 82/82 tests pass incl. new Task 122 suite (governance parsing, provider seams, source contracts on both platforms).',
    category: 'web-platform',
    riskLevel: 'medium',
    module: 'Collaboration',
    relatedModule: 'Mobile App',
  }),
});
const d = await cr.json();
const id = d?.request?.id ?? d?.id ?? d?.data?.id;
console.log('change-request created:', id || d);

if (id) {
  const ap = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ action: 'approve' }),
  });
  console.log('approve:', ap.status);
}

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
