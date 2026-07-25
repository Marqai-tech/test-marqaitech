'use client';

import { useState } from 'react';
import { FiSettings, FiRefreshCw, FiSave } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

export default function CollaborationSettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [saving, setSaving] = useState(false);

  // Chat Settings
  const [encryption, setEncryption] = useState(true);
  const [fileSharingLimit, setFileSharingLimit] = useState('25');
  const [messageRetention, setMessageRetention] = useState('1 Year');

  // Productivity
  const [calendarSync, setCalendarSync] = useState(true);
  const [emailIntegration, setEmailIntegration] = useState(false);

  const handleRefresh = () => {
    setEncryption(true);
    setFileSharingLimit('25');
    setMessageRetention('1 Year');
    setCalendarSync(true);
    setEmailIntegration(false);
    toast.success('Settings refreshed to defaults');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      toast.success('Collaboration settings saved successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const selectClass =
    'w-full px-3 py-2 rounded-lg border border-thb-border text-sm text-thb-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400';
  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-thb-border text-sm text-thb-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-50 text-green-600">
            <FiSettings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Collaboration Settings</h1>
            <p className="text-sm text-thb-text-secondary">
              Configure chat preferences and productivity integrations for your team
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors"
          >
            <FiRefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {isAdmin && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiSave className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chat Settings */}
        <div className="thb-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-thb-text-primary">Chat Settings</h2>

          {/* Encryption */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-thb-text-primary">Encryption</p>
              <p className="text-xs text-thb-text-muted">End-to-end encryption for all chat messages</p>
            </div>
            <button
              onClick={() => setEncryption(!encryption)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                encryption ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {encryption ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* File Sharing Limit */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-thb-text-secondary">File Sharing Limit (MB)</label>
            <input
              type="number"
              value={fileSharingLimit}
              onChange={(e) => setFileSharingLimit(e.target.value)}
              min="1"
              max="100"
              className={inputClass}
            />
            <p className="text-xs text-thb-text-muted">Maximum file size allowed for sharing in chat</p>
          </div>

          {/* Message Retention */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-thb-text-secondary">Message Retention</label>
            <select
              value={messageRetention}
              onChange={(e) => setMessageRetention(e.target.value)}
              className={selectClass}
            >
              <option value="30 Days">30 Days</option>
              <option value="90 Days">90 Days</option>
              <option value="6 Months">6 Months</option>
              <option value="1 Year">1 Year</option>
              <option value="Indefinite">Indefinite</option>
            </select>
          </div>
        </div>

        {/* Productivity */}
        <div className="thb-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-thb-text-primary">Productivity</h2>

          {/* Calendar Sync */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-thb-text-primary">Calendar Sync</p>
              <p className="text-xs text-thb-text-muted">
                Synchronize meetings and events with your team calendar
              </p>
            </div>
            <button
              onClick={() => setCalendarSync(!calendarSync)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                calendarSync ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {calendarSync ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Email Integration */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-thb-text-primary">Email Integration</p>
              <p className="text-xs text-thb-text-muted">
                Connect email to send and receive messages within the collaboration hub
              </p>
            </div>
            <button
              onClick={() => setEmailIntegration(!emailIntegration)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                emailIntegration ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {emailIntegration ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
