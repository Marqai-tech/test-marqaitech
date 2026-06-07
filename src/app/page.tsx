'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, token, fetchUser } = useAuthStore();

  useEffect(() => {
    // Check for existing token in localStorage
    const savedToken = localStorage.getItem('nexus_token');

    if (savedToken && !isAuthenticated) {
      // Try to fetch user with existing token
      fetchUser().then(() => {
        const { isAuthenticated: nowAuthed } = useAuthStore.getState();
        if (nowAuthed) {
          router.replace('/home');
        } else {
          router.replace('/login');
        }
      });
    } else if (isAuthenticated) {
      router.replace('/home');
    } else if (!isLoading) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, token, fetchUser, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-nexus-background">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 mb-4 shadow-lg shadow-blue-500/25 animate-pulse-subtle">
          <svg
            className="animate-spin h-6 w-6 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <p className="text-sm text-nexus-text-secondary font-medium">
          Redirecting...
        </p>
      </div>
    </div>
  );
}
