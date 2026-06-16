'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface TenantOption {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

export interface CompanyGroupOption {
  id: string;
  name: string;
  tenantId: string;
}

export interface CompanyOption {
  id: string;
  name: string;
  code: string | null;
  companyGroupId: string;
  companyGroup: { id: string; name: string };
  _count?: { branches: number };
}

export interface OwnCompanyInfo {
  id: string;
  name: string;
  code: string | null;
}

interface CompanyContextState {
  // Hydrated from /api/me/context
  hydrated: boolean;
  role: string;
  tenantId: string | null;
  ownCompanyId: string | null;
  ownCompany: OwnCompanyInfo | null;
  availableTenants: TenantOption[];
  availableCompanyGroups: CompanyGroupOption[];
  availableCompanies: CompanyOption[];

  // User's current selection (admins only)
  selectedTenantId: string | null;
  selectedCompanyId: string | null;

  // Actions
  hydrate: (force?: boolean) => Promise<void>;
  refreshCompaniesFor: (tenantId: string) => Promise<void>;
  setSelectedTenant: (tenantId: string) => Promise<void>;
  setSelectedCompany: (companyId: string | null) => void;
  reset: () => void;

  // Selectors
  effectiveCompanyId: () => string | null;
  effectiveCompanyLabel: () => string;
  canSwitch: () => boolean;
}

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export const useCompanyContextStore = create<CompanyContextState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      role: 'employee',
      tenantId: null,
      ownCompanyId: null,
      ownCompany: null,
      availableTenants: [],
      availableCompanyGroups: [],
      availableCompanies: [],
      selectedTenantId: null,
      selectedCompanyId: null,

      hydrate: async (force?: boolean) => {
        const state = get();
        if (state.hydrated && !force) return;
        try {
          const res = await fetch('/api/me/context', { headers: getAuthHeaders() });
          if (!res.ok) {
            set({ hydrated: true });
            return;
          }
          const data = await res.json();
          const role = data.role || 'employee';
          const canSwitch = role === 'super_admin' || role === 'tenant_admin';

          // Default the selected tenant to the caller's tenant for tenant_admin,
          // or to the first available for super_admin (if a previous selection
          // is not persisted).
          const persistedSelectedTenant = state.selectedTenantId;
          let selectedTenantId: string | null = null;
          if (canSwitch) {
            if (role === 'super_admin') {
              selectedTenantId = persistedSelectedTenant || data.tenantId || data.availableTenants?.[0]?.id || null;
            } else {
              selectedTenantId = data.tenantId;
            }
          } else {
            selectedTenantId = data.tenantId;
          }

          // For non-admins, the effective company is always their own.
          const selectedCompanyId = canSwitch ? state.selectedCompanyId : data.ownCompanyId;

          set({
            hydrated: true,
            role,
            tenantId: data.tenantId,
            ownCompanyId: data.ownCompanyId,
            ownCompany: data.ownCompany,
            availableTenants: data.availableTenants || [],
            availableCompanyGroups: data.availableCompanyGroups || [],
            availableCompanies: data.availableCompanies || [],
            selectedTenantId,
            selectedCompanyId,
          });
        } catch (e) {
          console.error('companyContext.hydrate error:', e);
          set({ hydrated: true });
        }
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
            selectedCompanyId: null, // reset on tenant change
          });
        } catch (e) {
          console.error('companyContext.refreshCompaniesFor error:', e);
        }
      },

      setSelectedTenant: async (tenantId: string) => {
        // Re-fetch companies for the new tenant
        await get().refreshCompaniesFor(tenantId);
      },

      setSelectedCompany: (companyId: string | null) => {
        set({ selectedCompanyId: companyId });
      },

      reset: () => {
        set({
          hydrated: false,
          availableTenants: [],
          availableCompanyGroups: [],
          availableCompanies: [],
          selectedTenantId: null,
          selectedCompanyId: null,
        });
      },

      effectiveCompanyId: () => {
        const s = get();
        if (s.role === 'super_admin' || s.role === 'tenant_admin') {
          // Admin can choose to view "all companies" (null) or a specific one
          return s.selectedCompanyId;
        }
        return s.ownCompanyId;
      },

      effectiveCompanyLabel: () => {
        const s = get();
        if (s.role === 'super_admin' || s.role === 'tenant_admin') {
          if (s.selectedCompanyId) {
            const c = s.availableCompanies.find((x) => x.id === s.selectedCompanyId);
            return c?.name || 'Unknown company';
          }
          // No specific selection: show group/tenant-level label
          if (s.role === 'tenant_admin') return 'All companies (group)';
          const t = s.availableTenants.find((x) => x.id === s.selectedTenantId);
          return t ? `${t.name} (all companies)` : 'All companies';
        }
        return s.ownCompany?.name || 'My company';
      },

      canSwitch: () => {
        const r = get().role;
        return r === 'super_admin' || r === 'tenant_admin';
      },
    }),
    {
      name: 'tb_company_ctx',
      storage: createJSONStorage(() => localStorage),
      // Only persist the user's selection — re-hydrate lists from the API each session
      partialize: (s) => ({
        selectedTenantId: s.selectedTenantId,
        selectedCompanyId: s.selectedCompanyId,
      }),
    }
  )
);
