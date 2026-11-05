#!/usr/bin/env node
/**
 * Task 157 rebase helper — resolve the three keep-both conflicts in
 * src/app/(dashboard)/attendance/regularize/page.tsx by concatenating the
 * HEAD (Task 161) block and the incoming (Task 157) block, in order.
 */
const fs = require('fs');
const FILE = 'src/app/(dashboard)/attendance/regularize/page.tsx';
let src = fs.readFileSync(FILE, 'utf8');

const re = /<<<<<<< HEAD\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> [^\n]*\n/g;
let count = 0;
src = src.replace(re, (_m, head, ours) => {
  count++;
  return `${head}\n${ours}\n`;
});
fs.writeFileSync(FILE, src);
console.log(`resolved ${count} conflict(s) — keep-both applied`);
