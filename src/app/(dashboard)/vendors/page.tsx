'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiStar, FiTruck, FiLayers,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Vendor {
  id: string; name: string; code: string | null; type: string; industry: string | null; contactName: string | null; contactEmail: string | null; specialization: string | null; rating: number; status: string;
  parentVendor?: { name: string } | null; childVendors?: { id: string; name: string; type: string }[];
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [form, setForm] = useState({
    name: '', code: '', type: 'vendor', parentVendorId: '', industry: '', contactName: '', contactEmail: '', contactPhone: '', specialization: '',
  });

  const fetchVendors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/vendors', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setVendors(Array.isArray(data) ? data : data.vendors || []); }
    } catch { toast.error('Failed to load vendors'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Name is required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/vendors', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Vendor added');
      setShowAddModal(false);
      setForm({ name: '', code: '', type: 'vendor', parentVendorId: '', industry: '', contactName: '', contactEmail: '', contactPhone: '', specialization: '' });
      fetchVendors();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const filtered = typeFilter === 'all' ? vendors : vendors.filter((v) => v.type === typeFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Vendors</h1><p className="text-slate-500 mt-1">Manage vendors and sub-vendors</p></div>
        <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"><FiPlus className="w-4 h-4" /> Add Vendor</button>
      </div>

      <div className="flex gap-2">
        {['all', 'vendor', 'sub_vendor'].map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${typeFilter === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t === 'all' ? 'All' : t.replace('_', '-')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden"><div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />))}</div></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiTruck className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No vendors found</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Name', 'Type', 'Industry', 'Contact', 'Specialization', 'Rating', 'Status'].map((h) => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((v) => (
                  <tr key={v.id} onClick={() => setSelectedVendor(v)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-bold">{v.name[0]}</div><span className="text-sm font-medium text-slate-900">{v.name}</span></div></td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${v.type === 'vendor' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{v.type.replace('_', ' ')}</span></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{v.industry || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{v.contactName || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{v.specialization || '—'}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((s) => (<FiStar key={s} className={`w-3.5 h-3.5 ${s <= Math.round(v.rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />))}</div></td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${v.status === 'active' ? 'bg-emerald-100 text-emerald-700' : v.status === 'inactive' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>{v.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Vendor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200"><h2 className="text-lg font-semibold text-slate-900">Add Vendor</h2><button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button></div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Code</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Type</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="vendor">Vendor</option><option value="sub_vendor">Sub-Vendor</option></select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Industry</label><input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label><input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label><input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Specialization</label><input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button><button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Adding...' : 'Add Vendor'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Vendor Detail */}
      {selectedVendor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedVendor(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200"><h2 className="text-lg font-semibold text-slate-900">{selectedVendor.name}</h2><button onClick={() => setSelectedVendor(null)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Type:</span> <span className="font-medium capitalize">{selectedVendor.type.replace('_', ' ')}</span></div>
                <div><span className="text-slate-500">Industry:</span> <span className="font-medium">{selectedVendor.industry || '—'}</span></div>
                <div><span className="text-slate-500">Contact:</span> <span className="font-medium">{selectedVendor.contactName || '—'}</span></div>
                <div><span className="text-slate-500">Email:</span> <span className="font-medium">{selectedVendor.contactEmail || '—'}</span></div>
                <div><span className="text-slate-500">Specialization:</span> <span className="font-medium">{selectedVendor.specialization || '—'}</span></div>
                <div><span className="text-slate-500">Rating:</span> <span className="font-medium">{selectedVendor.rating}/5</span></div>
              </div>
              {selectedVendor.parentVendor && (
                <div className="pt-3 border-t border-slate-200"><h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1"><FiLayers className="w-3.5 h-3.5" /> Parent Vendor</h4><p className="text-sm text-slate-700">{selectedVendor.parentVendor.name}</p></div>
              )}
              {selectedVendor.childVendors && selectedVendor.childVendors.length > 0 && (
                <div className="pt-3 border-t border-slate-200"><h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1"><FiLayers className="w-3.5 h-3.5" /> Sub-Vendors</h4><div className="space-y-1">{selectedVendor.childVendors.map((cv) => (<p key={cv.id} className="text-sm text-slate-700">{cv.name} <span className="text-xs text-slate-400">({cv.type})</span></p>))}</div></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
