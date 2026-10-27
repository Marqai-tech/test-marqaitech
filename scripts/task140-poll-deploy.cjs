// Task 140 — poll Vercel deployment of commit 3dbbdf1a via GitHub commit statuses.
// Exit 0 when BOTH Vercel projects report success.
const { execSync } = require('node:child_process');
const TOKEN = execSync("git config --get remote.origin.url | sed -n 's|https://Marqaitech:\\([^@]*\\)@github.com.*|\\1|p'")
  .toString().trim();
const COMMIT = '3dbbdf1a';
const URL = `https://api.github.com/repos/Marqaitech/3-Boxes-HRMS/commits/${COMMIT}/status`;

(async () => {
  for (let i = 1; i <= 40; i++) {
    const res = await fetch(URL, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);
    if (res && res.ok) {
      const d = await res.json();
      const ctx = (d.statuses || []).map((s) => `${s.context}=${s.state}`).join(' | ');
      console.log(`[${i}] overall=${d.state} ${ctx}`);
      if (d.state === 'success') { console.log('DEPLOY_SUCCESS'); process.exit(0); }
      if (d.state === 'failure' || d.state === 'error') { console.log('DEPLOY_FAILED'); process.exit(1); }
    } else {
      console.log(`[${i}] status fetch failed (${res ? res.status : 'network'})`);
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
  console.log('TIMEOUT');
  process.exit(1);
})();
