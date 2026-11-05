'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function Redirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/leave'); }, [router]);
  return <div className="flex items-center justify-center min-h-[40vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" /></div>;
}
