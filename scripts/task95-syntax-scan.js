/**
 * Task 95 — fast syntax scan: parse every TS/TSX file with SWC to find
 * build-breaking syntax errors without a full next build.
 */
const path = require('path');
const fs = require('fs');

let swc;
try { swc = require('@swc/core'); } catch { swc = require(path.join(process.cwd(), 'node_modules', '@swc', 'core')); }

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next' && e.name !== 'generated') yield* walk(p); }
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name) && !e.name.endsWith('.d.ts')) yield p;
  }
}

let files = 0, bad = 0;
const root = path.join(process.cwd(), 'src');
for (const f of walk(root)) {
  files++;
  try {
    const isTsx = f.endsWith('.tsx');
    swc.parseSync(fs.readFileSync(f, 'utf8'), { syntax: isTsx ? 'typescript' : 'typescript', tsx: isTsx, decorators: true });
  } catch (e) {
    bad++;
    console.log(`SYNTAX ERROR: ${f}\n  ${String(e.message).split('\n').slice(0, 4).join('\n  ')}`);
  }
}
console.log(`\nparsed ${files} files, ${bad} with syntax errors`);
