/** Task 94 — isolate the 401: does the x-tenant-slug header mechanism work on the deployment? */
const BASE = 'https://nexus-hrms-mu.vercel.app';
async function tryLogin(label, slug, email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(slug ? { 'x-tenant-slug': slug } : {}) },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json().catch(() => ({}));
  console.log(`${label}: status=${res.status} ${j.error ? 'err=' + j.error : 'OK tenant=' + (j.tenant?.slug || j.user?.tenant?.slug || '?')}`);
  return { res, j };
}
async function main() {
  // Control 1: known demo tenant via its NORMAL path (no slug header — host resolution)
  await tryLogin('C1 demo tenant, no slug header ', null, 'admin@3boxeshrms.com', 'MarqAI@2026');
  // Control 2: known demo tenant FORCED via header
  await tryLogin('C2 demo tenant, x-tenant-slug   ', '3boxes-hrms-demo', 'admin@3boxeshrms.com', 'MarqAI@2026');
  // Test: new demo tenant via header
  await tryLogin('T1 new demo tenant, x-tenant-slug', 'demo', 'admin@demo.3boxeshrms.com', 'MarqAI@2026');
  // Test 2: new tenant user against KNOWN demo tenant slug (should be 401 — user lives in tenant_demo, not tenant_3boxes-hrms-demo)
  await tryLogin('T2 new user @ demo-slug (expect 401)', 'demo', 'admin@3boxeshrms.com', 'MarqAI@2026');
}
main().catch(e => { console.error('ISOLATION FAILED:', e.message); process.exit(1); });
