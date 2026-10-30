'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  FiFileText, FiLayers, FiCheckSquare, FiList, FiSettings,
  FiCalendar, FiRefreshCw, FiSave, FiInfo,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import ModuleSettingsShell from '@/components/ModuleSettingsShell';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ─── Leave Rules Form (renders inside the Rules tab) ─── */
function LeaveRulesForm() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Form state — global leave rules
  const [leaveYearStart, setLeaveYearStart] = useState('january');
  const [maxCarryForward, setMaxCarryForward] = useState(5);
  const [carryForwardEnabled, setCarryForwardEnabled] = useState(true);
  const [sandwichRule, setSandwichRule] = useState(false);
  const [proRateJoining, setProRateJoining] = useState(true);
  const [probationRestriction, setProbationRestriction] = useState(true);
  const [probationMonths, setProbationMonths] = useState(6);
  const [leaveEncashment, setLeaveEncashment] = useState(true);
  const [encashmentBasis, setEncashmentBasis] = useState('basic');
  const [minAdvanceNotice, setMinAdvanceNotice] = useState(3);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const r = await fetch(`/api/leave-policy-config${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() });
      if (r.ok) {
        const d = await r.json();
        const c = d.config || {};
        setLeaveYearStart(c.leaveYearStartMonth || 'january');
        setMaxCarryForward(c.maxCarryForwardDays ?? 5);
        setCarryForwardEnabled(c.carryForwardGlobal ?? true);
        setSandwichRule(c.sandwichRuleEnabled ?? false);
        setProRateJoining(c.proRataEnabled ?? true);
        setProbationRestriction(c.probationRestriction ?? true);
        setProbationMonths(c.probationMonths ?? 6);
        setLeaveEncashment(c.encashmentAllowed ?? true);
        setEncashmentBasis(c.encashmentBasis || 'basic');
        setMinAdvanceNotice(c.minAdvanceNotice ?? 3);
      }
    } catch {
      // non-fatal — use defaults
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const sq = scopeQuery();
      const r = await fetch(`/api/leave-policy-config${sq ? `?${sq}` : ''}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          carryForward: carryForwardEnabled,
          maxCarryForward,
          proRateJoining,
          sandwichRule,
          probationRestriction,
          probationMonths,
          minAdvanceNotice,
          leaveEncashment,
        }),
      });
      if (r.ok) {
        toast.success('Leave rules saved successfully');
        setDirty(false);
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Failed to save leave rules');
      }
    } catch {
      toast.error('Network error while saving');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-thb-border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500';
  const labelClass = 'block text-xs font-medium text-thb-text-secondary mb-1';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <FiRefreshCw className="w-4 h-4 text-thb-text-muted animate-spin mr-2" />
        <span className="text-sm text-thb-text-muted">Loading leave rules…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Save bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-thb-text-muted">
          These are the global leave rules that apply to all employees in your company.
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <FiSave className="w-4 h-4" />
          {saving ? 'Saving…' : dirty ? 'Save Rules' : 'Saved'}
        </button>
      </div>

      {/* Leave Year & Carry Forward */}
      <div className="thb-card p-5">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-4 flex items-center gap-2">
          <FiCalendar className="w-4 h-4 text-green-500" /> Leave Year &amp; Carry Forward
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Leave Year Start Month</label>
            <select
              value={leaveYearStart}
              onChange={e => { setLeaveYearStart(e.target.value); setDirty(true); }}
              className={inputClass}
            >
              <option value="january">January</option>
              <option value="april">April</option>
              <option value="july">July</option>
              <option value="october">October</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Max Carry Forward Days</label>
            <input
              type="number" min={0} max={30}
              value={maxCarryForward}
              onChange={e => { setMaxCarryForward(Number(e.target.value)); setDirty(true); }}
              className={inputClass}
            />
          </div>
        </div>
        <label className="flex items-center gap-3 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={carryForwardEnabled}
            onChange={e => { setCarryForwardEnabled(e.target.checked); setDirty(true); }}
            className="w-4 h-4 rounded border-slate-300 text-green-500 focus:ring-green-500/20"
          />
          <span className="text-sm text-thb-text-primary">Allow carry forward of unused leave to the next year</span>
        </label>
      </div>

      {/* Application Rules */}
      <div className="thb-card p-5">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-4 flex items-center gap-2">
          <FiSettings className="w-4 h-4 text-teal-500" /> Application Rules
        </h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sandwichRule}
              onChange={e => { setSandwichRule(e.target.checked); setDirty(true); }}
              className="w-4 h-4 rounded border-slate-300 text-teal-500 focus:ring-teal-500/20"
            />
            <div>
              <p className="text-sm text-thb-text-primary">Sandwich Rule</p>
              <p className="text-xs text-thb-text-muted">Holidays/weekends between leave days count as leave</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={proRateJoining}
              onChange={e => { setProRateJoining(e.target.checked); setDirty(true); }}
              className="w-4 h-4 rounded border-slate-300 text-teal-500 focus:ring-teal-500/20"
            />
            <div>
              <p className="text-sm text-thb-text-primary">Pro-rata for new joiners</p>
              <p className="text-xs text-thb-text-muted">Reduce leave quota for employees joining mid-year</p>
            </div>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className={labelClass}>Min Advance Notice (days)</label>
              <input
                type="number" min={0} max={30}
                value={minAdvanceNotice}
                onChange={e => { setMinAdvanceNotice(Number(e.target.value)); setDirty(true); }}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Probation & Encashment */}
      <div className="thb-card p-5">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-4 flex items-center gap-2">
          <FiInfo className="w-4 h-4 text-amber-500" /> Probation &amp; Encashment
        </h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={probationRestriction}
              onChange={e => { setProbationRestriction(e.target.checked); setDirty(true); }}
              className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500/20"
            />
            <div>
              <p className="text-sm text-thb-text-primary">Restrict leave during probation</p>
              <p className="text-xs text-thb-text-muted">Employees on probation have limited leave access</p>
            </div>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Probation Period (months)</label>
              <input
                type="number" min={0} max={24}
                value={probationMonths}
                onChange={e => { setProbationMonths(Number(e.target.value)); setDirty(true); }}
                className={inputClass}
              />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={leaveEncashment}
              onChange={e => { setLeaveEncashment(e.target.checked); setDirty(true); }}
              className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500/20"
            />
            <div>
              <p className="text-sm text-thb-text-primary">Allow leave encashment</p>
              <p className="text-xs text-thb-text-muted">Employees can convert unused leave to payout</p>
            </div>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Encashment Basis</label>
              <select
                value={encashmentBasis}
                onChange={e => { setEncashmentBasis(e.target.value); setDirty(true); }}
                className={inputClass}
              >
                <option value="basic">Basic Salary</option>
                <option value="gross">Gross Salary</option>
                <option value="monthly_salary">Monthly Salary</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Quick links to other config pages */}
      <div className="thb-card p-4">
        <p className="text-xs text-thb-text-muted mb-3">Need more granular control? Configure per-leave-type rules here:</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/leave/types" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
            <FiList className="w-3.5 h-3.5" /> Leave Types
          </Link>
          <Link href="/leave/approval-workflows" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors">
            <FiCheckSquare className="w-3.5 h-3.5" /> Approval Workflows
          </Link>
          <Link href="/leave/leave-policy?tab=mapping" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors">
            <FiLayers className="w-3.5 h-3.5" /> Policy Rules
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Settings Page ─── */
function LeaveSettingsPageContent() {
  return (
    <ModuleSettingsShell
      moduleName="Leave"
      moduleAccent="green"
      basePath="/leave/settings"
      policy={
        <div className="space-y-4">
          {/* Top grid: Approval Workflows + Leave Types */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/leave/approval-workflows" className="thb-card p-4 flex items-start gap-3 hover:border-violet-300 hover:shadow-sm transition-all group">
              <div className="p-2 rounded-lg bg-violet-50 text-violet-500 flex-shrink-0">
                <FiCheckSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-thb-text-primary group-hover:text-violet-700">Approval Workflows</p>
                <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">
                  Multi-tier approver chain, workflow options and leave policy rules.
                </p>
              </div>
            </Link>
            <Link href="/leave/types" className="thb-card p-4 flex items-start gap-3 hover:border-green-300 hover:shadow-sm transition-all group">
              <div className="p-2 rounded-lg bg-green-50 text-green-600 flex-shrink-0">
                <FiList className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-thb-text-primary group-hover:text-green-700">Leave Types</p>
                <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">
                  Create, edit, and deactivate leave types. Set quotas, carry-forward, paid/unpaid.
                </p>
              </div>
            </Link>
          </div>

          {/* Policy Documents + Leave Type Mapping */}
          <div className="thb-card p-5">
            <h2 className="text-base font-semibold text-thb-text-primary mb-3">Policy &amp; Types</h2>
            <p className="text-xs text-thb-text-muted mb-4">
              Manage leave policy documents, leave type definitions, and leave-type-to-payroll mapping.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link href="/leave/leave-policy?tab=documents" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                <FiFileText className="w-4 h-4 text-emerald-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Policy Documents</p>
                  <p className="text-xs text-thb-text-muted">Upload &amp; version leave policy PDFs</p>
                </div>
              </Link>
              <Link href="/leave/leave-policy?tab=mapping" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                <FiLayers className="w-4 h-4 text-teal-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Leave Type Mapping</p>
                  <p className="text-xs text-thb-text-muted">Map leave types to policy rules</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      }
      rules={
        /* Rules tab — proper editable leave rules form */
        <LeaveRulesForm />
      }
    />
  );
}

export default function LeaveSettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-thb-text-muted">Loading Leave Settings…</div>}>
      <LeaveSettingsPageContent />
    </Suspense>
  );
}
