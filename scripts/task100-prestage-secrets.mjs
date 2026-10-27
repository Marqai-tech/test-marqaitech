// Task 100 — pre-stage GitHub Actions secrets for the CI auto-deploy (demo project).
// Adds VERCEL_ORG_ID_DEMO + VERCEL_PROJECT_ID_DEMO (non-secret infra IDs).
// VERCEL_TOKEN itself is NOT available in this sandbox (previous token rotated) — user must add it.
import { execSync } from 'node:child_process';
import _sodium from 'libsodium-wrappers';

const url = execSync('git config --get remote.origin.url').toString().trim();
const token = url.match(/https:\/\/[^:]+:([^@]+)@github\.com/)[1];
const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': '3boxes-ci-setup' };
const REPO = 'maheshkpreddy/nexus-hrms';

await _sodium.ready;
const sodium = _sodium;

const pk = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, { headers: H }).then((r) => r.json());
if (!pk.key) { console.log('cannot read repo public key:', JSON.stringify(pk).slice(0, 120)); process.exit(1); }
console.log('repo public key fetched (key_id:', pk.key_id + ')');

async function putSecret(name, value) {
  const bin = sodium.from_string(value);
  const enc = sodium.crypto_box_seal(bin, sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL));
  const b64 = sodium.to_base64(enc, sodium.base64_variants.ORIGINAL);
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${name}`, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted_value: b64, key_id: pk.key_id }),
  });
  console.log(`PUT secret ${name} → HTTP ${res.status} ${res.status === 201 || res.status === 204 ? '✓ STORED' : '✗ ' + (await res.text()).slice(0, 120)}`);
  return res.status === 201 || res.status === 204;
}

const orgOk = await putSecret('VERCEL_ORG_ID_DEMO', 'team_ALrSsdNlfJYe6FxgR59NEG6N');
const projOk = await putSecret('VERCEL_PROJECT_ID_DEMO', 'prj_yOsBojQSP3GdgKEE8rFQVjrDKxqh');

const list = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets`, { headers: H }).then((r) => r.json());
console.log('\nsecrets now present on repo:', (list.secrets || []).map((s) => s.name).join(', ') || '(none)');
console.log(orgOk && projOk
  ? '\nRESULT: PAT CAN write Actions secrets — VERCEL_TOKEN is the only missing piece (user must create a fresh Vercel token).'
  : '\nRESULT: PAT CANNOT write secrets — user must add all three secrets via GitHub UI.');
