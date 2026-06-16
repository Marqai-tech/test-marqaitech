'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FiChevronDown, FiHome, FiGrid, FiCheck, FiSearch,
  FiBriefcase, FiLayers, FiInfo, FiUsers, FiShield,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

/**
 * CompanySwitcher
 *
 * - Super admin: cascading dropdown — Tenant → Company (with "All companies in tenant" option)
 * - Tenant admin: dropdown of companies under their tenant (with "All companies (group)" option)
 * - Other roles: static badge showing their configured company name
 *
 * For super admin view, every company item ALSO shows the parent tenant name in
 * small text so it's always clear under which tenant a given company was created.
 *
 * The component auto-hydrates from /api/me/context on first mount. The selection
 * is persisted via the companyContextStore, so navigating between pages keeps
 * the same context.
 */
export default function CompanySwitcher() {
  const { user } = useAuthStore();
  const {
    hydrated, hydrate,
    role, ownCompany, ownCompanyId, tenant, tenantQuota,
    availableTenants, availableCompanies, availableCompanyGroups,
    selectedTenantId, selectedCompanyId,
    setSelectedTenant, setSelectedCompany,
    effectiveCompanyLabel, canSwitch,
  } = useCompanyContextStore();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userRole = (user?.role || role || 'employee').toLowerCase();
  const isSuperAdmin = userRole === 'super_admin';
  const isTenantAdmin = userRole === 'tenant_admin';
  const allowSwitch = isSuperAdmin || isTenantAdmin;

  // The tenant that's currently in scope (for super_admin: the selected one;
  // for tenant_admin: their own tenant)
  const scopedTenant = isSuperAdmin
    ? availableTenants.find((t) => t.id === selectedTenantId) || null
    : tenant;

  // For admins: group companies by companyGroup for nicer UX
  const groupedCompanies = availableCompanies.reduce<Record<string, { groupName: string; items: typeof availableCompanies }>>((acc, c) => {
    const gid = c.companyGroup?.id || 'ungrouped';
    const gname = c.companyGroup?.name || 'Ungrouped';
    if (!acc[gid]) acc[gid] = { groupName: gname, items: [] };
    acc[gid].items.push(c);
    return acc;
  }, {});

  const filteredGroups = Object.entries(groupedCompanies).filter(([_, g]) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.groupName.toLowerCase().includes(q) ||
      g.items.some((c) => c.name.toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q))
    );
  });

  const selectedTenantName = scopedTenant?.name || (isSuperAdmin ? 'Select tenant' : 'My tenant');

  // ---------- non-admin view: static badge showing tenant + company ----------
  if (!allowSwitch) {
    const label = ownCompany?.name || 'My Company';
    const tenantName = tenant?.name;
    return (
      <div
        className="flex flex-col px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700 max-w-[180px] sm:max-w-[240px]"
        title={`Tenant: ${tenantName || '—'} · Company: ${label}`}
      >
        <span className="text-[9px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
          <FiHome className="w-2.5 h-2.5" /> {tenantName || 'No tenant'}
        </span>
        <span className="truncate flex items-center gap-1">
          <FiBriefcase className="w-3 h-3 text-slate-500 flex-shrink-0" /> {label}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-xs font-semibold text-slate-700 max-w-[180px] sm:max-w-[260px]"
        title="Switch company context"
      >
        <FiLayers className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
        <span className="truncate">{effectiveCompanyLabel()}</span>
        <FiChevronDown className={`w-3 h-3 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-[420px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-slate-100">
            <p className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-2">
              <FiGrid className="w-3.5 h-3.5" /> Company Switcher
            </p>
            <p className="text-[11px] text-indigo-700/70 mt-0.5">
              {isSuperAdmin ? 'Switch across all tenants and companies' : 'Switch between companies in your group'}
            </p>
          </div>

          {/* Tenant selector (super_admin only) */}
          {isSuperAdmin && (
            <div className="px-4 py-3 border-b border-slate-100">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                <FiHome className="w-3 h-3" /> Tenant
              </label>
              <div className="relative">
                <select
                  value={selectedTenantId || ''}
                  onChange={(e) => {
                    setSelectedTenant(e.target.value);
                  }}
                  className="w-full pl-3 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-300 appearance-none cursor-pointer"
                >
                  {availableTenants.length === 0 && <option value="">No tenants available</option>}
                  {availableTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.maxCompaniesAllowed ? ` (cap: ${t.maxCompaniesAllowed} cos)` : ''}
                    </option>
                  ))}
                </select>
                <FiChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Tenant quota banner for tenant_admin */}
          {isTenantAdmin && tenantQuota && (
            <div className="px-4 py-2 border-b border-slate-100 bg-amber-50/60 flex items-center gap-2">
              <FiShield className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <p className="text-[11px] text-amber-800 font-medium">
                {tenantQuota.maxCompanies > 0
                  ? <>Company quota: <b>{tenantQuota.used}</b> of <b>{tenantQuota.maxCompanies}</b> used · {tenantQuota.remaining} remaining</>
                  : <>Company quota: <b>{tenantQuota.used}</b> created · unlimited allowed</>
                }
              </p>
            </div>
          )}

          {/* Search + company list */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="relative">
              <FiSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-300"
              />
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {/* "All companies" option */}
            <button
              onClick={() => {
                setSelectedCompany(null);
                setOpen(false);
                setSearch('');
              }}
              className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between border-b border-slate-100 ${
                selectedCompanyId === null ? 'bg-indigo-50/40' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <FiLayers className="w-4 h-4 text-indigo-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {isSuperAdmin ? 'All companies in tenant' : 'All companies (group)'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {availableCompanies.length} companies · {availableCompanyGroups.length} groups
                    {scopedTenant ? ` · ${scopedTenant.name}` : ''}
                  </p>
                </div>
              </div>
              {selectedCompanyId === null && <FiCheck className="w-4 h-4 text-indigo-600" />}
            </button>

            {/* Grouped company list */}
            {filteredGroups.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400">
                <FiInfo className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">
                  {availableCompanies.length === 0
                    ? isSuperAdmin
                      ? 'Select a tenant to load companies'
                      : 'No companies found in your group'
                    : 'No matches for your search'}
                </p>
              </div>
            ) : (
              filteredGroups.map(([gid, g]) => {
                // Find the underlying CompanyGroupOption to show its employee barrier
                const groupMeta = availableCompanyGroups.find((x) => x.id === gid);
                return (
                  <div key={gid} className="border-b border-slate-100 last:border-b-0">
                    <div className="px-4 py-1.5 bg-slate-50/60 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                        <FiLayers className="w-3 h-3" /> {g.groupName}
                      </p>
                      {groupMeta && groupMeta.maxEmployees !== null && groupMeta.maxEmployees !== undefined && groupMeta.maxEmployees > 0 && (
                        <span className="text-[9px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          <FiUsers className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
                          {groupMeta.employeeLimitMode === 'per_company' ? 'per-co' : 'group'} cap: {groupMeta.maxEmployees}
                        </span>
                      )}
                    </div>
                    {g.items.map((c) => {
                      const empCount = c._count?.employees || 0;
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCompany(c.id);
                            setOpen(false);
                            setSearch('');
                          }}
                          className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between ${
                            selectedCompanyId === c.id ? 'bg-indigo-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FiBriefcase className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{c.name}</p>
                              <p className="text-[11px] text-slate-500">
                                {c.code ? `${c.code} · ` : ''}
                                {c._count?.branches || 0} branches · {empCount} emp
                                {/* Super admin: show parent tenant name on each company */}
                                {isSuperAdmin && scopedTenant && (
                                  <span className="text-indigo-500"> · tenant: {scopedTenant.name}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          {selectedCompanyId === c.id && <FiCheck className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-slate-50/80 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>{availableCompanies.length} companies</span>
            {isSuperAdmin && (
              <a
                href="/super-admin"
                className="text-indigo-600 hover:text-indigo-700 font-medium"
                onClick={() => setOpen(false)}
              >
                Manage tenants & groups →
              </a>
            )}
            {isTenantAdmin && (
              <a
                href="/tenant-admin/companies"
                className="text-indigo-600 hover:text-indigo-700 font-medium"
                onClick={() => setOpen(false)}
              >
                Manage companies →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
