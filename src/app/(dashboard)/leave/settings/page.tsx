'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  FiFileText, FiLayers, FiCheckSquare, FiList, FiSettings,
  FiCalendar, FiRefreshCw, FiSave, FiInfo, FiChevronDown, FiPlus, FiTrash2,
  FiAlertCircle, FiCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import ModuleSettingsShell from '@/components/ModuleSettingsShell';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  defaultDays: number;
  isPaid: boolean;
  carryForward: boolean;
  maxCarryForward: number;
  status: string;
}
interface Branch { id: string; name: string; }
interface Department { id: string; name: string; }
interface PolicyRule {
  id: string;
  name: string;
  employmentType: string;
  branchId: string | null;
  branch?: { name: string } | null;
  departmentId: string | null;
  department?: { name: string } | null;
  sandwichRuleEnabled: boolean;
  proRataEnabled: boolean;
  probationRestriction: boolean;
  probationMonths: number;
  encashmentAllowed: boolean;
  carryForwardGlobal: boolean;
  maxCarryForwardDays: number;
  status: string;
}

/* ═══════════════════════════════════════════════════════════════
   Leave Configuration Component — renders inside the Rules tab
   ═══════════════════════════════════════════════════════════════ */
function LeaveConfigurationContent() {
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [loading, setLoading] = useState(true);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState('');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<PolicyRule | null>(null);

  // Rule form state
  const [ruleName, setRuleName] = useState('');
  const [ruleEmploymentType, setRuleEmploymentType] = useState('all');
  const [ruleBranchId, setRuleBranchId] = useState('');
  const [ruleDepartmentId, setRuleDepartmentId] = useState('');
  const [ruleSandwich, setRuleSandwich] = useState(true);
  const [ruleProRata, setRuleProRata] = useState(false);
  const [ruleProbationRestriction, setRuleProbationRestriction] = useState(true);
  const [ruleProbationMonths, setRuleProbationMonths] = useState(6);
  const [ruleEncashment, setRuleEncashment] = useState(false);
  const [ruleCarryForward, setRuleCarryForward] = useState(true);
  const [ruleMaxCarryForward, setRuleMaxCarryForward] = useState(5);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const sq = scopeQuery();
    const headers = getAuthHeaders();
    try {
      const [ltRes, brRes, deptRes, ruleRes] = await Promise.all([
        fetch(`/api/leave-types${sq ? `?${sq}` : ''}`, { headers }),
        fetch(`/api/branches${sq ? `?${sq}` : ''}`, { headers }).catch(() => null),
        fetch(`/api/departments${sq ? `?${sq}` : ''}`, { headers }).catch(() => null),
        fetch(`/api/leave-policy-rules${sq ? `?${sq}` : ''}`, { headers }),
      ]);
      if (ltRes.ok) {
        const d = await ltRes.json();
        setLeaveTypes((d.data || []).filter((lt: LeaveType) => lt.status === 'active'));
      }
      if (brRes?.ok) {
        const d = await brRes.json();
        setBranches(d.branches || d.data || d || []);
      }
      if (deptRes?.ok) {
        const d = await deptRes.json();
        setDepartments(d.departments || d.data || d || []);
      }
      if (ruleRes.ok) {
        const d = await ruleRes.json();
        setRules(Array.isArray(d) ? d : (d.data || d.rules || []));
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedLeaveType = leaveTypes.find(lt => lt.id === selectedLeaveTypeId);

  // Rules for the selected leave type
  const rulesForSelected = rules.filter(r => {
    // All rules apply to all leave types via the global config — show all
    return true;
  });

  const openAddRule = () => {
    setEditingRule(null);
    setRuleName('');
    setRuleEmploymentType('all');
    setRuleBranchId('');
    setRuleDepartmentId('');
    setRuleSandwich(true);
    setRuleProRata(false);
    setRuleProbationRestriction(true);
    setRuleProbationMonths(6);
    setRuleEncashment(false);
    setRuleCarryForward(true);
    setRuleMaxCarryForward(5);
    setShowRuleForm(true);
  };

  const openEditRule = (rule: PolicyRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setRuleEmploymentType(rule.employmentType || 'all');
    setRuleBranchId(rule.branchId || '');
    setRuleDepartmentId(rule.departmentId || '');
    setRuleSandwich(rule.sandwichRuleEnabled);
    setRuleProRata(rule.proRataEnabled);
    setRuleProbationRestriction(rule.probationRestriction);
    setRuleProbationMonths(rule.probationMonths);
    setRuleEncashment(rule.encashmentAllowed);
    setRuleCarryForward(rule.carryForwardGlobal);
    setRuleMaxCarryForward(rule.maxCarryForwardDays);
    setShowRuleForm(true);
  };

  const handleSaveRule = async () => {
    if (!ruleName.trim()) {
      toast.error('Rule name is required');
      return;
    }
    setSaving(true);
    try {
      const sq = scopeQuery();
      const body = {
        name: ruleName,
        employmentType: ruleEmploymentType,
        branchId: ruleBranchId || null,
        departmentId: ruleDepartmentId || null,
        sandwichRuleEnabled: ruleSandwich,
        proRataEnabled: ruleProRata,
        probationRestriction: ruleProbationRestriction,
        probationMonths: ruleProbationMonths,
        encashmentAllowed: ruleEncashment,
        carryForwardGlobal: ruleCarryForward,
        maxCarryForwardDays: ruleMaxCarryForward,
        status: 'active',
      };
      const url = editingRule
        ? `/api/leave-policy-rules${sq ? `?${sq}` : ''}`
        : `/api/leave-policy-rules${sq ? `?${sq}` : ''}`;
      const method = editingRule ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(editingRule ? { id: editingRule.id, ...body } : body),
      });
      if (r.ok) {
        toast.success(editingRule ? 'Rule updated' : 'Rule created');
        setShowRuleForm(false);
        fetchData();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || 'Failed to save rule');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Delete this policy rule?')) return;
    try {
      const sq = scopeQuery();
      const r = await fetch(`/api/leave-policy-rules?id=${ruleId}${sq ? `&${sq}` : ''}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (r.ok) {
        toast.success('Rule deleted');
        fetchData();
      } else {
        toast.error('Failed to delete rule');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-thb-border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 bg-white';
  const labelClass = 'block text-xs font-medium text-thb-text-secondary mb-1';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <FiRefreshCw className="w-4 h-4 text-thb-text-muted animate-spin mr-2" />
        <span className="text-sm text-thb-text-muted">Loading leave configuration…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-thb-text-primary">Leave Configuration</h3>
          <p className="text-xs text-thb-text-muted mt-0.5">
            Configure which leave types apply to which departments, branches, and employee roles.
          </p>
        </div>
        <button
          onClick={openAddRule}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
        >
          <FiPlus className="w-4 h-4" /> Add Policy Rule
        </button>
      </div>

      {/* Leave Types overview */}
      <div className="thb-card p-5">
        <h4 className="text-xs font-semibold text-thb-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
          <FiList className="w-3.5 h-3.5 text-green-500" /> Available Leave Types ({leaveTypes.length})
        </h4>
        {leaveTypes.length === 0 ? (
          <p className="text-xs text-thb-text-muted text-center py-4">
            No leave types found. <Link href="/leave/types" className="text-green-600 underline">Create leave types first</Link>.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {leaveTypes.map(lt => (
              <div key={lt.id} className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedLeaveTypeId === lt.id ? 'border-green-500 bg-green-50' : 'border-thb-border hover:border-green-300 hover:bg-slate-50'}`}
                onClick={() => setSelectedLeaveTypeId(selectedLeaveTypeId === lt.id ? '' : lt.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-thb-text-primary">{lt.name}</p>
                    <p className="text-[10px] text-thb-text-muted font-mono">{lt.code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">{lt.defaultDays}</p>
                    <p className="text-[9px] text-thb-text-muted">days/yr</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${lt.isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {lt.isPaid ? 'Paid' : 'Unpaid'}
                  </span>
                  {lt.carryForward && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">CF: {lt.maxCarryForward}d</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Policy Rules Table */}
      <div className="thb-card p-5">
        <h4 className="text-xs font-semibold text-thb-text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
          <FiSettings className="w-3.5 h-3.5 text-violet-500" /> Policy Rules ({rules.length})
        </h4>
        {rules.length === 0 ? (
          <div className="text-center py-8">
            <FiAlertCircle className="w-8 h-8 text-thb-text-muted mx-auto mb-2" />
            <p className="text-sm text-thb-text-muted">No policy rules configured yet.</p>
            <p className="text-xs text-thb-text-muted mt-1">Click "Add Policy Rule" to create one — assign a leave type to a department, branch, or employee role.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-thb-border bg-slate-50">
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-thb-text-secondary uppercase">Rule Name</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-thb-text-secondary uppercase">Employment Type</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-thb-text-secondary uppercase">Branch</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold text-thb-text-secondary uppercase">Department</th>
                  <th className="text-center px-3 py-2 text-[10px] font-semibold text-thb-text-secondary uppercase">CF</th>
                  <th className="text-center px-3 py-2 text-[10px] font-semibold text-thb-text-secondary uppercase">Encash</th>
                  <th className="text-center px-3 py-2 text-[10px] font-semibold text-thb-text-secondary uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-b border-thb-border last:border-b-0 hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-sm font-medium text-thb-text-primary">{r.name}</td>
                    <td className="px-3 py-2.5 text-xs text-thb-text-secondary capitalize">{r.employmentType || 'all'}</td>
                    <td className="px-3 py-2.5 text-xs text-thb-text-secondary">{r.branch?.name || 'All'}</td>
                    <td className="px-3 py-2.5 text-xs text-thb-text-secondary">{r.department?.name || 'All'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${r.carryForwardGlobal ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {r.carryForwardGlobal ? `${r.maxCarryForwardDays}d` : 'No'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${r.encashmentAllowed ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                        {r.encashmentAllowed ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditRule(r)} className="p-1 text-thb-text-muted hover:text-green-600 hover:bg-green-50 rounded transition-colors" title="Edit">
                          <FiSettings className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteRule(r.id)} className="p-1 text-thb-text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rule Form Dialog */}
      {showRuleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowRuleForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-thb-border">
              <h3 className="text-base font-semibold text-thb-text-primary">
                {editingRule ? 'Edit Policy Rule' : 'New Policy Rule'}
              </h3>
              <button onClick={() => setShowRuleForm(false)} className="text-thb-text-muted hover:text-thb-text-primary p-1 rounded-lg hover:bg-slate-50">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Rule Name */}
              <div>
                <label className={labelClass}>Rule Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={e => setRuleName(e.target.value)}
                  placeholder="e.g. Full-Time Standard, Contract Limited"
                  className={inputClass}
                />
              </div>

              {/* Scope: Employment Type + Branch + Department */}
              <div className="p-4 rounded-lg bg-slate-50 border border-thb-border">
                <p className="text-xs font-semibold text-thb-text-primary mb-3 flex items-center gap-1.5">
                  <FiInfo className="w-3.5 h-3.5 text-violet-500" /> Applicability — who does this rule apply to?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Employment Type</label>
                    <select value={ruleEmploymentType} onChange={e => setRuleEmploymentType(e.target.value)} className={inputClass}>
                      <option value="all">All Types</option>
                      <option value="full-time">Full-time</option>
                      <option value="part-time">Part-time</option>
                      <option value="contract">Contract</option>
                      <option value="internship">Internship</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Branch</label>
                    <select value={ruleBranchId} onChange={e => setRuleBranchId(e.target.value)} className={inputClass}>
                      <option value="">All Branches</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Department</label>
                    <select value={ruleDepartmentId} onChange={e => setRuleDepartmentId(e.target.value)} className={inputClass}>
                      <option value="">All Departments</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Carry Forward + Encashment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border border-thb-border">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={ruleCarryForward} onChange={e => setRuleCarryForward(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-green-500" />
                    <span className="text-sm font-medium text-thb-text-primary">Carry Forward</span>
                  </label>
                  <label className={labelClass}>Max Carry Forward Days</label>
                  <input type="number" min={0} max={30} value={ruleMaxCarryForward} disabled={!ruleCarryForward} onChange={e => setRuleMaxCarryForward(Number(e.target.value))} className={inputClass} />
                </div>
                <div className="p-3 rounded-lg border border-thb-border">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={ruleEncashment} onChange={e => setRuleEncashment(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-amber-500" />
                    <span className="text-sm font-medium text-thb-text-primary">Encashment Allowed</span>
                  </label>
                </div>
              </div>

              {/* Other Rules */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border border-thb-border space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={ruleSandwich} onChange={e => setRuleSandwich(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-teal-500" />
                    <span className="text-sm text-thb-text-primary">Sandwich Rule</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={ruleProRata} onChange={e => setRuleProRata(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-teal-500" />
                    <span className="text-sm text-thb-text-primary">Pro-rata for new joiners</span>
                  </label>
                </div>
                <div className="p-3 rounded-lg border border-thb-border space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={ruleProbationRestriction} onChange={e => setRuleProbationRestriction(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-amber-500" />
                    <span className="text-sm text-thb-text-primary">Restrict during probation</span>
                  </label>
                  <div>
                    <label className={labelClass}>Probation Months</label>
                    <input type="number" min={0} max={24} value={ruleProbationMonths} disabled={!ruleProbationRestriction} onChange={e => setRuleProbationMonths(Number(e.target.value))} className={inputClass} />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-thb-border">
              <button onClick={() => setShowRuleForm(false)} className="px-4 py-2 text-sm font-medium text-thb-text-secondary border border-thb-border rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveRule} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                <FiSave className="w-4 h-4" />
                {saving ? 'Saving…' : editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="thb-card p-4">
        <p className="text-xs text-thb-text-muted mb-3">Also configure:</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/leave/types" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
            <FiList className="w-3.5 h-3.5" /> Leave Types
          </Link>
          <Link href="/leave/approval-workflows" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors">
            <FiCheckSquare className="w-3.5 h-3.5" /> Approval Workflows
          </Link>
          <Link href="/leave/leave-policy?tab=documents" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors">
            <FiFileText className="w-3.5 h-3.5" /> Policy Documents
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Settings Page
   ═══════════════════════════════════════════════════════════════ */
function LeaveSettingsPageContent() {
  return (
    <ModuleSettingsShell
      moduleName="Leave"
      moduleAccent="green"
      basePath="/leave/settings"
      policy={
        <div className="space-y-4">
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
          <div className="thb-card p-5">
            <h2 className="text-base font-semibold text-thb-text-primary mb-3">Policy &amp; Types</h2>
            <p className="text-xs text-thb-text-muted mb-4">
              Manage leave policy documents and leave-type-to-payroll mapping.
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
        /* Configuration tab — per-leave-type policy editor with
           department/branch/employee/role scoping */
        <LeaveConfigurationContent />
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
