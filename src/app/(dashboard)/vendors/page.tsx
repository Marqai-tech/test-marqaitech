'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiStar, FiTruck, FiLayers,
  FiEye, FiEdit2, FiTrash2, FiGlobe, FiMail, FiPhone,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'nexus-badge nexus-badge-success',
    inactive: 'nexus-badge bg-slate-100 text-slate-600',
    pending: 'nexus-badge nexus-badge-warning',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getTypeBadge(type: string) {
  if (type === 'vendor') return 'nexus-badge nexus-badge-primary';
  if (type === 'sub_vendor') return 'nexus-badge nexus-badge-purple';
  return 'nexus-badge nexus-badge-info';
}

const emptyForm = {
  name: '', code: '', type: 'vendor', parentVendorId: '', industry: '', contactName: '', contactEmail: '', contactPhone: '', specialization: '',
};

interface Vendor {
  id: string; name: string; code: string | null; type: string; industry: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null; specialization: string | null; rating: number; status: string;
  parentVendor?: { id: string; name: string; code: string | null } | null;
  childVendors?: { id: string; name: string; type: string; code: string | null; status: string; candidateCount: number; rating: number }[];
  _count?: { childVendors: number };
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [form, setForm] = useState({ ...emptyForm });

  const fetchVendors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/vendors', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setVendors(Array.isArray(data) ? data : data.vendors || []); }
    } catch { toast.error('Failed to load vendors'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const handleAddNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setViewingId(null);
    setShowForm(true);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleEdit = (vendor: Vendor) => {
    setEditingId(vendor.id);
    setForm({
      name: vendor.name || '',
      code: vendor.code || '',
      type: vendor.type || 'vendor',
      parentVendorId: (vendor as Vendor & { parentVendorId?: string }).parentVendorId || '',
      industry: vendor.industry || '',
      contactName: vendor.contactName || '',
      contactEmail: vendor.contactEmail || '',
      contactPhone: vendor.contactPhone || '',
      specialization: vendor.specialization || '',
    });
    setViewingId(null);
    setShowForm(true);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Name is required'); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/vendors/${editingId}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(form) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Vendor updated');
      } else {
        const res = await fetch('/api/vendors', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(form) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Vendor added');
      }
      handleCancelForm();
      fetchVendors();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/vendors/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Vendor deactivated');
      setDeleteConfirmId(null);
      if (viewingId === id) setViewingId(null);
      fetchVendors();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setDeleting(false); }
  };

  const filtered = typeFilter === 'all' ? vendors : vendors.filter((v) => v.type === typeFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-nexus-text-primary">Vendors</h1><p className="text-nexus-text-secondary mt-1">Manage vendors and sub-vendors</p></div>
        <button onClick={handleAddNew} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"><FiPlus className="w-4 h-4" /> Add Vendor</button>
      </div>

      <div className="flex gap-2">
        {['all', 'vendor', 'sub_vendor'].map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${typeFilter === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-nexus-text-secondary hover:bg-slate-200'}`}>
            {t === 'all' ? 'All' : t.replace('_', '-')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="nexus-card overflow-hidden"><div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />))}</div></div>
      ) : filtered.length === 0 ? (
        <div className="nexus-card p-12 text-center"><FiTruck className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary">No vendors found</p></div>
      ) : (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-nexus-border">
                <tr>{['Name', 'Type', 'Industry', 'Contact', 'Specialization', 'Rating', 'Status', 'Actions'].map((h) => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold text-nexus-text-muted uppercase tracking-wider">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((v) => (
                  deleteConfirmId === v.id ? (
                    <tr key={v.id} className="bg-red-50">
                      <td colSpan={8} className="px-4 py-3">
                        <p className="text-sm text-red-700 font-medium mb-2">Are you sure you want to delete &quot;{v.name}&quot;?</p>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleDelete(v.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">{deleting ? 'Deleting...' : 'Confirm'}</button>
                          <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-bold">{v.name[0]}</div><span className="text-sm font-medium text-nexus-text-primary">{v.name}</span></div></td>
                      <td className="px-4 py-3"><span className={getTypeBadge(v.type)}>{v.type.replace('_', ' ')}</span></td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{v.industry || '—'}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{v.contactName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{v.specialization || '—'}</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((s) => (<FiStar key={s} className={`w-3.5 h-3.5 ${s <= Math.round(v.rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />))}</div></td>
                      <td className="px-4 py-3"><span className={getStatusBadge(v.status)}>{v.status}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setViewingId(v.id); setShowForm(false); setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="View"><FiEye className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleEdit(v)} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteConfirmId(v.id)} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View-Only Panel */}
      {viewingId && (() => {
        const vendor = vendors.find(v => v.id === viewingId);
        if (!vendor) return null;
        return (
          <div id="view-panel" className="nexus-card border-l-4 border-l-emerald-500">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-nexus-text-primary">Vendor Details</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleEdit(vendor)} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors flex items-center gap-1"><FiEdit2 className="w-3.5 h-3.5" />Edit</button>
                  <button onClick={() => setViewingId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><span className="text-xs font-medium text-nexus-text-secondary">Name</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{vendor.name}</p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Code</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{vendor.code || '—'}</p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Type</span><p className="mt-0.5"><span className={getTypeBadge(vendor.type)}>{vendor.type.replace('_', ' ')}</span></p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Industry</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5 flex items-center gap-1.5"><FiGlobe className="w-3.5 h-3.5 text-nexus-text-muted" />{vendor.industry || '—'}</p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Specialization</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{vendor.specialization || '—'}</p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Rating</span><p className="mt-0.5 flex items-center gap-1">{[1, 2, 3, 4, 5].map((s) => (<FiStar key={s} className={`w-3.5 h-3.5 ${s <= Math.round(vendor.rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />))}<span className="text-xs text-nexus-text-muted ml-1">{vendor.rating}/5</span></p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Status</span><p className="mt-0.5"><span className={getStatusBadge(vendor.status)}>{vendor.status}</span></p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Contact Name</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5 flex items-center gap-1.5"><FiMail className="w-3.5 h-3.5 text-nexus-text-muted" />{vendor.contactName || '—'}</p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Contact Email</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5 flex items-center gap-1.5"><FiMail className="w-3.5 h-3.5 text-nexus-text-muted" />{vendor.contactEmail || '—'}</p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Contact Phone</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5 flex items-center gap-1.5"><FiPhone className="w-3.5 h-3.5 text-nexus-text-muted" />{vendor.contactPhone || '—'}</p></div>
                {vendor.parentVendor && (
                  <div><span className="text-xs font-medium text-nexus-text-secondary">Parent Vendor</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5 flex items-center gap-1.5"><FiLayers className="w-3.5 h-3.5 text-nexus-text-muted" />{vendor.parentVendor.name}</p></div>
                )}
                {vendor._count && (
                  <div><span className="text-xs font-medium text-nexus-text-secondary">Sub-Vendors</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{vendor._count.childVendors}</p></div>
                )}
              </div>
              {vendor.childVendors && vendor.childVendors.length > 0 && (
                <div className="mt-6 pt-4 border-t border-nexus-border">
                  <h4 className="text-xs font-semibold text-nexus-text-muted uppercase mb-3 flex items-center gap-1"><FiLayers className="w-3.5 h-3.5" /> Sub-Vendors</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {vendor.childVendors.map((cv) => (
                      <div key={cv.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-nexus-border">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold">{cv.name[0]}</div>
                        <div>
                          <p className="text-sm font-medium text-nexus-text-primary">{cv.name}</p>
                          <p className="text-xs text-nexus-text-muted">{cv.type.replace('_', ' ')} · Rating: {cv.rating}/5</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* CRUD Form */}
      {showForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-blue-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingId ? 'Edit Vendor' : 'Add New Vendor'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-nexus-text-secondary mb-1">Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-nexus-text-secondary mb-1">Code</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-nexus-text-secondary mb-1">Type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="vendor">Vendor</option><option value="sub_vendor">Sub-Vendor</option></select></div>
                <div><label className="block text-sm font-medium text-nexus-text-secondary mb-1">Industry</label><input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              {form.type === 'sub_vendor' && (
                <div><label className="block text-sm font-medium text-nexus-text-secondary mb-1">Parent Vendor ID</label><input value={form.parentVendorId} onChange={(e) => setForm({ ...form, parentVendorId: e.target.value })} placeholder="Enter parent vendor ID" className="w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-nexus-text-secondary mb-1">Contact Name</label><input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-nexus-text-secondary mb-1">Contact Email</label><input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className="w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div><label className="block text-sm font-medium text-nexus-text-secondary mb-1">Contact Phone</label><input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              <div><label className="block text-sm font-medium text-nexus-text-secondary mb-1">Specialization</label><input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} className="w-full px-3 py-2 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
                <button type="button" onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">{submitting ? 'Saving...' : editingId ? 'Update' : 'Add Vendor'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
