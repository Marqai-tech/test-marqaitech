// Task 100 — scoped-switcher probe: does ?tenantId=<marqaitechgroup> resolve to the real tenant's dedicated DB
// (Task 98-d fix) or fall back to the JWT's demo-tenant routing (pre-98-d behavior)?
// Run against the NEW demo link (build 4141dbd1, missing 98-d).
const BASE = 'https://nexus-hrms-demo.vercel.app';
const j = async (r) => { try { return await r.json(); } catch { return null; } };

const L = await j(await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' }),
}));
const H = { Authorization: `Bearer ${L.token || L.accessToken}` };

const T = await j(await fetch(BASE + '/api/tenants', { headers: H }));
const tenants = T?.tenants || T?.data || (Array.isArray(T) ? T : []);
console.log('demo switcher tenants:', tenants.map((t) => `${t.name || t.slug} (${t.slug})`).join(' | '));
const real = tenants.find((t) => t.slug === 'marqaitechgroup' || /marqai/i.test(t.name || ''));
if (!real) { console.log('marqaitechgroup tenant not listed on demo — scoped probe n/a'); process.exit(0); }
console.log('probing scoped employees for real tenant:', real.name, real.id);

const E = await j(await fetch(`${BASE}/api/employees?tenantId=${real.id}`, { headers: H }));
const rows = E?.employees || E?.data || (Array.isArray(E) ? E : []);
console.log(`scoped employees: HTTP-total=${E?.pagination?.total ?? rows.length}`);
console.log('first 4:', rows.slice(0, 4).map((e) => `${e.firstName || ''} ${e.lastName || ''} <${e.email || '?'}>`).join(' | '));
const realMarked = rows.some((e) => /marqaitech|marqai/i.test(e.email || '') || (e.firstName || '') === 'Vikram');
const sampleMarked = rows.some((e) => /technova|apexservices|acme/i.test(e.email || ''));
console.log(`verdict: ${realMarked ? 'REAL tenant DB resolved (98-d behavior)' : sampleMarked ? 'DEMO sample DB returned (pre-98-d routing — scoped switcher fix MISSING on this build)' : 'ambiguous'}`);
