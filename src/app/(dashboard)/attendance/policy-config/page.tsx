'use client';

import { useEffect, useState } from 'react';
import { FiSettings, FiSave, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import ModuleTips from '@/components/ModuleTips';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface PolicyConfig {
  id: string;
  name: string;
  roundEnabled: boolean;
  roundMinutes: number;
  roundDirection: string;
  lateGraceMinutes: number;
  earlyGraceMinutes: number;
  autoOvertimeEnabled: boolean;
  overtimeThresholdMinutes: number;
  autoApprovePermissionMinutes: number;
  autoApproveMinAttendancePct: number;
  wfhActivityMonitoringEnabled: boolean;
  wfhInactivityThresholdHours: number;
}

export default function PolicyConfigPage() {
  const { user } = useAuthStore();
  const effectiveCompanyId = useCompanyContextStore(s => s.effectiveCompanyId());
  const isAdmin = ['super_admin', 'tenant_admin', 'admin'].includes(user?.role || '');

  const [config, setConfig] = useState<PolicyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const cid = effectiveCompanyId();
      const r = await fetch(`/api/attendance-policy-config${cid ? `?companyId=${cid}` : ''}`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setConfig(d.config);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/attendance-policy-config', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(config),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setConfig(d.config);
      toast.success('Policy saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <FiSettings className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Attendance Policy Configuration is restricted to HR admins.</p>
      </div>
    );
  }

  if (loading || !config) return <div className="text-center py-12 text-slate-400">Loading...</div>;

  const update = (k: keyof PolicyConfig, v: unknown) => setConfig({ ...config, [k]: v });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FiSettings className="w-6 h-6 text-emerald-500" />
            Attendance Policy Configuration
          </h1>
          <p className="text-sm text-slate-500 mt-1">Global policy: rounding rules, grace periods, OT, auto-approval, WFH monitoring</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="3boxes-btn-primary flex items-center gap-2">
          {saving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
          Save Policy
        </button>
      </div>

      <ModuleTips moduleKey="attendance-policy-config">
        <p><strong>REQ-CFG-03, REQ-OT-01, REQ-AI-ATT-04, REQ-ATT-07:</strong> Configure global attendance rules: punch rounding, late/early grace periods, auto-overtime threshold, AI auto-approval of short permissions, and WFH activity monitoring thresholds. Changes apply to all sub-companies unless overridden.</p>
      </ModuleTips>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rounding & Grace */}
        <div className="thb-card p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Rounding & Grace Periods (REQ-CFG-03)</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={config.roundEnabled} onChange={e => update('roundEnabled', e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-700">Enable punch time rounding</span>
            </label>
            {config.roundEnabled && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Round to (minutes)</label>
                  <select value={config.roundMinutes} onChange={e => update('roundMinutes', Number(e.target.value))} className="3boxes-input w-full">
                    <option value={5}>5 min</option>
                    <option value={10}>10 min</option>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Direction</label>
                  <select value={config.roundDirection} onChange={e => update('roundDirection', e.target.value)} className="3boxes-input w-full">
                    <option value="nearest">Nearest</option>
                    <option value="up">Always up (employee-favorable)</option>
                    <option value="down">Always down (employer-favorable)</option>
                  </select>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Late Grace (min)</label>
                <input type="number" min="0" max="60" value={config.lateGraceMinutes} onChange={e => update('lateGraceMinutes', Number(e.target.value))} className="3boxes-input w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Early Departure Grace (min)</label>
                <input type="number" min="0" max="60" value={config.earlyGraceMinutes} onChange={e => update('earlyGraceMinutes', Number(e.target.value))} className="3boxes-input w-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Overtime */}
        <div className="thb-card p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Overtime (REQ-OT-01)</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={config.autoOvertimeEnabled} onChange={e => update('autoOvertimeEnabled', e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-700">Auto-calculate overtime when employee stays past shift end</span>
            </label>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">OT Threshold (minutes from check-in)</label>
              <input type="number" min="240" max="720" step="30" value={config.overtimeThresholdMinutes} onChange={e => update('overtimeThresholdMinutes', Number(e.target.value))} className="3boxes-input w-full" />
              <p className="text-xs text-slate-500 mt-1">Default: 480 (8 hours). OT starts accruing after this many minutes from check-in.</p>
            </div>
          </div>
        </div>

        {/* AI Auto-Approval */}
        <div className="thb-card p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">AI Auto-Approval (REQ-AI-ATT-04)</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Auto-approve permissions ≤ (minutes) · 0 = disabled</label>
              <input type="number" min="0" max="240" step="15" value={config.autoApprovePermissionMinutes} onChange={e => update('autoApprovePermissionMinutes', Number(e.target.value))} className="3boxes-input w-full" />
              <p className="text-xs text-slate-500 mt-1">e.g. 30 = auto-approve permissions up to 30 min for employees with ≥ attendance threshold.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Minimum Attendance %</label>
              <input type="number" min="50" max="100" value={config.autoApproveMinAttendancePct} onChange={e => update('autoApproveMinAttendancePct', Number(e.target.value))} className="3boxes-input w-full" />
              <p className="text-xs text-slate-500 mt-1">Employee must have ≥ this % attendance in last 30 days to qualify for auto-approval.</p>
            </div>
          </div>
        </div>

        {/* WFH Monitoring */}
        <div className="thb-card p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">WFH Activity Monitoring (REQ-ATT-07)</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={config.wfhActivityMonitoringEnabled} onChange={e => update('wfhActivityMonitoringEnabled', e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-700">Enable AI activity monitoring for WFH employees</span>
            </label>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Inactivity threshold (hours)</label>
              <input type="number" min="2" max="8" value={config.wfhInactivityThresholdHours} onChange={e => update('wfhInactivityThresholdHours', Number(e.target.value))} className="3boxes-input w-full" />
              <p className="text-xs text-slate-500 mt-1">If WFH employee has zero activity (chats, timesheets, emails) for this many continuous hours, AI flags to manager.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
