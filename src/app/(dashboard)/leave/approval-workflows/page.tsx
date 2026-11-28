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
  // ─── Interconnected workflow toggles (QA spec Sections 5 & 7) ───
  // These map to the existing backend flags in lib/leave-workflow.ts:
  //   allowCancelAfterApproval → employee can raise cancellation on approved leaves
  //   allowApproverHold + allowDateProposal → HR/Admin can hold + propose new dates
  allowCancelAfterApproval: boolean;
  allowApproverHold: boolean;
  allowDateProposal: boolean;
  // BUG_264: policy for cancelling a leave whose period has already ended
  allowCancelAfterLeaveEnd: boolean;
  cancelWithinDaysAfterLeaveEnd: number | null;
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

interface EmpOption { id: string; name: string; email: string; role?: string; employeeId?: string; branch?: string; department?: string; designation?: string; }

const DEFAULT_WORKFLOW: WorkflowConfig = {
  name: 'New Workflow',
  description: '',
  leaveTypeId: null,
  leaveTypeIds: [],
  isActive: true,
  tiers: [
    { tier: 1, approverType: 'tenant_admin', label: 'Tenant Admin' },
    { tier: 2, approverType: 'employee', label: 'Employee' },
  ],
  requireAllTiers: true,
  autoApproveShortLeave: false,
  shortLeaveMaxDays: 1,
  skipDuplicateApprovers: true,
  rejectRequiresReason: true,
  notifyEmployeeEachStep: true,
  autoApproveOnTimeout: false,
  timeoutAutoApproveHours: 48,
  allowCancelAfterApproval: true, // employees CAN cancel after approval
  allowApproverHold: true,        // HR/Admin CAN hold leave
  allowDateProposal: true,        // HR/Admin CAN propose new dates
  // BUG_264 defaults: past leaves CAN be cancelled, no time window
  allowCancelAfterLeaveEnd: true,
  cancelWithinDaysAfterLeaveEnd: null,
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

  // ─── Tab state: "Approval Workflow" (existing) vs "Application Form Settings" (new) ───
  const [activeTab, setActiveTab] = useState<'workflow' | 'form-settings' | 'proxy'>('workflow');

  // ─── Application Form Settings state ───
  // Tenant-wide config: which fields appear on the Apply Leave form and
  // which are mandatory. Configured ONCE here — not per leave type.
  const [formSettings, setFormSettings] = useState<any>(null);
  const [formSettingsLoading, setFormSettingsLoading] = useState(false);
  const [formSettingsSaving, setFormSettingsSaving] = useState(false);

  const fetchFormSettings = useCallback(async () => {
    setFormSettingsLoading(true);
    try {
      const res = await fetch('/api/leave/form-settings', { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setFormSettings(d.settings);
      }
    } catch { toast.error('Failed to load form settings'); }
    finally { setFormSettingsLoading(false); }
  }, []);

  // Load form settings when the tab is first opened
  useEffect(() => {
    if (activeTab === 'form-settings' && !formSettings && !formSettingsLoading) {
      fetchFormSettings();
    }
  }, [activeTab, formSettings, formSettingsLoading, fetchFormSettings]);

  const saveFormSettings = async () => {
    setFormSettingsSaving(true);
    try {
      const res = await fetch('/api/leave/form-settings', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ settings: formSettings }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to save'); }
      toast.success('Form settings saved');
    } catch (e: any) { toast.error(e.message || 'Failed to save'); }
    finally { setFormSettingsSaving(false); }
  };

  const updateFormSetting = (key: string, value: boolean) => {
    setFormSettings((prev: any) => ({ ...prev, [key]: value }));
  };

  // ─── Proxy Management state ───
  const [proxyDelegations, setProxyDelegations] = useState<any[]>([]);
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxySaving, setProxySaving] = useState(false);
  const [showProxyModal, setShowProxyModal] = useState(false);
  const [editingProxy, setEditingProxy] = useState<any | null>(null);
  const [proxyFilter, setProxyFilter] = useState<'all' | 'active' | 'scheduled' | 'disabled' | 'expired'>('all');

  const fetchProxyDelegations = useCallback(async () => {
    setProxyLoading(true);
    try {
      const res = await fetch('/api/leave/proxy-delegations', { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setProxyDelegations(d.data || []);
      }
    } catch { toast.error('Failed to load proxy delegations'); }
    finally { setProxyLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'proxy' && proxyDelegations.length === 0 && !proxyLoading) {
      fetchProxyDelegations();
    }
    // Also fetch employees if they haven't been loaded yet (needed for the
    // proxy modal dropdowns). The workflow tab fetches them via fetchWorkflows,
    // but if the user goes directly to the proxy tab, employees would be empty
    // and the dropdown would show "Unknown".
    if (activeTab === 'proxy' && employees.length === 0) {
      const h = getAuthHeaders();
      const sq = scopeQuery();
      fetch(`/api/employees?limit=200&excludeManagement=0${sq ? `&${sq}` : ''}`, { headers: h })
        .then(r => r.ok ? r.json() : { employees: [] })
        .then(d => {
          const emps = (d.employees || d.data || []).map((e: any) => ({
            id: e.id,
            name: `${e.firstName || ''} ${e.lastName || ''}`.trim(),
            email: e.email || '',
            role: e.user?.role || e.role || '',
            employeeId: e.employeeId || '',
            branch: e.branch?.name || '',
            department: e.department?.name || '',
            designation: e.designation?.title || '',
          }));
          setEmployees(emps);
        })
        .catch(() => {});
    }
  }, [activeTab, proxyDelegations.length, proxyLoading, fetchProxyDelegations, employees.length, scopeQuery]);

  const saveProxy = async (data: any) => {
    setProxySaving(true);
    try {
      const method = editingProxy ? 'PUT' : 'POST';
      const body = editingProxy ? { ...data, id: editingProxy.id } : data;
      const res = await fetch('/api/leave/proxy-delegations', {
        method, headers: getAuthHeaders(), body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to save'); }
      toast.success(editingProxy ? 'Proxy delegation updated' : 'Proxy delegation created');
      setShowProxyModal(false);
      setEditingProxy(null);
      fetchProxyDelegations();
    } catch (e: any) { toast.error(e.message || 'Failed to save'); }
    finally { setProxySaving(false); }
  };

  const deleteProxy = async (id: string) => {
    if (!confirm('Delete this proxy delegation?')) return;
    try {
      const res = await fetch(`/api/leave/proxy-delegations?id=${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Proxy delegation deleted');
      fetchProxyDelegations();
    } catch (e: any) { toast.error(e.message || 'Failed to delete'); }
  };

  const toggleProxyEnabled = async (proxy: any) => {
    try {
      const res = await fetch('/api/leave/proxy-delegations', {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ id: proxy.id, isEnabled: !proxy.isEnabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      fetchProxyDelegations();
    } catch (e: any) { toast.error(e.message || 'Failed to toggle'); }
  };

  const filteredProxies = proxyDelegations.filter(p => {
    if (proxyFilter === 'all') return true;
    return p.status === proxyFilter;
  });

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
            allowCancelAfterApproval: parsedConfig.allowCancelAfterApproval ?? true,
            allowApproverHold: parsedConfig.allowApproverHold ?? true,
            allowDateProposal: parsedConfig.allowDateProposal ?? true,
            allowCancelAfterLeaveEnd: parsedConfig.allowCancelAfterLeaveEnd ?? true,
            cancelWithinDaysAfterLeaveEnd: parsedConfig.cancelWithinDaysAfterLeaveEnd ?? null,
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
      const newTier: WorkflowTier = { tier: prev.tiers.length + 1, approverType: '', label: '' };
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
    // Filter out incomplete tiers (user clicked "Add Tier" but didn't pick a role).
    // The backend also does this, but doing it here lets us show a helpful toast.
    const validTiers = editConfig.tiers.filter(t => (t.approverType && t.approverType.trim()) || t.approverId);
    if (validTiers.length === 0) {
      toast.error('Add at least one approval tier and pick a role for it');
      return;
    }
    const skippedCount = editConfig.tiers.length - validTiers.length;
    if (skippedCount > 0) {
      toast(`${skippedCount} incomplete tier${skippedCount > 1 ? 's' : ''} skipped — pick a role to include them next time`);
    }
    // Re-number tiers sequentially after filtering
    const renumberedTiers = validTiers.map((t, i) => ({ ...t, tier: i + 1 }));
    setSaving(true);
    try {
      const payload = {
        id: editConfig.id,
        name: editConfig.name,
        description: editConfig.description,
        leaveTypeId: editConfig.leaveTypeIds && editConfig.leaveTypeIds.length === 1 ? editConfig.leaveTypeIds[0] : (editConfig.leaveTypeId || null),
        isActive: editConfig.isActive,
        // Send config as a JSON string — the backend tolerates both string
        // and object forms (parses string if needed).
        config: JSON.stringify({
          tiers: renumberedTiers,
          requireAllTiers: editConfig.requireAllTiers,
          autoApproveShortLeave: editConfig.autoApproveShortLeave,
          shortLeaveMaxDays: editConfig.shortLeaveMaxDays,
          skipDuplicateApprovers: editConfig.skipDuplicateApprovers,
          rejectRequiresReason: editConfig.rejectRequiresReason,
          notifyEmployeeEachStep: editConfig.notifyEmployeeEachStep,
          autoApproveOnTimeout: editConfig.autoApproveOnTimeout,
          timeoutAutoApproveHours: editConfig.timeoutAutoApproveHours,
          allowCancelAfterApproval: editConfig.allowCancelAfterApproval,
          allowApproverHold: editConfig.allowApproverHold,
          allowDateProposal: editConfig.allowDateProposal,
          allowCancelAfterLeaveEnd: editConfig.allowCancelAfterLeaveEnd,
          cancelWithinDaysAfterLeaveEnd: editConfig.cancelWithinDaysAfterLeaveEnd,
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
        <button onClick={activeTab === 'form-settings' ? fetchFormSettings : fetchWorkflows} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
          <FiRefreshCw className={`w-4 h-4 ${(loading || formSettingsLoading) ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* ─── Child tabs ─── */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('workflow')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === 'workflow' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <FiSettings className="w-4 h-4 inline mr-1.5" /> Approval Workflow
        </button>
        <button
          onClick={() => setActiveTab('form-settings')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === 'form-settings' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <FiCheck className="w-4 h-4 inline mr-1.5" /> Application Form Settings
        </button>
        <button
          onClick={() => setActiveTab('proxy')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === 'proxy' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <FiUsers className="w-4 h-4 inline mr-1.5" /> Proxy Management
        </button>
      </div>

      {/* ═══ Application Form Settings tab ═══ */}
      {activeTab === 'form-settings' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Application Form Settings</h2>
            <p className="text-sm text-slate-500 mt-1">
              Control which fields appear on the Apply Leave form for all employees. Configure once here — not per leave type.
              Each field has an <strong>Enabled</strong> toggle (show/hide on the form) and a <strong>Mandatory</strong> toggle (block submission if empty).
            </p>
          </div>

          {formSettingsLoading ? (
            <div className="flex items-center justify-center py-16"><FiRefreshCw className="w-8 h-8 animate-spin text-slate-300" /></div>
          ) : formSettings ? (
            <div className="p-5">
              {/* ─── Settings table ─── */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[1fr_120px_120px] gap-x-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Field on Apply Leave form</span>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide text-center">Enabled</span>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide text-center">Mandatory</span>
                </div>

                {/* Field rows */}
                {(() => {
                  const FIELDS: Array<{ key: string; label: string; hint?: string; canMandatory: boolean }> = [
                    { key: 'showReason', label: 'Leave reason', hint: 'The text field where the employee explains why they need leave', canMandatory: true },
                    { key: 'showDaySelection', label: 'Day selection checkboxes', hint: 'Per-date Full day / First half / Second half checkboxes', canMandatory: false },
                    { key: 'showShift', label: 'Shift display', hint: 'Shows the employee\'s shift timings next to each date', canMandatory: false },
                    { key: 'showAttachment', label: 'Attachment / document upload', hint: 'Medical certificate, transfer letter, etc.', canMandatory: true },
                    { key: 'showContactNumber', label: 'Contact number during leave', hint: 'Phone number where the employee can be reached', canMandatory: true },
                    { key: 'showContactAddress', label: 'Contact address during leave', hint: 'Where the employee will be staying during leave', canMandatory: true },
                    { key: 'showHandover', label: 'Handover to / backup person', hint: 'Who covers the employee\'s work while they\'re away', canMandatory: true },
                    { key: 'showTeamOnLeave', label: 'Team members on leave', hint: 'Shows overlapping leave from team members', canMandatory: false },
                    { key: 'showRelocation', label: 'Relocation fields', hint: 'Type, family, distance — only for Relocation Leave', canMandatory: true },
                    { key: 'showNotifyCc', label: 'Notify (CC) other people', hint: 'Additional people to notify about this leave', canMandatory: false },
                  ];
                  return FIELDS.map((field, i) => {
                    const enabledKey = field.key;
                    const mandatoryKey = field.key.replace('show', 'mandatory');
                    const isEnabled = formSettings[enabledKey] !== false;
                    const isMandatory = formSettings[mandatoryKey] === true;
                    return (
                      <div key={field.key} className={`grid grid-cols-[1fr_120px_120px] gap-x-3 px-4 py-3 border-b border-slate-100 last:border-b-0 items-center ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                        {/* Field name + hint */}
                        <div>
                          <p className="text-[13px] font-semibold text-slate-800">{field.label}</p>
                          {field.hint && <p className="text-[11px] text-slate-400 mt-0.5">{field.hint}</p>}
                        </div>
                        {/* Enabled toggle */}
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => updateFormSetting(enabledKey, !isEnabled)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        {/* Mandatory toggle */}
                        <div className="flex justify-center">
                          {field.canMandatory ? (
                            <button
                              type="button"
                              disabled={!isEnabled}
                              onClick={() => updateFormSetting(mandatoryKey, !isMandatory)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${!isEnabled ? 'bg-slate-200 cursor-not-allowed opacity-50' : isMandatory ? 'bg-red-500' : 'bg-slate-300'}`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isMandatory ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-300">—</span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Live preview */}
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <p className="text-[12px] font-bold text-emerald-700 mb-1">Preview of Apply Leave form:</p>
                <p className="text-[12px] text-emerald-600">
                  {[
                    formSettings.showReason !== false && (formSettings.mandatoryReason ? 'Reason (mandatory)' : 'Reason (optional)'),
                    formSettings.showDaySelection !== false && 'Day selection checkboxes',
                    formSettings.showShift === true && 'Shift display',
                    formSettings.showAttachment !== false && (formSettings.mandatoryAttachment ? 'Attachment (mandatory)' : 'Attachment (optional)'),
                    formSettings.showContactNumber !== false && (formSettings.mandatoryContactNumber ? 'Contact number (mandatory)' : 'Contact number (optional)'),
                    formSettings.showContactAddress !== false && (formSettings.mandatoryContactAddress ? 'Contact address (mandatory)' : 'Contact address (optional)'),
                    formSettings.showHandover !== false && (formSettings.mandatoryHandover ? 'Handover (mandatory)' : 'Handover (optional)'),
                    formSettings.showTeamOnLeave !== false && 'Team on leave',
                    formSettings.showRelocation === true && (formSettings.mandatoryRelocation ? 'Relocation fields (mandatory)' : 'Relocation fields (optional)'),
                    formSettings.showNotifyCc !== false && 'Notify CC',
                  ].filter(Boolean).join(' · ') || 'No fields enabled — the form will be empty.'}
                </p>
              </div>

              {/* Save button */}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={saveFormSettings}
                  disabled={formSettingsSaving}
                  className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {formSettingsSaving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
                  {formSettingsSaving ? 'Saving…' : 'Save Form Settings'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400">
              <FiSettings className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>Click "Refresh" to load form settings.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ Proxy Management tab ═══ */}
      {activeTab === 'proxy' && (
        <div className="grid grid-cols-12 gap-4">
          {/* Left: Proxy Delegations table */}
          <div className="col-span-12 lg:col-span-8">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Proxy Delegations</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Delegate approval authority when the original approver is unavailable or misses SLA.</p>
                </div>
                <button onClick={() => { setEditingProxy(null); setShowProxyModal(true); }} className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 flex items-center gap-1.5">
                  <FiPlus className="w-4 h-4" /> Assign Proxy
                </button>
              </div>
              {/* Filter tabs */}
              <div className="px-5 py-2 border-b border-slate-100 flex gap-1">
                {(['all', 'active', 'scheduled', 'disabled', 'expired'] as const).map(f => (
                  <button key={f} onClick={() => setProxyFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${proxyFilter === f ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                    {f}
                  </button>
                ))}
              </div>
              {proxyLoading ? (
                <div className="flex items-center justify-center py-16"><FiRefreshCw className="w-8 h-8 animate-spin text-slate-300" /></div>
              ) : filteredProxies.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <FiUsers className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm">No proxy delegations found. Click "Assign Proxy" to create one.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase">Approver → Proxy</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase">Leave Types</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase">Date Range</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase">Status</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase">Permissions</th>
                        <th className="px-4 py-2.5 text-center text-[11px] font-bold text-slate-500 uppercase">Enabled</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-bold text-slate-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProxies.map((p: any) => {
                        const statusColors: Record<string,string> = { active: 'bg-emerald-100 text-emerald-700', scheduled: 'bg-blue-100 text-blue-700', disabled: 'bg-slate-100 text-slate-500', expired: 'bg-amber-100 text-amber-700' };
                        const permList = Object.entries(p.permissions || {}).filter(([,v]) => v === true).map(([k]) => k.replace('can','').replace(/([A-Z])/g,' $1').trim().toLowerCase());
                        return (
                          <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/30">
                            <td className="px-4 py-3">
                              <p className="text-[12.5px] font-semibold text-slate-800">{p.approverName}</p>
                              <p className="text-[11px] text-slate-400">→ {p.proxyName}</p>
                            </td>
                            <td className="px-4 py-3 text-[11.5px] text-slate-600">{(p.leaveTypeNames || []).join(', ')}</td>
                            <td className="px-4 py-3 text-[11.5px] text-slate-600 whitespace-nowrap">{p.startDate} – {p.endDate}</td>
                            <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold capitalize ${statusColors[p.status] || 'bg-slate-100 text-slate-500'}`}>{p.status}</span></td>
                            <td className="px-4 py-3 text-[10.5px] text-slate-500 max-w-[140px] truncate">{permList.join(', ') || '—'}</td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => toggleProxyEnabled(p)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${p.isEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <button onClick={() => { setEditingProxy(p); setShowProxyModal(true); }} className="text-xs font-semibold text-blue-600 hover:text-blue-700 mr-2"><FiEdit2 className="w-3.5 h-3.5 inline" /></button>
                              <button onClick={() => deleteProxy(p.id)} className="text-xs font-semibold text-red-500 hover:text-red-700"><FiTrash2 className="w-3.5 h-3.5 inline" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right: Awaiting Action panel */}
          <div className="col-span-12 lg:col-span-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden sticky top-4">
              <div className="px-5 py-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700">Awaiting action</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-red-100 text-red-700">SLA routing</span>
                </div>
                <p className="text-[11.5px] text-slate-500 mt-1">Overdue requests can be routed to an active proxy.</p>
              </div>
              <div className="p-4 space-y-3">
                {proxyDelegations.filter(p => p.status === 'active').length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <FiCheckCircle className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">No active proxy delegations. Assign a proxy to enable SLA routing.</p>
                  </div>
                ) : (
                  proxyDelegations.filter(p => p.status === 'active').map((p: any) => (
                    <div key={p.id} className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[12.5px] font-semibold text-slate-800">{p.approverName}</p>
                        <span className="text-[10px] font-bold text-amber-700">Overdue</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2">Proxy: {p.proxyName} · SLA: {p.slaHours}h</p>
                      <div className="flex gap-1.5">
                        <select className="flex-1 h-8 px-2 rounded-lg border border-slate-200 text-[11.5px] bg-white" defaultValue={p.proxyId}>
                          <option value={p.proxyId}>{p.proxyName}</option>
                        </select>
                        <button className="h-8 px-3 rounded-lg bg-amber-600 text-white text-[11.5px] font-semibold hover:bg-amber-700">Route</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proxy inline form (replaces the popup modal) */}
      {showProxyModal && (
        <ProxyForm
          editing={editingProxy}
          employees={employees}
          leaveTypes={leaveTypes}
          onSave={saveProxy}
          onClose={() => { setShowProxyModal(false); setEditingProxy(null); }}
          saving={proxySaving}
        />
      )}

      {/* ═══ Approval Workflow tab (existing UI) ═══ */}
      {activeTab === 'workflow' && (
        <>
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
                              {/* Dynamic roles derived from fetched employees only — every role has at least one employee */}
                              {[...new Set(employees.map(e => e.role).filter(Boolean))].sort().map(role => (
                                <option key={role} value={role}>{String(role).charAt(0).toUpperCase() + String(role).slice(1)}</option>
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
                    { key: 'allowCancelAfterApproval', label: 'Employee can cancel leave after approval', desc: 'When checked, employees can raise a cancellation request on already-approved leaves (goes to Reporting Manager for approval). When unchecked, employees can only withdraw pending requests — not cancel approved ones.' },
                    { key: '__hrHold', label: 'HR/Admin can hold leave & propose new dates', desc: 'When checked, HR Admin / Admin / Tenant Admin can put a pending leave on hold and propose alternative dates. The employee is notified and can accept the proposed dates or withdraw. Unchecking this disables both hold and date proposal.' },
                    { key: 'allowCancelAfterLeaveEnd', label: 'Allow cancelling a leave whose period has ended', desc: 'When checked, cancellation of a leave AFTER its period follows the time-window rule below (HR sign-off still applies for approved leaves). When unchecked, past leaves can never be cancelled.' },
                    { key: '__cancelWindow', label: 'Limit cancellation to N days after the leave end', desc: 'Restricts cancellation of a past leave to the configured number of days after the leave end date (0 or empty = no time limit).' },
                  ].map(opt => {
                    // The __hrHold checkbox is a combined toggle that sets
                    // both allowApproverHold and allowDateProposal together.
                    // The __cancelWindow "toggle" renders a number input for
                    // cancelWithinDaysAfterLeaveEnd (BUG_264).
                    const isHrHoldCombined = opt.key === '__hrHold';
                    const isCancelWindow = opt.key === '__cancelWindow';
                    if (isCancelWindow) {
                      return (
                        <label key={opt.key} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                          <input
                            type="number"
                            min={0}
                            value={editConfig.cancelWithinDaysAfterLeaveEnd ?? ''}
                            onChange={e => {
                              const v = e.target.value === '' ? null : Math.max(0, Number(e.target.value));
                              updateField('cancelWithinDaysAfterLeaveEnd', v);
                            }}
                            disabled={!editConfig.allowCancelAfterLeaveEnd}
                            placeholder="No limit"
                            className="w-20 mt-0.5 text-sm px-2 py-1 border border-slate-200 rounded bg-white outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                          <div>
                            <p className="text-sm font-medium text-slate-700">{opt.label}</p>
                            <p className="text-xs text-slate-500">{opt.desc}</p>
                          </div>
                        </label>
                      );
                    }
                    const checked = isHrHoldCombined
                      ? (editConfig.allowApproverHold !== false && editConfig.allowDateProposal !== false)
                      : (editConfig as any)[opt.key];
                    const handleChange = (e: any) => {
                      if (isHrHoldCombined) {
                        const val = e.target.checked;
                        updateField('allowApproverHold', val);
                        updateField('allowDateProposal', val);
                      } else {
                        updateField(opt.key as any, e.target.checked);
                      }
                    };
                    return (
                    <label key={opt.key} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={handleChange} className="w-4 h-4 rounded border-slate-300 text-blue-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{opt.label}</p>
                        <p className="text-xs text-slate-500">{opt.desc}</p>
                      </div>
                    </label>
                    );
                  })}
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
      </>
      )}
    </div>
  );
}

/* ─── Proxy Form Component (inline panel, not a popup) ─── */
function ProxyForm({ editing, employees, leaveTypes, onSave, onClose, saving }: {
  editing: any | null;
  employees: EmpOption[];
  leaveTypes: LeaveType[];
  onSave: (data: any) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    approverId: editing?.approverId || '',
    proxyId: editing?.proxyId || '',
    startDate: editing?.startDate || new Date().toISOString().split('T')[0],
    endDate: editing?.endDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    activationCondition: editing?.activationCondition || 'sla_timeout',
    slaHours: editing?.slaHours || 24,
    leaveTypeIds: editing?.leaveTypeIds || ['all'],
    maxLeaveDays: editing?.maxLeaveDays || 0,
    reason: editing?.reason || '',
    notifyOriginalApprover: editing?.notifyOriginalApprover ?? true,
    showProxyNameToEmployee: editing?.showProxyNameToEmployee ?? true,
    isEnabled: editing?.isEnabled ?? true,
    permissions: editing?.permissions || {
      canApprove: true, canReject: true, canReturnForClarification: true,
      canModifyDates: false, canChangeLeaveType: false,
      canPartiallyApprove: false, canCancelApproved: false, canRedelegate: false,
    },
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const setPerm = (k: string, v: boolean) => setForm(f => ({ ...f, permissions: { ...f.permissions, [k]: v } }));
  const toggleLeaveType = (id: string) => {
    setForm(f => {
      let current = f.leaveTypeIds.includes('all') ? [] : [...f.leaveTypeIds];
      if (current.includes(id)) current = current.filter(x => x !== id);
      else current.push(id);
      if (current.length === 0) current = ['all'];
      return { ...f, leaveTypeIds: current };
    });
  };

  const submit = () => {
    if (!form.approverId || !form.proxyId) { toast.error('Select both approver and proxy'); return; }
    if (form.approverId === form.proxyId) { toast.error('Approver and proxy cannot be the same'); return; }
    if (!form.startDate || !form.endDate) { toast.error('Date range is required'); return; }
    onSave(form);
  };

  const PERMISSION_FIELDS = [
    { key: 'canApprove', label: 'Approve' },
    { key: 'canReject', label: 'Reject (with reason)' },
    { key: 'canReturnForClarification', label: 'Return for clarification' },
    { key: 'canModifyDates', label: 'Modify dates / duration' },
    { key: 'canChangeLeaveType', label: 'Change leave type (e.g. CL \u2192 LWP)' },
    { key: 'canPartiallyApprove', label: 'Partially approve' },
    { key: 'canCancelApproved', label: 'Cancel approved leave' },
    { key: 'canRedelegate', label: 'Re-delegate to another person' },
  ];

  // Show all employees with a role (for the dropdowns)
  const empOptions = employees.length > 0 ? employees : [];

  // ─── Filter state: shortlist employees by branch / dept / designation ───
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterDesignation, setFilterDesignation] = useState('');

  // Derive unique values for the filter dropdowns
  const branchOptions = [...new Set(empOptions.map(e => e.branch).filter(Boolean))].sort();
  const deptOptions = [...new Set(empOptions.map(e => e.department).filter(Boolean))].sort();
  const designationOptions = [...new Set(empOptions.map(e => e.designation).filter(Boolean))].sort();

  // Filter employees based on the selected filters
  const filteredEmps = empOptions.filter(e => {
    if (filterBranch && e.branch !== filterBranch) return false;
    if (filterDept && e.department !== filterDept) return false;
    if (filterDesignation && e.designation !== filterDesignation) return false;
    return true;
  });

  // Format employee label with branch/dept/designation for easy identification
  const empLabel = (e: EmpOption) => {
    const parts = [e.name];
    if (e.designation) parts.push(`(${e.designation})`);
    if (e.department) parts.push(`\u2014 ${e.department}`);
    if (e.branch) parts.push(`\u00b7 ${e.branch}`);
    return parts.join(' ');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{editing ? 'Edit Proxy Approver' : 'Assign Proxy Approver'}</h3>
          <p className="text-sm text-slate-500 mt-0.5">Delegate approval authority when the original approver is unavailable or misses SLA.</p>
        </div>
        <button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
          <FiX className="w-4 h-4" /> Close
        </button>
      </div>

      {/* Body */}
      <div className="p-6 space-y-5">
        {/* ─── Employee filters (shortlist by branch / dept / designation) ─── */}
        <div>
          <label className="block text-[12.5px] font-semibold text-slate-700 mb-2">Filter Employees</label>
          <div className="grid grid-cols-3 gap-3">
            <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-[12.5px] bg-white">
              <option value="">All Branches</option>
              {branchOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-[12.5px] bg-white">
              <option value="">All Departments</option>
              {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filterDesignation} onChange={e => setFilterDesignation(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-200 text-[12.5px] bg-white">
              <option value="">All Designations</option>
              {designationOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {(filterBranch || filterDept || filterDesignation) && (
            <p className="text-[11px] text-slate-500 mt-1.5">
              Showing {filteredEmps.length} of {empOptions.length} employees
              <button onClick={() => { setFilterBranch(''); setFilterDept(''); setFilterDesignation(''); }}
                className="ml-2 text-blue-600 font-semibold hover:underline">Clear filters</button>
            </p>
          )}
        </div>

        {/* Approver + Proxy */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Original Approver <span className="text-red-500">*</span></label>
            <select value={form.approverId} onChange={e => set('approverId', e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
              <option value="">— Select approver —</option>
              {filteredEmps.map(e => <option key={e.id} value={e.id}>{empLabel(e)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Proxy Approver <span className="text-red-500">*</span></label>
            <select value={form.proxyId} onChange={e => set('proxyId', e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
              <option value="">— Select proxy —</option>
              {filteredEmps.filter(e => e.id !== form.approverId).map(e => <option key={e.id} value={e.id}>{empLabel(e)}</option>)}
            </select>
          </div>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Start Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">End Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.endDate} min={form.startDate} onChange={e => set('endDate', e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
          </div>
        </div>

        {/* Activation condition */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Activation Condition</label>
            <select value={form.activationCondition} onChange={e => set('activationCondition', e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
              <option value="sla_timeout">Approver didn't act within SLA</option>
              <option value="on_leave">Approver on leave</option>
              <option value="always">Always</option>
            </select>
          </div>
          {form.activationCondition === 'sla_timeout' && (
            <div>
              <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">SLA Hours (auto-escalate after)</label>
              <input type="number" min={1} value={form.slaHours} onChange={e => set('slaHours', parseInt(e.target.value) || 24)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
            </div>
          )}
        </div>

        {/* Leave types */}
        <div>
          <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Leave Types</label>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => set('leaveTypeIds', ['all'])}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border ${form.leaveTypeIds.includes('all') ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>All Types</button>
            {leaveTypes.map(lt => (
              <button key={lt.id} onClick={() => toggleLeaveType(lt.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold border ${form.leaveTypeIds.includes(lt.id) ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>{lt.code}</button>
            ))}
          </div>
        </div>

        {/* Max leave days */}
        <div>
          <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Max leave days proxy can approve (0 = unlimited, escalate if exceeded)</label>
          <input type="number" min={0} value={form.maxLeaveDays} onChange={e => set('maxLeaveDays', parseInt(e.target.value) || 0)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>

        {/* Permissions */}
        <div>
          <label className="block text-[12.5px] font-semibold text-slate-700 mb-2">Proxy Permissions</label>
          <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100">
            {PERMISSION_FIELDS.map(p => (
              <label key={p.key} className="flex items-center gap-2 text-[12.5px] text-slate-700 cursor-pointer">
                <input type="checkbox" checked={form.permissions[p.key] === true} onChange={e => setPerm(p.key, e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600" />
                {p.label}
              </label>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">Reason (optional)</label>
          <textarea rows={2} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="e.g. Annual leave, business trip"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none" />
        </div>

        {/* Notification options */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[12.5px] text-slate-700 cursor-pointer">
            <input type="checkbox" checked={form.notifyOriginalApprover} onChange={e => set('notifyOriginalApprover', e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-600" />
            Notify original approver of proxy actions
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-slate-700 cursor-pointer">
            <input type="checkbox" checked={form.showProxyNameToEmployee} onChange={e => set('showProxyNameToEmployee', e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-600" />
            Show proxy name to employee
          </label>
        </div>

        {/* Enabled toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
          <span className="text-[12.5px] font-semibold text-slate-700">Enabled</span>
          <button onClick={() => set('isEnabled', !form.isEnabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button onClick={submit} disabled={saving} className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
          {saving ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />} Save Proxy
        </button>
      </div>
    </div>
  );
}
