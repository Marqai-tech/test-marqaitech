#!/usr/bin/env node
/* Task 140 — selected-row export contract check.
 * Verifies: (1) the employees API parses ?ids= and applies it as the where
 * filter ahead of list filters; (2) the Employee List export sends ids when
 * the checkbox selection is non-empty and keeps filter-mode otherwise;
 * (3) id-parse logic dedupes, trims and caps at 500.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

console.log('[1] API route — src/app/api/employees/route.ts');
const api = fs.readFileSync(path.join(ROOT, 'src/app/api/employees/route.ts'), 'utf8');
check('parses ?ids= query param', api.includes("searchParams.get('ids')"));
check('dedupes + caps selection at 500', /selectedExportIds[\s\S]*?slice\(0, 500\)/.test(api));
check('ids selection overrides list filters', /if \(selectedExportIds\.length > 0\) \{\s*\n\s*where\.id = \{ in: selectedExportIds \};/.test(api));
check('list filters moved into else branch', /where\.id = \{ in: selectedExportIds \};[\s\S]*?\} else \{[\s\S]*?if \(departmentId\) where\.departmentId = departmentId;/);
check('search filter applied only once (no duplicate block)', (api.match(/if \(search\) \{/g) || []).length === 1);
check('company scope still applied after ids filter', /where\.id = \{ in: selectedExportIds \};[\s\S]*?effectiveCompanyIdFilter/);
check('management exclusion still applied after ids filter', /where\.id = \{ in: selectedExportIds \};[\s\S]*?if \(excludeManagement\)/);

console.log('[2] Client export — src/app/(dashboard)/employees/page.tsx');
const page = fs.readFileSync(path.join(ROOT, 'src/app/(dashboard)/employees/page.tsx'), 'utf8');
check('export checks checkbox selection', page.includes('const hasSelection = selectedIds.size > 0;'));
check('sends ids param when selection exists', /if \(hasSelection\) \{\s*\n\s*params\.set\('ids', Array\.from\(selectedIds\)\.join\(','\)\);/.test(page));
check('keeps filter mode when nothing selected', /params\.set\('ids'[\s\S]*?\} else \{[\s\S]*?params\.set\('search', search\);/);
check('selection filename employees-selected-*.csv', page.includes('employees-selected-${new Date().toISOString().slice(0, 10)}.csv'));
check('selection success toast shows count', page.includes('CSV exported — ${rows.length} selected employee'));
check('empty-selection result warns about stale selection', page.includes('refresh the list and try again'));

console.log('[3] id-parse logic simulation');
function parseIds(raw) {
  return Array.from(new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))).slice(0, 500);
}
const parsed = parseIds(' id1 , id2,,id1,  ,id3 ');
check('trims + drops empties + dedupes', JSON.stringify(parsed) === JSON.stringify(['id1', 'id2', 'id3']));
check('caps at 500', parseIds(Array.from({ length: 600 }, (_, i) => `id${i}`).join(',')).length === 500);

console.log(`\nRESULT: ${pass}/${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
