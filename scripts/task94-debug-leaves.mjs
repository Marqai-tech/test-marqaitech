/** Task 94 — debug /api/leaves 500 + templates response shape on the demo tenant */
const BASE = 'https://nexus-hrms-mu.vercel.app';
const Q = '?tenant=demo';
async function main() {
  const login = await (await fetch(`${BASE}/api/auth/login${Q}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@demo.3boxeshrms.com', password: 'MarqAI@2026' }),
  })).json();
  const auth = { Authorization: `Bearer ${login.token}` };

  const lvRes = await fetch(`${BASE}/api/leaves${Q}`, { headers: auth });
  const lvText = await lvRes.text();
  console.log('LEAVES status:', lvRes.status);
  console.log('LEAVES body (first 800):', lvText.slice(0, 800));

  const ntRes = await fetch(`${BASE}/api/notifications/templates${Q}`, { headers: auth });
  const nt = await ntRes.json().catch(() => ({}));
  console.log('\nTEMPLATES top-level keys:', Object.keys(nt));
  for (const [k, v] of Object.entries(nt)) {
    if (Array.isArray(v)) console.log(`  ${k}: array[${v.length}]`, v[0] ? JSON.stringify(v[0]).slice(0, 150) : '');
    else if (typeof v === 'object' && v) console.log(`  ${k}: object keys=`, Object.keys(v).slice(0, 12), 'first-val-len=', Object.values(v).find(Array.isArray)?.length);
    else console.log(`  ${k}:`, v);
  }
}
main().catch(e => { console.error('DEBUG FAILED:', e.message); process.exit(1); });
