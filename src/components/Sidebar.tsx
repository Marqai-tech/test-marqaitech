'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  FiLogOut,
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import { canRoleAccessModule } from '@/lib/roleAccess';
import { navSections, PINNED_ITEMS, PICKER_ROUTES } from '@/lib/navData';
import type { NavItem, NavSection } from '@/lib/navData';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isMobileMenu?: boolean;
  currentModuleKey: string | null;
  onModuleSelect: (key: string | null) => void;
}

export default function Sidebar({ collapsed, onToggle, isMobileMenu = false, currentModuleKey, onModuleSelect }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const userRole = user?.role || 'admin';

  // Filter sections based on user role
  const filteredSections = useMemo(() => {
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => {
            if (item.moduleKey) return canRoleAccessModule(userRole, item.moduleKey);
            return !item.roles || item.roles.includes(userRole);
          }
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [userRole]);

  // Filter pinned items based on role
  const visiblePinnedItems = useMemo(() => {
    return PINNED_ITEMS.filter((item) => {
      if (item.moduleKey) return canRoleAccessModule(userRole, item.moduleKey);
      return !item.roles || item.roles.includes(userRole);
    });
  }, [userRole]);

  // Find the current section
  const currentSection = currentModuleKey
    ? filteredSections.find((s) => s.key === currentModuleKey)
    : null;

  // Auto-detect active item
  const isItemActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + '/');
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

  return (
    <aside
      className={`${isMobileMenu ? 'w-full' : 'fixed left-0 top-0 h-full'} bg-thb-sidebar-bg flex flex-col transition-all duration-300 ease-in-out z-40 ${
        isMobileMenu ? '' : collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Brand Header */}
      {!isMobileMenu && (
        <div className={`flex items-center h-14 px-4 border-b border-white/[0.06] ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
            <svg viewBox="0 0 35 11" className="w-4 h-3" fill="none">
              <rect x="0" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
              <rect x="13" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
              <rect x="26" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
            </svg>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-base font-bold text-white tracking-tight whitespace-nowrap">
                3Boxes <span className="text-[10px] font-semibold text-blue-300 tracking-wider">HRMS</span>
              </h1>
              <p className="text-[9px] text-thb-sidebar-text leading-none -mt-0.5">People &middot; Process &middot; Technology</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 sidebar-scroll">
        {/* Pinned items: Home + Dashboard + Modules (always visible) */}
        <ul className="space-y-0.5 mb-2">
          {visiblePinnedItems.map((item) => {
            const isActive = isItemActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => {
                    onModuleSelect(null);
                    if (isMobileMenu) onToggle();
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative ${
                    isActive
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'text-thb-sidebar-text hover:bg-thb-sidebar-hover hover:text-slate-200'
                  } ${collapsed ? 'justify-center' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full" />
                  )}
                  <span className={`flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-thb-sidebar-text hover:text-slate-200'} transition-colors`}>
                    {item.icon}
                  </span>
                  {!collapsed && <span className="flex-1 whitespace-nowrap overflow-hidden">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mx-3 my-2 border-t border-white/[0.06]" />

        {/* Selected Module Submenu */}
        {!collapsed && currentSection ? (
          <div className="min-w-0">
            {/* Section header with back button */}
            <div className="px-3 py-2 mb-1">
              <div className="flex items-center gap-2">
                {(() => {
                  const SectionIcon = currentSection.sectionIcon;
                  return <SectionIcon className="w-4 h-4 text-blue-400" />;
                })()}
                <span className="text-[10px] font-bold uppercase tracking-widest text-thb-sidebar-text/80 flex-1">
                  {currentSection.label}
                </span>
                <button
                  onClick={() => onModuleSelect(null)}
                  className="p-1 rounded text-thb-sidebar-text/50 hover:text-slate-200 hover:bg-thb-sidebar-hover transition-colors"
                  title="Back to module list"
                >
                  <FiChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {/* Section items */}
            <ul className="space-y-0.5">
              {currentSection.items.map((item) => {
                const isActive = isItemActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => { if (isMobileMenu) onToggle(); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group relative ${
                        isActive
                          ? 'bg-blue-500/15 text-blue-400'
                          : 'text-thb-sidebar-text hover:bg-thb-sidebar-hover hover:text-slate-200'
                      }`}
                      title={item.label}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-500 rounded-r-full" />
                      )}
                      <span className={`flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-thb-sidebar-text group-hover:text-slate-200'} transition-colors`}>
                        {item.icon}
                      </span>
                      <span className="flex-1 whitespace-nowrap overflow-hidden">{item.label}</span>
                      {item.isNew && (
                        <span className="flex-shrink-0 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          NEW
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : !collapsed ? (
          /* No module selected — show instruction */
          <div className="px-3 py-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
              <FiChevronRight className="w-5 h-5 text-thb-sidebar-text/30" />
            </div>
            <p className="text-[11px] text-thb-sidebar-text/50 font-medium mb-1">Select a Module</p>
            <p className="text-[9px] text-thb-sidebar-text/30 leading-relaxed">
              Click on Modules above or go to the Modules page to pick a section
            </p>
          </div>
        ) : null}

        {/* When collapsed, show just the active section icon */}
        {collapsed && currentSection && (
          <div className="flex flex-col items-center py-2">
            {(() => {
              const SectionIcon = currentSection.sectionIcon;
              return (
                <button
                  onClick={() => onModuleSelect(null)}
                  className="p-2 rounded-lg bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20 hover:bg-blue-500/25 transition-colors"
                  title={currentSection.label}
                >
                  <SectionIcon className="w-5 h-5" />
                </button>
              );
            })()}
          </div>
        )}
      </nav>

      {/* Bottom Section: User Info + Collapse Toggle */}
      {!isMobileMenu && (
      <div className="border-t border-white/[0.06]">
        {/* User Info */}
        <div className={`flex items-center p-3 ${collapsed ? 'justify-center' : 'gap-3'}`}>
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar}
              alt={user.name}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-white/10 flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ring-2 ring-white/10">
              {user?.name ? getInitials(user.name) : '??'}
            </div>
          )}
          {!collapsed && user && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user.name}</p>
              <p className="text-[10px] text-thb-sidebar-text truncate capitalize">{user.role?.replace('_', ' ')}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-thb-sidebar-text hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Logout"
            >
              <FiLogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 text-thb-sidebar-text hover:text-slate-300 hover:bg-white/[0.03] transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <FiChevronRight className="w-4 h-4" />
          ) : (
            <FiChevronLeft className="w-4 h-4" />
          )}
        </button>

        {/* Proud Product Branding */}
        {!collapsed && (
          <div className="px-3 pb-2 pt-1 text-center">
            <div className="flex items-center justify-center gap-1.5 opacity-40 hover:opacity-70 transition-opacity">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user?.tenant?.logo || '/marq-ai-logo.png'} alt="Marq AI" className="w-3.5 h-3.5 rounded object-contain" />
              <span className="text-[8px] text-thb-sidebar-text whitespace-nowrap">A Proud Product of Marq AI Tech Pvt Ltd</span>
            </div>
          </div>
        )}
      </div>
      )}
    </aside>
  );
}
