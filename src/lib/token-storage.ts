/**
 * 3Boxes HRMS — Session token storage
 *
 * Default: `tb_token` lives in sessionStorage (per-tab).
 * Keep me signed in: also persist in localStorage with a 30-day JWT.
 *
 * Native localStorage methods are captured before the shim is installed so
 * remember-me cleanup never wipes the in-tab session token.
 */

const TOKEN_KEY = 'tb_token';
const REMEMBER_KEY = 'tb_remember';

let shimInstalled = false;
let originalGetItem: ((key: string) => string | null) | null = null;
let originalSetItem: ((key: string, value: string) => void) | null = null;
let originalRemoveItem: ((key: string) => void) | null = null;

function rawGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return originalGetItem ? originalGetItem(key) : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function rawSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (originalSetItem) originalSetItem(key, value);
    else window.localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

function rawRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (originalRemoveItem) originalRemoveItem(key);
    else window.localStorage.removeItem(key);
  } catch { /* ignore */ }
}

export function isRememberMe(): boolean {
  return rawGet(REMEMBER_KEY) === '1';
}

export function setRememberMe(enabled: boolean): void {
  if (enabled) {
    rawSet(REMEMBER_KEY, '1');
  } else {
    rawRemove(REMEMBER_KEY);
    rawRemove(TOKEN_KEY);
  }
}

function migrateTokenFromLocalStorage(): void {
  if (typeof window === 'undefined') return;

  const ssToken = sessionStorage.getItem(TOKEN_KEY);
  const lsToken = rawGet(TOKEN_KEY);

  if (isRememberMe()) {
    const token = ssToken || lsToken;
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      rawSet(TOKEN_KEY, token);
    }
    return;
  }

  if (ssToken) {
    rawRemove(TOKEN_KEY);
    return;
  }

  if (lsToken) {
    sessionStorage.setItem(TOKEN_KEY, lsToken);
    rawRemove(TOKEN_KEY);
  }
}

export function installTokenStorageShim(): void {
  if (typeof window === 'undefined') return;
  if (shimInstalled) return;
  shimInstalled = true;

  originalGetItem = window.localStorage.getItem.bind(window.localStorage);
  originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

  migrateTokenFromLocalStorage();

  window.localStorage.getItem = function (key: string): string | null {
    if (key === TOKEN_KEY) {
      return sessionStorage.getItem(TOKEN_KEY) || (isRememberMe() ? rawGet(TOKEN_KEY) : null);
    }
    return originalGetItem!(key);
  };

  window.localStorage.setItem = function (key: string, value: string): void {
    if (key === TOKEN_KEY) {
      sessionStorage.setItem(TOKEN_KEY, value);
      if (isRememberMe()) rawSet(TOKEN_KEY, value);
      return;
    }
    originalSetItem!(key, value);
  };

  window.localStorage.removeItem = function (key: string): void {
    if (key === TOKEN_KEY) {
      sessionStorage.removeItem(TOKEN_KEY);
      rawRemove(TOKEN_KEY);
      rawRemove(REMEMBER_KEY);
      return;
    }
    originalRemoveItem!(key);
  };
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  installTokenStorageShim();
  return sessionStorage.getItem(TOKEN_KEY) || (isRememberMe() ? rawGet(TOKEN_KEY) : null);
}

export function setToken(token: string, options?: { remember?: boolean }): void {
  if (typeof window === 'undefined') return;
  installTokenStorageShim();
  if (typeof options?.remember === 'boolean') {
    if (options.remember) {
      rawSet(REMEMBER_KEY, '1');
    } else {
      rawRemove(REMEMBER_KEY);
      rawRemove(TOKEN_KEY);
    }
  }
  sessionStorage.setItem(TOKEN_KEY, token);
  if (isRememberMe()) {
    rawSet(TOKEN_KEY, token);
  } else {
    rawRemove(TOKEN_KEY);
  }
}

export function removeToken(): void {
  if (typeof window === 'undefined') return;
  installTokenStorageShim();
  sessionStorage.removeItem(TOKEN_KEY);
  rawRemove(TOKEN_KEY);
  rawRemove(REMEMBER_KEY);
}

export function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

if (typeof window !== 'undefined') {
  installTokenStorageShim();
}
