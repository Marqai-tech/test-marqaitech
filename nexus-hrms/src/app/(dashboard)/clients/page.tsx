'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiBriefcase,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiEye,
  FiCheckCircle,
  FiXCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface Client {
  id: string;
  name: string;
  industry?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
  status: string;
  notes?: string | null;
  createdAt: string;
}

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = { active: 'nexus-badge nexus-badge-success', inactive: 'nexus-badge nexus-badge-error' };
  return map[status] || 'nexus-badge';
}

const initialForm = { name: '', industry: '', contactPerson: '', email: '', phone: '', address: '', city: '', country: '', website: '', status: 'active', notes: '' };

export default function ClientsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [clients, setClients] = useState<Client[]>([]);
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
    try { setLoading(true); const res = await fetch('/api/clients?limit=100', { headers: getAuthHeaders() }); if (res.ok) { const data = await res.json(); setClients(data.clients || []); } }
    catch (err) { console.error(err); toast.error('Failed to load clients'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const handleOpenAdd = () => { setForm(initialForm); setEditingId(null); setShowForm(true); setViewingId(null); setDeleteConfirmId(null); setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const handleOpenEdit = (c: Client) => {
    setForm({ name: c.name, industry: c.industry || '', contactPerson: c.contactPerson || '', email: c.email || '', phone: c.phone || '', address: c.address || '', city: c.city || '', country: c.country || '', website: c.website || '', status: c.status, notes: c.notes || '' });
    setEditingId(c.id); setShowForm(true); setViewingId(null); setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };
  const handleOpenView = (c: Client) => { setViewingId(c.id); setShowForm(false); setDeleteConfirmId(null); setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const handleCloseView = () => setViewingId(null);
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm(initialForm); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Please fill in the client name'); return; }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = { name: form.name.trim(), industry: form.industry.trim() || null, contactPerson: form.contactPerson.trim() || null, email: form.email.trim() || null, phone: form.phone.trim() || null, address: form.address.trim() || null, city: form.city.trim() || null, country: form.country.trim() || null, website: form.website.trim() || null, status: form.status, notes: form.notes.trim() || null };
      const url = editingId ? `/api/clients/${editingId}` : '/api/clients';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Client updated' : 'Client created');
      handleCancelForm(); fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try { setDeleting(true); const res = await fetch(`/api/clients/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); } toast.success('Client deleted'); setDeleteConfirmId(null); fetchData(); }
    catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); } finally { setDeleting(false); }
  };

  const filtered = clients.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.contactPerson || '').toLowerCase().includes(search.toLowerCase()) || (c.email || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalCount = clients.length;
  const activeCount = clients.filter(c => c.status === 'active').length;
  const inactiveCount = clients.filter(c => c.status === 'inactive').length;

  const viewingItem = viewingId ? clients.find(c => c.id === viewingId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2"><FiBriefcase className="w-6 h-6 text-amber-500" />Clients</h1><p className="text-nexus-text-secondary mt-1">Manage client relationships and contacts</p></div>
        {isAdmin && (<button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors"><FiPlus className="w-4 h-4" />Add Client</button>)}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiBriefcase className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{totalCount}</p><p className="text-xs text-nexus-text-muted">Total Clients</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{activeCount}</p><p className="text-xs text-nexus-text-muted">Active</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><FiXCircle className="w-5 h-5 text-red-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{inactiveCount}</p><p className="text-xs text-nexus-text-muted">Inactive</p></div></div></div>
      </div>

      {viewingItem && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-amber-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">Client Details</h2><button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Name</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingItem.name}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Industry</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.industry || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Contact Person</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.contactPerson || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Email</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.email || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Phone</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.phone || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">City</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.city || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Country</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.country || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Website</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.website || '—'}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Address</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.address || '—'}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Notes</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.notes || '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Client' : 'Add Client'}</h2><button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Name *</label><input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Client name" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Industry</label><input type="text" value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Industry" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Contact Person</label><input type="text" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Contact person" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Email</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="email@example.com" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Phone</label><input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Phone number" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">City</label><input type="text" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="City" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Country</label><input type="text" value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Country" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Website</label><input type="text" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="https://..." /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Address</label><input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Street address" /></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Notes..." /></div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search clients..." /></div>
        <div className="flex items-center gap-2"><FiFilter className="w-4 h-4 text-nexus-text-muted" /><select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      </div>

      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Industry</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">City</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-14 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center"><FiBriefcase className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No clients found</p></td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === c.id ? (
                      <td colSpan={6} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Delete &quot;{c.name}&quot;?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(c.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{c.name}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{c.industry || '—'}</td>
                        <td className="px-4 py-3"><p className="text-sm text-nexus-text-primary">{c.contactPerson || '—'}</p><p className="text-xs text-nexus-text-muted">{c.email || ''}</p></td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{c.city || '—'}</td>
                        <td className="px-4 py-3"><span className={getStatusBadge(c.status)}>{c.status}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleOpenView(c)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                            {isAdmin && (<><button onClick={() => handleOpenEdit(c)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button><button onClick={() => { setDeleteConfirmId(c.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button></>)}
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
