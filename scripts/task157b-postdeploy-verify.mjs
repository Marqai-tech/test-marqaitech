// Task 157 (f041bd5a) post-deploy verification — live probes on production.
// Batch: regularize month view + bulk actions / Production Less Hours /
//        Company Policies wiring / feed broadcast.
const DOMAINS = ['https://marqaitechgroup.3boxeshrms.com', 'https://nexus-hrms-demo.vercel.app'];
const MARKERS = {
  regularize: ['Direct Attendance Update', 'Raise Regularization Requests', 'Production Less Hours'],
  policies: ['Appears In', 'Module Mapping'],
};
let pass = 0, fail = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name); cond ? pass++ : fail++; };

async function pageScripts(base, path) {
  const html = await (await fetch(base + path, { redirect: 'follow' })).text();
  return [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1]);
}
async function bundleHas(base, path, needle) {
  const srcs = await pageScripts(base, path);
  for (const s of srcs) {
    try {
      const js = await (await fetch(base + s)).text();
      if (js.includes(needle)) return { found: true, chunk: s };
    } catch {}
  }
  return { found: false };
}

for (const base of DOMAINS) {
  console.log('\n=== ' + base + ' ===');
  // 1. bulk-update route exists (200/400/401/403 — NOT 404)
  const r = await fetch(base + '/api/attendance/bulk-update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ok('POST /api/attendance/bulk-update not 404 (got ' + r.status + ')', r.status !== 404);
  // 2. regularize page bundle markers
  for (const m of MARKERS.regularize) {
    const res = await bundleHas(base, '/attendance/regularize', m);
    ok('regularize bundle contains "' + m + '"', res.found);
  }
  // 3. company policies page bundle markers
  for (const m of MARKERS.policies) {
    const res = await bundleHas(base, '/company/policies', m);
    ok('company/policies bundle contains "' + m + '"', res.found);
  }
}
console.log('\nTOTAL: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
