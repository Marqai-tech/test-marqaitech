'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { FiArrowLeft, FiGrid, FiLogOut, FiShield, FiUser, FiUsers, FiBriefcase } from 'react-icons/fi';
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
  const pathname = usePathname();
  const navClass = (active: boolean) => `px-3.5 py-2.5 text-sm rounded-xl inline-flex items-center justify-center gap-2 transition ${active ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'font-medium text-slate-100 hover:bg-white/10'}`;
  const logout = () => {
    localStorage.removeItem('tb_token');
    localStorage.removeItem('tb_user');
    router.push('/login?mode=vendor');
  };

  return (
    <header className="relative overflow-hidden bg-gradient-to-br from-[#08182d] via-[#102743] to-[#123a4a] text-white shadow-xl shadow-slate-900/10">
      <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="relative mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8">
        <div className="min-h-20 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-white/10">
          <button onClick={() => router.push('/vendor-portal/dashboard')} className="flex items-center gap-3 text-left">
            <span className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-950/30 ring-1 ring-white/20"><FiShield className="h-5 w-5" /></span>
            <span><span className="block text-lg font-extrabold tracking-tight">3Boxes HRMS</span><span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-teal-100/80">Vendor BGV Portal</span></span>
          </button>
          <nav aria-label="Vendor portal navigation" className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-1.5 backdrop-blur-md">
            <button onClick={() => router.push('/vendor-portal/dashboard')} className={navClass(pathname === '/vendor-portal/dashboard' || pathname.startsWith('/vendor-portal/requests'))}><FiGrid /> Dashboard</button>
            {isAdmin && <button onClick={() => router.push('/vendor-portal/team')} className={navClass(pathname === '/vendor-portal/team')}><FiUsers /> Team</button>}
            <button onClick={() => router.push('/vendor-portal/profile')} className={navClass(pathname === '/vendor-portal/profile')}><FiUser /> My Profile</button>
            <span className="px-3 py-2.5 hover:bg-white/10 rounded-xl inline-flex items-center justify-center"><VendorPortalBell /></span>
            <button onClick={logout} className="px-3.5 py-2.5 text-sm font-medium text-slate-100 hover:bg-red-500/25 rounded-xl inline-flex items-center justify-center gap-2 sm:col-auto col-span-2"><FiLogOut /> Logout</button>
          </nav>
        </div>
        <div className="py-7 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="min-w-0">
            {(backHref || backToPrevious) && (
              <button onClick={() => backToPrevious ? router.back() : router.push(backHref!)} className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white">
                <FiArrowLeft /> {backLabel || 'Back'}
              </button>
            )}
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-100"><FiBriefcase /> {isAdmin ? 'Vendor administrator workspace' : 'Investigator workspace'}</div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight break-words">{title}</h1>
            {subtitle && <p className="text-slate-300 mt-1.5 text-sm max-w-3xl leading-6">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
