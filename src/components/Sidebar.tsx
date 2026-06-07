'use client';

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
  FiShield,
  FiHelpCircle,
  FiFolder,
  FiGlobe,
  FiTruck,
  FiClipboard,
  FiStar,
  FiSliders,
  FiPercent,
  FiGitBranch,
  FiMessageCircle,
  FiBarChart2,
} from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import { useAuthStore } from '@/store/authStore';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[]; // If specified, only these roles can see it
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/home', icon: <FiGrid className="w-5 h-5" /> },
  { label: 'Dashboard', href: '/dashboard', icon: <FiHome className="w-5 h-5" /> },
  { label: 'Super Admin', href: '/super-admin', icon: <FiShield className="w-5 h-5" />, roles: ['super_admin'] },
  { label: 'Employees', href: '/employees', icon: <FiUsers className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'] },
  { label: 'Recruitment', href: '/recruitment', icon: <FiBriefcase className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
  { label: 'Requisitions', href: '/requisitions', icon: <FiClipboard className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'] },
  { label: 'Offers', href: '/offers', icon: <FiStar className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
  { label: 'Onboarding', href: '/onboarding', icon: <FiUserPlus className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
  { label: 'Attendance', href: '/attendance', icon: <FiClock className="w-5 h-5" /> },
  { label: 'Leave Management', href: '/leave', icon: <FiCalendar className="w-5 h-5" /> },
  { label: 'Payroll', href: '/payroll', icon: <FiDollarSign className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
  { label: 'Salary Structures', href: '/salary-structures', icon: <FiPercent className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
  { label: 'Performance', href: '/performance', icon: <FiTrendingUp className="w-5 h-5" /> },
  { label: 'Training', href: '/training', icon: <FiBookOpen className="w-5 h-5" /> },
  { label: 'Projects', href: '/projects', icon: <FiFolder className="w-5 h-5" /> },
  { label: 'Clients', href: '/clients', icon: <FiGlobe className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin', 'manager'] },
  { label: 'Vendors', href: '/vendors', icon: <FiTruck className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
  { label: 'Assets', href: '/assets', icon: <FiPackage className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
  { label: 'Documents', href: '/documents', icon: <FiFileText className="w-5 h-5" /> },
  { label: 'Travel', href: '/travel', icon: <FiMap className="w-5 h-5" /> },
  { label: 'Expenses', href: '/expenses', icon: <FiCreditCard className="w-5 h-5" /> },
  { label: 'Timesheets', href: '/timesheets', icon: <FiWatch className="w-5 h-5" /> },
  { label: 'Grievances', href: '/grievances', icon: <FiAlertCircle className="w-5 h-5" /> },
  { label: 'Helpdesk', href: '/helpdesk', icon: <FiHelpCircle className="w-5 h-5" /> },
  { label: 'Separation', href: '/separation', icon: <FiLogOut className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
  { label: 'FNF Settlement', href: '/fnf', icon: <FiSliders className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
  { label: 'Workflows', href: '/workflows', icon: <FiGitBranch className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
  { label: 'AI Assistant', href: '/ai-assistant', icon: <FiMessageCircle className="w-5 h-5" /> },
  { label: 'Reports', href: '/reports', icon: <FiBarChart2 className="w-5 h-5" /> },
  { label: 'Notifications', href: '/notifications', icon: <FiBell className="w-5 h-5" /> },
  { label: 'Settings', href: '/settings', icon: <FiSettings className="w-5 h-5" />, roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const userRole = user?.role || 'employee';

  const filteredNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  );

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

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-nexus-sidebar-bg flex flex-col transition-all duration-300 ease-in-out z-40 ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Brand Header */}
      <div className={`flex items-center h-16 px-4 border-b border-white/[0.06] ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <HiShieldCheck className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold text-white tracking-tight whitespace-nowrap">
              NEXUS
            </h1>
            <p className="text-[10px] text-nexus-sidebar-text leading-none -mt-0.5">HRMS Platform</p>
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 sidebar-scroll">
        <ul className="space-y-0.5">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
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
                    <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
                  )}
                </Link>
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
