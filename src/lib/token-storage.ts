/**
 * 3Boxes HRMS — Session token storage
 *
 * `tb_token` lives in sessionStorage (per-tab) by default. With remember-me,
 * the token is additionally backed up in real localStorage (bypassing the
 * per-tab shim) so the session restores after the tab is closed or the
 * browser restarts — the server JWT carries the 30-day expiry, no secrets
 * beyond the token itself are ever stored.
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
let fetchShimInstalled = false;

function rawGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    if (originalGetItem) return originalGetItem(key);
    return window.localStorage.getItem(key);
  } catch { return null; }
}

function rawRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (originalRemoveItem) originalRemoveItem(key);
    else window.localStorage.removeItem(key);
  } catch { /* ignore */ }
}

export function isRememberMe(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.sessionStorage.getItem(REMEMBER_KEY) === '1'; } catch { return false; }
}

export function setRememberMe(enabled: boolean): void {
  if (enabled) {
    try { window.sessionStorage.setItem(REMEMBER_KEY, '1'); } catch { /* ignore */ }
  } else {
    try {
      window.sessionStorage.removeItem(REMEMBER_KEY);
      window.sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore */ }
  }
}

export function installTokenStorageShim(): void {
  if (typeof window === 'undefined') return;
  if (shimInstalled) return;
  shimInstalled = true;

  originalGetItem = window.localStorage.getItem.bind(window.localStorage);
  originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

  window.localStorage.getItem = function (key: string): string | null {
    if (key === TOKEN_KEY) {
      return sessionStorage.getItem(TOKEN_KEY);
    }
    return originalGetItem!(key);
  };

  window.localStorage.setItem = function (key: string, value: string): void {
    if (key === TOKEN_KEY) {
      sessionStorage.setItem(TOKEN_KEY, value);
      return;
    }
    originalSetItem!(key, value);
  };

  window.localStorage.removeItem = function (key: string): void {
    if (key === TOKEN_KEY) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(REMEMBER_KEY);
      return;
    }
    originalRemoveItem!(key);
  };
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  installTokenStorageShim();
  try {
    const session = window.sessionStorage.getItem(TOKEN_KEY);
    if (session) return session;
    // Remember-me sessions survive tab close / browser restart: the token is
    // backed up in real localStorage (bypassing the per-tab shim) while
    // remember-me is active. The server JWT itself carries the 30-day expiry.
    if (rawGet(REMEMBER_KEY) === '1') return rawGet(TOKEN_KEY);
    return null;
  } catch { return null;
  }
}

export function setToken(token: string, options?: { remember?: boolean }): void {
  if (typeof window === 'undefined') return;
  installTokenStorageShim();
  if (typeof options?.remember === 'boolean') {
    if (options.remember) {
      try { window.sessionStorage.setItem(REMEMBER_KEY, '1'); } catch { /* ignore */ }
      // Durable backup in REAL localStorage (shim bypassed via captured
      // originals) so the session restores after the tab is closed.
      try {
        if (originalSetItem) {
          originalSetItem(TOKEN_KEY, token);
          originalSetItem(REMEMBER_KEY, '1');
        }
      } catch { /* ignore */ }
    } else {
      try {
        window.sessionStorage.removeItem(REMEMBER_KEY);
        rawRemove(TOKEN_KEY);
        rawRemove(REMEMBER_KEY);
      } catch { /* ignore */ }
    }
  }
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  if (typeof window === 'undefined') return;
  installTokenStorageShim();
  sessionStorage.removeItem(TOKEN_KEY);
  rawRemove(TOKEN_KEY);
  rawRemove(REMEMBER_KEY);
}

/** Attach this tab's token to protected API calls that omit an auth header. */
function installPerTabAuthFetchShim(): void {
  if (typeof window === 'undefined' || fetchShimInstalled) return;
  fetchShimInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const requestUrl = input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : String(input);
      const url = new URL(requestUrl, window.location.href);
      const isSameOriginApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');
      const isPublicAuthRoute =
        url.pathname === '/api/auth/login' ||
        url.pathname === '/api/auth/register' ||
        url.pathname.startsWith('/api/auth/forgot-password') ||
        url.pathname.startsWith('/api/auth/reset-password') ||
        url.pathname.startsWith('/api/auth/tenant-lookup') ||
        url.pathname.startsWith('/api/candidate-portal/auth/') ||
        url.pathname.startsWith('/api/client-portal/auth/') ||
        url.pathname.startsWith('/api/public/');

      if (isSameOriginApi && !isPublicAuthRoute) {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        const token = getToken();
        if (token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
          return nativeFetch(input, { ...init, headers });
        }
      }
    } catch {
      // Preserve native fetch behavior if URL/header normalization fails.
    }
    return nativeFetch(input, init);
  }) as typeof window.fetch;
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
  installPerTabAuthFetchShim();
}
