/**
 * Task 98 — Option B: create the demo project on the CURRENT Vercel account
 * (team_ALrSsdNlfJYe6FxgR59NEG6N) and configure its environment variables.
 *
 * USAGE (requires a FULL-ACCESS token — Account Settings → Tokens → Scope:
 * Full Account; read-only/project-scoped tokens cannot create projects):
 *   VERCEL_TOKEN=<token> node scripts/task98-option-b-setup.mjs
 *
 * After this script succeeds, deploy the demo from the repo root:
 *   printf '{"orgId":"team_ALrSsdNlfJYe6FxgR59NEG6N","projectId":"prj_<new>"}' > .vercel/project.json
 *   npx --yes vercel@latest deploy --prod --yes --token=<token>
 *
 * The demo domain https://nexus-hrms-demo.vercel.app is already listed in
 * DEMO_DOMAINS (middleware.ts, site-mode.ts, tenant-db.ts) as of the
 * Task 98-b commit, so no further code change is needed.
 */
const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) { console.error('MISSING VERCEL_TOKEN env'); process.exit(1); }

const ORG_ID = 'team_ALrSsdNlfJYe6FxgR59NEG6N';
const LIVE_PROJECT = 'prj_lFkap5sRhG6L4qj0PrkNB1TCfFqb';
const DEMO_NAME = 'nexus-hrms-demo';
const DEMO_URL = `https://${DEMO_NAME}.vercel.app`;
const BASE = 'https://api.vercel.com';

async function api(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b };
}

// ─── 1. Fetch LIVE env (decrypted) ───────────────────────────────────
const liveEnvRes = await api(`/v9/projects/${LIVE_PROJECT}/env?decrypt=true&teamId=${ORG_ID}`);
const liveEnvs = liveEnvRes.body?.envs || [];
if (!liveEnvs.length) {
  console.error('FAILED to read LIVE env:', JSON.stringify(liveEnvRes.body).slice(0, 300));
  process.exit(1);
}
const live = {};
for (const e of liveEnvs) live[e.key] = e.value;
console.log(`LIVE env read: ${liveEnvs.length} vars`);

// Copy list — platform DB + shared config (src/lib/db.ts prefers
// POSTGRES_PRISMA_URL || POSTGRES_URL || DATABASE_URL).
const COPY_KEYS = ['DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'NEXT_PUBLIC_ROOT_DOMAIN', 'CRON_SECRET'];
// Fresh demo-specific values.
const SET_VARS = {
  SITE_MODE: 'demo',
  NEXT_PUBLIC_SITE_MODE: 'demo',
  NEXT_PUBLIC_BASE_URL: DEMO_URL,
  NEXTAUTH_URL: DEMO_URL,
};

const envPayload = [];
let decryptFail = false;
for (const k of COPY_KEYS) {
  const v = live[k];
  if (v === undefined) { console.log(`WARN: LIVE has no ${k} — skipped`); continue; }
  if (typeof v === 'string' && v.startsWith('eyJ2IjoidjIi')) {
    console.error(`DECRYPT FAILED for ${k} (token lacks env-value read scope)`);
    decryptFail = true; continue;
  }
  envPayload.push({ key: k, value: v, type: 'encrypted', target: ['production'] });
}
for (const [k, v] of Object.entries(SET_VARS)) {
  envPayload.push({ key: k, value: v, type: 'plain', target: ['production'] });
}
if (decryptFail) {
  console.error('\nABORT: use a FULL-ACCESS token (Account Settings → Tokens → Scope: Full Account).');
  process.exit(1);
}

// ─── 2. Create (or reuse) the demo project ───────────────────────────
let projectId;
const existing = await api(`/v9/projects/${DEMO_NAME}?teamId=${ORG_ID}`);
if (existing.status === 200) {
  projectId = existing.body.id;
  console.log(`Project ${DEMO_NAME} already exists — reusing ${projectId}`);
} else {
  const created = await api(`/v10/projects?teamId=${ORG_ID}`, {
    method: 'POST',
    body: JSON.stringify({ name: DEMO_NAME, framework: 'nextjs' }),
  });
  if (created.status !== 200) {
    console.error(`CREATE FAILED HTTP ${created.status}:`, JSON.stringify(created.body).slice(0, 300));
    console.error('→ The token cannot create projects. Use a FULL-ACCESS token.');
    process.exit(1);
  }
  projectId = created.body.id;
  console.log(`Project created: ${DEMO_NAME} (${projectId})`);
}

// ─── 3. Upsert env vars ──────────────────────────────────────────────
for (const v of envPayload) {
  const r = await api(`/v10/projects/${projectId}/env?upsert=true&teamId=${ORG_ID}`, {
    method: 'POST',
    body: JSON.stringify(v),
  });
  console.log(`env ${v.key}: HTTP ${r.status}${r.status >= 400 ? ' ' + JSON.stringify(r.body).slice(0, 160) : ''}`);
}

// ─── 4. Summary + next steps ─────────────────────────────────────────
console.log('\n================ OPTION B SETUP COMPLETE ================');
console.log(`orgId      (VERCEL_ORG_ID_DEMO):  ${ORG_ID}`);
console.log(`projectId  (VERCEL_PROJECT_ID_DEMO): ${projectId}`);
console.log(`Demo URL: ${DEMO_URL}`);
console.log('\nDeploy from repo root:');
console.log(`  mkdir -p .vercel && printf '{"orgId":"${ORG_ID}","projectId":"${projectId}"}' > .vercel/project.json`);
console.log(`  npx --yes vercel@latest deploy --prod --yes --token=<FULL-ACCESS token>`);
console.log('\nThen verify: curl -s -o /dev/null -w "%{http_code}" ' + DEMO_URL + '/login  (expect 200)');
