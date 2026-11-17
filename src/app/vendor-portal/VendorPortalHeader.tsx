'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { FiArrowLeft, FiGrid, FiLogOut, FiUser, FiUsers } from 'react-icons/fi';
import VendorPortalBell from './VendorPortalBell';

type Props = {
  title: string;
  subtitle?: string;
  isAdmin?: boolean;
  backLabel?: string;
  backHref?: string;
  backToPrevious?: boolean;
  children?: ReactNode;
};

export default function VendorPortalHeader({ title, subtitle, isAdmin, backLabel, backHref, backToPrevious, children }: Props) {
  const router = useRouter();
  const logout = () => {
    localStorage.removeItem('tb_token');
    localStorage.removeItem('tb_user');
    router.push('/login?mode=vendor');
  };

  return (
    <header className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            {(backHref || backToPrevious) && (
              <button onClick={() => backToPrevious ? router.back() : router.push(backHref!)} className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white">
                <FiArrowLeft /> {backLabel || 'Back'}
              </button>
            )}
            <h1 className="text-xl sm:text-2xl font-bold break-words">{title}</h1>
            {subtitle && <p className="text-slate-300 mt-1 text-sm max-w-3xl">{subtitle}</p>}
          </div>
          <nav aria-label="Vendor portal navigation" className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <button onClick={() => router.push('/vendor-portal/dashboard')} className="px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg inline-flex items-center justify-center gap-2"><FiGrid /> Dashboard</button>
            {isAdmin && <button onClick={() => router.push('/vendor-portal/team')} className="px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg inline-flex items-center justify-center gap-2"><FiUsers /> Team</button>}
            <button onClick={() => router.push('/vendor-portal/profile')} className="px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg inline-flex items-center justify-center gap-2"><FiUser /> My Profile</button>
            <span className="px-3 py-2 bg-white/10 rounded-lg inline-flex items-center justify-center"><VendorPortalBell /></span>
            <button onClick={logout} className="px-3 py-2 text-sm bg-white/10 hover:bg-red-500/30 rounded-lg inline-flex items-center justify-center gap-2 sm:col-auto col-span-2"><FiLogOut /> Logout</button>
          </nav>
        </div>
        {children}
      </div>
    </header>
  );
}
