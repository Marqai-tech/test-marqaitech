'use client';

import { useState } from 'react';
import {
  FiSettings,
  FiUser,
  FiLock,
  FiBell,
  FiSun,
  FiMoon,
  FiSave,
  FiCamera,
  FiMail,
  FiCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Component ── */
export default function SettingsPage() {
  const { user } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Initialize profile form from user data
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
  });

  // Sync profile once user loads
  if (profileForm.name === '' && profileForm.email === '' && user) {
    setProfileForm({ name: user.name || '', email: user.email || '' });
  }

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [notifPrefs, setNotifPrefs] = useState<NotifPref>(() => {
    if (typeof window === 'undefined') return { email: true, leave: true, payroll: true, recruitment: true, workflow: true, system: true };
    const stored = localStorage.getItem('nexus_notif_prefs');
    if (stored) {
      try { return JSON.parse(stored) as NotifPref; } catch { /* ignore */ }
    }
    return { email: true, leave: true, payroll: true, recruitment: true, workflow: true, system: true };
  });

  /* Save Profile */
  const handleSaveProfile = async () => {
    if (!profileForm.name || !profileForm.email) { toast.error('Name and email are required'); return; }
    try {
      setSaving(true);
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(profileForm),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Profile updated successfully');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  /* Change Password */
  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) { toast.error('Please fill all password fields'); return; }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { toast.error('Passwords do not match'); return; }
    if (passwordForm.newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    try {
      setSaving(true);
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  /* Save Notification Preferences */
  const handleSaveNotifPrefs = async () => {
    try {
      setSaving(true);
      // Store notification preferences locally (could also save to backend)
      localStorage.setItem('nexus_notif_prefs', JSON.stringify(notifPrefs));
      toast.success('Notification preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('') || 'U';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
          <FiSettings className="w-6 h-6" />
          Settings
        </h1>
        <p className="text-nexus-text-secondary mt-1">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Section */}
        <div className="nexus-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
              <FiUser className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-nexus-text-primary">Profile</h2>
              <p className="text-xs text-nexus-text-muted">Update your personal information</p>
            </div>
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-blue-500/25">
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium text-nexus-text-primary">{user?.name || 'User'}</p>
              <p className="text-xs text-nexus-text-muted">{user?.role || 'Employee'}</p>
              <button className="mt-1 text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1">
                <FiCamera className="w-3 h-3" /> Change photo
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Full Name</label>
              <div className="relative">
                <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
                <input type="text" value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Your name" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Email</label>
              <div className="relative">
                <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
                <input type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))} className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="your@email.com" />
              </div>
            </div>
            <button onClick={handleSaveProfile} disabled={saving} className="w-full px-4 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors flex items-center justify-center gap-2">
              <FiSave className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        {/* Password Section */}
        <div className="nexus-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
              <FiLock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-nexus-text-primary">Change Password</h2>
              <p className="text-xs text-nexus-text-muted">Update your security credentials</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Current Password</label>
              <input type="password" value={passwordForm.currentPassword} onChange={e => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Enter current password" />
            </div>
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">New Password</label>
              <input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Enter new password" />
            </div>
            <div>
              <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Confirm New Password</label>
              <input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Confirm new password" />
            </div>
            {passwordForm.newPassword && passwordForm.confirmPassword && (
              <div className={`p-2 rounded-lg text-xs font-medium ${passwordForm.newPassword === passwordForm.confirmPassword ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {passwordForm.newPassword === passwordForm.confirmPassword ? (
                  <span className="flex items-center gap-1"><FiCheck className="w-3 h-3" /> Passwords match</span>
                ) : (
                  'Passwords do not match'
                )}
              </div>
            )}
            <button onClick={handleChangePassword} disabled={saving} className="w-full px-4 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 shadow-sm shadow-red-500/25 transition-colors flex items-center justify-center gap-2">
              <FiLock className="w-4 h-4" /> {saving ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="nexus-card p-6">
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
              <div key={pref.key} className="flex items-center justify-between p-3 rounded-lg border border-nexus-border/50 hover:border-nexus-border transition-colors">
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

          <button onClick={handleSaveNotifPrefs} disabled={saving} className="w-full mt-4 px-4 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors flex items-center justify-center gap-2">
            <FiSave className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>

        {/* Theme & Appearance */}
        <div className="nexus-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-500">
              <FiSun className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-nexus-text-primary">Appearance</h2>
              <p className="text-xs text-nexus-text-muted">Customize how NEXUS looks for you</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-nexus-border/50">
              <div className="flex items-center gap-3">
                {darkMode ? <FiMoon className="w-5 h-5 text-violet-500" /> : <FiSun className="w-5 h-5 text-amber-500" />}
                <div>
                  <p className="text-sm font-medium text-nexus-text-primary">Dark Mode</p>
                  <p className="text-xs text-nexus-text-muted">Switch between light and dark theme</p>
                </div>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`relative w-11 h-6 rounded-full transition-colors ${darkMode ? 'bg-violet-500' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
              <p className="text-xs text-amber-700 font-medium">Theme customization coming soon!</p>
              <p className="text-xs text-amber-600 mt-0.5">Dark mode and additional themes will be available in a future update.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
