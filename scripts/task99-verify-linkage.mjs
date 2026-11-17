// Task 99 — Verify linkage:
//   (a) Is nexus-hrms-mu.vercel.app hosted in the production Vercel account (vercel.com/marqaitech1)?
//   (b) Is the code deployed there from github.com/Marqaitech/3-Boxes-HRMS?
// Evidence sources:
//   1. GitHub commit statuses on both repos — Vercel posts statuses whose target_url
//      reveals the Vercel account slug + project name (e.g. vercel.com/<slug>/<project>/...).
//   2. Direct HTTP probes of nexus-hrms-mu.vercel.app / nexus-hrms-demo.vercel.app / 3boxeshrms.com
//      (asset-hash comparison shows whether the old link is frozen at an older build).

import { execSync } from 'node:child_process';

const redact = (s) => String(s).replace(/[A-Za-z0-9_\-]{18,}/g, (m) => (m.length > 30 ? m.slice(0, 6) + '…REDACTED' : m));

function ghTokenFor(remote) {
  const url = execSync(`git config --get remote.${remote}.url`).toString().trim();
  const m = url.match(/https:\/\/([^:]+):([^@]+)@github\.com/);
  return m ? m[2] : null;
}
const tokenMarqai = ghTokenFor('marqai');
const tokenOrigin = ghTokenFor('origin');

const GH = 'https://api.github.com';
async function gh(path, token) {
  const res = await fetch(GH + path, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': '3boxes-linkage-check',
    },
  });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; }
  catch { return { status: res.status, json: null, text: text.slice(0, 200) }; }
}

console.log('='.repeat(78));
console.log('PART 1 — GitHub repo: Marqaitech/3-Boxes-HRMS (LIVE repo)');
console.log('='.repeat(78));
const repo = await gh('/repos/Marqaitech/3-Boxes-HRMS', tokenMarqai);
if (repo.status === 200) {
  console.log(`exists: true | default_branch: ${repo.json.default_branch} | pushed_at: ${repo.json.pushed_at}`);
  const commits = await gh('/repos/Marqaitech/3-Boxes-HRMS/commits?per_page=3', tokenMarqai);
  for (const c of commits.json || []) {
    const sha = c.sha;
    const short = sha.slice(0, 8);
    const msg = (c.commit.message.split('\n')[0] || '').slice(0, 80);
    const st = await gh(`/repos/Marqaitech/3-Boxes-HRMS/commits/${sha}/status`, tokenMarqai);
    console.log(`\n● commit ${short} — ${msg}`);
    if (st.json && Array.isArray(st.json.statuses) && st.json.statuses.length) {
      for (const s of st.json.statuses) {
        console.log(`   context: "${s.context}" | state: ${s.state}`);
        console.log(`   target : ${redact(s.target_url || '(none)')}`);
      }
    } else {
      console.log('   (no commit statuses posted)');
    }
  }
} else {
  console.log(`repo check failed: HTTP ${repo.status}`);
}

console.log('\n' + '='.repeat(78));
console.log('PART 2 — GitHub repo: maheshkpreddy/nexus-hrms (demo repo)');
console.log('='.repeat(78));
const repo2 = await gh('/repos/maheshkpreddy/nexus-hrms', tokenOrigin);
if (repo2.status === 200) {
  console.log(`exists: true | default_branch: ${repo2.json.default_branch} | pushed_at: ${repo2.json.pushed_at}`);
  const commits = await gh('/repos/maheshkpreddy/nexus-hrms/commits?per_page=3', tokenOrigin);
  for (const c of commits.json || []) {
    const sha = c.sha;
    const short = sha.slice(0, 8);
    const msg = (c.commit.message.split('\n')[0] || '').slice(0, 80);
    const st = await gh(`/repos/maheshkpreddy/nexus-hrms/commits/${sha}/status`, tokenOrigin);
    console.log(`\n● commit ${short} — ${msg}`);
    if (st.json && Array.isArray(st.json.statuses) && st.json.statuses.length) {
      for (const s of st.json.statuses) {
        console.log(`   context: "${s.context}" | state: ${s.state}`);
        console.log(`   target : ${redact(s.target_url || '(none)')}`);
      }
    } else {
      console.log('   (no commit statuses posted)');
    }
  }
} else {
  console.log(`repo check failed: HTTP ${repo2.status}`);
}

console.log('\n' + '='.repeat(78));
console.log('PART 3 — Direct HTTP probes');
console.log('='.repeat(78));
async function probe(name, url, path = '/login') {
  try {
    const res = await fetch(url + path, { redirect: 'manual' });
    const headers = {};
    for (const h of ['x-vercel-id', 'x-vercel-cache', 'server', 'x-matched-path', 'age']) {
      const v = res.headers.get(h);
      if (v) headers[h] = v;
    }
    const body = await res.text();
    // extract next asset build hashes (static chunk paths are build-specific)
    const assets = [...new Set([...body.matchAll(/\/_next\/static\/([A-Za-z0-9_-]{8,})\//g)].map((m) => m[1]))].slice(0, 6);
    console.log(`\n◆ ${name} — GET ${path}`);
    console.log(`  HTTP ${res.status} | headers: ${JSON.stringify(headers)}`);
    console.log(`  next build asset hashes: ${assets.join(', ') || '(none found)'}`);
    return { status: res.status, assets, body };
  } catch (e) {
    console.log(`\n◆ ${name} — GET ${path} → FAILED: ${e.cause?.code || e.message}`);
    return { status: 0, assets: [], body: '' };
  }
}

const oldDemo = await probe('OLD test link  nexus-hrms-mu.vercel.app', 'https://nexus-hrms-mu.vercel.app');
const newDemo = await probe('NEW test link  nexus-hrms-demo.vercel.app', 'https://nexus-hrms-demo.vercel.app');
await probe('LIVE           3boxeshrms.com', 'https://3boxeshrms.com');

console.log('\n' + '='.repeat(78));
console.log('PART 4 — Frozen-build comparison (old vs new demo)');
console.log('='.repeat(78));
const oldSet = new Set(oldDemo.assets);
const newSet = new Set(newDemo.assets);
const shared = [...oldSet].filter((a) => newSet.has(a));
console.log(`old-demo build hashes: ${[...oldSet].join(', ') || '-'}`);
console.log(`new-demo build hashes: ${[...newSet].join(', ') || '-'}`);
console.log(`shared hashes: ${shared.length ? shared.join(', ') : 'NONE'}`);
console.log(shared.length === 0
  ? '=> OLD link serves a DIFFERENT (older) build than the current code — it is frozen.'
  : '=> OLD link shares build hashes with the new demo — same generation of code.');
