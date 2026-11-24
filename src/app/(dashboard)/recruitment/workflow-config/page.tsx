'use client';

/**
 * /recruitment/workflow-config
 *
 * Dynamic workflow configuration for the hiring lifecycle:
 *   1. Recruitment Pipeline  — application stages (labels, order, SLA, visibility)
 *                              + the sequential offer-approval chain
 *   2. Preboarding Stages    — offer-acceptance → joining stage machine
 *   3. Onboarding Checklist  — task checklist generated on ATS → employee convert
 *
 * Stored per tenant in RecruitmentWorkflowConfig (workflowType =
 * 'recruitment' | 'preboarding' | 'onboarding'). Until customized, the
 * built-in defaults from src/lib/recruitment-workflow.ts apply. Stage keys
 * are bound to system status values so existing data stays consistent;
 * tenants control labels, order, SLAs, visibility and approver chains.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  FiArrowLeft, FiPlus, FiTrash2, FiArrowUp, FiArrowDown, FiSave, FiInfo,
  FiRotateCcw, FiCheckCircle, FiLoader, FiUserCheck, FiUserX, FiSearch,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { canAccessEmployeeSettings } from '@/lib/roleAccess';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

type WfType = 'recruitment' | 'preboarding' | 'onboarding' | 'requisition' | 'interview-panel';

const TABS: { key: WfType; label: string; hint: string }[] = [
  { key: 'recruitment', label: 'Recruitment Pipeline', hint: 'Application stages & offer approval chain' },
  { key: 'preboarding', label: 'Preboarding Stages', hint: 'Offer acceptance → Day 1 stage machine' },
  { key: 'onboarding', label: 'Onboarding Checklist', hint: 'Tasks auto-generated when a candidate converts' },
  { key: 'requisition', label: 'Requisition Approval', hint: 'Configurable approval chain (Manager → HR → Finance → …)' },
  { key: 'interview-panel', label: 'Interview Panel', hint: 'Mark employees as interviewers — they see the "My Interviews" tab' },
];

const STAGE_COLORS = ['slate', 'blue', 'amber', 'violet', 'green', 'red', 'cyan', 'pink'];
const COLOR_DOT: Record<string, string> = {
  slate: '#64748B', blue: '#3B82F6', amber: '#F59E0B', violet: '#8B5CF6',
  green: '#10B981', red: '#EF4444', cyan: '#06B6D4', pink: '#EC4899',
};

const APPROVER_TYPES: { value: string; label: string; hint: string }[] = [
  { value: 'reporting_manager', label: 'Reporting Manager', hint: 'Hiring manager of the position' },
  { value: 'department_head', label: 'Department Head', hint: 'Head of the hiring department' },
  { value: 'hr_admin', label: 'HR Admin', hint: 'HR / Admin users' },
  { value: 'tenant_admin', label: 'Tenant Admin', hint: 'Tenant administrator' },
  { value: 'finance', label: 'Finance', hint: 'Finance users (CTC sign-off)' },
  { value: 'specific_user', label: 'Specific User', hint: 'One named approver' },
];

const ONB_CATEGORIES = ['general', 'it_setup', 'hr_docs', 'training', 'introduction', 'buddy_setup', 'payroll_setup', 'project_allocation', 'documentation', 'compliance'];

// ─── UI state shapes (mirror the lib config types) ───
interface Stage { key: string; label: string; color?: string; slaDays?: number | null; enabled?: boolean }
interface Tier { tier: number; approverType: string; approverUserId?: string | null; label?: string }
interface RecruitmentCfg { stages: Stage[]; offerApproval: { enabled: boolean; tiers: Tier[] }; autoAdvance?: boolean }
interface PreboardingCfg { stages: Array<{ key: string; label: string; slaDays?: number | null; enabled?: boolean; notifyRoles?: string[] }>; requireHRVerification?: boolean; blockJoiningUntilDocsComplete?: boolean }
interface OnbTask { task: string; category: string; dueOffsetDays: number; assigneeRole?: string | null }
interface OnbPhase { key: string; label: string; tasks: OnbTask[] }
interface OnboardingCfg { generateFromTemplates: boolean; buddyEnabled?: boolean; phases: OnbPhase[] }
interface RequisitionCfg { tiers: Tier[]; skipFinanceBelowBudget?: number | null; allowManagerSubmit?: boolean }

function NumberInput({ value, onChange, min, max, placeholder, className = '' }: {
  value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; placeholder?: string; className?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      min={min} max={max} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={`px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white ${className}`}
    />
  );
}

// Interview Panel tab row — mirrors the EmployeeCredential shape returned by
// /api/employees/credentials (only the fields this tab renders).
interface InterviewPanelEmployee {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  department: string
  designation: string
  status: string
  hasLoginAccount: boolean
  loginStatus: string
  isInterviewer?: boolean
  userRole: string | null
}

export default function WorkflowConfigPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const canManage = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(user?.role || '');

  // Interview Panel tab — employee list with interviewer pills (same data
  // source as Employees → Settings → Login Credentials, but surfaced here
  // in the Recruitment module where "My Interviews" belongs).
  const { scopeQuery, effectiveCompanyId, selectedTenantId } = useCompanyContextStore();
  const scopeCompanyId = effectiveCompanyId();
  const [panelEmployees, setPanelEmployees] = useState<InterviewPanelEmployee[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelSearch, setPanelSearch] = useState('');
  const [panelTenantId, setPanelTenantId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WfType>('recruitment');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customized, setCustomized] = useState<Record<string, boolean>>({});

  const [recCfg, setRecCfg] = useState<RecruitmentCfg | null>(null);
  const [pbCfg, setPbCfg] = useState<PreboardingCfg | null>(null);
  const [onbCfg, setOnbCfg] = useState<OnboardingCfg | null>(null);
  // C-32: Requisition approval workflow config — chain of tiers (HR → Finance → ...)
  const [reqCfg, setReqCfg] = useState<RequisitionCfg | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [r1, r2, r3, r4] = await Promise.all([
        fetch('/api/recruitment/workflow-config?type=recruitment', { headers }),
        fetch('/api/recruitment/workflow-config?type=preboarding', { headers }),
        fetch('/api/recruitment/workflow-config?type=onboarding', { headers }),
        fetch('/api/recruitment/workflow-config?type=requisition', { headers }),
      ]);
      if (r1.ok) { const j = await r1.json(); setRecCfg(j.effective); setCustomized((p) => ({ ...p, recruitment: !!j.saved })); }
      if (r2.ok) { const j = await r2.json(); setPbCfg(j.effective); setCustomized((p) => ({ ...p, preboarding: !!j.saved })); }
      if (r3.ok) { const j = await r3.json(); setOnbCfg(j.effective); setCustomized((p) => ({ ...p, onboarding: !!j.saved })); }
      if (r4.ok) { const j = await r4.json(); setReqCfg(j.effective); setCustomized((p) => ({ ...p, requisition: !!j.saved })); }
    } catch {
      toast.error('Failed to load workflow configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // approver user options (for specific_user tiers) — employees with linked user accounts
    fetch('/api/employees?limit=500', { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const list = (j?.employees || j?.data || []) as Array<{ userId?: string | null; firstName?: string; lastName?: string; employeeId?: string }>;
        setUsers(list
          .filter((e) => e.userId)
          .map((e) => ({ id: String(e.userId), name: `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Unnamed' })));
      })
      .catch(() => null);
  }, []);

  const save = async (type: WfType) => {
    const cfg = type === 'recruitment' ? recCfg : type === 'preboarding' ? pbCfg : type === 'onboarding' ? onbCfg : type === 'requisition' ? reqCfg : null;
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/recruitment/workflow-config', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ workflowType: type, config: cfg }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Save failed');
      toast.success(`${TABS.find((t) => t.key === type)?.label} saved — applies immediately`);
      setCustomized((p) => ({ ...p, [type]: true }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reset = async (type: WfType) => {
    if (!confirm('Reset this workflow to the system defaults? Your customization will be removed.')) return;
    try {
      const res = await fetch(`/api/recruitment/workflow-config?type=${type}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Reset failed');
      toast.success('Reset to defaults');
      await load();
    } catch {
      toast.error('Reset failed');
    }
  };

  // ─── Interview Panel tab: employee list + interviewer toggle ───
  // Same API as Employees → Settings → Login Credentials, so the flag stays
  // consistent everywhere. Toggling flips User.isInterviewer in both the
  // tenant DB and the platform DB — the flagged user's sidebar immediately
  // shows/hides the "My Interviews" tab.
  const fetchPanel = useCallback(async (search = '') => {
    setPanelLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('limit', '200');
      const sq = scopeQuery();
      const res = await fetch(`/api/employees/credentials?${params.toString()}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPanelEmployees(data.employees || []);
        setPanelTenantId(sq ? new URLSearchParams(sq).get('tenantId') : null);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to load employees');
      }
    } catch {
      toast.error('Network error while loading employees');
    } finally {
      setPanelLoading(false);
    }
  }, [scopeQuery, scopeCompanyId, selectedTenantId]);

  // Fetch when the tab opens and whenever the company/tenant scope changes
  // (super admin switching companies mid-session), mirroring the credentials
  // page's refetch-on-scope-change behaviour.
  useEffect(() => {
    if (activeTab === 'interview-panel') fetchPanel(panelSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, scopeCompanyId, selectedTenantId, fetchPanel]);

  const toggleInterviewer = async (emp: InterviewPanelEmployee) => {
    try {
      const q = panelTenantId ? `?tenantId=${panelTenantId}` : '';
      const res = await fetch(`/api/employees/${emp.id}/interviewer${q}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isInterviewer: !emp.isInterviewer }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.isInterviewer
          ? `${emp.firstName} ${emp.lastName} marked as interviewer — "My Interviews" tab is now visible to them`
          : `${emp.firstName} ${emp.lastName} removed from interviewers — "My Interviews" tab hidden`);
        setPanelEmployees((prev) => prev.map((e) => (e.id === emp.id ? { ...e, isInterviewer: data.isInterviewer } : e)));
      } else {
        toast.error(data.error || 'Failed to update interviewer flag');
      }
    } catch {
      toast.error('Failed to update interviewer flag');
    }
  };

  const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  if (!canManage) {
    return (
      <div className="p-8">
        <div className="thb-card p-6 text-center">
          <FiInfo className="w-8 h-8 mx-auto text-thb-text-muted mb-2" />
          <p className="text-sm text-thb-text-secondary">You do not have permission to manage workflow configuration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/recruitment')} className="mt-1 p-2 rounded-lg hover:bg-slate-100 text-thb-text-secondary" title="Back to Recruitment">
            <FiArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-thb-text-primary">Workflow Configuration</h1>
            <p className="text-xs text-thb-text-secondary mt-0.5">
              Configure the recruitment → preboarding → onboarding lifecycle. Changes apply to your whole tenant immediately.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.filter((t) => t.key !== 'interview-panel' || canAccessEmployeeSettings(user?.role)).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
              activeTab === t.key
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-thb-text-secondary border-thb-border hover:border-teal-400'
            }`}
          >
            {t.label}
            {customized[t.key] && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" title="Customized" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="thb-card p-10 text-center text-sm text-thb-text-muted flex items-center justify-center gap-2">
          <FiLoader className="w-4 h-4 animate-spin" /> Loading configuration…
        </div>
      ) : (
        <>
          {/* ═══════════ RECRUITMENT ═══════════ */}
          {activeTab === 'recruitment' && recCfg && (
            <div className="space-y-4">
              <div className="thb-card p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-thb-text-primary">Application Pipeline Stages</h2>
                  <button onClick={() => reset('recruitment')} className="text-[11px] text-thb-text-muted hover:text-red-500 flex items-center gap-1"><FiRotateCcw className="w-3 h-3" /> Reset</button>
                </div>
                <p className="text-[11px] text-thb-text-muted mb-4">Stage keys are fixed by the system (they map to stored application statuses) — customize labels, order, SLA targets and visibility.</p>
                <div className="space-y-2">
                  {recCfg.stages.map((s, i) => (
                    <div key={s.key} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 ${s.enabled === false ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-thb-border bg-slate-50/60'}`}>
                      <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                      <select
                        value={s.color || 'slate'}
                        onChange={(e) => { const next = [...recCfg.stages]; next[i] = { ...s, color: e.target.value }; setRecCfg({ ...recCfg, stages: next }); }}
                        className="px-2 py-1.5 border border-thb-border rounded-lg text-xs bg-white"
                        title="Stage color"
                      >
                        {STAGE_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLOR_DOT[s.color || 'slate'] }} />
                      <input
                        value={s.label}
                        onChange={(e) => { const next = [...recCfg.stages]; next[i] = { ...s, label: e.target.value }; setRecCfg({ ...recCfg, stages: next }); }}
                        className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white flex-1 min-w-[140px]"
                        placeholder="Stage label"
                      />
                      <span className="text-[10px] text-thb-text-muted font-mono bg-slate-100 px-1.5 py-0.5 rounded">{s.key}</span>
                      <label className="flex items-center gap-1 text-[11px] text-thb-text-secondary">
                        SLA
                        <NumberInput value={s.slaDays ?? null} onChange={(v) => { const next = [...recCfg.stages]; next[i] = { ...s, slaDays: v }; setRecCfg({ ...recCfg, stages: next }); }} min={0} max={365} placeholder="—" className="w-16" /> d
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] text-thb-text-secondary cursor-pointer">
                        <input type="checkbox" checked={s.enabled !== false} onChange={(e) => { const next = [...recCfg.stages]; next[i] = { ...s, enabled: e.target.checked }; setRecCfg({ ...recCfg, stages: next }); }} className="accent-teal-600" />
                        Visible
                      </label>
                      <div className="flex items-center gap-0.5 ml-auto">
                        <button onClick={() => setRecCfg({ ...recCfg, stages: move(recCfg.stages, i, -1) })} className="p-1.5 rounded hover:bg-slate-200 text-thb-text-muted" title="Move up"><FiArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setRecCfg({ ...recCfg, stages: move(recCfg.stages, i, 1) })} className="p-1.5 rounded hover:bg-slate-200 text-thb-text-muted" title="Move down"><FiArrowDown className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Offer approval chain */}
              <div className="thb-card p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-thb-text-primary">Offer Approval Chain</h2>
                  <label className="flex items-center gap-1.5 text-[11px] text-thb-text-secondary cursor-pointer">
                    <input type="checkbox" checked={recCfg.offerApproval.enabled} onChange={(e) => setRecCfg({ ...recCfg, offerApproval: { ...recCfg.offerApproval, enabled: e.target.checked } })} className="accent-teal-600" />
                    Enabled
                  </label>
                </div>
                <p className="text-[11px] text-thb-text-muted mb-4">Offers must be approved tier-by-tier, in order. The offer is only &quot;Approved&quot; after the final tier signs; earlier approvals are recorded and shown as pending.</p>
                {recCfg.offerApproval.enabled && (
                  <div className="space-y-2">
                    {recCfg.offerApproval.tiers.map((t, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-thb-border bg-slate-50/60 px-3 py-2.5">
                        <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                        <select
                          value={t.approverType}
                          onChange={(e) => {
                            const next = [...recCfg.offerApproval.tiers];
                            const type = e.target.value;
                            next[i] = { ...t, approverType: type, approverUserId: type === 'specific_user' ? t.approverUserId : null };
                            setRecCfg({ ...recCfg, offerApproval: { ...recCfg.offerApproval, tiers: next } });
                          }}
                          className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white min-w-[150px]"
                        >
                          {APPROVER_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </select>
                        {t.approverType === 'specific_user' && (
                          <select
                            value={t.approverUserId || ''}
                            onChange={(e) => { const next = [...recCfg.offerApproval.tiers]; next[i] = { ...t, approverUserId: e.target.value || null }; setRecCfg({ ...recCfg, offerApproval: { ...recCfg.offerApproval, tiers: next } }); }}
                            className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white min-w-[160px]"
                          >
                            <option value="">Select user…</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                        )}
                        <input
                          value={t.label || ''}
                          onChange={(e) => { const next = [...recCfg.offerApproval.tiers]; next[i] = { ...t, label: e.target.value }; setRecCfg({ ...recCfg, offerApproval: { ...recCfg.offerApproval, tiers: next } }); }}
                          className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white flex-1 min-w-[120px]"
                          placeholder="Label (e.g. HR Approval)"
                        />
                        <div className="flex items-center gap-0.5 ml-auto">
                          <button onClick={() => setRecCfg({ ...recCfg, offerApproval: { ...recCfg.offerApproval, tiers: move(recCfg.offerApproval.tiers, i, -1) } })} className="p-1.5 rounded hover:bg-slate-200 text-thb-text-muted"><FiArrowUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setRecCfg({ ...recCfg, offerApproval: { ...recCfg.offerApproval, tiers: move(recCfg.offerApproval.tiers, i, 1) } })} className="p-1.5 rounded hover:bg-slate-200 text-thb-text-muted"><FiArrowDown className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setRecCfg({ ...recCfg, offerApproval: { ...recCfg.offerApproval, tiers: recCfg.offerApproval.tiers.filter((_, j) => j !== i) } })} className="p-1.5 rounded hover:bg-red-50 text-red-400"><FiTrash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setRecCfg({ ...recCfg, offerApproval: { ...recCfg.offerApproval, tiers: [...recCfg.offerApproval.tiers, { tier: recCfg.offerApproval.tiers.length + 1, approverType: 'hr_admin', approverUserId: null, label: '' }] } })}
                      className="text-xs text-teal-600 font-semibold flex items-center gap-1 hover:underline"
                    >
                      <FiPlus className="w-3.5 h-3.5" /> Add approval tier
                    </button>
                  </div>
                )}
              </div>

              <SaveBar onSave={() => save('recruitment')} saving={saving} />
            </div>
          )}

          {/* ═══════════ PREBOARDING ═══════════ */}
          {activeTab === 'preboarding' && pbCfg && (
            <div className="space-y-4">
              <div className="thb-card p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-thb-text-primary">Preboarding Stage Machine</h2>
                  <button onClick={() => reset('preboarding')} className="text-[11px] text-thb-text-muted hover:text-red-500 flex items-center gap-1"><FiRotateCcw className="w-3 h-3" /> Reset</button>
                </div>
                <p className="text-[11px] text-thb-text-muted mb-4">Converted candidates start at the first enabled stage after offer acceptance. Disabled stages are hidden and cannot be set. Notified roles are informed when a candidate enters the stage.</p>
                <div className="space-y-2">
                  {pbCfg.stages.map((s, i) => (
                    <div key={s.key} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 ${s.enabled === false ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-thb-border bg-slate-50/60'}`}>
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-[10px] text-thb-text-muted font-mono bg-slate-100 px-1.5 py-0.5 rounded">{s.key}</span>
                      <input
                        value={s.label}
                        onChange={(e) => { const next = [...pbCfg.stages]; next[i] = { ...s, label: e.target.value }; setPbCfg({ ...pbCfg, stages: next }); }}
                        className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white flex-1 min-w-[140px]"
                      />
                      <label className="flex items-center gap-1 text-[11px] text-thb-text-secondary">
                        SLA
                        <NumberInput value={s.slaDays ?? null} onChange={(v) => { const next = [...pbCfg.stages]; next[i] = { ...s, slaDays: v }; setPbCfg({ ...pbCfg, stages: next }); }} min={0} max={365} placeholder="—" className="w-16" /> d
                      </label>
                      <input
                        value={(s.notifyRoles || []).join(', ')}
                        onChange={(e) => { const next = [...pbCfg.stages]; next[i] = { ...s, notifyRoles: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }; setPbCfg({ ...pbCfg, stages: next }); }}
                        className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white min-w-[170px]"
                        placeholder="notify roles (comma separated)"
                      />
                      <label className="flex items-center gap-1.5 text-[11px] text-thb-text-secondary cursor-pointer">
                        <input type="checkbox" checked={s.enabled !== false} onChange={(e) => { const next = [...pbCfg.stages]; next[i] = { ...s, enabled: e.target.checked }; setPbCfg({ ...pbCfg, stages: next }); }} className="accent-emerald-600" />
                        Enabled
                      </label>
                      <div className="flex items-center gap-0.5 ml-auto">
                        <button onClick={() => setPbCfg({ ...pbCfg, stages: move(pbCfg.stages, i, -1) })} className="p-1.5 rounded hover:bg-slate-200 text-thb-text-muted"><FiArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setPbCfg({ ...pbCfg, stages: move(pbCfg.stages, i, 1) })} className="p-1.5 rounded hover:bg-slate-200 text-thb-text-muted"><FiArrowDown className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-thb-border">
                  <label className="flex items-center gap-2 text-xs text-thb-text-secondary cursor-pointer">
                    <input type="checkbox" checked={pbCfg.requireHRVerification !== false} onChange={(e) => setPbCfg({ ...pbCfg, requireHRVerification: e.target.checked })} className="accent-emerald-600" />
                    Require HR verification before joining
                  </label>
                  <label className="flex items-center gap-2 text-xs text-thb-text-secondary cursor-pointer">
                    <input type="checkbox" checked={pbCfg.blockJoiningUntilDocsComplete === true} onChange={(e) => setPbCfg({ ...pbCfg, blockJoiningUntilDocsComplete: e.target.checked })} className="accent-emerald-600" />
                    Block &quot;Joined&quot; until all documents collected
                  </label>
                </div>
              </div>
              <SaveBar onSave={() => save('preboarding')} saving={saving} />
            </div>
          )}

          {/* ═══════════ ONBOARDING ═══════════ */}
          {activeTab === 'onboarding' && onbCfg && (
            <div className="space-y-4">
              <div className="thb-card p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-thb-text-primary">Onboarding Checklist (auto-generated on conversion)</h2>
                  <button onClick={() => reset('onboarding')} className="text-[11px] text-thb-text-muted hover:text-red-500 flex items-center gap-1"><FiRotateCcw className="w-3 h-3" /> Reset</button>
                </div>
                <p className="text-[11px] text-thb-text-muted mb-4">When an accepted offer converts to an employee, these tasks are created with due dates relative to the joining date (negative = before joining). Onboarding task templates (if configured) take precedence.</p>
                <div className="flex flex-wrap gap-4 mb-4">
                  <label className="flex items-center gap-2 text-xs text-thb-text-secondary cursor-pointer">
                    <input type="checkbox" checked={onbCfg.generateFromTemplates !== false} onChange={(e) => setOnbCfg({ ...onbCfg, generateFromTemplates: e.target.checked })} className="accent-teal-600" />
                    Also generate from Onboarding Task Templates
                  </label>
                  <label className="flex items-center gap-2 text-xs text-thb-text-secondary cursor-pointer">
                    <input type="checkbox" checked={onbCfg.buddyEnabled !== false} onChange={(e) => setOnbCfg({ ...onbCfg, buddyEnabled: e.target.checked })} className="accent-teal-600" />
                    Buddy program enabled
                  </label>
                </div>
                <div className="space-y-4">
                  {onbCfg.phases.map((phase, pi) => (
                    <div key={phase.key} className="border border-thb-border rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 border-b border-thb-border">
                        <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">{pi + 1}</span>
                        <input
                          value={phase.label}
                          onChange={(e) => { const next = [...onbCfg.phases]; next[pi] = { ...phase, label: e.target.value }; setOnbCfg({ ...onbCfg, phases: next }); }}
                          className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white flex-1 min-w-[160px] font-semibold"
                          placeholder="Phase label"
                        />
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => setOnbCfg({ ...onbCfg, phases: move(onbCfg.phases, pi, -1) })} className="p-1.5 rounded hover:bg-slate-200 text-thb-text-muted"><FiArrowUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setOnbCfg({ ...onbCfg, phases: move(onbCfg.phases, pi, 1) })} className="p-1.5 rounded hover:bg-slate-200 text-thb-text-muted"><FiArrowDown className="w-3.5 h-3.5" /></button>
                          <button
                            onClick={() => setOnbCfg({ ...onbCfg, phases: onbCfg.phases.filter((_, j) => j !== pi) })}
                            className="p-1.5 rounded hover:bg-red-50 text-red-400"
                            title="Remove phase"
                          ><FiTrash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        {phase.tasks.map((t, ti) => (
                          <div key={ti} className="flex flex-wrap items-center gap-2">
                            <input
                              value={t.task}
                              onChange={(e) => { const phases = [...onbCfg.phases]; const tasks = [...phase.tasks]; tasks[ti] = { ...t, task: e.target.value }; phases[pi] = { ...phase, tasks }; setOnbCfg({ ...onbCfg, phases }); }}
                              className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white flex-1 min-w-[220px]"
                              placeholder="Task description"
                            />
                            <select
                              value={t.category}
                              onChange={(e) => { const phases = [...onbCfg.phases]; const tasks = [...phase.tasks]; tasks[ti] = { ...t, category: e.target.value }; phases[pi] = { ...phase, tasks }; setOnbCfg({ ...onbCfg, phases }); }}
                              className="px-2 py-1.5 border border-thb-border rounded-lg text-xs bg-white"
                            >
                              {ONB_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <label className="flex items-center gap-1 text-[11px] text-thb-text-secondary">
                              Due
                              <NumberInput
                                value={t.dueOffsetDays}
                                onChange={(v) => { const phases = [...onbCfg.phases]; const tasks = [...phase.tasks]; tasks[ti] = { ...t, dueOffsetDays: v ?? 0 }; phases[pi] = { ...phase, tasks }; setOnbCfg({ ...onbCfg, phases }); }}
                                min={-60} max={180} className="w-16"
                              /> d
                            </label>
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => { const phases = [...onbCfg.phases]; phases[pi] = { ...phase, tasks: move(phase.tasks, ti, -1) }; setOnbCfg({ ...onbCfg, phases }); }} className="p-1.5 rounded hover:bg-slate-100 text-thb-text-muted"><FiArrowUp className="w-3.5 h-3.5" /></button>
                              <button onClick={() => { const phases = [...onbCfg.phases]; phases[pi] = { ...phase, tasks: move(phase.tasks, ti, 1) }; setOnbCfg({ ...onbCfg, phases }); }} className="p-1.5 rounded hover:bg-slate-100 text-thb-text-muted"><FiArrowDown className="w-3.5 h-3.5" /></button>
                              <button onClick={() => { const phases = [...onbCfg.phases]; phases[pi] = { ...phase, tasks: phase.tasks.filter((_, j) => j !== ti) }; setOnbCfg({ ...onbCfg, phases }); }} className="p-1.5 rounded hover:bg-red-50 text-red-400"><FiTrash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => { const phases = [...onbCfg.phases]; phases[pi] = { ...phase, tasks: [...phase.tasks, { task: '', category: 'general', dueOffsetDays: 0 }] }; setOnbCfg({ ...onbCfg, phases }); }}
                          className="text-xs text-teal-600 font-semibold flex items-center gap-1 hover:underline"
                        >
                          <FiPlus className="w-3.5 h-3.5" /> Add task
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setOnbCfg({ ...onbCfg, phases: [...onbCfg.phases, { key: `phase_${onbCfg.phases.length + 1}_${Date.now().toString(36)}`, label: `Phase ${onbCfg.phases.length + 1}`, tasks: [] }] })}
                    className="text-xs text-teal-600 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <FiPlus className="w-3.5 h-3.5" /> Add phase
                  </button>
                </div>
              </div>
              <SaveBar onSave={() => save('onboarding')} saving={saving} />
            </div>
          )}

          {/* ═══════════ REQUISITION APPROVAL (C-32) ═══════════ */}
          {activeTab === 'requisition' && reqCfg && (
            <div className="space-y-4">
              <div className="thb-card p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-thb-text-primary">Requisition Approval Chain</h2>
                  <button onClick={() => reset('requisition')} className="text-[11px] text-thb-text-muted hover:text-red-500 flex items-center gap-1"><FiRotateCcw className="w-3 h-3" /> Reset to defaults</button>
                </div>
                <p className="text-[11px] text-thb-text-muted mb-4">
                  Define who approves a requisition and in what order. The Manager submits → Tier 1 approves → Tier 2 approves → … → final tier approves → &quot;Create Job Posting&quot; becomes available.
                  Default is the original hardcoded 2-tier HR → Finance flow. Add or remove tiers, change approver roles, and edit tier labels by your tenant&apos;s needs.
                </p>
                <div className="space-y-2">
                  {reqCfg.tiers.map((t, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-thb-border bg-slate-50/60 px-3 py-2.5">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                      <select
                        value={t.approverType}
                        onChange={(e) => {
                          const next = [...reqCfg.tiers];
                          const type = e.target.value;
                          next[i] = { ...t, approverType: type, approverUserId: type === 'specific_user' ? t.approverUserId : null };
                          setReqCfg({ ...reqCfg, tiers: next });
                        }}
                        className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white min-w-[150px]"
                      >
                        {APPROVER_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select>
                      {t.approverType === 'specific_user' && (
                        <select
                          value={t.approverUserId || ''}
                          onChange={(e) => { const next = [...reqCfg.tiers]; next[i] = { ...t, approverUserId: e.target.value || null }; setReqCfg({ ...reqCfg, tiers: next }); }}
                          className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white min-w-[160px]"
                        >
                          <option value="">Select user…</option>
                          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      )}
                      <input
                        value={t.label || ''}
                        onChange={(e) => { const next = [...reqCfg.tiers]; next[i] = { ...t, label: e.target.value }; setReqCfg({ ...reqCfg, tiers: next }); }}
                        className="px-2.5 py-1.5 border border-thb-border rounded-lg text-xs bg-white flex-1 min-w-[120px]"
                        placeholder="Label (e.g. HR Approval)"
                      />
                      <div className="flex items-center gap-0.5 ml-auto">
                        <button onClick={() => setReqCfg({ ...reqCfg, tiers: move(reqCfg.tiers, i, -1) })} className="p-1.5 rounded hover:bg-slate-200 text-thb-text-muted" title="Move up"><FiArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setReqCfg({ ...reqCfg, tiers: move(reqCfg.tiers, i, 1) })} className="p-1.5 rounded hover:bg-slate-200 text-thb-text-muted" title="Move down"><FiArrowDown className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => setReqCfg({ ...reqCfg, tiers: reqCfg.tiers.filter((_, j) => j !== i) })}
                          className="p-1.5 rounded hover:bg-red-50 text-red-400"
                          title="Remove tier"
                          disabled={reqCfg.tiers.length <= 1}
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setReqCfg({ ...reqCfg, tiers: [...reqCfg.tiers, { tier: reqCfg.tiers.length + 1, approverType: 'hr_admin', approverUserId: null, label: '' }] })}
                    className="text-xs text-emerald-600 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <FiPlus className="w-3.5 h-3.5" /> Add approval tier
                  </button>
                </div>
              </div>

              {/* Skip-Finance-for-low-budget threshold */}
              <div className="thb-card p-5">
                <h2 className="text-sm font-bold text-thb-text-primary mb-1">Skip-Finance-For-Low-Budget Threshold</h2>
                <p className="text-[11px] text-thb-text-muted mb-4">
                  If the requisition&apos;s salary budget is below this amount (in INR), the Finance tier is skipped automatically — HR&apos;s approval alone is enough.
                  Set to <code className="text-[10px] bg-slate-100 px-1 py-0.5 rounded">0</code> or leave blank to always require Finance approval (no skipping).
                </p>
                <div className="flex items-center gap-3">
                  <NumberInput
                    value={reqCfg.skipFinanceBelowBudget ?? null}
                    onChange={(v) => setReqCfg({ ...reqCfg, skipFinanceBelowBudget: v })}
                    min={0}
                    max={99999999}
                    placeholder="e.g. 100000 (₹1 lakh)"
                    className="w-64"
                  />
                  <span className="text-[11px] text-thb-text-muted">INR / year</span>
                </div>
              </div>

              {/* Manager-submit permission */}
              <div className="thb-card p-5">
                <h2 className="text-sm font-bold text-thb-text-primary mb-1">Submit Permission</h2>
                <p className="text-[11px] text-thb-text-muted mb-3">
                  Allow the requester&apos;s reporting manager to also submit the requisition on the requester&apos;s behalf (useful for back-office teams where the requester is a junior employee).
                </p>
                <label className="flex items-center gap-2 text-xs text-thb-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reqCfg.allowManagerSubmit === true}
                    onChange={(e) => setReqCfg({ ...reqCfg, allowManagerSubmit: e.target.checked })}
                    className="accent-emerald-600"
                  />
                  Allow reporting manager to submit on behalf of the requester
                </label>
              </div>

              <SaveBar onSave={() => save('requisition')} saving={saving} />
            </div>
          )}

          {/* ═══════════ INTERVIEW PANEL ═══════════ */}
          {activeTab === 'interview-panel' && canAccessEmployeeSettings(user?.role) && (
            <div className="space-y-4">
              <div className="thb-card p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-thb-text-primary">Interview Panel Members</h2>
                  <span className="text-[11px] text-thb-text-muted">
                    {panelEmployees.filter((e) => e.isInterviewer).length} marked interviewer{panelEmployees.filter((e) => e.isInterviewer).length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-[11px] text-thb-text-muted mb-4">
                  Mark employees as interviewers — they get the <strong>&quot;My Interviews&quot;</strong> tab in the Recruitment module of their sidebar.
                  The flag also turns on automatically when HR schedules them onto an interview panel; this toggle overrides it.
                </p>

                {/* Search */}
                <div className="relative mb-4 max-w-sm">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
                  <input
                    type="text"
                    value={panelSearch}
                    onChange={(e) => { setPanelSearch(e.target.value); fetchPanel(e.target.value); }}
                    placeholder="Search by name, email, ID…"
                    className="w-full pl-9 pr-3 py-2 border border-thb-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                {/* Employee table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-thb-border bg-slate-50/80">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Employee</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Official Email</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Department</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Account Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Interviewer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-thb-border">
                      {panelLoading ? (
                        <tr><td colSpan={5} className="px-4 py-12 text-center"><div className="animate-spin w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full mx-auto" /></td></tr>
                      ) : panelEmployees.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-12 text-center text-thb-text-muted">
                          No employees found{panelSearch ? ` for "${panelSearch}"` : ' — select a company first if you are a super admin'}.
                        </td></tr>
                      ) : panelEmployees.map((emp) => (
                        <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-thb-text-primary">{emp.firstName} {emp.lastName}</p>
                            <p className="text-xs text-thb-text-muted">{emp.employeeId}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-thb-text-secondary">{emp.email}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-thb-text-secondary">{emp.department}</span>
                          </td>
                          <td className="px-4 py-3">
                            {!emp.hasLoginAccount ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                <FiUserX className="w-3 h-3" /> No Account
                              </span>
                            ) : emp.loginStatus === 'active' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <FiUserCheck className="w-3 h-3" /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                                <FiUserX className="w-3 h-3" /> Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {emp.hasLoginAccount ? (
                              <button
                                onClick={() => toggleInterviewer(emp)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                  emp.isInterviewer
                                    ? 'bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100'
                                    : 'bg-slate-50 text-thb-text-muted border-thb-border hover:bg-slate-100'
                                }`}
                                title={emp.isInterviewer ? 'Interviewer ON — they see the "My Interviews" tab. Click to remove.' : 'Interviewer OFF. Click to let them see the "My Interviews" tab.'}
                              >
                                <FiUserCheck className="w-3.5 h-3.5" />
                                {emp.isInterviewer ? 'Interviewer' : 'Not set'}
                              </button>
                            ) : (
                              <span className="text-xs text-thb-text-muted" title="Create login credentials first, then mark them as an interviewer">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-[11px] text-thb-text-muted mt-3 flex items-center gap-1.5">
                  <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  Changes apply immediately — no save needed. The employee&apos;s sidebar updates on their next login/refresh.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SaveBar({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <div className="flex items-center justify-between thb-card p-4">
      <p className="text-[11px] text-thb-text-muted flex items-center gap-1.5">
        <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
        Saved configuration applies immediately — pipeline, preboarding ladder and conversion checklist read it live.
      </p>
      <button
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
      >
        {saving ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
        {saving ? 'Saving…' : 'Save Configuration'}
      </button>
    </div>
  );
}
