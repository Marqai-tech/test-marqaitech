// Status check — query governance CR state for the newest deployed batch.
const BASE = 'https://nexus-hrms-demo.vercel.app';
const T = { 'Content-Type': 'application/json' };

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: T,
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
});
const { token } = await login.json();
if (!token) { console.log('LOGIN FAILED', login.status); process.exit(1); }
const H = { Authorization: `Bearer ${token}` };

const ids = ['cmvrysllk000008l82vehn04h', 'cmvrnyurb000108jrto9pmh05', 'cmvqpwxm2000007ifuodtg37h'];
for (const id of ids) {
  const r = await fetch(`${BASE}/api/super-admin/change-requests/${id}`, { headers: H });
  const j = await r.json().catch(() => ({}));
  const cr = j?.request ?? j?.data ?? j;
  console.log(id, '->', r.status, JSON.stringify({
    status: cr?.status,
    title: (cr?.title || '').slice(0, 80),
    deployCommit: cr?.deployCommit || cr?.implementation?.deployCommit || cr?.implementCommit || undefined,
  }));
}
