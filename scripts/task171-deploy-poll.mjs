// Task 171 — deploy poll: wait until the a76484f5 build is live on a domain.
// Positive markers (unique to this release, in the CreateTaskForm bundle):
//   'The form lives right here in the page'  (embedded form header subtitle)
//   'Close form'                             (toggle button label)
const DOMAINS = process.argv.slice(2);
const BASE = DOMAINS[0] || 'https://marqaitechgroup.3boxeshrms.com';
const T = { 'Content-Type': 'application/json' };
const MARKERS = ['The form lives right here in the page', 'Close form'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chunkScan(cookie) {
  const html = await (await fetch(BASE + '/project-management/tasks', { headers: { Cookie: `tb_token=${cookie}` } })).text();
  const chunks = [...new Set([...html.matchAll(/src="(\/_next\/static\/[^"]+\.js[^"]*)"/g)].map((m) => m[1]))];
  const found = [], missing = [];
  for (const mk of MARKERS) {
    let hit = false;
    for (const c of chunks) {
      const js = await (await fetch(BASE + c)).text();
      if (js.includes(mk)) { hit = true; break; }
    }
    (hit ? found : missing).push(mk);
  }
  return { found, missing, chunkCount: chunks.length };
}

(async () => {
  const once = process.argv.includes('--once');
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: T, body: JSON.stringify({ email: 'hr@marqaitech.com', password: 'MarqAI@2026' }) });
  const { token } = await login.json().catch(() => ({}));
  if (!token) { console.log('LOGIN FAILED on ' + BASE); process.exit(1); }

  if (once) {
    try {
      const r = await chunkScan(token);
      console.log(`once | chunks=${r.chunkCount} found=[${r.found}] missing=[${r.missing}]`);
      process.exit(r.missing.length === 0 ? 0 : 2);
    } catch (e) { console.log('once | err', e.message); process.exit(2); }
  }

  const deadline = Date.now() + 35 * 60 * 1000;
  let round = 0;
  while (Date.now() < deadline) {
    round++;
    try {
      const r = await chunkScan(token);
      console.log(new Date().toISOString().slice(11, 19), '| round ' + round, `| chunks=${r.chunkCount} found=[${r.found}] missing=[${r.missing}]`);
      if (r.missing.length === 0) { console.log('DEPLOYED: Task 171 markers live on ' + BASE); process.exit(0); }
    } catch (e) { console.log(new Date().toISOString().slice(11, 19), '| round ' + round, '| err', e.message); }
    await sleep(75 * 1000);
  }
  console.log('TIMEOUT: markers not live after 35 min on ' + BASE);
  process.exit(1);
})();
