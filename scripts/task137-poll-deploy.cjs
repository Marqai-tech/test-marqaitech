// Task 137 — poll Vercel deployment triggered by the git push of d5471e49,
// then run the live verification checks.
const { neon } = require('@neondatabase/serverless');
require('fs').readFileSync('/dev/null'); // noop

const COMMIT = 'd5471e49';
const HOSTS = [
  'https://marqaitechgroup.3boxeshrms.com',
  'https://3boxeshrms.com',
  'https://nexus-hrms-demo.vercel.app',
];

async function version(host) {
  try {
    const r = await fetch(host + '/api/public/app-version', { signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => null);
    return j ? `${j.versionName ?? j.version} (${j.versionCode ?? j.build})` : `HTTP ${r.status}`;
  } catch (e) { return 'ERR ' + e.message.slice(0, 40); }
}

(async () => {
  console.log(`Polling deployment for commit ${COMMIT}...`);
  for (let i = 1; i <= 40; i++) {
    const v1 = await version(HOSTS[0]);
    const git = await fetch(HOSTS[0] + '/api/public/app-version', { signal: AbortSignal.timeout(15000) })
      .then((r) => r.json()).catch(() => null);
    const sha = git?.gitCommitSha || git?.commitSha || git?.deployCommit || '';
    const matched = typeof sha === 'string' && sha.startsWith(COMMIT.slice(0, 8));
    console.log(`  [${i}] tenant=${v1} sha=${sha || 'n/a'} ${matched ? '← MATCH' : ''}`);
    if (matched) { console.log('DEPLOYED'); process.exit(0); }
    await new Promise((r) => setTimeout(r, 30000));
  }
  console.log('TIMEOUT waiting for deployment');
  process.exit(1);
})();
