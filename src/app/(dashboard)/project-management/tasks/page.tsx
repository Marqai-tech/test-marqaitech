'use client';

/**
 * Project Tasks — real implementation (no demo fallbacks).
 * Cross-project task board: create / edit / move / delete via the project
 * task APIs, with sprint & story-point support, dependency (finish-to-start)
 * gating surfaced in the UI, and two-way sync with the collaboration kanban.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiRefreshCw, FiTrash2, FiEdit2, FiAlertTriangle } from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

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
  plannedEnd?: string | null; estimatedHours?: number; isBillable?: boolean; description?: string | null;
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
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ projectId: '', name: '', priority: 'medium', assignedToId: '', estimatedHours: '', plannedEnd: '' });
  const [employees, setEmployees] = useState<any[]>([]);

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

  const create = async () => {
    if (!form.projectId || !form.name) { toast.error('Project and task name are required'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${form.projectId}/tasks`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          name: form.name, priority: form.priority, assignedToId: form.assignedToId || undefined,
          estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : undefined,
          plannedEnd: form.plannedEnd || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Create failed'); return; }
      toast.success('Task created');
      setForm({ projectId: form.projectId, name: '', priority: 'medium', assignedToId: '', estimatedHours: '', plannedEnd: '' });
      setShowForm(false);
      await load();
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${editing.projectId}/tasks/${editing.id}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({
          name: editing.name, priority: editing.priority, assignedToId: editing.assignedToId || null,
          storyPoints: editing.storyPoints === '' ? null : Number(editing.storyPoints),
          plannedEnd: editing.plannedEnd || null, description: editing.description || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Update failed'); return; }
      toast.success('Task updated');
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
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900"><FiPlus size={12} /> New task</button>
          <button onClick={load} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><FiRefreshCw /></button>
        </div>
      </header>

      {showForm && (
        <div className="border border-slate-200 rounded-xl p-4 mb-4 bg-slate-50/60 grid md:grid-cols-5 gap-2">
          <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">Project…</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input placeholder="Task name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 md:col-span-2" />
          <select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">Assign to…</option>
            {employees.map((e: any) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </select>
          <button onClick={create} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Create</button>
        </div>
      )}

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
            const colTasks = tasks.filter((t) => t.status === col.key);
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
                            <button onClick={() => setEditing({ ...t, plannedEnd: t.plannedEnd ? String(t.plannedEnd).slice(0, 10) : '' })} className="text-slate-300 hover:text-slate-600 p-0.5"><FiEdit2 size={10} /></button>
                            <button onClick={() => remove(t)} className="text-slate-300 hover:text-red-500 p-0.5"><FiTrash2 size={10} /></button>
                          </div>
                        </div>
                        <p className="text-[10px] text-fuchsia-500 mt-0.5 truncate">{proj?.name || ''}</p>
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <span className={`thb-badge text-[9px] px-1.5 py-0.5 rounded ${t.priority === 'critical' ? 'bg-red-50 text-red-600' : t.priority === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{t.priority}</span>
                          {t.storyPoints != null && <span className="thb-badge text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">{t.storyPoints} pts</span>}
                          {t.sprint && <span className="thb-badge text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">S{t.sprint.sprintNumber}</span>}
                          {t.plannedEnd && <span className="text-[9px] text-slate-400">due {String(t.plannedEnd).slice(5, 10)}</span>}
                        </div>
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
              <select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
              <select value={editing.assignedToId || ''} onChange={(e) => setEditing({ ...editing, assignedToId: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5">
                <option value="">Unassigned</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
              <input type="number" placeholder="Story points" value={editing.storyPoints ?? ''} onChange={(e) => setEditing({ ...editing, storyPoints: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
              <input type="date" value={editing.plannedEnd || ''} onChange={(e) => setEditing({ ...editing, plannedEnd: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <textarea rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" placeholder="Description" />
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
