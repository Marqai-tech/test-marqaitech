// Poll both production domains until the Task 157 (f041bd5a) build is live.
// Marker: POST /api/attendance/bulk-update must answer the route's JSON contract
// (401 unauthenticated) instead of the HTML fallback page (200).
const DOMAINS = ['https://marqaitechgroup.3boxeshrms.com', 'https://nexus-hrms-demo.vercel.app'];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function probe(base) {
  try {
    const r = await fetch(base + '/api/attendance/bulk-update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, json: ct.includes('application/json') };
  } catch (e) { return { status: 0, json: false, err: e.message }; }
}

const deadline = Date.now() + 30 * 60 * 1000; // 30 min budget
let round = 0;
while (Date.now() < deadline) {
  round++;
  const results = [];
  for (const d of DOMAINS) results.push(d + ' -> ' + JSON.stringify(await probe(d)));
  const allLive = (await Promise.all(DOMAINS.map(probe))).every(x => x.json);
  console.log(new Date().toISOString().slice(11, 19), '| round ' + round, '|', results.join('  '));
  if (allLive) { console.log('DEPLOYED: bulk-update route live on both domains'); process.exit(0); }
  await sleep(60 * 1000);
}
console.log('TIMEOUT: route still not live after 30 min');
process.exit(1);
