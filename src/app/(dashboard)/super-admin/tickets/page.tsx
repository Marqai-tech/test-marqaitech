'use client';

import { useState, useMemo } from 'react';
import {
  FiTag, FiPlus, FiEdit2, FiX, FiCheck,
  FiAlertCircle, FiClock, FiFilter,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─── Demo Data ───────────────────────────────────────────
interface PlatformTicket {
  id: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  reporter: string;
  createdDate: string;
}

const demoTickets: PlatformTicket[] = [
  { id: 'PT-001', subject: 'Platform-wide email delivery delays', category: 'Infrastructure', priority: 'high', status: 'in_progress', reporter: 'System Monitor', createdDate: '2025-06-30' },
  { id: 'PT-002', subject: 'File upload size limit too restrictive', category: 'Feature Request', priority: 'medium', status: 'open', reporter: 'Acme Global Corp', createdDate: '2025-06-28' },
  { id: 'PT-003', subject: 'Dashboard charts not rendering on Safari', category: 'Bug', priority: 'high', status: 'open', reporter: 'TechStart Solutions', createdDate: '2025-06-29' },
  { id: 'PT-004', subject: 'Request for bulk employee import via CSV', category: 'Feature Request', priority: 'medium', status: 'in_progress', reporter: '3Boxes Innovations', createdDate: '2025-06-25' },
  { id: 'PT-005', subject: 'Scheduled maintenance notification system', category: 'Infrastructure', priority: 'low', status: 'resolved', reporter: 'Platform Team', createdDate: '2025-06-20' },
  { id: 'PT-006', subject: 'Two-factor authentication bypass report', category: 'Security', priority: 'high', status: 'resolved', reporter: 'Security Audit', createdDate: '2025-06-22' },
  { id: 'PT-007', subject: 'Mobile app crash on Android 14', category: 'Bug', priority: 'medium', status: 'in_progress', reporter: 'BrightPath Inc', createdDate: '2025-06-27' },
  { id: 'PT-008', subject: 'Request for API webhook support', category: 'Feature Request', priority: 'low', status: 'open', reporter: 'PeakPerformance Ltd', createdDate: '2025-06-26' },
];

const priorityBadge: Record<string, string> = {
  low: 'thb-badge thb-badge-info',
  medium: 'thb-badge thb-badge-warning',
  high: 'thb-badge thb-badge-error',
};

const statusBadge: Record<string, string> = {
  open: 'thb-badge thb-badge-error',
  in_progress: 'thb-badge thb-badge-warning',
  resolved: 'thb-badge thb-badge-success',
  closed: 'thb-badge thb-badge-info',
};

const categoryIcons: Record<string, string> = {
  Bug: 'bg-red-50 text-red-500',
  'Feature Request': 'bg-green-50 text-green-500',
  Infrastructure: 'bg-amber-50 text-amber-500',
  Security: 'bg-teal-50 text-teal-500',
};

export default function TicketsPage() {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<PlatformTicket[]>(demoTickets);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    subject: '', category: 'Bug', priority: 'medium' as PlatformTicket['priority'],
    status: 'open' as PlatformTicket['status'], reporter: '',
  });

  const filtered = useMemo(() => {
    let result = tickets;
    if (statusFilter) result = result.filter((t) => t.status === statusFilter);
    if (categoryFilter) result = result.filter((t) => t.category === categoryFilter);
    return result;
  }, [tickets, statusFilter, categoryFilter]);

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject) { toast.error('Subject is required'); return; }
    if (editingId) {
      setTickets((prev) => prev.map((t) => t.id === editingId ? { ...t, ...form } : t));
      toast.success('Ticket updated');
    } else {
      setTickets((prev) => [...prev, { ...form, id: `PT-${Date.now()}`, createdDate: new Date().toISOString().slice(0, 10) }]);
      toast.success('Ticket created');
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (ticket: PlatformTicket) => {
    setEditingId(ticket.id);
    setForm({ subject: ticket.subject, category: ticket.category, priority: ticket.priority, status: ticket.status, reporter: ticket.reporter });
    setShowForm(true);
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400';

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="thb-card p-6 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 border-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3"><FiTag className="w-7 h-7" /> Platform Tickets</h1>
            <p className="text-slate-300 mt-1 text-sm">Manage platform-level issues, feature requests, and internal tasks</p>
          </div>
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ subject: '', category: 'Bug', priority: 'medium', status: 'open', reporter: '' }); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/20 backdrop-blur text-white rounded-lg font-medium text-sm hover:bg-white/30 transition-colors">
            <FiPlus className="w-4 h-4" /> New Ticket
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Open', value: openCount, icon: <FiAlertCircle className="w-5 h-5" />, bg: 'bg-red-50 text-red-500' },
          { label: 'In Progress', value: inProgressCount, icon: <FiClock className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-500' },
          { label: 'Resolved', value: resolvedCount, icon: <FiCheck className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-500' },
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
        <span className="text-sm text-thb-text-secondary">Status:</span>
        {['', 'open', 'in_progress', 'resolved', 'closed'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-slate-700 text-white' : 'bg-slate-100 text-thb-text-secondary hover:bg-slate-200'}`}>{s ? s.replace('_', ' ') : 'All'}</button>
        ))}
        <span className="text-sm text-thb-text-secondary ml-4">Category:</span>
        {['', 'Bug', 'Feature Request', 'Infrastructure', 'Security'].map((c) => (
          <button key={c} onClick={() => setCategoryFilter(c)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${categoryFilter === c ? 'bg-slate-700 text-white' : 'bg-slate-100 text-thb-text-secondary hover:bg-slate-200'}`}>{c || 'All'}</button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="thb-card border-l-4 border-l-slate-500 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-thb-text-primary">{editingId ? 'Edit Ticket' : 'New Ticket'}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1.5 text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 rounded-lg"><FiX className="w-4 h-4" /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className="block text-xs font-medium text-thb-text-secondary mb-1">Subject</label><input className={inputCls} value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} /></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Category</label><select className={inputCls} value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}><option>Bug</option><option>Feature Request</option><option>Infrastructure</option><option>Security</option></select></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Priority</label><select className={inputCls} value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as PlatformTicket['priority'] }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Status</label><select className={inputCls} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as PlatformTicket['status'] }))}><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></div>
            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Reporter</label><input className={inputCls} value={form.reporter} onChange={(e) => setForm((p) => ({ ...p, reporter: e.target.value }))} /></div>
            <div className="flex items-end"><button type="submit" className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg font-medium text-sm hover:bg-slate-800 transition-colors"><FiCheck className="w-4 h-4" />{editingId ? 'Update' : 'Create'}</button></div>
          </form>
        </div>
      )}

      {/* Ticket List */}
      <div className="thb-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-thb-text-muted border-b border-thb-border bg-slate-50">
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Reporter</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr></thead>
            <tbody>
              {filtered.map((ticket) => (
                <tr key={ticket.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-thb-text-muted">{ticket.id}</td>
                  <td className="px-4 py-3 font-medium text-thb-text-primary">{ticket.subject}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${categoryIcons[ticket.category] || 'bg-slate-50 text-slate-500'}`}>{ticket.category}</span></td>
                  <td className="px-4 py-3"><span className={priorityBadge[ticket.priority]}>{ticket.priority}</span></td>
                  <td className="px-4 py-3"><span className={statusBadge[ticket.status]}>{ticket.status.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-thb-text-secondary">{ticket.reporter}</td>
                  <td className="px-4 py-3 text-thb-text-muted">{ticket.createdDate}</td>
                  <td className="px-4 py-3"><button onClick={() => handleEdit(ticket)} className="inline-flex items-center gap-1 text-green-500 hover:text-green-700 text-xs font-medium"><FiEdit2 className="w-3.5 h-3.5" />Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
