'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiLogOut,
  FiPlus,
  FiX,
  FiCalendar,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Separation {
  id: string;
  employeeId: string;
  type: string;
  reason: string;
  noticePeriod: number;
  lastWorkingDate: string;
  status: string;
  exitInterview: string | null;
  settlementAmount: number | null;
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
    pending: 'nexus-badge nexus-badge-warning',
    notice_period: 'nexus-badge nexus-badge-info',
    completed: 'nexus-badge nexus-badge-success',
    cancelled: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getTypeBadge(type: string) {
  const map: Record<string, string> = {
    resignation: 'bg-orange-50 text-orange-700 nexus-badge',
    termination: 'nexus-badge nexus-badge-error',
    retirement: 'nexus-badge nexus-badge-info',
    layoff: 'nexus-badge nexus-badge-warning',
  };
  return map[type] || 'nexus-badge nexus-badge-info';
}

/* ── Component ── */
export default function SeparationPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [separations, setSeparations] = useState<Separation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    employeeId: '', type: 'resignation', reason: '', noticePeriod: '30', lastWorkingDate: '',
  });

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [sepRes, empRes] = await Promise.all([
        fetch('/api/separation?limit=50', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (sepRes.ok) { const d = await sepRes.json(); setSeparations(d.separations || []); }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch {
      toast.error('Failed to load separation data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Submit Separation */
  const handleSubmit = async () => {
    if (!form.employeeId || !form.reason || !form.lastWorkingDate) { toast.error('Please fill all required fields'); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/separation', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, noticePeriod: parseInt(form.noticePeriod), status: 'pending' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Separation initiated successfully');
      setShowModal(false);
      setForm({ employeeId: '', type: 'resignation', reason: '', noticePeriod: '30', lastWorkingDate: '' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to initiate separation');
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
            <FiLogOut className="w-6 h-6" />
            Employee Separation
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage employee exits and offboarding</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" /> Initiate Separation
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Pending</p>
          <p className="text-xl font-bold text-amber-600 mt-1">{separations.filter(s => s.status === 'pending').length}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Notice Period</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{separations.filter(s => s.status === 'notice_period').length}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Completed</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{separations.filter(s => s.status === 'completed').length}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-xs font-medium text-nexus-text-secondary">Resignations</p>
          <p className="text-xl font-bold text-orange-600 mt-1">{separations.filter(s => s.type === 'resignation').length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Reason</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Notice Period</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Last Working Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-10 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                  </tr>
                ))
              ) : separations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FiLogOut className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No separation records found</p>
                  </td>
                </tr>
              ) : (
                separations.map(s => (
                  <tr key={s.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : 'Unknown'}</td>
                    <td className="px-4 py-3"><span className={getTypeBadge(s.type)}>{s.type}</span></td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary truncate max-w-[200px]">{s.reason}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary text-right">{s.noticePeriod} days</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">
                      <div className="flex items-center gap-1"><FiCalendar className="w-3 h-3" />{formatDate(s.lastWorkingDate)}</div>
                    </td>
                    <td className="px-4 py-3"><span className={getStatusBadge(s.status)}>{s.status.replace('_', ' ')}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Initiate Separation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full animate-slide-in-down" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Initiate Separation</h2>
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
                    <option value="resignation">Resignation</option>
                    <option value="termination">Termination</option>
                    <option value="retirement">Retirement</option>
                    <option value="layoff">Layoff</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notice Period (days)</label>
                  <input type="number" value={form.noticePeriod} onChange={e => setForm(p => ({ ...p, noticePeriod: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Last Working Date *</label>
                <input type="date" value={form.lastWorkingDate} onChange={e => setForm(p => ({ ...p, lastWorkingDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Reason *</label>
                <textarea rows={3} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Reason for separation..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Initiating...' : 'Initiate Separation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
