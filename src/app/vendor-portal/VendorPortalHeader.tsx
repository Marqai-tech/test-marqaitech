'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { FiArrowLeft, FiGrid, FiLogOut, FiShield, FiUser, FiUsers } from 'react-icons/fi';
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
    <header className="bg-[#0b1f3a] text-white border-b border-white/10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="min-h-16 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-white/10">
          <button onClick={() => router.push('/vendor-portal/dashboard')} className="flex items-center gap-3 text-left">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-950/30"><FiShield className="h-5 w-5" /></span>
            <span><span className="block text-lg font-extrabold tracking-tight">3Boxes HRMS</span><span className="block text-[11px] text-slate-300">Vendor BGV Portal</span></span>
          </button>
          <nav aria-label="Vendor portal navigation" className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <button onClick={() => router.push('/vendor-portal/dashboard')} className="px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg inline-flex items-center justify-center gap-2"><FiGrid /> Dashboard</button>
            {isAdmin && <button onClick={() => router.push('/vendor-portal/team')} className="px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg inline-flex items-center justify-center gap-2"><FiUsers /> Team</button>}
            <button onClick={() => router.push('/vendor-portal/profile')} className="px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg inline-flex items-center justify-center gap-2"><FiUser /> My Profile</button>
            <span className="px-3 py-2 bg-white/10 rounded-lg inline-flex items-center justify-center"><VendorPortalBell /></span>
            <button onClick={logout} className="px-3 py-2 text-sm bg-white/10 hover:bg-red-500/30 rounded-lg inline-flex items-center justify-center gap-2 sm:col-auto col-span-2"><FiLogOut /> Logout</button>
          </nav>
        </div>
        <div className="py-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="min-w-0">
            {(backHref || backToPrevious) && (
              <button onClick={() => backToPrevious ? router.back() : router.push(backHref!)} className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white">
                <FiArrowLeft /> {backLabel || 'Back'}
              </button>
            )}
            <h1 className="text-xl sm:text-2xl font-bold break-words">{title}</h1>
            {subtitle && <p className="text-slate-300 mt-1 text-sm max-w-3xl">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
