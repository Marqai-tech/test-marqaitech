// Task 155 — poll Vercel deployment of commit b534320b via GitHub commit statuses.
// Exit 0 when the Vercel status checks report success.
const { execSync } = require('node:child_process');
const TOKEN = execSync("git config --get remote.origin.url | sed -n 's|https://Marqaitech:\\([^@]*\\)@github.com.*|\\1|p'")
  .toString().trim();
const COMMIT = 'b534320b';
const REPOS = [
  'Marqaitech/3-Boxes-HRMS',
  'maheshkpreddy/nexus-hrms',
];

(async () => {
  for (let i = 1; i <= 40; i++) {
    for (const repo of REPOS) {
      const URL = `https://api.github.com/repos/${repo}/commits/${COMMIT}/status`;
      const res = await fetch(URL, {
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
        signal: AbortSignal.timeout(20000),
      }).catch(() => null);
      if (res && res.ok) {
        const d = await res.json();
        const ctx = (d.statuses || []).map((s) => `${s.context}=${s.state}`).join(' | ');
        console.log(`[${i}] ${repo}: overall=${d.state} ${ctx}`);
        if (d.state === 'success') { console.log('DEPLOY_SUCCESS'); process.exit(0); }
        if (d.state === 'failure' || d.state === 'error') { console.log('DEPLOY_FAILED'); process.exit(1); }
        break; // found the repo that has the commit — wait for it
      }
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
  console.log('TIMEOUT');
  process.exit(1);
})();
