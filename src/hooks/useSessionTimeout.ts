'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * useSessionTimeout
 *
 * SRS REQ-SEC-08: "Automatic logout after 15 minutes of inactivity for Admin roles."
 *
 * Tracks user activity (mousemove, keypress, click, scroll, touchstart) and
 * automatically logs the user out after `timeoutMs` of inactivity. Only
 * active for admin roles (super_admin, tenant_admin, hr_admin, finance,
 * it_admin, manager, recruiter) — employees are exempted because they may
 * leave the page open for legitimate long periods.
 *
 * - Shows a 60-second warning before the actual logout (toast).
 * - Calls /api/auth/logout, then redirects to /login.
 * - Reset on any user activity.
 *
 * Usage:
 *   useSessionTimeout({ role: user?.role, timeoutMs: 15 * 60 * 1000 });
 */
export function useSessionTimeout(opts: {
  role?: string | null;
  timeoutMs?: number;        // total inactivity before logout (default 15 min)
  warningMs?: number;        // how long before timeout to show warning (default 60s)
  enabled?: boolean;         // master switch (default: true for admins)
}) {
  const router = useRouter();
  const {
    role,
    timeoutMs = 15 * 60 * 1000, // 15 minutes per SRS
    warningMs = 60 * 1000,       // warn 60s before
    enabled = true,
  } = opts;

  const lastActivityRef = useRef<number | null>(null);
  const warnedRef = useRef<boolean>(false);
  const warnedAtRef = useRef<number | null>(null);

  // Only enforce for admin roles per SRS §7.4 (Admin roles).
  const isAdmin = !!role && [
    'super_admin', 'tenant_admin', 'hr_admin',
    'manager', 'recruiter', 'finance', 'it_admin',
  ].includes(role);

  useEffect(() => {
    if (!enabled || !isAdmin) return;

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    // Initialize on first effect run (lazy — useRef can't take Date.now() inline
    // because that's flagged as impure by the React hooks lint rule).
    if (lastActivityRef.current === null) {
      lastActivityRef.current = Date.now();
    }

    const reset = () => {
      lastActivityRef.current = Date.now();
      if (warnedRef.current) {
        warnedRef.current = false;
        warnedAtRef.current = null;
      }
    };

    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    const interval = window.setInterval(() => {
      // lastActivityRef is initialized at the top of this effect, so it's
      // always non-null by the time the interval fires.
      const last = lastActivityRef.current;
      if (last === null) return;
      const now = Date.now();
      const idleFor = now - last;
      const remaining = timeoutMs - idleFor;

      if (!warnedRef.current && remaining <= warningMs && remaining > 0) {
        warnedRef.current = true;
        warnedAtRef.current = now;
        // Lightweight in-page warning (no toast lib dep here to avoid circular import)
        console.warn(
          `[session] Auto-logout in ${Math.ceil(remaining / 1000)}s due to inactivity.`,
        );
      }

      if (idleFor >= timeoutMs) {
        // Stop the interval so we don't fire twice.
        window.clearInterval(interval);
        events.forEach((e) => window.removeEventListener(e, reset));

        // Best-effort logout call. The /api/auth/logout endpoint just records
        // lastLogout + LoginActivity; clearing the token happens client-side.
        const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
        if (token) {
          fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => {});
        }
        if (typeof window !== 'undefined') {
          localStorage.removeItem('tb_token');
          localStorage.removeItem('tb_user');
        }
        // Brief on-screen message so the user understands why they're being bounced.
        if (typeof document !== 'undefined') {
          const banner = document.createElement('div');
          banner.textContent =
            'You have been automatically logged out after 15 minutes of inactivity.';
          banner.style.cssText =
            'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
            'background:rgba(15,23,42,0.92);color:#fff;font-family:system-ui,sans-serif;' +
            'font-size:16px;z-index:9999;padding:24px;text-align:center;';
          document.body.appendChild(banner);
        }
        // Redirect after a short pause so the user sees the message.
        window.setTimeout(() => {
          router.replace('/login?reason=session_timeout');
        }, 1500);
      }
    }, 5000); // check every 5s — cheap and responsive

    return () => {
      window.clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [enabled, isAdmin, timeoutMs, warningMs, router]);
}
