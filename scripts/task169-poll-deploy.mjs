/**
 * Task 169 — deploy poll.
 * Fingerprint: GET /api/attendance/my-roster (no auth) must return JSON 401
 * {"error":"No token provided"} once the new build is LIVE. Before deploy it
 * 404s (route missing) or returns text/html (fallback page).
 */
const BASES = [
  'https://marqaitechgroup.3boxeshrms.com',
  'https://nexus-hrms-demo.vercel.app',
  'https://nexus-hrms-mu.vercel.app',
];

async function probe(base) {
  try {
    const r = await fetch(`${base}/api/attendance/my-roster?month=2026-10`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const ct = r.headers.get('content-type') || '';
    const body = await r.text();
    return { base, status: r.status, ct, json: ct.includes('application/json'), body: body.slice(0, 120) };
  } catch (e) {
    return { base, status: 0, ct: '', json: false, body: String(e).slice(0, 120) };
  }
}

const deadline = Date.now() + 14 * 60 * 1000;
let round = 0;
const done = new Set();
while (Date.now() < deadline && done.size < BASES.length) {
  round++;
  const results = await Promise.all(BASES.filter(b => !done.has(b)).map(probe));
  for (const r of results) {
    const live = r.json && r.status === 401;
    console.log(`[poll ${round}] ${new Date().toISOString()} ${r.base} → ${r.status} ${r.ct || r.body} ${live ? 'LIVE ✓' : ''}`);
    if (live) done.add(r.base);
  }
  if (done.size < BASES.length) await new Promise(res => setTimeout(res, 30000));
}
console.log(`[task169-poll] ${done.size}/${BASES.length} domains serving the new build: ${[...done].join(', ')}`);
