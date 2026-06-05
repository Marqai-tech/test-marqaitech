'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FiHome,
  FiUsers,
  FiSliders,
  FiCalendar,
  FiClock,
  FiFolder,
  FiDollarSign,
  FiBookOpen,
  FiTrendingUp,
  FiMap,
  FiLogOut,
  FiGitBranch,
  FiLifeBuoy,
  FiGrid,
  FiLock,
  FiSettings,
  FiBook,
  FiShield,
  FiChevronLeft,
  FiChevronRight,
  FiArrowLeft,
  FiServer,
  FiCreditCard,
  FiFileText,
} from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import { useAuthStore } from '@/store/authStore';
import { useModuleStore, modules, type SubMenuItem } from '@/store/moduleStore';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// Map icon string keys to actual icon components for sub-menus
const subMenuIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FiShield,
  FiHome,
  FiSliders,
  FiUsers,
  FiCalendar,
  FiClock,
  FiFolder,
  FiDollarSign,
  FiBookOpen,
  FiTrendingUp,
  FiMap,
  FiLogOut,
  FiGitBranch,
  FiLifeBuoy,
  FiGrid,
  FiLock,
  FiSettings,
  FiBook,
  FiServer,
  FiCreditCard,
  FiFileText,
};

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { activeModule, setActiveModule } = useModuleStore();

  const userRole = user?.role || 'employee';

  // Get the active module config
  const currentModule = activeModule ? modules.find((m) => m.id === activeModule) : null;

  // Auto-detect module from pathname if activeModule is not set
  const detectedModule = !activeModule
    ? modules.find((m) => m.route !== '/dashboard' && pathname?.startsWith(m.route))
    : null;

  // Use detected module if activeModule is null but we're on a module route
  const displayModule = currentModule || detectedModule;

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const handleBackToHome = () => {
    setActiveModule(null);
    router.push('/dashboard');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isOnLandingPage = pathname === '/dashboard' && !activeModule;

  // Filter sub-menus based on role
  const visibleModules = modules.filter(
    (m) => !m.roles || m.roles.includes(userRole)
  );

  // Get a small icon for sub-menu items
  const getSubMenuIcon = (moduleIconKey: string) => {
    const IconComponent = subMenuIconMap[moduleIconKey];
    return IconComponent ? <IconComponent className="w-4 h-4" /> : <FiGrid className="w-4 h-4" />;
  };

  // Deduplicate sub-menus by href for display
  const getUniqueSubMenus = (subMenus: SubMenuItem[]): SubMenuItem[] => {
    const seen = new Set<string>();
    return subMenus.filter((sm) => {
      if (seen.has(sm.href)) return false;
      seen.add(sm.href);
      return true;
    });
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
          <div className="overflow-hidden flex-1">
            <h1 className="text-lg font-bold text-white tracking-tight whitespace-nowrap">
              NEXUS
            </h1>
            <p className="text-[10px] text-nexus-sidebar-text leading-none -mt-0.5">HRMS Platform</p>
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 sidebar-scroll">
        {!displayModule ? (
          /* LANDING PAGE MODE - Minimal sidebar */
          <ul className="space-y-0.5">
            <li>
              <Link
                href="/dashboard"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                  isOnLandingPage
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-nexus-sidebar-text hover:bg-nexus-sidebar-hover hover:text-slate-200'
                } ${collapsed ? 'justify-center' : ''}`}
              >
                {isOnLandingPage && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
                )}
                <span className={`flex-shrink-0 ${isOnLandingPage ? 'text-blue-400' : 'text-nexus-sidebar-text group-hover:text-slate-200'} transition-colors`}>
                  <FiHome className="w-5 h-5" />
                </span>
                {!collapsed && <span className="whitespace-nowrap overflow-hidden">Home</span>}
              </Link>
            </li>

            {/* Module quick links in collapsed mode or as a compact list */}
            {!collapsed && (
              <>
                <li className="pt-3 pb-1 px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-nexus-sidebar-text/50">Modules</p>
                </li>
                {visibleModules.map((mod) => {
                  const modIcon = getSubMenuIcon(mod.icon);
                  const isModActive = pathname?.startsWith(mod.route) && mod.route !== '/dashboard';
                  return (
                    <li key={mod.id}>
                      <button
                        onClick={() => {
                          setActiveModule(mod.id);
                          router.push(mod.route);
                        }}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group relative w-full text-left ${
                          isModActive
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'text-nexus-sidebar-text hover:bg-nexus-sidebar-hover hover:text-slate-200'
                        }`}
                      >
                        {isModActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-500 rounded-r-full" />
                        )}
                        <span className={`flex-shrink-0 ${isModActive ? 'text-blue-400' : 'text-nexus-sidebar-text group-hover:text-slate-200'} transition-colors`}>
                          {modIcon}
                        </span>
                        <span className="whitespace-nowrap overflow-hidden">{mod.name}</span>
                      </button>
                    </li>
                  );
                })}
              </>
            )}
          </ul>
        ) : (
          /* MODULE MODE - Show module-specific sub-menus */
          <ul className="space-y-0.5">
            {/* Back to Home button */}
            <li>
              <button
                onClick={handleBackToHome}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-nexus-sidebar-text hover:bg-nexus-sidebar-hover hover:text-slate-200 w-full group relative ${
                  collapsed ? 'justify-center' : ''
                }`}
              >
                <span className="flex-shrink-0 group-hover:text-slate-200 transition-colors">
                  <FiArrowLeft className="w-5 h-5" />
                </span>
                {!collapsed && (
                  <span className="whitespace-nowrap overflow-hidden">Back to Home</span>
                )}
              </button>
            </li>

            {/* Module header */}
            {!collapsed && (
              <li className="pt-2 pb-1 px-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-nexus-sidebar-text/50">
                  {displayModule.name}
                </p>
              </li>
            )}

            {/* Module sub-menu items */}
            {getUniqueSubMenus(displayModule.subMenus).map((subMenu) => {
              const isActive = pathname === subMenu.href || pathname?.startsWith(subMenu.href + '/');
              return (
                <li key={`${subMenu.label}-${subMenu.href}`}>
                  <Link
                    href={subMenu.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                      isActive
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'text-nexus-sidebar-text hover:bg-nexus-sidebar-hover hover:text-slate-200'
                    } ${collapsed ? 'justify-center' : ''}`}
                    title={collapsed ? subMenu.label : undefined}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
                    )}
                    <span className={`flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-nexus-sidebar-text group-hover:text-slate-200'} transition-colors`}>
                      {getSubMenuIcon(displayModule.icon)}
                    </span>
                    {!collapsed && (
                      <span className="whitespace-nowrap overflow-hidden">{subMenu.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
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
