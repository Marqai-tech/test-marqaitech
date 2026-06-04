'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FiSettings,
  FiEdit2,
  FiCheck,
  FiX,
  FiGlobe,
  FiClock,
  FiDollarSign,
  FiHome,
  FiShield,
  FiBell,
  FiSave,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

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
}

/* ── Roles Data ── */
const rolesData = [
  {
    name: 'Super Admin',
    key: 'super_admin',
    description: 'Full system access across all tenants',
    color: 'bg-red-100 text-red-700',
    permissions: ['All System Access', 'Tenant Management', 'User Management', 'Billing', 'Audit Logs', 'System Config'],
  },
  {
    name: 'Tenant Admin',
    key: 'tenant_admin',
    description: 'Full access within their tenant organization',
    color: 'bg-orange-100 text-orange-700',
    permissions: ['Organization Management', 'Employee Management', 'HR Modules', 'Payroll', 'Reports', 'Settings'],
  },
  {
    name: 'HR Admin',
    key: 'hr_admin',
    description: 'HR module access with employee management',
    color: 'bg-amber-100 text-amber-700',
    permissions: ['Employee Management', 'Leave Management', 'Attendance', 'Payroll', 'Recruitment', 'Performance'],
  },
  {
    name: 'Manager',
    key: 'manager',
    description: 'Team management and approval access',
    color: 'bg-blue-100 text-blue-700',
    permissions: ['Team View', 'Leave Approvals', 'Timesheet Approvals', 'Performance Reviews', 'Team Reports'],
  },
  {
    name: 'Employee',
    key: 'employee',
    description: 'Self-service access for personal data',
    color: 'bg-emerald-100 text-emerald-700',
    permissions: ['Self Profile', 'Leave Requests', 'Attendance', 'Timesheets', 'Documents', 'Payslips'],
  },
];

/* ── Component ── */
export default function SettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [activeTab, setActiveTab] = useState<'general' | 'company' | 'roles' | 'notifications'>('general');
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);

  /* General settings state */
  const [generalSettings, setGeneralSettings] = useState({
    companyName: '',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    currency: 'USD',
  });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  /* Notification preferences */
  const [notifPrefs, setNotifPrefs] = useState({
    emailNotifications: true,
    pushNotifications: true,
    leaveAlerts: true,
    payrollAlerts: true,
    attendanceReminders: true,
    systemUpdates: false,
    weeklyDigest: true,
    mentionNotifications: true,
  });

  /* Fetch tenant info */
  const fetchTenantInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?limit=1', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.employees && data.employees.length > 0 && data.employees[0].user?.tenant) {
          const tenant = data.employees[0].user.tenant;
          setTenantInfo(tenant);
          setGeneralSettings({
            companyName: tenant.name || '',
            timezone: tenant.timezone || 'UTC',
            dateFormat: 'MM/DD/YYYY',
            currency: tenant.currency || 'USD',
          });
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchTenantInfo()); }, [fetchTenantInfo]);

  /* Inline edit handlers */
  const handleStartEdit = (field: string, value: string) => {
    if (!isAdmin) return;
    setEditingField(field);
    setEditValue(value);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleSaveField = async (field: string) => {
    try {
      setSaving(true);
      // Simulate save - in production, this would call an API
      setGeneralSettings(prev => ({ ...prev, [field]: editValue }));
      toast.success(`${field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())} updated successfully`);
      setEditingField(null);
      setEditValue('');
    } catch {
      toast.error('Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  /* Notification toggle handler */
  const handleToggleNotif = (key: string) => {
    setNotifPrefs(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
    toast.success('Preference updated');
  };

  /* Render editable field */
  const renderEditableField = (field: string, label: string, value: string, icon: typeof FiGlobe, type: 'text' | 'select' = 'text', options?: { value: string; label: string }[]) => {
    const isEditing = editingField === field;
    return (
      <div className="flex items-center justify-between py-4 border-b border-nexus-border last:border-b-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
            {icon({ className: 'w-4 h-4 text-nexus-text-secondary' })}
          </div>
          <div>
            <p className="text-sm font-medium text-nexus-text-primary">{label}</p>
            {isEditing ? (
              <div className="flex items-center gap-2 mt-1.5">
                {type === 'select' && options ? (
                  <select
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {options.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-64"
                    autoFocus
                  />
                )}
                <button
                  onClick={() => handleSaveField(field)}
                  disabled={saving}
                  className="p-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  <FiCheck className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-1.5 rounded-lg border border-nexus-border text-nexus-text-muted hover:bg-slate-50 transition-colors"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-sm text-nexus-text-secondary mt-0.5">{value}</p>
            )}
          </div>
        </div>
        {!isEditing && isAdmin && (
          <button
            onClick={() => handleStartEdit(field, value)}
            className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors"
            title="Edit"
          >
            <FiEdit2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  /* Tab config */
  const tabs = [
    { key: 'general' as const, label: 'General', icon: FiSettings },
    { key: 'company' as const, label: 'Company', icon: FiHome },
    { key: 'roles' as const, label: 'Roles', icon: FiShield },
    { key: 'notifications' as const, label: 'Notifications', icon: FiBell },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
          <FiSettings className="w-6 h-6 text-slate-500" />
          Settings
        </h1>
        <p className="text-nexus-text-secondary mt-1">Manage your application preferences and configuration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-nexus-text-primary shadow-sm'
                : 'text-nexus-text-secondary hover:text-nexus-text-primary'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="nexus-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-nexus-text-primary">General Settings</h2>
            {isAdmin && (
              <span className="text-xs text-nexus-text-muted flex items-center gap-1">
                <FiEdit2 className="w-3 h-3" /> Click edit icon to modify
              </span>
            )}
          </div>
          {renderEditableField('companyName', 'Company Name', generalSettings.companyName, FiHome)}
          {renderEditableField('timezone', 'Timezone', generalSettings.timezone, FiClock, 'select', [
            { value: 'UTC', label: 'UTC' },
            { value: 'America/New_York', label: 'Eastern Time (US)' },
            { value: 'America/Chicago', label: 'Central Time (US)' },
            { value: 'America/Denver', label: 'Mountain Time (US)' },
            { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
            { value: 'Asia/Kolkata', label: 'India Standard Time' },
            { value: 'Europe/London', label: 'Greenwich Mean Time' },
            { value: 'Asia/Tokyo', label: 'Japan Standard Time' },
          ])}
          {renderEditableField('dateFormat', 'Date Format', generalSettings.dateFormat, FiClock, 'select', [
            { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
            { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
            { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
            { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY' },
          ])}
          {renderEditableField('currency', 'Currency', generalSettings.currency, FiDollarSign, 'select', [
            { value: 'USD', label: 'USD ($)' },
            { value: 'INR', label: 'INR (₹)' },
            { value: 'EUR', label: 'EUR (€)' },
            { value: 'GBP', label: 'GBP (£)' },
            { value: 'JPY', label: 'JPY (¥)' },
          ])}
        </div>
      )}

      {/* Company Tab */}
      {activeTab === 'company' && (
        <div className="nexus-card p-6">
          <h2 className="text-lg font-semibold text-nexus-text-primary mb-6">Company Information</h2>
          {tenantInfo ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-xs font-medium text-nexus-text-secondary">Company Name</p>
                <p className="text-sm font-medium text-nexus-text-primary">{tenantInfo.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-nexus-text-secondary">Slug</p>
                <p className="text-sm font-medium text-nexus-text-primary">{tenantInfo.slug}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-nexus-text-secondary">Domain</p>
                <p className="text-sm font-medium text-nexus-text-primary">{tenantInfo.domain || '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-nexus-text-secondary">Plan</p>
                <span className="nexus-badge nexus-badge-info capitalize">{tenantInfo.plan}</span>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-nexus-text-secondary">Status</p>
                <span className="nexus-badge nexus-badge-success capitalize">{tenantInfo.status}</span>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-nexus-text-secondary">Country</p>
                <p className="text-sm font-medium text-nexus-text-primary">{tenantInfo.country || '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-nexus-text-secondary">Currency</p>
                <p className="text-sm font-medium text-nexus-text-primary">{tenantInfo.currency}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-nexus-text-secondary">Timezone</p>
                <p className="text-sm font-medium text-nexus-text-primary">{tenantInfo.timezone}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <FiHome className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
              <p className="text-nexus-text-secondary font-medium">Company information not available</p>
              <p className="text-sm text-nexus-text-muted mt-1">Contact your administrator for details</p>
            </div>
          )}
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div className="space-y-4">
          {rolesData.map(role => (
            <div key={role.key} className="nexus-card p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <FiShield className="w-5 h-5 text-nexus-text-secondary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-nexus-text-primary">{role.name}</h3>
                      <span className={`${role.color} nexus-badge`}>{role.key}</span>
                    </div>
                    <p className="text-xs text-nexus-text-secondary mt-0.5">{role.description}</p>
                  </div>
                </div>
                {user?.role === role.key && (
                  <span className="nexus-badge nexus-badge-success">Current</span>
                )}
              </div>
              <div className="ml-13">
                <p className="text-xs font-medium text-nexus-text-secondary mb-2">Permissions</p>
                <div className="flex flex-wrap gap-2">
                  {role.permissions.map(perm => (
                    <span key={perm} className="px-2.5 py-1 rounded-md bg-slate-50 border border-nexus-border text-xs font-medium text-nexus-text-secondary">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="nexus-card p-6">
          <h2 className="text-lg font-semibold text-nexus-text-primary mb-6">Notification Preferences</h2>
          <div className="space-y-1">
            {[
              { key: 'emailNotifications', label: 'Email Notifications', description: 'Receive notifications via email' },
              { key: 'pushNotifications', label: 'Push Notifications', description: 'Receive browser push notifications' },
              { key: 'leaveAlerts', label: 'Leave Alerts', description: 'Notifications for leave requests and approvals' },
              { key: 'payrollAlerts', label: 'Payroll Alerts', description: 'Notifications for payroll processing and payslips' },
              { key: 'attendanceReminders', label: 'Attendance Reminders', description: 'Daily reminders for check-in/check-out' },
              { key: 'systemUpdates', label: 'System Updates', description: 'Notifications about system maintenance and updates' },
              { key: 'weeklyDigest', label: 'Weekly Digest', description: 'Summary of the week\'s activities' },
              { key: 'mentionNotifications', label: 'Mention Notifications', description: 'When someone mentions you in comments' },
            ].map(item => {
              const isEnabled = notifPrefs[item.key as keyof typeof notifPrefs];
              return (
                <div key={item.key} className="flex items-center justify-between py-4 border-b border-nexus-border last:border-b-0">
                  <div>
                    <p className="text-sm font-medium text-nexus-text-primary">{item.label}</p>
                    <p className="text-xs text-nexus-text-secondary mt-0.5">{item.description}</p>
                  </div>
                  <button
                    onClick={() => handleToggleNotif(item.key)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                      isEnabled ? 'bg-blue-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        isEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
            <button
              onClick={() => {
                toast.success('Notification preferences saved');
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm shadow-blue-500/25 transition-colors"
            >
              <FiSave className="w-4 h-4" />
              Save Preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
