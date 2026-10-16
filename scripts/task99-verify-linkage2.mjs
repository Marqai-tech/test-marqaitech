// Task 99 part 2 — resolve vercel.link target (reveals which Vercel account owns the old nexus-hrms project),
// compare Next.js buildIds across the three URLs, and confirm both git repos' latest SHAs.
import { execSync } from 'node:child_process';

const redact = (s) => String(s).replace(/[A-Za-z0-9_\-]{25,}/g, (m) => m.slice(0, 6) + '…REDACTED');

console.log('=== A. Follow vercel.link/3Fpeeb1 (target of "Vercel – nexus-hrms" FAILURE status) ===');
try {
  const out = execSync(
    'curl -s -o /dev/null -w "%{http_code} %{redirect_url}" -H "User-Agent: Mozilla/5.0" "https://vercel.link/3Fpeeb1"',
    { encoding: 'utf8' },
  );
  console.log('first hop:', redact(out));
  const m = out.match(/\s(https:\/\/\S+)$/);
  if (m && m[1] && m[1] !== '') {
    const out2 = execSync(
      `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" -H "User-Agent: Mozilla/5.0" "${m[1]}"`,
      { encoding: 'utf8' },
    );
    console.log('second hop:', redact(out2));
  }
} catch (e) {
  console.log('redirect trace failed:', e.message);
}

console.log('\n=== B. Next.js buildId per site (proves same/different build generation) ===');
async function buildId(name, base) {
  try {
    const res = await fetch(base + '/login', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const body = await res.text();
    const m1 = body.match(/"buildId":"([^"]+)"/);
    const scripts = [...new Set([...body.matchAll(/src="([^"]*_next[^"]*)"/g)].map((x) => x[1]))].slice(0, 4);
    console.log(`${name}: HTTP ${res.status} | buildId: ${m1 ? m1[1] : '(not in __NEXT_DATA__)'} | scripts: ${scripts.length}`);
    scripts.forEach((s) => console.log(`   ${s.slice(0, 110)}`));
    return m1 ? m1[1] : null;
  } catch (e) {
    console.log(`${name}: FAILED ${e.cause?.code || e.message}`);
    return null;
  }
}
const bOld = await buildId('OLD nexus-hrms-mu.vercel.app ', 'https://nexus-hrms-mu.vercel.app');
const bNew = await buildId('NEW nexus-hrms-demo.vercel.app', 'https://nexus-hrms-demo.vercel.app');
const bLive = await buildId('LIVE 3boxeshrms.com           ', 'https://3boxeshrms.com');
console.log(`\nold===new buildId? ${bOld && bOld === bNew} | old===live buildId? ${bOld && bOld === bLive} | new===live buildId? ${bNew && bNew === bLive}`);

console.log('\n=== C. Old demo app sanity: does its login API respond (is it a working app)? ===');
for (const base of ['https://nexus-hrms-mu.vercel.app', 'https://nexus-hrms-demo.vercel.app']) {
  try {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ email: 'probe@example.com', password: 'wrong-password-probe' }),
    });
    const txt = (await res.text()).slice(0, 160);
    console.log(`${base} → POST /api/auth/login HTTP ${res.status} | ${redact(txt)}`);
  } catch (e) {
    console.log(`${base} → login probe FAILED: ${e.cause?.code || e.message}`);
  }
}

console.log('\n=== D. Git repos: latest SHAs on both remotes ===');
for (const [name, remote] of [['Marqaitech/3-Boxes-HRMS (marqai)', 'marqai'], ['maheshkpreddy/nexus-hrms (origin)', 'origin']]) {
  try {
    const out = execSync(`git ls-remote ${remote} refs/heads/main`, { encoding: 'utf8' });
    console.log(`${name}: main = ${out.trim().split('\t')[0].slice(0, 8)}`);
  } catch (e) {
    console.log(`${name}: ls-remote FAILED — ${String(e.stderr || e.message).split('\n')[0].slice(0, 140)}`);
  }
}
