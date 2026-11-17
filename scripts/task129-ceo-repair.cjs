/**
 * Task 129 — repair the optional-chaining accidents from the CEO codemod.
 * `user?.(role === 'tenant_admin' || role === 'ceo')`  ->  `(user?.role === 'tenant_admin' || user?.role === 'ceo')`
 * Same for !== and for other member names (approverType etc.).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCopes = ['src/app', 'src/lib', 'src/components', 'src/store'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = [];
for (const s of SCopes) {
  const abs = path.join(ROOT, s);
  if (fs.existsSync(abs)) files.push(...walk(abs));
}

let fixed = 0;
const report = [];
for (const f of files) {
  if (!fs.readFileSync(f, 'utf8').includes('?.(')) continue;
  const src = fs.readFileSync(f, 'utf8');
  let out = src;
  // Only touch optional-call parens that WRAP a rewritten tenant_admin comparison.
  out = out.replace(/(\b[\w$]+)\?\.\(([\w$]+)\s*===\s*'tenant_admin'\s*\|\|\s*\2\s*===\s*'ceo'\)/g,
    '($1?.$2 === \'tenant_admin\' || $1?.$2 === \'ceo\')');
  out = out.replace(/(\b[\w$]+)\?\.\(([\w$]+)\s*!==\s*'tenant_admin'\s*&&\s*\2\s*!==\s*'ceo'\)/g,
    '($1?.$2 !== \'tenant_admin\' && $1?.$2 !== \'ceo\')');
  if (out !== src) {
    fs.writeFileSync(f, out);
    const n = src.split('\n').length;
    report.push(path.relative(ROOT, f));
    fixed += 1;
  }
}
console.log(`[ceo-repair] ${fixed} file(s) repaired:`);
for (const r of report) console.log('  ' + r);
