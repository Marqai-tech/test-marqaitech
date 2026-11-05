const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { create } = require('zustand');
const source = ts.transpileModule(fs.readFileSync('src/store/authStore.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

async function check(response) {
  let finishRefresh;
  const pending = new Promise(resolve => { finishRefresh = resolve; });
  const moduleExports = {};
  const account = { id: 'platform-owner', name: 'Owner', email: 'owner@example.com', role: 'super_admin' };
  vm.runInNewContext(source, {
    exports: moduleExports, console,
    require: name => {
      if (name === 'zustand') return { create };
      if (name === '@/lib/site-mode') return { isClientLiveMode: () => false };
      if (name === '@/lib/tenant-filter') return {};
      if (name === '@/lib/token-storage') return { getToken: () => null };
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch: async url => url === '/api/auth/me' ? pending : {
      ok: true, json: async () => ({ token: 'new-login-token', user: account }),
    },
  });
  const store = moduleExports.useAuthStore;
  store.setState({ token: 'old-token', user: { id: 'previous-account', role: 'employee' }, isLoading: false });
  const refresh = store.getState().fetchUser();
  await store.getState().login('owner@example.com', 'test-password');
  finishRefresh(response);
  await refresh;
  assert.equal(store.getState().user?.role, 'super_admin', 'An old refresh must not replace the newly signed-in role');
  assert.equal(store.getState().token, 'new-login-token', 'An old refresh must not clear or replace the new session');
  assert.equal(store.getState().isAuthenticated, true);
}

(async () => {
  await check({ ok: true, json: async () => ({ id: 'previous-account', role: 'employee' }) });
  await check({ ok: false, status: 401 });
  console.log('PASS: stale user and unauthorized refreshes cannot overwrite a new super admin login');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
