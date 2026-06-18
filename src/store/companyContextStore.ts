'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface TenantOption {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  maxCompaniesAllowed?: number;
}

export interface CompanyGroupOption {
  id: string;
  name: string;
  tenantId: string;
  employeeLimitMode?: 'per_company' | 'group_total';
  maxEmployees?: number | null;
  maxCompanies?: number | null;
  notes?: string | null;
}

export interface CompanyOption {
  id: string;
  name: string;
  code: string | null;
  companyGroupId: string;
  companyGroup: { id: string; name: string };
  _count?: { branches: number; employees?: number };
}

export interface OwnCompanyInfo {
  id: string;
  name: string;
  code: string | null;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  maxCompaniesAllowed: number;
  country?: string | null;
  currency?: string;
  timezone?: string;
}

export interface TenantQuota {
  maxCompanies: number;
  used: number;
  remaining: number | null; // null = unlimited
}

interface CompanyContextState {
  // Hydrated from /api/me/context
  hydrated: boolean;
  hydrating: boolean;
  lastFetchAt: number | null;
  lastError: string | null;
  role: string;
  tenantId: string | null;
  tenant: TenantInfo | null;
  tenantQuota: TenantQuota | null;
  ownCompanyId: string | null;
  ownCompany: OwnCompanyInfo | null;
  availableTenants: TenantOption[];
  availableCompanyGroups: CompanyGroupOption[];
  availableCompanies: CompanyOption[];

  // User's current selection (admins only)
  //   selectedTenantId  — super_admin: which parent (tenant) is in scope
  //   selectedGroupId   — admin: which group company is in scope ("all companies in this group")
  //   selectedCompanyId — admin: which specific company is in scope (most specific)
  // The hierarchy of precedence is: selectedCompanyId > selectedGroupId > selectedTenantId.
  // Selecting a more specific scope clears the broader ones (e.g., picking a company
  // clears selectedGroupId because the company already implies a group).
  selectedTenantId: string | null;
  selectedGroupId: string | null;
  selectedCompanyId: string | null;

  // Actions
  hydrate: (force?: boolean) => Promise<void>;
  refreshContext: () => Promise<void>;
  refreshCompaniesFor: (tenantId: string) => Promise<void>;
  setSelectedTenant: (tenantId: string) => Promise<void>;
  setSelectedGroup: (groupId: string | null) => void;
  setSelectedCompany: (companyId: string | null) => void;
  setRole: (role: string) => void;
  reset: () => void;

  // Selectors
  effectiveCompanyId: () => string | null;
  effectiveGroupId: () => string | null;
  effectiveCompanyLabel: (userRole?: string) => string;
  canSwitch: (userRole?: string) => boolean;
  selectedTenant: () => TenantOption | null;
  selectedCompanyGroup: () => CompanyGroupOption | null;
}

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export const useCompanyContextStore = create<CompanyContextState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      hydrating: false,
      lastFetchAt: null,
      lastError: null,
      role: 'employee',
      tenantId: null,
      tenant: null,
      tenantQuota: null,
      ownCompanyId: null,
      ownCompany: null,
      availableTenants: [],
      availableCompanyGroups: [],
      availableCompanies: [],
      selectedTenantId: null,
      selectedGroupId: null,
      selectedCompanyId: null,

      hydrate: async (force?: boolean) => {
        const state = get();
        if (state.hydrating) return; // already in-flight
        if (state.hydrated && !force) return;
        set({ hydrating: true });
        try {
          const res = await fetch('/api/me/context', { headers: getAuthHeaders() });
          if (!res.ok) {
            // Don't mark hydrated=true on auth failure — let the user retry.
            // The authStore will handle 401 by logging the user out.
            const errMsg = res.status === 401
              ? 'Session expired — please sign in again.'
              : `Failed to load context (HTTP ${res.status})`;
            set({ hydrating: false, hydrated: true, lastError: errMsg, lastFetchAt: Date.now() });
            return;
          }
          const data = await res.json();
          const role = data.role || 'employee';
          const canSwitch = role === 'super_admin' || role === 'tenant_admin';

          // Default the selected tenant to the caller's tenant for tenant_admin,
          // or to the first available for super_admin (if a previous selection
          // is not persisted or the persisted one no longer exists).
          const persistedSelectedTenant = state.selectedTenantId;
          const stillExists = persistedSelectedTenant
            ? (data.availableTenants || []).some((t: TenantOption) => t.id === persistedSelectedTenant)
            : false;
          let selectedTenantId: string | null = null;
          if (canSwitch) {
            if (role === 'super_admin') {
              selectedTenantId = (stillExists ? persistedSelectedTenant : null)
                || data.tenantId
                || data.availableTenants?.[0]?.id
                || null;
            } else {
              selectedTenantId = data.tenantId;
            }
          } else {
            selectedTenantId = data.tenantId;
          }

          // For non-admins, the effective company is always their own.
          // For admins, if the persisted selectedCompanyId is no longer in the
          // fresh list (e.g., company was deleted), reset it to null ("all").
          const persistedSelectedCompany = state.selectedCompanyId;
          const companyStillExists = persistedSelectedCompany
            ? (data.availableCompanies || []).some((c: CompanyOption) => c.id === persistedSelectedCompany)
            : false;
          const selectedCompanyId = canSwitch
            ? (companyStillExists ? persistedSelectedCompany : null)
            : data.ownCompanyId;

          // Validate the persisted selectedGroupId — if the group no longer exists
          // (e.g., was deleted by super admin), reset it to null.
          const persistedSelectedGroup = state.selectedGroupId;
          const groupStillExists = persistedSelectedGroup
            ? (data.availableCompanyGroups || []).some((g: CompanyGroupOption) => g.id === persistedSelectedGroup)
            : false;
          // If a specific company is selected, its group takes precedence over any
          // persisted group selection — we derive the group from the company.
          let selectedGroupId: string | null = null;
          if (selectedCompanyId) {
            const c = (data.availableCompanies || []).find((x: CompanyOption) => x.id === selectedCompanyId);
            selectedGroupId = c?.companyGroupId || null;
          } else if (groupStillExists) {
            selectedGroupId = persistedSelectedGroup;
          }

          set({
            hydrated: true,
            hydrating: false,
            lastFetchAt: Date.now(),
            lastError: null,
            role,
            tenantId: data.tenantId,
            tenant: data.tenant || null,
            tenantQuota: data.tenantQuota || null,
            ownCompanyId: data.ownCompanyId,
            ownCompany: data.ownCompany,
            availableTenants: data.availableTenants || [],
            availableCompanyGroups: data.availableCompanyGroups || [],
            availableCompanies: data.availableCompanies || [],
            selectedTenantId,
            selectedGroupId,
            selectedCompanyId,
          });
        } catch (e) {
          console.error('companyContext.hydrate error:', e);
          set({ hydrating: false, hydrated: true, lastError: 'Network error — click refresh to retry.', lastFetchAt: Date.now() });
        }
      },

      refreshContext: async () => {
        // Always force a fresh fetch — used by the Refresh button in the
        // CompanySwitcher dropdown and after mutations (create tenant, etc.).
        await get().hydrate(true);
      },

      refreshCompaniesFor: async (tenantId: string) => {
        try {
          const res = await fetch(`/api/me/context?tenantId=${encodeURIComponent(tenantId)}`, { headers: getAuthHeaders() });
          if (!res.ok) return;
          const data = await res.json();
          set({
            availableCompanyGroups: data.availableCompanyGroups || [],
            availableCompanies: data.availableCompanies || [],
            selectedTenantId: tenantId,
            selectedGroupId: null,    // reset on tenant change
            selectedCompanyId: null,  // reset on tenant change
          });
        } catch (e) {
          console.error('companyContext.refreshCompaniesFor error:', e);
        }
      },

      setSelectedTenant: async (tenantId: string) => {
        // Re-fetch companies for the new tenant
        await get().refreshCompaniesFor(tenantId);
      },

      setSelectedGroup: (groupId: string | null) => {
        // Selecting a group clears any specific company selection (the company
        // would override the group). When clearing the group we also clear the
        // company for consistency.
        set({ selectedGroupId: groupId, selectedCompanyId: null });
      },

      setSelectedCompany: (companyId: string | null) => {
        // Selecting a specific company automatically derives its group, so the
        // group is always consistent with the picked company.
        const s = get();
        if (companyId) {
          const c = s.availableCompanies.find((x) => x.id === companyId);
          set({ selectedCompanyId: companyId, selectedGroupId: c?.companyGroupId || null });
        } else {
          // Clearing the company keeps the current group selection intact so
          // the user can fall back to "all companies in this group".
          set({ selectedCompanyId: null });
        }
      },

      setRole: (role: string) => {
        // Sync role from authStore.user.role — this ensures the context store
        // knows the correct role even before /api/me/context finishes hydrating,
        // which prevents the "Not yet assigned" flash in the CompanySwitcher.
        const r = (role || 'employee').toLowerCase();
        set((s) => (s.role === r ? s : { ...s, role: r }));
      },

      reset: () => {
        set({
          hydrated: false,
          hydrating: false,
          lastFetchAt: null,
          lastError: null,
          tenant: null,
          tenantQuota: null,
          availableTenants: [],
          availableCompanyGroups: [],
          availableCompanies: [],
          selectedTenantId: null,
          selectedGroupId: null,
          selectedCompanyId: null,
        });
      },

      effectiveCompanyId: () => {
        const s = get();
        const r = s.role;
        if (r === 'super_admin' || r === 'tenant_admin') {
          // Admin can choose to view "all companies" (null) or a specific one
          return s.selectedCompanyId;
        }
        return s.ownCompanyId;
      },

      effectiveGroupId: () => {
        const s = get();
        const r = s.role;
        if (r === 'super_admin' || r === 'tenant_admin') {
          // If a specific company is selected, its group is implied.
          if (s.selectedCompanyId) {
            const c = s.availableCompanies.find((x) => x.id === s.selectedCompanyId);
            return c?.companyGroupId || s.selectedGroupId || null;
          }
          return s.selectedGroupId;
        }
        // Non-admins: derive from their own company.
        if (s.ownCompanyId) {
          const c = s.availableCompanies.find((x) => x.id === s.ownCompanyId);
          return c?.companyGroupId || null;
        }
        return null;
      },

      effectiveCompanyLabel: (userRole?: string) => {
        const s = get();
        // Prefer the explicitly passed userRole (from authStore.user.role) —
        // this is set immediately after login, whereas s.role is only set
        // after /api/me/context hydrates. Without this, the CompanySwitcher
        // would briefly show "Not yet assigned" for tenant_admin right after
        // page reload.
        const r = (userRole || s.role || 'employee').toLowerCase();
        if (r === 'super_admin' || r === 'tenant_admin') {
          // Most specific: a single company
          if (s.selectedCompanyId) {
            const c = s.availableCompanies.find((x) => x.id === s.selectedCompanyId);
            return c?.name || 'Unknown company';
          }
          // Next: a group company ("all companies in this group")
          if (s.selectedGroupId) {
            const g = s.availableCompanyGroups.find((x) => x.id === s.selectedGroupId);
            if (g) return `${g.name} (group)`;
          }
          // Broadest: all companies in the tenant/parent
          if (r === 'tenant_admin') {
            return s.tenant?.name ? `${s.tenant.name} (all)` : 'All companies (group)';
          }
          const t = s.availableTenants.find((x) => x.id === s.selectedTenantId);
          return t ? `${t.name} (all)` : 'All parents';
        }
        return s.ownCompany?.name || 'Not yet assigned';
      },

      canSwitch: (userRole?: string) => {
        const r = (userRole || get().role || 'employee').toLowerCase();
        return r === 'super_admin' || r === 'tenant_admin';
      },

      selectedTenant: () => {
        const s = get();
        return s.availableTenants.find((t) => t.id === s.selectedTenantId) || null;
      },

      selectedCompanyGroup: () => {
        const s = get();
        if (!s.selectedCompanyId) return null;
        const c = s.availableCompanies.find((x) => x.id === s.selectedCompanyId);
        if (!c) return null;
        return s.availableCompanyGroups.find((g) => g.id === c.companyGroupId) || null;
      },
    }),
    {
      name: 'tb_company_ctx',
      storage: createJSONStorage(() => localStorage),
      // Persist the user's selection AND role — role is needed so the
      // CompanySwitcher can render the correct label/button immediately on
      // page load, before /api/me/context has hydrated. Without persisting
      // role, tenant_admin would briefly see "Not yet assigned" on every
      // page navigation.
      partialize: (s) => ({
        selectedTenantId: s.selectedTenantId,
        selectedGroupId: s.selectedGroupId,
        selectedCompanyId: s.selectedCompanyId,
        role: s.role,
        tenantId: s.tenantId,
        ownCompanyId: s.ownCompanyId,
        ownCompany: s.ownCompany,
        tenant: s.tenant,
      }),
    }
  )
);
