'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiCheck,
  FiFileText,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Offer {
  id: string; candidateName: string; candidateEmail: string; position: string; department: string | null; offeredSalary: number; offeredCurrency: string; joiningDate: string; probationPeriod: number; status: string; createdAt: string;
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600' },
  pending_approval: { bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-700' },
  sent: { bg: 'bg-purple-100', text: 'text-purple-700' },
  accepted: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
};

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    candidateName: '', candidateEmail: '', position: '', department: '', offeredSalary: 0, offeredCurrency: 'USD', joiningDate: '', probationPeriod: 90,
  });

  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/offers', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setOffers(Array.isArray(data) ? data : data.offers || []); }
    } catch { toast.error('Failed to load offers'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.candidateName || !form.position) { toast.error('Name and position are required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/offers', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...form, candidateId: `candidate-${Date.now()}` }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Offer created');
      setShowCreateModal(false);
      setForm({ candidateName: '', candidateEmail: '', position: '', department: '', offeredSalary: 0, offeredCurrency: 'USD', joiningDate: '', probationPeriod: 90 });
      fetchOffers();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/offers/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Offer ${status.replace('_', ' ')}`);
      fetchOffers();
    } catch { toast.error('Action failed'); }
  };

  const nextStatus = (current: string) => {
    if (current === 'draft') return 'pending_approval';
    if (current === 'pending_approval') return 'approved';
    if (current === 'approved') return 'sent';
    return '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Offer Management</h1><p className="text-slate-500 mt-1">Create and manage job offers</p></div>
        <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"><FiPlus className="w-4 h-4" /> Create Offer</button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden"><div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />))}</div></div>
      ) : offers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiFileText className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No offers found</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Candidate', 'Position', 'Salary', 'Joining Date', 'Status', 'Actions'].map((h) => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offers.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3"><div><p className="text-sm font-medium text-slate-900">{o.candidateName}</p><p className="text-xs text-slate-400">{o.candidateEmail}</p></div></td>
                    <td className="px-4 py-3 text-sm text-slate-700">{o.position}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{o.offeredCurrency} {o.offeredSalary?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{new Date(o.joiningDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[o.status]?.bg || ''} ${statusConfig[o.status]?.text || ''}`}>{o.status.replace('_', ' ')}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {nextStatus(o.status) && (
                          <button onClick={() => handleStatusChange(o.id, nextStatus(o.status))} className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100 flex items-center gap-1"><FiCheck className="w-3 h-3" />Advance</button>
                        )}
                        {(o.status === 'sent' || o.status === 'approved') && (
                          <>
                            <button onClick={() => handleStatusChange(o.id, 'accepted')} className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100">Accept</button>
                            <button onClick={() => handleStatusChange(o.id, 'rejected')} className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100">Reject</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200"><h2 className="text-lg font-semibold text-slate-900">Create Offer</h2><button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button></div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Candidate Name *</label><input required value={form.candidateName} onChange={(e) => setForm({ ...form, candidateName: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Candidate Email</label><input type="email" value={form.candidateEmail} onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Position *</label><input required value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Department</label><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Salary *</label><input type="number" required value={form.offeredSalary} onChange={(e) => setForm({ ...form, offeredSalary: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Currency</label><select value={form.offeredCurrency} onChange={(e) => setForm({ ...form, offeredCurrency: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="USD">USD</option><option value="EUR">EUR</option><option value="INR">INR</option></select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Joining Date *</label><input type="date" required value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Probation (days)</label><input type="number" value={form.probationPeriod} onChange={(e) => setForm({ ...form, probationPeriod: parseInt(e.target.value) || 90 })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button><button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
