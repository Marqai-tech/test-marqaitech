/**
 * Task 97 — check what the origin PAT can do on maheshkpreddy/nexus-hrms
 * (admin? actions/secrets writable?) + fresh deploy statuses at HEAD.
 */
import { execSync } from 'node:child_process';

const token = (execSync('git remote get-url origin').toString().trim().match(/https:\/\/(?:[^:@/]+:)?([^:@]+)@/) || [])[1];
const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };

const repo = await fetch('https://api.github.com/repos/maheshkpreddy/nexus-hrms', { headers: H }).then((r) => r.json());
console.log('repo permissions:', JSON.stringify(repo.permissions));
console.log('default branch:', repo.default_branch);

const wg = await fetch('https://api.github.com/repos/maheshkpreddy/nexus-hrms/actions/workflows', { headers: H }).then((r) => r.json());
console.log('workflows:', (wg.workflows || []).map((w) => `${w.name}(${w.state})`).join(', ') || 'none');

const sha = execSync('git rev-parse HEAD').toString().trim();
const st = await fetch(`https://api.github.com/repos/maheshkpreddy/nexus-hrms/commits/${sha}/status`, { headers: H }).then((r) => r.json());
console.log(`\nstatuses @ ${sha.slice(0, 8)} (${st.state}):`);
for (const s of st.statuses || []) console.log(`  [${s.state}] ${s.context} @ ${s.created_at}`);
if (!(st.statuses || []).length) console.log('  (none yet)');
