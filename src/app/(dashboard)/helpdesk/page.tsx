'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiMessageSquare, FiUser, FiClock,
  FiCheck, FiAlertCircle, FiArrowRight, FiSend,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Ticket {
  id: string; ticketId: string; subject: string; description: string; priority: string; status: string;
  requesterName: string; requesterType: string; assignedAgentName: string | null;
  createdAt: string; comments: TicketComment[];
}

interface TicketComment { id: string; authorName: string; content: string; isInternal: boolean; createdAt: string; }

const priorityConfig: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-blue-100', text: 'text-blue-700' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  critical: { bg: 'bg-red-100', text: 'text-red-700' },
};

const statusConfig: Record<string, { bg: string; text: string }> = {
  open: { bg: 'bg-blue-100', text: 'text-blue-700' },
  in_progress: { bg: 'bg-amber-100', text: 'text-amber-700' },
  resolved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  closed: { bg: 'bg-slate-100', text: 'text-slate-600' },
};

export default function HelpdeskPage() {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my' | 'all'>('my');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', category: 'hr', priority: 'medium', requesterType: 'employee' });

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tickets', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTickets(Array.isArray(data) ? data : data.tickets || []);
      }
    } catch { toast.error('Failed to load tickets'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject || !form.description) { toast.error('Subject and description are required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/tickets', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...form, requesterId: user?.id, requesterName: user?.name }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Ticket created successfully');
      setShowCreateModal(false);
      setForm({ subject: '', description: '', category: 'hr', priority: 'medium', requesterType: 'employee' });
      fetchTickets();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !selectedTicket) return;
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}/comments`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ authorId: user?.id, authorName: user?.name, content: comment }),
      });
      if (!res.ok) throw new Error('Failed');
      setComment('');
      const fresh = await fetch(`/api/tickets/${selectedTicket.id}`, { headers: getAuthHeaders() });
      if (fresh.ok) setSelectedTicket(await fresh.json());
    } catch { toast.error('Failed to add comment'); }
  };

  const handleTicketAction = async (action: string) => {
    if (!selectedTicket) return;
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Ticket ${action}`);
      fetchTickets();
      const fresh = await fetch(`/api/tickets/${selectedTicket.id}`, { headers: getAuthHeaders() });
      if (fresh.ok) setSelectedTicket(await fresh.json());
    } catch { toast.error('Action failed'); }
  };

  const myTickets = tickets.filter((t) => t.requesterName === user?.name);
  const displayTickets = activeTab === 'my' ? myTickets : tickets;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Helpdesk</h1>
          <p className="text-slate-500 mt-1">Manage support tickets and requests</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
          <FiPlus className="w-4 h-4" /> Create Ticket
        </button>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['my', 'all'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
            {tab === 'my' ? 'My Tickets' : 'All Tickets'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse"><div className="h-4 w-3/4 bg-slate-200 rounded mb-2" /><div className="h-3 w-1/2 bg-slate-100 rounded" /></div>))}</div>
      ) : displayTickets.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiAlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No tickets found</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['ID', 'Subject', 'Category', 'Priority', 'Status', 'Assigned Agent', 'Created'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayTickets.map((t) => (
                  <tr key={t.id} onClick={() => setSelectedTicket(t)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-slate-600">{t.ticketId?.slice(0, 8) || '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 max-w-[200px] truncate">{t.subject}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 capitalize">{t.requesterType}</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityConfig[t.priority]?.bg || ''} ${priorityConfig[t.priority]?.text || ''}`}>{t.priority}</span></td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[t.status]?.bg || ''} ${statusConfig[t.status]?.text || ''}`}>{t.status.replace('_', ' ')}</span></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{t.assignedAgentName || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Create Ticket</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button>
            </div>
            <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Subject *</label><input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Description *</label><textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Category</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="hr">HR</option><option value="it">IT</option><option value="payroll">Payroll</option><option value="admin">Admin</option><option value="general">General</option></select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Priority</label><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Requester</label><select value={form.requesterType} onChange={(e) => setForm({ ...form, requesterType: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"><option value="employee">Employee</option><option value="client">Client</option><option value="vendor">Vendor</option></select></div>
              </div>
              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button><button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedTicket(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedTicket.subject}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityConfig[selectedTicket.priority]?.bg} ${priorityConfig[selectedTicket.priority]?.text}`}>{selectedTicket.priority}</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[selectedTicket.status]?.bg} ${statusConfig[selectedTicket.status]?.text}`}>{selectedTicket.status.replace('_', ' ')}</span>
                </div>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-500"><FiUser className="w-4 h-4" /> {selectedTicket.requesterName} · <FiClock className="w-4 h-4" /> {new Date(selectedTicket.createdAt).toLocaleString()}</div>
              <p className="text-sm text-slate-700 bg-slate-50 p-4 rounded-lg">{selectedTicket.description}</p>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {selectedTicket.status === 'open' && <button onClick={() => handleTicketAction('in_progress')} className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 flex items-center gap-1"><FiArrowRight className="w-3.5 h-3.5" /> In Progress</button>}
                {selectedTicket.status === 'in_progress' && <button onClick={() => handleTicketAction('resolved')} className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 flex items-center gap-1"><FiCheck className="w-3.5 h-3.5" /> Resolve</button>}
                {selectedTicket.status === 'resolved' && <button onClick={() => handleTicketAction('closed')} className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 flex items-center gap-1"><FiCheck className="w-3.5 h-3.5" /> Close</button>}
              </div>

              {/* Comments */}
              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2"><FiMessageSquare className="w-4 h-4" /> Comments ({selectedTicket.comments?.length || 0})</h3>
                <div className="space-y-3 max-h-60 overflow-y-auto mb-3">
                  {(selectedTicket.comments || []).map((c) => (
                    <div key={c.id} className={`p-3 rounded-lg ${c.isInternal ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-700">{c.authorName}{c.isInternal && ' (Internal)'}</span>
                        <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-slate-600">{c.content}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddComment()} placeholder="Add a comment..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  <button onClick={handleAddComment} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"><FiSend className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
