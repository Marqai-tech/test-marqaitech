'use client';

import { useState, useMemo } from 'react';
import {
  FiHeadphones, FiPlus, FiEdit2, FiX, FiCheck,
  FiAlertTriangle, FiClock, FiUser, FiFilter,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─── Demo Data ───────────────────────────────────────────
interface Ticket {
  id: string;
  subject: string;
  tenant: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assignee: string;
  createdDate: string;
  description: string;
}

const demoTickets: Ticket[] = [
  { id: 'TKT-001', subject: 'Payroll processing failed for June cycle', tenant: 'Acme Global Corp', priority: 'critical', status: 'in_progress', assignee: 'Sarah M.', createdDate: '2025-06-28', description: 'Monthly payroll run failed with database timeout error.' },
  { id: 'TKT-002', subject: 'Cannot add new employee - validation error', tenant: 'TechStart Solutions', priority: 'high', status: 'open', assignee: 'Unassigned', createdDate: '2025-06-29', description: 'HR admin getting validation error when trying to add employee.' },
  { id: 'TKT-003', subject: 'Attendance report not generating', tenant: 'Nexus Innovations', priority: 'medium', status: 'in_progress', assignee: 'Mike R.', createdDate: '2025-06-27', description: 'Monthly attendance report export is stuck at 50%.' },
  { id: 'TKT-004', subject: 'Custom domain SSL renewal', tenant: 'GlobalHR Services', priority: 'low', status: 'resolved', assignee: 'David K.', createdDate: '2025-06-20', description: 'SSL certificate needs renewal for portal.globalhr.com.' },
  { id: 'TKT-005', subject: 'Performance module not loading', tenant: 'BrightPath Inc', priority: 'high', status: 'open', assignee: 'Sarah M.', createdDate: '2025-06-30', description: 'Performance review page shows blank screen.' },
  { id: 'TKT-006', subject: 'Data export request for audit', tenant: 'PeakPerformance Ltd', priority: 'medium', status: 'in_progress', assignee: 'Lisa T.', createdDate: '2025-06-25', description: 'Need complete data export for annual compliance audit.' },
  { id: 'TKT-007', subject: 'Mobile app login issues', tenant: 'Vertex Dynamics', priority: 'medium', status: 'resolved', assignee: 'Mike R.', createdDate: '2025-06-18', description: 'Several employees unable to login via mobile app.' },
  { id: 'TKT-008', subject: 'Leave policy configuration error', tenant: 'Orion Systems', priority: 'low', status: 'closed', assignee: 'David K.', createdDate: '2025-06-15', description: 'Leave policy rules not applying correctly for new joiners.' },
  { id: 'TKT-009', subject: 'API rate limit exceeded', tenant: 'Acme Global Corp', priority: 'high', status: 'open', assignee: 'Unassigned', createdDate: '2025-06-30', description: 'API calls returning 429 errors during peak hours.' },
  { id: 'TKT-010', subject: 'Integration with Slack broken', tenant: 'TechStart Solutions', priority: 'medium', status: 'in_progress', assignee: 'Lisa T.', createdDate: '2025-06-26', description: 'Slack integration stopped sending notifications.' },
];

const priorityBadge: Record<string, string> = {
  low: 'thb-badge thb-badge-info',
  medium: 'thb-badge thb-badge-warning',
  high: 'thb-badge thb-badge-error',
  critical: 'thb-badge thb-badge-purple',
};

const statusBadge: Record<string, string> = {
  open: 'thb-badge thb-badge-error',
  in_progress: 'thb-badge thb-badge-warning',
  resolved: 'thb-badge thb-badge-success',
  closed: 'thb-badge thb-badge-info',
};

export default function TenantTicketsPage() {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<Ticket[]>(demoTickets);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    subject: '', tenant: '', priority: 'medium' as Ticket['priority'],
    status: 'open' as Ticket['status'], assignee: '', description: '',
  });

  const filtered = useMemo(() => {
    let result = tickets;
    if (priorityFilter) result = result.filter((t) => t.priority === priorityFilter);
    if (statusFilter) result = result.filter((t) => t.status === statusFilter);
    return result;
  }, [tickets, priorityFilter, statusFilter]);

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
  const avgResolution = '2.4 days';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject || !form.tenant) { toast.error('Subject and tenant are required'); return; }
    if (editingId) {
      setTickets((prev) => prev.map((t) => t.id === editingId ? { ...t, ...form } : t));
      toast.success('Ticket updated');
    } else {
      setTickets((prev) => [...prev, { ...form, id: `TKT-${Date.now()}`, createdDate: new Date().toISOString().slice(0, 10) }]);
      toast.success('Ticket created');
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (ticket: Ticket) => {
    setEditingId(ticket.id);
    setForm({ subject: ticket.subject, tenant: ticket.tenant, priority: ticket.priority, status: ticket.status, assignee: ticket.assignee, description: ticket.description });
    setShowForm(true);
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400';

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="thb-card p-6 bg-gradient-to-r from-rose-600 via-pink-500 to-fuchsia-500 border-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3"><FiHeadphones className="w-7 h-7" /> Tenant Support Tickets</h1>
            <p className="text-rose-100 mt-1 text-sm">Manage and resolve support requests from all platform tenants</p>
          </div>
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ subject: '', tenant: '', priority: 'medium', status: 'open', assignee: '', description: '' }); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/20 backdrop-blur text-white rounded-lg font-medium text-sm hover:bg-white/30 transition-colors">
            <FiPlus className="w-4 h-4" /> New Ticket
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Open', value: openCount, icon: <FiAlertTriangle className="w-5 h-5" />, bg: 'bg-red-50 text-red-500' },
          { label: 'In Progress', value: inProgressCount, icon: <FiClock className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-500' },
          { label: 'Resolved', value: resolvedCount, icon: <FiCheck className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-500' },
          { label: 'Avg Resolution', value: avgResolution, icon: <FiClock className="w-5 h-5" />, bg: 'bg-teal-50 text-teal-500' },
        ].map((card) => (
          <div key={card.label} className="thb-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-thb-text-muted">{card.label}</p>
                <p className="text-2xl font-bold text-thb-text-primary mt-1">{card.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.bg}`}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="thb-card p-4 flex flex-wrap items-center gap-3">
        <FiFilter className="w-4 h-4 text-thb-text-muted" />
        <span className="text-sm text-thb-text-secondary">Priority:</span>
        {['', 'low', 'medium', 'high', 'critical'].map((p) => (
          <button key={p} onClick={() => setPriorityFilter(p)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${priorityFilter === p ? 'bg-rose-500 text-white' : 'bg-slate-100 text-thb-text-secondary hover:bg-slate-200'}`}>{p || 'All'}</button>
        ))}
        <span className="text-sm text-thb-text-secondary ml-4">Status:</span>
        {['', 'open', 'in_progress', 'resolved', 'closed'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-rose-500 text-white' : 'bg-slate-100 text-thb-text-secondary hover:bg-slate-200'}`}>{s ? s.replace('_', ' ') : 'All'}</button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="thb-card border-l-4 border-l-rose-500 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-thb-text-primary">{editingId ? 'Edit Ticket' : 'New Ticket'}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1.5 text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 rounded-lg"><FiX className="w-4 h-4" /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className="block text-xs font-medium text-thb-text-secondary mb-1">Subject</label><input className={inputCls} value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} /></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Tenant</label><input className={inputCls} value={form.tenant} onChange={(e) => setForm((p) => ({ ...p, tenant: e.target.value }))} /></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Priority</label><select className={inputCls} value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as Ticket['priority'] }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Status</label><select className={inputCls} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Ticket['status'] }))}><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Assignee</label><input className={inputCls} value={form.assignee} onChange={(e) => setForm((p) => ({ ...p, assignee: e.target.value }))} /></div>
            <div className="sm:col-span-2"><label className="block text-xs font-medium text-thb-text-secondary mb-1">Description</label><textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="flex items-end gap-2"><button type="submit" className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-500 text-white rounded-lg font-medium text-sm hover:bg-rose-600 transition-colors"><FiCheck className="w-4 h-4" />{editingId ? 'Update' : 'Create'}</button></div>
          </form>
        </div>
      )}

      {/* Ticket List */}
      <div className="space-y-3">
        {filtered.map((ticket) => (
          <div key={ticket.id} className="thb-card p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-thb-text-muted">{ticket.id}</span>
                  <span className={priorityBadge[ticket.priority]}>{ticket.priority}</span>
                  <span className={statusBadge[ticket.status]}>{ticket.status.replace('_', ' ')}</span>
                </div>
                <h4 className="text-sm font-semibold text-thb-text-primary truncate">{ticket.subject}</h4>
                <p className="text-xs text-thb-text-muted mt-0.5 line-clamp-1">{ticket.description}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-thb-text-secondary flex-shrink-0">
                <div className="flex items-center gap-1"><FiUser className="w-3.5 h-3.5" /> {ticket.tenant}</div>
                <div className="flex items-center gap-1"><FiClock className="w-3.5 h-3.5" /> {ticket.assignee}</div>
                <div className="text-thb-text-muted">{ticket.createdDate}</div>
                <button onClick={() => handleEdit(ticket)} className="inline-flex items-center gap-1 text-green-500 hover:text-green-700 font-medium"><FiEdit2 className="w-3.5 h-3.5" />Edit</button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="thb-card p-8 text-center text-thb-text-muted"><FiAlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No tickets match the current filters</p></div>
        )}
      </div>
    </div>
  );
}
