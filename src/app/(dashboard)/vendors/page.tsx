'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FiShield, FiLoader } from 'react-icons/fi';

/**
 * /vendors — legacy route.
 *
 * BGV vendor companies are now managed in the dedicated Vendor Management
 * module (per the Preboarding & Onboarding BRD): /vendor-management/vendors.
 * This page simply redirects there.
 */
export default function LegacyVendorsRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/vendor-management/vendors'); }, [router]);
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-thb-text-secondary">
      <FiShield className="w-10 h-10 text-green-600" />
      <p className="text-sm flex items-center gap-2">Vendors moved to Vendor Management… <FiLoader className="w-4 h-4 animate-spin" /></p>
    </div>
  );
}
