'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
export default function Redirect() {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    const tab = sp.get('tab');
    router.replace(tab === 'mapping' ? '/leave/configuration' : '/leave/configuration');
  }, [router, sp]);
  return <div className="flex items-center justify-center min-h-[40vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" /></div>;
}
