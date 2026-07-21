'use client';

import { useState } from 'react';
import {
  FiSettings, FiSave, FiToggleLeft, FiToggleRight, FiCalendar,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function LeaveSettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'tenant_admin' || user?.role === 'admin';

  // Accrual & Carry Forward
  const [carryForward, setCarryForward] = useState(true);
  const [maxCarryForward, setMaxCarryForward] = useState(5);
  const [proRateJoining, setProRateJoining] = useState(true);

  // Leave Rules
  const [sandwichRule, setSandwichRule] = useState(false);
  const [minAdvanceNotice, setMinAdvanceNotice] = useState(3);
  const [probationRestriction, setProbationRestriction] = useState(true);

  // Leave Policy Defaults (moved from Company Settings)
  const [casualLeavePerYear, setCasualLeavePerYear] = useState(12);
  const [sickLeavePerYear, setSickLeavePerYear] = useState(10);
  const [earnedLeavePerYear, setEarnedLeavePerYear] = useState(15);
  const [leaveEncashment, setLeaveEncashment] = useState(true);
  const [probationLeaveQuota, setProbationLeaveQuota] = useState(5);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      toast.success('Leave settings saved successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50">
            <FiSettings className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Leave Policy Config</h1>
            <p className="text-sm text-thb-text-secondary">Configure leave accrual, carry forward, default allocations and rule settings</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <FiSave className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leave Policy Defaults */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <div className="flex items-center gap-2">
              <FiCalendar className="w-4 h-4 text-emerald-600" />
              <h3 className="font-semibold text-thb-text-primary">Leave Policy Defaults</h3>
            </div>
            <p className="text-xs text-thb-text-muted mt-0.5">Default leave allocation per year for new employees</p>
          </div>
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Casual Leave / Year</label>
                <input
                  type="number"
                  value={casualLeavePerYear}
                  onChange={(e) => setCasualLeavePerYear(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-xs text-thb-text-muted mt-1">Number of casual leaves per year</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Sick Leave / Year</label>
                <input
                  type="number"
                  value={sickLeavePerYear}
                  onChange={(e) => setSickLeavePerYear(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-xs text-thb-text-muted mt-1">Number of sick leaves per year</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Earned Leave / Year</label>
                <input
                  type="number"
                  value={earnedLeavePerYear}
                  onChange={(e) => setEarnedLeavePerYear(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-xs text-thb-text-muted mt-1">Number of earned/privilege leaves per year</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Probation Leave Quota</label>
                <input
                  type="number"
                  value={probationLeaveQuota}
                  onChange={(e) => setProbationLeaveQuota(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-xs text-thb-text-muted mt-1">Leave quota during probation period</p>
              </div>
            </div>

            {/* Leave Encashment */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Leave Encashment</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Allow employees to encash unused leaves at the end of the year</p>
              </div>
              <button
                onClick={() => setLeaveEncashment(!leaveEncashment)}
                className="flex items-center gap-2 text-sm"
              >
                {leaveEncashment ? (
                  <><FiToggleRight className="w-6 h-6 text-emerald-500" /><span className="text-emerald-600 font-medium">Enabled</span></>
                ) : (
                  <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Disabled</span></>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Accrual & Carry Forward */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <h3 className="font-semibold text-thb-text-primary">Accrual & Carry Forward</h3>
            <p className="text-xs text-thb-text-muted mt-0.5">Configure how leaves accrue and carry over</p>
          </div>
          <div className="p-5 space-y-5">
            {/* Carry Forward Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Carry Forward</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Allow unused leaves to carry forward to next year</p>
              </div>
              <button
                onClick={() => setCarryForward(!carryForward)}
                className="flex items-center gap-2 text-sm"
              >
                {carryForward ? (
                  <><FiToggleRight className="w-6 h-6 text-blue-500" /><span className="text-blue-600 font-medium">Enabled</span></>
                ) : (
                  <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Disabled</span></>
                )}
              </button>
            </div>

            {/* Max Carry Forward */}
            {carryForward && (
              <div className="pl-4 border-l-2 border-blue-200">
                <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Max Carry Forward Days</label>
                <input
                  type="number"
                  value={maxCarryForward}
                  onChange={(e) => setMaxCarryForward(Number(e.target.value))}
                  min={0}
                  className="w-full max-w-[200px] px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-xs text-thb-text-muted mt-1">Maximum number of leave days that can be carried forward</p>
              </div>
            )}

            {/* Pro-rate on Joining */}
            <div className="flex items-center justify-between pt-4 border-t border-thb-border">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Pro-rate on Joining</p>
                <p className="text-xs text-thb-text-muted mt-0.5">Calculate leave quota proportionally based on joining date</p>
              </div>
              <button
                onClick={() => setProRateJoining(!proRateJoining)}
                className="flex items-center gap-2 text-sm"
              >
                {proRateJoining ? (
                  <><FiToggleRight className="w-6 h-6 text-blue-500" /><span className="text-blue-600 font-medium">Enabled</span></>
                ) : (
                  <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Disabled</span></>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Leave Rules */}
        <div className="thb-card overflow-hidden lg:col-span-2">
          <div className="px-5 py-4 border-b border-thb-border bg-slate-50">
            <h3 className="font-semibold text-thb-text-primary">Leave Rules</h3>
            <p className="text-xs text-thb-text-muted mt-0.5">Define leave application rules and restrictions</p>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Sandwich Rule */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Sandwich Rule</p>
                  <p className="text-xs text-thb-text-muted mt-0.5">Count weekends/holidays between leave dates as leave days</p>
                </div>
                <button
                  onClick={() => setSandwichRule(!sandwichRule)}
                  className="flex items-center gap-2 text-sm"
                >
                  {sandwichRule ? (
                    <><FiToggleRight className="w-6 h-6 text-amber-500" /><span className="text-amber-600 font-medium">On</span></>
                  ) : (
                    <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Off</span></>
                  )}
                </button>
              </div>

              {/* Min Advance Notice */}
              <div>
                <label className="block text-sm font-medium text-thb-text-primary mb-1.5">Min Advance Notice (Days)</label>
                <input
                  type="number"
                  value={minAdvanceNotice}
                  onChange={(e) => setMinAdvanceNotice(Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 border border-thb-border rounded-lg text-sm text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <p className="text-xs text-thb-text-muted mt-1">Minimum days before leave start date that application must be submitted</p>
              </div>

              {/* Probation Restriction */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Probation Restriction</p>
                  <p className="text-xs text-thb-text-muted mt-0.5">Restrict leave usage during probation period</p>
                </div>
                <button
                  onClick={() => setProbationRestriction(!probationRestriction)}
                  className="flex items-center gap-2 text-sm"
                >
                  {probationRestriction ? (
                    <><FiToggleRight className="w-6 h-6 text-blue-500" /><span className="text-blue-600 font-medium">On</span></>
                  ) : (
                    <><FiToggleLeft className="w-6 h-6 text-slate-400" /><span className="text-slate-400 font-medium">Off</span></>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
