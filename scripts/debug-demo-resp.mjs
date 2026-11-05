const BASE = 'https://nexus-hrms-mu.vercel.app';
let token = '';
async function api(path, method = 'GET', body) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-tenant-slug': '3boxes-hrms-demo', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* html */ }
  return { status: res.status, json };
}
(async () => {
  const login = await api('/api/auth/login', 'POST', { email: 'admin@3boxeshrms.com', password: 'MarqAI@2026' });
  token = login.json?.token || '';
  for (const p of ['/api/learning/dashboard', '/api/learning/certificates', '/api/learning/skill-gaps']) {
    const r = await api(p);
    console.log(p, '→', r.status, JSON.stringify(r.json).slice(0, 260));
  }
})();
