'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FiSettings,
  FiEdit2,
  FiX,
  FiSave,
  FiBell,
  FiGlobe,
  FiDatabase,
  FiShield,
  FiClock,
  FiDollarSign,
  FiCalendar,
  FiAlertTriangle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  plan: string;
  status: string;
  country?: string | null;
  currency: string;
  timezone: string;
  logo?: string | null;
}

interface NotifPref {
  email: boolean;
  leave: boolean;
  payroll: boolean;
  recruitment: boolean;
  workflow: boolean;
  system: boolean;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Roles Data ── */
const rolesData = [
  { name: 'Super Admin', key: 'super_admin', description: 'Full system access across all tenants', permissions: ['All Permissions'] },
  { name: 'Tenant Admin', key: 'tenant_admin', description: 'Full access within their tenant', permissions: ['User Management', 'Employee Management', 'Payroll', 'Reports', 'Settings'] },
  { name: 'HR Admin', key: 'hr_admin', description: 'HR module access', permissions: ['Employee Management', 'Leave Management', 'Attendance', 'Recruitment', 'Performance', 'Training'] },
  { name: 'Manager', key: 'manager', description: 'Team management access', permissions: ['Team View', 'Leave Approvals', 'Performance Reviews', 'Timesheet Approvals'] },
  { name: 'Employee', key: 'employee', description: 'Self-service access', permissions: ['Self Profile', 'Leave Request', 'Attendance', 'Timesheet', 'Documents'] },
];

/* ── Component ── */
export default function SettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [activeTab, setActiveTab] = useState<'general' | 'company' | 'roles' | 'notifications'>('general');
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);

  /* General settings state with inline editing */
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [generalForm, setGeneralForm] = useState({
    companyName: '',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    currency: 'USD',
  });

  /* Notification preferences */
  const [notifPrefs, setNotifPrefs] = useState<NotifPref>(() => {
    if (typeof window === 'undefined') return { email: true, leave: true, payroll: true, recruitment: true, workflow: true, system: true };
    const stored = localStorage.getItem('nexus_notif_prefs');
    if (stored) {
      try { return JSON.parse(stored) as NotifPref; } catch { /* ignore */ }
    }
    return { email: true, leave: true, payroll: true, recruitment: true, workflow: true, system: true };
  });

  /* Fetch tenant info */
  const fetchTenant = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants?limit=1', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const t = data.tenants?.[0] || null;
        setTenant(t);
        if (t) {
          setGeneralForm({
            companyName: t.name || '',
            timezone: t.timezone || 'UTC',
            dateFormat: 'MM/DD/YYYY',
            currency: t.currency || 'USD',
          });
        }
      }
    } catch {
      /* ignore - tenant API might not be available */
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchTenant()); }, [fetchTenant]);

  /* Save general settings */
  const handleSaveGeneral = async () => {
    try {
      setSaving(true);
      if (tenant?.id) {
        const res = await fetch(`/api/tenants/${tenant.id}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            name: generalForm.companyName,
            timezone: generalForm.timezone,
            currency: generalForm.currency,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Failed');
        }
      }
      toast.success('Settings saved successfully');
      setEditingSection(null);
      fetchTenant();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  /* Save notification preferences */
  const handleSaveNotifPrefs = () => {
    try {
      localStorage.setItem('nexus_notif_prefs', JSON.stringify(notifPrefs));
      toast.success('Notification preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    }
  };

  /* Access restriction */
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div className="nexus-card p-12 text-center">
          <FiAlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-nexus-text-primary mb-2">Access Restricted</h2>
          <p className="text-nexus-text-secondary">Only administrators can access Settings.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'general' as const, label: 'General', icon: <FiSettings className="w-4 h-4" /> },
    { key: 'company' as const, label: 'Company', icon: <FiDatabase className="w-4 h-4" /> },
    { key: 'roles' as const, label: 'Roles', icon: <FiShield className="w-4 h-4" /> },
    { key: 'notifications' as const, label: 'Notifications', icon: <FiBell className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
          <FiSettings className="w-6 h-6 text-slate-500" />
          Settings
        </h1>
        <p className="text-nexus-text-secondary mt-1">Manage system configuration and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="space-y-4">
          <div className="nexus-card">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                    <FiGlobe className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-nexus-text-primary">General Settings</h2>
                    <p className="text-xs text-nexus-text-muted">Configure basic application settings</p>
                  </div>
                </div>
                {editingSection !== 'general' ? (
                  <button onClick={() => setEditingSection('general')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                    <FiEdit2 className="w-4 h-4" />
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditingSection(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100">
                      <FiX className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">
                    <span className="flex items-center gap-1"><FiDatabase className="w-3 h-3" /> Company Name</span>
                  </label>
                  {editingSection === 'general' ? (
                    <input type="text" value={generalForm.companyName} onChange={e => setGeneralForm(p => ({ ...p, companyName: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  ) : (
                    <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{generalForm.companyName || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">
                    <span className="flex items-center gap-1"><FiClock className="w-3 h-3" /> Timezone</span>
                  </label>
                  {editingSection === 'general' ? (
                    <select value={generalForm.timezone} onChange={e => setGeneralForm(p => ({ ...p, timezone: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                      <option value="Asia/Kolkata">India (IST)</option>
                      <option value="Europe/London">London (GMT)</option>
                      <option value="Asia/Tokyo">Tokyo (JST)</option>
                    </select>
                  ) : (
                    <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{generalForm.timezone}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">
                    <span className="flex items-center gap-1"><FiCalendar className="w-3 h-3" /> Date Format</span>
                  </label>
                  {editingSection === 'general' ? (
                    <select value={generalForm.dateFormat} onChange={e => setGeneralForm(p => ({ ...p, dateFormat: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  ) : (
                    <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{generalForm.dateFormat}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">
                    <span className="flex items-center gap-1"><FiDollarSign className="w-3 h-3" /> Currency</span>
                  </label>
                  {editingSection === 'general' ? (
                    <select value={generalForm.currency} onChange={e => setGeneralForm(p => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (&euro;)</option>
                      <option value="GBP">GBP (&pound;)</option>
                      <option value="INR">INR (&rupee;)</option>
                      <option value="JPY">JPY (&yen;)</option>
                    </select>
                  ) : (
                    <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{generalForm.currency}</p>
                  )}
                </div>
              </div>

              {editingSection === 'general' && (
                <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
                  <button onClick={() => setEditingSection(null)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
                  <button onClick={handleSaveGeneral} disabled={saving} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 flex items-center gap-2">
                    <FiSave className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Company Tab */}
      {activeTab === 'company' && (
        <div className="space-y-4">
          <div className="nexus-card">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                  <FiDatabase className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-nexus-text-primary">Company Information</h2>
                  <p className="text-xs text-nexus-text-muted">Current tenant configuration</p>
                </div>
              </div>

              {tenant ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Company Name</label>
                    <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{tenant.name}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Slug</label>
                    <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50 font-mono">{tenant.slug}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Domain</label>
                    <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{tenant.domain || '—'}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Plan</label>
                    <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50 capitalize">{tenant.plan}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                    <span className={`nexus-badge ${tenant.status === 'active' ? 'nexus-badge-success' : 'nexus-badge-warning'}`}>{tenant.status}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Country</label>
                    <p className="px-3 py-2.5 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{tenant.country || '—'}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FiDatabase className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                  <p className="text-nexus-text-secondary font-medium">No tenant information available</p>
                  <p className="text-sm text-nexus-text-muted mt-1">Tenant data will appear once configured</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="nexus-card">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-500">
                  <FiShield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-nexus-text-primary">Roles & Permissions</h2>
                  <p className="text-xs text-nexus-text-muted">View role definitions and access levels</p>
                </div>
              </div>

              <div className="space-y-4">
                {rolesData.map(role => (
                  <div key={role.key} className="p-4 rounded-lg border border-nexus-border/50 hover:border-nexus-border transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                          role.key === 'super_admin' ? 'bg-red-500' :
                          role.key === 'tenant_admin' ? 'bg-orange-500' :
                          role.key === 'hr_admin' ? 'bg-blue-500' :
                          role.key === 'manager' ? 'bg-emerald-500' :
                          'bg-slate-500'
                        }`}>
                          {role.name.split(' ').map(w => w[0]).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-nexus-text-primary">{role.name}</p>
                          <p className="text-xs text-nexus-text-muted">{role.description}</p>
                        </div>
                      </div>
                      <span className={`nexus-badge ${role.key === user?.role ? 'nexus-badge-success' : 'bg-slate-50 text-slate-500'}`}>
                        {role.key === user?.role ? 'Your Role' : role.key}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {role.permissions.map(perm => (
                        <span key={perm} className="text-[10px] px-2 py-1 rounded-md bg-slate-50 text-nexus-text-secondary font-medium border border-nexus-border/50">
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 mt-4">
                <p className="text-xs text-amber-700 font-medium">Role management is currently view-only</p>
                <p className="text-xs text-amber-600 mt-0.5">Custom role creation and permission editing will be available in a future update.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div className="nexus-card">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                  <FiBell className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-nexus-text-primary">Notification Preferences</h2>
                  <p className="text-xs text-nexus-text-muted">Choose what notifications you receive</p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'email' as const, label: 'Email Notifications', desc: 'Receive notifications via email' },
                  { key: 'leave' as const, label: 'Leave Updates', desc: 'Leave request approvals and rejections' },
                  { key: 'payroll' as const, label: 'Payroll Alerts', desc: 'Payroll processing and payment notifications' },
                  { key: 'recruitment' as const, label: 'Recruitment Updates', desc: 'New applications and interview schedules' },
                  { key: 'workflow' as const, label: 'Workflow Notifications', desc: 'Approval requests and workflow updates' },
                  { key: 'system' as const, label: 'System Alerts', desc: 'System maintenance and announcements' },
                ].map(pref => (
                  <div key={pref.key} className="flex items-center justify-between p-4 rounded-lg border border-nexus-border/50 hover:border-nexus-border transition-colors">
                    <div>
                      <p className="text-sm font-medium text-nexus-text-primary">{pref.label}</p>
                      <p className="text-xs text-nexus-text-muted">{pref.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifPrefs(p => ({ ...p, [pref.key]: !p[pref.key] }))}
                      className={`relative w-11 h-6 rounded-full transition-colors ${notifPrefs[pref.key] ? 'bg-blue-500' : 'bg-slate-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${notifPrefs[pref.key] ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end mt-6 pt-4 border-t border-nexus-border">
                <button onClick={handleSaveNotifPrefs} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm shadow-blue-500/25 transition-colors flex items-center gap-2">
                  <FiSave className="w-4 h-4" />
                  Save Preferences
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
