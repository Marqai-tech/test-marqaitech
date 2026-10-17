'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { isRememberMe } from '@/lib/token-storage';

// Default idle timeout (no remember-me): 30 minutes.
// When "Keep me signed in for 30 days" is selected, we still want SOME idle
// protection on shared devices, but the user explicitly opted into long-lived
// sessions — so we extend the idle window to 7 days. The 30-day JWT itself is
// the real trust boundary; this idle timer is just a UX safeguard.
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 25 * 60 * 1000; // 25 minutes (5 min before timeout)
const REMEMBER_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REMEMBER_WARNING_MS = REMEMBER_TIMEOUT_MS - 5 * 60 * 1000;

/**
 * useSessionTimeout
 *
 * Tracks user activity and redirects to the lock screen after the configured
 * idle period. Dispatches a 'session-warning' custom event 5 minutes before
 * timeout so the UI can show a toast or modal. Resets on mouse move, key
 * press, scroll, or touch.
 *
 * BUG_001 / BUG_002 fix: when the user selected "Keep me signed in for 30
 * days" (remember-me), the idle timeout is extended to 7 days so the user
 * is not asked to log in again after 5–30 minutes — matching the checkbox
 * promise. The 30-day JWT remains the authoritative session lifetime.
 */
export function useSessionTimeout() {
  const router = useRouter();
  const { user } = useAuthStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const warnedRef = useRef(false);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    warnedRef.current = false;

    if (!user) return; // Don't start timer if not logged in

    const remembered = isRememberMe();
    const timeoutMs = remembered ? REMEMBER_TIMEOUT_MS : TIMEOUT_MS;
    const warningMs = remembered ? REMEMBER_WARNING_MS : WARNING_MS;

    // Warning (5 min before timeout)
    warningRef.current = setTimeout(() => {
      warnedRef.current = true;
      window.dispatchEvent(new CustomEvent('session-warning'));
    }, warningMs);

    // Redirect at timeout
    timerRef.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('session-timeout'));
      router.push('/lock-screen');
    }, timeoutMs);
  }, [user, router]);

  useEffect(() => {
    if (!user) return;

    resetTimer();

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => resetTimer();

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [user, resetTimer]);
}
