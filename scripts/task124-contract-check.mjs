// Task 124 — source contract checks (Node equivalent of the flutter
// source-contract suite; Flutter SDK unavailable in this sandbox).
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(`/home/z/my-project/${p}`, 'utf8');
let failures = 0;
const check = (cond, reason) => {
  if (cond) console.log(`  ✓ ${reason}`);
  else { failures += 1; console.error(`  ✗ FAIL: ${reason}`); }
};

console.log('marqai-setup route:');
const setup = read('src/app/api/payroll/marqai-setup/route.ts');
check(setup.includes('const pfEnabled = body?.pfEnabled === true;'), 'PF defaults OFF');
check(setup.includes('const esiEnabled = body?.esiEnabled === true;'), 'ESI defaults OFF');
check(setup.includes('pfEnabled, esiEnabled,'), 'settings upsert persists both toggles');
check(setup.includes('const settings = await resolvePayrollSettings(db, companyId);'), 'solver re-reads settings after upsert');
check(setup.includes("settings.pfEnabled ? [{ name: 'EPF - Employee'"), 'EPF structure row conditional');
check(setup.includes("settings.esiEnabled ? [{ name: 'ESI - Employee'"), 'ESI structure row conditional');
check(setup.includes("name: { startsWith: 'MarqAI' }") && setup.includes('stale'), 'stale structure cleanup');

console.log('payroll engine:');
const engine = read('src/lib/payroll-engine.ts');
check(engine.includes('settings.pfEnabled ? r2((pfWage'), 'EPF gated by pfEnabled');
check(engine.includes('settings.esiEnabled && structureGross <= settings.esiWageCeiling'), 'ESI gated by esiEnabled');
check(engine.includes('settings.pfEnabled ? r2((Math.min(basic, settings.pfWageCeiling)'), 'solver PF gate');
check(engine.includes('settings.esiEnabled && g <= settings.esiWageCeiling'), 'solver ESI gate');

console.log('process endpoint:');
check(read('src/app/api/payroll/process/route.ts').includes('force: Boolean(body.force)'), 'force honoured');

console.log('web payslip page:');
const ps = read('src/app/(dashboard)/payroll/payslips/page.tsx');
check(ps.split('.filter(({ value }) => Number(value) !== 0)').length - 1 >= 2, 'earnings+deductions filter zero rows');

console.log('web payroll settings page:');
const st = read('src/app/(dashboard)/payroll/settings/page.tsx');
check(st.includes('Statutory Deductions — PF'), 'PF/ESI toggle card present');
check(st.includes('saveStatutory'), 'saveStatutory wired');
check(st.includes("{ pf: { enabled: next.pfEnabled }, esi: { enabled: next.esiEnabled } }"), 'toggles persisted via PUT');
check(st.includes('force,'), 'force forwarded to process');
check(st.includes('Reprocess existing payslips'), 'reprocess checkbox present');

console.log('salary-settings API:');
const api = read('src/app/api/payroll/salary-settings/route.ts');
check(api.includes("pfEnabled: typeof pf.enabled === 'boolean' ? pf.enabled : undefined"), 'PUT persists pfEnabled');
check(api.includes("esiEnabled: typeof esi.enabled === 'boolean' ? esi.enabled : undefined"), 'PUT persists esiEnabled');
check(api.includes('enabled: settings.pfEnabled'), 'GET exposes pf state');
check(api.includes('enabled: settings.esiEnabled'), 'GET exposes esi state');

console.log(failures === 0 ? '\nALL CONTRACTS PASS' : `\n${failures} CONTRACT(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
