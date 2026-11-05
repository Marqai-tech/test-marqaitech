'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FiDatabase, FiServer, FiGlobe, FiFileText, FiLayers, FiUsers, FiShield } from 'react-icons/fi';
import ModuleTips from '@/components/ModuleTips';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  plan: string;
  status: string;
  country: string | null;
  currency: string;
  timezone: string;
  logo: string | null;
  language: string;
}

/**
 * Company Settings page — moved here from /settings > Company tab in Task 56.
 * Displays the current tenant (company) info as read-only. For company-structure
 * CRUD (branches, departments, designations, policies), see the linked pages.
 */
export default function CompanySettingsPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/tenants?limit=1', { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(j => setTenant(j.tenants?.[0] || null))
      .catch(() => setTenant(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
          <FiDatabase className="w-6 h-6 text-emerald-500" />
          Company Settings
        </h1>
        <p className="text-thb-text-secondary mt-1">Current tenant configuration</p>
      </div>

      <div className="thb-card">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <FiServer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-thb-text-primary">Tenant Information</h2>
              <p className="text-xs text-thb-text-muted">Platform-level tenant configuration (read-only)</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500" />
            </div>
          ) : tenant ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Company Name</label>
                <p className="px-3 py-2.5 text-sm text-thb-text-primary bg-slate-50 rounded-lg border border-thb-border/50">{tenant.name || 'Your Organization'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Slug</label>
                <p className="px-3 py-2.5 text-sm text-thb-text-primary bg-slate-50 rounded-lg border border-thb-border/50 font-mono">{tenant.slug}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Domain</label>
                <p className="px-3 py-2.5 text-sm text-thb-text-primary bg-slate-50 rounded-lg border border-thb-border/50">{tenant.domain || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Plan</label>
                <p className="px-3 py-2.5 text-sm text-thb-text-primary bg-slate-50 rounded-lg border border-thb-border/50 capitalize">{tenant.plan}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Status</label>
                <span className={`thb-badge ${tenant.status === 'active' ? 'thb-badge-success' : 'thb-badge-warning'}`}>{tenant.status}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Country</label>
                <p className="px-3 py-2.5 text-sm text-thb-text-primary bg-slate-50 rounded-lg border border-thb-border/50">{tenant.country || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Currency</label>
                <p className="px-3 py-2.5 text-sm text-thb-text-primary bg-slate-50 rounded-lg border border-thb-border/50">{tenant.currency || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Timezone</label>
                <p className="px-3 py-2.5 text-sm text-thb-text-primary bg-slate-50 rounded-lg border border-thb-border/50">{tenant.timezone || '—'}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <FiDatabase className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
              <p className="text-thb-text-secondary font-medium">No tenant information available</p>
              <p className="text-sm text-thb-text-muted mt-1">Tenant data will appear once configured</p>
            </div>
          )}
        </div>
      </div>

      {/* Cross-links to Company-structure CRUD pages */}
      <div className="thb-card p-5">
        <h2 className="text-base font-semibold text-thb-text-primary mb-3">Company Structure</h2>
        <p className="text-xs text-thb-text-muted mb-4">Manage multi-company setup, branches, departments, designations, and HR policies.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/company/companies" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
            <FiDatabase className="w-4 h-4 text-emerald-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-thb-text-primary">Companies</p>
              <p className="text-xs text-thb-text-muted">Multi-company list</p>
            </div>
          </Link>
          <Link href="/company/branches" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
            <FiGlobe className="w-4 h-4 text-cyan-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-thb-text-primary">Branches</p>
              <p className="text-xs text-thb-text-muted">Office locations</p>
            </div>
          </Link>
          <Link href="/company/departments" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
            <FiUsers className="w-4 h-4 text-amber-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-thb-text-primary">Departments</p>
              <p className="text-xs text-thb-text-muted">Org structure</p>
            </div>
          </Link>
          <Link href="/company/designations" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
            <FiLayers className="w-4 h-4 text-teal-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-thb-text-primary">Designations</p>
              <p className="text-xs text-thb-text-muted">Job titles</p>
            </div>
          </Link>
          <Link href="/company/policies" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors sm:col-span-2 lg:col-span-1">
            <FiFileText className="w-4 h-4 text-rose-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-thb-text-primary">HR Policies</p>
              <p className="text-xs text-thb-text-muted">Policy documents</p>
            </div>
          </Link>
          <Link href="/clients/settings" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors sm:col-span-2 lg:col-span-1">
            <FiShield className="w-4 h-4 text-slate-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-thb-text-primary">External Settings</p>
              <p className="text-xs text-thb-text-muted">Clients & external parties</p>
            </div>
          </Link>
        </div>
      </div>

      <ModuleTips
        moduleKey="company"
        title="Company Settings Tips"
        tips={[
          { title: 'Tenant Info is Read-Only', description: 'Tenant name, slug, domain, plan, and status are set at the platform level. Contact support to change them.' },
          { title: 'Multi-Company Setup', description: 'Use the Companies page to manage multiple employer entities within the same tenant.' },
          { title: 'Branches & Departments', description: 'Define office locations and org structure — these feed attendance geofencing, reporting hierarchies, and approval routing.' },
        ]}
      />
    </div>
  );
}
