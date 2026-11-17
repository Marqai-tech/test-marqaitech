#!/usr/bin/env node
/* Task 145 — poll GitHub commit statuses for the deploy commit until both
 * Vercel projects report success (or timeout). Reuses the Task 140/142 pattern. */
const REPO = 'maheshkpreddy/nexus-hrms';
const SHA = process.argv[2];
const TOKEN = process.env.GH_TOKEN || process.argv[3];
if (!SHA || !TOKEN) { console.error('usage: node task145-poll-deploy.cjs <sha> <token>'); process.exit(1); }

async function statuses() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${SHA}/status`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(30000),
  });
  return res.json();
}

(async () => {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const st = await statuses();
      const all = st.statuses || [];
      const vercel = all.filter((s) => /vercel/i.test(s.context));
      const byCtx = {};
      for (const s of vercel) byCtx[s.context] = s.state;
      console.log(`[${new Date().toISOString().slice(11, 19)}] state=${st.state} | ${Object.entries(byCtx).map(([k, v]) => `${k}=${v}`).join(' ') || 'no statuses yet'}`);
      const ctxs = Object.keys(byCtx);
      if (ctxs.length >= 2 && ctxs.every((c) => byCtx[c] === 'SUCCESS')) {
        console.log('BOTH PROJECTS SUCCESS');
        process.exit(0);
      }
      if (ctxs.some((c) => byCtx[c] === 'FAILURE' || byCtx[c] === 'ERROR')) {
        console.log('DEPLOY FAILURE DETECTED');
        process.exit(2);
      }
    } catch (e) {
      console.log('poll error:', e.message);
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
  console.log('TIMEOUT waiting for deploy');
  process.exit(3);
})();
