'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiAlertCircle,
  FiPlus,
  FiX,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Grievance {
  id: string;
  employeeId: string;
  type: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  resolution: string | null;
  createdAt: string;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string };
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    open: 'nexus-badge nexus-badge-error',
    in_progress: 'nexus-badge nexus-badge-warning',
    resolved: 'nexus-badge nexus-badge-success',
    closed: 'nexus-badge nexus-badge-info',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getPriorityBadge(priority: string) {
  const map: Record<string, string> = {
    low: 'nexus-badge nexus-badge-info',
    medium: 'nexus-badge nexus-badge-warning',
    high: 'bg-orange-50 text-orange-700 nexus-badge',
    critical: 'nexus-badge nexus-badge-error',
  };
  return map[priority] || 'nexus-badge nexus-badge-info';
}

function getTypeBadge(type: string) {
  const map: Record<string, string> = {
    harassment: 'nexus-badge nexus-badge-error',
    discrimination: 'nexus-badge nexus-badge-purple',
    workload: 'nexus-badge nexus-badge-warning',
    salary: 'nexus-badge nexus-badge-info',
    other: 'nexus-badge nexus-badge-primary',
  };
  return map[type] || 'nexus-badge nexus-badge-info';
}

/* ── Component ── */
export default function GrievancesPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    employeeId: '', type: 'other', subject: '', description: '', priority: 'medium', assignedTo: '',
  });

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [grevRes, empRes] = await Promise.all([
        fetch('/api/grievances?limit=50', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (grevRes.ok) { const d = await grevRes.json(); setGrievances(d.grievances || []); }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch {
      toast.error('Failed to load grievances');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Submit Grievance */
  const handleSubmit = async () => {
    if (!form.employeeId || !form.subject || !form.description) { toast.error('Please fill all required fields'); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/grievances', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, status: 'open', assignedTo: form.assignedTo || null }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Grievance filed successfully');
      setShowModal(false);
      setForm({ employeeId: '', type: 'other', subject: '', description: '', priority: 'medium', assignedTo: '' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to file grievance');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <FiAlertCircle className="w-6 h-6" />
            Grievances
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage employee grievances and complaints</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" /> File Grievance
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Open</p>
          <p className="text-xl font-bold text-red-600 mt-1">{grievances.filter(g => g.status === 'open').length}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">In Progress</p>
          <p className="text-xl font-bold text-amber-600 mt-1">{grievances.filter(g => g.status === 'in_progress').length}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Resolved</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{grievances.filter(g => g.status === 'resolved').length}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Critical</p>
          <p className="text-xl font-bold text-red-700 mt-1">{grievances.filter(g => g.priority === 'critical').length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Subject</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                  </tr>
                ))
              ) : grievances.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FiAlertCircle className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No grievances found</p>
                  </td>
                </tr>
              ) : (
                grievances.map(g => (
                  <tr key={g.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3"><span className={getTypeBadge(g.type)}>{g.type}</span></td>
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary truncate max-w-[200px]">{g.subject}</td>
                    <td className="px-4 py-3"><span className={getPriorityBadge(g.priority)}>{g.priority}</span></td>
                    <td className="px-4 py-3"><span className={getStatusBadge(g.status)}>{g.status.replace('_', ' ')}</span></td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{g.employee ? `${g.employee.firstName} ${g.employee.lastName}` : '—'}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{g.assignedTo || 'Unassigned'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* File Grievance Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full animate-slide-in-down max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">File Grievance</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee *</label>
                <select value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select Employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="harassment">Harassment</option>
                    <option value="discrimination">Discrimination</option>
                    <option value="workload">Workload</option>
                    <option value="salary">Salary</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Subject *</label>
                <input type="text" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Brief subject" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description *</label>
                <textarea rows={4} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Describe the grievance in detail..." />
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Assign To</label>
                  <select value={form.assignedTo} onChange={e => setForm(p => ({ ...p, assignedTo: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="">Unassigned</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Filing...' : 'File Grievance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
