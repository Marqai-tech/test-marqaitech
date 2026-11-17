/* Task 166 — deep bundle marker scan: crawl the /employees HTML and the
 * shared chunks for the Present/Absent-only checkbox + build id freshness. */
const BASE = 'https://marqaitechgroup.3boxeshrms.com';
const MARKERS = ['Present / Absent only', 'presentAbsentOnly', 'Present\\/Absent only'];

async function main() {
  const html = await (await fetch(`${BASE}/employees`, { signal: AbortSignal.timeout(20000) })).text();
  const buildId = (/\"buildId\":\"([^\"]+)\"/.exec(html) || [])[1] || '(spa)';
  console.log('buildId:', buildId);

  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]))];
  console.log(`chunks referenced: ${chunks.length}`);

  // BFS: follow chunk imports up to 3 hops for lazy form chunks
  const seen = new Set<string>();
  const queue = [...chunks];
  let hops = 0;
  while (queue.length && hops < 400) {
    const c = queue.shift()!;
    if (seen.has(c)) continue;
    seen.add(c);
    hops += 1;
    const u = c.startsWith('http') ? c : `${BASE}${c}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!r?.ok) continue;
    const body = await r.text();
    for (const m of MARKERS) {
      if (body.includes(m)) {
        console.log(`MARKER FOUND in ${c} -> "${m}"`);
        process.exit(0);
      }
    }
    for (const next of [...new Set([...body.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((x) => x[0]))]) {
      if (!seen.has(next) && next.includes('pages') || next.includes('app')) queue.push(next);
    }
  }
  console.log(`scanned ${seen.size} chunks — marker not found`);
  process.exit(1);
}
main().catch((e) => { console.error('SCAN FAILED:', e.message); process.exit(1); });
