'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiSave, FiRefreshCw, FiSettings, FiInfo } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface InterviewWorkflowConfig {
  rounds: Array<{ name: string; type: string; requiredPanelSize: number; panelLeadMandatory: boolean }>;
  confirmationDeadlineHours: number;
  feedbackDeadlineHours: number;
  reminderSchedule: { hoursBefore24h: boolean; hoursBefore1h: boolean; feedbackPending: boolean };
  panelLeadMandatory: boolean;
  minPanelSize: number;
  maxPanelSize: number;
  rescheduleAllowed: boolean;
  noShowAutoMarkHours: number;
  emergencyOverrideAllowed: boolean;
  whoCanSchedule: string[];
  whoCanDecide: string[];
}

const defaultConfig: InterviewWorkflowConfig = {
  rounds: [
    { name: 'AI Interview', type: 'ai', requiredPanelSize: 0, panelLeadMandatory: false },
    { name: 'HR Screening', type: 'hr', requiredPanelSize: 1, panelLeadMandatory: false },
    { name: 'Technical Round 1', type: 'technical', requiredPanelSize: 2, panelLeadMandatory: true },
    { name: 'Technical Round 2', type: 'technical', requiredPanelSize: 2, panelLeadMandatory: true },
    { name: 'Managerial Round', type: 'offline_panel', requiredPanelSize: 2, panelLeadMandatory: true },
    { name: 'HR/Final Round', type: 'hr', requiredPanelSize: 1, panelLeadMandatory: true },
  ],
  confirmationDeadlineHours: 24,
  feedbackDeadlineHours: 48,
  reminderSchedule: { hoursBefore24h: true, hoursBefore1h: true, feedbackPending: true },
  panelLeadMandatory: true,
  minPanelSize: 1,
  maxPanelSize: 5,
  rescheduleAllowed: true,
  noShowAutoMarkHours: 48,
  emergencyOverrideAllowed: true,
  whoCanSchedule: ['hr_admin', 'company_hr_admin', 'admin', 'tenant_admin'],
  whoCanDecide: ['hr_admin', 'company_hr_admin', 'admin', 'tenant_admin'],
};

export default function RecruitmentInterviewWorkflowSettings() {
  const { user } = useAuthStore();
  const [config, setConfig] = useState<InterviewWorkflowConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(user?.role || '');

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      // CRITICAL FIX #5: Use the correct API path /api/recruitment/workflow-config
      // (was calling /api/recruitment-workflow-config which doesn't exist)
      const res = await fetch('/api/recruitment/workflow-config?type=interview', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          try {
            const parsed = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
            setConfig({ ...defaultConfig, ...parsed });
          } catch {}
        }
      }
    } catch { /* use defaults */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // CRITICAL FIX #5: Use the correct API path + PUT method (not POST)
      const res = await fetch('/api/recruitment/workflow-config', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ type: 'interview', config: JSON.stringify(config) }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Interview workflow settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <FiSettings className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Only administrators can configure interview workflow settings.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-emerald-500 rounded-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary">Interview Workflow Configuration</h1>
          <p className="text-sm text-thb-text-secondary mt-1">Configure interview rounds, panel rules, deadlines, and permissions (tenant-specific)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchConfig} className="px-4 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50 flex items-center gap-2">
            <FiRefreshCw className="w-4 h-4" /> Reload
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
            <FiSave className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Interview Rounds */}
      <div className="thb-card p-6">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-4 flex items-center gap-2">
          <FiSettings className="w-4 h-4" /> Interview Rounds & Sequence
        </h3>
        <div className="space-y-3">
          {config.rounds.map((round, i) => (
            <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
              <span className="text-xs font-bold text-slate-400 w-6">{i + 1}</span>
              <input
                type="text"
                value={round.name}
                onChange={(e) => {
                  const rounds = [...config.rounds];
                  rounds[i] = { ...round, name: e.target.value };
                  setConfig({ ...config, rounds });
                }}
                className="flex-1 px-3 py-2 border border-thb-border rounded-lg text-sm bg-white"
                placeholder="Round name"
              />
              <select
                value={round.type}
                onChange={(e) => {
                  const rounds = [...config.rounds];
                  rounds[i] = { ...round, type: e.target.value };
                  setConfig({ ...config, rounds });
                }}
                className="px-3 py-2 border border-thb-border rounded-lg text-sm bg-white"
              >
                <option value="ai">AI</option>
                <option value="technical">Technical</option>
                <option value="hr">HR</option>
                <option value="offline_panel">Panel</option>
              </select>
              <input
                type="number"
                min={0}
                value={round.requiredPanelSize}
                onChange={(e) => {
                  const rounds = [...config.rounds];
                  rounds[i] = { ...round, requiredPanelSize: parseInt(e.target.value) || 0 };
                  setConfig({ ...config, rounds });
                }}
                className="w-20 px-3 py-2 border border-thb-border rounded-lg text-sm bg-white"
                placeholder="Panel"
              />
              <label className="flex items-center gap-1.5 text-xs text-thb-text-secondary">
                <input
                  type="checkbox"
                  checked={round.panelLeadMandatory}
                  onChange={(e) => {
                    const rounds = [...config.rounds];
                    rounds[i] = { ...round, panelLeadMandatory: e.target.checked };
                    setConfig({ ...config, rounds });
                  }}
                />
                Lead req.
              </label>
              <button
                onClick={() => {
                  const rounds = config.rounds.filter((_, idx) => idx !== i);
                  setConfig({ ...config, rounds });
                }}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            onClick={() => setConfig({ ...config, rounds: [...config.rounds, { name: 'New Round', type: 'technical', requiredPanelSize: 1, panelLeadMandatory: false }] })}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            + Add Round
          </button>
        </div>
      </div>

      {/* Deadlines & Rules */}
      <div className="thb-card p-6">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Deadlines & Panel Rules</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Confirmation Deadline (hours)</label>
            <input type="number" min={1} value={config.confirmationDeadlineHours}
              onChange={(e) => setConfig({ ...config, confirmationDeadlineHours: parseInt(e.target.value) || 24 })}
              className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Feedback Deadline (hours)</label>
            <input type="number" min={1} value={config.feedbackDeadlineHours}
              onChange={(e) => setConfig({ ...config, feedbackDeadlineHours: parseInt(e.target.value) || 48 })}
              className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Min Panel Size</label>
            <input type="number" min={1} value={config.minPanelSize}
              onChange={(e) => setConfig({ ...config, minPanelSize: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Max Panel Size</label>
            <input type="number" min={1} value={config.maxPanelSize}
              onChange={(e) => setConfig({ ...config, maxPanelSize: parseInt(e.target.value) || 5 })}
              className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">No-Show Auto-Mark (hours)</label>
            <input type="number" min={1} value={config.noShowAutoMarkHours}
              onChange={(e) => setConfig({ ...config, noShowAutoMarkHours: parseInt(e.target.value) || 48 })}
              className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-4">
          <label className="flex items-center gap-2 text-sm text-thb-text-secondary">
            <input type="checkbox" checked={config.panelLeadMandatory}
              onChange={(e) => setConfig({ ...config, panelLeadMandatory: e.target.checked })} />
            Panel Lead Mandatory
          </label>
          <label className="flex items-center gap-2 text-sm text-thb-text-secondary">
            <input type="checkbox" checked={config.rescheduleAllowed}
              onChange={(e) => setConfig({ ...config, rescheduleAllowed: e.target.checked })} />
            Reschedule Allowed
          </label>
          <label className="flex items-center gap-2 text-sm text-thb-text-secondary">
            <input type="checkbox" checked={config.emergencyOverrideAllowed}
              onChange={(e) => setConfig({ ...config, emergencyOverrideAllowed: e.target.checked })} />
            Emergency Override Allowed
          </label>
        </div>
      </div>

      {/* Reminders */}
      <div className="thb-card p-6">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Reminder Schedule</h3>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-thb-text-secondary">
            <input type="checkbox" checked={config.reminderSchedule.hoursBefore24h}
              onChange={(e) => setConfig({ ...config, reminderSchedule: { ...config.reminderSchedule, hoursBefore24h: e.target.checked } })} />
            24 hours before interview
          </label>
          <label className="flex items-center gap-2 text-sm text-thb-text-secondary">
            <input type="checkbox" checked={config.reminderSchedule.hoursBefore1h}
              onChange={(e) => setConfig({ ...config, reminderSchedule: { ...config.reminderSchedule, hoursBefore1h: e.target.checked } })} />
            1 hour before interview
          </label>
          <label className="flex items-center gap-2 text-sm text-thb-text-secondary">
            <input type="checkbox" checked={config.reminderSchedule.feedbackPending}
              onChange={(e) => setConfig({ ...config, reminderSchedule: { ...config.reminderSchedule, feedbackPending: e.target.checked } })} />
            Pending feedback reminder
          </label>
        </div>
      </div>

      <div className="thb-card p-6 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-2">
          <FiInfo className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-thb-text-secondary">
            These settings are tenant-specific and apply to all interviews scheduled within your organization.
            Changes take effect immediately for new interviews. Existing interviews retain their original configuration.
          </p>
        </div>
      </div>
    </div>
  );
}
