/**
 * Task 96 — verify Vercel deploy commit statuses for both repos at HEAD.
 */
import { execSync } from 'node:child_process';

function tokenFor(remoteName) {
  const url = execSync(`git remote get-url ${remoteName}`).toString().trim();
  const m = url.match(/https:\/\/(?:[^:@/]+:)?([^:@]+)@/);
  return m ? m[1] : null;
}

const REPOS = [
  { name: 'Marqaitech/3-Boxes-HRMS', remote: 'marqai', ctx: 'Vercel – 3-boxes-hrms (LIVE)' },
  { name: 'maheshkpreddy/nexus-hrms', remote: 'origin', ctx: 'Vercel – nexus-hrms (demo)' },
];

const sha = execSync('git rev-parse HEAD').toString().trim();
console.log('HEAD:', sha);

for (const r of REPOS) {
  const token = tokenFor(r.remote);
  if (!token) { console.log(`${r.name}: NO TOKEN`); continue; }
  try {
    const res = await fetch(`https://api.github.com/repos/${r.name}/commits/${sha}/status`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    const j = await res.json();
    const statuses = j.statuses || [];
    const vercel = statuses.filter((s) => /vercel/i.test(s.context));
    console.log(`\n${r.name} @ ${sha.slice(0, 8)} — state=${j.state}`);
    for (const s of vercel) console.log(`  [${s.state}] ${s.context}  (at ${s.created_at}) ${s.description || ''}`.slice(0, 160));
    if (!vercel.length) console.log('  (no Vercel statuses yet — build may still be starting)', JSON.stringify(statuses.map((s) => s.context)));
  } catch (e) {
    console.log(`${r.name}: ERR ${e.message}`);
  }
}
