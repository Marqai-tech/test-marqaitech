/**
 * useAutoSeedDemo — silently triggers /api/auto-seed-demo on mount if demo
 * data is missing, then calls onSeeded() so the page can re-fetch.
 *
 * Use case: Vercel deployments need demo data to appear on the marketplace,
 * wellness, and collaboration hub pages without an admin clicking a button.
 *
 * Behaviour:
 *  - Only runs once per page mount (guarded by a module-scoped session flag)
 *  - Uses sessionStorage to avoid re-running across same-session navigation
 *  - Silent: never throws, never shows errors to the user
 *  - Returns { seeded, error } so callers can optionally react
 */
import { useEffect, useState } from 'react';

type Module = 'marketplace' | 'wellness' | 'collaboration' | 'clients' | 'vendors' | 'all';

const sessionCache: Record<string, boolean> = {};

export function useAutoSeedDemo(module: Module, onSeeded?: () => void) {
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cacheKey = `auto-seed-${module}`;
    if (sessionCache[cacheKey]) return;

    // Also check sessionStorage so we don't re-trigger within the same tab session
    try {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem(cacheKey) === 'done') {
        sessionCache[cacheKey] = true;
        return;
      }
    } catch {}

    // NOTE: authStore persists the JWT under the `tb_token` localStorage key
    // (see src/store/authStore.ts). The bare `token` key is never set, so reading
    // it returns null and the API responds with "No token provided" — that's the
    // bug we're fixing here.
    const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
    if (!token) return; // not logged in yet — page-level guard will handle redirect

    let cancelled = false;

    (async () => {
      try {
        const r = await fetch(`/api/auto-seed-demo?module=${module}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) {
          if (!cancelled) setError(`HTTP ${r.status}`);
          return;
        }
        const json = await r.json();
        if (cancelled) return;

        // Mark as done in both in-memory cache and sessionStorage
        sessionCache[cacheKey] = true;
        try { window.sessionStorage.setItem(cacheKey, 'done'); } catch {}

        // Only mark seeded if we actually wrote rows
        const resultKeys = Object.keys(json.results || {});
        if (resultKeys.length > 0) {
          setSeeded(true);
          onSeeded?.();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Network error');
      }
    })();

    return () => { cancelled = true; };
  }, [module]);

  return { seeded, error };
}
