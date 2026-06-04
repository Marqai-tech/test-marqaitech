'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiClipboard,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiEye,
  FiCheckCircle,
  FiClock,
  FiAlertTriangle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Requisition {
  id: string;
  title: string;
  departmentId?: string | null;
  position?: string | null;
  vacancies: number;
  priority: string;
  status: string;
  requestedBy?: string | null;
  description?: string | null;
  deadline?: string | null;
  createdAt: string;
}

interface Department {
  id: string;
  name: string;
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
    draft: 'nexus-badge',
    submitted: 'nexus-badge nexus-badge-warning',
    approved: 'nexus-badge nexus-badge-success',
    rejected: 'nexus-badge nexus-badge-error',
    filled: 'nexus-badge nexus-badge-info',
  };
  return map[status] || 'nexus-badge';
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = {
    low: 'nexus-badge nexus-badge-success',
    medium: 'nexus-badge nexus-badge-warning',
    high: 'bg-orange-50 text-orange-700 nexus-badge',
    urgent: 'nexus-badge nexus-badge-error',
  };
  return map[priority] || 'nexus-badge';
}

const REQUISITION_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'filled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const initialForm = {
  title: '',
  departmentId: '',
  position: '',
  vacancies: '1',
  priority: 'medium',
  status: 'draft',
  requestedBy: '',
  description: '',
  deadline: '',
};

export default function RequisitionsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [reqRes, deptRes] = await Promise.all([
        fetch('/api/requisitions?limit=100', { headers }),
        fetch('/api/employees?limit=1', { headers }),
      ]);
      if (reqRes.ok) {
        const data = await reqRes.json();
        setRequisitions(data.requisitions || []);
      }
      // Fetch departments from seed or just use empty array
      // We'll store dept names locally since departments are complex
      if (deptRes.ok) {
        setDepartments([]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load requisitions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const handleOpenAdd = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(true);
    setViewingId(null);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenEdit = (req: Requisition) => {
    setForm({
      title: req.title,
      departmentId: req.departmentId || '',
      position: req.position || '',
      vacancies: String(req.vacancies),
      priority: req.priority,
      status: req.status,
      requestedBy: req.requestedBy || '',
      description: req.description || '',
      deadline: req.deadline ? req.deadline.split('T')[0] : '',
    });
    setEditingId(req.id);
    setShowForm(true);
    setViewingId(null);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenView = (req: Requisition) => {
    setViewingId(req.id);
    setShowForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCloseView = () => setViewingId(null);

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('Please fill in the title');
      return;
    }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        departmentId: form.departmentId || null,
        position: form.position.trim() || null,
        vacancies: parseInt(form.vacancies) || 1,
        priority: form.priority,
        status: form.status,
        requestedBy: form.requestedBy.trim() || null,
        description: form.description.trim() || null,
        deadline: form.deadline || null,
      };

      const url = editingId ? `/api/requisitions/${editingId}` : '/api/requisitions';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Requisition updated successfully' : 'Requisition created successfully');
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save requisition');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/requisitions/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Requisition deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete requisition');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = requisitions.filter(r => {
    const matchSearch = !search || r.title.toLowerCase().includes(search.toLowerCase()) || (r.position || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalCount = requisitions.length;
  const pendingCount = requisitions.filter(r => ['draft', 'submitted'].includes(r.status)).length;
  const approvedCount = requisitions.filter(r => r.status === 'approved').length;
  const filledCount = requisitions.filter(r => r.status === 'filled').length;

  const viewingItem = viewingId ? requisitions.find(r => r.id === viewingId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiClipboard className="w-6 h-6 text-teal-500" />
            Requisitions
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage staffing requisitions and requests</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Add Requisition
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiClipboard className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{totalCount}</p><p className="text-xs text-nexus-text-muted">Total Requisitions</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiClock className="w-5 h-5 text-amber-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{pendingCount}</p><p className="text-xs text-nexus-text-muted">Pending</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{approvedCount}</p><p className="text-xs text-nexus-text-muted">Approved</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center"><FiAlertTriangle className="w-5 h-5 text-teal-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{filledCount}</p><p className="text-xs text-nexus-text-muted">Filled</p></div></div></div>
      </div>

      {viewingItem && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-teal-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Requisition Details</h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Title</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingItem.title}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Position</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.position || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Vacancies</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.vacancies}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Priority</p><p className="mt-0.5"><span className={getPriorityBadge(viewingItem.priority)}>{viewingItem.priority}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Requested By</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.requestedBy || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Deadline</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(viewingItem.deadline)}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Description</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.description || '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Requisition' : 'Add Requisition'}</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Requisition title" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Position</label>
                <input type="text" value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Position" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Vacancies</label>
                <input type="number" value={form.vacancies} onChange={e => setForm(p => ({ ...p, vacancies: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" min="1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Priority</label>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  {REQUISITION_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Requested By</label>
                <input type="text" value={form.requestedBy} onChange={e => setForm(p => ({ ...p, requestedBy: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Requester name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Deadline</label>
                <input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Requisition details..." />
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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search requisitions..." />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-nexus-text-muted" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Statuses</option>
            {REQUISITION_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Position</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Vacancies</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Deadline</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <FiClipboard className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No requisitions found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(req => (
                  <tr key={req.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === req.id ? (
                      <td colSpan={7} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Are you sure you want to delete &quot;{req.title}&quot;?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(req.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{req.title}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{req.position || '—'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-primary">{req.vacancies}</td>
                        <td className="px-4 py-3"><span className={getPriorityBadge(req.priority)}>{req.priority}</span></td>
                        <td className="px-4 py-3"><span className={getStatusBadge(req.status)}>{req.status}</span></td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(req.deadline)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleOpenView(req)} className="p-2 rounded-lg text-nexus-text-muted hover:text-teal-500 hover:bg-teal-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                            {isAdmin && (
                              <>
                                <button onClick={() => handleOpenEdit(req)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                                <button onClick={() => { setDeleteConfirmId(req.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
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
