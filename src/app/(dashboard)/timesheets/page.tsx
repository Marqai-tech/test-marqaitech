'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiClock,
  FiPlus,
  FiX,
  FiCheck,
  FiCalendar,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Timesheet {
  id: string;
  employeeId: string;
  date: string;
  project: string | null;
  task: string | null;
  hours: number;
  description: string | null;
  status: string;
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

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'nexus-badge nexus-badge-warning',
    submitted: 'nexus-badge nexus-badge-info',
    approved: 'nexus-badge nexus-badge-success',
    rejected: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

/* ── Component ── */
export default function TimesheetsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const [form, setForm] = useState({
    employeeId: '', date: '', project: '', task: '', hours: '', description: '',
  });

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [tsRes, empRes] = await Promise.all([
        fetch('/api/timesheets?limit=50', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (tsRes.ok) { const d = await tsRes.json(); setTimesheets(d.timesheets || []); }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch {
      toast.error('Failed to load timesheets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Submit Timesheet */
  const handleSubmit = async () => {
    if (!form.employeeId || !form.date || !form.hours) { toast.error('Please fill required fields'); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/timesheets', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, hours: parseFloat(form.hours), status: 'submitted' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Timesheet submitted successfully');
      setShowModal(false);
      setForm({ employeeId: '', date: '', project: '', task: '', hours: '', description: '' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit timesheet');
    } finally {
      setSubmitting(false);
    }
  };

  /* Approve / Reject */
  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    try {
      setActioning(id);
      const res = await fetch(`/api/timesheets/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Timesheet ${status}`);
      fetchData();
    } catch {
      toast.error('Failed to update timesheet');
    } finally {
      setActioning(null);
    }
  };

  const totalHours = timesheets.reduce((s, t) => s + t.hours, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <FiClock className="w-6 h-6" />
            Timesheets
          </h1>
          <p className="text-nexus-text-secondary mt-1">Track and manage work hours</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" /> Submit Timesheet
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="nexus-card p-5">
          <p className="text-xs font-medium text-nexus-text-secondary">Total Entries</p>
          <p className="text-2xl font-bold text-nexus-text-primary mt-1">{timesheets.length}</p>
        </div>
        <div className="nexus-card p-5">
          <p className="text-xs font-medium text-nexus-text-secondary">Total Hours</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{totalHours.toFixed(1)}</p>
        </div>
        <div className="nexus-card p-5">
          <p className="text-xs font-medium text-nexus-text-secondary">Pending Approval</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{timesheets.filter(t => t.status === 'submitted').length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Project</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Task</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Hours</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                {isAdmin && <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-10 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    {isAdmin && <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>}
                  </tr>
                ))
              ) : timesheets.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-12 text-center">
                    <FiClock className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No timesheets found</p>
                  </td>
                </tr>
              ) : (
                timesheets.map(t => (
                  <tr key={t.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">
                      <div className="flex items-center gap-1"><FiCalendar className="w-3 h-3" />{formatDate(t.date)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{t.project || '—'}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{t.task || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-nexus-text-primary text-right">{t.hours}h</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary truncate max-w-[200px]">{t.description || '—'}</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(t.status)}>{t.status}</span></td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {t.status === 'submitted' && (
                            <>
                              <button onClick={() => handleAction(t.id, 'approved')} disabled={actioning === t.id} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Approve"><FiCheck className="w-4 h-4" /></button>
                              <button onClick={() => handleAction(t.id, 'rejected')} disabled={actioning === t.id} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Reject"><FiX className="w-4 h-4" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submit Timesheet Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-slide-in-down" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Submit Timesheet</h2>
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
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Date *</label>
                  <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Hours *</label>
                  <input type="number" step="0.5" value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="8" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Project</label>
                <input type="text" value={form.project} onChange={e => setForm(p => ({ ...p, project: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Project name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Task</label>
                <input type="text" value={form.task} onChange={e => setForm(p => ({ ...p, task: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Task description" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Additional details..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Submitting...' : 'Submit Timesheet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
