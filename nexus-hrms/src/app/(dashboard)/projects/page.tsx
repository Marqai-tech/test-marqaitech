'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiFolder,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiEye,
  FiCheckCircle,
  FiPause,
  FiCalendar,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Project {
  id: string;
  name: string;
  code?: string | null;
  client?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
  description?: string | null;
  budget?: number | null;
  manager?: string | null;
  createdAt: string;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    planning: 'nexus-badge nexus-badge-info',
    active: 'nexus-badge nexus-badge-success',
    on_hold: 'nexus-badge nexus-badge-warning',
    completed: 'nexus-badge nexus-badge-purple',
    cancelled: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge';
}

const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];

const initialForm = {
  name: '',
  code: '',
  client: '',
  startDate: '',
  endDate: '',
  status: 'planning',
  description: '',
  budget: '',
  manager: '',
};

/* ── Component ── */
export default function ProjectsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewingId, setViewingId] = useState<string | null>(null);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/projects?limit=100', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Form handlers */
  const handleOpenAdd = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(true);
    setViewingId(null);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenEdit = (project: Project) => {
    setForm({
      name: project.name,
      code: project.code || '',
      client: project.client || '',
      startDate: project.startDate ? project.startDate.split('T')[0] : '',
      endDate: project.endDate ? project.endDate.split('T')[0] : '',
      status: project.status,
      description: project.description || '',
      budget: project.budget != null ? String(project.budget) : '',
      manager: project.manager || '',
    });
    setEditingId(project.id);
    setShowForm(true);
    setViewingId(null);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenView = (project: Project) => {
    setViewingId(project.id);
    setShowForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCloseView = () => {
    setViewingId(null);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Please fill in the project name');
      return;
    }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        client: form.client.trim() || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        status: form.status,
        description: form.description.trim() || null,
        budget: form.budget ? parseFloat(form.budget) : null,
        manager: form.manager.trim() || null,
      };

      const url = editingId ? `/api/projects/${editingId}` : '/api/projects';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Project updated successfully' : 'Project created successfully');
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setSubmitting(false);
    }
  };

  /* Delete */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Project deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  /* Filtering */
  const filtered = projects.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code || '').toLowerCase().includes(search.toLowerCase()) || (p.client || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  /* Summary */
  const totalProjects = projects.length;
  const activeCount = projects.filter(p => p.status === 'active').length;
  const completedCount = projects.filter(p => p.status === 'completed').length;
  const onHoldCount = projects.filter(p => p.status === 'on_hold').length;

  /* View item */
  const viewingItem = viewingId ? projects.find(p => p.id === viewingId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiFolder className="w-6 h-6 text-violet-500" />
            Projects
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage organization projects and initiatives</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Add Project
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiFolder className="w-5 h-5 text-blue-500" /></div>
            <div>
              <p className="text-lg font-bold text-nexus-text-primary">{totalProjects}</p>
              <p className="text-xs text-nexus-text-muted">Total Projects</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div>
            <div>
              <p className="text-lg font-bold text-nexus-text-primary">{activeCount}</p>
              <p className="text-xs text-nexus-text-muted">Active</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-violet-500" /></div>
            <div>
              <p className="text-lg font-bold text-nexus-text-primary">{completedCount}</p>
              <p className="text-xs text-nexus-text-muted">Completed</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiPause className="w-5 h-5 text-amber-500" /></div>
            <div>
              <p className="text-lg font-bold text-nexus-text-primary">{onHoldCount}</p>
              <p className="text-xs text-nexus-text-muted">On Hold</p>
            </div>
          </div>
        </div>
      </div>

      {/* View-Only Panel */}
      {viewingItem && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-violet-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Project Details</h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Name</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingItem.name}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Code</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.code || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Client</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.client || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Start Date</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(viewingItem.startDate)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">End Date</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(viewingItem.endDate)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status.replace('_', ' ')}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Budget</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.budget)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Manager</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.manager || '—'}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Description</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.description || '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border">
              <button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Form */}
      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Project' : 'Add Project'}</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Project name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Code</label>
                <input type="text" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="PRJ-001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Client</label>
                <input type="text" value={form.client} onChange={e => setForm(p => ({ ...p, client: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Client name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Start Date</label>
                <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">End Date</label>
                <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Budget</label>
                <input type="number" step="0.01" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Manager</label>
                <input type="text" value={form.manager} onChange={e => setForm(p => ({ ...p, manager: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Project manager" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Project description..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search projects..." />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-nexus-text-muted" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Statuses</option>
            {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Manager</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Budget</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Timeline</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <FiFolder className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No projects found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(project => (
                  <tr key={project.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === project.id ? (
                      <td colSpan={8} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Are you sure you want to delete &quot;{project.name}&quot;?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(project.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{project.name}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{project.code || '—'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{project.client || '—'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{project.manager || '—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-nexus-text-primary">{formatCurrency(project.budget)}</td>
                        <td className="px-4 py-3"><span className={getStatusBadge(project.status)}>{project.status.replace('_', ' ')}</span></td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(project.startDate)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleOpenView(project)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                            {isAdmin && (
                              <>
                                <button onClick={() => handleOpenEdit(project)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                                <button onClick={() => { setDeleteConfirmId(project.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
