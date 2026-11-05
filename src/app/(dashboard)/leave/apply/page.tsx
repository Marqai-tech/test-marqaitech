'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Apply Leave page — redirects to /leave with ?action=apply so the leave
 * dashboard auto-opens the inline Apply Leave form. Task 66: previously
 * this just redirected to /leave (no form auto-open), which confused users
 * who expected a dedicated apply page.
 */
export default function ApplyLeavePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/leave?action=apply');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4" />
        <p className="text-sm text-thb-text-secondary">Opening Apply Leave form…</p>
      </div>
    </div>
  );
}
