'use client';

/**
 * Project Delivery Workflow Configuration (admin).
 * Mirrors /recruitment/workflow-config — dynamic, per-tenant (optionally per-company):
 *   - Intake approval chain + mandatory intake fields
 *   - Stage-gate review chain (e.g. Team Lead → Project Sponsor)
 *   - Workspace automation (chat room + delivery board on approval)
 *   - Closure rules (post-mortem, compliance checklist)
 *
 * Task 152 — PM scope reduction: Capacity & Resource Rules, Timesheets and
 * Sprint defaults were REMOVED from the UI (those modules are no longer part
 * of the slimmed Project Management module). The API still tolerates the
 * legacy keys, so saved configs keep loading without error.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiPlus, FiTrash2, FiSave, FiRotateCcw, FiSettings, FiGitMerge, FiUsers, FiClock, FiCheckCircle, FiLayers } from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Tier { tier: number; approverType: string; approverValue?: string | null; label?: string }
interface WfConfig {
  intake: { requireApproval: boolean; requireBusinessObjective: boolean; requireExecutiveSponsor: boolean; requireTargetCompletionDate: boolean; chain: Tier[] };
  stageGates: { enabled: boolean; chain: Tier[] };
  capacity: { overAllocationThresholdPct: number; includeSoftAllocations: boolean; backupHandoffEnabled: boolean; backupHandoffLeaveDays: number };
  workspace: { autoCreateChatRoom: boolean; autoCreateKanbanBoard: boolean; seedBoardFromTasks: boolean; notifyOnApproval: boolean };
  timesheets: { approvalMode: string; enforceWaterfallPhaseGating: boolean; autoPrepopulateSprint: boolean };
  closure: { requirePostMortem: boolean; requireAllMilestonesApproved: boolean; complianceChecklist: string[] };
  sprints: { defaultDurationDays: number };
}

const APPROVER_TYPES: { value: string; label: string }[] = [
  { value: 'reporting_manager', label: 'Project Manager' },
  { value: 'department_head', label: 'Department Head' },
  { value: 'project_sponsor', label: 'Project Sponsor' },
  { value: 'hr_admin', label: 'HR Admin' },
  { value: 'tenant_admin', label: 'Tenant Admin' },
  { value: 'specific_employee', label: 'Specific Employee' },
];

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 py-2 cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative mt-0.5 w-9 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}
        aria-pressed={value}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
      </button>
      <span>
        <span className="block text-xs font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

function TierEditor({ title, icon, chain, setChain, employees }: {
  title: string; icon: React.ReactNode;
  chain: Tier[]; setChain: (t: Tier[]) => void;
  employees: Array<{ id: string; name: string }>;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const next = [...chain];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setChain(next.map((t, idx) => ({ ...t, tier: idx + 1 })));
  };
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700">{icon}{title}</div>
      {chain.length === 0 && <p className="text-xs text-slate-400 py-2">No tiers — any admin can approve.</p>}
      <div className="space-y-2">
        {chain.map((t, i) => (
          <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
            <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-[10px] flex items-center justify-center font-bold">{t.tier}</span>
            <select
              value={t.approverType}
              onChange={(e) => {
                const next = [...chain];
                next[i] = { ...t, approverType: e.target.value, approverValue: e.target.value === 'specific_employee' ? t.approverValue : undefined };
                setChain(next);
              }}
              className="text-xs border border-slate-200 rounded-md px-2 py-1.5 flex-1"
            >
              {APPROVER_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            {(t.approverType === 'specific_employee' || t.approverType === 'project_sponsor') && (
              <select
                value={t.approverValue || ''}
                onChange={(e) => { const next = [...chain]; next[i] = { ...t, approverValue: e.target.value || undefined }; setChain(next); }}
                className="text-xs border border-slate-200 rounded-md px-2 py-1.5 flex-1"
              >
                <option value="">Select employee…</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            )}
            <input
              value={t.label || ''} placeholder="Label (e.g. Team Lead Review)"
              onChange={(e) => { const next = [...chain]; next[i] = { ...t, label: e.target.value }; setChain(next); }}
              className="text-xs border border-slate-200 rounded-md px-2 py-1.5 flex-1"
            />
            <button type="button" onClick={() => move(i, -1)} className="text-slate-400 hover:text-slate-700 text-xs px-1" title="Move up">▲</button>
            <button type="button" onClick={() => move(i, 1)} className="text-slate-400 hover:text-slate-700 text-xs px-1" title="Move down">▼</button>
            <button type="button" onClick={() => setChain(chain.filter((_, idx) => idx !== i).map((t2, idx) => ({ ...t2, tier: idx + 1 })))} className="text-red-400 hover:text-red-600 p-1"><FiTrash2 size={13} /></button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setChain([...chain, { tier: chain.length + 1, approverType: 'reporting_manager', label: '' }])}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700"
      >
        <FiPlus size={13} /> Add tier
      </button>
    </div>
  );
}

export default function ProjectWorkflowConfigPage() {
  const { user } = useAuthStore();
  const canManage = ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(user?.role || '');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<WfConfig | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [wfRes, compRes] = await Promise.all([
        fetch(`/api/projects/workflow-config${companyId ? `?companyId=${companyId}` : ''}`, { headers }),
        fetch('/api/companies?limit=100', { headers }),
      ]);
      if (wfRes.ok) {
        const j = await wfRes.json();
        setCfg(j.config);
        setSaved((j.rows || []).some((r: any) => (!companyId ? r.companyId === null : r.companyId === companyId)));
      } else {
        toast.error('Failed to load workflow configuration');
      }
      if (compRes.ok) {
        const j = await compRes.json();
        const list = (j.companies || j.data || []).map((c: any) => ({ id: c.id, name: c.name }));
        setCompanies(list);
      }
      const empRes = await fetch('/api/employees?limit=500', { headers }).catch(() => null);
      if (empRes?.ok) {
        const j = await empRes.json();
        const list = (j.employees || j.data || []).map((e: any) => ({ id: e.id, name: `${e.firstName || ''} ${e.lastName || ''}`.trim() }));
        setEmployees(list);
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/projects/workflow-config', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ companyId: companyId || null, config: cfg }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Save failed'); return; }
      toast.success('Project delivery workflow saved');
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm('Reset this workflow configuration to system defaults?')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/workflow-config${companyId ? `?companyId=${companyId}` : ''}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (res.ok) { toast.success('Reset to defaults'); await load(); } else toast.error('Reset failed');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-sm text-slate-400 animate-pulse">Loading workflow configuration…</div>;
  if (!cfg) return <div className="p-8 text-sm text-red-500">Configuration unavailable.</div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FiGitMerge className="text-fuchsia-600" /> Project Delivery Workflow</h1>
          <p className="text-xs text-slate-500 mt-1">Dynamic configuration for intake approvals, stage gates, workspace automation and closure — applies to every project in this scope.</p>
        </div>
        <div className="flex items-center gap-2">
          {companies.length > 0 && (
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
              <option value="">Tenant-wide (all companies)</option>
              {companies.map((c) => <option key={c.id} value={c.id}>Company: {c.name}</option>)}
            </select>
          )}
          {canManage && (
            <>
              <button onClick={reset} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><FiRotateCcw /> Reset</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"><FiSave /> {saving ? 'Saving…' : 'Save'}</button>
            </>
          )}
        </div>
      </header>

      {saved && <div className="text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 inline-flex items-center gap-1.5"><FiCheckCircle /> Custom configuration active for this scope.</div>}

      <section className="grid md:grid-cols-2 gap-4">
        <div className="border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2"><FiLayers /> 1. Project Initiation &amp; Intake</h2>
          <p className="text-[11px] text-slate-400 mb-2">Standardizes how projects enter the HRMS: title, business objective, executive sponsor, target completion date.</p>
          <Toggle label="Require intake approval" hint="Route submissions through the approval chain; on final approval the workspace is auto-created." value={cfg.intake.requireApproval} onChange={(v) => setCfg({ ...cfg, intake: { ...cfg.intake, requireApproval: v } })} />
          <Toggle label="Business objective required" value={cfg.intake.requireBusinessObjective} onChange={(v) => setCfg({ ...cfg, intake: { ...cfg.intake, requireBusinessObjective: v } })} />
          <Toggle label="Executive sponsor required" value={cfg.intake.requireExecutiveSponsor} onChange={(v) => setCfg({ ...cfg, intake: { ...cfg.intake, requireExecutiveSponsor: v } })} />
          <Toggle label="Target completion date required" value={cfg.intake.requireTargetCompletionDate} onChange={(v) => setCfg({ ...cfg, intake: { ...cfg.intake, requireTargetCompletionDate: v } })} />
          <div className="mt-3">
            <TierEditor title="Intake approval chain" icon={<FiUsers className="text-slate-400" />} chain={cfg.intake.chain} setChain={(chain) => setCfg({ ...cfg, intake: { ...cfg.intake, chain } })} employees={employees} />
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2"><FiGitMerge /> 2. Stage Gate Review</h2>
          <p className="text-[11px] text-slate-400 mb-2">Route completed deliverables through a predefined approval chain (e.g. Team Lead → Project Sponsor).</p>
          <Toggle label="Stage-gate reviews enabled" value={cfg.stageGates.enabled} onChange={(v) => setCfg({ ...cfg, stageGates: { ...cfg.stageGates, enabled: v } })} />
          <div className="mt-3">
            <TierEditor title="Gate approval chain" icon={<FiUsers className="text-slate-400" />} chain={cfg.stageGates.chain} setChain={(chain) => setCfg({ ...cfg, stageGates: { ...cfg.stageGates, chain } })} employees={employees} />
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2"><FiSettings /> 3. Automated Workspace</h2>
          <p className="text-[11px] text-slate-400 mb-2">On intake approval, the system centralizes the project and notifies assigned members.</p>
          <Toggle label="Auto-create collaboration chat room" value={cfg.workspace.autoCreateChatRoom} onChange={(v) => setCfg({ ...cfg, workspace: { ...cfg.workspace, autoCreateChatRoom: v } })} />
          <Toggle label="Auto-create kanban delivery board" hint="Seeded from project tasks; two-way linked with the Collaboration module board." value={cfg.workspace.autoCreateKanbanBoard} onChange={(v) => setCfg({ ...cfg, workspace: { ...cfg.workspace, autoCreateKanbanBoard: v } })} />
          <Toggle label="Seed board from existing project tasks" value={cfg.workspace.seedBoardFromTasks} onChange={(v) => setCfg({ ...cfg, workspace: { ...cfg.workspace, seedBoardFromTasks: v } })} />
          <Toggle label="Notify team members on approval" value={cfg.workspace.notifyOnApproval} onChange={(v) => setCfg({ ...cfg, workspace: { ...cfg.workspace, notifyOnApproval: v } })} />
        </div>

        <div className="border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2"><FiCheckCircle /> 4. Closure &amp; Compliance</h2>
          <Toggle label="Post-mortem reviews required before sign-off" value={cfg.closure.requirePostMortem} onChange={(v) => setCfg({ ...cfg, closure: { ...cfg.closure, requirePostMortem: v } })} />
          <Toggle label="All milestones must be approved before closure" value={cfg.closure.requireAllMilestonesApproved} onChange={(v) => setCfg({ ...cfg, closure: { ...cfg.closure, requireAllMilestonesApproved: v } })} />
          <label className="text-xs text-slate-600 block mt-2">Compliance &amp; policy checklist
            <textarea
              value={(cfg.closure.complianceChecklist || []).join('\n')}
              onChange={(e) => setCfg({ ...cfg, closure: { ...cfg.closure, complianceChecklist: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } })}
              rows={3}
              placeholder="One item per line"
              className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
            <span className="text-[10px] text-slate-400">Must be confirmed at project sign-off.</span>
          </label>
        </div>
      </section>
    </div>
  );
}
