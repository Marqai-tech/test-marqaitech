'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiServer,
  FiSettings,
  FiCreditCard,
  FiUsers,
  FiGitMerge,
  FiPlus,
  FiX,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiCheck,
  FiClock,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Tenant {
  id: string;
  name: string;
  plan: string;
  status: 'active' | 'trial' | 'suspended' | 'churned';
  users: number;
  mrr: number;
  createdAt: string;
  expiresAt: string | null;
}

interface CompanySettings {
  name: string;
  industry: string;
  size: string;
  timezone: string;
  locale: string;
  logo: string;
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  plan: string;
}

interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive' | 'invited';
  lastLogin: string;
}

interface WorkflowConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  trigger: string;
  lastRun: string | null;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getTenantStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'nexus-badge nexus-badge-success',
    trial: 'nexus-badge nexus-badge-warning',
    suspended: 'bg-orange-50 text-orange-700 nexus-badge',
    churned: 'nexus-badge nexus-badge-error',
  };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: status.charAt(0).toUpperCase() + status.slice(1) };
}

function getInvoiceStatusBadge(status: string) {
  const map: Record<string, string> = {
    paid: 'nexus-badge nexus-badge-success',
    pending: 'nexus-badge nexus-badge-warning',
    overdue: 'nexus-badge nexus-badge-error',
  };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: status.charAt(0).toUpperCase() + status.slice(1) };
}

function getUserStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'nexus-badge nexus-badge-success',
    inactive: 'bg-slate-100 text-slate-600 nexus-badge',
    invited: 'nexus-badge nexus-badge-warning',
  };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: status.charAt(0).toUpperCase() + status.slice(1) };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/* ── Demo Data ── */
const demoTenants: Tenant[] = [
  { id: '1', name: 'Acme Corp', plan: 'Enterprise', status: 'active', users: 250, mrr: 4999, createdAt: '2024-06-15', expiresAt: null },
  { id: '2', name: 'TechStart Inc', plan: 'Professional', status: 'active', users: 85, mrr: 1999, createdAt: '2025-01-10', expiresAt: null },
  { id: '3', name: 'GlobalHR Solutions', plan: 'Enterprise', status: 'active', users: 420, mrr: 7499, createdAt: '2024-03-22', expiresAt: null },
  { id: '4', name: 'InnovateCo', plan: 'Starter', status: 'trial', users: 12, mrr: 0, createdAt: '2026-02-28', expiresAt: '2026-03-28' },
  { id: '5', name: 'CloudNine Ltd', plan: 'Professional', status: 'trial', users: 28, mrr: 0, createdAt: '2026-03-01', expiresAt: '2026-04-01' },
  { id: '6', name: 'OldSchool Corp', plan: 'Starter', status: 'churned', users: 0, mrr: 0, createdAt: '2024-08-15', expiresAt: '2025-08-15' },
];

const demoSettings: CompanySettings = {
  name: '3 Boxes HRMS',
  industry: 'Human Resources Technology',
  size: '51-200',
  timezone: 'UTC+5:30 (IST)',
  locale: 'en-US',
  logo: '/logo.svg',
};

const demoInvoices: Invoice[] = [
  { id: 'INV-001', date: '2026-03-01', amount: 4999, status: 'paid', plan: 'Enterprise' },
  { id: 'INV-002', date: '2026-02-01', amount: 4999, status: 'paid', plan: 'Enterprise' },
  { id: 'INV-003', date: '2026-03-15', amount: 1999, status: 'pending', plan: 'Professional' },
  { id: 'INV-004', date: '2026-01-01', amount: 4999, status: 'paid', plan: 'Enterprise' },
  { id: 'INV-005', date: '2026-02-15', amount: 1999, status: 'paid', plan: 'Professional' },
  { id: 'INV-006', date: '2026-01-15', amount: 1999, status: 'overdue', plan: 'Professional' },
];

const demoUsers: TenantUser[] = [
  { id: '1', name: 'Admin User', email: 'admin@nexus.com', role: 'super_admin', status: 'active', lastLogin: '2026-03-03 09:15 AM' },
  { id: '2', name: 'HR Manager', email: 'hr@nexus.com', role: 'hr_admin', status: 'active', lastLogin: '2026-03-03 10:30 AM' },
  { id: '3', name: 'John Doe', email: 'john@nexus.com', role: 'manager', status: 'active', lastLogin: '2026-03-02 04:45 PM' },
  { id: '4', name: 'Jane Smith', email: 'jane@nexus.com', role: 'employee', status: 'active', lastLogin: '2026-03-03 08:00 AM' },
  { id: '5', name: 'Bob Wilson', email: 'bob@nexus.com', role: 'employee', status: 'inactive', lastLogin: '2026-01-15 11:20 AM' },
  { id: '6', name: 'Alice Brown', email: 'alice@external.com', role: 'employee', status: 'invited', lastLogin: '—' },
];

const demoWorkflows: WorkflowConfig[] = [
  { id: '1', name: 'Leave Approval', type: 'approval', enabled: true, trigger: 'Leave request submitted', lastRun: '2026-03-03 09:00 AM' },
  { id: '2', name: 'Onboarding Flow', type: 'onboarding', enabled: true, trigger: 'New employee added', lastRun: '2026-03-01 11:30 AM' },
  { id: '3', name: 'Expense Approval', type: 'approval', enabled: true, trigger: 'Expense claim submitted', lastRun: '2026-03-02 02:15 PM' },
  { id: '4', name: 'Performance Review Cycle', type: 'review', enabled: false, trigger: 'Review cycle start date', lastRun: '2025-12-15 09:00 AM' },
  { id: '5', name: 'Probation Completion', type: 'notification', enabled: true, trigger: 'Probation period end date', lastRun: '2026-02-28 08:00 AM' },
  { id: '6', name: 'Asset Return on Exit', type: 'offboarding', enabled: true, trigger: 'Employee separation initiated', lastRun: '2026-02-20 03:45 PM' },
];

const initialUserForm = {
  name: '',
  email: '',
  role: 'employee',
};

/* ── Component ── */
export default function TenantAdminPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin'].includes(user?.role || '');

  const [tenants] = useState(demoTenants);
  const [settings, setSettings] = useState(demoSettings);
  const [invoices] = useState(demoInvoices);
  const [tenantUsers, setTenantUsers] = useState(demoUsers);
  const [workflows, setWorkflows] = useState(demoWorkflows);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'billing' | 'users' | 'workflows'>('overview');

  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState(initialUserForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [settingsEditing, setSettingsEditing] = useState(false);
  const [settingsForm, setSettingsForm] = useState(demoSettings);

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tenants?limit=100', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.tenants && data.tenants.length > 0) {
          // API has data
        }
      }
    } catch { /* demo */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Stats */
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter(t => t.status === 'active').length;
  const trialTenants = tenants.filter(t => t.status === 'trial').length;
  const totalMRR = tenants.reduce((a, t) => a + t.mrr, 0);

  /* Filtered */
  const filteredTenants = tenants.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.plan.toLowerCase().includes(search.toLowerCase()));
  const filteredUsers = tenantUsers.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()) || u.role.toLowerCase().includes(search.toLowerCase()));
  const filteredWorkflows = workflows.filter(w => !search || w.name.toLowerCase().includes(search.toLowerCase()) || w.type.toLowerCase().includes(search.toLowerCase()));

  /* User form handlers */
  const handleShowAddUser = () => {
    setUserForm(initialUserForm); setEditingUserId(null); setShowUserForm(true);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleShowEditUser = (u: TenantUser) => {
    setUserForm({ name: u.name, email: u.email, role: u.role });
    setEditingUserId(u.id); setShowUserForm(true);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelUserForm = () => { setShowUserForm(false); setEditingUserId(null); setUserForm(initialUserForm); };

  const handleSubmitUser = async () => {
    if (!userForm.name || !userForm.email) { toast.error('Name and email are required'); return; }
    try {
      setSubmitting(true);
      if (editingUserId) {
        setTenantUsers(prev => prev.map(u => u.id === editingUserId ? { ...u, name: userForm.name, email: userForm.email, role: userForm.role } : u));
        toast.success('User updated');
      } else {
        setTenantUsers(prev => [{ id: Date.now().toString(), name: userForm.name, email: userForm.email, role: userForm.role, status: 'invited' as const, lastLogin: '—' }, ...prev]);
        toast.success('Invitation sent');
      }
      handleCancelUserForm();
    } catch { toast.error('Operation failed'); } finally { setSubmitting(false); }
  };

  const handleDeleteUser = (id: string) => {
    setTenantUsers(prev => prev.filter(u => u.id !== id));
    toast.success('User removed');
    setDeleteConfirmId(null);
  };

  /* Settings save */
  const handleSaveSettings = () => {
    setSettings(settingsForm);
    setSettingsEditing(false);
    toast.success('Settings saved successfully');
  };

  /* Workflow toggle */
  const toggleWorkflow = (id: string) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
    const wf = workflows.find(w => w.id === id);
    toast.success(`${wf?.name} ${wf?.enabled ? 'disabled' : 'enabled'}`);
  };

  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: FiServer },
    { key: 'settings' as const, label: 'Settings', icon: FiSettings },
    { key: 'billing' as const, label: 'Billing', icon: FiCreditCard },
    { key: 'users' as const, label: 'Users', icon: FiUsers },
    { key: 'workflows' as const, label: 'Workflows', icon: FiGitMerge },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiServer className="w-6 h-6 text-teal-500" />
            Tenant Admin
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage tenants, billing, users, and workflows</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-50"><FiServer className="w-4 h-4 text-teal-600" /></div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Total Tenants</p>
              <p className="text-xl font-bold text-nexus-text-primary">{totalTenants}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50"><FiCheck className="w-4 h-4 text-emerald-600" /></div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Active Subscriptions</p>
              <p className="text-xl font-bold text-emerald-600">{activeTenants}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-50"><FiCreditCard className="w-4 h-4 text-teal-600" /></div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">MRR</p>
              <p className="text-xl font-bold text-nexus-text-primary">{formatCurrency(totalMRR)}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50"><FiClock className="w-4 h-4 text-amber-600" /></div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Trial Users</p>
              <p className="text-xl font-bold text-amber-600">{trialTenants}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-nexus-border overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key ? 'border-teal-500 text-teal-600' : 'border-transparent text-nexus-text-secondary hover:text-nexus-text-primary'}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400" />
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nexus-border bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Tenant</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Users</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">MRR</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-nexus-border/50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td></tr>
                  ))
                ) : filteredTenants.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center"><FiServer className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No tenants found</p></td></tr>
                ) : (
                  filteredTenants.map(t => {
                    const statusBadge = getTenantStatusBadge(t.status);
                    return (
                      <tr key={t.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{t.name}</td>
                        <td className="px-4 py-3"><span className="nexus-badge nexus-badge-purple">{t.plan}</span></td>
                        <td className="px-4 py-3"><span className={statusBadge.className}>{statusBadge.label}</span></td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{t.users}</td>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{t.mrr > 0 ? formatCurrency(t.mrr) : '—'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{t.createdAt}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="nexus-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2"><FiSettings className="w-5 h-5 text-teal-500" />Company Settings</h3>
            {!settingsEditing ? (
              <button onClick={() => setSettingsEditing(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium text-sm shadow-sm transition-colors">
                <FiEdit2 className="w-4 h-4" />Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => { setSettingsForm(settings); setSettingsEditing(false); }} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleSaveSettings} className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium text-sm shadow-sm transition-colors">Save Changes</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Company Name</label>
              {settingsEditing ? (
                <input type="text" value={settingsForm.name} onChange={e => setSettingsForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400" />
              ) : (
                <p className="text-sm text-nexus-text-primary py-2.5">{settings.name}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Industry</label>
              {settingsEditing ? (
                <input type="text" value={settingsForm.industry} onChange={e => setSettingsForm(p => ({ ...p, industry: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400" />
              ) : (
                <p className="text-sm text-nexus-text-primary py-2.5">{settings.industry}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Company Size</label>
              {settingsEditing ? (
                <select value={settingsForm.size} onChange={e => setSettingsForm(p => ({ ...p, size: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400">
                  <option value="1-10">1-10</option><option value="11-50">11-50</option><option value="51-200">51-200</option><option value="201-500">201-500</option><option value="500+">500+</option>
                </select>
              ) : (
                <p className="text-sm text-nexus-text-primary py-2.5">{settings.size} employees</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Timezone</label>
              {settingsEditing ? (
                <input type="text" value={settingsForm.timezone} onChange={e => setSettingsForm(p => ({ ...p, timezone: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400" />
              ) : (
                <p className="text-sm text-nexus-text-primary py-2.5">{settings.timezone}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Locale</label>
              {settingsEditing ? (
                <select value={settingsForm.locale} onChange={e => setSettingsForm(p => ({ ...p, locale: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400">
                  <option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="hi-IN">Hindi (India)</option><option value="ja-JP">Japanese</option>
                </select>
              ) : (
                <p className="text-sm text-nexus-text-primary py-2.5">{settings.locale}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Logo</label>
              {settingsEditing ? (
                <input type="text" value={settingsForm.logo} onChange={e => setSettingsForm(p => ({ ...p, logo: e.target.value }))} placeholder="Logo URL" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400" />
              ) : (
                <p className="text-sm text-nexus-text-primary py-2.5">{settings.logo}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === 'billing' && (
        <div className="space-y-4">
          {/* Current Plan */}
          <div className="nexus-card p-6">
            <h3 className="text-sm font-semibold text-nexus-text-secondary mb-4 flex items-center gap-2"><FiCreditCard className="w-4 h-4 text-teal-500" />Current Plan</h3>
            <div className="flex items-center justify-between p-4 bg-teal-50 border border-teal-200 rounded-lg">
              <div>
                <p className="text-lg font-bold text-teal-700">Enterprise Plan</p>
                <p className="text-sm text-teal-600 mt-0.5">Up to 500 users &middot; Priority support &middot; All modules</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-teal-700">$4,999</p>
                <p className="text-xs text-teal-600">/month</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-nexus-text-muted">Users</p>
                <p className="text-sm font-semibold text-nexus-text-primary">250 / 500</p>
                <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2"><div className="h-full bg-teal-500 rounded-full" style={{ width: '50%' }} /></div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-nexus-text-muted">Storage</p>
                <p className="text-sm font-semibold text-nexus-text-primary">12 GB / 50 GB</p>
                <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2"><div className="h-full bg-teal-500 rounded-full" style={{ width: '24%' }} /></div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-nexus-text-muted">API Calls</p>
                <p className="text-sm font-semibold text-nexus-text-primary">12.8K / 100K</p>
                <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2"><div className="h-full bg-teal-500 rounded-full" style={{ width: '13%' }} /></div>
              </div>
            </div>
          </div>

          {/* Invoice History */}
          <div className="nexus-card overflow-hidden">
            <div className="p-4 border-b border-nexus-border">
              <h3 className="text-sm font-semibold text-nexus-text-secondary">Invoice History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-nexus-border bg-slate-50/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Invoice</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Plan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const statusBadge = getInvoiceStatusBadge(inv.status);
                    return (
                      <tr key={inv.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{inv.id}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{inv.date}</td>
                        <td className="px-4 py-3"><span className="nexus-badge nexus-badge-purple">{inv.plan}</span></td>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{formatCurrency(inv.amount)}</td>
                        <td className="px-4 py-3"><span className={statusBadge.className}>{statusBadge.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-nexus-text-secondary">User Management</h3>
            {isAdmin && (
              <button onClick={handleShowAddUser} className="inline-flex items-center gap-2 px-3 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 font-medium text-xs shadow-sm transition-colors">
                <FiPlus className="w-3.5 h-3.5" />Invite User
              </button>
            )}
          </div>

          {showUserForm && (
            <div id="crud-form" className="nexus-card border-l-4 border-l-teal-500 animate-slide-in-down">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-nexus-text-primary">{editingUserId ? 'Edit User' : 'Invite New User'}</h2>
                  <button onClick={handleCancelUserForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label>
                    <input type="text" value={userForm.name} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Email *</label>
                    <input type="email" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} placeholder="user@company.com" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Role</label>
                    <select value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400">
                      <option value="employee">Employee</option><option value="manager">Manager</option><option value="hr_admin">HR Admin</option><option value="tenant_admin">Tenant Admin</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-nexus-border">
                  <button onClick={handleCancelUserForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
                  <button onClick={handleSubmitUser} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 disabled:opacity-50 shadow-sm shadow-teal-500/25 transition-colors">{submitting ? 'Saving...' : editingUserId ? 'Update' : 'Send Invite'}</button>
                </div>
              </div>
            </div>
          )}

          <div className="nexus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-nexus-border bg-slate-50/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Last Login</th>
                    {isAdmin && <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center"><FiUsers className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No users found</p></td></tr>
                  ) : (
                    filteredUsers.map(u => {
                      const statusBadge = getUserStatusBadge(u.status);
                      return (
                        <tr key={u.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                          {deleteConfirmId === u.id ? (
                            <td colSpan={isAdmin ? 6 : 5} className="px-4 py-3 bg-red-50">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-red-700 font-medium">Remove user &quot;{u.name}&quot;?</span>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => handleDeleteUser(u.id)} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 transition-colors">Confirm</button>
                                  <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                                </div>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{u.name}</td>
                              <td className="px-4 py-3 text-sm text-nexus-text-secondary">{u.email}</td>
                              <td className="px-4 py-3"><span className="nexus-badge nexus-badge-primary">{u.role}</span></td>
                              <td className="px-4 py-3"><span className={statusBadge.className}>{statusBadge.label}</span></td>
                              <td className="px-4 py-3 text-xs text-nexus-text-secondary">{u.lastLogin}</td>
                              {isAdmin && (
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => handleShowEditUser(u)} className="p-2 rounded-lg text-nexus-text-muted hover:text-teal-500 hover:bg-teal-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                                    <button onClick={() => setDeleteConfirmId(u.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove"><FiTrash2 className="w-4 h-4" /></button>
                                  </div>
                                </td>
                              )}
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Workflows Tab */}
      {activeTab === 'workflows' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-nexus-text-secondary">Workflow Configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredWorkflows.map(w => (
              <div key={w.id} className="nexus-card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-nexus-text-primary">{w.name}</p>
                    <p className="text-xs text-nexus-text-muted mt-0.5">Trigger: {w.trigger}</p>
                  </div>
                  <button onClick={() => toggleWorkflow(w.id)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${w.enabled ? 'bg-teal-500' : 'bg-slate-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${w.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="nexus-badge nexus-badge-purple">{w.type}</span>
                  <span className={`nexus-badge ${w.enabled ? 'nexus-badge-success' : 'bg-slate-100 text-slate-600 nexus-badge'}`}>
                    {w.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {w.lastRun && (
                  <p className="text-xs text-nexus-text-muted mt-2 flex items-center gap-1"><FiClock className="w-3 h-3" />Last run: {w.lastRun}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
