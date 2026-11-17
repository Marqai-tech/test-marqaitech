// Task 100-b — store VERCEL_TOKEN into GitHub Actions secrets (token passed via env, NEVER hardcoded).
import { execSync } from 'node:child_process';
import _sodium from 'libsodium-wrappers';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
if (!VERCEL_TOKEN) { console.error('MISSING VERCEL_TOKEN env'); process.exit(1); }

const url = execSync('git config --get remote.origin.url').toString().trim();
const gh = url.match(/https:\/\/[^:]+:([^@]+)@github\.com/)[1];
const H = { Authorization: `Bearer ${gh}`, Accept: 'application/vnd.github+json', 'User-Agent': '3boxes-ci-arm' };
const REPO = 'maheshkpreddy/nexus-hrms';

await _sodium.ready;
const pk = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, { headers: H }).then((r) => r.json());
const enc = _sodium.crypto_box_seal(_sodium.from_string(VERCEL_TOKEN), _sodium.from_base64(pk.key, _sodium.base64_variants.ORIGINAL));
const res = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/VERCEL_TOKEN`, {
  method: 'PUT',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ encrypted_value: _sodium.to_base64(enc, _sodium.base64_variants.ORIGINAL), key_id: pk.key_id }),
});
console.log(`PUT secret VERCEL_TOKEN → HTTP ${res.status} ${res.status === 201 || res.status === 204 ? '✓ STORED' : '✗ ' + (await res.text()).slice(0, 120)}`);

const list = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets`, { headers: H }).then((r) => r.json());
console.log('secrets now on repo:', (list.secrets || []).map((s) => s.name).join(', '));
