const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const storageSource = ts.transpileModule(fs.readFileSync('src/lib/token-storage.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const authSource = ts.transpileModule(fs.readFileSync('src/lib/auth.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function makeStorage(values = new Map()) {
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    values,
  };
}

function makeTab(sharedValues, sessionStorage) {
  const localStorage = makeStorage(sharedValues);
  const requests = [];
  const nativeFetch = async (input, init) => {
    requests.push({ input, headers: new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)) });
    return new Response('{}');
  };
  const window = {
    localStorage,
    sessionStorage,
    location: { origin: 'https://test.3boxeshrms.com', href: 'https://test.3boxeshrms.com/home' },
    fetch: nativeFetch,
  };
  const exports = {};
  vm.runInNewContext(storageSource, {
    exports, window, sessionStorage, URL, Request, Headers, Response,
  });
  return { storage: exports, requests, window };
}

async function main() {
  const sharedLocalStorage = new Map([['tb_token', 'legacy-admin-token'], ['tb_remember', '1']]);
  const adminSessionStorage = makeStorage();
  const employeeSessionStorage = makeStorage();
  const adminTab = makeTab(sharedLocalStorage, adminSessionStorage);
  const employeeTab = makeTab(sharedLocalStorage, employeeSessionStorage);

  adminTab.storage.setToken('super-admin-token', { remember: true });
  employeeTab.storage.setToken('employee-token', { remember: true });

  assert.equal(adminTab.storage.getToken(), 'super-admin-token');
  assert.equal(employeeTab.storage.getToken(), 'employee-token');
  assert.equal(sharedLocalStorage.has('tb_token'), false, 'auth tokens must never be stored in shared localStorage');

  await adminTab.window.fetch('/api/auth/me', { credentials: 'include' });
  await employeeTab.window.fetch('/api/auth/me', { credentials: 'include' });
  assert.equal(adminTab.requests[0].headers.get('authorization'), 'Bearer super-admin-token');
  assert.equal(employeeTab.requests[0].headers.get('authorization'), 'Bearer employee-token');

  const reloadedEmployeeTab = makeTab(sharedLocalStorage, employeeSessionStorage);
  assert.equal(reloadedEmployeeTab.storage.getToken(), 'employee-token', 'refresh must preserve this tab’s employee session');
  await reloadedEmployeeTab.window.fetch('/api/auth/me', { credentials: 'include' });
  assert.equal(reloadedEmployeeTab.requests[0].headers.get('authorization'), 'Bearer employee-token');

  await employeeTab.window.fetch('/api/auth/login', { method: 'POST' });
  assert.equal(employeeTab.requests[1].headers.has('authorization'), false, 'login must not inherit the previous tab identity');

  const authExports = {};
  vm.runInNewContext(authSource, {
    exports: authExports,
    process: { env: {} },
    require: name => name === 'bcryptjs'
      ? { __esModule: true, default: {} }
      : name === 'jose'
        ? { SignJWT: class {}, jwtVerify: async () => ({ payload: {} }) }
        : (() => { throw new Error(`Unexpected import: ${name}`); })(),
    TextEncoder,
  });
  assert.equal(
    authExports.getTokenFromHeaders(new Request('https://test.3boxeshrms.com/api/auth/me', { headers: { Cookie: 'tb_token=super-admin-token' } })),
    null,
    'server authentication must ignore the shared browser cookie',
  );
  assert.equal(
    authExports.getTokenFromHeaders(new Request('https://test.3boxeshrms.com/api/auth/me', { headers: { Authorization: 'Bearer employee-token', Cookie: 'tb_token=super-admin-token' } })),
    'employee-token',
    'the tab Bearer token must be authoritative when a legacy cookie is present',
  );

  console.log('PASS: admin and employee tabs retain separate tokens through API calls and refresh');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
