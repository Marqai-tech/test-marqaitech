// Task 125 — source contract checks: FIXED-GROSS payslips, LOP as an explicit
// deduction line (Node equivalent of the flutter source contracts).
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(`/home/z/my-project/${p}`, 'utf8');
let failures = 0;
const check = (cond, reason) => {
  if (cond) console.log(`  ✓ ${reason}`);
  else { failures += 1; console.error(`  ✗ FAIL: ${reason}`); }
};

console.log('payroll engine:');
const engine = read('src/lib/payroll-engine.ts');
check(engine.includes('const employedFactor = daysInMonth > 0 ? employedDays / daysInMonth : 1;'),
  'earnings prorated ONLY by the employment window (gross fixed for full months)');
check(!/\bconst factor = daysInMonth > 0 \? paidDays \/ daysInMonth/.test(engine),
  'old paidDays-earnings-proration removed');
check(engine.includes('const lopDeduction = daysInMonth > 0 ? r2((structureGross * lopDays) / daysInMonth) : 0;'),
  'LOP computed as explicit deduction at the monthly daily rate');
check(engine.includes('pf + esi + tax + professionalTax + lopDeduction'),
  'totalDeductions includes lopDeduction');
check(engine.includes('lopDeduction,\n    totalDeductions,') || engine.includes('lopDeduction,\n    totalDeductions'),
  'lopDeduction persisted on the Payroll row');

console.log('schema:');
const schema = read('prisma/schema.prisma');
check(/lopDeduction\s+Float\s+@default\(0\)/.test(schema), 'Payroll.lopDeduction column in schema.prisma');

console.log('payslips API:');
const api = read('src/app/api/payroll/payslips/route.ts');
check(api.includes('lop: payroll.lopDeduction'), 'detail payslip JSON exposes lop');

console.log('web payslip page:');
const ps = read('src/app/(dashboard)/payroll/payslips/page.tsx');
check(ps.includes("label: 'Loss of Pay', value: selectedPayslip.deductions.lop ?? 0"),
  'Loss of Pay deduction row on web detail');
check(ps.split('.filter(({ value }) => Number(value) !== 0)').length - 1 >= 2,
  'zero-value rows still hidden');

console.log('cron:');
const cron = read('src/app/api/cron/payroll-auto-process/route.ts');
check(cron.includes('force: true'), 'cron force-reprocesses so LOP finalizes on the 1st');

console.log('mobile:');
const model = read('hrms_app/lib/models/payroll.dart');
check(model.includes("lopDeduction: _n('lopDeduction')"), 'PayrollModel parses lopDeduction');
check(model.includes('final num lopDeduction;'), 'PayrollModel field present');
const sheet = read('hrms_app/lib/screens/payroll/payroll_home_screen.dart');
check(sheet.includes("('Loss of Pay', p.lopDeduction)"), 'Loss of Pay row in mobile payslip sheet');

console.log(failures === 0 ? '\nALL CONTRACTS PASS' : `\n${failures} CONTRACT(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
