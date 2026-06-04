'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiAlertCircle,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiX,
  FiCheck,
  FiAlertTriangle,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Grievance {
  id: string;
  employeeId: string;
  type: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  resolution?: string | null;
  assignedTo?: string | null;
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
    submitted: 'nexus-badge nexus-badge-warning',
    investigating: 'nexus-badge nexus-badge-info',
    resolved: 'nexus-badge nexus-badge-success',
    closed: 'bg-slate-100 text-slate-600 nexus-badge',
    escalated: 'nexus-badge nexus-badge-error',
    open: 'nexus-badge nexus-badge-warning',
    in_progress: 'nexus-badge nexus-badge-info',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = {
    low: 'nexus-badge nexus-badge-success',
    medium: 'nexus-badge nexus-badge-warning',
    high: 'bg-orange-50 text-orange-700 nexus-badge',
    critical: 'bg-red-50 text-red-700 nexus-badge',
  };
  return map[priority] || 'nexus-badge nexus-badge-info';
}

const grievanceTypes = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'discrimination', label: 'Discrimination' },
  { value: 'workplace', label: 'Workplace Issue' },
  { value: 'compensation', label: 'Compensation' },
  { value: 'policy', label: 'Policy Violation' },
  { value: 'other', label: 'Other' },
];

const initialForm = {
  employeeId: '',
  type: '',
  subject: '',
  description: '',
  priority: 'medium',
  status: 'submitted',
  resolution: '',
  assignedTo: '',
};

/* ── Component ── */
export default function GrievancesPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Grievance | null>(null);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);
      params.set('limit', '50');

      const [grRes, empRes] = await Promise.allSettled([
        fetch(`/api/grievances?${params.toString()}`, { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);

      if (grRes.status === 'fulfilled' && grRes.value.ok) {
        const data = await grRes.value.json();
        setGrievances(data.grievances || []);
      }

      if (empRes.status === 'fulfilled' && empRes.value.ok) {
        const data = await empRes.value.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load grievances');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const handleOpenView = (record: Grievance) => {
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
  const handleOpenEditForm = (g: Grievance) => {
    setEditingId(g.id);
    setViewingId(null);
    setViewingRecord(null);
    setForm({
      employeeId: g.employeeId,
      type: g.type,
      subject: g.subject,
      description: g.description,
      priority: g.priority,
      status: g.status,
      resolution: g.resolution || '',
      assignedTo: g.assignedTo || '',
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
    if (!form.type || !form.subject || !form.description) {
      toast.error('Please fill in required fields: Type, Subject, Description');
      return;
    }
    try {
      setSubmitting(true);

      if (editingId) {
        const payload: Record<string, string> = { status: form.status };
        if (form.resolution) payload.resolution = form.resolution;
        if (form.assignedTo) payload.assignedTo = form.assignedTo;
        const res = await fetch(`/api/grievances/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Grievance updated successfully');
      } else {
        if (!form.employeeId) {
          toast.error('Please select an employee');
          setSubmitting(false);
          return;
        }
        const res = await fetch('/api/grievances', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            employeeId: form.employeeId,
            type: form.type,
            subject: form.subject,
            description: form.description,
            priority: form.priority,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Grievance filed successfully');
      }
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save grievance');
    } finally {
      setSubmitting(false);
    }
  };

  /* Handle Delete */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/grievances/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Grievance deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete grievance');
    } finally {
      setDeleting(false);
    }
  };

  /* Handle Status Change */
  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/grievances/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(`Grievance marked as ${status}`);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  /* Filter grievances */
  const filteredGrievances = grievances.filter(g => {
    if (filterType && g.type !== filterType) return false;
    if (filterPriority && g.priority !== filterPriority) return false;
    if (!search) return true;
    const empName = `${g.employee?.firstName || ''} ${g.employee?.lastName || ''}`.toLowerCase();
    return empName.includes(search.toLowerCase()) ||
      g.subject.toLowerCase().includes(search.toLowerCase()) ||
      g.description.toLowerCase().includes(search.toLowerCase());
  });

  /* Summary cards */
  const openCount = grievances.filter(g => ['submitted', 'open'].includes(g.status)).length;
  const investigatingCount = grievances.filter(g => ['investigating', 'in_progress'].includes(g.status)).length;
  const resolvedCount = grievances.filter(g => g.status === 'resolved').length;
  const criticalCount = grievances.filter(g => g.priority === 'critical').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiAlertCircle className="w-6 h-6 text-red-500" />
            Grievances
          </h1>
          <p className="text-nexus-text-secondary mt-1">Report and manage workplace grievances</p>
        </div>
        <button onClick={handleOpenAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" />
          File Grievance
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <FiAlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Open</p>
              <p className="text-lg font-bold text-nexus-text-primary">{openCount}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <FiEye className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Investigating</p>
              <p className="text-lg font-bold text-nexus-text-primary">{investigatingCount}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FiCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Resolved</p>
              <p className="text-lg font-bold text-nexus-text-primary">{resolvedCount}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <FiAlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Critical</p>
              <p className="text-lg font-bold text-nexus-text-primary">{criticalCount}</p>
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
              placeholder="Search by subject, employee, or description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FiFilter className="w-4 h-4 text-nexus-text-muted flex-shrink-0" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Types</option>
              {grievanceTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Status</option>
              <option value="submitted">Submitted</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="escalated">Escalated</option>
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
                View Grievance
              </h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Type</p>
                <p className="text-sm text-nexus-text-primary capitalize">{viewingRecord.type.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Subject</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.subject}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Employee</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.employee ? `${viewingRecord.employee.firstName} ${viewingRecord.employee.lastName}` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Priority</p>
                <p className="text-sm"><span className={getPriorityBadge(viewingRecord.priority)}>{viewingRecord.priority}</span></p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm"><span className={getStatusBadge(viewingRecord.status)}>{viewingRecord.status.replace('_', ' ')}</span></p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Assigned To</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.assignedTo || 'Unassigned'}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Description</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">{viewingRecord.description}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Resolution</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">{viewingRecord.resolution || '—'}</p>
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
                {editingId ? 'Edit Grievance' : 'File Grievance'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Type *</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} disabled={!!editingId} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-nexus-text-muted">
                  <option value="">Select Type</option>
                  {grievanceTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              {!editingId && (
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                  <select value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="">Select Employee</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeId})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Subject *</label>
                <input type="text" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Brief subject" disabled={!!editingId} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-nexus-text-muted" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description *</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the grievance in detail" disabled={!!editingId} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none disabled:bg-slate-50 disabled:text-nexus-text-muted" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Priority *</label>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} disabled={!!editingId} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-nexus-text-muted">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              {editingId && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="submitted">Submitted</option>
                      <option value="investigating">Investigating</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                      <option value="escalated">Escalated</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Assigned To</label>
                    <select value={form.assignedTo} onChange={e => setForm(p => ({ ...p, assignedTo: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="">Unassigned</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Resolution</label>
                    <textarea rows={2} value={form.resolution} onChange={e => setForm(p => ({ ...p, resolution: e.target.value }))} placeholder="Resolution details" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" />
                  </div>
                </>
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

      {/* Grievances Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Subject</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredGrievances.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FiAlertCircle className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No grievances found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">File a grievance to get started</p>
                  </td>
                </tr>
              ) : (
                filteredGrievances.map(g => {
                  const isDeleting = deleteConfirmId === g.id;
                  return (
                    <tr key={g.id} className={`border-b border-nexus-border/50 transition-colors ${isDeleting ? 'bg-red-50' : 'hover:bg-slate-50/50'}`}>
                      {isDeleting ? (
                        <td colSpan={6} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Are you sure you want to delete?</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(g.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                                {deleting ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <span className="nexus-badge nexus-badge-info capitalize">{g.type.replace('_', ' ')}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-nexus-text-primary truncate max-w-[200px]">{g.subject}</p>
                            <p className="text-xs text-nexus-text-muted truncate max-w-[200px]">{g.description}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-nexus-text-primary">{g.employee?.firstName} {g.employee?.lastName}</p>
                            <p className="text-xs text-nexus-text-muted">{g.employee?.employeeId}</p>
                          </td>
                          <td className="px-4 py-3"><span className={getPriorityBadge(g.priority)}>{g.priority}</span></td>
                          <td className="px-4 py-3"><span className={getStatusBadge(g.status)}>{g.status.replace('_', ' ')}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {isAdmin && g.status !== 'resolved' && g.status !== 'closed' && (
                                <button onClick={() => handleStatusChange(g.id, 'investigating')} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Mark Investigating">
                                  <FiEye className="w-4 h-4" />
                                </button>
                              )}
                              {isAdmin && g.status === 'investigating' && (
                                <button onClick={() => handleStatusChange(g.id, 'resolved')} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Mark Resolved">
                                  <FiCheck className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => handleOpenView(g)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View Details"><FiEye className="w-4 h-4" /></button>
                              <button onClick={() => handleOpenEditForm(g)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit">
                                <FiEdit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => setDeleteConfirmId(g.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
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
