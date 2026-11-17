// Task 138 — poll the Vercel deployment triggered by the git push of ef8995e1.
const COMMIT = 'ef8995e1';
const HOSTS = [
  'https://nexus-hrms-demo.vercel.app',
  'https://3boxeshrms.com',
  'https://marqaitechgroup.3boxeshrms.com',
];

async function probe(host) {
  try {
    const r = await fetch(host + '/api/public/app-version', { signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => null);
    return j ? { v: `${j.versionName ?? j.version} (${j.versionCode ?? j.build})`, sha: j.gitCommitSha || j.commitSha || j.deployCommit || '' } : { v: `HTTP ${r.status}`, sha: '' };
  } catch (e) { return { v: 'ERR ' + e.message.slice(0, 40), sha: '' }; }
}

(async () => {
  console.log(`Polling deployment for commit ${COMMIT}...`);
  for (let i = 1; i <= 40; i++) {
    const results = [];
    for (const h of HOSTS) results.push(await probe(h));
    const matched = results.filter((r) => r.sha.startsWith(COMMIT.slice(0, 8))).length;
    console.log(`  [${i}] ` + results.map((r, idx) => `${HOSTS[idx].replace('https://', '')}=${r.v} sha=${r.sha.slice(0, 8) || 'n/a'}`).join(' | ') + (matched ? ` ← ${matched}/${HOSTS.length} MATCH` : ''));
    if (matched === HOSTS.length) { console.log('ALL HOSTS DEPLOYED'); process.exit(0); }
    await new Promise((r) => setTimeout(r, 30000));
  }
  console.log('TIMEOUT waiting for deployment');
  process.exit(1);
})();
