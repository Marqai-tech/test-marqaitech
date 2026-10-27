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
  FiRotateCcw, FiCheckCircle, FiLoader,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

type WfType = 'recruitment' | 'preboarding' | 'onboarding';

const TABS: { key: WfType; label: string; hint: string }[] = [
  { key: 'recruitment', label: 'Recruitment Pipeline', hint: 'Application stages & offer approval chain' },
  { key: 'preboarding', label: 'Preboarding Stages', hint: 'Offer acceptance → Day 1 stage machine' },
  { key: 'onboarding', label: 'Onboarding Checklist', hint: 'Tasks auto-generated when a candidate converts' },
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

export default function WorkflowConfigPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const canManage = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(user?.role || '');

  const [activeTab, setActiveTab] = useState<WfType>('recruitment');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customized, setCustomized] = useState<Record<string, boolean>>({});

  const [recCfg, setRecCfg] = useState<RecruitmentCfg | null>(null);
  const [pbCfg, setPbCfg] = useState<PreboardingCfg | null>(null);
  const [onbCfg, setOnbCfg] = useState<OnboardingCfg | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/recruitment/workflow-config?type=recruitment', { headers }),
        fetch('/api/recruitment/workflow-config?type=preboarding', { headers }),
        fetch('/api/recruitment/workflow-config?type=onboarding', { headers }),
      ]);
      if (r1.ok) { const j = await r1.json(); setRecCfg(j.effective); setCustomized((p) => ({ ...p, recruitment: !!j.saved })); }
      if (r2.ok) { const j = await r2.json(); setPbCfg(j.effective); setCustomized((p) => ({ ...p, preboarding: !!j.saved })); }
      if (r3.ok) { const j = await r3.json(); setOnbCfg(j.effective); setCustomized((p) => ({ ...p, onboarding: !!j.saved })); }
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
    const cfg = type === 'recruitment' ? recCfg : type === 'preboarding' ? pbCfg : onbCfg;
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
        {TABS.map((t) => (
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
