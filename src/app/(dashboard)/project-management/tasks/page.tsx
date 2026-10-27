'use client';

/**
 * Project Tasks — real implementation (no demo fallbacks).
 * Cross-project task board: create / edit / move / delete via the project
 * task APIs, with sprint support, dependency (finish-to-start) gating
 * surfaced in the UI, and two-way sync with the collaboration kanban.
 * Task 128 — story points replaced by the delivery WORKFLOW STEPS
 * (testing → re-testing → production → delivery) + a TASK TYPE field
 * (customisation / rework / development / bug). Moving to re-testing sends
 * the task back to the assignee itself; every other step asks for the
 * assignee again. Step changes alert assignee + PM + admins (bell + email).
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiRefreshCw, FiTrash2, FiEdit2, FiAlertTriangle } from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import TaskAttachments from '@/components/tasks/TaskAttachments';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Task {
  id: string; projectId: string; name: string; priority: string; status: string;
  assignedToId: string | null; assignedTo?: { firstName: string; lastName: string } | null;
  milestone?: { id: string; name: string } | null;
  sprintId?: string | null; sprint?: { id: string; name: string; sprintNumber: number } | null;
  storyPoints?: number | null; dependsOnId?: string | null;
  dependsOn?: { id: string; name: string; status: string } | null;
  plannedEnd?: string | null; plannedStart?: string | null; estimatedHours?: number; isBillable?: boolean; description?: string | null;
  taskType?: string | null; workflowStep?: string | null;
  source?: string | null; client?: { id: string; name: string; code?: string | null } | null;
  _count?: { attachments?: number };
}

const TASK_TYPES: { value: string; label: string }[] = [
  { value: 'customisation', label: 'Customisation' },
  { value: 'rework', label: 'Rework' },
  { value: 'development', label: 'Development' },
  { value: 'bug', label: 'Bug' },
];

const WORKFLOW_STEPS: { value: string; label: string }[] = [
  { value: 'testing', label: 'Testing' },
  { value: 're_testing', label: 'Re-testing' },
  { value: 'production', label: 'Production' },
  { value: 'delivery', label: 'Delivery' },
];

function stepLabel(v?: string | null) {
  if (!v) return null;
  return WORKFLOW_STEPS.find((s) => s.value === v)?.label || v;
}

function typeLabel(v?: string | null) {
  if (!v) return null;
  return TASK_TYPES.find((t) => t.value === v)?.label || v;
}

function stepBadgeCls(v?: string | null) {
  switch (v) {
    case 'testing': return 'bg-sky-50 text-sky-700';
    case 're_testing': return 'bg-amber-50 text-amber-700';
    case 'production': return 'bg-violet-50 text-violet-700';
    case 'delivery': return 'bg-emerald-50 text-emerald-700';
    default: return 'bg-slate-100 text-slate-500';
  }
}

const COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];

export default function ProjectTasksPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dragTask, setDragTask] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Task 131 — the create form is the SHARED CreateTaskModal (same fields +
  // design as the PM dashboard, the delivery board and the mobile sheet).
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  // Task 150 — filter by origin: all / internal (team) / external (client-raised)
  const [sourceFilter, setSourceFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const projRes = await fetch('/api/projects?limit=50', { headers });
      let projectList: any[] = [];
      if (projRes.ok) {
        const j = await projRes.json();
        projectList = j.projects || j.data || [];
        setProjects(projectList);
      }
      const targets = projectFilter ? projectList.filter((p: any) => p.id === projectFilter) : projectList.slice(0, 10);
      const all: Task[] = [];
      await Promise.all(targets.map(async (p: any) => {
        const res = await fetch(`/api/projects/${p.id}/tasks?limit=100`, { headers }).catch(() => null);
        if (!res || !res.ok) return;
        const j = await res.json();
        for (const t of j.tasks || []) all.push(t);
      }));
      setTasks(all);
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  useEffect(() => {
    load();
    fetch('/api/employees?limit=300', { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setEmployees(j?.employees || j?.data || []))
      .catch(() => null);
  }, [load]);

  const saveEdit = async () => {
    const stepChanged = editing.workflowStep && editing.workflowStep !== editing._origStep;
    if (stepChanged && editing.workflowStep !== 're_testing' && !editing.assignedToId) {
      toast.error(`Select the assignee for the "${stepLabel(editing.workflowStep)}" step — the assignee is asked again on every step change except re-testing`, { icon: <FiAlertTriangle /> });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${editing.projectId}/tasks/${editing.id}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({
          name: editing.name, priority: editing.priority,
          // re-testing keeps the current assignee — only send an explicit
          // assignee when the picker holds one
          ...(editing.workflowStep === 're_testing'
            ? (editing.assignedToId ? { assignedToId: editing.assignedToId } : {})
            : { assignedToId: editing.assignedToId || null }),
          taskType: editing.taskType || null,
          workflowStep: editing.workflowStep || null,
          plannedStart: editing.plannedStart || null,
          plannedEnd: editing.plannedEnd || null, description: editing.description || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Update failed'); return; }
      toast.success(stepChanged ? `Task moved to ${stepLabel(editing.workflowStep)} — assignee, PM & admins notified` : 'Task updated');
      setEditing(null);
      await load();
    } finally { setBusy(false); }
  };

  const move = async (task: Task, status: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${task.projectId}/tasks/${task.id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status }) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Move blocked', { icon: <FiAlertTriangle /> }); return; }
      await load();
    } finally { setBusy(false); }
  };

  const remove = async (task: Task) => {
    if (!confirm(`Delete task "${task.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${task.projectId}/tasks/${task.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Delete failed'); return; }
      toast.success(j.message || 'Task deleted');
      await load();
    } finally { setBusy(false); }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Project Tasks</h1>
          <p className="text-xs text-slate-500 mt-1">Deliverables with priority levels and hard deadlines. Moves persist and sync with the collaboration kanban; finish-to-start dependencies gate later work.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white max-w-[220px]">
            <option value="">All projects (first 10)</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white" title="Filter by task origin">
            <option value="">All sources</option>
            <option value="internal">Internal</option>
            <option value="external">External (client)</option>
          </select>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900"><FiPlus size={12} /> New task</button>
          <button onClick={load} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><FiRefreshCw /></button>
        </div>
      </header>

      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={load}
        projects={projects}
        employees={employees}
      />

      {loading ? (
        <div className="p-10 text-sm text-slate-400 animate-pulse text-center">Loading tasks…</div>
      ) : tasks.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center">
          <p className="text-sm text-slate-500">No tasks found</p>
          <p className="text-xs text-slate-400 mt-1">Create a task from here or inside a project workspace.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-4 gap-3">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key && (!sourceFilter || (t.source || 'internal') === sourceFilter));
            return (
              <div key={col.key} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragTask) { const t = tasks.find((x) => x.id === dragTask); if (t) move(t, col.key); setDragTask(null); } }} className="bg-slate-50 rounded-xl p-2.5 min-h-[240px]">
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{col.label}</p>
                  <span className="text-[10px] bg-white border border-slate-200 rounded-full px-1.5">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => {
                    const proj = projects.find((p: any) => p.id === t.projectId);
                    return (
                      <div key={t.id} draggable onDragStart={() => setDragTask(t.id)} className="bg-white border border-slate-200 rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:shadow-sm">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-medium text-slate-700 leading-snug">{t.name}</p>
                          <div className="flex shrink-0 gap-0.5">
                            <button onClick={() => setEditing({ ...t, plannedEnd: t.plannedEnd ? String(t.plannedEnd).slice(0, 10) : '', plannedStart: t.plannedStart ? String(t.plannedStart).slice(0, 10) : '', estimatedHours: t.estimatedHours ?? '', _origStep: t.workflowStep || null, _origAssigneeId: t.assignedToId || '' })} className="text-slate-300 hover:text-slate-600 p-0.5"><FiEdit2 size={10} /></button>
                            <button onClick={() => remove(t)} className="text-slate-300 hover:text-red-500 p-0.5"><FiTrash2 size={10} /></button>
                          </div>
                        </div>
                        <p className="text-[10px] text-fuchsia-500 mt-0.5 truncate">{proj?.name || ''}</p>
                        {(t.source === 'external' || t.client) && (
                          <p className="text-[10px] text-violet-600 font-medium mt-0.5 truncate">
                            <span className="thb-badge text-[9px] px-1 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 mr-1">External</span>
                            {t.client?.name || 'Client'}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <span className={`thb-badge text-[9px] px-1.5 py-0.5 rounded ${t.priority === 'critical' ? 'bg-red-50 text-red-600' : t.priority === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{t.priority}</span>
                          {t.taskType && <span className="thb-badge text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-50 text-fuchsia-700">{typeLabel(t.taskType)}</span>}
                          {t.workflowStep && <span className={`thb-badge text-[9px] px-1.5 py-0.5 rounded ${stepBadgeCls(t.workflowStep)}`}>{stepLabel(t.workflowStep)}</span>}
                          {t.sprint && <span className="thb-badge text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">S{t.sprint.sprintNumber}</span>}
                          {(t._count?.attachments ?? 0) > 0 && <span className="text-[9px] text-slate-400" title={`${t._count?.attachments} attachment(s)`}>📎 {t._count?.attachments}</span>}
                          {t.plannedStart && <span className="text-[9px] text-slate-400">{String(t.plannedStart).slice(5, 10)} →</span>}
                          {t.plannedEnd && <span className="text-[9px] text-slate-400">due {String(t.plannedEnd).slice(5, 10)}</span>}
                          {!!t.estimatedHours && <span className="text-[9px] text-slate-400">{t.estimatedHours}h</span>}
                        </div>
                        {t.description && <p className="text-[10px] text-slate-500 mt-1 line-clamp-2" title={t.description}>{t.description}</p>}
                        {t.assignedTo && <p className="text-[10px] text-slate-400 mt-1.5">{t.assignedTo.firstName} {t.assignedTo.lastName}</p>}
                        {t.dependsOn && t.dependsOn.status !== 'done' && <p className="text-[9px] text-amber-600 mt-0.5">⛓ gated by: {t.dependsOn.name.slice(0, 22)}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800">Edit task</h3>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" placeholder="Task name" />
            <div className="grid grid-cols-2 gap-2">
              <select value={editing.taskType || ''} onChange={(e) => setEditing({ ...editing, taskType: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5">
                <option value="">Task type…</option>
                {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select
                value={editing.workflowStep || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  // Re-testing → the task goes BACK to the assignee itself:
                  // pre-fill the picker with the current assignee.
                  setEditing({ ...editing, workflowStep: v, assignedToId: v === 're_testing' ? (editing.assignedToId || editing._origAssigneeId || '') : editing.assignedToId });
                }}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5"
              >
                <option value="">Workflow step…</option>
                {WORKFLOW_STEPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
              <select value={editing.assignedToId || ''} onChange={(e) => setEditing({ ...editing, assignedToId: e.target.value })} className={`text-xs border rounded-lg px-2.5 py-1.5 ${editing.workflowStep && editing.workflowStep !== 're_testing' && !editing.assignedToId ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
                <option value="">{editing.workflowStep === 're_testing' ? 'Assignee (kept for re-testing)' : 'Unassigned'}</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
              <input type="date" title="Start date" value={editing.plannedStart || ''} onChange={(e) => setEditing({ ...editing, plannedStart: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
              <input type="date" title="End date" value={editing.plannedEnd || ''} onChange={(e) => setEditing({ ...editing, plannedEnd: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
              <input type="number" min={0} title="Hrs" placeholder="Hrs" value={editing.estimatedHours ?? ''} onChange={(e) => setEditing({ ...editing, estimatedHours: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            {editing.workflowStep && editing.workflowStep !== editing._origStep && (
              <p className={`text-[10.5px] rounded-lg px-2.5 py-1.5 ${editing.workflowStep === 're_testing' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700'}`}>
                {editing.workflowStep === 're_testing'
                  ? 'Re-testing: this task goes back to the assignee itself — no reassignment needed.'
                  : `${stepLabel(editing.workflowStep)}: pick the assignee again for this step (required).`}
              </p>
            )}
            <textarea rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" placeholder="Description" />
            <TaskAttachments projectId={editing.projectId} taskId={editing.id} />
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
