'use client';

/**
 * Task 145/147 — SHARED SmartHR dashboard building blocks.
 *
 * Both the ADMIN home (/home) and the EMPLOYEE self-service dashboard
 * (/dashboard) import THESE components, so the two dashboards are
 * guaranteed to share the exact same widget pattern:
 *
 *   PageBreadcrumbs — SmartHR breadcrumb bar (h2 title + trail + right slot)
 *   TemplateAlert   — SmartHR dismissible alert banner (bg-secondary style)
 *   ProfileHeroCard — dark-header profile card (avatar + verified badge +
 *                     designation/dept/phone/email/report-to/joined-on)
 *   MiniStatTile    — small SmartHR stat tile (round icon, value, View All)
 *   RoleHero      — royal→violet gradient hero (kept for compat)
 *   StatCard      — white card with colourful top accent bar + round pastel icon
 *   Panel         — white card with soft round icon badge next to the title
 *                   + royal "View all" link
 *   QuickLinkGrid — pastel icon tiles
 *   statusBadge / EmptyState / SkeletonBlock / StatSkeleton
 *
 * Palette (3Boxes): royal #3A57C4 · violet #6C4FD6 · orange #FF9B44 ·
 * info #009EFB · success #10B981 · gold #FFC107.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  FiChevronRight, FiBriefcase, FiSearch, FiHome, FiClock,
  FiChevronsUp, FiX, FiPhone, FiMail, FiUserCheck, FiCalendar,
  FiHash, FiStar, FiActivity,
} from 'react-icons/fi';
import { TbRosetteDiscountCheckFilled } from 'react-icons/tb';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { useAuthStore } from '@/store/authStore';
import { homeHrefForRole } from '@/lib/roleAccess';

/* ---------- page breadcrumb bar (Task 147 — exact template pattern) ---------- */

/* Task 163 — role-aware breadcrumb home button. Admins go to the Admin
   Dashboard (/home); employees / self-service roles go straight to the
   Employee Dashboard (/dashboard). Lives in its own component so the store
   hook stays isolated from the breadcrumb render tree. */
function HomeBreadcrumbButton() {
  const userRole = useAuthStore((s) => s.user?.role);
  const href = homeHrefForRole(userRole);
  const label = href === '/home' ? 'Admin Dashboard' : 'Dashboard';
  return (
    <button
      onClick={() => (window.location.href = href)}
      className="hover:text-white transition-colors"
      title={label}
      aria-label={label}
    >
      <FiHome className="w-3.5 h-3.5" />
    </button>
  );
}

export function PageBreadcrumbs({
  title,
  trail,
  right,
}: {
  title: string;
  /** e.g. ['Dashboard', 'Employee Dashboard'] — rendered after the home icon */
  trail?: string[];
  /** right-side slot: date chip, collapse toggle, etc. */
  right?: React.ReactNode;
}) {
  /* Colourful heading banner — royal→violet gradient replaces the old flat
     white strip, with warm orange / info / emerald glows so the top of the
     dashboard reads as a distinct coloured header band. */
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#3A57C4] via-[#4C51D6] to-[#6C4FD6] px-5 sm:px-7 py-5 mb-6 shadow-lg shadow-[#4C51D6]/25">
      {/* decorative colour glows */}
      <div className="absolute top-0 right-0 w-44 h-44 bg-[#FF9B44]/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 left-1/4 w-40 h-40 bg-[#009EFB]/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 right-1/3 w-28 h-28 bg-[#10B981]/25 rounded-full blur-2xl pointer-events-none" />
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight drop-shadow-sm">{title}</h1>
          <nav className="mt-1.5" aria-label="Breadcrumb">
            <ol className="flex items-center gap-1.5 text-xs text-white/75">
              <li>
                {/* Task 163 — role-aware home icon: admins → Admin Dashboard (/home),
                    everyone else → Employee Dashboard (/dashboard). */}
                <HomeBreadcrumbButton />
              </li>
              {(trail || []).map((t, i) => (
                <li key={`${t}-${i}`} className="flex items-center gap-1.5">
                  <span className="text-white/40">/</span>
                  <span className={i === (trail?.length || 0) - 1 ? 'text-white font-semibold' : 'hover:text-white transition-colors'}>{t}</span>
                </li>
              ))}
            </ol>
          </nav>
        </div>
        {right && <div className="relative flex items-center gap-2 flex-wrap">{right}</div>}
      </div>
    </div>
  );
}

/* SmartHR-style date chip + collapse toggle for the breadcrumb right slot */
export function DateChip({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 shadow-sm">
      <FiCalendar className="w-3.5 h-3.5 text-[#3A57C4]" />
      {value}
    </span>
  );
}

export function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={collapsed ? 'Expand' : 'Collapse'}
      aria-expanded={!collapsed}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:border-slate-300 shadow-sm transition-all"
    >
      <FiChevronsUp className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
    </button>
  );
}

/* ---------- template alert banner (Task 147) ---------- */

export function TemplateAlert({
  children,
  onClose,
  tone = 'violet',
}: {
  children: React.ReactNode;
  onClose?: () => void;
  tone?: 'violet' | 'amber' | 'emerald';
}) {
  const toneMap = {
    violet: 'bg-[#6C4FD6]/[0.07] border-[#6C4FD6]/20 text-slate-700',
    amber: 'bg-amber-50 border-amber-200/70 text-amber-900',
    emerald: 'bg-emerald-50 border-emerald-200/70 text-emerald-900',
  } as const;
  return (
    <div className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 mb-5 ${toneMap[tone]}`}>
      <div className="text-sm font-medium min-w-0">{children}</div>
      {onClose && (
        <button onClick={onClose} className="flex-shrink-0 w-6 h-6 rounded-full hover:bg-black/5 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors" aria-label="Dismiss">
          <FiX className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/* ---------- profile hero card (Task 147 — dark header, template-exact) ---------- */

export function ProfileHeroCard({
  name,
  designation,
  department,
  phone,
  email,
  reportTo,
  joinedOn,
  photoUrl,
  verified = true,
  employeeCode,
  experience,
}: {
  name: string;
  designation?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  reportTo?: string | null;
  joinedOn?: string | null;
  photoUrl?: string | null;
  verified?: boolean;
  /** Business employee code (e.g. EMP001) — Task 149 unified detail set. */
  employeeCode?: string | null;
  /** Total experience label (e.g. "5 years" or "2.4 yrs at company"). */
  experience?: string | null;
}) {
  const initials = (name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const router = useRouter();
  const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/10 last:border-0">
      <span className="text-xs text-white/50 flex items-center gap-2 flex-shrink-0">{icon} {label}</span>
      <span className="text-xs font-semibold text-white text-right truncate max-w-[60%]" title={value || ''}>
        {value || '—'}
      </span>
    </div>
  );
  /* Task 148 — the deep dark band that used to sit only behind the photo now
     covers the WHOLE card (template hero style). Same gradient family, with a
     warm burgundy glow so the card keeps its signature wine-dark tone. */
  return (
    <div className="relative bg-[#0F172A] rounded-2xl shadow-xl shadow-slate-900/30 overflow-hidden h-full flex flex-col">
      {/* full-card gradient — same band colours, edge to edge */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E2A4A] to-[#3A57C4]/80 pointer-events-none" />
      {/* warm burgundy + orange glows */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-[#FF9B44]/20 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-44 h-44 bg-[#7F1D3A]/45 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 right-6 w-32 h-32 bg-[#6C4FD6]/30 rounded-full blur-3xl pointer-events-none" />
      {/* content */}
      <div className="relative px-6 pt-7 pb-4">
        <div className="relative w-fit">
          <div className="w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-white/30 bg-gradient-to-br from-[#FF9B44] to-[#FFC107] flex items-center justify-center text-white text-xl font-bold shadow-lg">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
          {verified && (
            <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center" title="Verified employee">
              <TbRosetteDiscountCheckFilled className="w-4 h-4 text-emerald-500" />
            </span>
          )}
        </div>
      </div>
      <div className="relative px-6 pb-6 flex-1 flex flex-col">
        <div className="bg-white/[0.10] border border-white/20 backdrop-blur-sm rounded-xl px-4 py-3">
          <p className="text-sm font-bold text-white leading-tight">{name}</p>
          <p className="text-xs font-medium text-blue-200 mt-0.5">{designation || 'Employee'}</p>
          {department && <p className="text-[11px] text-white/50 mt-0.5">{department}</p>}
        </div>
        <div className="mt-3">
          {/* Task 149 — unified detail set, same rows as Employee List → View
              Details (/employees/[id]) and My Profile → Quick Info: Employee
              ID · Phone · Email · Department · Designation · Report Office ·
              Joined on · Years of Experience. */}
          <Row icon={<FiHash className="w-3.5 h-3.5" />} label="Employee ID" value={employeeCode} />
          <Row icon={<FiPhone className="w-3.5 h-3.5" />} label="Phone Number" value={phone} />
          <Row icon={<FiMail className="w-3.5 h-3.5" />} label="Email Address" value={email} />
          <Row icon={<FiBriefcase className="w-3.5 h-3.5" />} label="Department" value={department} />
          <Row icon={<FiStar className="w-3.5 h-3.5" />} label="Designation" value={designation} />
          <Row icon={<FiUserCheck className="w-3.5 h-3.5" />} label="Report Office" value={reportTo} />
          <Row icon={<FiCalendar className="w-3.5 h-3.5" />} label="Joined on" value={joinedOn} />
          <Row icon={<FiActivity className="w-3.5 h-3.5" />} label="Years of Experience" value={experience} />
        </div>
        <button
          onClick={() => router.push('/my-profile')}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.12] border border-white/20 text-white text-sm font-semibold hover:bg-white/20 transition-all"
        >
          View Full Profile <FiChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ---------- mini stat tile (Task 147 — template stat grid) ---------- */

export function MiniStatTile({
  label,
  value,
  icon,
  bg,
  ring,
  href,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  bg: string;
  ring: string;
  href?: string;
}) {
  const router = useRouter();
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className={`w-10 h-10 rounded-full ${bg} ring-1 ${ring} flex items-center justify-center flex-shrink-0`}>{icon}</div>
        {href && (
          <button onClick={() => router.push(href)} className="text-[10px] font-semibold text-[#3A57C4] hover:text-[#2C43A3] inline-flex items-center gap-0.5">
            View All <FiChevronRight className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
      <p className="text-xl font-bold text-slate-900 mt-3 leading-none">{value}</p>
      <p className="text-[11px] font-medium text-slate-500 mt-1.5 truncate">{label}</p>
    </div>
  );
}

/* ---------- hero ---------- */

export interface HeroProps {
  role: string;
  firstName: string;
  greeting: string;
  today: string;
  subtitle: string;
  onSearch?: (q: string) => void;
  searchQuery?: string;
  primaryCta?: { label: string; href: string; icon: React.ReactNode };
  secondaryCta?: { label: string; href: string; icon: React.ReactNode };
  /** Optional node rendered on the right (e.g. ESS attendance-rate ring). */
  ring?: React.ReactNode;
}

export function RoleHero({ role, firstName, greeting, today, subtitle, searchQuery, onSearch, primaryCta, secondaryCta, ring }: HeroProps) {
  const router = useRouter();
  const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const { effectiveCompanyLabel, canSwitch } = useCompanyContextStore();
  const companyLabel = effectiveCompanyLabel();
  return (
    <div className="relative rounded-2xl overflow-hidden border-0 shadow-xl shadow-[#6C4FD6]/25">
      <div className="absolute inset-0 bg-gradient-to-br from-[#3A57C4] via-[#4C51D6] to-[#8A5CF6]" />
      <div className="absolute top-0 right-0 w-72 h-72 bg-orange-400/20 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 left-0 w-56 h-56 bg-amber-300/20 rounded-full blur-[80px]" />
      <div className="relative z-10 px-6 sm:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF9B44] via-orange-500 to-[#FFC107] flex items-center justify-center shadow-lg ring-2 ring-white/25 text-white text-xl font-bold">
              {firstName[0]?.toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-amber-200/80 text-xs font-medium tracking-widest uppercase">{roleLabel}</p>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/15 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-300/30"
                  title={canSwitch() ? 'Use the switcher in the header to change company' : 'Your configured company'}
                >
                  <FiBriefcase className="w-3 h-3" />
                  {companyLabel}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white">
                {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-orange-200">{firstName}</span>!
              </h1>
              <p className="text-indigo-100/70 text-sm font-medium mt-0.5">{subtitle}</p>
              <p className="text-indigo-200/50 text-xs mt-0.5">{today}</p>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 max-w-md w-full">
            {ring}
            {onSearch && (
              <div className="relative">
                <FiSearch className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-amber-200/90" />
                <input
                  placeholder="Search modules, employees, requests..."
                  value={searchQuery || ''}
                  onChange={(e) => onSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-white/[0.10] backdrop-blur-md border border-white/[0.20] text-white placeholder:text-amber-100/40 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/[0.15] transition-all text-sm font-medium"
                />
              </div>
            )}
            <div className="flex gap-2">
              {primaryCta && (
                <button
                  onClick={() => router.push(primaryCta.href)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF9B44] to-[#FF7A3D] text-white text-sm font-semibold shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transition-all"
                >
                  {primaryCta.icon} {primaryCta.label}
                </button>
              )}
              {secondaryCta && (
                <button
                  onClick={() => router.push(secondaryCta.href)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-semibold hover:bg-white/20 transition-all"
                >
                  {secondaryCta.icon} {secondaryCta.label}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- stat card ---------- */

export function StatCard({ label, value, sub, icon, bg, ring }: { label: string; value: React.ReactNode; sub: string; icon: React.ReactNode; bg: string; ring: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden">
      {/* SmartHR-style colourful top accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#3A57C4] via-[#6C4FD6] to-[#FF9B44] opacity-70" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <div className={`w-11 h-11 rounded-full ${bg} ring-1 ${ring} flex items-center justify-center shadow-sm`}>{icon}</div>
      </div>
      <p className="text-xs font-medium text-slate-500 mt-2">{sub}</p>
    </div>
  );
}

/* ---------- panel ---------- */

/* Task 148 — tone="violet" | "amber" turns the panel into a FULL-COLOUR
   card exactly like the template's bg-secondary / bg-warning boxes
   (Leave Policy, Next Holiday). Default keeps the classic white card. */
export function Panel({ title, icon, href, onTitleClick, children, accent = 'text-[#3A57C4]', action, tone = 'default' }: { title: string; icon: React.ReactNode; href?: string; onTitleClick?: () => void; children: React.ReactNode; accent?: string; action?: React.ReactNode; tone?: 'default' | 'violet' | 'amber' }) {
  const router = useRouter();
  /* SmartHR-style soft round icon badge next to each panel title */
  const badgeMap: Record<string, string> = {
    'text-[#3A57C4]': 'bg-[#3A57C4]/10 text-[#3A57C4]',
    'text-[#6C4FD6]': 'bg-[#6C4FD6]/10 text-[#6C4FD6]',
    'text-[#FF9B44]': 'bg-[#FF9B44]/15 text-[#FF9B44]',
    'text-[#009EFB]': 'bg-[#009EFB]/10 text-[#009EFB]',
    'text-[#10B981]': 'bg-[#10B981]/10 text-[#10B981]',
    'text-[#FFC107]': 'bg-[#FFC107]/20 text-amber-600',
    'text-rose-500': 'bg-rose-100 text-rose-600',
    'text-fuchsia-500': 'bg-fuchsia-100 text-fuchsia-600',
    'text-teal-500': 'bg-teal-100 text-teal-600',
    'text-violet-500': 'bg-violet-100 text-violet-600',
    'text-sky-500': 'bg-sky-100 text-sky-600',
    'text-amber-500': 'bg-amber-100 text-amber-600',
    'text-emerald-500': 'bg-emerald-100 text-emerald-600',
    'text-pink-500': 'bg-pink-100 text-pink-600',
    'text-cyan-500': 'bg-cyan-100 text-cyan-600',
  };
  const badge = badgeMap[accent] || 'bg-indigo-100 text-indigo-600';
  const toneStyles = {
    default: {
      root: 'bg-white rounded-2xl p-6 border border-slate-100 shadow-sm h-full',
      title: 'text-base font-bold text-slate-900 flex items-center gap-2.5',
      iconBadge: `w-8 h-8 rounded-full ${badge} flex items-center justify-center flex-shrink-0`,
      viewAll: 'text-xs font-semibold text-[#3A57C4] hover:text-[#2C43A3] inline-flex items-center',
      glow: null as React.ReactNode | null,
    },
    violet: {
      root: 'relative overflow-hidden rounded-2xl p-6 border-0 shadow-lg shadow-[#4C51D6]/30 bg-gradient-to-br from-[#3A57C4] via-[#4C51D6] to-[#6C4FD6] h-full',
      title: 'relative text-base font-bold text-white flex items-center gap-2.5',
      iconBadge: 'relative w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center flex-shrink-0 ring-1 ring-white/30',
      viewAll: 'relative text-xs font-semibold text-white/80 hover:text-white inline-flex items-center',
      glow: (
        <>
          <div className="absolute -top-10 -right-8 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-6 w-32 h-32 bg-[#FF9B44]/25 rounded-full blur-3xl pointer-events-none" />
        </>
      ),
    },
    amber: {
      root: 'relative overflow-hidden rounded-2xl p-6 border-0 shadow-lg shadow-amber-500/30 bg-gradient-to-br from-[#FFC107] via-[#FFB020] to-[#FF9B44] h-full',
      title: 'relative text-base font-bold text-amber-950 flex items-center gap-2.5',
      iconBadge: 'relative w-8 h-8 rounded-full bg-white/35 text-amber-950 flex items-center justify-center flex-shrink-0 ring-1 ring-white/40',
      viewAll: 'relative text-xs font-semibold text-amber-950/80 hover:text-amber-950 inline-flex items-center',
      glow: (
        <>
          <div className="absolute -top-10 -right-8 w-36 h-36 bg-white/25 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-6 w-32 h-32 bg-rose-400/20 rounded-full blur-3xl pointer-events-none" />
        </>
      ),
    },
  } as const;
  const t = toneStyles[tone];
  return (
    <div className={t.root}>
      {t.glow}
      <div className="relative flex items-center justify-between mb-4">
        <h2 className={t.title}>
          <span className={t.iconBadge}>{icon}</span> {title}
        </h2>
        {action !== undefined ? (
          action
        ) : href ? (
          <button onClick={() => router.push(href)} className={t.viewAll}>
            View all <FiChevronRight className="w-3 h-3" />
          </button>
        ) : null}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/* ---------- quick links ---------- */

export function QuickLinkGrid({ links }: { links: { icon: React.ReactNode; label: string; href: string; bg: string; shadow: string }[] }) {
  const router = useRouter();
  // Map gradient classes to accent colors for the icon circle — SmartHR pastel set
  const accentMap: Record<string, string> = {
    'from-emerald-400 to-green-500': 'bg-emerald-50 text-emerald-600',
    'from-teal-400 to-teal-500': 'bg-teal-50 text-teal-600',
    'from-cyan-400 to-sky-500': 'bg-cyan-50 text-cyan-600',
    'from-amber-400 to-orange-500': 'bg-amber-50 text-amber-600',
    'from-rose-400 to-pink-500': 'bg-rose-50 text-rose-600',
    'from-fuchsia-400 to-pink-500': 'bg-fuchsia-50 text-fuchsia-600',
    'from-teal-400 to-cyan-500': 'bg-teal-50 text-teal-600',
    'from-green-400 to-emerald-500': 'bg-green-50 text-green-600',
    'from-orange-400 to-red-500': 'bg-orange-50 text-orange-600',
    'from-pink-400 to-rose-500': 'bg-pink-50 text-pink-600',
    'from-[#6C4FD6] to-[#3A57C4]': 'bg-[#6C4FD6]/10 text-[#6C4FD6]',
    'from-[#3A57C4] to-[#4C51D6]': 'bg-[#3A57C4]/10 text-[#3A57C4]',
    'from-[#FF9B44] to-[#FF7A3D]': 'bg-[#FF9B44]/15 text-[#FF9B44]',
    'from-[#009EFB] to-[#3A57C4]': 'bg-[#009EFB]/10 text-[#009EFB]',
    'from-[#FFC107] to-[#FF9B44]': 'bg-[#FFC107]/20 text-amber-600',
    'from-[#10B981] to-[#14B8A6]': 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {links.map((a) => {
        const accent = accentMap[a.bg] || 'bg-slate-50 text-slate-600';
        return (
          <button
            key={a.label}
            onClick={() => router.push(a.href)}
            className="group flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
          >
            <div className={`w-10 h-10 rounded-lg ${accent} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
              {a.icon}
            </div>
            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 flex-1">{a.label}</span>
            <FiChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

/* ---------- small shared bits ---------- */

export function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
      {icon}
      <p className="text-sm mt-2">{message}</p>
    </div>
  );
}

export function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  const map: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    draft: 'bg-slate-100 text-slate-700 ring-slate-200',
    submitted: 'bg-green-50 text-green-700 ring-green-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    processed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    closed: 'bg-slate-100 text-slate-700 ring-slate-200',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
    open: 'bg-amber-50 text-amber-700 ring-amber-200',
    in_progress: 'bg-green-50 text-green-700 ring-green-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ongoing: 'bg-green-50 text-green-700 ring-green-200',
    upcoming: 'bg-teal-50 text-teal-700 ring-teal-200',
    enrolled: 'bg-green-50 text-green-700 ring-green-200',
    available: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    assigned: 'bg-green-50 text-green-700 ring-green-200',
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  };
  const cls = map[s] || 'bg-slate-100 text-slate-700 ring-slate-200';
  const label = s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${cls}`}>{label}</span>;
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-slate-200/70 animate-pulse rounded-lg ${className}`} />;
}

export function StatSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-7 w-16" />
        </div>
        <SkeletonBlock className="h-10 w-10 rounded-xl" />
      </div>
      <SkeletonBlock className="h-3 w-32 mt-3" />
    </div>
  );
}
