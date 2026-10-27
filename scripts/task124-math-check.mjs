// Task 124 — pre-deploy math sanity: with PF/ESI OFF, verify the solver
// produces vardhani gross ₹100,200 → on-hand EXACTLY ₹100,000, and that the
// other 8 bands land on their full gross (PT only deduction; TDS=0 via 87A).
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const settings = {
  pfEnabled: false, pfEmployeePct: 12, pfWageCeiling: 15000,
  esiEnabled: false, esiEmployeePct: 0.75, esiWageCeiling: 21000,
  ptEnabled: true, ptMode: 'slab', ptState: 'TELANGANA', ptMonthlyAmount: 200,
  tdsEnabled: true, taxRegime: 'NEW',
  basicPct: 40, hraPctOfBasic: 40, conveyanceAmt: 1600, medicalAmt: 1250,
};

const NEW_SLABS = [[0,400000,0],[400000,800000,5],[800000,1200000,10],[1200000,1600000,15],[1600000,2000000,20],[2000000,2400000,25],[2400000,null,30]];
function taxAnnual(t) {
  if (t <= 0) return 0;
  let tax = 0;
  for (const [from, to, rate] of NEW_SLABS) {
    if (t <= from) break;
    tax += ((Math.min(t, to ?? t) - from) * rate) / 100;
  }
  if (t <= 1200000) tax = 0;
  return r2(tax + (tax * 4) / 100);
}
const pt = (g) => (g <= 15000 ? 0 : g <= 20000 ? 150 : 200);
const tds = (g) => r2(taxAnnual(Math.max(0, g * 12 - 75000)) / 12);
const net = (g) => r2(g - pt(g) - tds(g));

function solve(target) {
  let lo = target, hi = target * 1.6, guard = 0;
  while (net(hi) < target && guard++ < 64) hi *= 1.4;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (net(mid) < target) lo = mid; else hi = mid; }
  let gross = Math.max(target, Math.ceil(hi));
  while (net(gross) < target) gross += 1;
  while (gross - 1 >= target && net(gross - 1) >= target) gross -= 1;
  return gross;
}

const g = solve(100000);
console.log('vardhani solved gross:', g, '→ net:', net(g), g === 100200 && net(g) === 100000 ? 'PASS' : 'FAIL');

for (const [name, gross] of [['mallesh/madhuri/amrutha/syed/bharath', 15000], ['manoj', 20000], ['shiraj/divya', 25000]]) {
  console.log(`${name}: gross ${gross} → net ${net(gross)} (PT ${pt(gross)}, TDS ${tds(gross)})`);
}
