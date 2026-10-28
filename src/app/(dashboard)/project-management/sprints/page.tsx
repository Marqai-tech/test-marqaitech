'use client';

/**
 * Sprints (real implementation, backed by the Sprint model).
 * Cross-project sprint overview: create / start / complete sprints, velocity,
 * say-do ratio, and story-point burn. Agile projects only.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FiZap, FiPlus, FiCalendar, FiPlay, FiCheckCircle, FiTrendingUp, FiRefreshCw,
} from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface SprintRow {
  id: string; name: string; goal: string | null; sprintNumber: number;
  startDate: string; endDate: string; status: string;
  committedPoints: number; completedPoints: number; taskCount: number;
  tasksByStatus: { todo: number; in_progress: number; review: number; done: number };
  projectName: string; projectId: string;
}

export default function SprintsPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SprintRow[]>([]);
  const [metrics, setMetrics] = useState<any>({});
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [form, setForm] = useState({ name: '', goal: '', startDate: '', endDate: '' });
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [projRes, ] = await Promise.all([
        fetch('/api/projects?limit=100', { headers }),
      ]);
      let agileProjects: any[] = [];
      if (projRes.ok) {
        const j = await projRes.json();
        const all: any[] = j.projects || j.data || [];
        agileProjects = all.filter((p: any) => !p.methodology || p.methodology === 'agile');
        setProjects(agileProjects);
      }
      // Load sprints for each agile project (bounded)
      const results: SprintRow[] = [];
      const metricsAgg = { sayDoRatio: null as number | null, avgVelocity: null as number | null, completedSprints: 0 };
      const targets = projectId ? agileProjects.filter((p: any) => p.id === projectId) : agileProjects.slice(0, 12);
      await Promise.all(targets.map(async (p: any) => {
        const res = await fetch(`/api/projects/${p.id}/sprints`, { headers }).catch(() => null);
        if (!res || !res.ok) return;
        const j = await res.json();
        for (const s of j.sprints || []) {
          results.push({ ...s, projectName: p.name, projectId: p.id });
        }
        if (j.metrics?.avgVelocity != null) {
          metricsAgg.completedSprints += j.metrics.completedSprints || 0;
          metricsAgg.avgVelocity = metricsAgg.avgVelocity == null ? j.metrics.avgVelocity : Math.round((metricsAgg.avgVelocity + j.metrics.avgVelocity) / 2);
          metricsAgg.sayDoRatio = j.metrics.sayDoRatio;
        }
      }));
      results.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
      setRows(results);
      setMetrics(metricsAgg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!projectId) { toast.error('Select an agile project first'); return; }
    if (!form.name || !form.startDate || !form.endDate) { toast.error('Name, start and end dates are required'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(form) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Create failed'); return; }
      toast.success('Sprint created');
      setForm({ name: '', goal: '', startDate: '', endDate: '' });
      setShowForm(false);
      await load();
    } finally { setBusy(false); }
  };

  const act = async (row: SprintRow, action: string) => {
    setBusy(true);
    try {
      const moveIncomplete = action === 'complete' ? (confirm('Move incomplete stories to the NEXT sprint? (Cancel = return to backlog)') ? 'next' : 'backlog') : undefined;
      const res = await fetch(`/api/projects/${row.projectId}/sprints/${row.id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ action, moveIncomplete }) });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Action failed'); return; }
      toast.success(action === 'complete' ? `Sprint closed — velocity ${j.completedPoints}/${j.committedPoints} pts` : 'Sprint started');
      await load();
    } finally { setBusy(false); }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FiZap className="text-violet-600" /> Sprints</h1>
          <p className="text-xs text-slate-500 mt-1">Agile/Scrum cadence for your projects — velocity, say-do ratio and sprint burn, live from the delivery engine.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white max-w-[220px]">
            <option value="">All agile projects</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900"><FiPlus size={12} /> New sprint</button>
          <button onClick={load} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><FiRefreshCw /> </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        <span className="thb-badge bg-violet-50 text-violet-700 rounded-full px-2.5 py-1">Avg velocity: {metrics.avgVelocity ?? '—'} pts</span>
        <span className="thb-badge bg-emerald-50 text-emerald-700 rounded-full px-2.5 py-1 flex items-center gap-1"><FiTrendingUp size={11} /> Say-do: {metrics.sayDoRatio != null ? `${metrics.sayDoRatio}%` : '—'}</span>
        <span className="thb-badge bg-slate-100 text-slate-600 rounded-full px-2.5 py-1">{rows.length} sprint(s) · {metrics.completedSprints || 0} completed</span>
      </div>

      {showForm && (
        <div className="border border-slate-200 rounded-xl p-4 mb-4 bg-slate-50/60 grid md:grid-cols-5 gap-2">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white md:col-span-1">
            <option value="">Project…</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input placeholder="Sprint name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5" />
          <button onClick={create} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Create sprint</button>
        </div>
      )}

      {loading ? (
        <div className="p-10 text-sm text-slate-400 animate-pulse text-center">Loading sprints…</div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center">
          <FiCalendar className="mx-auto text-slate-300 mb-2" size={24} />
          <p className="text-sm text-slate-500">No sprints yet</p>
          <p className="text-xs text-slate-400 mt-1">Create a sprint on any Agile/Scrum project. Waterfall projects use sequential phases instead.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {rows.map((s) => (
            <div key={s.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-2">
                <span className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center text-[11px] font-bold shrink-0">S{s.sprintNumber}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{s.name}</p>
                  <a href={`/projects/${s.projectId}?tab=sprints`} className="text-[10px] text-fuchsia-600 hover:underline truncate block">{s.projectName}</a>
                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(s.startDate).toLocaleDateString()} → {new Date(s.endDate).toLocaleDateString()}{s.goal ? ` · ${s.goal}` : ''}</p>
                </div>
                <span className={`thb-badge text-[10px] px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-50 text-emerald-700' : s.status === 'completed' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>{s.status}</span>
              </div>
              <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-500">
                <span>{s.committedPoints} committed</span>
                <span className="text-emerald-600 font-medium">{s.completedPoints} delivered</span>
                <span className="text-slate-300">|</span>
                <span>{s.taskCount} task(s)</span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.committedPoints ? Math.min(100, (s.completedPoints / s.committedPoints) * 100) : 0}%` }} />
                </div>
              </div>
              <div className="flex gap-1.5 mt-2.5">
                {s.status === 'planned' && <button onClick={() => act(s, 'start')} disabled={busy} className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"><FiPlay size={10} /> Start sprint</button>}
                {s.status === 'active' && <button onClick={() => act(s, 'complete')} disabled={busy} className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 text-white hover:bg-slate-900"><FiCheckCircle size={10} /> Complete sprint</button>}
                <a href={`/projects/${s.projectId}?tab=board`} className="text-[11px] px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">Open board</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
