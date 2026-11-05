'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { isRememberMe } from '@/lib/token-storage';

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 25 * 60 * 1000; // 25 minutes (5 min before timeout)

/**
 * useSessionTimeout
 *
 * Tracks user activity and redirects to the lock screen after 30 minutes
 * of inactivity. Dispatches a 'session-warning' custom event at 25 minutes
 * so the UI can show a toast or modal. Resets on mouse move, key press,
 * scroll, or touch.
 *
 * Task 137 — REMEMBER-ME FIX: sessions signed in with "Keep me signed in
 * for 30 days in this tab" are EXEMPT from the idle lock. The checkbox
 * previously had no effect on this timer, so users were bounced to the
 * lock screen after 30 idle minutes even though they had asked to stay
 * signed in — the exact "keep me signed in is not working" complaint.
 * The server JWT still enforces its own 30-day expiry.
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
    if (isRememberMe()) return; // Remember-me sessions are exempt from the idle lock

    // Warning at 25 min
    warningRef.current = setTimeout(() => {
      warnedRef.current = true;
      window.dispatchEvent(new CustomEvent('session-warning'));
    }, WARNING_MS);

    // Redirect at 30 min
    timerRef.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('session-timeout'));
      router.push('/lock-screen');
    }, TIMEOUT_MS);
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
