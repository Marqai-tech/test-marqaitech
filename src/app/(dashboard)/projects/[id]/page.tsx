'use client';

/**
 * Project Delivery Workspace — the dynamic workflow hub for one project.
 * Tabs: Overview (intake) · Planning (phases/milestones + stage gates) ·
 *       Resources (matchmaking + soft/hard allocation) · Board (task kanban,
 *       two-way synced with the Collaboration kanban) · Sprints (agile) ·
 *       Times (team time log) · Approvals (gate chains) · Integrations (Jira /
 *       Azure DevOps) · Activity (live feed) · Closure (readiness + post-mortem + sign-off)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import {
  FiBriefcase, FiLayers, FiUsers, FiGrid, FiZap, FiClock, FiCheckCircle,
  FiLink2, FiActivity, FiFlag, FiPlus, FiTrash2, FiRefreshCw, FiPlay,
  FiSend, FiCheck, FiX, FiChevronRight, FiTarget, FiAlertTriangle,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const TABS = [
  { key: 'overview', label: 'Overview & Intake', icon: FiBriefcase },
  { key: 'planning', label: 'Planning & Phases', icon: FiLayers },
  { key: 'resources', label: 'Resources', icon: FiUsers },
  { key: 'board', label: 'Delivery Board', icon: FiGrid },
  { key: 'sprints', label: 'Sprints', icon: FiZap },
  { key: 'times', label: 'Time Log', icon: FiClock },
  { key: 'approvals', label: 'Approvals', icon: FiCheckCircle },
  { key: 'integrations', label: 'Integrations', icon: FiLink2 },
  { key: 'activity', label: 'Activity', icon: FiActivity },
  { key: 'closure', label: 'Closure', icon: FiFlag },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600', active: 'bg-emerald-50 text-emerald-700',
  on_hold: 'bg-amber-50 text-amber-700', completed: 'bg-sky-50 text-sky-700',
  cancelled: 'bg-red-50 text-red-600', submitted: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-red-50 text-red-600',
};

// ─── shared small UI ──────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300';

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600', emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-600',
    sky: 'bg-sky-50 text-sky-700', violet: 'bg-violet-50 text-violet-700',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${tones[tone] || tones.slate}`}>{children}</span>;
}

// ─── main page ────────────────────────────────────────────────────

export default function ProjectWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();

  const [tab, setTab] = useState<TabKey>((searchParams.get('tab') as TabKey) || 'overview');
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);

  // overview / intake
  const [intakeForm, setIntakeForm] = useState<any>({});
  const [intakeMeta, setIntakeMeta] = useState<any>({ canDecide: false, steps: [] });

  // planning
  const [milestones, setMilestones] = useState<any[]>([]);
  const [msForm, setMsForm] = useState<any>({ name: '', plannedDate: '', sequence: '', budgetCap: '', isPhase: true });
  const [gates, setGates] = useState<any[]>([]);

  // resources
  const [requirements, setRequirements] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [reqForm, setReqForm] = useState<any>({ title: '', count: 1, skills: '', minLevel: 'intermediate', estimatedHours: '', allocationPct: 100, startDate: '', endDate: '', priority: 'medium' });
  const [candidates, setCandidates] = useState<any[]>([]);
  const [employeeList, setEmployeeList] = useState<any[]>([]);

  // board
  const [tasks, setTasks] = useState<any[]>([]);
  const [sprints, setSprints] = useState<any[]>([]);
  const [taskForm, setTaskForm] = useState<any>({ open: false, name: '', priority: 'medium', assignedToId: '', sprintId: '', storyPoints: '', plannedEnd: '', dependsOnId: '', estimatedHours: '', description: '' });

  // sprints tab
  const [sprintForm, setSprintForm] = useState<any>({ name: '', goal: '', startDate: '', endDate: '' });
  const [sprintMetrics, setSprintMetrics] = useState<any>({});

  // times
  const [timesheets, setTimesheets] = useState<any[]>([]);

  // integrations
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [integForm, setIntegForm] = useState<any>({ provider: 'jira', baseUrl: '', projectKey: '', username: '', token: '' });
  const [syncing, setSyncing] = useState(false);

  // activity
  const [activities, setActivities] = useState<any[]>([]);
  const [activityPost, setActivityPost] = useState('');

  // closure
  const [closureData, setClosureData] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewDraft, setReviewDraft] = useState<Record<string, any>>({});
  const [signOffNotes, setSignOffNotes] = useState('');

  const isAdmin = ['tenant_admin', 'super_admin', 'admin'].includes(user?.role || '');

  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`, { headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Failed to load project'); return; }
      setProject(j.project);
      setIntakeForm({
        methodology: j.project.methodology || 'waterfall',
        businessObjective: j.project.businessObjective || '',
        executiveSponsor: j.project.executiveSponsor || '',
        targetCompletionDate: j.project.targetCompletionDate ? String(j.project.targetCompletionDate).slice(0, 10) : '',
        costCenter: j.project.costCenter || '',
        travelBudgetRequired: !!j.project.travelBudgetRequired,
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadTab = useCallback(async (t: TabKey) => {
    const headers = getAuthHeaders();
    try {
      if (t === 'overview') {
        const res = await fetch(`/api/projects/${id}/intake`, { headers });
        if (res.ok) {
          const j = await res.json();
          setIntakeMeta(j);
          if (j.myEmployeeId) setMyEmployeeId(j.myEmployeeId);
        }
      } else if (t === 'planning') {
        const [msRes, gateRes] = await Promise.all([
          fetch(`/api/projects/${id}`, { headers }),
          fetch(`/api/projects/${id}/stage-gate`, { headers }),
        ]);
        if (msRes.ok) { const j = await msRes.json(); setMilestones(j.project?.milestones || []); }
        if (gateRes.ok) setGates((await gateRes.json()).steps || []);
      } else if (t === 'resources') {
        const [rrRes, empRes] = await Promise.all([
          fetch(`/api/projects/${id}/resource-requests`, { headers }),
          fetch('/api/employees?limit=500', { headers }).catch(() => null),
        ]);
        if (rrRes.ok) { const j = await rrRes.json(); setRequirements(j.requirements || []); setAllocations(j.allocations || []); }
        if (empRes?.ok) { const j = await empRes.json(); setEmployeeList(j.employees || j.data || []); }
      } else if (t === 'board' || t === 'sprints') {
        const [taskRes, sprintRes] = await Promise.all([
          fetch(`/api/projects/${id}/tasks?limit=200`, { headers }),
          fetch(`/api/projects/${id}/sprints`, { headers }),
        ]);
        if (taskRes.ok) setTasks((await taskRes.json()).tasks || []);
        if (sprintRes.ok) { const j = await sprintRes.json(); setSprints(j.sprints || []); setSprintMetrics(j.metrics || {}); }
      } else if (t === 'times') {
        const res = await fetch(`/api/timesheets?projectId=${id}&limit=50`, { headers });
        if (res.ok) setTimesheets((await res.json()).timesheets || []);
      } else if (t === 'approvals') {
        const [gateRes, intakeRes] = await Promise.all([
          fetch(`/api/projects/${id}/stage-gate`, { headers }),
          fetch(`/api/projects/${id}/intake`, { headers }),
        ]);
        if (gateRes.ok) setGates((await gateRes.json()).steps || []);
        if (intakeRes.ok) setIntakeMeta(await intakeRes.json());
      } else if (t === 'integrations') {
        const res = await fetch(`/api/projects/${id}/integrations`, { headers });
        if (res.ok) setIntegrations((await res.json()).integrations || []);
      } else if (t === 'activity') {
        const res = await fetch(`/api/projects/${id}/activity?limit=80`, { headers });
        if (res.ok) setActivities((await res.json()).activities || []);
      } else if (t === 'closure') {
        const [clRes, revRes] = await Promise.all([
          fetch(`/api/projects/${id}/closure`, { headers }),
          fetch(`/api/projects/${id}/reviews`, { headers }),
        ]);
        if (clRes.ok) setClosureData(await clRes.json());
        if (revRes.ok) { const j = await revRes.json(); setReviews(j.reviews || []); setReviewDraft((prev) => (Object.keys(prev).length ? prev : {})); }
      }
    } catch {
      toast.error('Failed to load tab data');
    }
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);
  useEffect(() => {
    if (!project) return;
    loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, project?.id]);

  const refreshAll = async () => { await loadProject(); await loadTab(tab); };

  if (loading && !project) return <div className="p-10 text-sm text-slate-400 animate-pulse">Loading project workspace…</div>;
  if (!project) return <div className="p-10 text-sm text-red-500">Project not found or access denied.</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* header */}
      <header className="mb-4">
        <button onClick={() => router.push('/projects')} className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1 mb-2"><FiChevronRight className="rotate-180" /> All projects</button>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              {project.name}
              <Badge tone={project.status === 'active' ? 'emerald' : project.status === 'completed' ? 'sky' : 'slate'}>{project.status}</Badge>
              {project.methodology && <Badge tone={project.methodology === 'agile' ? 'violet' : 'slate'}>{project.methodology === 'agile' ? 'Agile / Scrum' : 'Waterfall'}</Badge>}
              {project.intakeStatus && <Badge tone={project.intakeStatus === 'approved' ? 'emerald' : project.intakeStatus === 'rejected' ? 'red' : 'amber'}>intake: {project.intakeStatus}</Badge>}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {project.company?.name} · {project.projectType} · {project.startDate ? String(project.startDate).slice(0, 10) : '—'}{project.targetCompletionDate ? ` → ${String(project.targetCompletionDate).slice(0, 10)}` : ''} · {project.progress}% complete
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {project.workspaceRoomId && <span className="inline-flex items-center gap-1 text-sky-600"><FiActivity size={12} /> Chat room linked</span>}
            {project.workspaceBoardId && <span className="inline-flex items-center gap-1 text-violet-600"><FiGrid size={12} /> Delivery board linked</span>}
          </div>
        </div>
      </header>

      {/* tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-5 pb-px">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors ${
                tab === t.key ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </nav>

      {/* ── OVERVIEW & INTAKE ── */}
      {tab === 'overview' && (
        <OverviewTab
          project={project} intakeForm={intakeForm} setIntakeForm={setIntakeForm}
          intakeMeta={intakeMeta} isAdmin={isAdmin} myEmployeeId={myEmployeeId}
          employees={employeeList}
          onReload={refreshAll}
        />
      )}

      {tab === 'planning' && (
        <PlanningTab
          project={project} milestones={milestones} msForm={msForm} setMsForm={setMsForm}
          gates={gates} onReload={refreshAll}
        />
      )}

      {tab === 'resources' && (
        <ResourcesTab
          project={project} requirements={requirements} allocations={allocations}
          reqForm={reqForm} setReqForm={setReqForm} candidates={candidates}
          setCandidates={setCandidates} employeeList={employeeList} onReload={refreshAll}
        />
      )}

      {tab === 'board' && (
        <BoardTab
          project={project} tasks={tasks} sprints={sprints} taskForm={taskForm} setTaskForm={setTaskForm}
          employeeList={employeeList} isAdmin={isAdmin} onReload={refreshAll}
        />
      )}

      {tab === 'sprints' && (
        <SprintsTab
          project={project} sprints={sprints} metrics={sprintMetrics} sprintForm={sprintForm}
          setSprintForm={setSprintForm} tasks={tasks} onReload={refreshAll}
        />
      )}

      {tab === 'times' && <TimesTab timesheets={timesheets} />}

      {tab === 'approvals' && (
        <ApprovalsTab project={project} gates={gates} intakeMeta={intakeMeta} onReload={refreshAll} />
      )}

      {tab === 'integrations' && (
        <IntegrationsTab
          project={project} integrations={integrations} integForm={integForm} setIntegForm={setIntegForm}
          syncing={syncing} setSyncing={setSyncing} isAdmin={isAdmin} onReload={() => loadTab('integrations')}
        />
      )}

      {tab === 'activity' && (
        <ActivityTab activities={activities} post={activityPost} setPost={setActivityPost} onReload={() => loadTab('activity')} projectId={id} />
      )}

      {tab === 'closure' && (
        <ClosureTab
          project={project} closureData={closureData} reviews={reviews} reviewDraft={reviewDraft}
          setReviewDraft={setReviewDraft} allocations={allocations} signOffNotes={signOffNotes}
          setSignOffNotes={setSignOffNotes} isAdmin={isAdmin} onReload={refreshAll} projectId={id}
        />
      )}
    </div>
  );
}

// ─── Overview & Intake tab ────────────────────────────────────────

function OverviewTab({ project, intakeForm, setIntakeForm, intakeMeta, isAdmin, myEmployeeId, employees, onReload }: any) {
  const [busy, setBusy] = useState(false);
  const steps: any[] = (intakeMeta?.intake?.approvalSteps || intakeMeta?.steps || []).filter((s: any) => s.gateType === 'intake');

  const submitIntake = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/intake`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(intakeForm) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Submission failed'); return; }
      toast.success('Intake submitted for approval');
      await onReload();
    } finally { setBusy(false); }
  };

  const decide = async (action: 'approve' | 'reject') => {
    const comments = action === 'reject' ? (prompt('Rejection reason:') || '') : (prompt('Comments (optional):') || '');
    if (action === 'reject' && !comments) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/intake`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ action, comments }) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Action failed'); return; }
      toast.success(action === 'approve' ? (j.intakeStatus === 'approved' ? 'Project approved — workspace created!' : `Approved — advanced to tier ${j.advancedTo}`) : 'Intake rejected');
      await onReload();
    } finally { setBusy(false); }
  };

  const isFinalApprover = intakeMeta?.canDecide;

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-3 border border-slate-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Project Initiation &amp; Intake</h2>
        <p className="text-[11px] text-slate-400 -mt-1">Standardizes how this project entered the HRMS: business objective, executive sponsor, target completion date and delivery methodology.</p>
        {project.intakeStatus === 'approved' || project.intakeStatus === 'rejected' ? (
          <div className={`rounded-lg p-3 text-xs ${project.intakeStatus === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            Intake {project.intakeStatus}{project.approvedAt ? ` · ${String(project.approvedAt).slice(0, 10)}` : ''}. {project.intakeStatus === 'approved' && 'Workspace automation has run: chat room + delivery board created and members notified.'}
          </div>
        ) : null}
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Delivery methodology (mandatory)">
            <select value={intakeForm.methodology} onChange={(e) => setIntakeForm({ ...intakeForm, methodology: e.target.value })} className={inputCls} disabled={project.intakeStatus === 'approved'}>
              <option value="agile">Agile / Scrum — sprints, story points, velocity</option>
              <option value="waterfall">Waterfall — sequential phases, fixed milestones</option>
            </select>
          </Field>
          <Field label="Executive sponsor">
            <select value={intakeForm.executiveSponsor || ''} onChange={(e) => setIntakeForm({ ...intakeForm, executiveSponsor: e.target.value })} className={inputCls} disabled={project.intakeStatus === 'approved'}>
              <option value="">— Select sponsor —</option>
              {(employees || []).map((e: any) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Business objective">
          <textarea rows={2} value={intakeForm.businessObjective} onChange={(e) => setIntakeForm({ ...intakeForm, businessObjective: e.target.value })} className={inputCls} disabled={project.intakeStatus === 'approved'} placeholder="What business outcome does this project deliver?" />
        </Field>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Target completion date">
            <input type="date" value={intakeForm.targetCompletionDate || ''} onChange={(e) => setIntakeForm({ ...intakeForm, targetCompletionDate: e.target.value })} className={inputCls} disabled={project.intakeStatus === 'approved'} />
          </Field>
          <Field label="Cost center / internal code">
            <input value={intakeForm.costCenter || ''} onChange={(e) => setIntakeForm({ ...intakeForm, costCenter: e.target.value })} className={inputCls} placeholder="e.g. CC-ENG-2026" disabled={project.intakeStatus === 'approved'} />
          </Field>
          <Field label="Travel / contractor budget">
            <label className="flex items-center gap-2 mt-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={!!intakeForm.travelBudgetRequired} disabled={project.intakeStatus === 'approved'} onChange={(e) => setIntakeForm({ ...intakeForm, travelBudgetRequired: e.target.checked })} className="rounded" />
              Link to travel desk / expense budget
            </label>
          </Field>
        </div>
        {project.intakeStatus !== 'approved' && (
          <div className="flex items-center gap-2 pt-1">
            <button onClick={submitIntake} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              <FiSend size={12} /> {project.intakeStatus === 'submitted' ? 'Re-submit' : 'Submit for approval'}
            </button>
            {isFinalApprover && project.intakeStatus === 'submitted' && (
              <>
                <button onClick={() => decide('approve')} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900"><FiCheck /> Approve</button>
                <button onClick={() => decide('reject')} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><FiX /> Reject</button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Intake approval chain</h3>
          {steps.length === 0 && <p className="text-xs text-slate-400">No approval chain yet — submit the intake form to route it.</p>}
          <ol className="space-y-2">
            {steps.map((s: any) => (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold">{s.level}</span>
                <span className="flex-1">
                  <span className="block font-medium text-slate-700">{s.name}</span>
                  <span className="text-[10px] text-slate-400">{s.approverType.replace(/_/g, ' ')}</span>
                </span>
                <Badge tone={s.status === 'approved' ? 'emerald' : s.status === 'rejected' ? 'red' : s.status === 'pending' ? 'amber' : 'slate'}>{s.status}</Badge>
              </li>
            ))}
          </ol>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Automated trigger status</h3>
          <ul className="text-xs space-y-1.5 text-slate-600">
            <li className="flex items-center gap-2">{project.workspaceRoomId ? <FiCheck className="text-emerald-500" /> : <FiClock className="text-slate-300" />} Collaboration chat room {project.workspaceRoomId ? 'created' : '(created on approval)'}</li>
            <li className="flex items-center gap-2">{project.workspaceBoardId ? <FiCheck className="text-emerald-500" /> : <FiClock className="text-slate-300" />} Kanban delivery board {project.workspaceBoardId ? 'created & seeded' : '(created on approval)'}</li>
            <li className="flex items-center gap-2"><FiTarget className="text-slate-300" /> Members notified automatically on approval</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Planning & Phases tab ────────────────────────────────────────

function PlanningTab({ project, milestones, msForm, setMsForm, gates, onReload }: any) {
  const [busy, setBusy] = useState(false);
  const stageGates = gates.filter((g: any) => g.gateType === 'stage_gate');

  const addMilestone = async () => {
    if (!msForm.name || !msForm.plannedDate) { toast.error('Name and planned date are required'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/milestones`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          name: msForm.name, plannedDate: msForm.plannedDate,
          sequence: msForm.sequence ? Number(msForm.sequence) : undefined,
          isPhase: !!msForm.isPhase,
          budgetCap: msForm.budgetCap ? Number(msForm.budgetCap) : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Failed to add milestone'); return; }
      toast.success('Milestone / phase added');
      setMsForm({ name: '', plannedDate: '', sequence: '', budgetCap: '', isPhase: msForm.isPhase });
      await onReload();
    } finally { setBusy(false); }
  };

  const submitGate = async (m: any) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/stage-gate`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ entityType: 'milestone', entityId: m.id, name: m.name }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Gate submission failed'); return; }
      toast.success(`Routed through ${j.steps?.length || 0} approval tier(s)`);
      await onReload();
    } finally { setBusy(false); }
  };

  const isWaterfall = project.methodology !== 'agile';

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">{isWaterfall ? 'Sequential Phases & Milestones' : 'Milestones'}</h2>
        <p className="text-[11px] text-slate-400 mb-3">{isWaterfall ? 'Waterfall phases with rigid target dates, sequence order and budget caps. Deliverables route through the stage-gate chain.' : 'Time-bound milestones. Use Sprints for the working cadence.'}</p>
        {milestones.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No milestones yet — add the first one below.</p>}
        <div className="space-y-2">
          {[...milestones].sort((a: any, b: any) => (a.sequence ?? 99) - (b.sequence ?? 99)).map((m: any) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 border border-slate-100 rounded-lg p-2.5 bg-slate-50/50">
              <span className="w-7 h-7 rounded-lg bg-fuchsia-100 text-fuchsia-700 flex items-center justify-center text-[11px] font-bold">{m.sequence ?? m.name.slice(0, 1)}</span>
              <div className="flex-1 min-w-[140px]">
                <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5">{m.name} {m.isPhase && <Badge tone="violet">Phase {m.sequence}</Badge>}</p>
                <p className="text-[10px] text-slate-400">
                  Target {String(m.plannedDate).slice(0, 10)}
                  {m.budgetCap ? ` · Budget cap ${m.budgetCap.toLocaleString()}` : ''}
                  {m.actualDate ? ` · Completed ${String(m.actualDate).slice(0, 10)}` : ''}
                </p>
              </div>
              <Badge tone={m.approvalStatus === 'approved' ? 'emerald' : m.approvalStatus === 'rejected' ? 'red' : 'amber'}>{m.approvalStatus}</Badge>
              {m.approvalStatus !== 'approved' && (
                <button onClick={() => submitGate(m)} disabled={busy} className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-white"><FiCheckCircle size={11} /> Stage gate</button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-dashed border-slate-200 pt-3">
          <p className="text-[11px] font-semibold text-slate-500 mb-2">Add milestone / phase</p>
          <div className="grid md:grid-cols-5 gap-2">
            <input placeholder="Name (e.g. Development)" value={msForm.name} onChange={(e) => setMsForm({ ...msForm, name: e.target.value })} className={`${inputCls} md:col-span-2`} />
            <input type="date" value={msForm.plannedDate} onChange={(e) => setMsForm({ ...msForm, plannedDate: e.target.value })} className={inputCls} />
            <input type="number" placeholder="Seq" value={msForm.sequence} onChange={(e) => setMsForm({ ...msForm, sequence: e.target.value })} className={inputCls} min={1} />
            <input type="number" placeholder="Budget cap" value={msForm.budgetCap} onChange={(e) => setMsForm({ ...msForm, budgetCap: e.target.value })} className={inputCls} min={0} />
          </div>
          <label className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
            <input type="checkbox" checked={!!msForm.isPhase} onChange={(e) => setMsForm({ ...msForm, isPhase: e.target.checked })} className="rounded" />
            This is a sequential phase (gates time-logging for later phases)
          </label>
          <button onClick={addMilestone} disabled={busy} className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50"><FiPlus size={12} /> Add</button>
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Stage-gate reviews</h3>
        {stageGates.length === 0 && <p className="text-xs text-slate-400">No stage-gate submissions yet. Submit a phase/deliverable for the Team Lead → Sponsor chain.</p>}
        <div className="space-y-2">
          {stageGates.map((g: any) => (
            <div key={g.id} className="text-xs border border-slate-100 rounded-lg p-2">
              <p className="font-medium text-slate-700">Tier {g.level}: {g.name}</p>
              <p className="text-[10px] text-slate-400">{g.entityType} · {g.approverType.replace(/_/g, ' ')}</p>
              <div className="mt-1"><Badge tone={g.status === 'approved' ? 'emerald' : g.status === 'rejected' ? 'red' : 'amber'}>{g.status}</Badge></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Resources tab (matchmaking + soft allocation) ────────────────

function ResourcesTab({ project, requirements, allocations, reqForm, setReqForm, candidates, setCandidates, employeeList, onReload }: any) {
  const [busy, setBusy] = useState(false);

  const submitRequest = async () => {
    if (!reqForm.title) { toast.error('Role title is required (e.g. "Senior Developer")'); return; }
    const requiredSkills = String(reqForm.skills || '').split(',').map((s: string) => s.trim()).filter(Boolean).map((s: string) => ({ skill: s, level: reqForm.minLevel }));
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/resource-requests`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          title: reqForm.title, count: Number(reqForm.count) || 1, requiredSkills,
          estimatedHours: Number(reqForm.estimatedHours) || 0, allocationPct: Number(reqForm.allocationPct) || 100,
          startDate: reqForm.startDate || undefined, endDate: reqForm.endDate || undefined, priority: reqForm.priority,
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Failed'); return; }
      setCandidates(j.candidates || []);
      toast.success(`${j.candidates?.length || 0} candidate(s) matched from live employee profiles`);
      await onReload();
    } finally { setBusy(false); }
  };

  const act = async (requirementId: string, action: string, employeeId?: string) => {
    setBusy(true);
    try {
      const req = requirements.find((r: any) => r.id === requirementId);
      const res = await fetch(`/api/projects/${project.id}/resource-requests`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({
          requirementId, action, employeeId,
          allocationPct: req?.allocationPct, startDate: req?.startDate, endDate: req?.endDate,
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Failed'); return; }
      toast.success(action === 'soft_reserve' ? 'Employee soft-reserved (bench) — availability blocked' : action === 'allocate' ? 'Employee allocated & notified' : 'Done');
      await onReload();
    } finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="space-y-5">
        <div className="border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Resource Request &amp; Matchmaking</h2>
          <p className="text-[11px] text-slate-400 mb-3">Define the roles you need (e.g. 2 Senior Devs) — the engine filters live employee profiles by skills + availability window.</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Role title"><input value={reqForm.title} onChange={(e) => setReqForm({ ...reqForm, title: e.target.value })} className={inputCls} placeholder="Senior Developer" /></Field>
            <Field label="Headcount"><input type="number" min={1} value={reqForm.count} onChange={(e) => setReqForm({ ...reqForm, count: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="Required skills (comma-separated)">
            <input value={reqForm.skills} onChange={(e) => setReqForm({ ...reqForm, skills: e.target.value })} className={inputCls} placeholder="React, Node.js, PostgreSQL" />
          </Field>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Field label="Min level">
              <select value={reqForm.minLevel} onChange={(e) => setReqForm({ ...reqForm, minLevel: e.target.value })} className={inputCls}>
                <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option><option value="expert">Expert</option>
              </select>
            </Field>
            <Field label="Allocation %"><input type="number" min={5} max={100} value={reqForm.allocationPct} onChange={(e) => setReqForm({ ...reqForm, allocationPct: e.target.value })} className={inputCls} /></Field>
            <Field label="Priority">
              <select value={reqForm.priority} onChange={(e) => setReqForm({ ...reqForm, priority: e.target.value })} className={inputCls}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Field label="Needed from"><input type="date" value={reqForm.startDate} onChange={(e) => setReqForm({ ...reqForm, startDate: e.target.value })} className={inputCls} /></Field>
            <Field label="Until"><input type="date" value={reqForm.endDate} onChange={(e) => setReqForm({ ...reqForm, endDate: e.target.value })} className={inputCls} /></Field>
          </div>
          <button onClick={submitRequest} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"><FiTarget size={12} /> Run matchmaking</button>
        </div>

        <div className="border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Open role requirements ({requirements.filter((r: any) => r.status !== 'cancelled').length})</h3>
          {requirements.length === 0 && <p className="text-xs text-slate-400">No resource requests yet.</p>}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {requirements.map((r: any) => (
              <div key={r.id} className="border border-slate-100 rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-slate-700 flex-1">{r.count} × {r.title}</p>
                  <Badge tone={r.status === 'filled' ? 'emerald' : r.status === 'soft_reserved' ? 'amber' : r.status === 'cancelled' ? 'red' : 'sky'}>{r.status.replace(/_/g, ' ')}</Badge>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {(r.requiredSkillsParsed || []).map((s: any) => s.skill).join(', ') || 'No skills specified'} · {r.allocationPct || 100}% · {r.priority}
                </p>
                <div className="flex gap-1.5 mt-1.5">
                  {(r.matchedEmployeesParsed || []).slice(0, 3).map((c: any) => (
                    <span key={c.employeeId} className="text-[10px] bg-slate-100 rounded-full px-2 py-0.5 text-slate-600">{c.name} · {c.score}</span>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-2">
                  {(r.matchedEmployeesParsed || []).slice(0, 2).map((c: any) => (
                    <button key={c.employeeId} onClick={() => act(r.id, 'soft_reserve', c.employeeId)} disabled={busy} className="text-[10px] px-2 py-1 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50">Soft-reserve {c.name.split(' ')[0]}</button>
                  ))}
                  {(r.matchedEmployeesParsed || []).slice(0, 1).map((c: any) => (
                    <button key={c.employeeId} onClick={() => act(r.id, 'allocate', c.employeeId)} disabled={busy} className="text-[10px] px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">Allocate best match</button>
                  ))}
                  <button onClick={() => act(r.id, 'rematch')} disabled={busy} className="text-[10px] px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 inline-flex items-center gap-1"><FiRefreshCw size={9} /> Rematch</button>
                  <button onClick={() => act(r.id, 'cancel')} disabled={busy} className="text-[10px] px-2 py-1 rounded-md border border-red-100 text-red-500 hover:bg-red-50">Cancel</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Matched candidates {candidates.length > 0 && `(${candidates.length})`}</h3>
          {candidates.length === 0 && <p className="text-xs text-slate-400">Run matchmaking on a role requirement to see scored candidates with availability.</p>}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {candidates.map((c: any) => (
              <div key={c.employeeId} className="border border-slate-100 rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-slate-700 flex-1">{c.name} <span className="text-[10px] text-slate-400">{c.designation || ''}</span></p>
                  <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${c.score >= 70 ? 'bg-emerald-50 text-emerald-700' : c.score >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{c.score}</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">{c.availabilityNote}</p>
                {c.matchedSkills?.length > 0 && (
                  <p className="text-[10px] text-slate-400 mt-0.5">Skills: {c.matchedSkills.map((m: any) => `${m.skill} (${m.level})`).join(', ')}{c.missingSkills?.length ? ` · missing: ${c.missingSkills.join(', ')}` : ''}</p>
                )}
                <div className="flex gap-1.5 mt-1.5">
                  <button onClick={() => {
                    const req = requirements.find((r: any) => r.status !== 'cancelled');
                    if (req) act(req.id, 'soft_reserve', c.employeeId);
                    else toast.error('Create a role requirement first');
                  }} disabled={busy} className="text-[10px] px-2 py-1 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50">Soft-reserve</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Team allocations ({allocations.length})</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {allocations.length === 0 && <p className="text-xs text-slate-400">No allocations yet.</p>}
            {allocations.map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 text-xs border border-slate-100 rounded-lg p-2">
                <div className="flex-1">
                  <p className="font-medium text-slate-700">{a.employee?.firstName} {a.employee?.lastName} <span className="text-[10px] text-slate-400">{a.role || ''}</span></p>
                  <p className="text-[10px] text-slate-400">{a.allocationPct}% · {a.billingStatus} · from {String(a.startDate).slice(0, 10)}</p>
                </div>
                {a.status === 'soft' && <Badge tone="amber">soft (bench)</Badge>}
                {a.status === 'active' && <Badge tone="emerald">active</Badge>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delivery Board tab (task kanban with persistence + kanban link) ──

const BOARD_COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];

function BoardTab({ project, tasks, sprints, taskForm, setTaskForm, employeeList, isAdmin, onReload }: any) {
  const [busy, setBusy] = useState(false);
  const [dragTask, setDragTask] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);

  const openEdit = (t: any) => {
    setEditing({
      id: t.id, name: t.name, priority: t.priority, assignedToId: t.assignedToId || '',
      sprintId: t.sprintId || '', storyPoints: t.storyPoints ?? '', plannedEnd: t.plannedEnd ? String(t.plannedEnd).slice(0, 10) : '',
      dependsOnId: t.dependsOnId || '', estimatedHours: t.estimatedHours ?? '', description: t.description || '',
    });
  };

  const createTask = async () => {
    if (!taskForm.name) { toast.error('Task name is required'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          name: taskForm.name, priority: taskForm.priority, assignedToId: taskForm.assignedToId || undefined,
          sprintId: taskForm.sprintId || undefined, storyPoints: taskForm.storyPoints ? Number(taskForm.storyPoints) : undefined,
          plannedEnd: taskForm.plannedEnd || undefined, dependsOnId: taskForm.dependsOnId || undefined,
          estimatedHours: taskForm.estimatedHours ? Number(taskForm.estimatedHours) : undefined,
          description: taskForm.description || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Create failed'); return; }
      toast.success('Task created');
      setTaskForm({ open: false, name: '', priority: 'medium', assignedToId: '', sprintId: '', storyPoints: '', plannedEnd: '', dependsOnId: '', estimatedHours: '', description: '' });
      await onReload();
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${editing.id}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({
          name: editing.name, priority: editing.priority, assignedToId: editing.assignedToId || null,
          sprintId: editing.sprintId || null, storyPoints: editing.storyPoints === '' ? null : Number(editing.storyPoints),
          plannedEnd: editing.plannedEnd || null, dependsOnId: editing.dependsOnId || null,
          estimatedHours: editing.estimatedHours ? Number(editing.estimatedHours) : undefined,
          description: editing.description || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Update failed'); return; }
      toast.success('Task updated — collaboration board card synced');
      setEditing(null);
      await onReload();
    } finally { setBusy(false); }
  };

  const moveTask = async (taskId: string, status: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${taskId}`, {
        method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Move blocked'); return; }
      await onReload();
    } finally { setBusy(false); }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks/${taskId}`, { method: 'DELETE', headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Delete failed'); return; }
      toast.success(j.message || 'Task deleted');
      await onReload();
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-slate-400">Drag cards between columns — status changes persist here AND sync to the linked Collaboration kanban board.</p>
        <button onClick={() => setTaskForm({ ...taskForm, open: !taskForm.open })} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900"><FiPlus size={12} /> New task</button>
      </div>

      {taskForm.open && (
        <div className="border border-slate-200 rounded-xl p-4 mb-4 bg-slate-50/60 grid md:grid-cols-4 gap-2">
          <input placeholder="Task / user story name" value={taskForm.name} onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })} className={`${inputCls} md:col-span-2`} />
          <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className={inputCls}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
          </select>
          <select value={taskForm.assignedToId} onChange={(e) => setTaskForm({ ...taskForm, assignedToId: e.target.value })} className={inputCls}>
            <option value="">Assign to…</option>
            {employeeList.map((e: any) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </select>
          {project.methodology === 'agile' && (
            <>
              <select value={taskForm.sprintId} onChange={(e) => setTaskForm({ ...taskForm, sprintId: e.target.value })} className={inputCls}>
                <option value="">Sprint…</option>
                {sprints.map((s: any) => <option key={s.id} value={s.id}>Sprint {s.sprintNumber}: {s.name}</option>)}
              </select>
              <input type="number" placeholder="Story points" value={taskForm.storyPoints} onChange={(e) => setTaskForm({ ...taskForm, storyPoints: e.target.value })} className={inputCls} min={0} />
            </>
          )}
          <input type="date" value={taskForm.plannedEnd} onChange={(e) => setTaskForm({ ...taskForm, plannedEnd: e.target.value })} className={inputCls} title="Hard deadline" />
          <select value={taskForm.dependsOnId} onChange={(e) => setTaskForm({ ...taskForm, dependsOnId: e.target.value })} className={inputCls}>
            <option value="">Depends on… (finish-to-start)</option>
            {tasks.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input type="number" placeholder="Estimated hours" value={taskForm.estimatedHours} onChange={(e) => setTaskForm({ ...taskForm, estimatedHours: e.target.value })} className={inputCls} min={0} />
          <input placeholder="Notes / acceptance criteria" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} className={`${inputCls} md:col-span-3`} />
          <button onClick={createTask} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Create task</button>
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-3">
        {BOARD_COLUMNS.map((col) => {
          const colTasks = tasks.filter((t: any) => t.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragTask) { moveTask(dragTask, col.key); setDragTask(null); } }}
              className="bg-slate-50 rounded-xl p-2.5 min-h-[200px]"
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{col.label}</p>
                <span className="text-[10px] bg-white border border-slate-200 rounded-full px-1.5">{colTasks.length}</span>
              </div>
              <div className="space-y-2">
                {colTasks.map((t: any) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => setDragTask(t.id)}
                    className="bg-white border border-slate-200 rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-medium text-slate-700 leading-snug">{t.name}</p>
                      <div className="flex shrink-0 gap-0.5">
                        <button onClick={() => openEdit(t)} className="text-slate-300 hover:text-slate-600 p-0.5" title="Edit"><FiRefreshCw size={10} /></button>
                        {isAdmin && <button onClick={() => deleteTask(t.id)} className="text-slate-300 hover:text-red-500 p-0.5" title="Delete"><FiTrash2 size={10} /></button>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <Badge tone={t.priority === 'critical' ? 'red' : t.priority === 'high' ? 'amber' : 'slate'}>{t.priority}</Badge>
                      {t.storyPoints != null && <Badge tone="violet">{t.storyPoints} pts</Badge>}
                      {t.sprint && <Badge tone="sky">S{t.sprint.sprintNumber}</Badge>}
                      {t.dependsOn && <Badge tone={t.dependsOn.status === 'done' ? 'emerald' : 'amber'}>⛓ {t.dependsOn.name.slice(0, 14)}{t.dependsOn.status !== 'done' ? ' (gate)' : ''}</Badge>}
                    </div>
                    {t.assignedTo && (
                      <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full bg-fuchsia-100 text-fuchsia-700 inline-flex items-center justify-center text-[8px] font-bold">{(t.assignedTo.firstName || '?').slice(0, 1)}</span>
                        {t.assignedTo.firstName} {t.assignedTo.lastName}
                      </p>
                    )}
                  </div>
                ))}
                {colTasks.length === 0 && <p className="text-[10px] text-slate-300 text-center py-4">Drop here</p>}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800">Edit task</h3>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} placeholder="Task name" />
            <div className="grid grid-cols-2 gap-2">
              <select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })} className={inputCls}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
              <select value={editing.assignedToId} onChange={(e) => setEditing({ ...editing, assignedToId: e.target.value })} className={inputCls}>
                <option value="">Unassigned</option>
                {employeeList.map((e: any) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
              {project.methodology === 'agile' && (
                <>
                  <select value={editing.sprintId} onChange={(e) => setEditing({ ...editing, sprintId: e.target.value })} className={inputCls}>
                    <option value="">No sprint (backlog)</option>
                    {sprints.map((s: any) => <option key={s.id} value={s.id}>Sprint {s.sprintNumber}: {s.name}</option>)}
                  </select>
                  <input type="number" placeholder="Story points" value={editing.storyPoints} onChange={(e) => setEditing({ ...editing, storyPoints: e.target.value })} className={inputCls} />
                </>
              )}
              <input type="date" value={editing.plannedEnd} onChange={(e) => setEditing({ ...editing, plannedEnd: e.target.value })} className={inputCls} />
              <select value={editing.dependsOnId} onChange={(e) => setEditing({ ...editing, dependsOnId: e.target.value })} className={inputCls}>
                <option value="">No dependency</option>
                {tasks.filter((t: any) => t.id !== editing.id).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={inputCls} placeholder="Description" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">Cancel</button>
              <button onClick={saveEdit} disabled={busy} className="text-xs px-4 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sprints tab (agile) ──────────────────────────────────────────

function SprintsTab({ project, sprints, metrics, sprintForm, setSprintForm, tasks, onReload }: any) {
  const [busy, setBusy] = useState(false);

  if (project.methodology && project.methodology !== 'agile') {
    return (
      <div className="border border-amber-100 bg-amber-50 rounded-xl p-6 text-center">
        <FiZap className="mx-auto text-amber-400 mb-2" size={22} />
        <p className="text-sm font-medium text-amber-700">This project uses the Waterfall delivery framework</p>
        <p className="text-xs text-amber-600 mt-1">Sprints are available for Agile/Scrum projects. Use Planning &amp; Phases for the sequential phase timeline instead.</p>
      </div>
    );
  }

  const create = async () => {
    if (!sprintForm.name || !sprintForm.startDate || !sprintForm.endDate) { toast.error('Name, start and end dates are required'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/sprints`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(sprintForm) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Create failed'); return; }
      toast.success('Sprint created');
      setSprintForm({ name: '', goal: '', startDate: '', endDate: '' });
      await onReload();
    } finally { setBusy(false); }
  };

  const act = async (sprintId: string, action: string) => {
    setBusy(true);
    try {
      const moveIncomplete = action === 'complete' ? (confirm('Move incomplete stories to the NEXT sprint? (Cancel = return to backlog)') ? 'next' : 'backlog') : undefined;
      const res = await fetch(`/api/projects/${project.id}/sprints/${sprintId}`, {
        method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ action, moveIncomplete }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Action failed'); return; }
      toast.success(action === 'complete' ? `Sprint closed — velocity ${j.completedPoints}/${j.committedPoints} pts` : 'Sprint started — pod capacity locked');
      await onReload();
    } finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Badge tone="violet">Avg velocity: {metrics.avgVelocity ?? '—'} pts</Badge>
          <Badge tone={metrics.sayDoRatio != null && metrics.sayDoRatio >= 80 ? 'emerald' : 'amber'}>Say-do ratio: {metrics.sayDoRatio != null ? `${metrics.sayDoRatio}%` : '—'}</Badge>
          <span className="text-[11px] text-slate-400">{metrics.completedSprints || 0} completed sprint(s)</span>
        </div>
        {sprints.length === 0 && <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">No sprints yet — create the first one.</p>}
        {sprints.map((s: any) => (
          <div key={s.id} className="border border-slate-200 rounded-xl p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center text-[11px] font-bold">S{s.sprintNumber}</span>
              <div className="flex-1 min-w-[140px]">
                <p className="text-xs font-semibold text-slate-700">{s.name}</p>
                <p className="text-[10px] text-slate-400">{String(s.startDate).slice(0, 10)} → {String(s.endDate).slice(0, 10)}{s.goal ? ` · ${s.goal}` : ''}</p>
              </div>
              <Badge tone={s.status === 'active' ? 'emerald' : s.status === 'completed' ? 'sky' : 'slate'}>{s.status}</Badge>
              {s.status === 'planned' && <button onClick={() => act(s.id, 'start')} disabled={busy} className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"><FiPlay size={10} /> Start</button>}
              {s.status === 'active' && <button onClick={() => act(s.id, 'complete')} disabled={busy} className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 text-white hover:bg-slate-900"><FiCheckCircle size={10} /> Complete</button>}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
              <span>{s.committedPoints} committed</span>
              <span className="text-emerald-600">{s.completedPoints} delivered</span>
              <span className="text-slate-300">|</span>
              <span>{s.tasksByStatus?.todo || 0} todo · {s.tasksByStatus?.in_progress || 0} active · {s.tasksByStatus?.review || 0} review · {s.tasksByStatus?.done || 0} done</span>
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.committedPoints ? Math.min(100, (s.completedPoints / s.committedPoints) * 100) : 0}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border border-slate-200 rounded-xl p-4 h-fit">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">New sprint</h3>
        <div className="space-y-2">
          <input placeholder="Sprint name (e.g. Sprint 3 — Payments)" value={sprintForm.name} onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })} className={inputCls} />
          <input placeholder="Sprint goal" value={sprintForm.goal} onChange={(e) => setSprintForm({ ...sprintForm, goal: e.target.value })} className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={sprintForm.startDate} onChange={(e) => setSprintForm({ ...sprintForm, startDate: e.target.value })} className={inputCls} />
            <input type="date" value={sprintForm.endDate} onChange={(e) => setSprintForm({ ...sprintForm, endDate: e.target.value })} className={inputCls} />
          </div>
          <button onClick={create} disabled={busy} className="w-full text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Create sprint</button>
          <p className="text-[10px] text-slate-400">Only one sprint can be active at a time — starting a sprint locks pod capacity. Leave requests auto-recalculate velocity and notify the project manager.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Time Log tab ─────────────────────────────────────────────────

function TimesTab({ timesheets }: any) {
  const total = timesheets.reduce((s: number, t: any) => s + (t.hours || 0), 0);
  const billable = timesheets.filter((t: any) => t.projectTask?.status !== 'done' || true).reduce((s: number, t: any) => s + (t.hours || 0), 0);
  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Team time log</h2>
        <Badge tone="sky">{total}h logged</Badge>
      </div>
      {timesheets.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No time logged yet. Team members log hours from the Timesheets module (pre-filled with their active sprint and assigned stories).</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Member</th><th className="py-2 pr-3">Task</th><th className="py-2 pr-3">Hours</th><th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {timesheets.slice(0, 30).map((t: any) => (
              <tr key={t.id} className="border-b border-slate-50">
                <td className="py-2 pr-3 text-slate-600">{String(t.date).slice(0, 10)}</td>
                <td className="py-2 pr-3 text-slate-700">{t.employee?.firstName} {t.employee?.lastName}</td>
                <td className="py-2 pr-3 text-slate-500">{t.projectTask?.name || t.taskText || '—'}</td>
                <td className="py-2 pr-3 font-medium text-slate-700">{t.hours}h</td>
                <td className="py-2 pr-3"><Badge tone={t.status === 'approved' ? 'emerald' : t.status === 'rejected' ? 'red' : 'amber'}>{t.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Approvals tab ────────────────────────────────────────────────

function ApprovalsTab({ project, gates, intakeMeta, onReload }: any) {
  const [busy, setBusy] = useState(false);
  const pending = gates.filter((g: any) => g.status === 'pending');

  const decide = async (stepId: string, action: 'approve' | 'reject') => {
    const comments = action === 'reject' ? (prompt('Rejection reason:') || '') : (prompt('Comments (optional):') || '');
    if (action === 'reject' && !comments) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/stage-gate`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ stepId, action, comments }) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Action failed'); return; }
      toast.success(action === 'approve' ? (j.chainComplete ? 'Gate chain complete!' : `Approved — next tier ${j.advancedTo}`) : 'Gate rejected');
      await onReload();
    } finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Pending my action ({pending.filter((g: any) => g.canDecide).length})</h2>
        <p className="text-[11px] text-slate-400 mb-3">Stage gates route deliverables through the configured chain (e.g. Team Lead → Project Sponsor).</p>
        {gates.length === 0 && <p className="text-xs text-slate-400">No stage-gate steps yet.</p>}
        <div className="space-y-2">
          {gates.map((g: any) => (
            <div key={g.id} className={`border rounded-lg p-2.5 ${g.canDecide ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-[10px] flex items-center justify-center font-bold">{g.level}</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-slate-700">{g.name}</p>
                  <p className="text-[10px] text-slate-400">{g.gateType} · {g.entityType} · {g.approverType.replace(/_/g, ' ')}</p>
                </div>
                <Badge tone={g.status === 'approved' ? 'emerald' : g.status === 'rejected' ? 'red' : g.status === 'pending' ? 'amber' : 'slate'}>{g.status}</Badge>
              </div>
              {g.canDecide && (
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => decide(g.id, 'approve')} disabled={busy} className="text-[10px] px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">Approve</button>
                  <button onClick={() => decide(g.id, 'reject')} disabled={busy} className="text-[10px] px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50">Reject</button>
                </div>
              )}
              {g.comments && <p className="text-[10px] text-slate-400 mt-1">"{g.comments}"</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Intake status</h2>
        <p className="text-xs text-slate-600">Project intake: <Badge tone={project.intakeStatus === 'approved' ? 'emerald' : 'amber'}>{project.intakeStatus || 'draft (legacy)'}</Badge></p>
        <p className="text-[11px] text-slate-400 mt-2">Compliance &amp; policy sign-off is enforced at closure — see the Closure tab for the checklist and final sign-off.</p>
      </div>
    </div>
  );
}

// ─── Integrations tab (Jira / Azure DevOps) ───────────────────────

function IntegrationsTab({ project, integrations, integForm, setIntegForm, syncing, setSyncing, isAdmin, onReload }: any) {
  const connect = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/integrations`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(integForm) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Connection failed'); return; }
      toast.success('Integration connected — credentials verified & token encrypted');
      setIntegForm({ provider: 'jira', baseUrl: '', projectKey: '', username: '', token: '' });
      await onReload();
    } finally { setSyncing(false); }
  };

  const runSync = async (integrationId: string, action: string) => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/integrations`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ integrationId, action }) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Sync failed'); return; }
      toast.success(`Sync done — ${j.imported || 0} imported, ${j.pushed || 0} pushed, ${j.statusSynced || 0} status updates${j.errors?.length ? `, ${j.errors.length} errors` : ''}`);
      await onReload();
    } finally { setSyncing(false); }
  };

  const remove = async (integrationId: string) => {
    if (!confirm('Remove this integration?')) return;
    const res = await fetch(`/api/projects/${project.id}/integrations?integrationId=${integrationId}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (res.ok) { toast.success('Integration removed'); await onReload(); } else toast.error('Remove failed');
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Connect a delivery tool</h2>
        <p className="text-[11px] text-slate-400 mb-3">Two-way sync with Jira or Azure DevOps: import issues as tasks, push local tasks out, and keep statuses aligned. Tokens are stored AES-256-GCM encrypted.</p>
        {integrations.length > 0 && (
          <div className="space-y-2 mb-4">
            {integrations.map((i: any) => (
              <div key={i.id} className="border border-slate-100 rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700 flex-1">{i.provider === 'jira' ? 'Jira' : 'Azure DevOps'} · {i.projectKey || i.baseUrl}</span>
                  <Badge tone={i.status === 'connected' ? 'emerald' : i.status === 'error' ? 'red' : 'slate'}>{i.status}</Badge>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{i.lastSyncResult || 'Never synced'}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button onClick={() => runSync(i.id, 'import')} disabled={syncing} className="text-[10px] px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">Import issues</button>
                  <button onClick={() => runSync(i.id, 'push')} disabled={syncing} className="text-[10px] px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">Push tasks</button>
                  <button onClick={() => runSync(i.id, 'sync_status')} disabled={syncing} className="text-[10px] px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">Sync statuses</button>
                  {isAdmin && <button onClick={() => remove(i.id)} className="text-[10px] px-2 py-1 rounded-md border border-red-100 text-red-500 hover:bg-red-50">Remove</button>}
                </div>
              </div>
            ))}
          </div>
        )}
        {isAdmin ? (
          <div className="space-y-2 border-t border-dashed border-slate-200 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Provider">
                <select value={integForm.provider} onChange={(e) => setIntegForm({ ...integForm, provider: e.target.value })} className={inputCls}>
                  <option value="jira">Jira (Cloud)</option>
                  <option value="azure_devops">Azure DevOps</option>
                </select>
              </Field>
              <Field label="Base URL">
                <input value={integForm.baseUrl} onChange={(e) => setIntegForm({ ...integForm, baseUrl: e.target.value })} className={inputCls} placeholder={integForm.provider === 'jira' ? 'https://myco.atlassian.net' : 'https://dev.azure.com/myco'} />
              </Field>
              <Field label={integForm.provider === 'jira' ? 'Project key (e.g. ENG)' : 'Project name'}>
                <input value={integForm.projectKey} onChange={(e) => setIntegForm({ ...integForm, projectKey: e.target.value })} className={inputCls} />
              </Field>
              {integForm.provider === 'jira' && (
                <Field label="Account email">
                  <input value={integForm.username} onChange={(e) => setIntegForm({ ...integForm, username: e.target.value })} className={inputCls} placeholder="bot@myco.com" />
                </Field>
              )}
            </div>
            <Field label={integForm.provider === 'jira' ? 'API token' : 'Personal access token (PAT)'}>
              <input type="password" value={integForm.token} onChange={(e) => setIntegForm({ ...integForm, token: e.target.value })} className={inputCls} placeholder="Stored encrypted" />
            </Field>
            <button onClick={connect} disabled={syncing} className="text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{syncing ? 'Testing…' : 'Test & connect'}</button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Only administrators can add integrations.</p>
        )}
      </div>
      <div className="border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">How sync works</h3>
        <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
          <li><b>Import</b> — pulls the latest issues from the external project and creates any that are not yet mapped as HRMS tasks (prefixed with the external key).</li>
          <li><b>Push</b> — creates external issues for HRMS tasks that have not been pushed yet.</li>
          <li><b>Sync statuses</b> — for mapped tasks, advances the external issue through matching transitions (To Do → In Progress → Done).</li>
          <li>The underlying time records stay uniform (Employee · Project · Task · Date · Hours · Billable) regardless of source, feeding payroll and client invoicing cleanly.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Activity tab (collaboration feed) ────────────────────────────

function ActivityTab({ activities, post, setPost, onReload, projectId }: any) {
  const [busy, setBusy] = useState(false);

  const postUpdate = async () => {
    if (!post.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/activity`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ message: post, type: 'comment' }) });
      if (!res.ok) { toast.error('Failed to post'); return; }
      setPost('');
      toast.success('Status update posted to the project feed');
      await onReload();
    } finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 border border-slate-200 rounded-xl p-4">
        <div className="flex gap-2 mb-4">
          <input
            value={post} onChange={(e) => setPost(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') postUpdate(); }}
            placeholder="Share a status update or note with the team…"
            className={inputCls}
          />
          <button onClick={postUpdate} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shrink-0">Post</button>
        </div>
        {activities.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No activity yet.</p>}
        <div className="space-y-2.5 max-h-[520px] overflow-y-auto">
          {activities.map((a: any) => (
            <div key={a.id} className="flex gap-2.5">
              <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                {a.employee ? `${a.employee.firstName?.slice(0, 1) || ''}${a.employee.lastName?.slice(0, 1) || ''}` : <FiActivity size={11} />}
              </span>
              <div className="flex-1 border-b border-slate-50 pb-2">
                <p className="text-xs text-slate-700">{a.message}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : 'System'} · {new Date(a.createdAt).toLocaleString()} · {a.type.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="border border-slate-200 rounded-xl p-4 h-fit">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Feed types</h3>
        <ul className="text-[11px] text-slate-500 space-y-1.5">
          <li><Badge tone="sky">task_update</Badge> assignments, moves, dependencies</li>
          <li><Badge tone="amber">approval</Badge> intake + stage-gate decisions</li>
          <li><Badge tone="emerald">workspace</Badge> auto-created rooms &amp; boards</li>
          <li><Badge tone="violet">allocation</Badge> resource requests &amp; bookings</li>
          <li><Badge tone="red">capacity</Badge> over-allocation &amp; backup hand-offs</li>
          <li><Badge>timesheet</Badge> hours logged against tasks</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Closure tab ──────────────────────────────────────────────────

function ClosureTab({ project, closureData, reviews, reviewDraft, setReviewDraft, allocations, signOffNotes, setSignOffNotes, isAdmin, onReload, projectId }: any) {
  const [busy, setBusy] = useState(false);
  const readiness = closureData?.readiness;
  const checks = closureData?.checks || [];
  const pendingMembers = (allocations || []).filter((a: any) => !reviews.some((r: any) => r.employeeId === a.employeeId));

  const setDraft = (empId: string, patch: any) => setReviewDraft({ ...reviewDraft, [empId]: { ...(reviewDraft[empId] || {}), ...patch } });

  const saveReviews = async () => {
    const rows = Object.entries(reviewDraft).map(([employeeId, r]: any) => ({ employeeId, ...r }));
    if (rows.length === 0) { toast.error('Rate at least one team member'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/reviews`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ reviews: rows }) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Failed to save reviews'); return; }
      toast.success(`Post-mortem reviews saved for ${rows.length} member(s) — metrics feed the appraisal module`);
      await onReload();
    } finally { setBusy(false); }
  };

  const signOff = async () => {
    if (!confirm('Formally sign off and close this project? Allocations end and documentation is archived.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/closure`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ signOffNotes, complianceConfirmed: true }) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Sign-off failed'); return; }
      toast.success('Project signed off and closed');
      await onReload();
    } finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="space-y-5">
        <div className="border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Closure readiness</h2>
          {!readiness && <p className="text-xs text-slate-400">Loading readiness…</p>}
          {readiness && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-base font-bold text-slate-800">{readiness.totalHours}h</p><p className="text-[10px] text-slate-400">logged</p></div>
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-base font-bold text-slate-800">{readiness.milestoneVariance.onTimePct != null ? `${readiness.milestoneVariance.onTimePct}%` : '—'}</p><p className="text-[10px] text-slate-400">milestones on time</p></div>
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-base font-bold text-slate-800">{readiness.budgetVariancePct != null ? `${readiness.budgetVariancePct > 0 ? '+' : ''}${readiness.budgetVariancePct}%` : '—'}</p><p className="text-[10px] text-slate-400">budget variance</p></div>
              </div>
              <ul className="space-y-1.5">
                {checks.map((c: any) => (
                  <li key={c.key} className="flex items-center gap-2 text-xs">
                    {c.ok ? <FiCheck className="text-emerald-500 shrink-0" /> : <FiAlertTriangle className="text-amber-400 shrink-0" />}
                    <span className="text-slate-600">{c.label}</span>
                  </li>
                ))}
              </ul>
              {readiness.overdueTasks > 0 && <p className="text-[11px] text-amber-600 mt-2">{readiness.overdueTasks} overdue task(s) will be closed as-is.</p>}
            </>
          )}
        </div>

        {project.status !== 'completed' && (
          <div className="border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Compliance &amp; policy sign-off + project sign-off</h2>
            <textarea rows={2} value={signOffNotes} onChange={(e) => setSignOffNotes(e.target.value)} className={inputCls} placeholder="Sign-off notes (archived with the project documentation)" />
            <button onClick={signOff} disabled={busy || !isAdmin} className="mt-2 inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50">
              <FiCheckCircle size={12} /> Formally sign off &amp; close
            </button>
            {!isAdmin && <p className="text-[10px] text-slate-400 mt-1">Only the project manager or administrators can sign off.</p>}
          </div>
        )}
        {project.status === 'completed' && (
          <div className="border border-emerald-100 bg-emerald-50 rounded-xl p-4 text-xs text-emerald-700">
            <p className="font-semibold flex items-center gap-1.5"><FiCheckCircle /> Project closed {project.closedAt ? `on ${String(project.closedAt).slice(0, 10)}` : ''}</p>
            {project.signOffNotes && <p className="mt-1 text-emerald-600">"{project.signOffNotes}"</p>}
            <p className="mt-1 text-emerald-600">Task metrics and manager reviews have been fed into the Performance module for appraisals.</p>
          </div>
        )}
      </div>

      <div className="border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Project post-mortem (performance feedback)</h2>
        <p className="text-[11px] text-slate-400 mb-3">Rate each team member on delivery quality, communication and speed — ratings sync to the Performance/Appraisal module.</p>
        {pendingMembers.length === 0 && reviews.length > 0 && <p className="text-xs text-emerald-600">All allocated members reviewed ({reviews.length}).</p>}
        {pendingMembers.length === 0 && reviews.length === 0 && <p className="text-xs text-slate-400">No active allocations to review.</p>}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {pendingMembers.map((a: any) => {
            const d = reviewDraft[a.employeeId] || {};
            return (
              <div key={a.employeeId} className="border border-slate-100 rounded-lg p-2.5">
                <p className="text-xs font-medium text-slate-700">{a.employee?.firstName} {a.employee?.lastName} <span className="text-[10px] text-slate-400">{a.role || ''}</span></p>
                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                  {(['deliveryQuality', 'communication', 'speed'] as const).map((k) => (
                    <label key={k} className="text-[10px] text-slate-500 capitalize">
                      {k.replace('Quality', ' quality')}
                      <select value={d[k] ?? 3} onChange={(e) => setDraft(a.employeeId, { [k]: Number(e.target.value) })} className="mt-0.5 w-full border border-slate-200 rounded-md px-1.5 py-1 text-[11px]">
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <input value={d.skillUpgradeSuggestion || ''} onChange={(e) => setDraft(a.employeeId, { skillUpgradeSuggestion: e.target.value })} className={`${inputCls} mt-1.5`} placeholder="Skill upgrade suggestion for HR (e.g. learned Kafka — add to profile)" />
              </div>
            );
          })}
        </div>
        {pendingMembers.length > 0 && (
          <button onClick={saveReviews} disabled={busy} className="mt-3 text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Save reviews</button>
        )}
        {reviews.length > 0 && (
          <div className="mt-3 border-t border-dashed border-slate-200 pt-2">
            <p className="text-[11px] font-semibold text-slate-500 mb-1">Recorded ({reviews.length})</p>
            {reviews.map((r: any) => (
              <p key={r.id} className="text-[11px] text-slate-500">{r.employee?.firstName} {r.employee?.lastName}: Q{r.deliveryQuality} · C{r.communication} · S{r.speed}{r.skillUpgradeSuggestion ? ` · ↑ ${r.skillUpgradeSuggestion}` : ''}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
