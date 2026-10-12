'use client';

/**
 * LeaveApprovalWorkflowConfig — the leave module's approval workflow editor.
 *
 * Task 87: extracted verbatim from /leave/leave-policy (where it used to be an
 * inline tab component) so it can render on its own standalone page at
 * /leave/approval-workflows. Same API contract (/api/leave/workflow-config),
 * same unified config payload: approval tiers + workflow options + the
 * policy-rule fields (sandwich, pro-rata, probation, encashment, carry-forward)
 * are saved together as one workflow configuration.
 */

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FiSettings, FiBookOpen, FiPlus, FiTrash2, FiChevronDown, FiRefreshCw, FiSave,
} from 'react-icons/fi';

interface WorkflowTier {
  tier: number;
  approverType: 'reporting_manager' | 'department_head' | 'hr_admin' | 'tenant_admin' | 'specific_user' | 'specific_employee';
  approverId?: string | null;
  label?: string;
}

interface WorkflowConfig {
  tiers: WorkflowTier[];
  requireAllTiers: boolean;
  autoApproveShortLeave?: boolean;
  shortLeaveMaxDays?: number;
  // Unified policy fields (absorbed from legacy LeavePolicyRule)
  sandwichRuleEnabled?: boolean;
  proRataEnabled?: boolean;
  probationRestriction?: boolean;
  probationMonths?: number;
  encashmentAllowed?: boolean;
  carryForwardGlobal?: boolean;
  maxCarryForwardDays?: number;
}

const APPROVER_TYPE_OPTIONS = [
  { value: 'reporting_manager', label: 'Reporting Manager', description: 'The employee\'s direct reporting manager (Employee.reportingManagerId → User)' },
  { value: 'department_head', label: 'Department Head', description: 'The head of the employee\'s department (Department.headId → User)' },
  { value: 'hr_admin', label: 'HR Admin', description: 'Any user with role "admin" in the tenant' },
  { value: 'tenant_admin', label: 'Tenant Admin', description: 'Any user with role "tenant_admin" in the tenant' },
  { value: 'specific_user', label: 'Specific User', description: 'A specific user by ID (enter below)' },
  { value: 'specific_employee', label: 'Specific Employee', description: 'A specific employee by ID (resolved to their linked userId)' },
];

function getAuthHeadersWF() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function LeaveApprovalWorkflowConfig() {
  const [config, setConfig] = useState<WorkflowConfig>({
    tiers: [
      { tier: 1, approverType: 'reporting_manager', label: 'Reporting Manager' },
      { tier: 2, approverType: 'hr_admin', label: 'HR Admin' },
    ],
    requireAllTiers: true,
    autoApproveShortLeave: false,
    shortLeaveMaxDays: 1,
    // Unified policy defaults (mirror legacy LeavePolicyRule defaults)
    sandwichRuleEnabled: true,
    proRataEnabled: false,
    probationRestriction: true,
    probationMonths: 6,
    encashmentAllowed: false,
    carryForwardGlobal: true,
    maxCarryForwardDays: 5,
  });
  const [configId, setConfigId] = useState<string | null>(null);
  const [configName, setConfigName] = useState('Default Leave Approval Workflow');
  const [configDescription, setConfigDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configSource, setConfigSource] = useState<'tenant' | 'leave_type' | 'default'>('default');
  // Policy document linkage + employee scope (unification pass)
  const [policyDocumentId, setPolicyDocumentId] = useState<string | null>(null);
  const [employmentType, setEmploymentType] = useState('all');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [employeeStatus, setEmployeeStatus] = useState('all');
  // Dropdown options
  const [leavePolicies, setLeavePolicies] = useState<Array<{ id: string; title: string; version: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);

  // Load existing config on mount
  useEffect(() => {
    loadConfig();
    // Fetch policy documents (category=leave) + branches + departments
    const hdrs = getAuthHeadersWF();
    Promise.allSettled([
      fetch('/api/policies?category=leave', { headers: hdrs }),
      fetch('/api/branches', { headers: hdrs }),
      fetch('/api/departments', { headers: hdrs }),
    ]).then(results => {
      if (results[0].status === 'fulfilled' && results[0].value.ok) {
        results[0].value.json().then((d: any) => setLeavePolicies(d.policies || d.data || []));
      }
      if (results[1].status === 'fulfilled' && results[1].value.ok) {
        results[1].value.json().then((d: any) => setBranches(d.branches || d.data || []));
      }
      if (results[2].status === 'fulfilled' && results[2].value.ok) {
        results[2].value.json().then((d: any) => setDepartments(d.departments || d.data || []));
      }
    });
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leave/workflow-config', { headers: getAuthHeadersWF() });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          // Merge unified-policy defaults so old saved configs (without the
          // new sandwich/probation/carry-forward fields) still render correctly.
          setConfig({
            // defaults
            sandwichRuleEnabled: true,
            proRataEnabled: false,
            probationRestriction: true,
            probationMonths: 6,
            encashmentAllowed: false,
            carryForwardGlobal: true,
            maxCarryForwardDays: 5,
            // saved values override defaults
            ...data.config,
          });
          setConfigId(data.configId);
          setConfigName(data.name || 'Default Leave Approval Workflow');
          setConfigDescription(data.description || '');
          setConfigSource(data.source || 'default');
          // Scope fields (unification pass)
          setPolicyDocumentId(data.policyDocumentId || null);
          setEmploymentType(data.employmentType || 'all');
          setBranchId(data.branchId || null);
          setDepartmentId(data.departmentId || null);
          setEmployeeStatus(data.employeeStatus || 'all');
        }
      }
    } catch (e) {
      console.error('Failed to load workflow config:', e);
      toast.error('Failed to load workflow configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTier = () => {
    const nextTier = config.tiers.length + 1;
    setConfig({
      ...config,
      tiers: [...config.tiers, { tier: nextTier, approverType: 'hr_admin', label: `Tier ${nextTier} Approver` }],
    });
  };

  const handleRemoveTier = (tierNum: number) => {
    if (config.tiers.length <= 1) {
      toast.error('At least one tier is required');
      return;
    }
    const newTiers = config.tiers
      .filter(t => t.tier !== tierNum)
      .map((t, i) => ({ ...t, tier: i + 1 })); // Re-number
    setConfig({ ...config, tiers: newTiers });
  };

  const handleTierChange = (tierNum: number, field: 'approverType' | 'approverId' | 'label', value: string) => {
    const newTiers = config.tiers.map(t => {
      if (t.tier === tierNum) {
        return { ...t, [field]: value };
      }
      return t;
    });
    setConfig({ ...config, tiers: newTiers });
  };

  const handleMoveTier = (tierNum: number, direction: 'up' | 'down') => {
    const sortedTiers = [...config.tiers].sort((a, b) => a.tier - b.tier);
    const index = sortedTiers.findIndex(t => t.tier === tierNum);
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sortedTiers.length - 1) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [sortedTiers[index], sortedTiers[swapIndex]] = [sortedTiers[swapIndex], sortedTiers[index]];
    // Re-number
    const renumbered = sortedTiers.map((t, i) => ({ ...t, tier: i + 1 }));
    setConfig({ ...config, tiers: renumbered });
  };

  const handleSave = async () => {
    if (config.tiers.length === 0) {
      toast.error('At least one approval tier is required');
      return;
    }
    for (const tier of config.tiers) {
      if ((tier.approverType === 'specific_user' || tier.approverType === 'specific_employee') && !tier.approverId) {
        toast.error(`Tier ${tier.tier}: Approver ID is required for "${APPROVER_TYPE_OPTIONS.find(o => o.value === tier.approverType)?.label}"`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch('/api/leave/workflow-config', {
        method: 'POST',
        headers: getAuthHeadersWF(),
        body: JSON.stringify({
          leaveTypeId: null, // Tenant-wide config
          name: configName,
          description: configDescription,
          config,
          // Policy document + scope (unification pass)
          policyDocumentId,
          employmentType,
          branchId,
          departmentId,
          employeeStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast.success('Leave approval workflow saved successfully');
      setConfigId(data.configId);
      setConfigSource('tenant');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save workflow config');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" />
        <span className="ml-3 text-slate-500">Loading workflow configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="thb-card p-6 rounded-xl bg-gradient-to-r from-teal-50 to-cyan-50 border-teal-200">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white">
            <FiSettings className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-thb-text-primary">Leave Approval Workflow</h2>
            <p className="text-sm text-slate-600 mt-1">
              Configure a dynamic multi-tier approval chain for leave requests. Each tier routes to a specific
              approver (reporting manager, department head, HR admin, or a specific user). Leave requests
              advance through each tier sequentially — if any tier rejects, the request is rejected.
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className={`thb-badge text-[10px] ${configSource === 'tenant' ? 'thb-badge-success' : configSource === 'leave_type' ? 'thb-badge-info' : 'thb-badge-warning'}`}>
                {configSource === 'tenant' ? '✓ Saved (Tenant-wide)' : configSource === 'leave_type' ? 'Leave-type specific' : 'Default (unsaved)'}
              </span>
              {configId && (
                <span className="text-[10px] text-slate-400 font-mono">ID: {configId.slice(0, 16)}...</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Info */}
      <div className="thb-card p-6 rounded-xl">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Workflow Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Workflow Name</label>
            <input
              type="text"
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              placeholder="Default Leave Approval Workflow"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Description (optional)</label>
            <input
              type="text"
              value={configDescription}
              onChange={(e) => setConfigDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              placeholder="e.g., Standard 2-tier approval for all leave types"
            />
          </div>
        </div>
      </div>

      {/* ═══ POLICY DOCUMENT LINKAGE + EMPLOYEE SCOPE (unification pass) ═══ */}
      <div className="thb-card p-6 rounded-xl border-l-4 border-l-teal-500">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-1 flex items-center gap-2">
          <FiBookOpen className="w-4 h-4 text-teal-500" /> Policy Document & Employee Scope
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Link this workflow to a policy document and restrict which employees it applies to. At leave submission, the most specific matching config wins.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Policy document dropdown */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Policy Document (Leave)</label>
            <select
              value={policyDocumentId || ''}
              onChange={e => setPolicyDocumentId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white"
            >
              <option value="">— Not Linked —</option>
              {leavePolicies.map(p => (
                <option key={p.id} value={p.id}>{p.title} {p.version ? `(v${p.version})` : ''}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Pick from the Policy Documents tab (category = leave).</p>
          </div>
          {/* Employment type */}
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Employment Type</label>
            <select
              value={employmentType}
              onChange={e => setEmploymentType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white"
            >
              <option value="all">All Types</option>
              <option value="full-time">Full-Time</option>
              <option value="part-time">Part-Time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
          </div>
          {/* Employee status */}
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Employee Status</label>
            <select
              value={employeeStatus}
              onChange={e => setEmployeeStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {/* Branch */}
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Branch</label>
            <select
              value={branchId || ''}
              onChange={e => setBranchId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white"
            >
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {/* Department */}
          <div>
            <label className="block text-xs font-medium text-thb-text-secondary mb-1">Department</label>
            <select
              value={departmentId || ''}
              onChange={e => setDepartmentId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        {/* Scope summary chips */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-400 font-semibold uppercase tracking-wide">Applies to:</span>
          <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
            {employmentType === 'all' ? 'All employment types' : employmentType}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
            {employeeStatus === 'all' ? 'All statuses' : employeeStatus}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
            {branchId ? (branches.find(b => b.id === branchId)?.name || 'Branch') : 'All branches'}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
            {departmentId ? (departments.find(d => d.id === departmentId)?.name || 'Dept') : 'All departments'}
          </span>
        </div>
      </div>

      {/* Approval Tiers */}
      <div className="thb-card p-6 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-thb-text-primary">Approval Chain (Tiers)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Leave requests flow through tiers in order. Tier 1 approves first, then Tier 2, etc.
            </p>
          </div>
          <button
            onClick={handleAddTier}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
          >
            <FiPlus className="w-3.5 h-3.5" /> Add Tier
          </button>
        </div>

        <div className="space-y-4">
          {config.tiers.sort((a, b) => a.tier - b.tier).map((tier, idx) => (
            <div key={tier.tier} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <div className="flex items-start gap-3">
                {/* Tier number circle */}
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm">
                    {tier.tier}
                  </div>
                  {idx < config.tiers.length - 1 && (
                    <div className="w-0.5 h-6 bg-slate-300" />
                  )}
                </div>

                {/* Tier config */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Tier Label</label>
                    <input
                      type="text"
                      value={tier.label || ''}
                      onChange={(e) => handleTierChange(tier.tier, 'label', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                      placeholder={`Tier ${tier.tier} Approver`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Approver Type</label>
                    <select
                      value={tier.approverType}
                      onChange={(e) => handleTierChange(tier.tier, 'approverType', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                    >
                      {APPROVER_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {(tier.approverType === 'specific_user' || tier.approverType === 'specific_employee') && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {tier.approverType === 'specific_user' ? 'User ID' : 'Employee ID'}
                      </label>
                      <input
                        type="text"
                        value={tier.approverId || ''}
                        onChange={(e) => handleTierChange(tier.tier, 'approverId', e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 font-mono"
                        placeholder={tier.approverType === 'specific_user' ? 'usr_...' : 'emp_...'}
                      />
                    </div>
                  )}
                </div>

                {/* Move + Remove buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMoveTier(tier.tier, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <FiChevronDown className="w-4 h-4 rotate-180" />
                  </button>
                  <button
                    onClick={() => handleMoveTier(tier.tier, 'down')}
                    disabled={idx === config.tiers.length - 1}
                    className="p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    <FiChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemoveTier(tier.tier)}
                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Remove tier"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Approver type description */}
              <p className="text-[11px] text-slate-500 mt-2 ml-13">
                {APPROVER_TYPE_OPTIONS.find(o => o.value === tier.approverType)?.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow Options */}
      <div className="thb-card p-6 rounded-xl">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Workflow Options</h3>
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.requireAllTiers}
              onChange={(e) => setConfig({ ...config, requireAllTiers: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="text-sm font-medium text-thb-text-primary">Require all tiers to approve</span>
              <p className="text-xs text-slate-500 mt-0.5">
                If enabled, the leave request must pass through ALL tiers before being fully approved.
                If disabled, any single approval finalizes the request.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoApproveShortLeave || false}
              onChange={(e) => setConfig({ ...config, autoApproveShortLeave: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="text-sm font-medium text-thb-text-primary">Auto-approve short leaves</span>
              <p className="text-xs text-slate-500 mt-0.5">
                If enabled, leave requests shorter than the threshold below are auto-approved
                (bypass the workflow entirely).
              </p>
            </div>
          </label>

          {config.autoApproveShortLeave && (
            <div className="ml-7">
              <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                Short Leave Threshold (days)
              </label>
              <input
                type="number"
                min={0.5}
                max={5}
                step={0.5}
                value={config.shortLeaveMaxDays || 1}
                onChange={(e) => setConfig({ ...config, shortLeaveMaxDays: parseFloat(e.target.value) || 1 })}
                className="w-32 px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Leaves of this length or shorter will be auto-approved.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ═══ UNIFIED POLICY RULES (absorbed from legacy LeavePolicyRule) ═══ */}
      <div className="thb-card p-6 rounded-xl border-l-4 border-l-teal-500">
        <h3 className="text-sm font-semibold text-thb-text-primary mb-1 flex items-center gap-2">
          <FiBookOpen className="w-4 h-4 text-teal-500" /> Leave Policy Rules
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          One unified policy — these rule fields and the approval tiers above are saved together as a single workflow configuration.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Carry-forward */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Carry-Forward</label>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.carryForwardGlobal ?? true}
                onChange={(e) => setConfig({ ...config, carryForwardGlobal: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-thb-text-primary">Allow carry-forward of unused leave</span>
            </label>
            {config.carryForwardGlobal && (
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Max days carryable</label>
                <input
                  type="number" min={0} max={30} step={0.5}
                  value={config.maxCarryForwardDays ?? 5}
                  onChange={(e) => setConfig({ ...config, maxCarryForwardDays: parseFloat(e.target.value) || 0 })}
                  className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                />
              </div>
            )}
          </div>

          {/* Sandwich rule */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Sandwich Rule</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.sandwichRuleEnabled ?? true}
                onChange={(e) => setConfig({ ...config, sandwichRuleEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <div>
                <span className="text-sm text-thb-text-primary">Enable sandwich rule</span>
                <p className="text-[11px] text-slate-500 mt-0.5">Leave between holidays/weekends counts as leave.</p>
              </div>
            </label>
          </div>

          {/* Pro-rata */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Pro-Rata (Mid-Year Joiners)</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.proRataEnabled ?? false}
                onChange={(e) => setConfig({ ...config, proRataEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <div>
                <span className="text-sm text-thb-text-primary">Enable pro-rata leave allocation</span>
                <p className="text-[11px] text-slate-500 mt-0.5">New joiners get leave proportional to joining month.</p>
              </div>
            </label>
          </div>

          {/* Encashment */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Leave Encashment</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.encashmentAllowed ?? false}
                onChange={(e) => setConfig({ ...config, encashmentAllowed: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <div>
                <span className="text-sm text-thb-text-primary">Allow leave encashment</span>
                <p className="text-[11px] text-slate-500 mt-0.5">Employees can encash unused leave balance.</p>
              </div>
            </label>
          </div>

          {/* Probation */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Probation Restriction</label>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.probationRestriction ?? true}
                onChange={(e) => setConfig({ ...config, probationRestriction: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-thb-text-primary">Restrict leave during probation period</span>
            </label>
            {config.probationRestriction && (
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Probation period (months)</label>
                <input
                  type="number" min={0} max={24}
                  value={config.probationMonths ?? 6}
                  onChange={(e) => setConfig({ ...config, probationMonths: parseInt(e.target.value, 10) || 0 })}
                  className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                />
              </div>
            )}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Note: Leave-type quotas (CL/SL/EL days) are configured per Leave Type in the Leave Types master, not here.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button
          onClick={loadConfig}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-thb-text-secondary border border-thb-border rounded-xl hover:bg-slate-50 font-medium text-sm transition-all"
        >
          <FiRefreshCw className="w-4 h-4" /> Reset
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl hover:from-teal-700 hover:to-cyan-700 font-medium text-sm shadow-sm transition-all disabled:opacity-50"
        >
          {saving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Workflow Configuration'}
        </button>
      </div>

      {/* Workflow Stages Info */}
      <div className="thb-card p-6 rounded-xl bg-blue-50/50 border-blue-200">
        <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <FiBookOpen className="w-4 h-4" /> How the Workflow Operates
        </h3>
        <div className="space-y-2 text-xs text-blue-800">
          <p><b>1. Submission:</b> When an employee submits a leave request, the system creates an approval step for each tier and notifies the Tier 1 approver.</p>
          <p><b>2. Eligibility & Balance Check:</b> The system verifies the employee has enough accrued leave balance before the workflow begins.</p>
          <p><b>3. Manager Review (Tier 1):</b> The Tier 1 approver receives a notification to approve or reject with comments.</p>
          <p><b>4. Multi-Tier Routing:</b> If Tier 1 approves, the request automatically routes to Tier 2, and so on. If any tier rejects, the workflow stops.</p>
          <p><b>5. Notification & Syncing:</b> On final approval, the system updates the employee, adjusts the leave balance automatically, and notifies all stakeholders.</p>
        </div>
      </div>
    </div>
  )
}
