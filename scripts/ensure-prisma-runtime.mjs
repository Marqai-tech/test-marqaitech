import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runtimeDir = dirname(require.resolve('@prisma/client/runtime/client'));

const shims = {
  'query_compiler_fast_bg.postgresql.mjs': `import runtime from './query_compiler_fast_bg.postgresql.js';
export const QueryCompiler = runtime.QueryCompiler;
`,
  'query_compiler_fast_bg.postgresql.wasm-base64.mjs': `import runtime from './query_compiler_fast_bg.postgresql.wasm-base64.js';
export const wasm = runtime.wasm;
`,
};

for (const [file, source] of Object.entries(shims)) {
  const target = join(runtimeDir, file);
  if (!existsSync(target)) writeFileSync(target, source, 'utf8');
}

