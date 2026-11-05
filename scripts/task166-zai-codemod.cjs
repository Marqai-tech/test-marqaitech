#!/usr/bin/env node
/* Task 166 codemod — replace file-config-only `ZAI.create()` with the env-aware
 * central helper `getZAI()` from '@/lib/zai', inserting a null-guard so routes
 * fall back cleanly when no AI configuration exists (the production bug). */
const fs = require('fs');
const path = require('path');

const files = [
  'src/lib/resume-parser.ts',
  'src/lib/candidate-resume-optimizer.ts',
  'src/app/api/recruitment-ai/route.ts',
  'src/app/api/collaboration/chat/translate/route.ts',
  'src/app/api/collaboration/chat/summarize/route.ts',
  'src/app/api/recruitment/ai-feedback/route.ts',
  'src/app/api/performance-ai/route.ts',
  'src/app/api/training-ai/route.ts',
  'src/app/api/ats/sentiment/route.ts',
  'src/app/api/ai-interview/sessions/[id]/route.ts',
  'src/app/api/ai-interview/sets/route.ts',
  'src/app/api/ai-interview/evaluate/route.ts',
  'src/app/api/ai-interview/chat/route.ts',
  'src/app/api/ai-emp/knowledge/route.ts',
  'src/app/api/ai-emp/document-intelligence/route.ts',
];

const ROOT = '/home/z/my-project/3-Boxes-HRMS';
let changed = 0;
for (const rel of files) {
  const p = path.join(ROOT, rel);
  let src = fs.readFileSync(p, 'utf8');
  const before = src;

  // 1) replace the SDK import with the helper import (keep type-only imports if any)
  if (/import ZAI from 'z-ai-web-dev-sdk';/.test(src)) {
    src = src.replace(/import ZAI from 'z-ai-web-dev-sdk';/, "import { getZAI } from '@/lib/zai';");
  } else if (!src.includes("@/lib/zai")) {
    // no SDK import line found; add helper import after the last import line
    const lines = src.split('\n');
    let lastImport = -1;
    lines.forEach((l, i) => { if (/^import /.test(l)) lastImport = i; });
    lines.splice(lastImport + 1, 0, "import { getZAI } from '@/lib/zai';");
    src = lines.join('\n');
  }

  // 2) replace call sites with null-guarded helper calls (preserve indentation)
  src = src.replace(
    /^(\s*)const (\w+) = await ZAI\.create\(\);?/gm,
    (_m, ws, varName) =>
      `${ws}const ${varName} = await getZAI();\n${ws}if (!${varName}) throw new Error('AI not configured');`
  );

  if (src !== before) {
    fs.writeFileSync(p, src, 'utf8');
    changed++;
    console.log('patched', rel);
  } else {
    console.log('NO CHANGE', rel);
  }
}
console.log('files changed:', changed);
