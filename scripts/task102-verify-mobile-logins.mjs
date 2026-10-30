// Task 102: live verification of mobile app login credentials + APK availability
const BASE = 'https://nexus-hrms-demo.vercel.app';
const LIVE = 'https://3boxeshrms.com';

const accounts = [
  { label: 'Demo Tenant Admin (app default)', base: BASE, email: 'admin@acme-global.com', password: 'MarqAI@2026' },
  { label: 'Super Admin (demo link)', base: BASE, email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' },
  { label: 'LIVE Tenant Admin (hr@marqaitech)', base: LIVE, email: 'hr@gmail.com', password: 'MarqAI@2026' },
  { label: 'LIVE Super Admin', base: LIVE, email: 'superadmin@3boxeshrms.com', password: 'MarqAI@2026' },
];

for (const a of accounts) {
  try {
    const r = await fetch(a.base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: a.email, password: a.password }),
    });
    const ok = r.ok;
    let who = '';
    try {
      const j = await r.json();
      who = j?.user?.role || j?.role || j?.user?.email || '';
    } catch {}
    console.log(`${ok ? '✅ OK ' : '❌ FAIL'} ${a.label} @ ${a.base.replace('https://', '')} → ${a.email} / ${a.password} ${who ? '| role=' + who : ''}`);
  } catch (e) {
    console.log(`❌ ERR ${a.label}: ${e.message}`);
  }
}

// APK availability on both links
for (const b of [BASE, LIVE]) {
  try {
    const r = await fetch(b + '/downloads/3boxes-hrms-mobile.apk', { method: 'HEAD' });
    const len = r.headers.get('content-length');
    console.log(`${r.ok ? '✅' : '❌'} APK @ ${b.replace('https://', '')} → HTTP ${r.status}${len ? ' | ' + Math.round(len / 1024 / 1024) + 'MB' : ''}`);
  } catch (e) {
    console.log(`❌ APK ERR ${b}: ${e.message}`);
  }
}
// Downloads landing page
for (const b of [BASE, LIVE]) {
  try {
    const r = await fetch(b + '/downloads/');
    console.log(`${r.ok ? '✅' : '❌'} /downloads/ page @ ${b.replace('https://', '')} → HTTP ${r.status}`);
  } catch (e) {
    console.log(`❌ ERR ${b}: ${e.message}`);
  }
}
