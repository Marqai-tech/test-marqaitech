'use client';

/**
 * Candidate Portal shared navigation (mock screens 01–08 visual language).
 *
 * Dark-navy top bar: brand · "Candidate Portal" label · tabs —
 *   Applications · Interviews · Offers · [Preboarding — only when HR has
 *   initiated it for one of the candidate's applications] · Resume Builder ·
 *   Browse Jobs — with a notification bell (unread dot) and user + logout.
 *
 * The Preboarding tab is STATE-DRIVEN, never hardcoded: `preboarding` prop
 * comes from GET /api/candidate-portal/portal-state (404-safe: absent when
 * the candidate has no initiated preboarding).
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  FiGrid, FiCalendar, FiFileText, FiClipboard, FiZap, FiSearch,
  FiBell, FiLogOut, FiChevronDown, FiUser,
} from 'react-icons/fi';

export interface PortalPreboardingInfo {
  preboardingCandidateId: string;
  jobTitle: string | null;
  applicationRef: string | null;
  joiningDate: string | null;
  stage: string | null;
  status: string | null;
  submittedAt: string | null;
  correctionPending: boolean;
}

export interface PortalState {
  profile: { name: string; email: string };
  /** null → no preboarding initiated yet: tab hidden, per mock 03. */
  preboarding: PortalPreboardingInfo | null;
  /** Applications with an accepted offer still awaiting HR initiation. */
  awaitingHR: Array<{ applicationId: string; jobTitle: string; position: string; acceptedAt: string | null }>;
  unreadNotifications: number;
}

export function getPortalHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_candidate_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/** Alias used by pages that want headers without importing the hook naming. */
export const fetchPortalHeadersSafe = getPortalHeaders;

export async function fetchPortalState(): Promise<PortalState | null> {
  try {
    const r = await fetch('/api/candidate-portal/portal-state', { headers: getPortalHeaders() });
    if (!r.ok) return null;
    return (await r.json()) as PortalState;
  } catch {
    return null;
  }
}

export function portalLogout(router: { push: (path: string) => void }) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('tb_candidate_token');
    localStorage.removeItem('tb_candidate_email');
  }
  router.push('/candidate-portal/login');
}

export default function CandidatePortalNav({
  state,
  active,
}: {
  state: PortalState | null;
  /** Tab key to highlight: applications | interviews | offers | preboarding | resume | jobs */
  active: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const name = state?.profile?.name || 'Candidate';
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'C';

  const tabs: Array<{ key: string; label: string; href: string; icon: React.ReactNode; show: boolean }> = [
    { key: 'applications', label: 'Applications', href: '/candidate-portal/dashboard', icon: <FiGrid className="w-4 h-4" />, show: true },
    { key: 'interviews', label: 'Interviews', href: '/candidate-portal/interviews', icon: <FiCalendar className="w-4 h-4" />, show: true },
    { key: 'offers', label: 'Offers', href: '/candidate-portal/offers', icon: <FiFileText className="w-4 h-4" />, show: true },
    // State-driven: only rendered when HR has initiated preboarding (mock 04+).
    { key: 'preboarding', label: 'Preboarding', href: '/candidate-portal/preboarding', icon: <FiClipboard className="w-4 h-4" />, show: !!state?.preboarding },
    { key: 'resume', label: 'Resume Builder', href: '/candidate-portal/resume-builder', icon: <FiZap className="w-4 h-4" />, show: true },
    { key: 'jobs', label: 'Browse Jobs', href: '/careers', icon: <FiSearch className="w-4 h-4" />, show: true },
  ];

  return (
    <header className="bg-[#0b1f3a] text-white sticky top-0 z-40 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center gap-3">
          {/* Brand */}
          <Link href="/candidate-portal/dashboard" className="flex items-center gap-2.5 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center font-extrabold text-[13px] text-white shadow-sm">3B</span>
            <span className="font-bold text-[15px] tracking-tight">3Boxes <span className="font-light">HRMS</span></span>
          </Link>
<<<<<<< HEAD
          <span className="w-px h-7 bg-white/20 hidden lg:block" aria-hidden />
          <span className="text-[13px] font-semibold text-slate-300 hidden lg:block">Candidate Portal</span>

          {/* Tabs — scroll-safe: never justify-center with overflow (centered
              overflow clips the left edge and becomes unreachable); tabs stay
              left-aligned, icons-only below lg so the row always fits. */}
          <nav className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0" aria-label="Candidate portal">
=======
          <span className="w-px h-7 bg-white/20 hidden sm:block" aria-hidden />
          <span className="text-[13px] font-semibold text-slate-300 hidden sm:block">Candidate Portal</span>

          {/* Tabs */}
          <nav className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar justify-center min-w-0" aria-label="Candidate portal">
>>>>>>> e220f68 (Complete HRMS lifecycle workflow and UI audit fixes)
            {tabs.filter((t) => t.show).map((t) => {
              const isActive = active === t.key || (t.key === 'applications' && pathname === '/candidate-portal/dashboard');
              return (
                <Link
                  key={t.key}
                  href={t.href}
<<<<<<< HEAD
                  title={t.label}
                  className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 px-2.5 lg:px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
=======
                  className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
>>>>>>> e220f68 (Complete HRMS lifecycle workflow and UI audit fixes)
                    isActive
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
<<<<<<< HEAD
                  aria-label={t.label}
                >
                  {t.icon}
                  <span className="hidden lg:inline">{t.label}</span>
=======
                >
                  {t.icon}
                  <span className="hidden md:inline">{t.label}</span>
>>>>>>> e220f68 (Complete HRMS lifecycle workflow and UI audit fixes)
                </Link>
              );
            })}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="w-px h-7 bg-white/20 mx-1 hidden sm:block" aria-hidden />
            <Link
              href="/candidate-portal/notifications"
              className="relative p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Notifications"
              aria-label="Notifications"
            >
              <FiBell className="w-4.5 h-4.5" />
              {!!state?.unreadNotifications && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400" aria-hidden />
              )}
            </Link>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-lg hover:bg-white/10 text-slate-200 transition-colors"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="w-7 h-7 rounded-full bg-emerald-600/80 text-white text-[11px] font-bold flex items-center justify-center">{initials}</span>
                <span className="hidden sm:block text-[13px] font-medium max-w-[120px] truncate">{name}</span>
                <FiChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 text-slate-700">
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <p className="text-[13px] font-semibold text-slate-800 truncate">{name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{state?.profile?.email || ''}</p>
                  </div>
                  <Link href="/candidate-portal/settings" role="menuitem" className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                    <FiUser className="w-4 h-4 text-slate-400" /> Account settings
                  </Link>
                  <button
                    role="menuitem"
                    onClick={() => portalLogout(router)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-rose-600 hover:bg-rose-50"
                  >
                    <FiLogOut className="w-4 h-4" /> Logout
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => portalLogout(router)}
<<<<<<< HEAD
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
=======
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
>>>>>>> e220f68 (Complete HRMS lifecycle workflow and UI audit fixes)
            >
              <FiLogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
