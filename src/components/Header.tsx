'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FiMenu,
  FiSearch,
  FiCheck,
  FiCheckCircle,
  FiInfo,
  FiAlertTriangle,
  FiAlertCircle,
  FiGrid,
  FiClock,
  FiDollarSign,
  FiUserPlus,
  FiTarget,
  FiCalendar,
  FiFolder,
  FiSettings,
  FiActivity,
  FiArrowRight,
} from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import {
  TbSparkles,
  TbChevronDown,
  TbLayoutGridRemove,
  TbMaximize,
  TbMessageCircle,
  TbMail,
  TbBell,
  TbCalendar,
  TbSubtask,
  TbNotes,
  TbFolder,
  TbLayoutKanban,
  TbFileInvoice,
  TbUserCircle,
  TbSettings,
  TbLock,
  TbLogout,
  TbInbox,
} from 'react-icons/tb';
import type { Notification } from '@/store/notificationStore';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { sanitizeSearch } from '@/lib/validators';
import { loggedInPhotoUrl } from '@/lib/profile-photo';
import CompanySwitcher from '@/components/CompanySwitcher';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import ChangePasswordModal from '@/components/ChangePasswordModal';

function getNotificationIcon(type: string) {
  switch (type) {
    case 'success':
      return <FiCheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'warning':
      return <FiAlertTriangle className="w-4 h-4 text-amber-500" />;
    case 'error':
      return <FiAlertCircle className="w-4 h-4 text-red-500" />;
    case 'login':
    case 'logout':
      return <HiShieldCheck className="w-4 h-4 text-teal-500" />;
    case 'workflow':
      return <FiInfo className="w-4 h-4 text-orange-500" />;
    default:
      return <FiInfo className="w-4 h-4 text-green-500" />;
  }
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface HeaderProps {
  onSidebarToggle: () => void;
}

const MODULE_SEARCH_MAP: Record<string, string> = {
  // ── Company Module ──
  company: '/company',
  'company-dashboard': '/company',
  companies: '/company/companies',
  branches: '/company/branches',
  branch: '/company/branches',
  departments: '/company/departments',
  department: '/company/departments',
  designations: '/company/designations',
  designation: '/company/designations',
  grades: '/company/grades',
  grade: '/company/grades',
  shifts: '/attendance/shifts',
  shift: '/attendance/shifts',
  holidays: '/attendance/holidays',
  holiday: '/attendance/holidays',
  policies: '/leave/leave-policy',
  policy: '/leave/leave-policy',
  'company-reports': '/company/reports',

  // ── Employee Module ──
  employees: '/employees',
  employee: '/employees',
  'employee-dashboard': '/employees/dashboard',
  'add-employee': '/employees/add',
  probation: '/employees/probation',
  transfer: '/employees/transfer',
  resignation: '/employees/resignation',
  termination: '/employees/termination',

  // ── Leave Module ──
  leave: '/leave',
  'apply-leave': '/leave?action=apply',
  'apply-leave-by-hr': '/leave/apply-by-hr',
  'leave-by-hr': '/leave/apply-by-hr',

  // ── Payroll Module ──
  payroll: '/payroll',

  // ── Attendance Module ──
  attendance: '/attendance',
  'apply-attendance-by-hr': '/attendance/apply-by-hr',
  'attendance-by-hr': '/attendance/apply-by-hr',
  regularize: '/attendance/regularize',
  'gatepass': '/attendance/gatepass',
  overtime: '/attendance/overtime',
  'comp-off': '/attendance/comp-off',
  'wfh': '/attendance/wfh',
  permission: '/attendance/permission',

  // ── Recruitment Module ──
  recruitment: '/recruitment',

  // ── Helpdesk Module ──
  helpdesk: '/helpdesk',

  // ── Other Modules ──
  settings: '/settings',
  reports: '/reports',
  performance: '/performance',
  'performance-appraisal': '/performance',
  appraisal: '/performance',
  training: '/training',
  learning: '/learning',
  assets: '/assets',
  projects: '/projects',
  project: '/projects',
  expenses: '/expenses',
  'travel-expense': '/expenses',
  travel: '/travel',
  onboarding: '/onboarding',
  preboarding: '/onboarding',
  offboarding: '/separation',
  separation: '/separation',
  exit: '/separation',
  timesheets: '/timesheets',
  timesheet: '/timesheets',
  dashboard: '/dashboard',
  home: '/home',
  analytics: '/analytics',
  compliance: '/governance',
  governance: '/governance',
  profile: '/my-profile',
  'my-profile': '/my-profile',
  myprofile: '/my-profile',
  roles: '/settings',
  'roles-access': '/settings',
  modules: '/modules',
  'audit-logs': '/super-admin/audit-logs',
  audit: '/super-admin/audit-logs',
  notifications: '/notifications',
  calendar: '/calendar',
  documents: '/documents',
  docs: '/docs',
  okrs: '/okrs',
  engagement: '/engagement',
  vendors: '/vendors',
  clients: '/clients',
  accounts: '/accounts',
  crm: '/crm',
  invoices: '/invoices',
  offers: '/offers',
  requisitions: '/requisitions',
  workflows: '/workflows',
  subscriptions: '/super-admin/subscriptions',
  packages: '/super-admin/packages',
  'feature-flags': '/super-admin/feature-flags',
  'sso-providers': '/super-admin/sso-providers',
  rbac: '/super-admin/rbac',
  support: '/helpdesk',
  collaboration: '/collaboration',
  knowledge: '/knowledge',
  marketplace: '/marketplace',
};

/* ── SmartHR-style header dropdown datasets (3Boxes palette) ── */

/* Task 160 — the AI Center dropdown maps EVERY AI insight surface in the
   product: the /ai-insights/* section (hub + one page per module + settings)
   plus the module AI monitors and the AI tools. Roles mirror navData so the
   dropdown never links to a page the sidebar would hide for that role. */

const ADMIN_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin'];

/* One entry point to the whole AI Insights section. */
const AI_HUB_LINK = {
  href: '/ai-insights',
  label: 'AI Insights Hub',
  desc: "Every module's insights in one place",
  icon: FiGrid,
};

/* AI Insights section — one insight page per module (roles = navData). */
const AI_MODULE_INSIGHTS = [
  { href: '/ai-insights/attendance', label: 'AI Attendance Insights', desc: 'Patterns, anomalies & check-ins', icon: FiClock, color: 'text-cyan-600 bg-cyan-50', roles: [...ADMIN_ROLES, 'hr_admin', 'manager'] },
  { href: '/ai-insights/payroll', label: 'AI Payroll Forecast', desc: '3-month cost projection', icon: FiDollarSign, color: 'text-emerald-600 bg-emerald-50', roles: [...ADMIN_ROLES, 'hr_admin'] },
  { href: '/ai-insights/hiring', label: 'AI Hiring Forecast', desc: 'Pipeline funnel & demand', icon: FiUserPlus, color: 'text-blue-600 bg-blue-50', roles: [...ADMIN_ROLES, 'hr_admin', 'manager'] },
  { href: '/ai-insights/performance', label: 'AI Performance Insights', desc: 'Goal trajectory & coaching', icon: FiTarget, color: 'text-amber-600 bg-amber-50', roles: [...ADMIN_ROLES, 'hr_admin', 'manager'] },
  { href: '/ai-insights/leave', label: 'AI Leave Insights', desc: 'Burnout & coverage outlook', icon: FiCalendar, color: 'text-rose-600 bg-rose-50', roles: [...ADMIN_ROLES, 'hr_admin', 'manager'] },
  { href: '/ai-insights/projects', label: 'AI Project Insights', desc: 'Delivery risk & capacity', icon: FiFolder, color: 'text-violet-600 bg-violet-50', roles: [...ADMIN_ROLES, 'manager'] },
];

/* AI tools & per-module AI monitors that live outside /ai-insights. */
const AI_TOOL_LINKS = [
  { href: '/ai-assistant', label: 'AI Assistant', desc: 'Chat with your HRMS data', icon: TbSparkles, color: 'text-violet-600 bg-violet-50', roles: [...ADMIN_ROLES, 'hr_admin', 'manager'] },
  { href: '/ai-interview', label: 'AI Interview', desc: 'AI-scored candidate interviews', icon: TbInbox, color: 'text-orange-500 bg-orange-50', roles: null as string[] | null },
  { href: '/payroll/ai-insights', label: 'Payroll AI Monitor', desc: 'Anomalies, compliance & ghosts', icon: FiActivity, color: 'text-sky-600 bg-sky-50', roles: [...ADMIN_ROLES] },
  { href: '/ai-admin', label: 'AI Admin Console', desc: 'Platform AI administration', icon: TbSettings, color: 'text-blue-600 bg-blue-50', roles: ['super_admin', 'tenant_admin', 'ceo'] },
];

/* Section-wide settings (roles = navData AI Settings entry). */
const AI_SETTINGS_LINK = {
  href: '/ai-insights/settings',
  label: 'AI Settings',
  desc: 'Tune which AI features are active',
  icon: FiSettings,
  roles: [...ADMIN_ROLES, 'hr_admin'],
};

const APPLICATION_LINKS = [
  { href: '/calendar', label: 'Calendar', icon: TbCalendar, color: 'text-blue-600 bg-blue-50' },
  { href: '/todo', label: 'To Do', icon: TbSubtask, color: 'text-orange-500 bg-orange-50' },
  { href: '/notes', label: 'Notes', icon: TbNotes, color: 'text-violet-600 bg-violet-50' },
  { href: '/file-manager', label: 'File Manager', icon: TbFolder, color: 'text-sky-500 bg-sky-50' },
  { href: '/kanban', label: 'Kanban', icon: TbLayoutKanban, color: 'text-emerald-500 bg-emerald-50' },
  { href: '/invoices', label: 'Invoices', icon: TbFileInvoice, color: 'text-amber-500 bg-amber-50' },
];

type OpenMenu = 'ai' | 'apps' | 'notif' | 'user' | null;

export default function Header({ onSidebarToggle }: HeaderProps) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const notifications = useNotificationStore((state) => state.notifications);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const toggle = (menu: Exclude<OpenMenu, null>) =>
    setOpenMenu((prev) => (prev === menu ? null : menu));

  // Task 160 — role filter for the AI Center dropdown (roles mirror navData
  // so the dropdown never links to a page the sidebar hides for that role).
  const userRole = user?.role || '';
  const canSee = (roles: string[] | null) => !roles || roles.includes(userRole);

  // Task 64 FIX: fetch notifications on mount + poll every 30 seconds.
  const token = useAuthStore.getState().token;
  useEffect(() => {
    if (!token) return;
    const refresh = () => fetchNotifications();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const start = window.setTimeout(refresh, 500);
    const interval = setInterval(() => {
      refresh();
    }, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('notifications:refresh', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('notifications:refresh', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [token, fetchNotifications]);

  // Compute search suggestions based on query
  const searchSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    const matches: { key: string; route: string }[] = [];
    const seenRoutes = new Set<string>();
    for (const [key, route] of Object.entries(MODULE_SEARCH_MAP)) {
      if (key === query || key.startsWith(query) || key.includes(query)) {
        if (!seenRoutes.has(route)) {
          seenRoutes.add(route);
          matches.push({ key, route });
        }
      }
      if (matches.length >= 8) break; // max 8 suggestions
    }
    return matches;
  }, [searchQuery]);

  const handleSearchSelect = useCallback((route: string) => {
    router.push(route);
    setSearchQuery('');
    setShowSearchDropdown(false);
    setActiveSuggestionIndex(-1);
  }, [router]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        if (openMenu === 'notif') setOpenMenu(null);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        if (openMenu === 'user') setOpenMenu(null);
      }
      if (aiRef.current && !aiRef.current.contains(e.target as Node)) {
        if (openMenu === 'ai') setOpenMenu(null);
      }
      if (appsRef.current && !appsRef.current.contains(e.target as Node)) {
        if (openMenu === 'apps') setOpenMenu(null);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  // SmartHR-style fullscreen toggle
  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const photoUrl = loggedInPhotoUrl(user);

  /* SmartHR-style round icon button (btn-menubar) */
  const menubarBtn =
    'relative flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors';

  return (
    <header className="h-16 bg-white border-b border-slate-200 shadow-sm flex items-center px-3 sm:px-4 gap-2 sm:gap-3 sticky top-0 z-30">
      {/* Sidebar Toggle */}
      <button
        onClick={onSidebarToggle}
        className={menubarBtn}
        title="Toggle sidebar"
      >
        <FiMenu className="w-5 h-5" />
      </button>

      {/* 3Boxes Logo + Name in Header */}
      <div className="flex items-center gap-2.5 pr-3 border-r border-slate-200">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shadow-green-500/20">
          <svg viewBox="0 0 35 11" className="w-5 h-3.5" fill="none">
            <rect x="0" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
            <rect x="13" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
            <rect x="26" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
          </svg>
        </div>
        <div className="hidden sm:block">
          <span className="text-sm font-extrabold text-slate-800 tracking-tight">3Boxes</span>
          <span className="text-[10px] font-bold text-green-500 ml-1 tracking-wider">HRMS</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="hidden md:flex md:flex-1 md:max-w-xl relative" ref={searchRef}>
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400 z-10" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(sanitizeSearch(e.target.value));
            setShowSearchDropdown(true);
            setActiveSuggestionIndex(-1);
          }}
          onFocus={() => {
            if (searchQuery.trim()) setShowSearchDropdown(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && searchSuggestions.length > 0) {
              e.preventDefault();
              setActiveSuggestionIndex((prev) =>
                prev < searchSuggestions.length - 1 ? prev + 1 : 0
              );
            } else if (e.key === 'ArrowUp' && searchSuggestions.length > 0) {
              e.preventDefault();
              setActiveSuggestionIndex((prev) =>
                prev > 0 ? prev - 1 : searchSuggestions.length - 1
              );
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (activeSuggestionIndex >= 0 && searchSuggestions[activeSuggestionIndex]) {
                handleSearchSelect(searchSuggestions[activeSuggestionIndex].route);
              } else {
                const query = searchQuery.trim().toLowerCase();
                if (!query) return;
                const route = MODULE_SEARCH_MAP[query];
                if (route) {
                  handleSearchSelect(route);
                } else {
                  const partialMatch = Object.keys(MODULE_SEARCH_MAP).find(
                    (key) => key.startsWith(query) || key.includes(query)
                  );
                  if (partialMatch) {
                    handleSearchSelect(MODULE_SEARCH_MAP[partialMatch]);
                  } else {
                    toast.error(`No module found for '${searchQuery.trim()}'`);
                  }
                }
              }
            } else if (e.key === 'Escape') {
              setShowSearchDropdown(false);
              setActiveSuggestionIndex(-1);
            }
          }}
          placeholder="Search modules, company, employees..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-green-200 bg-green-50/30 text-sm text-thb-text-primary placeholder:text-green-400/60 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 focus:bg-white transition-all"
        />

        {/* Search Suggestions Dropdown */}
        {showSearchDropdown && searchSuggestions.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
            {searchSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.route + '-' + suggestion.key}
                onClick={() => handleSearchSelect(suggestion.route)}
                onMouseEnter={() => setActiveSuggestionIndex(index)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  index === activeSuggestionIndex
                    ? 'bg-green-50 text-green-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FiSearch className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="capitalize truncate">{suggestion.key.replace(/-/g, ' ')}</span>
                <span className="ml-auto text-[10px] text-slate-400 font-mono truncate max-w-[40%]">{suggestion.route}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Company Switcher */}
      <div className="hidden lg:block">
        <CompanySwitcher />
      </div>

      {/* Task 152 — Locale switcher MOVED under the profile-image dropdown
          (was a standalone header chip). */}

      {/* ══ SmartHR-style right icon cluster ══ */}

      {/* 1. AI Center — primary gradient dropdown button */}
      <div className="relative" ref={aiRef}>
        <button
          onClick={() => toggle('ai')}
          className="flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg bg-gradient-to-r from-violet-500 via-[#6C4FD6] to-[#3A57C4] text-white text-xs sm:text-sm font-semibold shadow-sm shadow-violet-500/30 hover:shadow-md hover:shadow-violet-500/40 hover:brightness-105 transition-all"
          title="AI Center"
        >
          <TbSparkles className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">AI Center</span>
          <TbChevronDown className={`w-3.5 h-3.5 transition-transform ${openMenu === 'ai' ? 'rotate-180' : ''}`} />
        </button>

        {openMenu === 'ai' && (
          <div className="absolute right-0 top-full mt-2 w-[19.5rem] sm:w-[34rem] bg-white border border-slate-200 rounded-xl shadow-xl animate-slide-in-down overflow-hidden z-50">
            {/* header */}
            <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-500 via-[#6C4FD6] to-[#3A57C4]">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <TbSparkles className="w-4 h-4" /> AI Center
              </h4>
              <p className="text-[11px] text-white/80 mt-0.5">AI insights &amp; tools across every module</p>
            </div>

            <div className="p-2 max-h-[calc(100vh-9rem)] overflow-y-auto">
              {/* hub — entry point to the whole AI Insights section */}
              {canSee([...ADMIN_ROLES, 'hr_admin', 'manager']) && (
                <Link
                  href={AI_HUB_LINK.href}
                  onClick={() => setOpenMenu(null)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-100 hover:border-violet-200 hover:from-violet-100 hover:to-blue-100 transition-colors mb-2 group"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white flex-shrink-0">
                    <AI_HUB_LINK.icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800">{AI_HUB_LINK.label}</span>
                    <span className="block text-[11px] text-slate-500">{AI_HUB_LINK.desc}</span>
                  </span>
                  <FiArrowRight className="w-4 h-4 text-violet-400 group-hover:text-violet-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </Link>
              )}

              {/* AI Insights section — one page per module */}
              <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Module Insights</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {AI_MODULE_INSIGHTS.filter((item) => canSee(item.roles)).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpenMenu(null)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <span className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${item.color}`}>
                      <item.icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-slate-700 leading-tight">{item.label}</span>
                      <span className="block text-[11px] text-slate-400 leading-tight mt-0.5">{item.desc}</span>
                    </span>
                  </Link>
                ))}
              </div>

              {/* AI tools & per-module AI monitors outside /ai-insights */}
              <p className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Tools &amp; Monitors</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {AI_TOOL_LINKS.filter((item) => canSee(item.roles)).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpenMenu(null)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <span className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${item.color}`}>
                      <item.icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-slate-700 leading-tight">{item.label}</span>
                      <span className="block text-[11px] text-slate-400 leading-tight mt-0.5">{item.desc}</span>
                    </span>
                  </Link>
                ))}
              </div>

              {/* AI Settings — section-wide configuration */}
              {canSee(AI_SETTINGS_LINK.roles) && (
                <Link
                  href={AI_SETTINGS_LINK.href}
                  onClick={() => setOpenMenu(null)}
                  className="flex items-center gap-3 px-3 py-2.5 mt-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 flex-shrink-0">
                    <AI_SETTINGS_LINK.icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{AI_SETTINGS_LINK.label}</span>
                    <span className="block text-[11px] text-slate-500">{AI_SETTINGS_LINK.desc}</span>
                  </span>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Fullscreen */}
      <button
        onClick={toggleFullscreen}
        className={`${menubarBtn} hidden sm:flex`}
        title="Fullscreen"
      >
        <TbMaximize className="w-[18px] h-[18px]" />
      </button>

      {/* 3. Applications — app grid dropdown */}
      <div className="relative" ref={appsRef}>
        <button
          onClick={() => toggle('apps')}
          className={menubarBtn}
          title="Applications"
        >
          <TbLayoutGridRemove className="w-[18px] h-[18px]" />
        </button>

        {openMenu === 'apps' && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl animate-slide-in-down overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-800">Applications</h4>
            </div>
            <div className="p-2">
              {APPLICATION_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpenMenu(null)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  <span className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${item.color}`}>
                    <item.icon className="w-4 h-4" />
                  </span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Chat — message icon with status dot */}
      <Link href="/collaboration/chat" className={`${menubarBtn} hidden sm:flex`} title="Chat">
        <TbMessageCircle className="w-[18px] h-[18px]" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
      </Link>

      {/* 5. Email — mail icon */}
      <Link href="/email" className={`${menubarBtn} hidden sm:flex`} title="Email">
        <TbMail className="w-[18px] h-[18px]" />
      </Link>

      {/* 6. Notifications — bell with unread badge */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => {
            fetchNotifications();
            toggle('notif');
          }}
          className={menubarBtn}
          title="Notifications"
        >
          <TbBell className="w-[18px] h-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 ring-2 ring-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Notification Dropdown */}
        {openMenu === 'notif' && (
          <div className="absolute right-0 top-full mt-2 w-96 thb-card shadow-xl animate-slide-in-down overflow-hidden z-50">
            <div className="flex items-center justify-between p-4 border-b border-thb-border">
              <h3 className="font-semibold text-thb-text-primary">
                Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={async () => {
                    await markAllAsRead();
                    toast.success('All notifications marked as read');
                  }}
                  className="text-xs text-green-500 hover:text-green-700 font-medium flex items-center gap-1"
                >
                  <FiCheck className="w-3 h-3" />
                  Mark all as read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <TbBell className="w-8 h-8 text-thb-text-muted mx-auto mb-2" />
                  <p className="text-sm text-thb-text-muted">No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 10).map((notif: Notification) => (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3 p-4 border-b border-thb-border/50 hover:bg-slate-50 transition-colors cursor-pointer ${
                      !notif.isRead ? 'bg-green-50/30' : ''
                    }`}
                    onClick={async () => {
                      if (!notif.isRead) {
                        await markAsRead(notif.id);
                      }
                      if (notif.link) {
                        window.location.href = notif.link;
                      }
                    }}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm truncate ${!notif.isRead ? 'font-semibold text-thb-text-primary' : 'font-medium text-thb-text-secondary'}`}>
                          {notif.title}
                        </p>
                        {!notif.isRead && (
                          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-thb-text-muted mt-0.5 line-clamp-2">
                        {notif.message}
                      </p>
                      <p className="text-[10px] text-thb-text-muted mt-1">
                        {formatTimeAgo(notif.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* SmartHR-style two-button footer */}
            <div className="flex gap-2 p-3 border-t border-thb-border bg-slate-50/60">
              <button
                onClick={() => setOpenMenu(null)}
                className="flex-1 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <Link
                href="/notifications"
                onClick={() => setOpenMenu(null)}
                className="flex-1 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-semibold text-center hover:from-green-600 hover:to-emerald-700 transition-all"
              >
                View All
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 7. Profile — avatar with online dot + dropdown */}
      <div className="relative" ref={userMenuRef}>
        <button
          onClick={() => toggle('user')}
          className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          title={user?.name || 'Profile'}
        >
          <span className="relative inline-flex">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={user?.name || 'Profile'}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm"
              />
            ) : (
              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {user?.name ? getInitials(user.name) : '??'}
              </span>
            )}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </span>
          <span className="hidden lg:block text-left">
            <span className="block text-sm font-semibold text-thb-text-primary leading-tight">{user?.name}</span>
            <span className="block text-[10px] text-thb-text-muted capitalize leading-tight">{user?.role?.replace('_', ' ')}</span>
          </span>
          <TbChevronDown className={`hidden lg:block w-3.5 h-3.5 text-slate-400 transition-transform ${openMenu === 'user' ? 'rotate-180' : ''}`} />
        </button>

        {/* User Dropdown — SmartHR profile card */}
        {openMenu === 'user' && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl animate-slide-in-down overflow-hidden z-50">
            {/* Card header: large avatar + name + email */}
            <div className="px-4 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50/60 to-blue-50/60">
              <div className="flex items-center gap-3">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt={user?.name || 'Profile'}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-white shadow-sm"
                  />
                ) : (
                  <span className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                    {user?.name ? getInitials(user.name) : '??'}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
              </div>
            </div>
            {/* Card body */}
            <div className="p-2">
              <Link
                href="/my-profile"
                onClick={() => setOpenMenu(null)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                <TbUserCircle className="w-4.5 h-4.5 text-slate-400" />
                My Profile
              </Link>
              {/* Task 152 — language selector now lives under the profile image */}
              <div className="px-1 pb-1">
                <LocaleSwitcher />
              </div>
              <button
                onClick={() => {
                  setOpenMenu(null);
                  setShowChangePassword(true);
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors w-full"
              >
                <TbLock className="w-4.5 h-4.5 text-slate-400" />
                Change Password
              </button>
              {['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(user?.role || '') && (
                <Link
                  href="/settings"
                  onClick={() => setOpenMenu(null)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  <TbSettings className="w-4.5 h-4.5 text-slate-400" />
                  Settings
                </Link>
              )}
            </div>
            {/* Card footer */}
            <div className="border-t border-slate-100 p-2">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors w-full"
              >
                <TbLogout className="w-4.5 h-4.5" />
                Logout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Task 134 — self-service Change Password (avatar dropdown + My Profile) */}
      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </header>
  );
}
