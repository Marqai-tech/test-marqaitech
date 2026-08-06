'use client';

import { useEffect, useState } from 'react';
import { FiSettings, FiSave, FiRefreshCw, FiMonitor, FiMapPin, FiCamera, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

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

export default function AttendanceSettingsPage() {
  const { user } = useAuthStore();
  const effectiveCompanyId = useCompanyContextStore(s => s.effectiveCompanyId);
  const isAdmin = ['super_admin', 'tenant_admin', 'admin'].includes(user?.role || '');

  // Attendance Tracking Settings (moved from Company Settings)
  const [enableBiometric, setEnableBiometric] = useState(false);
  const [enableGeoFencing, setEnableGeoFencing] = useState(true);
  const [enableSelfieAttendance, setEnableSelfieAttendance] = useState(false);
  const [lateGraceMinutes, setLateGraceMinutes] = useState(15);
  const [halfDayThreshold, setHalfDayThreshold] = useState(4);
  const [markAbsentAfter, setMarkAbsentAfter] = useState(2);

  // Policy Config (from AttendancePolicyConfig API)
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
      toast.error(e instanceof Error ? e.message : 'Failed to load policy config');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save attendance policy config
      if (config) {
        const r = await fetch('/api/attendance-policy-config', {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(config),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed');
        setConfig(d.config);
      }
      toast.success('Attendance settings saved successfully');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <FiSettings className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Attendance settings are restricted to HR admins.</p>
      </div>
    );
  }

  if (loading || !config) return <div className="text-center py-12 text-slate-400">Loading...</div>;

  const update = (k: keyof PolicyConfig, v: unknown) => setConfig({ ...config, [k]: v });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50">
            <FiSettings className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Attendance Settings</h1>
            <p className="text-sm text-thb-text-secondary">Configure attendance tracking, policies, grace periods, and auto-approval rules</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
          {saving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
          Save Settings
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Tracking */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <div className="flex items-center gap-2">
              <FiMonitor className="w-4 h-4 text-teal-600" />
              <h3 className="font-semibold text-thb-text-primary">Attendance Tracking</h3>
            </div>
            <p className="text-xs text-thb-text-muted mt-0.5">Check-in methods and tracking rules</p>
          </div>
          <div className="p-5 space-y-5">
            {/* Biometric */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Biometric Attendance</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Use biometric devices for attendance</p>
              </div>
              <button onClick={() => setEnableBiometric(!enableBiometric)} className="flex items-center gap-2 text-sm">
                {enableBiometric ? (
                  <><FiMonitor className="w-5 h-5 text-teal-500" /><span className="text-teal-600 font-medium">On</span></>
                ) : (
                  <span className="text-slate-400 font-medium">Off</span>
                )}
              </button>
            </div>

            {/* Geo-Fencing */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div className="flex items-center gap-2">
                <FiMapPin className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Geo-Fencing</p>
                  <p className="text-xs text-thb-text-muted mt-0.5">Restrict check-in to office location radius</p>
                </div>
              </div>
              <button onClick={() => setEnableGeoFencing(!enableGeoFencing)} className="flex items-center gap-2 text-sm">
                {enableGeoFencing ? (
                  <><FiMapPin className="w-5 h-5 text-emerald-500" /><span className="text-emerald-600 font-medium">On</span></>
                ) : (
                  <span className="text-slate-400 font-medium">Off</span>
                )}
              </button>
            </div>

            {/* Selfie Attendance */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div className="flex items-center gap-2">
                <FiCamera className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Selfie Attendance</p>
                  <p className="text-xs text-thb-text-muted mt-0.5">Require selfie during check-in/check-out</p>
                </div>
              </div>
              <button onClick={() => setEnableSelfieAttendance(!enableSelfieAttendance)} className="flex items-center gap-2 text-sm">
                {enableSelfieAttendance ? (
                  <><FiCamera className="w-5 h-5 text-green-500" /><span className="text-green-600 font-medium">On</span></>
                ) : (
                  <span className="text-slate-400 font-medium">Off</span>
                )}
              </button>
            </div>

            {/* Grace Period */}
            <div className="pt-4 border-t border-thb-border">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Late Grace (min)</label>
                  <input
                    type="number"
                    value={lateGraceMinutes}
                    onChange={(e) => setLateGraceMinutes(Number(e.target.value))}
                    min={0}
                    className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Half Day (hrs)</label>
                  <input
                    type="number"
                    value={halfDayThreshold}
                    onChange={(e) => setHalfDayThreshold(Number(e.target.value))}
                    min={0}
                    className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Absent After (late days)</label>
                  <input
                    type="number"
                    value={markAbsentAfter}
                    onChange={(e) => setMarkAbsentAfter(Number(e.target.value))}
                    min={0}
                    className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Policy Config */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <div className="flex items-center gap-2">
              <FiClock className="w-4 h-4 text-emerald-600" />
              <h3 className="font-semibold text-thb-text-primary">Attendance Policy</h3>
            </div>
            <p className="text-xs text-thb-text-muted mt-0.5">Rounding rules, grace periods, overtime and auto-approval</p>
          </div>
          <div className="p-5 space-y-5">
            {/* Policy Name */}
            <div>
              <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Policy Name</label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => update('name', e.target.value)}
                className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>

            {/* Rounding */}
            <div className="pt-4 border-t border-thb-border">
              <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Time Rounding</h4>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-thb-text-primary">Round Clock Times</p>
                <button
                  onClick={() => update('roundEnabled', !config.roundEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.roundEnabled ? 'bg-teal-500' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${config.roundEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {config.roundEnabled && (
                <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-teal-200">
                  <div>
                    <label className="block text-xs text-thb-text-muted mb-1">Minutes</label>
                    <select value={config.roundMinutes} onChange={(e) => update('roundMinutes', Number(e.target.value))} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm">
                      <option value={5}>5 min</option>
                      <option value={10}>10 min</option>
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-thb-text-muted mb-1">Direction</label>
                    <select value={config.roundDirection} onChange={(e) => update('roundDirection', e.target.value)} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm">
                      <option value="nearest">Nearest</option>
                      <option value="up">Up</option>
                      <option value="down">Down</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Grace Periods */}
            <div className="pt-4 border-t border-thb-border">
              <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Grace Periods</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-thb-text-muted mb-1">Late Grace (min)</label>
                  <input type="number" value={config.lateGraceMinutes} onChange={(e) => update('lateGraceMinutes', Number(e.target.value))} min={0} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-thb-text-muted mb-1">Early Grace (min)</label>
                  <input type="number" value={config.earlyGraceMinutes} onChange={(e) => update('earlyGraceMinutes', Number(e.target.value))} min={0} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm" />
                </div>
              </div>
            </div>

            {/* Overtime */}
            <div className="pt-4 border-t border-thb-border">
              <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Overtime</h4>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-thb-text-primary">Auto Overtime Detection</p>
                <button
                  onClick={() => update('autoOvertimeEnabled', !config.autoOvertimeEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.autoOvertimeEnabled ? 'bg-teal-500' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${config.autoOvertimeEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {config.autoOvertimeEnabled && (
                <div className="pl-4 border-l-2 border-teal-200">
                  <label className="block text-xs text-thb-text-muted mb-1">OT Threshold (min)</label>
                  <input type="number" value={config.overtimeThresholdMinutes} onChange={(e) => update('overtimeThresholdMinutes', Number(e.target.value))} min={0} className="w-full max-w-[200px] px-3 py-2 border border-thb-border rounded-lg text-sm" />
                  <p className="text-xs text-thb-text-muted mt-1">Minutes after standard hours before OT kicks in</p>
                </div>
              )}
            </div>

            {/* Auto-Approval */}
            <div className="pt-4 border-t border-thb-border">
              <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Auto-Approval</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-thb-text-muted mb-1">Permission (min)</label>
                  <input type="number" value={config.autoApprovePermissionMinutes} onChange={(e) => update('autoApprovePermissionMinutes', Number(e.target.value))} min={0} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-thb-text-muted mb-1">Min Attendance %</label>
                  <input type="number" value={config.autoApproveMinAttendancePct} onChange={(e) => update('autoApproveMinAttendancePct', Number(e.target.value))} min={0} max={100} className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm" />
                </div>
              </div>
            </div>

            {/* WFH Monitoring */}
            <div className="pt-4 border-t border-thb-border">
              <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">WFH Monitoring</h4>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-thb-text-primary">Activity Monitoring</p>
                <button
                  onClick={() => update('wfhActivityMonitoringEnabled', !config.wfhActivityMonitoringEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.wfhActivityMonitoringEnabled ? 'bg-teal-500' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${config.wfhActivityMonitoringEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {config.wfhActivityMonitoringEnabled && (
                <div className="pl-4 border-l-2 border-teal-200">
                  <label className="block text-xs text-thb-text-muted mb-1">Inactivity Threshold (hrs)</label>
                  <input type="number" value={config.wfhInactivityThresholdHours} onChange={(e) => update('wfhInactivityThresholdHours', Number(e.target.value))} min={1} className="w-full max-w-[200px] px-3 py-2 border border-thb-border rounded-lg text-sm" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
