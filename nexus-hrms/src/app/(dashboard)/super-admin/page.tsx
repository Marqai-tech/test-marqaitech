'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiShield, FiGrid, FiServer, FiCreditCard, FiFileText, FiSettings,
  FiPlus, FiX, FiEdit2, FiTrash2, FiSearch, FiEye, FiCheckCircle,
  FiXCircle, FiUsers, FiDollarSign, FiActivity, FiClock, FiAlertTriangle,
  FiRefreshCw, FiZap, FiMonitor, FiGlobe,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
function getStatusBadge(s: string) {
  if (s === 'active' || s === 'paid') return 'nexus-badge nexus-badge-success';
  if (s === 'suspended' || s === 'expired' || s === 'overdue' || s === 'cancelled') return 'nexus-badge nexus-badge-error';
  if (s === 'trial' || s === 'pending') return 'nexus-badge nexus-badge-warning';
  return 'nexus-badge';
}

const tabs = [
  { key: 'dashboard', label: 'Platform Dashboard', icon: FiGrid },
  { key: 'tenants', label: 'Tenant Management', icon: FiServer },
  { key: 'plans', label: 'Subscription Plans', icon: FiCreditCard },
  { key: 'audit', label: 'Audit Logs', icon: FiFileText },
  { key: 'settings', label: 'Platform Settings', icon: FiSettings },
];

/* ─── PLATFORM DASHBOARD TAB ─── */
interface TenantStats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalCompanies: number;
  totalEmployees: number;
  platformRevenue: number;
}
function DashboardTab() {
  const [stats, setStats] = useState<TenantStats>({ totalTenants: 0, activeTenants: 0, suspendedTenants: 0, totalCompanies: 0, totalEmployees: 0, platformRevenue: 0 });
  const [recentTenants, setRecentTenants] = useState<{ id: string; name: string; companyName: string | null; plan: string; status: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tenants?limit=5', { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setStats(d.stats || { totalTenants: 0, activeTenants: 0, suspendedTenants: 0, totalCompanies: 0, totalEmployees: 0, platformRevenue: 0 });
        setRecentTenants(d.tenants || []);
      }
    } catch { toast.error('Failed to load dashboard'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const statCards = [
    { label: 'Total Tenants', value: stats.totalTenants, icon: FiServer, color: 'blue' },
    { label: 'Active Tenants', value: stats.activeTenants, icon: FiCheckCircle, color: 'emerald' },
    { label: 'Suspended Tenants', value: stats.suspendedTenants, icon: FiXCircle, color: 'red' },
    { label: 'Total Companies', value: stats.totalCompanies, icon: FiGlobe, color: 'violet' },
    { label: 'Total Employees', value: stats.totalEmployees, icon: FiUsers, color: 'amber' },
    { label: 'Platform Revenue', value: `$${stats.platformRevenue.toLocaleString()}`, icon: FiDollarSign, color: 'green' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-nexus-text-primary">Platform Dashboard</h2><p className="text-nexus-text-secondary text-sm">Overview of the NEXUS HRMS platform</p></div>
        <button onClick={fetchData} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100" title="Refresh"><FiRefreshCw className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(s => (
          <div key={s.label} className="nexus-card p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-${s.color}-50 flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 text-${s.color}-500`} />
              </div>
              <div>
                <p className="text-lg font-bold text-nexus-text-primary">{s.value}</p>
                <p className="text-xs text-nexus-text-muted">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="nexus-card p-6">
          <h3 className="text-lg font-semibold text-nexus-text-primary mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => window.dispatchEvent(new CustomEvent('nexus-switch-tab', { detail: 'tenants' }))} className="flex items-center gap-3 p-3 rounded-lg border border-nexus-border hover:bg-slate-50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center"><FiPlus className="w-4 h-4 text-blue-500" /></div>
              <span className="text-sm font-medium text-nexus-text-primary">Create Tenant</span>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('nexus-switch-tab', { detail: 'audit' }))} className="flex items-center gap-3 p-3 rounded-lg border border-nexus-border hover:bg-slate-50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center"><FiFileText className="w-4 h-4 text-amber-500" /></div>
              <span className="text-sm font-medium text-nexus-text-primary">View Audit Logs</span>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('nexus-switch-tab', { detail: 'plans' }))} className="flex items-center gap-3 p-3 rounded-lg border border-nexus-border hover:bg-slate-50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center"><FiCreditCard className="w-4 h-4 text-violet-500" /></div>
              <span className="text-sm font-medium text-nexus-text-primary">Manage Plans</span>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('nexus-switch-tab', { detail: 'settings' }))} className="flex items-center gap-3 p-3 rounded-lg border border-nexus-border hover:bg-slate-50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center"><FiSettings className="w-4 h-4 text-emerald-500" /></div>
              <span className="text-sm font-medium text-nexus-text-primary">Platform Settings</span>
            </button>
          </div>
        </div>

        {/* Recent Tenants */}
        <div className="nexus-card p-6">
          <h3 className="text-lg font-semibold text-nexus-text-primary mb-4">Recent Tenant Registrations</h3>
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : recentTenants.length === 0 ? (
            <div className="text-center py-8"><FiServer className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary text-sm">No tenants registered yet</p></div>
          ) : (
            <div className="space-y-3">
              {recentTenants.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center"><FiServer className="w-4 h-4 text-emerald-500" /></div>
                    <div>
                      <p className="text-sm font-medium text-nexus-text-primary">{t.name}</p>
                      <p className="text-xs text-nexus-text-muted">{t.companyName || 'No company'} · {t.plan}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={getStatusBadge(t.status)}>{t.status}</span>
                    <span className="text-xs text-nexus-text-muted">{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── TENANT MANAGEMENT TAB ─── */
interface Tenant {
  id: string; name: string; slug: string; domain: string | null; tenantType: string;
  companyName: string | null; legalName: string | null; industry: string | null;
  country: string | null; currency: string; adminName: string | null; adminEmail: string | null;
  adminMobile: string | null; plan: string; employeeLimit: number; userLimit: number;
  storageLimit: number; aiCreditLimit: number;
  trialStartDate: string | null; trialEndDate: string | null;
  subscriptionStartDate: string | null; subscriptionEndDate: string | null;
  billingCycle: string; paymentStatus: string; status: string; timezone: string;
  createdAt: string;
  _count?: { users: number; companyGroups: number };
}

const tenantInitial: Record<string, string> = {
  name: '', slug: '', domain: '', tenantType: 'single_company',
  companyName: '', legalName: '', industry: '', country: '', currency: 'USD',
  adminName: '', adminEmail: '', adminMobile: '', plan: 'starter',
  employeeLimit: '50', userLimit: '10', storageLimit: '5', aiCreditLimit: '100',
  trialStartDate: '', trialEndDate: '', subscriptionStartDate: '', subscriptionEndDate: '',
  billingCycle: 'monthly', paymentStatus: 'pending', status: 'active', timezone: 'UTC',
};

function TenantsTab() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin';
  const [items, setItems] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(tenantInitial);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tenants?limit=100', { headers: getAuthHeaders() });
      if (res.ok) { const d = await res.json(); setItems(d.tenants || []); }
    } catch { toast.error('Failed to load tenants'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const handleOpenAdd = () => { setForm(tenantInitial); setEditingId(null); setShowForm(true); setViewingId(null); };
  const handleOpenEdit = (t: Tenant) => {
    setForm({
      name: t.name, slug: t.slug, domain: t.domain || '', tenantType: t.tenantType,
      companyName: t.companyName || '', legalName: t.legalName || '', industry: t.industry || '',
      country: t.country || '', currency: t.currency, adminName: t.adminName || '', adminEmail: t.adminEmail || '',
      adminMobile: t.adminMobile || '', plan: t.plan,
      employeeLimit: String(t.employeeLimit), userLimit: String(t.userLimit),
      storageLimit: String(t.storageLimit), aiCreditLimit: String(t.aiCreditLimit),
      trialStartDate: t.trialStartDate ? new Date(t.trialStartDate).toISOString().split('T')[0] : '',
      trialEndDate: t.trialEndDate ? new Date(t.trialEndDate).toISOString().split('T')[0] : '',
      subscriptionStartDate: t.subscriptionStartDate ? new Date(t.subscriptionStartDate).toISOString().split('T')[0] : '',
      subscriptionEndDate: t.subscriptionEndDate ? new Date(t.subscriptionEndDate).toISOString().split('T')[0] : '',
      billingCycle: t.billingCycle, paymentStatus: t.paymentStatus, status: t.status, timezone: t.timezone,
    });
    setEditingId(t.id); setShowForm(true); setViewingId(null);
  };
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm(tenantInitial); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Tenant name is required'); return; }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = { ...form, name: form.name.trim() };
      ['employeeLimit', 'userLimit', 'storageLimit', 'aiCreditLimit'].forEach(k => {
        payload[k] = parseInt(form[k]) || 0;
      });
      const url = editingId ? `/api/tenants/${editingId}` : '/api/tenants';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Tenant updated' : 'Tenant created');
      handleCancelForm(); fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try { setDeleting(true); const res = await fetch(`/api/tenants/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) throw new Error('Failed'); toast.success('Tenant deleted'); setDeleteConfirmId(null); fetchData(); } catch { toast.error('Failed to delete'); } finally { setDeleting(false); }
  };

  const filtered = items.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) || (t.companyName || '').toLowerCase().includes(search.toLowerCase()) || (t.adminEmail || '').toLowerCase().includes(search.toLowerCase()) || (t.domain || '').toLowerCase().includes(search.toLowerCase()));
  const viewingItem = viewingId ? items.find(t => t.id === viewingId) : null;

  const selectField = (label: string, key: string, options: { value: string; label: string }[]) => (
    <div>
      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">{label}</label>
      <select value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  const inputField = (label: string, key: string, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">{label}</label>
      <input type={type} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h2 className="text-xl font-bold text-nexus-text-primary">Tenant Management</h2><p className="text-nexus-text-secondary text-sm">Manage platform tenants and their configurations</p></div>
        {isAdmin && <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25"><FiPlus className="w-4 h-4" />Add Tenant</button>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiServer className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{items.length}</p><p className="text-xs text-nexus-text-muted">Total</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{items.filter(t => t.status === 'active').length}</p><p className="text-xs text-nexus-text-muted">Active</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><FiXCircle className="w-5 h-5 text-red-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{items.filter(t => t.status === 'suspended').length}</p><p className="text-xs text-nexus-text-muted">Suspended</p></div></div></div>
      </div>

      {viewingItem && (
        <div className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-nexus-text-primary">Tenant Details</h3><button onClick={() => setViewingId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                ['Tenant Name', viewingItem.name], ['Slug', viewingItem.slug], ['Domain', viewingItem.domain],
                ['Type', viewingItem.tenantType?.replace(/_/g, ' ')], ['Company', viewingItem.companyName], ['Legal Name', viewingItem.legalName],
                ['Industry', viewingItem.industry], ['Country', viewingItem.country], ['Currency', viewingItem.currency],
                ['Admin Name', viewingItem.adminName], ['Admin Email', viewingItem.adminEmail], ['Admin Mobile', viewingItem.adminMobile],
                ['Plan', viewingItem.plan], ['Employee Limit', viewingItem.employeeLimit], ['User Limit', viewingItem.userLimit],
                ['Storage (GB)', viewingItem.storageLimit], ['AI Credits', viewingItem.aiCreditLimit],
                ['Billing Cycle', viewingItem.billingCycle], ['Payment Status', viewingItem.paymentStatus],
                ['Timezone', viewingItem.timezone],
              ].map(([label, value]) => (
                <div key={String(label)}><p className="text-xs font-medium text-nexus-text-muted">{label}</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{value || '—'}</p></div>
              ))}
              <div><p className="text-xs font-medium text-nexus-text-muted">Trial Period</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.trialStartDate ? `${new Date(viewingItem.trialStartDate).toLocaleDateString()} - ${viewingItem.trialEndDate ? new Date(viewingItem.trialEndDate).toLocaleDateString() : '—'}` : '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Subscription Period</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.subscriptionStartDate ? `${new Date(viewingItem.subscriptionStartDate).toLocaleDateString()} - ${viewingItem.subscriptionEndDate ? new Date(viewingItem.subscriptionEndDate).toLocaleDateString() : '—'}` : '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Users</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingItem._count?.users ?? '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Company Groups</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingItem._count?.companyGroups ?? '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={() => setViewingId(null)} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="tenant-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Tenant' : 'Add Tenant'}</h3><button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button></div>
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 pb-2 border-b border-nexus-border/50">Basic Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inputField('Tenant Name *', 'name')}
                  {inputField('Slug (auto)', 'slug')}
                  {inputField('Domain/Subdomain', 'domain')}
                  {selectField('Tenant Type', 'tenantType', [
                    { value: 'single_company', label: 'Single Company' }, { value: 'multi_company_group', label: 'Multi-Company Group' },
                    { value: 'staffing_company', label: 'Staffing Company' }, { value: 'enterprise_group', label: 'Enterprise Group' },
                    { value: 'white_label_partner', label: 'White-Label Partner' },
                  ])}
                </div>
              </div>
              {/* Company Details */}
              <div>
                <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 pb-2 border-b border-nexus-border/50">Company Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inputField('Company Name', 'companyName')}
                  {inputField('Legal Name', 'legalName')}
                  {inputField('Industry', 'industry')}
                  {inputField('Country', 'country')}
                  {selectField('Currency', 'currency', [
                    { value: 'USD', label: 'USD' }, { value: 'INR', label: 'INR' }, { value: 'EUR', label: 'EUR' }, { value: 'GBP', label: 'GBP' },
                  ])}
                  {selectField('Timezone', 'timezone', [
                    { value: 'UTC', label: 'UTC' }, { value: 'Asia/Kolkata', label: 'IST (Asia/Kolkata)' }, { value: 'America/New_York', label: 'EST (New York)' }, { value: 'Europe/London', label: 'GMT (London)' },
                  ])}
                </div>
              </div>
              {/* Admin Info */}
              <div>
                <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 pb-2 border-b border-nexus-border/50">Admin Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inputField('Admin Name', 'adminName')}
                  {inputField('Admin Email', 'adminEmail', 'email')}
                  {inputField('Admin Mobile', 'adminMobile')}
                </div>
              </div>
              {/* Subscription */}
              <div>
                <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 pb-2 border-b border-nexus-border/50">Subscription & Limits</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectField('Subscription Plan', 'plan', [
                    { value: 'starter', label: 'Starter' }, { value: 'professional', label: 'Professional' },
                    { value: 'enterprise', label: 'Enterprise' }, { value: 'global_enterprise', label: 'Global Enterprise' },
                    { value: 'staffing_suite', label: 'Staffing Suite' }, { value: 'white_label', label: 'White Label' },
                  ])}
                  {inputField('Employee Limit', 'employeeLimit', 'number')}
                  {inputField('User Limit', 'userLimit', 'number')}
                  {inputField('Storage Limit (GB)', 'storageLimit', 'number')}
                  {inputField('AI Credit Limit', 'aiCreditLimit', 'number')}
                  {selectField('Billing Cycle', 'billingCycle', [
                    { value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' },
                  ])}
                  {selectField('Payment Status', 'paymentStatus', [
                    { value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' },
                    { value: 'overdue', label: 'Overdue' }, { value: 'cancelled', label: 'Cancelled' },
                  ])}
                </div>
              </div>
              {/* Dates */}
              <div>
                <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 pb-2 border-b border-nexus-border/50">Trial & Subscription Dates</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {inputField('Trial Start', 'trialStartDate', 'date')}
                  {inputField('Trial End', 'trialEndDate', 'date')}
                  {inputField('Subscription Start', 'subscriptionStartDate', 'date')}
                  {inputField('Subscription End', 'subscriptionEndDate', 'date')}
                </div>
              </div>
              {/* Status */}
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectField('Tenant Status', 'status', [
                    { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' },
                    { value: 'trial', label: 'Trial' }, { value: 'expired', label: 'Expired' },
                  ])}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Search tenants by name, company, email, domain..." /></div>

      <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
        {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="nexus-card border-l-4 border-l-emerald-500 p-4 animate-pulse"><div className="h-4 w-48 bg-slate-200 rounded mb-2" /><div className="h-3 w-32 bg-slate-100 rounded" /></div>)
        : filtered.length === 0 ? (
          <div className="nexus-card p-12 text-center"><FiServer className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No tenants found</p></div>
        )
        : filtered.map(t => (
          <div key={t.id} className="nexus-card border-l-4 border-l-emerald-500">
            {deleteConfirmId === t.id ? (
              <div className="p-4 bg-red-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-700 font-medium">Delete &quot;{t.name}&quot;? This will remove all associated data.</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleDelete(t.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                    <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0"><FiServer className="w-5 h-5 text-emerald-500" /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-nexus-text-primary">{t.name}</p>
                        <span className={getStatusBadge(t.status)}>{t.status}</span>
                      </div>
                      <p className="text-xs text-nexus-text-muted">{t.companyName || 'No company'} · {t.plan} · {t.billingCycle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-4 text-xs text-nexus-text-muted">
                      <span className="flex items-center gap-1"><FiUsers className="w-3 h-3" />{t._count?.users ?? 0} users</span>
                      <span className="flex items-center gap-1"><FiGlobe className="w-3 h-3" />{t.country || '—'}</span>
                      <span className="flex items-center gap-1"><FiZap className="w-3 h-3" />{t.employeeLimit} emp</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewingId(t.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50" title="View"><FiEye className="w-4 h-4" /></button>
                      {isAdmin && (<>
                        <button onClick={() => handleOpenEdit(t)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteConfirmId(t.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                      </>)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── SUBSCRIPTION PLANS TAB ─── */
interface SubPlan {
  id: string; packageName: string; planType: string;
  monthlyPrice: number; annualPrice: number;
  employeeLimit: number; companyLimit: number; branchLimit: number;
  storageLimit: number; aiInterviewLimit: number; aiChatbotLimit: number;
  payrollEnabled: boolean; recruitmentEnabled: boolean; attendanceEnabled: boolean;
  projectEnabled: boolean; clientPortalEnabled: boolean; vendorPortalEnabled: boolean;
  mobileAppEnabled: boolean; apiAccessEnabled: boolean; whiteLabelEnabled: boolean;
  supportLevel: string; status: string;
}

const planInitial: Record<string, string | boolean> = {
  packageName: '', planType: 'starter', monthlyPrice: '0', annualPrice: '0',
  employeeLimit: '50', companyLimit: '1', branchLimit: '1', storageLimit: '5',
  aiInterviewLimit: '10', aiChatbotLimit: '100',
  payrollEnabled: false, recruitmentEnabled: false, attendanceEnabled: true,
  projectEnabled: false, clientPortalEnabled: false, vendorPortalEnabled: false,
  mobileAppEnabled: false, apiAccessEnabled: false, whiteLabelEnabled: false,
  supportLevel: 'standard', status: 'active',
};

function PlansTab() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin';
  const [items, setItems] = useState<SubPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>(planInitial);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try { setLoading(true); const res = await fetch('/api/subscription-plans?limit=100', { headers: getAuthHeaders() }); if (res.ok) { const d = await res.json(); setItems(d.subscriptionPlans || []); } } catch { toast.error('Failed to load plans'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const handleOpenAdd = () => { setForm(planInitial); setEditingId(null); setShowForm(true); setViewingId(null); };
  const handleOpenEdit = (p: SubPlan) => {
    setForm({
      packageName: p.packageName, planType: p.planType,
      monthlyPrice: String(p.monthlyPrice), annualPrice: String(p.annualPrice),
      employeeLimit: String(p.employeeLimit), companyLimit: String(p.companyLimit),
      branchLimit: String(p.branchLimit), storageLimit: String(p.storageLimit),
      aiInterviewLimit: String(p.aiInterviewLimit), aiChatbotLimit: String(p.aiChatbotLimit),
      payrollEnabled: p.payrollEnabled, recruitmentEnabled: p.recruitmentEnabled,
      attendanceEnabled: p.attendanceEnabled, projectEnabled: p.projectEnabled,
      clientPortalEnabled: p.clientPortalEnabled, vendorPortalEnabled: p.vendorPortalEnabled,
      mobileAppEnabled: p.mobileAppEnabled, apiAccessEnabled: p.apiAccessEnabled,
      whiteLabelEnabled: p.whiteLabelEnabled, supportLevel: p.supportLevel, status: p.status,
    });
    setEditingId(p.id); setShowForm(true); setViewingId(null);
  };
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm(planInitial); };

  const handleSubmit = async () => {
    if (!form.packageName?.toString().trim()) { toast.error('Package name is required'); return; }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {};
      Object.entries(form).forEach(([k, v]) => {
        if (typeof v === 'boolean') payload[k] = v;
        else if (['monthlyPrice', 'annualPrice'].includes(k)) payload[k] = parseFloat(v as string) || 0;
        else if (['employeeLimit', 'companyLimit', 'branchLimit', 'storageLimit', 'aiInterviewLimit', 'aiChatbotLimit'].includes(k)) payload[k] = parseInt(v as string) || 0;
        else payload[k] = v;
      });
      const url = editingId ? `/api/subscription-plans/${editingId}` : '/api/subscription-plans';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Plan updated' : 'Plan created');
      handleCancelForm(); fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try { setDeleting(true); const res = await fetch(`/api/subscription-plans/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) throw new Error('Failed'); toast.success('Plan deleted'); setDeleteConfirmId(null); fetchData(); } catch { toast.error('Failed to delete'); } finally { setDeleting(false); }
  };

  const viewingItem = viewingId ? items.find(p => p.id === viewingId) : null;

  const toggleField = (label: string, key: string) => (
    <div className="flex items-center justify-between p-3 rounded-lg border border-nexus-border/50">
      <span className="text-sm text-nexus-text-primary">{label}</span>
      <button type="button" onClick={() => setForm(p => ({ ...p, [key]: !p[key] }))} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form[key] ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${form[key] ? 'translate-x-4' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h2 className="text-xl font-bold text-nexus-text-primary">Subscription Plans</h2><p className="text-nexus-text-secondary text-sm">Manage SaaS subscription packages and features</p></div>
        {isAdmin && <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25"><FiPlus className="w-4 h-4" />Add Plan</button>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiCreditCard className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{items.length}</p><p className="text-xs text-nexus-text-muted">Total Plans</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{items.filter(p => p.status === 'active').length}</p><p className="text-xs text-nexus-text-muted">Active</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiDollarSign className="w-5 h-5 text-amber-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">${items.reduce((s, p) => s + (p.monthlyPrice || 0), 0).toLocaleString()}</p><p className="text-xs text-nexus-text-muted">Total MRR</p></div></div></div>
      </div>

      {viewingItem && (
        <div className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-nexus-text-primary">Plan Details: {viewingItem.packageName}</h3><button onClick={() => setViewingId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                ['Package Name', viewingItem.packageName], ['Plan Type', viewingItem.planType],
                ['Monthly Price', `$${viewingItem.monthlyPrice}`], ['Annual Price', `$${viewingItem.annualPrice}`],
                ['Employee Limit', viewingItem.employeeLimit], ['Company Limit', viewingItem.companyLimit],
                ['Branch Limit', viewingItem.branchLimit], ['Storage (GB)', viewingItem.storageLimit],
                ['AI Interview Limit', viewingItem.aiInterviewLimit], ['AI Chatbot Limit', viewingItem.aiChatbotLimit],
                ['Support Level', viewingItem.supportLevel],
              ].map(([label, value]) => (
                <div key={String(label)}><p className="text-xs font-medium text-nexus-text-muted">{label}</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{value}</p></div>
              ))}
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status}</span></p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border">
              <p className="text-xs font-medium text-nexus-text-muted mb-2">Feature Toggles</p>
              <div className="flex flex-wrap gap-2">
                {(['payrollEnabled', 'recruitmentEnabled', 'attendanceEnabled', 'projectEnabled', 'clientPortalEnabled', 'vendorPortalEnabled', 'mobileAppEnabled', 'apiAccessEnabled', 'whiteLabelEnabled'] as const).map(f => (
                  <span key={f} className={`text-xs px-2 py-1 rounded-full ${(viewingItem as unknown as Record<string, unknown>)[f] ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{f.replace('Enabled', '')}</span>
                ))}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={() => setViewingId(null)} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Plan' : 'Add Plan'}</h3><button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button></div>
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 pb-2 border-b border-nexus-border/50">Package Info</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Package Name *</label><input type="text" value={form.packageName as string} onChange={e => setForm(p => ({ ...p, packageName: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                  <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Plan Type</label><select value={form.planType as string} onChange={e => setForm(p => ({ ...p, planType: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option><option value="global_enterprise">Global Enterprise</option><option value="staffing_suite">Staffing Suite</option><option value="white_label">White Label</option>
                  </select></div>
                  <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label><select value={form.status as string} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="active">Active</option><option value="inactive">Inactive</option>
                  </select></div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 pb-2 border-b border-nexus-border/50">Pricing</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Monthly Price ($)</label><input type="number" value={form.monthlyPrice as string} onChange={e => setForm(p => ({ ...p, monthlyPrice: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                  <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Annual Price ($)</label><input type="number" value={form.annualPrice as string} onChange={e => setForm(p => ({ ...p, annualPrice: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 pb-2 border-b border-nexus-border/50">Limits</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    ['Employee Limit', 'employeeLimit'], ['Company Limit', 'companyLimit'], ['Branch Limit', 'branchLimit'],
                    ['Storage (GB)', 'storageLimit'], ['AI Interview Limit', 'aiInterviewLimit'], ['AI Chatbot Limit', 'aiChatbotLimit'],
                  ].map(([label, key]) => (
                    <div key={key}><label className="block text-xs font-medium text-nexus-text-secondary mb-1">{label}</label><input type="number" value={form[key] as string} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 pb-2 border-b border-nexus-border/50">Feature Toggles</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {toggleField('Payroll', 'payrollEnabled')}
                  {toggleField('Recruitment', 'recruitmentEnabled')}
                  {toggleField('Attendance', 'attendanceEnabled')}
                  {toggleField('Project', 'projectEnabled')}
                  {toggleField('Client Portal', 'clientPortalEnabled')}
                  {toggleField('Vendor Portal', 'vendorPortalEnabled')}
                  {toggleField('Mobile App', 'mobileAppEnabled')}
                  {toggleField('API Access', 'apiAccessEnabled')}
                  {toggleField('White Label', 'whiteLabelEnabled')}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 pb-2 border-b border-nexus-border/50">Support</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Support Level</label><select value={form.supportLevel as string} onChange={e => setForm(p => ({ ...p, supportLevel: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="standard">Standard</option><option value="priority">Priority</option><option value="dedicated">Dedicated</option><option value="24/7">24/7</option>
                  </select></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="nexus-card border-l-4 border-l-emerald-500 p-4 animate-pulse"><div className="h-5 w-32 bg-slate-200 rounded mb-3" /><div className="h-3 w-20 bg-slate-100 rounded" /></div>)
        : items.length === 0 ? (
          <div className="col-span-full nexus-card p-12 text-center"><FiCreditCard className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No subscription plans found</p></div>
        )
        : items.map(p => (
          <div key={p.id} className="nexus-card border-l-4 border-l-emerald-500">
            {deleteConfirmId === p.id ? (
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-red-700 font-medium mb-2">Delete &quot;{p.packageName}&quot;?</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDelete(p.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                  <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-nexus-text-primary">{p.packageName}</p>
                    <p className="text-xs text-nexus-text-muted">{p.planType.replace(/_/g, ' ')} · {p.supportLevel} support</p>
                  </div>
                  <span className={getStatusBadge(p.status)}>{p.status}</span>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-2xl font-bold text-nexus-text-primary">${p.monthlyPrice}</span>
                  <span className="text-xs text-nexus-text-muted">/mo</span>
                  <span className="text-sm text-nexus-text-muted ml-2">${p.annualPrice}/yr</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {[
                    [p.employeeLimit, 'emp'], [p.companyLimit, 'co'], [p.branchLimit, 'br'], [p.storageLimit, 'GB'],
                  ].map(([v, u]) => (
                    <span key={String(u)} className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-nexus-text-secondary">{v} {u}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(['payrollEnabled', 'recruitmentEnabled', 'attendanceEnabled', 'projectEnabled', 'clientPortalEnabled', 'vendorPortalEnabled', 'mobileAppEnabled', 'apiAccessEnabled', 'whiteLabelEnabled'] as const).filter(f => p[f]).map(f => (
                    <span key={f} className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{f.replace('Enabled', '')}</span>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-1 pt-3 border-t border-nexus-border/50">
                  <button onClick={() => setViewingId(p.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50" title="View"><FiEye className="w-4 h-4" /></button>
                  {isAdmin && (<>
                    <button onClick={() => handleOpenEdit(p)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                    <button onClick={() => setDeleteConfirmId(p.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                  </>)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── AUDIT LOGS TAB ─── */
interface AuditLogEntry {
  id: string; userId: string | null; action: string; module: string;
  details: string | null; ip: string | null; userAgent: string | null; createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

function AuditTab() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (filterModule) params.set('module', filterModule);
      if (filterAction) params.set('action', filterAction);
      const res = await fetch(`/api/audit-logs?${params}`, { headers: getAuthHeaders() });
      if (res.ok) { const d = await res.json(); setItems(d.auditLogs || []); }
    } catch { toast.error('Failed to load audit logs'); } finally { setLoading(false); }
  }, [filterModule, filterAction]);
  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const filtered = items.filter(l => !search || (l.user?.name || '').toLowerCase().includes(search.toLowerCase()) || l.action.toLowerCase().includes(search.toLowerCase()) || l.module.toLowerCase().includes(search.toLowerCase()) || (l.details || '').toLowerCase().includes(search.toLowerCase()));

  const uniqueModules = [...new Set(items.map(l => l.module))];
  const uniqueActions = [...new Set(items.map(l => l.action))];

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-nexus-text-primary">Audit Logs</h2><p className="text-nexus-text-secondary text-sm">Track all platform activities and changes</p></div>

      <div className="grid grid-cols-3 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiFileText className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{items.length}</p><p className="text-xs text-nexus-text-muted">Total Logs</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiActivity className="w-5 h-5 text-amber-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{uniqueModules.length}</p><p className="text-xs text-nexus-text-muted">Modules</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center"><FiZap className="w-5 h-5 text-violet-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{uniqueActions.length}</p><p className="text-xs text-nexus-text-muted">Action Types</p></div></div></div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Search logs..." /></div>
        <select value={filterModule} onChange={e => setFilterModule(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-w-[150px]">
          <option value="">All Modules</option>{uniqueModules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-w-[150px]">
          <option value="">All Actions</option>{uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={fetchData} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm hover:bg-slate-50 flex items-center gap-1"><FiRefreshCw className="w-4 h-4" />Refresh</button>
      </div>

      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-nexus-border bg-slate-50/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Timestamp</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Action</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Module</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Details</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">IP</th>
            </tr></thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (<tr key={i} className="border-b border-nexus-border/50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td></tr>))
              : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center"><FiFileText className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No audit logs found</p></td></tr>
              ) : filtered.map(l => (
                <tr key={l.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-nexus-text-muted whitespace-nowrap"><FiClock className="w-3 h-3 inline mr-1" />{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{l.user?.name || 'System'}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${l.action.includes('delete') ? 'bg-red-50 text-red-700' : l.action.includes('create') ? 'bg-emerald-50 text-emerald-700' : l.action.includes('update') || l.action.includes('edit') ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{l.action}</span></td>
                  <td className="px-4 py-3 text-sm text-nexus-text-secondary">{l.module}</td>
                  <td className="px-4 py-3 text-sm text-nexus-text-muted max-w-[200px] truncate">{l.details || '—'}</td>
                  <td className="px-4 py-3 text-sm text-nexus-text-muted font-mono text-xs">{l.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── PLATFORM SETTINGS TAB ─── */
function SettingsTab() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin';
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    platformName: 'NEXUS HRMS', platformTagline: 'Enterprise Human Resource Management System',
    supportEmail: 'support@nexushrms.com', defaultPlan: 'starter',
    aiDailyLimit: '1000', aiMonthlyLimit: '20000',
    maxTenants: '500', trialDays: '14',
    maintenanceMode: false, registrationOpen: true,
  });

  const handleSave = async () => {
    try {
      setSaving(true);
      // Store settings as a Policy with category "platform_settings"
      const res = await fetch('/api/policies', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: 'Platform Settings',
          category: 'platform_settings',
          description: 'Global platform configuration',
          content: JSON.stringify(settings),
          version: '1.0',
          status: 'active',
        }),
      });
      if (!res.ok) {
        // Try update via policies list
        const listRes = await fetch('/api/policies?category=platform_settings&limit=1', { headers: getAuthHeaders() });
        if (listRes.ok) {
          const d = await listRes.json();
          const existing = d.policies?.[0];
          if (existing) {
            await fetch(`/api/policies/${existing.id}`, {
              method: 'PATCH',
              headers: getAuthHeaders(),
              body: JSON.stringify({ content: JSON.stringify(settings) }),
            });
          }
        }
      }
      toast.success('Platform settings saved');
    } catch { toast.error('Failed to save settings'); } finally { setSaving(false); }
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/policies?category=platform_settings&limit=1', { headers: getAuthHeaders() });
        if (res.ok) {
          const d = await res.json();
          const existing = d.policies?.[0];
          if (existing?.content) {
            const parsed = JSON.parse(existing.content);
            setSettings(prev => ({ ...prev, ...parsed }));
          }
        }
      } catch { /* empty */ }
    };
    loadSettings();
  }, []);

  const toggleField = (label: string, key: string, desc: string) => (
    <div className="flex items-center justify-between p-4 rounded-lg border border-nexus-border/50">
      <div><p className="text-sm font-medium text-nexus-text-primary">{label}</p><p className="text-xs text-nexus-text-muted">{desc}</p></div>
      <button type="button" onClick={() => setSettings(p => ({ ...p, [key]: !p[key as keyof typeof p] }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings[key as keyof typeof settings] ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings[key as keyof typeof settings] ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-nexus-text-primary">Platform Settings</h2><p className="text-nexus-text-secondary text-sm">Configure global platform settings and defaults</p></div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Platform Branding */}
        <div className="nexus-card p-6">
          <h3 className="text-lg font-semibold text-nexus-text-primary mb-4 flex items-center gap-2"><FiMonitor className="w-5 h-5 text-blue-500" />Platform Branding</h3>
          <div className="space-y-4">
            <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Platform Name</label><input type="text" value={settings.platformName} onChange={e => setSettings(p => ({ ...p, platformName: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" disabled={!isAdmin} /></div>
            <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Tagline</label><input type="text" value={settings.platformTagline} onChange={e => setSettings(p => ({ ...p, platformTagline: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" disabled={!isAdmin} /></div>
            <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Support Email</label><input type="email" value={settings.supportEmail} onChange={e => setSettings(p => ({ ...p, supportEmail: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" disabled={!isAdmin} /></div>
          </div>
        </div>

        {/* AI Usage Limits */}
        <div className="nexus-card p-6">
          <h3 className="text-lg font-semibold text-nexus-text-primary mb-4 flex items-center gap-2"><FiZap className="w-5 h-5 text-amber-500" />AI Usage Limits</h3>
          <div className="space-y-4">
            <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Daily AI Limit (per tenant)</label><input type="number" value={settings.aiDailyLimit} onChange={e => setSettings(p => ({ ...p, aiDailyLimit: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" disabled={!isAdmin} /></div>
            <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Monthly AI Limit (per tenant)</label><input type="number" value={settings.aiMonthlyLimit} onChange={e => setSettings(p => ({ ...p, aiMonthlyLimit: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" disabled={!isAdmin} /></div>
            <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Max Tenants</label><input type="number" value={settings.maxTenants} onChange={e => setSettings(p => ({ ...p, maxTenants: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" disabled={!isAdmin} /></div>
            <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Trial Period (days)</label><input type="number" value={settings.trialDays} onChange={e => setSettings(p => ({ ...p, trialDays: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" disabled={!isAdmin} /></div>
          </div>
        </div>

        {/* Default Subscription */}
        <div className="nexus-card p-6">
          <h3 className="text-lg font-semibold text-nexus-text-primary mb-4 flex items-center gap-2"><FiCreditCard className="w-5 h-5 text-violet-500" />Default Subscription</h3>
          <div className="space-y-4">
            <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Default Plan for New Tenants</label><select value={settings.defaultPlan} onChange={e => setSettings(p => ({ ...p, defaultPlan: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" disabled={!isAdmin}>
              <option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option><option value="global_enterprise">Global Enterprise</option><option value="staffing_suite">Staffing Suite</option><option value="white_label">White Label</option>
            </select></div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="nexus-card p-6">
          <h3 className="text-lg font-semibold text-nexus-text-primary mb-4 flex items-center gap-2"><FiSettings className="w-5 h-5 text-emerald-500" />Feature Toggles</h3>
          <div className="space-y-3">
            {toggleField('Maintenance Mode', 'maintenanceMode', 'Temporarily disable platform access for non-admins')}
            {toggleField('Open Registration', 'registrationOpen', 'Allow new tenant self-registration')}
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-end">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{saving ? 'Saving...' : 'Save Settings'}</button>
        </div>
      )}
    </div>
  );
}

/* ─── MAIN PAGE ─── */
export default function SuperAdminPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Listen for tab switch events from dashboard quick actions
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener('nexus-switch-tab', handler);
    return () => window.removeEventListener('nexus-switch-tab', handler);
  }, []);

  // Role check
  if (user && user.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <FiAlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-nexus-text-primary mb-2">Access Restricted</h2>
          <p className="text-nexus-text-secondary">This page is only accessible to Super Admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2"><FiShield className="w-6 h-6 text-red-500" />Super Admin</h1>
        <p className="text-nexus-text-secondary mt-1">Platform-wide management, tenant administration & system configuration</p>
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'tenants' && <TenantsTab />}
      {activeTab === 'plans' && <PlansTab />}
      {activeTab === 'audit' && <AuditTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}
