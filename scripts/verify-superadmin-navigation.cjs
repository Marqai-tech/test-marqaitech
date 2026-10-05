const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const filename = 'src/lib/roleAccess.ts';
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const roleExports = {};
vm.runInNewContext(compiled, { exports: roleExports, Set, URLSearchParams });
const { isNavSectionEnabled, dashboardHrefForRole, canRoleAccessModule, setDbModuleOverrides } = roleExports;

// A selected company cannot hide the platform owner's management console.
const restricted = new Set(['employees']);
assert.equal(isNavSectionEnabled('super_admin', 'test-tenant', 'super-admin', restricted), true);
assert.equal(isNavSectionEnabled('super_admin', 'test-tenant', 'payroll', restricted), false);
assert.equal(isNavSectionEnabled('employee', 'test-tenant', 'super-admin', restricted), false);
assert.equal(canRoleAccessModule('employee', 'super_admin'), false);
assert.equal(canRoleAccessModule('tenant_admin', 'super_admin'), false);

// Async flag updates change visibility without a browser refresh.
assert.equal(isNavSectionEnabled('employee', 'test-tenant', 'leave', restricted), false);
assert.equal(isNavSectionEnabled('employee', 'test-tenant', 'leave', new Set(['employees', 'leave'])), true);
setDbModuleOverrides({ 'test-tenant': restricted });
assert.equal(isNavSectionEnabled('super_admin', 'test-tenant', 'super-admin'), true);
assert.equal(isNavSectionEnabled('employee', 'test-tenant', 'payroll'), false);
setDbModuleOverrides({});
assert.equal(dashboardHrefForRole('super_admin'), '/home');
for (const role of ['employee', 'tenant_admin', 'admin', undefined]) {
  assert.equal(dashboardHrefForRole(role), '/dashboard');
}
console.log('PASS: platform module visibility, async flags, role restrictions, dashboard routing');

(async () => {
  const { ESLint } = require('eslint');
  const eslint = new ESLint();
  const files = [
    'src/lib/roleAccess.ts', 'src/components/Sidebar.tsx',
    'src/app/(dashboard)/modules/page.tsx', 'src/app/(dashboard)/dashboard/page.tsx',
    'src/app/(dashboard)/super-admin/page.tsx',
    'src/app/login/page.tsx',
  ];
  let introduced = 0;
  for (const file of files) {
    const baseline = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' });
    const [before] = await eslint.lintText(baseline, { filePath: file });
    const [after] = await eslint.lintText(fs.readFileSync(file, 'utf8'), { filePath: file });
    // Some rules embed source locations in their diagnostic text. Compare
    // the rule and explanation so shifted line numbers aren't new failures.
    const key = m => `${m.ruleId}:${m.message.split('\n\n')[0]}`;
    const counts = new Map();
    for (const message of before.messages) counts.set(key(message), (counts.get(key(message)) || 0) + 1);
    for (const message of after.messages) {
      const remaining = counts.get(key(message)) || 0;
      if (remaining) counts.set(key(message), remaining - 1);
      else { console.error(file, message.ruleId, message.message); introduced++; }
    }
  }
  assert.equal(introduced, 0, 'New lint issues compared with existing code');
  console.log('PASS: no new lint issues in changed files');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
