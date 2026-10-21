// Task 121 — mark CR implemented with the final LIVE deploy commit.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };
const CR_ID = 'cmvi92yqo000008lf21w4qoec';

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
const H = { ...T, Authorization: `Bearer ${token}` };

const im = await fetch(`${BASE}/api/super-admin/change-requests/${CR_ID}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    action: 'implement',
    implementationNotes:
      'Commits 1de21182 + 030f126b + 65672729 pushed to origin main (LIVE git auto-deploy; demo serves the same refs). Verified LIVE end-to-end as tenant admin (MarqAI Tech Group): POST /api/projects/[id]/workspace created the project workspace room (createdNow:true); attachment message sent into it (201); GET /api/projects/[id]/files aggregates it with sender attribution; thread GET returns attachments JSON; soft-delete 200 and member feed hides the message; GET /api/super-admin/chat-archive (super admin, 6 tenants) surfaces the deleted message with tenant/room/sender — retention loop closed. /api/public/app-version returns 1.5.4/21 on all three hosts; APK v1.5.4+21 = HTTP 200 (22,165,319 bytes), aapt2 versionCode 21 / versionName 1.5.4, permanent key 590a456e…3749c; 66/66 flutter tests.',
  }),
});
console.log('implement:', im.status);

const list = await fetch(BASE + '/api/super-admin/change-requests', { headers: H });
const ld = await list.json();
const reqs = ld.requests || ld.data || ld || [];
console.log('trail:', Array.isArray(reqs) ? `${reqs.length} requests, ${reqs.filter((r) => r.status === 'pending').length} pending` : ld);
