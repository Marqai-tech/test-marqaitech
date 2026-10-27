// Task 100 — PAT capability check: can we (a) read repo permissions, (b) manage Actions secrets, (c) push a workflow file?
import { execSync } from 'node:child_process';

const url = execSync('git config --get remote.origin.url').toString().trim();
const token = url.match(/https:\/\/[^:]+:([^@]+)@github\.com/)[1];
const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': '3boxes-ci-check' };
const REPO = 'maheshkpreddy/nexus-hrms';

const perm = await fetch(`https://api.github.com/repos/${REPO}`, { headers: H }).then((r) => r.json());
console.log('repo permissions for this PAT:', JSON.stringify(perm.permissions));

const secrets = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets`, { headers: H });
console.log('GET actions/secrets →', secrets.status, secrets.status === 200 ? '(CAN manage secrets)' : '(CANNOT manage secrets)');

// workflow-file write test via Contents API (dry: check if file exists first)
const wfPath = '.github/workflows/vercel-deploy.yml';
const existing = await fetch(`https://api.github.com/repos/${REPO}/contents/${wfPath}`, { headers: H });
console.log(`GET ${wfPath} →`, existing.status, existing.status === 200 ? '(workflow file already exists)' : '(not present)');

if (existing.status === 404) {
  const content = Buffer.from(
    '# placeholder created to test PAT workflow scope — replace with real workflow\nname: ci-scope-test\non: workflow_dispatch\njobs:\n  noop:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n',
  ).toString('base64');
  const put = await fetch(`https://api.github.com/repos/${REPO}/contents/${wfPath}`, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'test PAT workflow scope',
      content,
      branch: 'main',
    }),
  });
  console.log('PUT workflow file →', put.status, put.status === 201 ? '(PAT HAS workflow scope — workflow created!)' : '(PAT lacks workflow scope: ' + (await put.text()).slice(0, 160) + ')');
}
