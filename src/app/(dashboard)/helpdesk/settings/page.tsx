'use client';

import { useState } from 'react';
import { FiSettings, FiRefreshCw, FiSave, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

export default function SupportSettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [saving, setSaving] = useState(false);

  // Ticket Routing
  const [autoAssign, setAutoAssign] = useState(true);
  const [priorityEscalation, setPriorityEscalation] = useState(true);
  const [aiCategorization, setAiCategorization] = useState(true);

  // SLA Configuration
  const [slaCritical, setSlaCritical] = useState('30');
  const [slaHigh, setSlaHigh] = useState('2');
  const [slaNormal, setSlaNormal] = useState('8');
  const [slaLow, setSlaLow] = useState('24');

  const handleRefresh = () => {
    setAutoAssign(true);
    setPriorityEscalation(true);
    setAiCategorization(true);
    setSlaCritical('30');
    setSlaHigh('2');
    setSlaNormal('8');
    setSlaLow('24');
    toast.success('Settings refreshed to defaults');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      toast.success('Support settings saved successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

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
            <h1 className="text-xl font-bold text-thb-text-primary">Support Settings</h1>
            <p className="text-sm text-thb-text-secondary">
              Configure ticket routing rules and SLA response times for the helpdesk
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
        {/* Ticket Routing */}
        <div className="thb-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-thb-text-primary">Ticket Routing</h2>

          {/* Auto-assign */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-thb-text-primary">Auto-assign</p>
              <p className="text-xs text-thb-text-muted">
                Automatically route new tickets to available agents based on workload
              </p>
            </div>
            <button
              onClick={() => setAutoAssign(!autoAssign)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                autoAssign ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {autoAssign ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Priority Escalation */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-thb-text-primary">Priority Escalation</p>
              <p className="text-xs text-thb-text-muted">
                Escalate unresolved high-priority tickets automatically after SLA breach
              </p>
            </div>
            <button
              onClick={() => setPriorityEscalation(!priorityEscalation)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                priorityEscalation ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {priorityEscalation ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* AI Categorization */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-thb-text-primary">AI Categorization</p>
              <p className="text-xs text-thb-text-muted">
                Use AI to auto-categorize and tag incoming support tickets
              </p>
            </div>
            <button
              onClick={() => setAiCategorization(!aiCategorization)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                aiCategorization ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {aiCategorization ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>

        {/* SLA Configuration */}
        <div className="thb-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-thb-text-primary">SLA Configuration</h2>
            <FiAlertCircle className="w-4 h-4 text-thb-text-muted" />
          </div>

          {/* Critical */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">Critical</span>
              <span className="text-sm text-thb-text-secondary">First response time</span>
            </div>
            <div className="flex items-center gap-1 w-28">
              <input
                type="number"
                value={slaCritical}
                onChange={(e) => setSlaCritical(e.target.value)}
                min="5"
                className={inputClass}
              />
              <span className="text-xs text-thb-text-muted whitespace-nowrap">min</span>
            </div>
          </div>

          {/* High */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-700">High</span>
              <span className="text-sm text-thb-text-secondary">First response time</span>
            </div>
            <div className="flex items-center gap-1 w-28">
              <input
                type="number"
                value={slaHigh}
                onChange={(e) => setSlaHigh(e.target.value)}
                min="1"
                className={inputClass}
              />
              <span className="text-xs text-thb-text-muted whitespace-nowrap">hrs</span>
            </div>
          </div>

          {/* Normal */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">Normal</span>
              <span className="text-sm text-thb-text-secondary">First response time</span>
            </div>
            <div className="flex items-center gap-1 w-28">
              <input
                type="number"
                value={slaNormal}
                onChange={(e) => setSlaNormal(e.target.value)}
                min="1"
                className={inputClass}
              />
              <span className="text-xs text-thb-text-muted whitespace-nowrap">hrs</span>
            </div>
          </div>

          {/* Low */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600">Low</span>
              <span className="text-sm text-thb-text-secondary">First response time</span>
            </div>
            <div className="flex items-center gap-1 w-28">
              <input
                type="number"
                value={slaLow}
                onChange={(e) => setSlaLow(e.target.value)}
                min="1"
                className={inputClass}
              />
              <span className="text-xs text-thb-text-muted whitespace-nowrap">hrs</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
