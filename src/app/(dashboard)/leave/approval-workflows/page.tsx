'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FiPlus, FiTrash2, FiSettings, FiRefreshCw, FiSave, FiX, FiCheck,
  FiChevronDown, FiChevronUp, FiClock, FiUser, FiUsers, FiShield,
  FiPlay, FiArrowRight, FiCheckCircle, FiXCircle, FiAlertCircle,
  FiEdit2, FiCopy, FiInfo, FiZap,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface WorkflowTier {
  tier: number;
  approverType: string; // role name (dynamic)
  approverId?: string | null; // selected employee ID with that role
  label?: string;
}

interface WorkflowConfig {
  id?: string;
  name: string;
  description?: string;
  leaveTypeId?: string | null;
  leaveTypeIds?: string[]; // multiple leave types selection
  isActive: boolean;
  tiers: WorkflowTier[];
  requireAllTiers: boolean;
  autoApproveShortLeave: boolean;
  shortLeaveMaxDays: number;
  skipDuplicateApprovers: boolean;
  rejectRequiresReason: boolean;
  notifyEmployeeEachStep: boolean;
  autoApproveOnTimeout: boolean; // auto-approve if SLA exceeded
  timeoutAutoApproveHours: number; // hours before auto-approve kicks in
}

interface LeaveType { id: string; name: string; code: string; }

// Dynamic roles — derived from fetched employees at runtime (see useEffect below)
const ROLE_OPTIONS: Array<{ value: string; label: string; icon: any }> = [
  { value: 'reporting_manager', label: 'Reporting Manager', icon: FiUser },
  { value: 'department_head', label: 'Department Head', icon: FiUsers },
  { value: 'hr_admin', label: 'HR Admin', icon: FiShield },
  { value: 'tenant_admin', label: 'Tenant Admin', icon: FiShield },
  { value: 'admin', label: 'Admin', icon: FiShield },
  { value: 'ceo', label: 'CEO', icon: FiShield },
  { value: 'manager', label: 'Manager', icon: FiUser },
  { value: 'employee', label: 'Employee', icon: FiUser },
];

interface EmpOption { id: string; name: string; email: string; role?: string; employeeId?: string; }

const DEFAULT_WORKFLOW: WorkflowConfig = {
  name: 'New Workflow',
  description: '',
  leaveTypeId: null,
  leaveTypeIds: [],
  isActive: true,
  tiers: [
    { tier: 1, approverType: 'reporting_manager', label: 'Reporting Manager' },
    { tier: 2, approverType: 'hr_admin', label: 'HR Admin' },
  ],
  requireAllTiers: true,
  autoApproveShortLeave: false,
  shortLeaveMaxDays: 1,
  skipDuplicateApprovers: true,
  rejectRequiresReason: true,
  notifyEmployeeEachStep: true,
  autoApproveOnTimeout: false,
  timeoutAutoApproveHours: 48,
};

export default function ApprovalWorkflowsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(user?.role || '');
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const effectiveCompanyId = useCompanyContextStore(s => s.effectiveCompanyId);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);

  const [workflows, setWorkflows] = useState<WorkflowConfig[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<EmpOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Test panel state
  const [testDays, setTestDays] = useState(2);
  const [testResult, setTestResult] = useState<'all_approve' | 'one_rejects'>('all_approve');
  const [testRun, setTestRun] = useState(false);

  const sq = scopeQuery();
  const sep = sq ? `&${sq}` : '';
  const qsep = sq ? `?${sq}` : '';

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const h = getAuthHeaders();
      const [wfRes, ltRes, empRes] = await Promise.all([
        fetch(`/api/leave/workflow-config${qsep}`, { headers: h }).catch(() => null),
        fetch(`/api/leave-types?limit=100${sep}`, { headers: h }).catch(() => null),
        fetch(`/api/employees?limit=200&excludeManagement=0${sep}`, { headers: h }).catch(() => null),
      ]);
      if (wfRes?.ok) {
        const d = await wfRes.json();
        const configs: WorkflowConfig[] = (Array.isArray(d) ? d : d.configs || d.data || []).map((c: any) => {
          let parsedConfig: any = {};
          try { parsedConfig = typeof c.config === 'string' ? JSON.parse(c.config) : (c.config || {}); } catch {}
          return {
            id: c.id,
            name: c.name || 'Unnamed Workflow',
            description: c.description || '',
            leaveTypeId: c.leaveTypeId || null,
            leaveTypeIds: parsedConfig.leaveTypeIds || (c.leaveTypeId ? [c.leaveTypeId] : []),
            isActive: c.isActive !== false,
            tiers: parsedConfig.tiers || DEFAULT_WORKFLOW.tiers,
            requireAllTiers: parsedConfig.requireAllTiers ?? true,
            autoApproveShortLeave: parsedConfig.autoApproveShortLeave ?? false,
            shortLeaveMaxDays: parsedConfig.shortLeaveMaxDays ?? 1,
            skipDuplicateApprovers: parsedConfig.skipDuplicateApprovers ?? true,
            rejectRequiresReason: parsedConfig.rejectRequiresReason ?? true,
            notifyEmployeeEachStep: parsedConfig.notifyEmployeeEachStep ?? true,
            autoApproveOnTimeout: parsedConfig.autoApproveOnTimeout ?? false,
            timeoutAutoApproveHours: parsedConfig.timeoutAutoApproveHours ?? 48,
          };
        });
        if (configs.length === 0) {
          configs.push({ ...DEFAULT_WORKFLOW, name: 'Default Leave Approval', description: 'Standard 2-tier approval — applies to all leave types' });
        }
        setWorkflows(configs);
        setSelectedId(configs[0]?.id || configs[0]?.name || null);
      }
      if (ltRes?.ok) {
        const d = await ltRes.json();
        setLeaveTypes((d.data || []).filter((t: any) => t.status === 'active'));
      }
      if (empRes?.ok) {
        const d = await empRes.json();
        const emps = (d.employees || d.data || []).map((e: any) => ({
          id: e.id,
          name: `${e.firstName || ''} ${e.lastName || ''}`.trim(),
          email: e.email || '',
          role: e.user?.role || e.role || '',
          employeeId: e.employeeId || '',
        }));
        setEmployees(emps);
      }
    } catch { toast.error('Failed to load workflows'); }
    finally { setLoading(false); }
  }, [sq, sep, qsep]);

  useEffect(() => { if (isAdmin) fetchWorkflows(); }, [fetchWorkflows, isAdmin]);

  const selected = workflows.find(w => w.id === selectedId || (!w.id && w.name === selectedId));
  const [editConfig, setEditConfig] = useState<WorkflowConfig | null>(null);

  useEffect(() => {
    if (selected) {
      setEditConfig(JSON.parse(JSON.stringify(selected)));
      setDirty(false);
    }
  }, [selectedId, selected]);

  if (!isAdmin) return <div className="flex items-center justify-center min-h-[40vh]"><div className="text-center"><FiSettings className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-500">Approval workflows are available to HR/Admin roles only.</p></div></div>;

  const updateField = <K extends keyof WorkflowConfig>(key: K, value: WorkflowConfig[K]) => {
    setEditConfig(prev => prev ? { ...prev, [key]: value, } : prev);
    setDirty(true);
  };

  const updateTier = (idx: number, field: keyof WorkflowTier, value: any) => {
    setEditConfig(prev => {
      if (!prev) return prev;
      const tiers = [...prev.tiers];
      tiers[idx] = { ...tiers[idx], [field]: value };
      return { ...prev, tiers };
    });
    setDirty(true);
  };

  const addTier = () => {
    setEditConfig(prev => {
      if (!prev) return prev;
      const newTier: WorkflowTier = { tier: prev.tiers.length + 1, approverType: 'hr_admin', label: 'HR Admin' };
      return { ...prev, tiers: [...prev.tiers, newTier] };
    });
    setDirty(true);
  };

  const removeTier = (idx: number) => {
    setEditConfig(prev => {
      if (!prev) return prev;
      const tiers = prev.tiers.filter((_, i) => i !== idx).map((t, i) => ({ ...t, tier: i + 1 }));
      return { ...prev, tiers };
    });
    setDirty(true);
  };

  const handleNewWorkflow = () => {
    const newWf: WorkflowConfig = { ...DEFAULT_WORKFLOW, name: `Workflow ${workflows.length + 1}` };
    setWorkflows(prev => [...prev, newWf]);
    setSelectedId(newWf.name);
  };

  const handleSave = async () => {
    if (!editConfig) return;
    if (!editConfig.name.trim()) { toast.error('Workflow name is required'); return; }
    if (editConfig.tiers.length === 0) { toast.error('At least one approval tier is required'); return; }
    setSaving(true);
    try {
      const payload = {
        id: editConfig.id,
        name: editConfig.name,
        description: editConfig.description,
        leaveTypeId: editConfig.leaveTypeIds && editConfig.leaveTypeIds.length === 1 ? editConfig.leaveTypeIds[0] : (editConfig.leaveTypeId || null),
        isActive: editConfig.isActive,
        config: JSON.stringify({
          tiers: editConfig.tiers,
          requireAllTiers: editConfig.requireAllTiers,
          autoApproveShortLeave: editConfig.autoApproveShortLeave,
          shortLeaveMaxDays: editConfig.shortLeaveMaxDays,
          skipDuplicateApprovers: editConfig.skipDuplicateApprovers,
          rejectRequiresReason: editConfig.rejectRequiresReason,
          notifyEmployeeEachStep: editConfig.notifyEmployeeEachStep,
          autoApproveOnTimeout: editConfig.autoApproveOnTimeout,
          timeoutAutoApproveHours: editConfig.timeoutAutoApproveHours,
          leaveTypeIds: editConfig.leaveTypeIds || [],
        }),
        companyId: effectiveCompanyId() || undefined,
        tenantId: selectedTenantId || undefined,
      };
      const res = await fetch('/api/leave/workflow-config', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to save'); }
      toast.success('Workflow saved');
      setDirty(false);
      fetchWorkflows();
    } catch (e: any) { toast.error(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDiscard = () => {
    if (selected) { setEditConfig(JSON.parse(JSON.stringify(selected))); setDirty(false); }
  };

  // Test panel simulation
  const testSteps = editConfig?.tiers.map((t, i) => {
    const approverLabel = t.label || t.approverType || 'Unknown';
    const isLast = i === editConfig.tiers.length - 1;
    let status: 'approved' | 'rejected' | 'pending' = 'approved';
    if (testResult === 'one_rejects' && i === editConfig.tiers.length - 1) status = 'rejected';
    if (testResult === 'one_rejects' && i < editConfig.tiers.length - 1) status = 'approved';
    return { tier: t.tier, approverLabel, status, isLast };
  }) || [];
  // Prepend employee submission
  testSteps.unshift({ tier: 0, approverLabel: 'Employee submits', status: 'approved' as const, isLast: false });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave Approval Workflows</h1>
          <p className="text-sm text-slate-500 mt-1">Configure multi-tier approval chains, SLAs, and workflow options for leave requests.</p>
        </div>
        <button onClick={fetchWorkflows} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><FiRefreshCw className="w-8 h-8 animate-spin text-slate-300" /></div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* ═══ Left: Workflow List ═══ */}
          <div className="col-span-12 md:col-span-3">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-sm font-bold text-slate-700">Workflows</h2>
              </div>
              <div className="p-2 space-y-1">
                {workflows.map((wf, i) => {
                  const isSelected = (wf.id || wf.name) === selectedId;
                  return (
                    <div
                      key={wf.id || wf.name || i}
                      onClick={() => setSelectedId(wf.id || wf.name)}
                      className={`px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{wf.name}</p>
                          <p className="text-xs text-slate-500 truncate">{wf.leaveTypeId ? leaveTypes.find(lt => lt.id === wf.leaveTypeId)?.name || 'Specific type' : 'All leave types'}</p>
                        </div>
                        {wf.isActive && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1" />}
                      </div>
                    </div>
                  );
                })}
                <button onClick={handleNewWorkflow} className="w-full mt-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-violet-300 hover:text-violet-600 transition-colors flex items-center justify-center gap-1.5">
                  <FiPlus className="w-4 h-4" /> New Workflow
                </button>
              </div>
            </div>
          </div>

          {/* ═══ Center: Workflow Details ═══ */}
          <div className="col-span-12 md:col-span-6">
            {editConfig ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100">
                  <input
                    type="text"
                    value={editConfig.name}
                    onChange={e => updateField('name', e.target.value)}
                    className="text-lg font-bold text-slate-900 w-full bg-transparent outline-none focus:bg-slate-50 rounded px-1 -mx-1"
                    placeholder="Workflow name"
                  />
                  <input
                    type="text"
                    value={editConfig.description || ''}
                    onChange={e => updateField('description', e.target.value)}
                    className="text-sm text-slate-500 w-full bg-transparent outline-none focus:bg-slate-50 rounded px-1 -mx-1 mt-1"
                    placeholder="Description"
                  />
                  <div className="flex items-start gap-3 mt-3 flex-wrap">
                    {/* Multiple leave types selection */}
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Applies to Leave Types</label>
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {/* All leave types toggle */}
                        <button
                          onClick={() => { updateField('leaveTypeIds', []); updateField('leaveTypeId', null); }}
                          className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${(!editConfig.leaveTypeIds || editConfig.leaveTypeIds.length === 0) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        >All Types</button>
                        {/* Individual leave type chips */}
                        {leaveTypes.map(lt => {
                          const isSelected = editConfig.leaveTypeIds?.includes(lt.id);
                          return (
                            <button
                              key={lt.id}
                              onClick={() => {
                                const current = editConfig.leaveTypeIds || [];
                                const newList = isSelected ? current.filter(id => id !== lt.id) : [...current, lt.id];
                                updateField('leaveTypeIds', newList);
                                updateField('leaveTypeId', newList.length === 1 ? newList[0] : null);
                              }}
                              className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${isSelected ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                            >{lt.code}</button>
                          );
                        })}
                      </div>
                      {editConfig.leaveTypeIds && editConfig.leaveTypeIds.length > 0 && (
                        <p className="text-[10px] text-slate-400">{editConfig.leaveTypeIds.length} leave type(s) selected</p>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer mt-4">
                      <input type="checkbox" checked={editConfig.isActive} onChange={e => updateField('isActive', e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                      Active
                    </label>
                  </div>
                </div>

                {/* Approval Chain */}
                <div className="px-5 py-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><FiUsers className="w-4 h-4 text-blue-500" /> Approval Chain</h3>
                  {editConfig.tiers.map((tier, idx) => {
                    const ApproverIcon = ROLE_OPTIONS.find(a => a.value === tier.approverType)?.icon || FiUser;
                    return (
                      <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">{tier.tier}</div>
                        {/* Role dropdown + employee picker based on selected role (SLA removed per user request) */}
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">Role</label>
                            <select value={tier.approverType} onChange={e => {
                              const role = e.target.value;
                              updateTier(idx, 'approverType', role);
                              updateTier(idx, 'label', ROLE_OPTIONS.find(a => a.value === role)?.label || role);
                              // Auto-select the first employee with this role (prefer "me")
                              const candidates = employees.filter(emp => (emp.role || '').toLowerCase() === role.toLowerCase());
                              if (candidates.length > 0) {
                                const me = candidates.find(c => c.email === user?.email || c.id === user?.employeeId);
                                const pick = me || candidates[0];
                                updateTier(idx, 'approverId', pick.id);
                                updateTier(idx, 'label', pick.name);
                              } else {
                                updateTier(idx, 'approverId', null);
                              }
                            }} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded bg-white outline-none focus:ring-2 focus:ring-blue-500/20">
                              <option value="">— Select role —</option>
                              {/* Dynamic roles derived from fetched employees */}
                              {[...new Set(employees.map(e => e.role).filter(Boolean))].sort().map(role => (
                                <option key={role} value={role}>{String(role).charAt(0).toUpperCase() + String(role).slice(1)}</option>
                              ))}
                              {/* Also include predefined roles not in employee data */}
                              {ROLE_OPTIONS.filter(r => !employees.some(e => e.role === r.value)).map(a => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">Approver (by role)</label>
                            {(() => {
                              const roleEmps = employees.filter(emp => (emp.role || '').toLowerCase() === (tier.approverType || '').toLowerCase());
                              return (
                                <select
                                  value={tier.approverId || ''}
                                  onChange={e => {
                                    updateTier(idx, 'approverId', e.target.value || null);
                                    const emp = employees.find(emp => emp.id === e.target.value);
                                    if (emp) updateTier(idx, 'label', emp.name);
                                  }}
                                  className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                  disabled={!tier.approverType || roleEmps.length === 0}
                                >
                                  <option value="">{roleEmps.length === 0 ? 'No employees with this role' : '— Select approver —'}</option>
                                  {roleEmps.map(emp => (
                                    <option key={emp.id} value={emp.id}>
                                      {emp.name} {emp.employeeId ? `(${emp.employeeId})` : ''} {(emp.email === user?.email || emp.id === user?.employeeId) ? '— me' : ''}
                                    </option>
                                  ))}
                                </select>
                              );
                            })()}
                          </div>
                        </div>
                        {editConfig.tiers.length > 1 && (
                          <button onClick={() => removeTier(idx)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50" title="Remove tier"><FiTrash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={addTier} className="w-full py-2.5 rounded-lg border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-blue-300 hover:text-blue-600 flex items-center justify-center gap-1.5">
                    <FiPlus className="w-4 h-4" /> Add Tier
                  </button>
                </div>

                {/* Workflow Options */}
                <div className="px-5 py-4 border-t border-slate-100 space-y-2">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><FiSettings className="w-4 h-4 text-violet-500" /> Workflow Options</h3>
                  {[
                    { key: 'requireAllTiers', label: 'Require all tiers to approve', desc: 'Every tier must approve before the leave is finalized' },
                    { key: 'autoApproveShortLeave', label: 'Auto-approve short leave', desc: `Leaves ≤ ${editConfig.shortLeaveMaxDays} day(s) skip the approval chain` },
                    { key: 'autoApproveOnTimeout', label: 'Auto-approve on SLA timeout', desc: `If an approver doesn't act within ${editConfig.timeoutAutoApproveHours}h, the request auto-approves and moves to the next tier` },
                    { key: 'skipDuplicateApprovers', label: 'Skip duplicate approvers', desc: 'If the same person appears in multiple tiers, approve only once' },
                    { key: 'rejectRequiresReason', label: 'Reject requires reason', desc: 'Approvers must enter a reason when rejecting' },
                    { key: 'notifyEmployeeEachStep', label: 'Notify employee at each step', desc: 'Send notification to the employee after each tier action' },
                  ].map(opt => (
                    <label key={opt.key} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={(editConfig as any)[opt.key]} onChange={e => updateField(opt.key as any, e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{opt.label}</p>
                        <p className="text-xs text-slate-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                  {editConfig.autoApproveShortLeave && (
                    <div className="px-3 py-2 ml-7">
                      <label className="text-xs font-medium text-slate-600">Max days for auto-approval: </label>
                      <input type="number" min={0.5} step={0.5} value={editConfig.shortLeaveMaxDays} onChange={e => updateField('shortLeaveMaxDays', parseFloat(e.target.value) || 1)} className="w-16 px-2 py-1 text-xs border border-slate-200 rounded ml-1" />
                    </div>
                  )}
                  {editConfig.autoApproveOnTimeout && (
                    <div className="px-3 py-2 ml-7">
                      <label className="text-xs font-medium text-slate-600">Auto-approve after (hours): </label>
                      <input type="number" min={1} step={1} value={editConfig.timeoutAutoApproveHours} onChange={e => updateField('timeoutAutoApproveHours', parseInt(e.target.value) || 48)} className="w-16 px-2 py-1 text-xs border border-slate-200 rounded ml-1" />
                      <span className="text-[10px] text-slate-400 ml-2">If an approver doesn't act within this time, the request auto-approves</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">{dirty ? 'Unsaved changes' : 'All changes saved'}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleDiscard} disabled={!dirty} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Discard</button>
                    <button onClick={handleSave} disabled={!dirty || saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                      {saving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />} Save Workflow
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12 text-center">
                <FiSettings className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Select a workflow from the list</p>
              </div>
            )}
          </div>

          {/* ═══ Right: Test Panel ═══ */}
          <div className="col-span-12 md:col-span-3">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden sticky top-4">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2"><FiZap className="w-4 h-4 text-amber-500" /> Test Workflow</h2>
              </div>
              <div className="p-4 space-y-4">
                {/* Leave duration slider */}
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Leave Duration</label>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0.5} max={30} step={0.5} value={testDays} onChange={e => setTestDays(parseFloat(e.target.value))} className="flex-1 accent-blue-600" />
                    <span className="text-sm font-bold text-slate-700 w-12 text-right">{testDays} {testDays === 1 ? 'day' : 'days'}</span>
                  </div>
                </div>

                {/* Result selector — flow shows immediately, no "Run Test" button */}
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Simulate Result</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setTestResult('all_approve')} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${testResult === 'all_approve' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      <FiCheckCircle className="w-3.5 h-3.5 inline mr-1" /> All Approve
                    </button>
                    <button onClick={() => setTestResult('one_rejects')} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${testResult === 'one_rejects' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      <FiXCircle className="w-3.5 h-3.5 inline mr-1" /> One Rejects
                    </button>
                  </div>
                </div>

                {/* Flow visualization — shows immediately based on selected result */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase text-slate-400">Approval Flow</h3>
                  {testSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${step.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : step.status === 'rejected' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                        {step.status === 'approved' ? <FiCheck className="w-3.5 h-3.5" /> : step.status === 'rejected' ? <FiX className="w-3.5 h-3.5" /> : <FiClock className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-slate-700">{step.approverLabel}</p>
                      </div>
                      {i < testSteps.length - 1 && <FiArrowRight className="w-3 h-3 text-slate-300" />}
                    </div>
                  ))}
                  {/* Result */}
                  <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-bold ${testResult === 'all_approve' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {testResult === 'all_approve' ? '✓ Approved — calendar updated' : '✗ Rejected — employee notified'}
                  </div>
                </div>

                {/* Recent changes */}
                <div className="pt-3 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase text-slate-400 mb-2">Recent Changes</h3>
                  <div className="space-y-1.5">
                    {dirty ? (
                      <div className="px-2 py-1.5 rounded text-[11px] text-amber-700 bg-amber-50 border border-amber-100">
                        <FiAlertCircle className="w-3 h-3 inline mr-1" /> Unsaved changes — click Save to persist
                      </div>
                    ) : (
                      <div className="px-2 py-1.5 rounded text-[11px] text-slate-500 bg-slate-50">
                        No recent changes
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
