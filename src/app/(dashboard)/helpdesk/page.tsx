'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiPlus, FiX, FiMessageSquare, FiUser, FiClock,
  FiCheck, FiAlertCircle, FiArrowRight, FiSend,
  FiEye, FiEdit2, FiTrash2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Ticket {
  id: string; ticketId: string; subject: string; description: string; priority: string; status: string;
  requesterName: string; requesterType: string; category: string; assignedAgentName: string | null;
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

const helpdeskTips = [
  { title: 'Categorize Tickets', description: 'Use ticket categories to organize and prioritize support requests efficiently' },
  { title: 'Track SLAs', description: 'Monitor service level agreements to ensure timely resolution of support tickets' },
  { title: 'Set Priority Levels', description: 'Assign appropriate priority levels to ensure critical issues are addressed first' },
  { title: 'Use Knowledge Base', description: 'Reference the knowledge base for common solutions before escalating tickets' },
  { title: 'Escalation Path', description: 'Follow the escalation path for unresolved tickets to get timely management attention' },
];

const helpdeskWorkflowSteps = [
  { step: 1, title: 'Submit Ticket', description: 'Employee submits a support request with details', route: '/helpdesk' },
  { step: 2, title: 'Categorize & Prioritize', description: 'Assign category and priority level to the ticket' },
  { step: 3, title: 'Assign Agent', description: 'Route the ticket to the appropriate support agent' },
  { step: 4, title: 'Investigate & Diagnose', description: 'Agent investigates the issue and identifies root cause' },
  { step: 5, title: 'Implement Solution', description: 'Apply the fix or provide the resolution' },
  { step: 6, title: 'Communicate Resolution', description: 'Inform the requester about the solution applied' },
  { step: 7, title: 'Close Ticket', description: 'Mark the ticket as resolved and close it' },
  { step: 8, title: 'Collect Feedback', description: 'Gather feedback from the requester on the support experience' },
];

const initialForm = { subject: '', description: '', category: 'hr', priority: 'medium', requesterType: 'employee' };

export default function HelpdeskPage() {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my' | 'all'>('my');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingTicket, setViewingTicket] = useState<Ticket | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);

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

  useEffect(() => { queueMicrotask(() => fetchTickets()); }, [fetchTickets]);

  const fetchViewingTicket = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tickets/${id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setViewingTicket(data.ticket || data);
      }
    } catch { toast.error('Failed to load ticket details'); }
  }, []);

  const handleView = useCallback(async (id: string) => {
    setViewingTicket(null);
    setViewingId(id);
    setShowForm(false);
    await fetchViewingTicket(id);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [fetchViewingTicket]);

  const handleAddNew = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(true);
    setViewingId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleEdit = (ticket: Ticket) => {
    setForm({
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category || 'hr',
      priority: ticket.priority,
      requesterType: ticket.requesterType,
    });
    setEditingId(ticket.id);
    setShowForm(true);
    setViewingId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const handleSubmit = async () => {
    if (!form.subject || !form.description) { toast.error('Subject and description are required'); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/tickets/${editingId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ subject: form.subject, description: form.description, priority: form.priority, category: form.category }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Ticket updated successfully');
      } else {
        const res = await fetch('/api/tickets', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ...form, requesterId: user?.id, requesterName: user?.name }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('Ticket created successfully');
      }
      handleCancelForm();
      fetchTickets();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Ticket deleted successfully');
      setDeleteConfirmId(null);
      if (viewingId === id) setViewingId(null);
      fetchTickets();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); }
    finally { setDeleting(false); }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !viewingId) return;
    try {
      const res = await fetch(`/api/tickets/${viewingId}/comments`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ authorId: user?.id, authorName: user?.name, content: comment }),
      });
      if (!res.ok) throw new Error('Failed');
      setComment('');
      fetchViewingTicket(viewingId);
    } catch { toast.error('Failed to add comment'); }
  };

  const handleTicketAction = async (action: string) => {
    if (!viewingId) return;
    try {
      const res = await fetch(`/api/tickets/${viewingId}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Ticket ${action.replace('_', ' ')}`);
      fetchTickets();
      fetchViewingTicket(viewingId);
    } catch { toast.error('Action failed'); }
  };

  const myTickets = tickets.filter((t) => t.requesterName === user?.name);
  const displayTickets = activeTab === 'my' ? myTickets : tickets;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary">Helpdesk</h1>
          <p className="text-nexus-text-secondary mt-1">Manage support tickets and requests</p>
        </div>
        <button onClick={handleAddNew} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" /> Create Ticket
        </button>
      </div>

      <ModuleTips moduleKey="helpdesk" title="Helpdesk Tips" tips={helpdeskTips} />
      <ModuleWorkflow moduleKey="helpdesk" title="How to Resolve Support Tickets" subtitle="Follow this workflow to resolve support requests efficiently" steps={helpdeskWorkflowSteps} accentColor="cyan" />

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['my', 'all'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'bg-white shadow-sm text-nexus-text-primary' : 'text-nexus-text-muted hover:text-nexus-text-primary'}`}>
            {tab === 'my' ? 'My Tickets' : 'All Tickets'}
          </button>
        ))}
      </div>

      {/* View Panel */}
      {viewingId && viewingTicket && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-nexus-text-primary">{viewingTicket.subject}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityConfig[viewingTicket.priority]?.bg || ''} ${priorityConfig[viewingTicket.priority]?.text || ''}`}>{viewingTicket.priority}</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[viewingTicket.status]?.bg || ''} ${statusConfig[viewingTicket.status]?.text || ''}`}>{viewingTicket.status.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleEdit(viewingTicket)} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors flex items-center gap-1"><FiEdit2 className="w-3.5 h-3.5" />Edit</button>
                <button onClick={() => setViewingId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div>
                <span className="text-xs font-medium text-nexus-text-secondary">Ticket ID</span>
                <p className="text-sm font-medium text-nexus-text-primary mt-0.5 font-mono">{viewingTicket.ticketId?.slice(0, 8) || '—'}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-nexus-text-secondary">Requester</span>
                <p className="text-sm font-medium text-nexus-text-primary mt-0.5 flex items-center gap-1"><FiUser className="w-3.5 h-3.5" />{viewingTicket.requesterName}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-nexus-text-secondary">Requester Type</span>
                <p className="text-sm font-medium text-nexus-text-primary mt-0.5 capitalize">{viewingTicket.requesterType}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-nexus-text-secondary">Assigned Agent</span>
                <p className="text-sm font-medium text-nexus-text-primary mt-0.5">{viewingTicket.assignedAgentName || 'Unassigned'}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-nexus-text-secondary">Category</span>
                <p className="text-sm font-medium text-nexus-text-primary mt-0.5 capitalize">{viewingTicket.category || '—'}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-nexus-text-secondary">Created</span>
                <p className="text-sm font-medium text-nexus-text-primary mt-0.5 flex items-center gap-1"><FiClock className="w-3.5 h-3.5" />{new Date(viewingTicket.createdAt).toLocaleString()}</p>
              </div>
            </div>

            <div className="mb-6">
              <span className="text-xs font-medium text-nexus-text-secondary">Description</span>
              <p className="text-sm text-nexus-text-primary mt-0.5 bg-slate-50 p-4 rounded-lg">{viewingTicket.description}</p>
            </div>

            {/* Status Actions */}
            <div className="flex gap-2 flex-wrap mb-6">
              {viewingTicket.status === 'open' && (
                <button onClick={() => handleTicketAction('in_progress')} className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 flex items-center gap-1 transition-colors"><FiArrowRight className="w-3.5 h-3.5" /> In Progress</button>
              )}
              {viewingTicket.status === 'in_progress' && (
                <button onClick={() => handleTicketAction('resolved')} className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 flex items-center gap-1 transition-colors"><FiCheck className="w-3.5 h-3.5" /> Resolve</button>
              )}
              {viewingTicket.status === 'resolved' && (
                <button onClick={() => handleTicketAction('closed')} className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 flex items-center gap-1 transition-colors"><FiCheck className="w-3.5 h-3.5" /> Close</button>
              )}
            </div>

            {/* Comments */}
            <div className="border-t border-nexus-border pt-4">
              <h3 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2"><FiMessageSquare className="w-4 h-4" /> Comments ({viewingTicket.comments?.length || 0})</h3>
              <div className="space-y-3 max-h-60 overflow-y-auto mb-3">
                {(viewingTicket.comments || []).map((c) => (
                  <div key={c.id} className={`p-3 rounded-lg ${c.isInternal ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-nexus-text-primary">{c.authorName}{c.isInternal && ' (Internal)'}</span>
                      <span className="text-xs text-nexus-text-muted">{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-nexus-text-secondary">{c.content}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddComment()} placeholder="Add a comment..." className="flex-1 px-3 py-2.5 border border-nexus-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                <button onClick={handleAddComment} className="px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm transition-colors"><FiSend className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline Form */}
      {showForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-blue-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingId ? 'Edit Ticket' : 'Create Ticket'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Subject *</label>
                <input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Ticket subject" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description *</label>
                <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Describe the issue..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="hr">HR</option>
                  <option value="it">IT</option>
                  <option value="payroll">Payroll</option>
                  <option value="admin">Admin</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Requester Type</label>
                <select value={form.requesterType} onChange={(e) => setForm({ ...form, requesterType: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="employee">Employee</option>
                  <option value="client">Client</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">{submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Tickets Table */}
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="nexus-card p-5 animate-pulse"><div className="h-4 w-3/4 bg-slate-200 rounded mb-2" /><div className="h-3 w-1/2 bg-slate-100 rounded" /></div>))}</div>
      ) : displayTickets.length === 0 ? (
        <div className="nexus-card p-12 text-center"><FiAlertCircle className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary">No tickets found</p></div>
      ) : (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/50 border-b border-nexus-border">
                <tr>
                  {['ID', 'Subject', 'Category', 'Priority', 'Status', 'Assigned Agent', 'Created', 'Actions'].map((h) => (
                    <th key={h} className={`px-4 py-3 text-left text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider ${h === 'Actions' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-nexus-border/50">
                {displayTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === t.id ? (
                      <td colSpan={8} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Are you sure you want to delete this ticket?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(t.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-mono text-nexus-text-secondary">{t.ticketId?.slice(0, 8) || '—'}</td>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary max-w-[200px] truncate">{t.subject}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary capitalize">{t.category || t.requesterType}</td>
                        <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityConfig[t.priority]?.bg || ''} ${priorityConfig[t.priority]?.text || ''}`}>{t.priority}</span></td>
                        <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[t.status]?.bg || ''} ${statusConfig[t.status]?.text || ''}`}>{t.status.replace('_', ' ')}</span></td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{t.assignedAgentName || 'Unassigned'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-muted">{new Date(t.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleView(t.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                            <button onClick={() => handleEdit(t)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                            <button onClick={() => setDeleteConfirmId(t.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
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
      )}
    </div>
  );
}
