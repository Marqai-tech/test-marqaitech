// Task 125 — math parity: new fixed-gross presentation must produce the SAME
// net as the old paidDays proration in every scenario.
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
let fail = 0;
const cases = [
  // [label, G, daysInMonth, employedDays, lopDays]
  ['full month, 1 LOP (sept mallesh)', 15000, 30, 30, 1],
  ['full month, 0.5 LOP (bharath sept)', 15000, 30, 30, 0.5],
  ['full month no LOP', 25000, 31, 31, 0],
  ['DOJ month 26/31, 1 LOP', 15000, 31, 26, 1],
  ['vardhani full month', 100200, 31, 31, 0],
  ['vardhani 2.5 LOP', 100200, 31, 31, 2.5],
];
for (const [label, G, D, E, lop] of cases) {
  const oldNet = r2(G * ((E - lop) / D));
  const newNet = r2(G * (E / D) - (G * lop) / D);
  const grossShown = r2(G * (E / D));
  const ok = Math.abs(oldNet - newNet) < 0.005;
  if (!ok) fail += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: old ${oldNet} → new ${newNet} (gross shown ${grossShown}, LOP ded ${r2((G * lop) / D)})`);
}
console.log(fail === 0 ? 'PARITY PASS' : 'PARITY FAIL');
process.exit(fail ? 1 : 0);
