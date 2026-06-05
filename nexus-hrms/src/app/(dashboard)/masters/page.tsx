'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MastersRedirectPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/company-management');
  }, [router]);
  
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <p className="text-nexus-text-secondary">Redirecting to Company Management...</p>
        <p className="text-sm text-nexus-text-muted mt-1">All masters are now managed within the Company module</p>
      </div>
    </div>
  );
}
