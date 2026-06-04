'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiWatch,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiX,
  FiClock,
  FiCheck,
  FiCalendar,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Timesheet {
  id: string;
  employeeId: string;
  date: string;
  project?: string | null;
  task?: string | null;
  hours: number;
  description?: string | null;
  status: string;
  approvedBy?: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    avatar?: string | null;
  } | null;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
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

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'nexus-badge nexus-badge-info',
    submitted: 'nexus-badge nexus-badge-warning',
    approved: 'nexus-badge nexus-badge-success',
    rejected: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

const initialForm = {
  employeeId: '',
  date: new Date().toISOString().split('T')[0],
  project: '',
  task: '',
  hours: '',
  description: '',
  status: 'draft',
};

/* ── Component ── */
export default function TimesheetsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Timesheet | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProject, setFilterProject] = useState('');

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      params.set('limit', '50');

      const [tsRes, empRes] = await Promise.allSettled([
        fetch(`/api/timesheets?${params.toString()}`, { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);

      if (tsRes.status === 'fulfilled' && tsRes.value.ok) {
        const data = await tsRes.value.json();
        setTimesheets(data.timesheets || []);
      }

      if (empRes.status === 'fulfilled' && empRes.value.ok) {
        const data = await empRes.value.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load timesheets');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Open Add Form */
  const handleOpenAddForm = () => {
    setEditingId(null);
    setViewingId(null);
    setViewingRecord(null);
    setForm(initialForm);
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  /* Open Edit Form */
  const handleOpenView = (record: Timesheet) => {
    setViewingId(record.id);
    setViewingRecord(record);
    setShowForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCloseView = () => {
    setViewingId(null);
    setViewingRecord(null);
  };

  const handleOpenEditForm = (t: Timesheet) => {
    setViewingId(null);
    setViewingRecord(null);
    setEditingId(t.id);
    setForm({
      employeeId: t.employeeId,
      date: t.date ? new Date(t.date).toISOString().split('T')[0] : '',
      project: t.project || '',
      task: t.task || '',
      hours: String(t.hours),
      description: t.description || '',
      status: t.status,
    });
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  /* Handle Submit */
  const handleSubmit = async () => {
    if (!form.employeeId || !form.date || !form.hours) {
      toast.error('Please fill in required fields: Employee, Date, Hours');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        employeeId: form.employeeId,
        date: form.date,
        project: form.project,
        task: form.task,
        hours: parseFloat(form.hours),
        description: form.description,
      };

      if (editingId) {
        const res = await fetch(`/api/timesheets/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ status: form.status }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Timesheet updated successfully');
      } else {
        const res = await fetch('/api/timesheets', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Timesheet created successfully');
      }
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save timesheet');
    } finally {
      setSubmitting(false);
    }
  };

  /* Handle Delete */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/timesheets/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Timesheet deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete timesheet');
    } finally {
      setDeleting(false);
    }
  };

  /* Handle Status Change (Approve/Reject) */
  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/timesheets/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(`Timesheet ${status} successfully`);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  /* Filter timesheets */
  const filteredTimesheets = timesheets.filter(t => {
    if (filterProject && t.project !== filterProject) return false;
    if (!search) return true;
    const empName = `${t.employee?.firstName || ''} ${t.employee?.lastName || ''}`.toLowerCase();
    return empName.includes(search.toLowerCase()) ||
      (t.project || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.task || '').toLowerCase().includes(search.toLowerCase());
  });

  /* Unique projects for filter */
  const uniqueProjects = [...new Set(timesheets.map(t => t.project).filter(Boolean))];

  /* Summary cards */
  const totalHours = timesheets.reduce((s, t) => s + (t.hours || 0), 0);
  const thisWeekHours = timesheets.filter(t => {
    const d = new Date(t.date);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= weekAgo && d <= now;
  }).reduce((s, t) => s + (t.hours || 0), 0);
  const approvedCount = timesheets.filter(t => t.status === 'approved').length;
  const pendingCount = timesheets.filter(t => ['draft', 'submitted'].includes(t.status)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiWatch className="w-6 h-6 text-violet-500" />
            Timesheets
          </h1>
          <p className="text-nexus-text-secondary mt-1">Track and manage work hours</p>
        </div>
        <button onClick={handleOpenAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" />
          Log Time
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <FiClock className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Total Hours</p>
              <p className="text-lg font-bold text-nexus-text-primary">{totalHours.toFixed(1)}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <FiCalendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">This Week</p>
              <p className="text-lg font-bold text-nexus-text-primary">{thisWeekHours.toFixed(1)}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FiCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Approved</p>
              <p className="text-lg font-bold text-nexus-text-primary">{approvedCount}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <FiWatch className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Pending</p>
              <p className="text-lg font-bold text-nexus-text-primary">{pendingCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="nexus-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
            <input
              type="text"
              placeholder="Search by employee, project, or task..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-nexus-text-muted flex-shrink-0" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Projects</option>
              {uniqueProjects.map(p => (
                <option key={p} value={p!}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Embedded Form (Add/Edit) */}
      {viewingId && viewingRecord && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-violet-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                <FiEye className="w-5 h-5 text-violet-500" />
                View Timesheet
              </h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Employee</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.employee ? `${viewingRecord.employee.firstName} ${viewingRecord.employee.lastName}` : '—'</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Date</p>
                <p className="text-sm text-nexus-text-primary">formatDate(viewingRecord.date)</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Project</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.project || '—'</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Task</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.task || '—'</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Hours</p>
                <p className="text-sm text-nexus-text-primary">`${viewingRecord.hours}h'</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Description</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">viewingRecord.description || '—'</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.status</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Approved By</p>
                <p className="text-sm text-nexus-text-primary">viewingRecord.approvedBy || '—'</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={() => { handleOpenEditForm(viewingRecord); setViewingId(null); }} className="px-4 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
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
        <div id="crud-form" className={`nexus-card border-l-4 transition-all duration-300 ease-in-out ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingId ? 'Edit Timesheet' : 'Log Time'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                <select
                  value={form.employeeId}
                  onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
                  disabled={!!editingId}
                  className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-nexus-text-muted"
                >
                  <option value="">Select Employee</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Date *</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Project *</label>
                <input type="text" value={form.project} onChange={e => setForm(p => ({ ...p, project: e.target.value }))} placeholder="Project name" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Task *</label>
                <input type="text" value={form.task} onChange={e => setForm(p => ({ ...p, task: e.target.value }))} placeholder="Task description" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Hours *</label>
                <input type="number" step="0.5" min="0" max="24" value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} placeholder="0.0" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
                <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              {editingId && (
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}
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

      {/* Timesheets Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Project</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Task</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Hours</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredTimesheets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <FiWatch className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No timesheets found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Log your time to get started</p>
                  </td>
                </tr>
              ) : (
                filteredTimesheets.map(t => {
                  const isDeleting = deleteConfirmId === t.id;
                  return (
                    <tr key={t.id} className={`border-b border-nexus-border/50 transition-colors ${isDeleting ? 'bg-red-50' : 'hover:bg-slate-50/50'}`}>
                      {isDeleting ? (
                        <td colSpan={7} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Are you sure you want to delete?</span>
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
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(t.date)}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-nexus-text-primary">{t.employee?.firstName} {t.employee?.lastName}</p>
                            <p className="text-xs text-nexus-text-muted">{t.employee?.employeeId}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{t.project || '—'}</td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary truncate max-w-[200px]">{t.task || '—'}</td>
                          <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{t.hours}h</td>
                          <td className="px-4 py-3"><span className={getStatusBadge(t.status)}>{t.status}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {isAdmin && t.status === 'submitted' && (
                                <>
                                  <button onClick={() => handleStatusChange(t.id, 'approved')} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Approve">
                                    <FiCheck className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleStatusChange(t.id, 'rejected')} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Reject">
                                    <FiX className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              <button onClick={() => handleOpenView(t)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              <button onClick={() => handleOpenEditForm(t)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit">
                                <FiEdit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => setDeleteConfirmId(t.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                <FiTrash2 className="w-4 h-4" />
                              </button>
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
