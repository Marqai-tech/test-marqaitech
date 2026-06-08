'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  FiHome,
  FiGrid,
  FiUsers,
  FiBriefcase,
  FiUserPlus,
  FiClock,
  FiCalendar,
  FiDollarSign,
  FiTrendingUp,
  FiBookOpen,
  FiPackage,
  FiFileText,
  FiMap,
  FiCreditCard,
  FiWatch,
  FiAlertCircle,
  FiLogOut,
  FiBell,
  FiSettings,
  FiChevronLeft,
  FiChevronRight,
  FiChevronDown,
  FiShield,
  FiHelpCircle,
  FiFolder,
  FiGlobe,
  FiTruck,
  FiClipboard,
  FiStar,
  FiPercent,
  FiGitBranch,
  FiMessageCircle,
  FiBarChart2,
  FiHeart,
  FiTarget,
  FiZap,
  FiServer,
  FiSearch,
  FiCpu,
  FiLayers,
} from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import { useAuthStore } from '@/store/authStore';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[];
  isNew?: boolean;
}

interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    key: 'platform',
    label: 'Platform',
    items: [
      { label: 'Home', href: '/home', icon: <FiGrid className="w-5 h-5" /> },
      { label: 'Super Admin', href: '/super-admin', icon: <FiShield className="w-5 h-5" />, roles: ['super_admin'] },
      { label: 'Tenant Admin', href: '/tenant-admin', icon: <FiServer className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin'], isNew: true },
      { label: 'AI Admin Console', href: '/ai-admin', icon: <FiZap className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin'], isNew: true },
    ],
  },
  {
    key: 'core-hr',
    label: 'Core HR',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <FiHome className="w-5 h-5" /> },
      { label: 'Employees', href: '/employees', icon: <FiUsers className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'] },
      { label: 'Company Management', href: '/company', icon: <FiLayers className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin'] },
    ],
  },
  {
    key: 'talent-acquisition',
    label: 'Talent Acquisition',
    items: [
      { label: 'Recruitment', href: '/recruitment', icon: <FiBriefcase className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
      { label: 'Requisitions', href: '/requisitions', icon: <FiClipboard className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'] },
      { label: 'Offers', href: '/offers', icon: <FiStar className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
      { label: 'Job Portal', href: '/job-portal', icon: <FiSearch className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
      { label: 'AI Interview', href: '/ai-interview', icon: <FiCpu className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
    ],
  },
  {
    key: 'onboarding-lifecycle',
    label: 'Onboarding & Lifecycle',
    items: [
      { label: 'Onboarding', href: '/onboarding', icon: <FiUserPlus className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
      { label: 'Preboarding', href: '/preboarding', icon: <FiUserPlus className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'], isNew: true },
    ],
  },
  {
    key: 'time-attendance',
    label: 'Time & Attendance',
    items: [
      { label: 'Attendance', href: '/attendance', icon: <FiClock className="w-5 h-5" /> },
      { label: 'Leave Management', href: '/leave', icon: <FiCalendar className="w-5 h-5" /> },
      { label: 'Timesheets', href: '/timesheets', icon: <FiWatch className="w-5 h-5" /> },
    ],
  },
  {
    key: 'compensation',
    label: 'Compensation',
    items: [
      { label: 'Payroll', href: '/payroll', icon: <FiDollarSign className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
      { label: 'Salary Structures', href: '/salary-structures', icon: <FiPercent className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
    ],
  },
  {
    key: 'performance-growth',
    label: 'Performance & Growth',
    items: [
      { label: 'Performance', href: '/performance', icon: <FiTrendingUp className="w-5 h-5" /> },
      { label: 'Training', href: '/training', icon: <FiBookOpen className="w-5 h-5" /> },
      { label: 'Engagement', href: '/engagement', icon: <FiHeart className="w-5 h-5" />, isNew: true },
      { label: 'Succession Planning', href: '/succession', icon: <FiTarget className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'], isNew: true },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    items: [
      { label: 'Projects', href: '/projects', icon: <FiFolder className="w-5 h-5" /> },
      { label: 'Travel', href: '/travel', icon: <FiMap className="w-5 h-5" /> },
      { label: 'Expenses', href: '/expenses', icon: <FiCreditCard className="w-5 h-5" /> },
      { label: 'Assets', href: '/assets', icon: <FiPackage className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
      { label: 'Documents', href: '/documents', icon: <FiFileText className="w-5 h-5" /> },
    ],
  },
  {
    key: 'external-relations',
    label: 'External Relations',
    items: [
      { label: 'Clients', href: '/clients', icon: <FiGlobe className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'] },
      { label: 'Vendors', href: '/vendors', icon: <FiTruck className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
    ],
  },
  {
    key: 'support-intelligence',
    label: 'Support & Intelligence',
    items: [
      { label: 'Helpdesk', href: '/helpdesk', icon: <FiHelpCircle className="w-5 h-5" /> },
      { label: 'Grievances', href: '/grievances', icon: <FiAlertCircle className="w-5 h-5" /> },
      { label: 'AI Assistant', href: '/ai-assistant', icon: <FiMessageCircle className="w-5 h-5" /> },
    ],
  },
  {
    key: 'knowledge-base',
    label: 'Knowledge Base',
    items: [
      { label: 'Documentation Hub', href: '/docs', icon: <FiBookOpen className="w-5 h-5" />, isNew: true },
    ],
  },
  {
    key: 'governance',
    label: 'Governance',
    items: [
      { label: 'Workflows', href: '/workflows', icon: <FiGitBranch className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
      { label: 'Reports', href: '/reports', icon: <FiBarChart2 className="w-5 h-5" /> },
      { label: 'Settings', href: '/settings', icon: <FiSettings className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
      { label: 'Notifications', href: '/notifications', icon: <FiBell className="w-5 h-5" /> },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const userRole = user?.role || 'employee';

  // Filter sections based on user role
  const filteredSections = useMemo(() => {
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => !item.roles || item.roles.includes(userRole)
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [userRole]);

  // Determine which sections should be expanded by default
  // All sections expanded by default, and any section containing an active item stays expanded
  const defaultExpanded = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const section of filteredSections) {
      state[section.key] = true;
    }
    return state;
  }, [filteredSections]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(defaultExpanded);

  // Auto-expand sections that contain the active route
  const activeSectionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const section of filteredSections) {
      for (const item of section.items) {
        if (pathname === item.href || pathname?.startsWith(item.href + '/')) {
          keys.add(section.key);
        }
      }
    }
    return keys;
  }, [pathname, filteredSections]);

  const isSectionExpanded = (key: string) => {
    // Auto-expand if it contains the active item
    if (activeSectionKeys.has(key)) return true;
    return expandedSections[key] ?? true;
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isItemActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + '/');
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-nexus-sidebar-bg flex flex-col transition-all duration-300 ease-in-out z-40 ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Brand Header */}
      <div className={`flex items-center h-16 px-4 border-b border-white/[0.06] ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
          <svg viewBox="0 0 35 11" className="w-5 h-3" fill="none">
            <rect x="0" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
            <rect x="13" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
            <rect x="26" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
          </svg>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold text-white tracking-tight whitespace-nowrap">
              3 Boxes <span className="text-[11px] font-semibold text-blue-300 tracking-wider">HRMS</span>
            </h1>
            <p className="text-[10px] text-nexus-sidebar-text leading-none -mt-0.5">People &middot; Process &middot; Technology</p>
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 sidebar-scroll">
        <ul className="space-y-1">
          {filteredSections.map((section, sectionIndex) => {
            const expanded = isSectionExpanded(section.key);
            const hasActiveItem = section.items.some((item) => isItemActive(item.href));

            return (
              <li key={section.key}>
                {/* Section Header */}
                {!collapsed ? (
                  <button
                    onClick={() => toggleSection(section.key)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors duration-200 group/section ${
                      hasActiveItem
                        ? 'text-nexus-sidebar-text/80'
                        : 'text-nexus-sidebar-text/60 hover:text-nexus-sidebar-text/80'
                    }`}
                  >
                    <span className="flex-1 text-left">{section.label}</span>
                    {expanded ? (
                      <FiChevronDown className="w-3 h-3 flex-shrink-0 transition-transform duration-200" />
                    ) : (
                      <FiChevronRight className="w-3 h-3 flex-shrink-0 transition-transform duration-200" />
                    )}
                  </button>
                ) : (
                  // Collapsed mode: show thin divider between sections
                  sectionIndex > 0 && (
                    <div className="mx-2 my-1.5 border-t border-white/[0.06]" />
                  )
                )}

                {/* Section Items */}
                <div
                  className={`overflow-hidden transition-all duration-200 ease-in-out ${
                    collapsed || expanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = isItemActive(item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                              isActive
                                ? 'bg-blue-500/15 text-blue-400'
                                : 'text-nexus-sidebar-text hover:bg-nexus-sidebar-hover hover:text-slate-200'
                            } ${collapsed ? 'justify-center' : ''}`}
                            title={collapsed ? item.label : undefined}
                          >
                            {/* Active indicator bar */}
                            {isActive && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
                            )}
                            <span className={`flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-nexus-sidebar-text group-hover:text-slate-200'} transition-colors`}>
                              {item.icon}
                            </span>
                            {!collapsed && (
                              <span className="flex-1 whitespace-nowrap overflow-hidden">{item.label}</span>
                            )}
                            {!collapsed && item.isNew && (
                              <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                NEW
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Divider between sections (expanded mode) */}
                {!collapsed && (
                  <div className="mx-3 mt-1 mb-0.5 border-t border-white/[0.04]" />
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom Section: User Info + Collapse Toggle */}
      <div className="border-t border-white/[0.06]">
        {/* User Info */}
        <div className={`flex items-center p-3 ${collapsed ? 'justify-center' : 'gap-3'}`}>
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar}
              alt={user.name}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-white/10 flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ring-2 ring-white/10">
              {user?.name ? getInitials(user.name) : '??'}
            </div>
          )}
          {!collapsed && user && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-nexus-sidebar-text truncate capitalize">{user.role?.replace('_', ' ')}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-nexus-sidebar-text hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Logout"
            >
              <FiLogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 text-nexus-sidebar-text hover:text-slate-300 hover:bg-white/[0.03] transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <FiChevronRight className="w-4 h-4" />
          ) : (
            <FiChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
