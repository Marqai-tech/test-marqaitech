'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FiBell, FiBriefcase, FiCalendar, FiCheckSquare, FiFileText, FiGrid,
  FiLogOut, FiSearch, FiShield, FiUser, FiUsers,
} from 'react-icons/fi';

export interface PortalPreboardingInfo {
  preboardingCandidateId: string;
  jobTitle: string | null;
  applicationRef: string | null;
  joiningDate: string | null;
  stage: string | null;
  status: string | null;
  onboardingStatus?: string | null;
  bgvStatus?: string | null;
  submittedAt: string | null;
  correctionPending: boolean;
}

export interface PortalState {
  profile: { name: string; email: string };
  preboarding: PortalPreboardingInfo | null;
  awaitingHR: Array<{ applicationId: string; jobTitle: string; position: string; acceptedAt: string | null }>;
  unreadNotifications: number;
}

export function getPortalHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_candidate_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export const fetchPortalHeadersSafe = getPortalHeaders;

export async function fetchPortalState(): Promise<PortalState | null> {
  try {
    const response = await fetch('/api/candidate-portal/portal-state', { headers: getPortalHeaders() });
    if (!response.ok) return null;
    return await response.json() as PortalState;
  } catch {
    return null;
  }
}

export function portalLogout(router: { push: (path: string) => void }) {
  localStorage.removeItem('tb_candidate_token');
  localStorage.removeItem('tb_candidate_email');
  router.push('/candidate-portal/login');
}

export default function CandidatePortalNav({ state, active }: { state: PortalState | null; active: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const name = state?.profile?.name || 'Candidate';
  const initials = name.split(/\s+/).map(part => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'C';
  const hasPreboarding = !!state?.preboarding;
  const pb = state?.preboarding;
  const onboardingStatus = String(pb?.onboardingStatus || '').toLowerCase();
  const bgvStatus = String(pb?.bgvStatus || '').toLowerCase();
  const onboardingReady = hasPreboarding && (
    ['ready_to_join', 'joined'].includes(String(pb?.stage || '').toLowerCase())
    || ['provisional_employee', 'active_employee'].includes(onboardingStatus)
    || ['cleared', 'approved', 'passed'].includes(bgvStatus)
  );

  useEffect(() => {
    document.body.classList.add('candidate-portal-shell');
    return () => document.body.classList.remove('candidate-portal-shell');
  }, []);

  const items = [
    { key: 'home', label: 'Dashboard', href: '/candidate-portal/home', icon: FiGrid, show: true },
    { key: 'applications', label: 'My Applications', href: '/candidate-portal/dashboard', icon: FiBriefcase, show: true },
    { key: 'interviews', label: 'Interviews', href: '/candidate-portal/interviews', icon: FiCalendar, show: true },
    { key: 'offers', label: 'Offers', href: '/candidate-portal/offers', icon: FiFileText, show: true },
    { key: 'preboarding', label: 'Preboarding', href: '/candidate-portal/preboarding', icon: FiCheckSquare, show: hasPreboarding },
    { key: 'documents', label: 'Documents & BGV', href: '/candidate-portal/documents', icon: FiShield, show: hasPreboarding },
    { key: 'onboarding', label: 'Onboarding', href: '/candidate-portal/onboarding', icon: FiUsers, show: onboardingReady },
    { key: 'profile', label: 'My Profile', href: '/candidate-portal/profile', icon: FiUser, show: true },
    { key: 'jobs', label: 'Browse Jobs', href: '/careers', icon: FiSearch, show: true },
  ];

  return <>
    <style jsx global>{`
      @media (min-width: 1024px) {
        body.candidate-portal-shell { padding-left: 232px; overflow: hidden; }
        body.candidate-portal-shell > div { min-height: 100vh; }
      }
    `}</style>
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-white/10 bg-[#0b2343] text-white lg:left-[232px]">
      <div className="flex h-full items-center justify-between px-4 lg:px-7">
        <button className="rounded-lg p-2 hover:bg-white/10 lg:hidden" onClick={() => setMobileOpen(value => !value)} aria-label="Toggle navigation"><FiGrid /></button>
        <div className="hidden lg:block">
          <p className="text-lg font-bold">{active === 'home' ? `Good morning, ${name.split(' ')[0]}` : items.find(item => item.key === active)?.label || 'Candidate Portal'}</p>
          <p className="text-[11px] text-slate-300">Candidate Portal</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/candidate-portal/notifications" className="relative rounded-lg p-2 text-slate-200 hover:bg-white/10" aria-label="Notifications">
            <FiBell className="h-5 w-5" />
            {!!state?.unreadNotifications && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400" />}
          </Link>
          <span className="h-7 w-px bg-white/20" />
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{initials}</span>
          <div className="hidden sm:block"><p className="max-w-32 truncate text-sm font-semibold">{name}</p><p className="max-w-36 truncate text-[10px] text-slate-300">{state?.profile?.email || ''}</p></div>
        </div>
      </div>
    </header>

    <aside className={`fixed inset-y-0 left-0 z-[60] w-[232px] bg-gradient-to-b from-[#081d37] to-[#0b2343] text-white transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-black">3B</span>
        <p className="text-lg font-bold">3Boxes <span className="font-light text-emerald-300">HRMS</span></p>
      </div>
      <nav className="flex h-[calc(100vh-64px)] flex-col px-2.5 py-4">
        <div className="space-y-1 overflow-hidden">
          {items.filter(item => item.show).map(item => {
            const Icon = item.icon;
            const selected = active === item.key || (item.key === 'applications' && pathname === '/candidate-portal/dashboard');
            return <Link key={item.key} href={item.href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${selected ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/20' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`}>
              <Icon className="h-4.5 w-4.5 shrink-0" /><span>{item.label}</span>
            </Link>;
          })}
        </div>
        {!hasPreboarding && (state?.awaitingHR?.length || 0) > 0 && <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-[11px] text-amber-100"><p className="font-bold">Offer accepted</p><p className="mt-1 text-amber-100/80">Preboarding will unlock after HR initiates it.</p></div>}
        <button onClick={() => portalLogout(router)} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-200 hover:bg-rose-500/15 hover:text-rose-200"><FiLogOut className="h-4.5 w-4.5" /> Logout</button>
      </nav>
    </aside>
    <div className="h-16" aria-hidden />
  </>;
}

