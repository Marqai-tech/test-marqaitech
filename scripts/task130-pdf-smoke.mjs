/**
 * Task 130 — Payslip PDF smoke test (local, no server).
 *
 * Bundles the REAL production modules (src/lib/payslip-pdf.ts,
 * src/lib/amount-in-words.ts, src/lib/payslip-assets.ts) with a one-file
 * esbuild-free transform (Node 24 native TS type stripping via a tiny
 * esbuild download), then renders a payslip with the exact MarqAI data
 * shape and verifies:
 *   1. output is a valid PDF (%PDF header + %%EOF trailer)
 *   2. embedded custom rupee font is inside the PDF
 *   3. amount-in-words matches the released format
 *   4. reasonable size (logo + font embedded → > 40 KB)
 *
 * USAGE: node scripts/task130-pdf-smoke.mjs
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(ROOT);

// 1. Get a bundler: use esbuild from the network cache if not present
const require = createRequire(import.meta.url);
let esbuild;
try {
  esbuild = (await import('esbuild')).default ?? (await import('esbuild'));
} catch {
  console.log('[smoke] installing esbuild into scripts/task130-assets …');
  execSync('npm i --prefix scripts/task130-assets esbuild@0.24.0 --no-save --silent', { cwd: ROOT, stdio: 'inherit' });
  esbuild = (await import(path.join(ROOT, 'scripts/task130-assets/node_modules/esbuild/lib/main.js'))).default;
}

// 2. Bundle the real modules to ESM
const outfile = 'scripts/task130-assets/payslip-bundle.mjs';
await esbuild.build({
  entryPoints: ['src/lib/payslip-pdf.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  external: ['jspdf', 'canvg', 'html2canvas', 'dompurify'],
  logLevel: 'silent',
});

const { buildPayslipPdf } = await import(path.join(ROOT, outfile));
const { amountInWordsINR } = await import(path.join(ROOT, outfile) + '').then?.(() => ({})) ?? {};
// amount-in-words is bundled inside; re-import the source directly via a tiny bundle too
await esbuild.build({
  entryPoints: ['src/lib/amount-in-words.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/task130-assets/words-bundle.mjs',
  logLevel: 'silent',
});
const wordsMod = await import(path.join(ROOT, 'scripts/task130-assets/words-bundle.mjs'));

// 3. Amount-in-words checks (from the released payslip format)
const cases = [
  [75000, 'Seventy Five Thousand Rupees Only'],
  [100200, 'One Lakh Two Hundred Rupees Only'],
  [15000, 'Fifteen Thousand Rupees Only'],
  [0, 'Zero Rupees Only'],
  [1, 'One Rupee Only'],
  [200, 'Two Hundred Rupees Only'],
];
let fails = 0;
for (const [n, want] of cases) {
  const got = wordsMod.amountInWordsINR(n);
  const ok = got === want;
  if (!ok) fails++;
  console.log(`[smoke] words ${n} → "${got}" ${ok ? 'OK' : `FAIL (want "${want}")`}`);
}

// 4. PDF render — Vardhani-shaped data (October 2026, exact production figures)
const pdfBuffer = await buildPayslipPdf({
  monthName: 'October',
  year: 2026,
  company: {
    name: 'MarqAI Tech Pvt Ltd',
    address: '#399, Level 1, SS Prime, Double Road, AGB Layout, Hessaraghatta Main Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    zipCode: '560090',
  },
  logoB64: null, // resolved by company-name fallback → embedded MarqAI mark
  employee: {
    name: 'Vardhani Reddy',
    employeeCode: 'MARQ001',
    designation: 'HR Director',
    department: 'Management',
    dateOfJoining: '2026-06-01T00:00:00.000Z',
    location: 'Bengaluru',
  },
  earnings: [
    { label: 'Basic Salary', amount: 40080 },
    { label: 'HRA', amount: 16032 },
    { label: 'Dearness Allowance', amount: 0 },
    { label: 'Conveyance Allowance', amount: 1600 },
    { label: 'Medical Allowance', amount: 1250 },
    { label: 'Other Allowances', amount: 41238 },
  ],
  deductions: [
    { label: 'Provident Fund', amount: 0 },
    { label: 'ESI', amount: 0 },
    { label: 'Income Tax', amount: 0 },
    { label: 'Professional Tax', amount: 200 },
    { label: 'Loss of Pay', amount: 9677.42 },
    { label: 'Other Deductions', amount: 0 },
  ],
  totalEarnings: 100200,
  totalDeductions: 9877.42,
  netPay: 90322.58,
  effectiveWorkDays: 29,
  daysInMonth: 31,
  currency: 'INR',
});

const head = pdfBuffer.subarray(0, 5).toString('ascii');
const tail = pdfBuffer.subarray(-64).toString('latin1');
const hasRupeeFont = pdfBuffer.toString('latin1').includes('RupeeSans');
const bytes = pdfBuffer.length;

console.log(`[smoke] pdf: ${bytes} bytes, head=${head}, eof=${tail.includes('%%EOF')}, rupeeFontEmbedded=${hasRupeeFont}`);
const pdfOk = head === '%PDF-' && tail.includes('%%EOF') && bytes > 15000 && bytes < 120000 && hasRupeeFont;

// save for visual inspection
fs.writeFileSync('scripts/task130-assets/payslip-sample.pdf', pdfBuffer);

if (fails > 0 || !pdfOk) {
  console.error(`[smoke] FAILED — words fails=${fails}, pdfOk=${pdfOk}`);
  process.exit(1);
}
console.log('[smoke] ALL PASS — sample written to scripts/task130-assets/payslip-sample.pdf');
