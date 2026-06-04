'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiUsers, FiChevronRight,
  FiCalendar, FiList, FiGrid,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Project {
  id: string; name: string; code: string | null; projectType: string; billingType: string; budgetAmount: number; status: string; progress: number; startDate: string; endDate: string | null; description: string | null;
  client?: { name: string } | null; department?: { name: string } | null;
  tasks?: ProjectTask[]; allocations?: ProjectAllocation[]; milestones?: ProjectMilestone[];
}

interface ProjectTask { id: string; name: string; status: string; priority: string; estimatedHours: number; actualHours: number; }
interface ProjectAllocation { id: string; role: string | null; allocationPct: number; status: string; employee: { firstName: string; lastName: string }; }
interface ProjectMilestone { id: string; name: string; plannedDate: string; completionPct: number; approvalStatus: string; }

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600' },
  active: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  on_hold: { bg: 'bg-amber-100', text: 'text-amber-700' },
  completed: { bg: 'bg-blue-100', text: 'text-blue-700' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700' },
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailTab, setDetailTab] = useState<'tasks' | 'team' | 'milestones' | 'billing'>('tasks');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '', code: '', clientId: '', departmentId: '', projectType: 'internal', billingType: 'non_billable', currency: 'USD', budgetAmount: 0, estimatedHours: 0, startDate: '', endDate: '', description: '',
  });
  const [newTask, setNewTask] = useState({ name: '', priority: 'medium', estimatedHours: 0 });

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/projects', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setProjects(Array.isArray(data) ? data : data.projects || []); }
    } catch { toast.error('Failed to load projects'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Name is required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Project created');
      setShowCreateModal(false);
      setForm({ name: '', code: '', clientId: '', departmentId: '', projectType: 'internal', billingType: 'non_billable', currency: 'USD', budgetAmount: 0, estimatedHours: 0, startDate: '', endDate: '', description: '' });
      fetchProjects();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleAddTask = async () => {
    if (!newTask.name || !selectedProject) return;
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/tasks`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(newTask) });
      if (!res.ok) throw new Error('Failed');
      toast.success('Task added');
      setNewTask({ name: '', priority: 'medium', estimatedHours: 0 });
      const fresh = await fetch(`/api/projects/${selectedProject.id}`, { headers: getAuthHeaders() });
      if (fresh.ok) setSelectedProject(await fresh.json());
    } catch { toast.error('Failed to add task'); }
  };

  const handleSelectProject = async (p: Project) => {
    try {
      const res = await fetch(`/api/projects/${p.id}`, { headers: getAuthHeaders() });
      if (res.ok) setSelectedProject(await res.json());
    } catch { setSelectedProject(p); }
  };

  const taskBoardColumns = [
    { key: 'todo', label: 'To Do', color: 'border-slate-300' },
    { key: 'in_progress', label: 'In Progress', color: 'border-amber-400' },
    { key: 'review', label: 'Review', color: 'border-blue-400' },
    { key: 'done', label: 'Done', color: 'border-emerald-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Projects</h1><p className="text-slate-500 mt-1">Manage projects, tasks, and team allocations</p></div>
        <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"><FiPlus className="w-4 h-4" /> Create Project</button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => (<div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse"><div className="h-4 w-3/4 bg-slate-200 rounded mb-3" /><div className="h-3 w-1/2 bg-slate-100 rounded mb-2" /><div className="h-2 bg-slate-50 rounded-full" /></div>))}</div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiList className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No projects found</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div key={p.id} onClick={() => handleSelectProject(p)} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div><h3 className="font-semibold text-slate-900">{p.name}</h3><p className="text-xs text-slate-400 mt-0.5">{p.code || 'No code'}</p></div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[p.status]?.bg || ''} ${statusConfig[p.status]?.text || ''}`}>{p.status.replace('_', ' ')}</span>
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                {p.client && <div className="flex items-center gap-2"><FiGrid className="w-3.5 h-3.5 text-slate-400" /> Client: {p.client.name}</div>}
                <div className="flex items-center gap-2"><FiUsers className="w-3.5 h-3.5 text-slate-400" /> {p.projectType} · {p.billingType.replace('_', ' ')}</div>
                <div className="flex items-center gap-2"><FiCalendar className="w-3.5 h-3.5 text-slate-400" /> {new Date(p.startDate).toLocaleDateString()}</div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1"><span className="text-xs text-slate-500">Progress</span><span className="text-xs font-medium text-slate-700">{p.progress}%</span></div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${p.progress}%` }} /></div>
              </div>
              <div className="mt-3 text-sm font-medium text-slate-500 flex items-center gap-1 hover:text-blue-600">View Details <FiChevronRight className="w-3.5 h-3.5" /></div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Create Project</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Code</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Project Type</label><select value={form.projectType} onChange={(e) => setForm({ ...form, projectType: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="internal">Internal</option><option value="client">Client</option><option value="r_and_d">R&D</option><option value="support">Support</option></select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Billing Type</label><select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="fixed">Fixed</option><option value="time_and_material">T&M</option><option value="retainer">Retainer</option><option value="non_billable">Non-Billable</option><option value="hourly">Hourly</option><option value="daily">Daily</option></select></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Currency</label><select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="USD">USD</option><option value="EUR">EUR</option><option value="INR">INR</option></select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Budget</label><input type="number" value={form.budgetAmount} onChange={(e) => setForm({ ...form, budgetAmount: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Est. Hours</label><input type="number" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">End Date</label><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Description</label><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" /></div>
              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button><button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Project Detail Modal */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedProject(null)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedProject.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500">{selectedProject.code || 'No code'}</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[selectedProject.status]?.bg} ${statusConfig[selectedProject.status]?.text}`}>{selectedProject.status.replace('_', ' ')}</span>
                </div>
              </div>
              <button onClick={() => setSelectedProject(null)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit mb-6">
                {(['tasks', 'team', 'milestones', 'billing'] as const).map((tab) => (
                  <button key={tab} onClick={() => setDetailTab(tab)} className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${detailTab === tab ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>{tab}</button>
                ))}
              </div>

              {detailTab === 'tasks' && (
                <div>
                  {/* Task Board */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {taskBoardColumns.map((col) => {
                      const colTasks = (selectedProject.tasks || []).filter((t) => t.status === col.key);
                      return (
                        <div key={col.key} className={`border-t-2 ${col.color} rounded-lg`}>
                          <div className="px-3 py-2 bg-slate-50 rounded-t-lg"><h4 className="text-xs font-semibold text-slate-700">{col.label} ({colTasks.length})</h4></div>
                          <div className="p-2 space-y-2 min-h-[100px]">
                            {colTasks.map((t) => (
                              <div key={t.id} className="p-2 bg-white border border-slate-200 rounded-lg text-xs">
                                <p className="font-medium text-slate-800">{t.name}</p>
                                <p className="text-slate-400 mt-1">{t.estimatedHours}h est.</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Add task */}
                  <div className="flex gap-2">
                    <input value={newTask.name} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} placeholder="New task name..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
                    <button onClick={handleAddTask} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><FiPlus className="w-4 h-4" /></button>
                  </div>
                </div>
              )}

              {detailTab === 'team' && (
                <div className="space-y-2">
                  {(selectedProject.allocations || []).length === 0 ? <p className="text-sm text-slate-500 text-center py-8">No team members allocated</p> : (
                    (selectedProject.allocations || []).map((a) => (
                      <div key={a.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                        <div><p className="text-sm font-medium text-slate-900">{a.employee.firstName} {a.employee.lastName}</p><p className="text-xs text-slate-500">{a.role || 'Team Member'}</p></div>
                        <div className="flex items-center gap-2"><span className="text-xs text-slate-500">{a.allocationPct}%</span><span className={`px-2 py-0.5 rounded-full text-xs ${a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{a.status}</span></div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'milestones' && (
                <div className="space-y-2">
                  {(selectedProject.milestones || []).length === 0 ? <p className="text-sm text-slate-500 text-center py-8">No milestones defined</p> : (
                    (selectedProject.milestones || []).map((m) => (
                      <div key={m.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                        <div><p className="text-sm font-medium text-slate-900">{m.name}</p><p className="text-xs text-slate-500">Due: {new Date(m.plannedDate).toLocaleDateString()}</p></div>
                        <div className="flex items-center gap-3"><div className="w-24 h-2 bg-slate-100 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${m.completionPct}%` }} /></div><span className="text-xs text-slate-500">{m.completionPct}%</span></div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'billing' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg"><p className="text-xs text-slate-500">Budget</p><p className="text-xl font-bold text-slate-900">${selectedProject.budgetAmount.toLocaleString()}</p></div>
                  <div className="p-4 bg-slate-50 rounded-lg"><p className="text-xs text-slate-500">Billing Type</p><p className="text-xl font-bold text-slate-900 capitalize">{selectedProject.billingType.replace('_', ' ')}</p></div>
                  <div className="p-4 bg-slate-50 rounded-lg"><p className="text-xs text-slate-500">Est. Hours</p><p className="text-xl font-bold text-slate-900">{selectedProject.estimatedHours || 0}h</p></div>
                  <div className="p-4 bg-slate-50 rounded-lg"><p className="text-xs text-slate-500">Currency</p><p className="text-xl font-bold text-slate-900">{selectedProject.currency || 'USD'}</p></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
