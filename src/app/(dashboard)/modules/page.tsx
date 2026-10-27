'use client';

/**
 * Task 152 — Modules page rebuilt in the SmartHR "template gallery" format
 * (reference: the HR-templates gallery the owner shared):
 *   • LEFT sidebar — category list (All Modules + one entry per group),
 *     active category highlighted.
 *   • RIGHT — search bar + card grid. Every module card carries an
 *     illustrated "info image" banner (CSS-art scene: tinted sky, soft
 *     shapes and the module glyph — mirrors the template thumbnails),
 *     the module name + description, and a SELECT button.
 * Role / tenant-module filtering and search behave exactly as before.
 */

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FiSearch, FiArrowRight, FiCheck } from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { canRoleAccessModule, isNavSectionEnabled, isSelfServicePathAllowed, isSelfServiceRole, LEGACY_ROLE_MAP, navRoleOrLeastPrivilege } from '@/lib/roleAccess';
import { sanitizeSearch } from '@/lib/validators';
import { MODULE_GROUPS } from '@/lib/navData';
import type { NavSection, ModuleGroup } from '@/lib/navData';
import { useTenantModuleStore } from '@/store/tenantModuleStore';

/* Palette used by the illustrated banners — rotated per module so the grid
   reads like a gallery of distinct artwork, same idea as the reference. */
const ART_THEMES = [
  { sky: 'from-sky-100 to-blue-50', blob1: 'bg-blue-200/70', blob2: 'bg-sky-300/60', glyph: 'text-blue-600', btn: 'bg-blue-600 hover:bg-blue-700' },
  { sky: 'from-violet-100 to-purple-50', blob1: 'bg-violet-200/70', blob2: 'bg-purple-300/60', glyph: 'text-violet-600', btn: 'bg-violet-600 hover:bg-violet-700' },
  { sky: 'from-emerald-100 to-teal-50', blob1: 'bg-emerald-200/70', blob2: 'bg-teal-300/60', glyph: 'text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  { sky: 'from-amber-100 to-orange-50', blob1: 'bg-amber-200/70', blob2: 'bg-orange-300/60', glyph: 'text-amber-600', btn: 'bg-amber-500 hover:bg-amber-600' },
  { sky: 'from-rose-100 to-pink-50', blob1: 'bg-rose-200/70', blob2: 'bg-pink-300/60', glyph: 'text-rose-600', btn: 'bg-rose-600 hover:bg-rose-700' },
  { sky: 'from-indigo-100 to-blue-50', blob1: 'bg-indigo-200/70', blob2: 'bg-blue-300/60', glyph: 'text-indigo-600', btn: 'bg-indigo-600 hover:bg-indigo-700' },
  { sky: 'from-cyan-100 to-sky-50', blob1: 'bg-cyan-200/70', blob2: 'bg-sky-300/60', glyph: 'text-cyan-600', btn: 'bg-cyan-600 hover:bg-cyan-700' },
  { sky: 'from-fuchsia-100 to-purple-50', blob1: 'bg-fuchsia-200/70', blob2: 'bg-purple-300/60', glyph: 'text-fuchsia-600', btn: 'bg-fuchsia-600 hover:bg-fuchsia-700' },
];

export default function ModulesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const userRole = navRoleOrLeastPrivilege(user?.role);
  const tenantSlug = useCompanyContextStore(s => s.tenant?.slug) || '';
  const tenantId = useCompanyContextStore(s => s.tenant?.id) || '';
  const { fetchModules, enabledModules } = useTenantModuleStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    if (tenantId && tenantSlug) {
      fetchModules(tenantId, tenantSlug);
    }
  }, [tenantId, tenantSlug, fetchModules]);

  const effectiveRoles = useMemo(() => {
    const migrated = LEGACY_ROLE_MAP[userRole] || userRole;
    return Array.from(new Set([userRole, migrated])).filter(Boolean);
  }, [userRole]);

  const filteredGroups: ModuleGroup[] = useMemo(() => {
    return MODULE_GROUPS.map(group => ({
      ...group,
      sections: group.sections
        .filter(section => isNavSectionEnabled(userRole, tenantSlug, section.key, enabledModules[tenantSlug]))
        .map(section => ({
          ...section,
          items: section.items.filter(item => {
            if (item.moduleKey && !canRoleAccessModule(userRole, item.moduleKey)) return false;
            if (item.roles) {
              const hasRole = effectiveRoles.some(r => item.roles!.includes(r));
              if (!hasRole) return false;
            }
            if (!item.moduleKey && !item.roles) {
              return effectiveRoles.some(r => ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(r));
            }
            // Task 162: self-service roles must not be shown module cards
            // whose landing path the layout would immediately bounce away
            // (the old gap made Collaboration/PM cards look clickable but
            // dead — click → redirect to /my-profile).
            if (isSelfServiceRole(userRole) && !item.roles && !isSelfServicePathAllowed(item.href)) return false;
            return true;
          }),
        }))
        .filter(section => section.items.length > 0),
    })).filter(group => group.sections.length > 0);
  }, [userRole, tenantSlug, effectiveRoles, enabledModules]);

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

  const visibleGroups = useMemo(() => {
    if (activeCategory === 'all') return searchFilteredGroups;
    return searchFilteredGroups.filter(g => g.groupLabel === activeCategory);
  }, [searchFilteredGroups, activeCategory]);

  const totalModules = visibleGroups.reduce((acc, g) => acc + g.sections.length, 0);
  const allFlat = filteredGroups.flatMap(g => g.sections);

  const handleModuleClick = (section: NavSection) => {
    const items = section.items;
    // Task 162: self-service users land on the FIRST path they are actually
    // allowed to open (the layout redirects denied paths to /my-profile,
    // which made module cards feel broken for employees).
    const target = isSelfServiceRole(userRole)
      ? items.find(item => isSelfServicePathAllowed(item.href))?.href
      : items[0]?.href;
    if (target) router.push(target);
  };

  /* One deterministic theme per module key so cards keep their artwork. */
  const themeFor = (key: string) => {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return ART_THEMES[h % ART_THEMES.length];
  };

  return (
    <div className="flex gap-6">
      {/* ── LEFT: category sidebar (template-gallery style) ── */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0">
        <div className="sticky top-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-thb-text-muted px-3 mb-2">Modules</h2>
          <button
            onClick={() => setActiveCategory('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5 ${
              activeCategory === 'all' ? 'bg-green-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All modules <span className={`text-[10px] ${activeCategory === 'all' ? 'text-green-100' : 'text-slate-400'}`}>({allFlat.length})</span>
          </button>
          {filteredGroups.map((group) => {
            const GroupIcon = group.groupIcon;
            const count = group.sections.length;
            const active = activeCategory === group.groupLabel;
            return (
              <button
                key={group.groupLabel}
                onClick={() => setActiveCategory(group.groupLabel)}
                className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5 ${
                  active ? 'bg-green-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <GroupIcon className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{group.groupLabel}</span>
                <span className={`ml-auto text-[10px] ${active ? 'text-green-100' : 'text-slate-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── RIGHT: gallery ── */}
      <div className="flex-1 min-w-0">
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold text-thb-text-primary tracking-tight">
                {activeCategory === 'all' ? 'All Modules' : activeCategory}
              </h1>
              <p className="text-sm text-thb-text-secondary mt-1">{totalModules} modules available to you</p>
            </div>
          </div>
          {/* Category chips for small screens */}
          <div className="lg:hidden flex flex-wrap gap-1.5 mb-3">
            <button onClick={() => setActiveCategory('all')} className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${activeCategory === 'all' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600'}`}>All</button>
            {filteredGroups.map(g => (
              <button key={g.groupLabel} onClick={() => setActiveCategory(g.groupLabel)} className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${activeCategory === g.groupLabel ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{g.groupLabel}</button>
            ))}
          </div>
          <div className="relative max-w-sm">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(sanitizeSearch(e.target.value))}
              placeholder="Search for modules..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-green-200 bg-green-50/30 text-sm text-thb-text-primary placeholder:text-green-400/60 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleGroups.flatMap((group) =>
            group.sections.map((section) => {
              const SectionIcon = section.sectionIcon;
              const theme = themeFor(section.key);
              return (
                <div
                  key={section.key}
                  onClick={() => handleModuleClick(section)}
                  className="group relative rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                >
                  {/* Illustrated info image (CSS art banner) */}
                  <div className={`relative h-32 bg-gradient-to-br ${theme.sky} overflow-hidden`}>
                    <div className={`absolute -left-6 -bottom-8 w-28 h-28 rounded-full ${theme.blob1}`} />
                    <div className={`absolute right-8 -top-10 w-24 h-24 rounded-full ${theme.blob2}`} />
                    <div className="absolute right-4 bottom-3 w-16 h-10 bg-white/50 rounded-lg rotate-6" />
                    <div className="absolute right-10 bottom-6 w-12 h-8 bg-white/60 rounded-lg -rotate-3" />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2">
                      <div className="w-14 h-14 rounded-2xl bg-white shadow-lg flex items-center justify-center">
                        <SectionIcon className={`w-7 h-7 ${theme.glyph}`} />
                      </div>
                    </div>
                    <span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-wider text-slate-500/80 bg-white/70 px-2 py-0.5 rounded-full">
                      {group.groupLabel}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="p-4">
                    <h3 className="text-sm font-bold text-thb-text-primary truncate">{section.label}</h3>
                    <p className="text-xs text-thb-text-secondary mt-1 leading-snug line-clamp-2 min-h-[2rem]">{section.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-400">{section.items.length} sections</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleModuleClick(section); }}
                        className={`inline-flex items-center gap-1.5 text-[11px] font-bold text-white px-3.5 py-1.5 rounded-lg transition-colors ${theme.btn}`}
                      >
                        SELECT <FiArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Selected indicator on hover */}
                  <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="w-6 h-6 rounded-full bg-white shadow flex items-center justify-center">
                      <FiCheck className="w-3.5 h-3.5 text-green-500" />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {visibleGroups.length === 0 && (
          <div className="text-center py-16">
            <FiSearch className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-thb-text-primary mb-1">No modules found</h3>
            <p className="text-sm text-thb-text-secondary">No modules match &ldquo;{searchQuery}&rdquo;. Try a different search term.</p>
          </div>
        )}
      </div>
    </div>
  );
}
