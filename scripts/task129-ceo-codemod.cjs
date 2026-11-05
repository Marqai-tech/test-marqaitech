/**
 * Task 129 — CEO role sweep: give the new 'ceo' role the SAME access rights
 * as 'tenant_admin' everywhere in src/ (API guards, lib helpers, page-level
 * arrays). Mechanical, line-based, idempotent.
 *
 * Rules (per line):
 *   A  skip assignment/creation lines  (role: 'tenant_admin' / role = 'tenant_admin')
 *   1  X === 'tenant_admin'   -> (X === 'tenant_admin' || X === 'ceo')
 *   2  X !== 'tenant_admin'   -> (X !== 'tenant_admin' && X !== 'ceo')
 *   3  'tenant_admin' inside a bracketed array on the line -> 'tenant_admin', 'ceo'
 *   4  case 'tenant_admin':   -> case 'tenant_admin': case 'ceo':
 *
 * Excludes: super-admin API, trial provisioning, generated client, seeds.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCopes = ['src/app', 'src/lib', 'src/components', 'src/store'];
const EXCLUDES = [
  path.join('src', 'app', 'api', 'super-admin'),
  path.join('src', 'app', 'api', 'trial'),
  path.join('src', 'app', 'api', 'auth', 'register'),
  path.join('src', 'generated'),
];

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
const targets = files.filter((f) => {
  const rel = path.relative(ROOT, f);
  return !EXCLUDES.some((x) => rel.startsWith(x)) && fs.readFileSync(f, 'utf8').includes('tenant_admin');
});

let totalLines = 0;
const report = [];
for (const f of targets) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  let changed = 0;
  const outLines = lines.map((line) => {
    if (!line.includes("'tenant_admin'")) return line;
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return line;
    // Rule A — object/assignment creation of tenant_admin users stays untouched
    if (/(?:\w+)\s*:\s*'tenant_admin'(?![\w'])/.test(line) && !/\[/.test(line.split(':')[0])) {
      // object value like `role: 'tenant_admin'` — BUT `roles: ['tenant_admin'...]` has a bracket
      if (!/\[\s*'tenant_admin'/.test(line) && !/'tenant_admin'[\s,]*\]/.test(line)) return line;
    }
    if (/(?:role|Role|defaultRole|empRole|newRole)\s*=\s*'tenant_admin'(?![\w'])/.test(line)) return line;
    let out = line;
    // Rule 4 — switch cases
    out = out.replace(/case\s+'tenant_admin'\s*:/g, "case 'tenant_admin': case 'ceo':");
    // Rules 1 & 2 — equality / inequality (parenthesized to preserve ternary/if precedence)
    out = out.replace(/([\w$][\w$.]*)\s*===\s*'tenant_admin'/g, "($1 === 'tenant_admin' || $1 === 'ceo')");
    out = out.replace(/([\w$][\w$.]*)\s*!==\s*'tenant_admin'/g, "($1 !== 'tenant_admin' && $1 !== 'ceo')");
    // Rule 3 — array members (skip occurrences already rewritten by rules 1/2/4)
    if (out.includes('[') && out.includes(']')) {
      out = out.replace(/(?<!===\s)(?<!!==\s)(?<!case\s)'tenant_admin'(?!['\w])/g, "'tenant_admin', 'ceo'");
    }
    // dedupe accidental repeats
    out = out.replace(/'ceo'(\s*,\s*'ceo')+/g, "'ceo'");
    out = out.replace(/\|\|\s*([\w$][\w$.]*)\s*===\s*'ceo'(\s*\|\|\s*\1\s*===\s*'ceo')+/g, "|| $1 === 'ceo'");
    if (out !== line) changed += 1;
    return out;
  });
  if (changed > 0) {
    fs.writeFileSync(f, outLines.join('\n'));
    report.push(`${path.relative(ROOT, f)}: ${changed} line(s)`);
    totalLines += changed;
  }
}
console.log(`[ceo-codemod] ${report.length} file(s) changed, ${totalLines} line(s):`);
for (const r of report) console.log('  ' + r);
