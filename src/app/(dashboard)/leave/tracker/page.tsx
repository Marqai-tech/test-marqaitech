'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /leave/tracker — REDIRECTED to /leave
 *
 * The tracker UI is now embedded INSIDE the Leave Dashboard's "My Leave" tab
 * (see /leave/page.tsx → <LeaveRequestTracker />). This route simply redirects
 * there so any old links/bookmarks keep working.
 *
 * Component: src/components/LeaveRequestTracker.tsx
 */
export default function LeaveTrackerRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/leave');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4" />
        <p className="text-sm text-thb-text-secondary">Opening Leave Dashboard…</p>
      </div>
    </div>
  );
}
