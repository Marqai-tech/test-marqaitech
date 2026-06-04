'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiSearch, FiGlobe, FiMail,
  FiMapPin, FiBriefcase, FiChevronRight,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Client {
  id: string; name: string; code: string | null; industry: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null; country: string | null; status: string; billingCurrency: string; paymentTerms: string;
  projects?: { id: string }[];
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({
    name: '', code: '', industry: '', contactName: '', contactEmail: '', contactPhone: '', address: '', city: '', state: '', country: '', zipCode: '', billingCurrency: 'USD', paymentTerms: 'net_30',
  });

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/clients', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setClients(Array.isArray(data) ? data : data.clients || []); }
    } catch { toast.error('Failed to load clients'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('Name is required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/clients', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Client added');
      setShowAddModal(false);
      setForm({ name: '', code: '', industry: '', contactName: '', contactEmail: '', contactPhone: '', address: '', city: '', state: '', country: '', zipCode: '', billingCurrency: 'USD', paymentTerms: 'net_30' });
      fetchClients();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Clients</h1><p className="text-slate-500 mt-1">Manage client relationships and details</p></div>
        <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"><FiPlus className="w-4 h-4" /> Add Client</button>
      </div>

      <div className="relative max-w-sm">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search clients..." className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => (<div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse"><div className="h-5 w-3/4 bg-slate-200 rounded mb-3" /><div className="h-3 w-1/2 bg-slate-100 rounded" /></div>))}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiBriefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No clients found</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.id} onClick={() => setSelectedClient(c)} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">{c.name[0]}</div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : c.status === 'inactive' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>
              </div>
              <h3 className="font-semibold text-slate-900">{c.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{c.code || 'No code'}</p>
              <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                {c.industry && <div className="flex items-center gap-2"><FiGlobe className="w-3.5 h-3.5 text-slate-400" />{c.industry}</div>}
                {c.contactName && <div className="flex items-center gap-2"><FiMail className="w-3.5 h-3.5 text-slate-400" />{c.contactName}</div>}
                {c.country && <div className="flex items-center gap-2"><FiMapPin className="w-3.5 h-3.5 text-slate-400" />{c.country}</div>}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">{c.projects?.length || 0} projects</span>
                <span className="text-xs text-blue-600 flex items-center gap-1">View <FiChevronRight className="w-3.5 h-3.5" /></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Add Client</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Code</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Industry</label><input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label><input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone</label><input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              <div className="grid grid-cols-4 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">City</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">State</label><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Country</label><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label><input value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Currency</label><select value={form.billingCurrency} onChange={(e) => setForm({ ...form, billingCurrency: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="INR">INR</option></select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Payment Terms</label><select value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="net_15">Net 15</option><option value="net_30">Net 30</option><option value="net_45">Net 45</option><option value="net_60">Net 60</option><option value="immediate">Immediate</option></select></div>
              </div>
              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button><button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Adding...' : 'Add Client'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Client Detail Modal */}
      {selectedClient && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedClient(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">{selectedClient.name}</h2>
              <button onClick={() => setSelectedClient(null)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Code:</span> <span className="font-medium">{selectedClient.code || '—'}</span></div>
                <div><span className="text-slate-500">Industry:</span> <span className="font-medium">{selectedClient.industry || '—'}</span></div>
                <div><span className="text-slate-500">Contact:</span> <span className="font-medium">{selectedClient.contactName || '—'}</span></div>
                <div><span className="text-slate-500">Email:</span> <span className="font-medium">{selectedClient.contactEmail || '—'}</span></div>
                <div><span className="text-slate-500">Country:</span> <span className="font-medium">{selectedClient.country || '—'}</span></div>
                <div><span className="text-slate-500">Projects:</span> <span className="font-medium">{selectedClient.projects?.length || 0}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
