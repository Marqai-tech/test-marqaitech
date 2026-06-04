'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiGitBranch,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiEye,
  FiCheckCircle,
  FiXCircle,
  FiFileText,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface Workflow {
  id: string;
  name: string;
  module: string;
  triggerType: string;
  conditions?: string | null;
  actions?: string | null;
  approvers?: string | null;
  status: string;
  priority: string;
  description?: string | null;
  createdAt: string;
}

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = { active: 'nexus-badge nexus-badge-success', inactive: 'nexus-badge nexus-badge-error', draft: 'nexus-badge nexus-badge-warning' };
  return map[status] || 'nexus-badge';
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = { low: 'nexus-badge nexus-badge-success', medium: 'nexus-badge nexus-badge-warning', high: 'bg-orange-50 text-orange-700 nexus-badge' };
  return map[priority] || 'nexus-badge';
}

const MODULES = ['leave', 'attendance', 'payroll', 'recruitment', 'expense', 'travel', 'other'];
const TRIGGER_TYPES = ['on_create', 'on_update', 'on_status_change'];
const WORKFLOW_STATUSES = ['active', 'inactive', 'draft'];
const PRIORITIES = ['low', 'medium', 'high'];

const initialForm = { name: '', module: 'other', triggerType: 'on_create', conditions: '', actions: '', approvers: '', status: 'draft', priority: 'medium', description: '' };

export default function WorkflowsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
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
    try { setLoading(true); const res = await fetch('/api/workflows?limit=100', { headers: getAuthHeaders() }); if (res.ok) { const data = await res.json(); setWorkflows(data.workflows || []); } }
    catch (err) { console.error(err); toast.error('Failed to load workflows'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const handleOpenAdd = () => { setForm(initialForm); setEditingId(null); setShowForm(true); setViewingId(null); setDeleteConfirmId(null); setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const handleOpenEdit = (w: Workflow) => {
    setForm({ name: w.name, module: w.module, triggerType: w.triggerType, conditions: w.conditions || '', actions: w.actions || '', approvers: w.approvers || '', status: w.status, priority: w.priority, description: w.description || '' });
    setEditingId(w.id); setShowForm(true); setViewingId(null); setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };
  const handleOpenView = (w: Workflow) => { setViewingId(w.id); setShowForm(false); setDeleteConfirmId(null); setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const handleCloseView = () => setViewingId(null);
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm(initialForm); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Please fill in the workflow name'); return; }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = { name: form.name.trim(), module: form.module, triggerType: form.triggerType, conditions: form.conditions.trim() || null, actions: form.actions.trim() || null, approvers: form.approvers.trim() || null, status: form.status, priority: form.priority, description: form.description.trim() || null };
      const url = editingId ? `/api/workflows/${editingId}` : '/api/workflows';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Workflow updated' : 'Workflow created');
      handleCancelForm(); fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try { setDeleting(true); const res = await fetch(`/api/workflows/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); } toast.success('Workflow deleted'); setDeleteConfirmId(null); fetchData(); }
    catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); } finally { setDeleting(false); }
  };

  const filtered = workflows.filter(w => {
    const matchSearch = !search || w.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || w.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalCount = workflows.length;
  const activeCount = workflows.filter(w => w.status === 'active').length;
  const inactiveCount = workflows.filter(w => w.status === 'inactive').length;
  const draftCount = workflows.filter(w => w.status === 'draft').length;

  const viewingItem = viewingId ? workflows.find(w => w.id === viewingId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2"><FiGitBranch className="w-6 h-6 text-rose-500" />Workflows</h1><p className="text-nexus-text-secondary mt-1">Manage automation workflows and rules</p></div>
        {isAdmin && (<button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors"><FiPlus className="w-4 h-4" />Add Workflow</button>)}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiGitBranch className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{totalCount}</p><p className="text-xs text-nexus-text-muted">Total Workflows</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{activeCount}</p><p className="text-xs text-nexus-text-muted">Active</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><FiXCircle className="w-5 h-5 text-red-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{inactiveCount}</p><p className="text-xs text-nexus-text-muted">Inactive</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiFileText className="w-5 h-5 text-amber-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{draftCount}</p><p className="text-xs text-nexus-text-muted">Draft</p></div></div></div>
      </div>

      {viewingItem && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-rose-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">Workflow Details</h2><button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Name</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingItem.name}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Module</p><p className="text-sm text-nexus-text-primary mt-0.5 capitalize">{viewingItem.module}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Trigger Type</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.triggerType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Priority</p><p className="mt-0.5"><span className={getPriorityBadge(viewingItem.priority)}>{viewingItem.priority}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status}</span></p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Conditions</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.conditions || '—'}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Actions</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.actions || '—'}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Approvers</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.approvers || '—'}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Description</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.description || '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Workflow' : 'Add Workflow'}</h2><button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label><input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Workflow name" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Module</label><select value={form.module} onChange={e => setForm(p => ({ ...p, module: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{MODULES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Trigger Type</label><select value={form.triggerType} onChange={e => setForm(p => ({ ...p, triggerType: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{TRIGGER_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Priority</label><select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{WORKFLOW_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Conditions</label><textarea rows={2} value={form.conditions} onChange={e => setForm(p => ({ ...p, conditions: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Trigger conditions..." /></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Actions</label><textarea rows={2} value={form.actions} onChange={e => setForm(p => ({ ...p, actions: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Actions to execute..." /></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Approvers</label><input type="text" value={form.approvers} onChange={e => setForm(p => ({ ...p, approvers: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Approver names or roles" /></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label><textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Workflow description..." /></div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search workflows..." /></div>
        <div className="flex items-center gap-2"><FiFilter className="w-4 h-4 text-nexus-text-muted" /><select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">All Statuses</option>{WORKFLOW_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
      </div>

      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-nexus-border bg-slate-50/50"><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Module</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Trigger</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Priority</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th><th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th></tr></thead>
            <tbody>
              {loading ? (Array.from({ length: 3 }).map((_, i) => (<tr key={i} className="border-b border-nexus-border/50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-5 w-14 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td></tr>)))
              : filtered.length === 0 ? (<tr><td colSpan={6} className="px-4 py-12 text-center"><FiGitBranch className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No workflows found</p></td></tr>)
              : filtered.map(w => (<tr key={w.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">{deleteConfirmId === w.id ? (<td colSpan={6} className="px-4 py-3 bg-red-50"><div className="flex items-center justify-between"><span className="text-sm text-red-700 font-medium">Delete &quot;{w.name}&quot;?</span><div className="flex items-center gap-2"><button onClick={() => handleDelete(w.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button><button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button></div></div></td>) : (<><td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{w.name}</td><td className="px-4 py-3"><span className="nexus-badge nexus-badge-info capitalize">{w.module}</span></td><td className="px-4 py-3 text-sm text-nexus-text-secondary">{w.triggerType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td><td className="px-4 py-3"><span className={getPriorityBadge(w.priority)}>{w.priority}</span></td><td className="px-4 py-3"><span className={getStatusBadge(w.status)}>{w.status}</span></td><td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><button onClick={() => handleOpenView(w)} className="p-2 rounded-lg text-nexus-text-muted hover:text-rose-500 hover:bg-rose-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>{isAdmin && (<><button onClick={() => handleOpenEdit(w)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button><button onClick={() => { setDeleteConfirmId(w.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button></>)}</div></td></>)}</tr>)))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
