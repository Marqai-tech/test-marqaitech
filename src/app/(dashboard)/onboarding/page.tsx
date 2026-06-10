'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiUserPlus,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';

/* ── Types ── */
interface OnboardingTask {
  id: string;
  task: string;
  category: string;
  status: string;
  dueDate: string | null;
  completedDate: string | null;
  notes: string | null;
  employeeId: string;
  assignedBy: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    avatar?: string | null;
  };
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'nexus-badge nexus-badge-warning',
    in_progress: 'bg-cyan-50 text-cyan-700 nexus-badge',
    completed: 'nexus-badge nexus-badge-success',
    skipped: 'bg-slate-100 text-slate-600 nexus-badge',
  };
  const labels: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    skipped: 'Skipped',
  };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function getCategoryBadge(category: string) {
  const map: Record<string, string> = {
    general: 'bg-slate-50 text-slate-700 nexus-badge',
    documentation: 'bg-blue-50 text-blue-700 nexus-badge',
    it_setup: 'bg-violet-50 text-violet-700 nexus-badge',
    training: 'bg-amber-50 text-amber-700 nexus-badge',
    compliance: 'bg-rose-50 text-rose-700 nexus-badge',
  };
  const labels: Record<string, string> = {
    general: 'General',
    documentation: 'Documentation',
    it_setup: 'IT Setup',
    training: 'Training',
    compliance: 'Compliance',
  };
  return { className: map[category] || 'nexus-badge nexus-badge-info', label: labels[category] || category };
}

const onboardingTips = [
  { title: 'Create Task Templates', description: 'Set up onboarding task templates for common roles to speed up new hire setup' },
  { title: 'Assign by Category', description: 'Categorize tasks as General, Documentation, IT Setup, Training, or Compliance for organized tracking' },
  { title: 'Set Due Dates', description: 'Always set due dates for onboarding tasks to ensure timely completion' },
  { title: 'Complete All Before Active', description: 'Ensure all onboarding tasks are completed before moving the employee to Active status' },
  { title: 'Use Notes for Context', description: 'Add notes to tasks to provide instructions or context for the assignee' },
];

const onboardingWorkflowSteps = [
  { step: 1, title: 'Create Employee', description: 'Add the new employee to the system with basic details', route: '/employees' },
  { step: 2, title: 'Setup Onboarding Tasks', description: 'Create onboarding tasks assigned to the new employee', route: '/onboarding' },
  { step: 3, title: 'Complete Documentation', description: 'Complete all documentation-related onboarding tasks' },
  { step: 4, title: 'Complete IT Setup', description: 'Set up email, workstation, and system access' },
  { step: 5, title: 'Complete Training', description: 'Finish all mandatory training tasks' },
  { step: 6, title: 'Complete Compliance', description: 'Verify all compliance and policy acknowledgements' },
  { step: 7, title: 'Mark All Complete', description: 'Ensure all tasks are marked as completed' },
  { step: 8, title: 'Activate Employee', description: 'Move employee status to Active after all tasks are done', route: '/employees' },
];

const initialForm = {
  employeeId: '',
  task: '',
  category: 'general',
  dueDate: '',
  notes: '',
  status: 'pending',
};

/* ── Component ── */
export default function OnboardingPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [completingId, setCompletingId] = useState<string | null>(null);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      const [tasksRes, empRes] = await Promise.allSettled([
        fetch('/api/onboarding?limit=100', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);

      if (tasksRes.status === 'fulfilled' && tasksRes.value.ok) {
        const data = await tasksRes.value.json();
        setTasks(data.tasks || []);
      }

      if (empRes.status === 'fulfilled' && empRes.value.ok) {
        const data = await empRes.value.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load onboarding data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Filtered tasks */
  const filteredTasks = tasks.filter(t => {
    const matchSearch = !search ||
      t.task.toLowerCase().includes(search.toLowerCase()) ||
      t.employee?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
      t.employee?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !filterCategory || t.category === filterCategory;
    const matchStatus = !filterStatus || t.status === filterStatus;
    return matchSearch && matchCategory && matchStatus;
  });

  /* Summary stats */
  const totalTasks = tasks.length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  /* Show Add Form */
  const handleShowAddForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(true);
    setTimeout(() => {
      document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  /* Show Edit Form */
  const handleShowEditForm = (task: OnboardingTask) => {
    setForm({
      employeeId: task.employeeId,
      task: task.task,
      category: task.category,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
      notes: task.notes || '',
      status: task.status,
    });
    setEditingId(task.id);
    setShowForm(true);
    setTimeout(() => {
      document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  /* Cancel Form */
  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  /* Submit Form */
  const handleSubmit = async () => {
    if (!form.task || !form.category) {
      toast.error('Please fill in required fields: Task, Category');
      return;
    }
    if (!editingId && !form.employeeId) {
      toast.error('Please select an employee');
      return;
    }

    try {
      setSubmitting(true);
      const headers = getAuthHeaders();

      if (editingId) {
        const res = await fetch(`/api/onboarding/${editingId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            task: form.task,
            category: form.category,
            status: form.status,
            dueDate: form.dueDate || null,
            notes: form.notes || null,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Task updated successfully');
      } else {
        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            employeeId: form.employeeId,
            task: form.task,
            category: form.category,
            dueDate: form.dueDate || null,
            notes: form.notes || null,
            assignedBy: user?.name,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Task created successfully');
      }

      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  /* Delete Task */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/onboarding/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Task deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete task');
    } finally {
      setDeleting(false);
    }
  };

  /* Mark Complete */
  const handleMarkComplete = async (id: string) => {
    try {
      setCompletingId(id);
      const res = await fetch(`/api/onboarding/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Task marked as completed');
      fetchData();
    } catch {
      toast.error('Failed to complete task');
    } finally {
      setCompletingId(null);
    }
  };

  const colCount = 7;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiUserPlus className="w-6 h-6 text-emerald-500" />
            Onboarding
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage onboarding tasks for new employees</p>
        </div>
        {isAdmin && (
          <button onClick={handleShowAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Add Task
          </button>
        )}
      </div>

      {/* Module Tips */}
      <ModuleTips
        moduleKey="onboarding"
        title="Onboarding Tips"
        tips={onboardingTips}
      />

      {/* Module Workflow */}
      <ModuleWorkflow
        moduleKey="onboarding"
        title="How to Onboard a New Employee"
        subtitle="Follow this workflow to set up a new hire for success"
        steps={onboardingWorkflowSteps}
        accentColor="emerald"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Total Tasks</p>
          <p className="text-xl font-bold text-nexus-text-primary mt-1">{totalTasks}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Pending</p>
          <p className="text-xl font-bold text-amber-600 mt-1">{pendingCount}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">In Progress</p>
          <p className="text-xl font-bold text-cyan-600 mt-1">{inProgressCount}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Completed</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{completedCount}</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks, employees..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-nexus-text-muted" />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Categories</option>
            <option value="general">General</option>
            <option value="documentation">Documentation</option>
            <option value="it_setup">IT Setup</option>
            <option value="training">Training</option>
            <option value="compliance">Compliance</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
      </div>

      {/* Embedded CRUD Form */}
      {showForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-blue-500 animate-slide-in-down">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingId ? 'Edit Task' : 'Add New Task'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee {!editingId && '*'}</label>
                <select
                  value={form.employeeId}
                  onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
                  disabled={!!editingId}
                  className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-nexus-text-muted"
                >
                  <option value="">Select Employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Task *</label>
                <input
                  type="text"
                  value={form.task}
                  onChange={e => setForm(p => ({ ...p, task: e.target.value }))}
                  placeholder="e.g., Complete IT orientation"
                  className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  <option value="general">General</option>
                  <option value="documentation">Documentation</option>
                  <option value="it_setup">IT Setup</option>
                  <option value="training">Training</option>
                  <option value="compliance">Compliance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Due Date</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              {editingId && (
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="skipped">Skipped</option>
                  </select>
                </div>
              )}
              <div className={editingId ? '' : 'sm:col-span-2'}>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notes</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional notes..."
                  className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Table */}
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Notes</th>
                {isAdmin && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    {isAdmin && <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>}
                  </tr>
                ))
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center">
                    <FiUserPlus className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No onboarding tasks found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Create tasks to track new employee onboarding</p>
                  </td>
                </tr>
              ) : (
                filteredTasks.map(t => {
                  const statusBadge = getStatusBadge(t.status);
                  const categoryBadge = getCategoryBadge(t.category);
                  return (
                    <tr key={t.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      {deleteConfirmId === t.id ? (
                        <td colSpan={colCount} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Are you sure you want to delete &quot;{t.task}&quot;?</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(t.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                                {deleting ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-nexus-text-primary">
                              {t.employee ? `${t.employee.firstName} ${t.employee.lastName}` : '—'}
                            </p>
                            {t.employee && <p className="text-xs text-nexus-text-muted">{t.employee.employeeId}</p>}
                          </td>
                          <td className="px-4 py-3 text-sm text-nexus-text-primary">{t.task}</td>
                          <td className="px-4 py-3"><span className={categoryBadge.className}>{categoryBadge.label}</span></td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(t.dueDate)}</td>
                          <td className="px-4 py-3"><span className={statusBadge.className}>{statusBadge.label}</span></td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary truncate max-w-[150px]">{t.notes || '—'}</td>
                          {isAdmin && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {t.status !== 'completed' && (
                                  <button onClick={() => handleMarkComplete(t.id)} disabled={completingId === t.id} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Mark Complete">
                                    <FiCheck className="w-4 h-4" />
                                  </button>
                                )}
                                <button onClick={() => handleShowEditForm(t)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit">
                                  <FiEdit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setDeleteConfirmId(t.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                  <FiTrash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
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
