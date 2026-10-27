// Task 126 — source contract checks: validations page fix + biometric LOP tooling.
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(`/home/z/my-project/${p}`, 'utf8');
let failures = 0;
const check = (cond, reason) => {
  if (cond) console.log(`  ✓ ${reason}`);
  else { failures += 1; console.error(`  ✗ FAIL: ${reason}`); }
};

console.log('validations [id] route:');
const detail = read('src/app/api/payroll/validations/[id]/route.ts');
check(/const db = await getDb\(_request\);/.test(detail), 'getDb resolved inside the GET handler (ReferenceError fixed)');

console.log('validations page:');
const page = read('src/app/(dashboard)/payroll/validations/page.tsx');
check(page.includes('function normalizeValidation'), 'normalizer present');
check(page.includes('function parseJsonArray'), 'JSON-string parser present');
check((page.match(/normalizeValidation\(/g) || []).length >= 5, 'normalizer applied to every data path (list, run, detail, fallbacks)');
check(!/JSON\.parse\(data\.data\.missingPaymentMethods/.test(page), 'unsafe inline JSON.parse removed');

console.log('biometric backfill scripts exist:');
for (const f of ['scripts/task126-backfill-punches.cjs', 'scripts/task126-derive-absents.cjs', 'scripts/task126-lop-audit.cjs']) {
  check(read(f).length > 500, `${f}`);
}

console.log(failures === 0 ? '\nALL CONTRACTS PASS' : `\n${failures} CONTRACT(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
