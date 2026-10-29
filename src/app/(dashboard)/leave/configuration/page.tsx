'use client';

/**
 * Leave Configuration — Year-End Processing + Leave Rules
 *
 * Replaces the old ModuleSettingsPanel-based configuration with a
 * structured, step-based UI matching the reference design:
 *   1. Leave Quota
 *   2. Leave Accrual
 *   3. Apply Leave
 *   4. Leave Restrictions
 *   5. Holidays & Weekends
 *   6. Leave Approval
 *   7. Year-End Processing  ← main focus per the reference screenshot
 *   8. Leave Encashment
 *
 * The Year-End Processing step (7) has 4 radio options:
 *   a) All balances expire or reset
 *   b) All leave encashed to employee
 *   c) Pay up to N days, carry forward the rest (per-leave-type table)
 *   d) Carry forward up to N days, encash the rest (per-leave-type table)
 *
 * Below the radio options is a Carry-Forward Settings table with columns:
 *   Leave Balance | Prior Calendar Days | Working Days
 *   Rule: "If balance exceeds [N] days, carry forward max [N] days,
 *         and pay max [N] days remaining"
 */

import { useState, useEffect, useCallback } from 'react';
import {
  FiSettings, FiArrowLeft, FiPlus, FiTrash2, FiCheck, FiX,
  FiChevronRight, FiChevronLeft, FiCalendar, FiDollarSign,
  FiClock, FiCheckSquare, FiAlertCircle, FiSave,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface LeaveType {
  id: string; name: string; code: string; defaultDays: number; isPaid: boolean;
}
interface CarryForwardRule {
  id: string;
  leaveTypeId: string;
  leaveTypeName: string;
  priorCalendarDays: number;
  workingDays: number;
  carryForwardMax: number;
  encashMax: number;
}

/* ── Steps ── */
const STEPS = [
  { num: 1, title: 'Leave Quota', icon: '📋' },
  { num: 2, title: 'Leave Accrual', icon: '📈' },
  { num: 3, title: 'Apply Leave', icon: '✏️' },
  { num: 4, title: 'Leave Restrictions', icon: '⚠️' },
  { num: 5, title: 'Holidays & Weekends', icon: '📅' },
  { num: 6, title: 'Leave Approval', icon: '✅' },
  { num: 7, title: 'Year-End Processing', icon: '🔄' },
  { num: 8, title: 'Leave Encashment', icon: '💰' },
];

const YEAR_END_MODES = [
  { value: 'expire_reset', label: 'All leave balances expire or reset at year end', desc: 'Unused leave is forfeited. Balances start fresh.' },
  { value: 'encash_all', label: 'All leave is encashed to the employee', desc: 'All unused leave days are paid out at the encashment rate.' },
  { value: 'pay_then_carry', label: 'Pay up to a certain number of days, carry forward the rest', desc: 'Pay out up to N days, carry forward remaining per the table below.' },
  { value: 'carry_then_pay', label: 'Carry forward up to N days, encash the rest', desc: 'Carry forward up to N days, pay out remaining per the table below.' },
];

/* ── Component ── */
export default function LeaveConfigurationPage() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [activeStep, setActiveStep] = useState(7); // Default to Year-End Processing
  const [saving, setSaving] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  // Leave Year & Carry Forward settings
  const [leaveYearStart, setLeaveYearStart] = useState('january');
  const [maxCarryForward, setMaxCarryForward] = useState('5');
  const [encashmentEnabled, setEncashmentEnabled] = useState(true);
  const [encashmentBasis, setEncashmentBasis] = useState('basic');

  // Year-End Processing
  const [yearEndMode, setYearEndMode] = useState('carry_then_pay');
  const [carryRules, setCarryRules] = useState<CarryForwardRule[]>([]);

  // Leave Restrictions
  const [maxConsecutiveDays, setMaxConsecutiveDays] = useState('');
  const [minAdvanceDays, setMinAdvanceDays] = useState('');
  const [halfDayAllowed, setHalfDayAllowed] = useState(true);
  const [sandwichRule, setSandwichRule] = useState(true);

  // Fetch leave types
  const fetchLeaveTypes = useCallback(async () => {
    try {
      const sq = scopeQuery();
      const res = await fetch(`/api/leave-types${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const types = data.data || data.leaveTypes || [];
        setLeaveTypes(types);
        // Initialize carry-forward rules from leave types
        if (carryRules.length === 0 && types.length > 0) {
          setCarryRules(types.map((lt: LeaveType) => ({
            id: `rule-${lt.id}`,
            leaveTypeId: lt.id,
            leaveTypeName: lt.name,
            priorCalendarDays: 0,
            workingDays: 0,
            carryForwardMax: 5,
            encashMax: 0,
          })));
        }
      }
    } catch { /* non-fatal */ }
  }, [scopeQuery]);

  useEffect(() => { void fetchLeaveTypes(); }, [fetchLeaveTypes]);

  // Fetch existing config
  const fetchConfig = useCallback(async () => {
    try {
      const sq = scopeQuery();
      const res = await fetch(`/api/leave-policy-config${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const config = data.config || {};
        if (config.carryForward !== undefined) setMaxCarryForward(String(config.maxCarryForward || config.carryForward || 5));
        if (config.leaveEncashment !== undefined) setEncashmentEnabled(Boolean(config.leaveEncashment));
        if (config.encashmentBasis) setEncashmentBasis(config.encashmentBasis);
        if (config.sandwichRule !== undefined) setSandwichRule(Boolean(config.sandwichRule));
      }
    } catch { /* non-fatal */ }
  }, [scopeQuery]);

  useEffect(() => { void fetchConfig(); }, [fetchConfig]);

  function updateCarryRule(id: string, field: keyof CarryForwardRule, value: string | number) {
    setCarryRules(prev => prev.map(r => r.id === id ? { ...r, [field]: Number(value) || 0 } : r));
  }

  function handleSave() {
    setSaving(true);
    // Save via the leave-policy-config API
    fetch('/api/leave-policy-config', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        carryForward: Number(maxCarryForward) || 0,
        maxCarryForward: Number(maxCarryForward) || 0,
        leaveEncashment: encashmentEnabled,
        encashmentBasis,
        sandwichRule,
        minAdvanceNotice: Number(minAdvanceDays) || 0,
        // Year-end processing config saved as part of the policy rule
        yearEndProcessingMode: yearEndMode,
        carryForwardRules: carryRules.map(r => ({
          leaveTypeId: r.leaveTypeId,
          priorCalendarDays: r.priorCalendarDays,
          workingDays: r.workingDays,
          carryForwardMax: r.carryForwardMax,
          encashMax: r.encashMax,
        })),
      }),
    }).then(res => {
      if (res.ok) { toast.success('Leave configuration saved successfully'); }
      else { throw new Error('Save failed'); }
    }).catch(() => {
      toast.error('Failed to save configuration');
    }).finally(() => setSaving(false));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
            <FiSettings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Leave Configuration</h1>
            <p className="text-sm text-thb-text-secondary">Configure leave quota, accrual, restrictions, year-end processing & encashment</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/leave/settings" className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border text-thb-text-secondary rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors">
            <FiArrowLeft className="w-4 h-4" /> Back
          </Link>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm disabled:opacity-50 transition-colors">
            {saving ? <FiClock className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Step Navigation */}
      <div className="thb-card p-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {STEPS.map((step) => (
            <button
              key={step.num}
              onClick={() => setActiveStep(step.num)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeStep === step.num
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'bg-slate-50 text-thb-text-secondary hover:bg-slate-100'
              }`}
            >
              <span className="text-sm">{step.icon}</span>
              <span>{step.num}. {step.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Step Content ── */}
      <div className="thb-card p-6">
        {/* Step 1: Leave Quota */}
        {activeStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-thb-text-primary flex items-center gap-2">📋 Leave Quota</h3>
            <p className="text-xs text-thb-text-secondary">Configure the default annual leave allocation for each leave type.</p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-thb-border bg-slate-50/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Leave Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Code</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Default Days</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveTypes.map(lt => (
                    <tr key={lt.id} className="border-b border-thb-border/50">
                      <td className="px-4 py-3 text-sm font-medium text-thb-text-primary">{lt.name}</td>
                      <td className="px-4 py-3 text-xs text-thb-text-muted">{lt.code}</td>
                      <td className="px-4 py-3 text-sm text-center text-thb-text-secondary">{lt.defaultDays}</td>
                      <td className="px-4 py-3 text-center">
                        {lt.isPaid ? <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200">Paid</span> : <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 text-[10px] font-semibold border border-slate-200">Unpaid</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-thb-text-muted">Manage individual leave type allocations from the <Link href="/leave/types" className="text-green-600 underline">Leave Types</Link> page.</p>
          </div>
        )}

        {/* Step 2: Leave Accrual */}
        {activeStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-thb-text-primary flex items-center gap-2">📈 Leave Accrual</h3>
            <p className="text-xs text-thb-text-secondary">Configure how leave is accrued over the year.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Leave Year Start Month</label>
                <select value={leaveYearStart} onChange={e => setLeaveYearStart(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                  {['january','february','march','april','may','june','july','august','september','october','november','december'].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Accrual Frequency</label>
                <select className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                  <option value="yearly">Yearly (Lump sum at year start)</option>
                  <option value="monthly">Monthly (Pro-rated)</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <p className="text-xs text-blue-700"><FiAlertCircle className="w-3.5 h-3.5 inline mr-1" />Accrual frequency is configured per leave type on the <Link href="/leave/types" className="underline">Leave Types</Link> page.</p>
            </div>
          </div>
        )}

        {/* Step 3: Apply Leave */}
        {activeStep === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-thb-text-primary flex items-center gap-2">✏️ Apply Leave</h3>
            <p className="text-xs text-thb-text-secondary">Configure how employees apply for leave.</p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={halfDayAllowed} onChange={e => setHalfDayAllowed(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-green-500 focus:ring-green-500/20" />
                <span className="text-sm text-thb-text-secondary">Allow half-day leave (morning / afternoon)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={sandwichRule} onChange={e => setSandwichRule(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-green-500 focus:ring-green-500/20" />
                <span className="text-sm text-thb-text-secondary">Enable sandwich rule (holidays/weekends between leave days count as leave)</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1">Min Advance Notice (days)</label>
                  <input type="number" min="0" max="90" value={minAdvanceDays} onChange={e => setMinAdvanceDays(e.target.value)} placeholder="0 = no requirement" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1">Max Consecutive Leave Days</label>
                  <input type="number" min="0" max="365" value={maxConsecutiveDays} onChange={e => setMaxConsecutiveDays(e.target.value)} placeholder="0 = no limit" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Leave Restrictions */}
        {activeStep === 4 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-thb-text-primary flex items-center gap-2">⚠️ Leave Restrictions</h3>
            <p className="text-xs text-thb-text-secondary">Configure restrictions on leave usage.</p>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
              <p className="text-xs text-amber-800 font-semibold">Probation Restrictions</p>
              <p className="text-xs text-amber-700">Employees on probation may have restricted leave access. Configure per leave type on the Leave Types page.</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <p className="text-xs text-slate-700 font-semibold">Negative Balance</p>
              <p className="text-xs text-slate-600">Configure per leave type whether negative balances are allowed. By default, leave requests are rejected if the balance is insufficient.</p>
            </div>
          </div>
        )}

        {/* Step 5: Holidays & Weekends */}
        {activeStep === 5 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-thb-text-primary flex items-center gap-2">📅 Holidays & Weekends</h3>
            <p className="text-xs text-thb-text-secondary">Configure weekend days and public holidays.</p>
            <div className="grid grid-cols-2 gap-3">
              {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, i) => (
                <label key={day} className="flex items-center gap-2 p-2 rounded-lg border border-thb-border cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" defaultChecked={i === 0 || i === 6} className="w-4 h-4 rounded border-slate-300 text-green-500 focus:ring-green-500/20" />
                  <span className="text-sm text-thb-text-secondary">{day}</span>
                </label>
              ))}
            </div>
            <div className="p-3 rounded-lg bg-teal-50 border border-teal-200">
              <p className="text-xs text-teal-700"><FiCalendar className="w-3.5 h-3.5 inline mr-1" />Manage public holidays from the <Link href="/leave/holidays" className="underline">Holidays</Link> page.</p>
            </div>
          </div>
        )}

        {/* Step 6: Leave Approval */}
        {activeStep === 6 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-thb-text-primary flex items-center gap-2">✅ Leave Approval</h3>
            <p className="text-xs text-thb-text-secondary">Configure the multi-tier approval workflow.</p>
            <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
              <p className="text-xs text-violet-700"><FiCheckSquare className="w-3.5 h-3.5 inline mr-1" />Approval workflows are configured on the <Link href="/leave/approval-workflows" className="underline">Approval Workflows</Link> page.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-thb-border">
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-bold">1</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-thb-text-primary">Tier 1: Reporting Manager</p>
                  <p className="text-xs text-thb-text-muted">Direct manager approves first</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-thb-border">
                <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-bold">2</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-thb-text-primary">Tier 2: HR Admin</p>
                  <p className="text-xs text-thb-text-muted">HR admin gives final approval</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 7: Year-End Processing — MAIN FOCUS per reference screenshot */}
        {activeStep === 7 && (
          <div className="space-y-5">
            <h3 className="text-sm font-bold text-thb-text-primary flex items-center gap-2">🔄 Year-End Processing</h3>
            <p className="text-xs text-thb-text-secondary">How are leave balances handled at the end of the year?</p>

            {/* Radio options */}
            <div className="space-y-3">
              {YEAR_END_MODES.map(mode => (
                <label key={mode.value} className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                  yearEndMode === mode.value ? 'border-green-500 bg-green-50' : 'border-thb-border hover:bg-slate-50'
                }`}>
                  <input type="radio" name="yearEndMode" checked={yearEndMode === mode.value} onChange={() => setYearEndMode(mode.value)} className="mt-0.5 w-4 h-4 text-green-500 focus:ring-green-500/20" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-thb-text-primary">{mode.label}</p>
                    <p className="text-xs text-thb-text-muted mt-0.5">{mode.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Carry-Forward Settings Table — only show for modes c and d */}
            {(yearEndMode === 'pay_then_carry' || yearEndMode === 'carry_then_pay') && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Carry Forward Settings</h4>
                  <span className="text-[10px] text-thb-text-muted">Configure per leave type</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-thb-border bg-slate-50/50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Leave Balance</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Prior Calendar Days</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Working Days</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Carry Forward Max</th>
                        {yearEndMode === 'carry_then_pay' && (
                          <th className="text-center px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Encash Max</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {carryRules.map(rule => (
                        <tr key={rule.id} className="border-b border-thb-border/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-thb-text-primary">{rule.leaveTypeName}</span>
                            </div>
                            <p className="text-[10px] text-thb-text-muted mt-0.5">
                              If balance exceeds <input type="number" min="0" value={rule.priorCalendarDays} onChange={e => updateCarryRule(rule.id, 'priorCalendarDays', e.target.value)} className="inline-block w-12 px-1 py-0.5 rounded border border-thb-border text-[10px] mx-1" /> calendar days,
                              carry forward max <input type="number" min="0" value={rule.carryForwardMax} onChange={e => updateCarryRule(rule.id, 'carryForwardMax', e.target.value)} className="inline-block w-12 px-1 py-0.5 rounded border border-thb-border text-[10px] mx-1" /> days
                              {yearEndMode === 'carry_then_pay' && (
                                <>and pay max <input type="number" min="0" value={rule.encashMax} onChange={e => updateCarryRule(rule.id, 'encashMax', e.target.value)} className="inline-block w-12 px-1 py-0.5 rounded border border-thb-border text-[10px] mx-1" /> days remaining</>
                              )}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input type="number" min="0" value={rule.priorCalendarDays} onChange={e => updateCarryRule(rule.id, 'priorCalendarDays', e.target.value)} className="w-16 px-2 py-1.5 rounded-lg border border-thb-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input type="number" min="0" value={rule.workingDays} onChange={e => updateCarryRule(rule.id, 'workingDays', e.target.value)} className="w-16 px-2 py-1.5 rounded-lg border border-thb-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input type="number" min="0" value={rule.carryForwardMax} onChange={e => updateCarryRule(rule.id, 'carryForwardMax', e.target.value)} className="w-16 px-2 py-1.5 rounded-lg border border-thb-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                          </td>
                          {yearEndMode === 'carry_then_pay' && (
                            <td className="px-4 py-3 text-center">
                              <input type="number" min="0" value={rule.encashMax} onChange={e => updateCarryRule(rule.id, 'encashMax', e.target.value)} className="w-16 px-2 py-1.5 rounded-lg border border-thb-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-700">
                    <FiAlertCircle className="w-3.5 h-3.5 inline mr-1" />
                    Year-end processing is a manual operation. Saving this configuration does NOT automatically reset, deduct, or pay any leave balances. An admin must explicitly trigger year-end processing when ready.
                  </p>
                </div>
              </div>
            )}

            {/* Mode a: expire/reset */}
            {yearEndMode === 'expire_reset' && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-700 font-medium">⚠ All unused leave will be forfeited at year end.</p>
                <p className="text-xs text-red-600 mt-1">Employees will start the new year with zero carried-forward balance. Make sure employees are notified in advance.</p>
              </div>
            )}

            {/* Mode b: encash all */}
            {yearEndMode === 'encash_all' && (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-sm text-emerald-700 font-medium">💰 All unused leave will be paid out at the encashment rate.</p>
                <p className="text-xs text-emerald-600 mt-1">The encashment rate is based on: <select value={encashmentBasis} onChange={e => setEncashmentBasis(e.target.value)} className="inline-block px-2 py-0.5 rounded border border-emerald-300 text-xs bg-white"><option value="basic">Basic Salary</option><option value="gross">Gross Salary</option></select></p>
              </div>
            )}
          </div>
        )}

        {/* Step 8: Leave Encashment */}
        {activeStep === 8 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-thb-text-primary flex items-center gap-2">💰 Leave Encashment</h3>
            <p className="text-xs text-thb-text-secondary">Configure leave encashment settings.</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={encashmentEnabled} onChange={e => setEncashmentEnabled(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-green-500 focus:ring-green-500/20" />
              <span className="text-sm text-thb-text-secondary">Enable leave encashment</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Encashment Rate Basis</label>
                <select value={encashmentBasis} onChange={e => setEncashmentBasis(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
                  <option value="basic">Basic Salary</option>
                  <option value="gross">Gross Salary</option>
                  <option value="monthly_salary">Monthly Salary</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Max Carry Forward Days</label>
                <input type="number" min="0" max="90" value={maxCarryForward} onChange={e => setMaxCarryForward(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <p className="text-xs text-blue-700"><FiDollarSign className="w-3.5 h-3.5 inline mr-1" />Encashment requests are managed on the <Link href="/leave/encashment" className="underline">Leave Encashment</Link> page.</p>
            </div>
          </div>
        )}

        {/* Step Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-thb-border">
          <button
            onClick={() => setActiveStep(s => Math.max(1, s - 1))}
            disabled={activeStep === 1}
            className="inline-flex items-center gap-2 px-4 py-2 border border-thb-border text-sm font-medium text-thb-text-secondary rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            <FiChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-xs text-thb-text-muted">Step {activeStep} of {STEPS.length}</span>
          <button
            onClick={() => setActiveStep(s => Math.min(STEPS.length, s + 1))}
            disabled={activeStep === STEPS.length}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            Next <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
