// Task 121 — governance: register + approve
// (project↔chat integration + file attachments + super-admin chat retention; v1.5.4+21).
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
    title: 'Task 121 — Projects ↔ Chat integration + file attachments + super-admin chat history retention (web + mobile, v1.5.4, versionCode 21)',
    description:
      'User request: (1) integrate projects and chat groups for project conversations; (2) attach files/docs to projects directly in the Projects module AND via chat with files available in the Projects section; (3) keep chat history for all project and individual chats visible to super admin even after deletion (safety measure). Implementation — no schema changes needed (ChatMessage.attachments JSON, isDeleted soft-delete, ChatRoom.projectId + roomType "project", Project.workspaceRoomId all exist): POST chat messages now accepts attachments (base64 data URLs, ≤5 files/message, DLP-scanned names); new POST/GET /api/projects/[id]/workspace idempotently ensures the project workspace chat room (createProjectWorkspace reuse) for ANY project; new GET /api/projects/[id]/files aggregates chat attachments from the workspace room + project-drive FileNodes; uploading from the Projects module posts an attachment message into the workspace room (single source of truth, visible in both modules); web chat composer gains a paperclip (file → base64 → send) + attachment chips + ?room= deep-link; project page gains Open-Chat + Files panel; super-admin ediscovery page gains a Deleted Chat History viewer backed by new GET /api/super-admin/chat-archive (cross-tenant: platform DB + every active dedicated tenant DB; soft-deleted messages retain body/attachments — only masked from member feeds). Mobile: chat attachments (file_picker + share_plus), project rooms badge, project Files tab + Project Chat button, version 1.5.4+21.',
    category: 'feature',
    riskLevel: 'medium',
    module: 'Mobile App',
    relatedModule: 'Collaboration',
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
