'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiUserPlus,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiX,
  FiSearch,
  FiFilter,
  FiCheckCircle,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface OnboardingTask {
  id: string;
  task: string;
  category: string;
  status: string;
  dueDate?: string | null;
  notes?: string | null;
  employeeId: string;
  assignedBy?: string | null;
  completedDate?: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string; avatar?: string | null };
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
}

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'nexus-badge nexus-badge-warning',
    in_progress: 'nexus-badge nexus-badge-info',
    completed: 'nexus-badge nexus-badge-success',
    skipped: 'bg-slate-100 text-slate-600 nexus-badge',
  };
  const labels: Record<string, string> = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', skipped: 'Skipped' };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function getCategoryBadge(category: string) {
  const map: Record<string, string> = {
    general: 'bg-blue-50 text-blue-700 nexus-badge',
    documentation: 'bg-violet-50 text-violet-700 nexus-badge',
    it_setup: 'bg-cyan-50 text-cyan-700 nexus-badge',
    training: 'bg-emerald-50 text-emerald-700 nexus-badge',
    compliance: 'bg-amber-50 text-amber-700 nexus-badge',
  };
  const labels: Record<string, string> = { general: 'General', documentation: 'Documentation', it_setup: 'IT Setup', training: 'Training', compliance: 'Compliance' };
  return { className: map[category] || 'nexus-badge nexus-badge-info', label: labels[category] || category };
}

const initialForm = {
  employeeId: '',
  task: '',
  category: 'general',
  dueDate: '',
  notes: '',
  status: 'pending',
};

export default function OnboardingPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<OnboardingTask | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '50' });
      if (filterCategory) params.set('category', filterCategory);
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/onboarding?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load onboarding tasks');
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterStatus]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?limit=500', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchTasks()); }, [fetchTasks]);
  useEffect(() => { queueMicrotask(() => fetchEmployees()); }, [fetchEmployees]);

  const openAddForm = () => {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(true);
    setViewingId(null);
    setViewingRecord(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleOpenView = (task: OnboardingTask) => {
    setViewingId(task.id);
    setViewingRecord(task);
    setShowForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCloseView = () => {
    setViewingId(null);
    setViewingRecord(null);
  };

  const openEditForm = (task: OnboardingTask) => {
    setEditingId(task.id);
    setViewingId(null);
    setViewingRecord(null);
    setForm({
      employeeId: task.employeeId,
      task: task.task,
      category: task.category,
      dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
      notes: task.notes || '',
      status: task.status,
    });
    setShowForm(true);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const handleSubmit = async () => {
    if (!form.employeeId || !form.task) {
      toast.error('Please fill in required fields: Employee and Task');
      return;
    }
    try {
      setSubmitting(true);
      if (editingId) {
        const res = await fetch(`/api/onboarding/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(form),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Update failed'); }
        toast.success('Task updated successfully');
      } else {
        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(form),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Create failed'); }
        toast.success('Task created successfully');
      }
      handleCancelForm();
      fetchTasks();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/onboarding/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Delete failed'); }
      toast.success('Task deleted successfully');
      setDeleteConfirmId(null);
      fetchTasks();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkComplete = async (id: string) => {
    try {
      const res = await fetch(`/api/onboarding/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Task marked as completed');
      fetchTasks();
    } catch {
      toast.error('Failed to update task');
    }
  };

  const updateForm = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const filteredTasks = tasks.filter(t => {
    if (search) {
      const s = search.toLowerCase();
      return t.task.toLowerCase().includes(s) || t.employee?.firstName?.toLowerCase().includes(s) || t.employee?.lastName?.toLowerCase().includes(s) || t.category.toLowerCase().includes(s);
    }
    return true;
  });

  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiUserPlus className="w-6 h-6 text-teal-500" />
            Onboarding
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage employee onboarding tasks and checklists</p>
        </div>
        {isAdmin && (
          <button onClick={openAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Add Task
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="nexus-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><FiUserPlus className="w-5 h-5 text-amber-500" /></div>
          <div><p className="text-2xl font-bold text-nexus-text-primary">{pendingCount}</p><p className="text-xs text-nexus-text-muted">Pending</p></div>
        </div>
        <div className="nexus-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><FiUserPlus className="w-5 h-5 text-blue-500" /></div>
          <div><p className="text-2xl font-bold text-nexus-text-primary">{inProgressCount}</p><p className="text-xs text-nexus-text-muted">In Progress</p></div>
        </div>
        <div className="nexus-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div>
          <div><p className="text-2xl font-bold text-nexus-text-primary">{completedCount}</p><p className="text-xs text-nexus-text-muted">Completed</p></div>
        </div>
      </div>

      {viewingId && viewingRecord && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-violet-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                <FiEye className="w-5 h-5 text-violet-500" />
                View Onboarding Task
              </h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Employee</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.employee ? `${viewingRecord.employee.firstName} ${viewingRecord.employee.lastName}` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Task</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.task}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Category</p>
                <p className="text-sm text-nexus-text-primary">{getCategoryBadge(viewingRecord.category).label}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Due Date</p>
                <p className="text-sm text-nexus-text-primary">{formatDate(viewingRecord.dueDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm"><span className={getStatusBadge(viewingRecord.status).className}>{getStatusBadge(viewingRecord.status).label}</span></p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Notes</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">{viewingRecord.notes || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={() => { openEditForm(viewingRecord); setViewingId(null); }} className="px-4 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
                <FiEdit2 className="w-4 h-4 inline mr-1" /> Edit
              </button>
              <button onClick={handleCloseView} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Onboarding Task' : 'Add Onboarding Task'}</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                <select value={form.employeeId} onChange={e => updateForm('employeeId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Task *</label>
                <input type="text" value={form.task} onChange={e => updateForm('task', e.target.value)} placeholder="e.g., Complete IT setup" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category</label>
                <select value={form.category} onChange={e => updateForm('category', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="general">General</option>
                  <option value="documentation">Documentation</option>
                  <option value="it_setup">IT Setup</option>
                  <option value="training">Training</option>
                  <option value="compliance">Compliance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Due Date</label>
                <input type="date" value={form.dueDate} onChange={e => updateForm('dueDate', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                <select value={form.status} onChange={e => updateForm('status', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => updateForm('notes', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Additional notes..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Saving...' : editingId ? 'Update Task' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="nexus-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks, employees..." className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${showFilters ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-nexus-border text-nexus-text-secondary hover:bg-slate-50'}`}>
            <FiFilter className="w-4 h-4" /> Filters
          </button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-nexus-border">
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border bg-white text-sm">
              <option value="">All Categories</option>
              <option value="general">General</option>
              <option value="documentation">Documentation</option>
              <option value="it_setup">IT Setup</option>
              <option value="training">Training</option>
              <option value="compliance">Compliance</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border bg-white text-sm">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="skipped">Skipped</option>
            </select>
            <button onClick={() => { setFilterCategory(''); setFilterStatus(''); setSearch(''); }} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm text-nexus-text-secondary hover:bg-slate-50">Clear Filters</button>
          </div>
        )}
      </div>

      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Task</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Due Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FiUserPlus className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No onboarding tasks found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Create your first onboarding task</p>
                  </td>
                </tr>
              ) : (
                filteredTasks.map(task => {
                  const statusBadge = getStatusBadge(task.status);
                  const catBadge = getCategoryBadge(task.category);
                  return (
                    <tr key={task.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      {deleteConfirmId === task.id ? (
                        <td colSpan={6} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Are you sure you want to delete this task?</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(task.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{task.employee ? `${task.employee.firstName} ${task.employee.lastName}` : '—'}</td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{task.task}</td>
                          <td className="px-4 py-3"><span className={catBadge.className}>{catBadge.label}</span></td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(task.dueDate)}</td>
                          <td className="px-4 py-3"><span className={statusBadge.className}>{statusBadge.label}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {task.status !== 'completed' && (
                                <button onClick={() => handleMarkComplete(task.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Mark Complete">
                                  <FiCheckCircle className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => handleOpenView(task)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              {isAdmin && (
                                <>
                                  <button onClick={() => openEditForm(task)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                                  <button onClick={() => setDeleteConfirmId(task.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                                </>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
