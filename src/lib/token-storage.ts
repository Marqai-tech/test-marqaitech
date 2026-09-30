/**
 * 3Boxes HRMS — Session token storage
 *
 * Default: `tb_token` lives in sessionStorage (per-tab). Closing the tab
 * or browser ends the session. This prevents two tabs from silently
 * swapping accounts via shared localStorage.
 *
 * Keep me signed in: persist `tb_token` in localStorage plus a 30-day JWT
 * so the user stays signed in after closing the browser, until logout or
 * expiry.
 */

const TOKEN_KEY = 'tb_token';
const REMEMBER_KEY = 'tb_remember';

let shimInstalled = false;

function nativeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function isRememberMe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return nativeLocalStorage()?.getItem(REMEMBER_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRememberMe(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  const ls = nativeLocalStorage();
  if (!ls) return;
  if (enabled) {
    ls.setItem(REMEMBER_KEY, '1');
  } else {
    ls.removeItem(REMEMBER_KEY);
    ls.removeItem(TOKEN_KEY);
  }
}

function migrateTokenFromLocalStorage(): void {
  if (typeof window === 'undefined') return;

  const ssToken = sessionStorage.getItem(TOKEN_KEY);
  const ls = nativeLocalStorage();
  const lsToken = ls?.getItem(TOKEN_KEY) ?? null;

  if (isRememberMe()) {
    const token = ssToken || lsToken;
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      ls?.setItem(TOKEN_KEY, token);
    }
    return;
  }

  if (ssToken) {
    ls?.removeItem(TOKEN_KEY);
    return;
  }

  if (lsToken) {
    sessionStorage.setItem(TOKEN_KEY, lsToken);
    ls?.removeItem(TOKEN_KEY);
  }
}

export function installTokenStorageShim(): void {
  if (typeof window === 'undefined') return;
  if (shimInstalled) return;
  shimInstalled = true;

  migrateTokenFromLocalStorage();

  const originalGetItem = localStorage.getItem.bind(localStorage);
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);

  localStorage.getItem = function (key: string): string | null {
    if (key === TOKEN_KEY) {
      return sessionStorage.getItem(TOKEN_KEY) || (isRememberMe() ? originalGetItem(TOKEN_KEY) : null);
    }
    return originalGetItem(key);
  };

  localStorage.setItem = function (key: string, value: string): void {
    if (key === TOKEN_KEY) {
      sessionStorage.setItem(TOKEN_KEY, value);
      if (isRememberMe()) {
        originalSetItem(TOKEN_KEY, value);
      }
      return;
    }
    originalSetItem(key, value);
  };

  localStorage.removeItem = function (key: string): void {
    if (key === TOKEN_KEY) {
      sessionStorage.removeItem(TOKEN_KEY);
      originalRemoveItem(TOKEN_KEY);
      originalRemoveItem(REMEMBER_KEY);
      return;
    }
    originalRemoveItem(key);
  };

  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === TOKEN_KEY && !isRememberMe()) {
      return;
    }
  });
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  installTokenStorageShim();
  return sessionStorage.getItem(TOKEN_KEY) || (isRememberMe() ? nativeLocalStorage()?.getItem(TOKEN_KEY) ?? null : null);
}

export function setToken(token: string, options?: { remember?: boolean }): void {
  if (typeof window === 'undefined') return;
  installTokenStorageShim();
  if (typeof options?.remember === 'boolean') {
    setRememberMe(options.remember);
  }
  sessionStorage.setItem(TOKEN_KEY, token);
  if (isRememberMe()) {
    nativeLocalStorage()?.setItem(TOKEN_KEY, token);
  } else {
    nativeLocalStorage()?.removeItem(TOKEN_KEY);
  }
}

export function removeToken(): void {
  if (typeof window === 'undefined') return;
  installTokenStorageShim();
  sessionStorage.removeItem(TOKEN_KEY);
  nativeLocalStorage()?.removeItem(TOKEN_KEY);
  nativeLocalStorage()?.removeItem(REMEMBER_KEY);
}

if (typeof window !== 'undefined') {
  installTokenStorageShim();
}
