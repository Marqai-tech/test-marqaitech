'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiMail,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiEye,
  FiCheckCircle,
  FiClock,
  FiXCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface Offer {
  id: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle?: string | null;
  departmentId?: string | null;
  offeredSalary?: number | null;
  currency: string;
  offerDate: string;
  joiningDate?: string | null;
  status: string;
  notes?: string | null;
  createdAt: string;
}

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
    draft: 'nexus-badge',
    sent: 'nexus-badge nexus-badge-warning',
    accepted: 'nexus-badge nexus-badge-success',
    rejected: 'nexus-badge nexus-badge-error',
    withdrawn: 'nexus-badge nexus-badge-info',
  };
  return map[status] || 'nexus-badge';
}

const OFFER_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'withdrawn'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD'];

const initialForm = {
  candidateName: '',
  candidateEmail: '',
  jobTitle: '',
  departmentId: '',
  offeredSalary: '',
  currency: 'USD',
  offerDate: '',
  joiningDate: '',
  status: 'draft',
  notes: '',
};

export default function OffersPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [offers, setOffers] = useState<Offer[]>([]);
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
      const res = await fetch('/api/offers?limit=100', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setOffers(data.offers || []); }
    } catch (err) { console.error(err); toast.error('Failed to load offers'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const handleOpenAdd = () => {
    setForm(initialForm); setEditingId(null); setShowForm(true); setViewingId(null); setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenEdit = (o: Offer) => {
    setForm({
      candidateName: o.candidateName, candidateEmail: o.candidateEmail, jobTitle: o.jobTitle || '',
      departmentId: o.departmentId || '', offeredSalary: o.offeredSalary != null ? String(o.offeredSalary) : '',
      currency: o.currency, offerDate: o.offerDate ? o.offerDate.split('T')[0] : '',
      joiningDate: o.joiningDate ? o.joiningDate.split('T')[0] : '', status: o.status, notes: o.notes || '',
    });
    setEditingId(o.id); setShowForm(true); setViewingId(null); setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenView = (o: Offer) => { setViewingId(o.id); setShowForm(false); setDeleteConfirmId(null); setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const handleCloseView = () => setViewingId(null);
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm(initialForm); };

  const handleSubmit = async () => {
    if (!form.candidateName.trim() || !form.candidateEmail.trim()) { toast.error('Please fill in candidate name and email'); return; }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        candidateName: form.candidateName.trim(), candidateEmail: form.candidateEmail.trim(),
        jobTitle: form.jobTitle.trim() || null, departmentId: form.departmentId || null,
        offeredSalary: form.offeredSalary ? parseFloat(form.offeredSalary) : null,
        currency: form.currency, offerDate: form.offerDate || undefined,
        joiningDate: form.joiningDate || null, status: form.status, notes: form.notes.trim() || null,
      };
      const url = editingId ? `/api/offers/${editingId}` : '/api/offers';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Offer updated successfully' : 'Offer created successfully');
      handleCancelForm(); fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to save offer'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try { setDeleting(true); const res = await fetch(`/api/offers/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); } toast.success('Offer deleted'); setDeleteConfirmId(null); fetchData(); }
    catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); } finally { setDeleting(false); }
  };

  const filtered = offers.filter(o => {
    const matchSearch = !search || o.candidateName.toLowerCase().includes(search.toLowerCase()) || (o.jobTitle || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalCount = offers.length;
  const pendingCount = offers.filter(o => ['draft', 'sent'].includes(o.status)).length;
  const acceptedCount = offers.filter(o => o.status === 'accepted').length;
  const rejectedCount = offers.filter(o => o.status === 'rejected').length;

  const viewingItem = viewingId ? offers.find(o => o.id === viewingId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2"><FiMail className="w-6 h-6 text-pink-500" />Offers</h1>
          <p className="text-nexus-text-secondary mt-1">Manage candidate offers and responses</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors"><FiPlus className="w-4 h-4" />Add Offer</button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiMail className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{totalCount}</p><p className="text-xs text-nexus-text-muted">Total Offers</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiClock className="w-5 h-5 text-amber-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{pendingCount}</p><p className="text-xs text-nexus-text-muted">Pending</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{acceptedCount}</p><p className="text-xs text-nexus-text-muted">Accepted</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><FiXCircle className="w-5 h-5 text-red-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{rejectedCount}</p><p className="text-xs text-nexus-text-muted">Rejected</p></div></div></div>
      </div>

      {viewingItem && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-pink-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">Offer Details</h2><button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Candidate Name</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingItem.candidateName}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Candidate Email</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.candidateEmail}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Job Title</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.jobTitle || '—'}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Offered Salary</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.offeredSalary)} {viewingItem.currency}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Offer Date</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(viewingItem.offerDate)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Joining Date</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(viewingItem.joiningDate)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status}</span></p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Notes</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.notes || '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Offer' : 'Add Offer'}</h2><button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Candidate Name *</label><input type="text" value={form.candidateName} onChange={e => setForm(p => ({ ...p, candidateName: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Full name" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Candidate Email *</label><input type="email" value={form.candidateEmail} onChange={e => setForm(p => ({ ...p, candidateEmail: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="email@example.com" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Job Title</label><input type="text" value={form.jobTitle} onChange={e => setForm(p => ({ ...p, jobTitle: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Position offered" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Offered Salary</label><input type="number" step="0.01" value={form.offeredSalary} onChange={e => setForm(p => ({ ...p, offeredSalary: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Currency</label><select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Offer Date</label><input type="date" value={form.offerDate} onChange={e => setForm(p => ({ ...p, offerDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Joining Date</label><input type="date" value={form.joiningDate} onChange={e => setForm(p => ({ ...p, joiningDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{OFFER_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Additional notes..." /></div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search offers..." /></div>
        <div className="flex items-center gap-2"><FiFilter className="w-4 h-4 text-nexus-text-muted" /><select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">All Statuses</option>{OFFER_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
      </div>

      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Candidate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Job Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Salary</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Joining Date</th>
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
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FiMail className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No offers found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(o => (
                  <tr key={o.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === o.id ? (
                      <td colSpan={6} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Delete offer for &quot;{o.candidateName}&quot;?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(o.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-nexus-text-primary">{o.candidateName}</p>
                          <p className="text-xs text-nexus-text-muted">{o.candidateEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{o.jobTitle || '—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-nexus-text-primary">{formatCurrency(o.offeredSalary)}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(o.joiningDate)}</td>
                        <td className="px-4 py-3"><span className={getStatusBadge(o.status)}>{o.status}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleOpenView(o)} className="p-2 rounded-lg text-nexus-text-muted hover:text-pink-500 hover:bg-pink-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                            {isAdmin && (
                              <>
                                <button onClick={() => handleOpenEdit(o)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                                <button onClick={() => { setDeleteConfirmId(o.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
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
