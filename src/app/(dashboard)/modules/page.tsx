'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  FiGrid, FiSearch, FiArrowRight, FiChevronRight,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import { canRoleAccessModule } from '@/lib/roleAccess';
import { navSections, MODULE_GROUPS } from '@/lib/navData';
import type { NavSection, ModuleGroup } from '@/lib/navData';

export default function ModulesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const userRole = user?.role || 'admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // Filter sections based on role
  const filteredGroups = useMemo(() => {
    return MODULE_GROUPS.map(group => ({
      ...group,
      sections: group.sections
        .map(section => ({
          ...section,
          items: section.items.filter(item => {
            if (item.moduleKey) return canRoleAccessModule(userRole, item.moduleKey);
            return !item.roles || item.roles.includes(userRole);
          }),
        }))
        .filter(section => section.items.length > 0),
    })).filter(group => group.sections.length > 0);
  }, [userRole]);

  // Filter by search
  const searchFilteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return filteredGroups;
    const q = searchQuery.toLowerCase();
    return filteredGroups.map(group => ({
      ...group,
      sections: group.sections
        .map(section => ({
          ...section,
          items: section.items.filter(item =>
            item.label.toLowerCase().includes(q) || section.label.toLowerCase().includes(q)
          ),
        }))
        .filter(section => section.items.length > 0),
    })).filter(group => group.sections.length > 0);
  }, [filteredGroups, searchQuery]);

  const totalModules = searchFilteredGroups.reduce((acc, g) => acc + g.sections.length, 0);

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-thb-text-primary tracking-tight">Modules</h1>
            <p className="text-sm text-thb-text-secondary mt-1">
              {totalModules} modules available &middot; Click a module to explore its features
            </p>
          </div>
        </div>
        {/* Search Bar */}
        <div className="relative max-w-md">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search modules..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50/30 text-sm text-thb-text-primary placeholder:text-blue-400/60 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Module Groups */}
      <div className="space-y-10">
        {searchFilteredGroups.map((group) => (
          <div key={group.groupLabel}>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-thb-text-primary">{group.groupLabel}</h2>
              <p className="text-xs text-thb-text-secondary mt-0.5">{group.groupDescription}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {group.sections.map((section) => {
                const SectionIcon = section.sectionIcon;
                const isExpanded = expandedModule === section.key;
                const gradientColor = section.sectionColor || 'from-blue-500 to-indigo-600';
                return (
                  <div
                    key={section.key}
                    className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                      isExpanded
                        ? 'col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 border-blue-300 shadow-lg shadow-blue-500/10'
                        : 'border-slate-200 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 cursor-pointer'
                    }`}
                  >
                    <div
                      className="p-4 flex items-center gap-3"
                      onClick={() => setExpandedModule(isExpanded ? null : section.key)}
                    >
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradientColor} flex items-center justify-center shadow-md flex-shrink-0`}>
                        <SectionIcon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-thb-text-primary truncate">{section.label}</h3>
                        <p className="text-[11px] text-thb-text-secondary">{section.items.length} features</p>
                      </div>
                      <FiChevronRight className={`w-4 h-4 text-thb-text-secondary transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                          {section.items.map((item) => (
                            <button
                              key={item.href}
                              onClick={(e) => { e.stopPropagation(); router.push(item.href); }}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group ${
                                pathname === item.href
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'hover:bg-white hover:shadow-sm text-thb-text-secondary hover:text-thb-text-primary'
                              }`}
                            >
                              <span className="flex-shrink-0 text-thb-text-secondary group-hover:text-blue-500 transition-colors">
                                {item.icon}
                              </span>
                              <span className="text-xs font-medium truncate flex-1">{item.label}</span>
                              {item.isNew && (
                                <span className="flex-shrink-0 text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200">
                                  NEW
                                </span>
                              )}
                              <FiArrowRight className="w-3 h-3 text-slate-300 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {searchFilteredGroups.length === 0 && searchQuery && (
        <div className="text-center py-16">
          <FiSearch className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-thb-text-primary mb-1">No modules found</h3>
          <p className="text-sm text-thb-text-secondary">No modules match &ldquo;{searchQuery}&rdquo;. Try a different search term.</p>
        </div>
      )}
    </div>
  );
}
