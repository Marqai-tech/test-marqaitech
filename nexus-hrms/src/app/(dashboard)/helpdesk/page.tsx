'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiLifeBuoy,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiEye,
  FiAlertCircle,
  FiClock,
  FiCheckCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface HelpDeskTicket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  description?: string | null;
  status: string;
  raisedById?: string | null;
  assignedToId?: string | null;
  resolution?: string | null;
  createdAt: string;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
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
  const map: Record<string, string> = { open: 'nexus-badge nexus-badge-warning', in_progress: 'nexus-badge nexus-badge-info', resolved: 'nexus-badge nexus-badge-success', closed: 'bg-slate-100 text-slate-600 nexus-badge' };
  return map[status] || 'nexus-badge';
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = { low: 'nexus-badge nexus-badge-success', medium: 'nexus-badge nexus-badge-warning', high: 'bg-orange-50 text-orange-700 nexus-badge', critical: 'nexus-badge nexus-badge-error' };
  return map[priority] || 'nexus-badge';
}

const CATEGORIES = ['IT', 'HR', 'Payroll', 'Finance', 'Admin', 'Other'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

const initialForm = { subject: '', category: 'Other', priority: 'medium', description: '', status: 'open', raisedById: '', assignedToId: '', resolution: '' };

export default function HelpDeskPage() {
  const { user } = useAuthStore();

  const [tickets, setTickets] = useState<HelpDeskTicket[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

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
      const [tRes, eRes] = await Promise.allSettled([
        fetch('/api/helpdesk?limit=100', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (tRes.status === 'fulfilled' && tRes.value.ok) { const data = await tRes.value.json(); setTickets(data.tickets || []); }
      if (eRes.status === 'fulfilled' && eRes.value.ok) { const data = await eRes.value.json(); setEmployees(data.employees || []); }
    } catch (err) { console.error(err); toast.error('Failed to load tickets'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const getEmployeeName = (id: string | null | undefined) => {
    if (!id) return '—';
    const emp = employees.find(e => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}` : id;
  };

  const handleOpenAdd = () => { setForm(initialForm); setEditingId(null); setShowForm(true); setViewingId(null); setDeleteConfirmId(null); setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const handleOpenEdit = (t: HelpDeskTicket) => {
    setForm({ subject: t.subject, category: t.category, priority: t.priority, description: t.description || '', status: t.status, raisedById: t.raisedById || '', assignedToId: t.assignedToId || '', resolution: t.resolution || '' });
    setEditingId(t.id); setShowForm(true); setViewingId(null); setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };
  const handleOpenView = (t: HelpDeskTicket) => { setViewingId(t.id); setShowForm(false); setDeleteConfirmId(null); setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const handleCloseView = () => setViewingId(null);
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm(initialForm); };

  const handleSubmit = async () => {
    if (!form.subject.trim()) { toast.error('Please fill in the subject'); return; }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = { subject: form.subject.trim(), category: form.category, priority: form.priority, description: form.description.trim() || null, status: form.status, raisedById: form.raisedById || null, assignedToId: form.assignedToId || null, resolution: form.resolution.trim() || null };
      const url = editingId ? `/api/helpdesk/${editingId}` : '/api/helpdesk';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Ticket updated' : 'Ticket created');
      handleCancelForm(); fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try { setDeleting(true); const res = await fetch(`/api/helpdesk/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); } toast.success('Ticket deleted'); setDeleteConfirmId(null); fetchData(); }
    catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); } finally { setDeleting(false); }
  };

  const filtered = tickets.filter(t => {
    const matchSearch = !search || t.subject.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || t.status === filterStatus;
    const matchCategory = !filterCategory || t.category === filterCategory;
    return matchSearch && matchStatus && matchCategory;
  });

  const totalCount = tickets.length;
  const openCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length;

  const viewingItem = viewingId ? tickets.find(t => t.id === viewingId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2"><FiLifeBuoy className="w-6 h-6 text-indigo-500" />Help Desk</h1><p className="text-nexus-text-secondary mt-1">Manage support tickets and requests</p></div>
        <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors"><FiPlus className="w-4 h-4" />New Ticket</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiLifeBuoy className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{totalCount}</p><p className="text-xs text-nexus-text-muted">Total Tickets</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiAlertCircle className="w-5 h-5 text-amber-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{openCount}</p><p className="text-xs text-nexus-text-muted">Open</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiClock className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{inProgressCount}</p><p className="text-xs text-nexus-text-muted">In Progress</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{resolvedCount}</p><p className="text-xs text-nexus-text-muted">Resolved</p></div></div></div>
      </div>

      {viewingItem && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-indigo-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">Ticket Details</h2><button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Subject</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingItem.subject}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Category</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.category}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Priority</p><p className="mt-0.5"><span className={getPriorityBadge(viewingItem.priority)}>{viewingItem.priority}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status.replace('_', ' ')}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Raised By</p><p className="text-sm text-nexus-text-primary mt-0.5">{getEmployeeName(viewingItem.raisedById)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Assigned To</p><p className="text-sm text-nexus-text-primary mt-0.5">{getEmployeeName(viewingItem.assignedToId)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Created</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(viewingItem.createdAt)}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Description</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.description || '—'}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Resolution</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.resolution || '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Ticket' : 'New Ticket'}</h2><button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Subject *</label><input type="text" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Ticket subject" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category</label><select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Priority</label><select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Raised By</label><select value={form.raisedById} onChange={e => setForm(p => ({ ...p, raisedById: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">Select Employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Assigned To</label><select value={form.assignedToId} onChange={e => setForm(p => ({ ...p, assignedToId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">Unassigned</option>{employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label><textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Describe the issue..." /></div>
              {editingId && (<div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Resolution</label><textarea rows={2} value={form.resolution} onChange={e => setForm(p => ({ ...p, resolution: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Resolution details..." /></div>)}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search tickets..." /></div>
        <div className="flex items-center gap-2"><FiFilter className="w-4 h-4 text-nexus-text-muted" /><select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">All Categories</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select><select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">All Statuses</option>{STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}</select></div>
      </div>

      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-nexus-border bg-slate-50/50"><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Subject</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Category</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Priority</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Assigned To</th><th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th></tr></thead>
            <tbody>
              {loading ? (Array.from({ length: 3 }).map((_, i) => (<tr key={i} className="border-b border-nexus-border/50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td></tr>)))
              : filtered.length === 0 ? (<tr><td colSpan={6} className="px-4 py-12 text-center"><FiLifeBuoy className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No tickets found</p></td></tr>)
              : filtered.map(t => (
                <tr key={t.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                  {deleteConfirmId === t.id ? (
                    <td colSpan={6} className="px-4 py-3 bg-red-50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-red-700 font-medium">Delete &quot;{t.subject}&quot;?</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleDelete(t.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                          <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{t.subject}</td>
                      <td className="px-4 py-3"><span className="nexus-badge nexus-badge-info">{t.category}</span></td>
                      <td className="px-4 py-3"><span className={getPriorityBadge(t.priority)}>{t.priority}</span></td>
                      <td className="px-4 py-3"><span className={getStatusBadge(t.status)}>{t.status.replace('_', ' ')}</span></td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{getEmployeeName(t.assignedToId)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleOpenView(t)} className="p-2 rounded-lg text-nexus-text-muted hover:text-indigo-500 hover:bg-indigo-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                          <button onClick={() => handleOpenEdit(t)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                          <button onClick={() => { setDeleteConfirmId(t.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
