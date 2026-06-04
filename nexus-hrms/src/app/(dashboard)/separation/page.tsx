'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiLogOut,
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiX,
  FiCheck,
  FiUserX,
  FiClock,
  FiCalendar,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Separation {
  id: string;
  employeeId: string;
  type: string;
  reason: string;
  noticePeriod?: number | null;
  lastWorkingDate: string;
  status: string;
  exitInterview?: string | null;
  settlementAmount?: number | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
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
    initiated: 'nexus-badge nexus-badge-warning',
    pending: 'nexus-badge nexus-badge-warning',
    notice_period: 'nexus-badge nexus-badge-info',
    exit_interview: 'nexus-badge nexus-badge-info',
    fnf_pending: 'nexus-badge nexus-badge-warning',
    completed: 'nexus-badge nexus-badge-success',
    cancelled: 'bg-slate-100 text-slate-600 nexus-badge',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

const separationTypes = [
  { value: 'resignation', label: 'Resignation' },
  { value: 'termination', label: 'Termination' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'layoff', label: 'Layoff' },
  { value: 'contract_end', label: 'Contract End' },
];

const initialForm = {
  employeeId: '',
  type: '',
  reason: '',
  noticePeriodStartDate: '',
  noticePeriodEndDate: '',
  lastWorkingDate: '',
  status: 'initiated',
  exitInterviewNotes: '',
  fnfAmount: '',
};

/* ── Component ── */
export default function SeparationPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [separations, setSeparations] = useState<Separation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Separation | null>(null);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      params.set('limit', '50');

      const [sepRes, empRes] = await Promise.allSettled([
        fetch(`/api/separation?${params.toString()}`, { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);

      if (sepRes.status === 'fulfilled' && sepRes.value.ok) {
        const data = await sepRes.value.json();
        setSeparations(data.separations || []);
      }

      if (empRes.status === 'fulfilled' && empRes.value.ok) {
        const data = await empRes.value.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load separation data');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const handleOpenView = (record: Separation) => {
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
    if (!isAdmin) return;
    setEditingId(null);
    setViewingId(null);
    setViewingRecord(null);
    setForm(initialForm);
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  /* Open Edit Form */
  const handleOpenEditForm = (s: Separation) => {
    setEditingId(s.id);
    setViewingId(null);
    setViewingRecord(null);
    setForm({
      employeeId: s.employeeId,
      type: s.type,
      reason: s.reason,
      noticePeriodStartDate: '',
      noticePeriodEndDate: '',
      lastWorkingDate: s.lastWorkingDate ? new Date(s.lastWorkingDate).toISOString().split('T')[0] : '',
      status: s.status,
      exitInterviewNotes: s.exitInterview || '',
      fnfAmount: s.settlementAmount ? String(s.settlementAmount) : '',
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
    if (!form.employeeId || !form.type || !form.reason || !form.lastWorkingDate) {
      toast.error('Please fill in required fields: Employee, Type, Reason, Last Working Date');
      return;
    }
    try {
      setSubmitting(true);

      if (editingId) {
        const payload: Record<string, unknown> = { status: form.status };
        if (form.exitInterviewNotes) payload.exitInterview = form.exitInterviewNotes;
        if (form.fnfAmount) payload.settlementAmount = parseFloat(form.fnfAmount);
        const res = await fetch(`/api/separation/${editingId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Separation updated successfully');
      } else {
        const res = await fetch('/api/separation', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            employeeId: form.employeeId,
            type: form.type,
            reason: form.reason,
            noticePeriod: 30,
            lastWorkingDate: form.lastWorkingDate,
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Separation initiated successfully');
      }
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save separation');
    } finally {
      setSubmitting(false);
    }
  };

  /* Handle Delete */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/separation/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Separation deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete separation');
    } finally {
      setDeleting(false);
    }
  };

  /* Handle Status Change */
  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/separation/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(`Status updated to ${status.replace('_', ' ')}`);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  /* Filter separations */
  const filteredSeparations = separations.filter(s => {
    if (filterType && s.type !== filterType) return false;
    if (!search) return true;
    const empName = `${s.employee?.firstName || ''} ${s.employee?.lastName || ''}`.toLowerCase();
    return empName.includes(search.toLowerCase()) ||
      s.reason.toLowerCase().includes(search.toLowerCase());
  });

  /* Summary cards */
  const initiatedCount = separations.filter(s => ['initiated', 'pending'].includes(s.status)).length;
  const noticePeriodCount = separations.filter(s => s.status === 'notice_period').length;
  const completedCount = separations.filter(s => s.status === 'completed').length;
  const resignationCount = separations.filter(s => s.type === 'resignation').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiLogOut className="w-6 h-6 text-rose-500" />
            Separation
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage employee separations and exits</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Initiate Separation
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <FiUserX className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Initiated</p>
              <p className="text-lg font-bold text-nexus-text-primary">{initiatedCount}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <FiClock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Notice Period</p>
              <p className="text-lg font-bold text-nexus-text-primary">{noticePeriodCount}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FiCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Completed</p>
              <p className="text-lg font-bold text-nexus-text-primary">{completedCount}</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <FiLogOut className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Resignations</p>
              <p className="text-lg font-bold text-nexus-text-primary">{resignationCount}</p>
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
              placeholder="Search by employee name or reason..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-nexus-text-muted flex-shrink-0" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Types</option>
              {separationTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
              <option value="">All Status</option>
              <option value="initiated">Initiated</option>
              <option value="notice_period">Notice Period</option>
              <option value="exit_interview">Exit Interview</option>
              <option value="fnf_pending">FnF Pending</option>
              <option value="completed">Completed</option>
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
                View Separation
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
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Type</p>
                <p className="text-sm text-nexus-text-primary capitalize">{viewingRecord.type.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Reason</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.reason}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Notice Period</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.noticePeriod ? `${viewingRecord.noticePeriod} days` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Last Working Date</p>
                <p className="text-sm text-nexus-text-primary">{formatDate(viewingRecord.lastWorkingDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm"><span className={getStatusBadge(viewingRecord.status)}>{viewingRecord.status.replace('_', ' ')}</span></p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Exit Interview</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">{viewingRecord.exitInterview || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">FnF Amount</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.settlementAmount != null ? `${viewingRecord.settlementAmount.toLocaleString()}` : '—'}</p>
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
                {editingId ? 'Edit Separation' : 'Initiate Separation'}
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
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Type *</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} disabled={!!editingId} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-nexus-text-muted">
                  <option value="">Select Type</option>
                  {separationTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Reason *</label>
                <input type="text" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Reason for separation" disabled={!!editingId} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-nexus-text-muted" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notice Period Start</label>
                <input type="date" value={form.noticePeriodStartDate} onChange={e => setForm(p => ({ ...p, noticePeriodStartDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notice Period End</label>
                <input type="date" value={form.noticePeriodEndDate} onChange={e => setForm(p => ({ ...p, noticePeriodEndDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Last Working Date *</label>
                <input type="date" value={form.lastWorkingDate} onChange={e => setForm(p => ({ ...p, lastWorkingDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              {editingId && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="initiated">Initiated</option>
                      <option value="notice_period">Notice Period</option>
                      <option value="exit_interview">Exit Interview</option>
                      <option value="fnf_pending">FnF Pending</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">FnF Amount</label>
                    <input type="number" step="0.01" value={form.fnfAmount} onChange={e => setForm(p => ({ ...p, fnfAmount: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Exit Interview Notes</label>
                    <textarea rows={2} value={form.exitInterviewNotes} onChange={e => setForm(p => ({ ...p, exitInterviewNotes: e.target.value }))} placeholder="Exit interview notes" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" />
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

      {/* Separation Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Reason</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Notice Period</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Last Working Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredSeparations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <FiLogOut className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No separations found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Initiate a separation to get started</p>
                  </td>
                </tr>
              ) : (
                filteredSeparations.map(s => {
                  const isDeleting = deleteConfirmId === s.id;
                  return (
                    <tr key={s.id} className={`border-b border-nexus-border/50 transition-colors ${isDeleting ? 'bg-red-50' : 'hover:bg-slate-50/50'}`}>
                      {isDeleting ? (
                        <td colSpan={7} className="px-4 py-3 bg-red-50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">Are you sure you want to delete?</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(s.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                                {deleting ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-nexus-text-primary">{s.employee?.firstName} {s.employee?.lastName}</p>
                            <p className="text-xs text-nexus-text-muted">{s.employee?.employeeId}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="nexus-badge nexus-badge-info capitalize">{s.type.replace('_', ' ')}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary truncate max-w-[180px]">{s.reason}</td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{s.noticePeriod ? `${s.noticePeriod} days` : '—'}</td>
                          <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(s.lastWorkingDate)}</td>
                          <td className="px-4 py-3"><span className={getStatusBadge(s.status)}>{s.status.replace('_', ' ')}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {isAdmin && s.status === 'initiated' && (
                                <button onClick={() => handleStatusChange(s.id, 'notice_period')} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Start Notice Period">
                                  <FiClock className="w-4 h-4" />
                                </button>
                              )}
                              {isAdmin && s.status === 'notice_period' && (
                                <button onClick={() => handleStatusChange(s.id, 'exit_interview')} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Start Exit Interview">
                                  <FiCalendar className="w-4 h-4" />
                                </button>
                              )}
                              {isAdmin && s.status === 'exit_interview' && (
                                <button onClick={() => handleStatusChange(s.id, 'fnf_pending')} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="FnF Pending">
                                  <FiCalendar className="w-4 h-4" />
                                </button>
                              )}
                              {isAdmin && s.status === 'fnf_pending' && (
                                <button onClick={() => handleStatusChange(s.id, 'completed')} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Mark Completed">
                                  <FiCheck className="w-4 h-4" />
                                </button>
                              )}
                              {isAdmin && (
                                <>
                                  <button onClick={() => handleOpenView(s)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                                  <button onClick={() => handleOpenEditForm(s)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit">
                                    <FiEdit2 className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setDeleteConfirmId(s.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                    <FiTrash2 className="w-4 h-4" />
                                  </button>
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
