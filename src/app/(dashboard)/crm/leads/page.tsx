'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const MODULE_MAP: Record<string, string> = {
  crm: '/crm',
  'it-admin': '/it-admin',
  'project-management': '/project-management',
};

export default function SubModuleRedirect() {
  const router = useRouter();
  useEffect(() => {
    const path = window.location.pathname;
    const moduleKey = path.split('/').find(seg => MODULE_MAP[seg]) || '';
    const target = MODULE_MAP[moduleKey] || '/home';
    router.replace(target);
  }, [router]);
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-thb-text-muted">Redirecting...</p>
    </div>
  );
}
