'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiMap,
  FiPlus,
  FiX,
  FiCheck,
  FiNavigation,
  FiCalendar,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface TravelRequest {
  id: string;
  employeeId: string;
  purpose: string;
  destination: string;
  startDate: string;
  endDate: string;
  mode: string;
  estimatedCost: number | null;
  status: string;
  notes: string | null;
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

function formatCurrency(amount: number | null) {
  if (amount === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'nexus-badge nexus-badge-warning',
    approved: 'nexus-badge nexus-badge-success',
    rejected: 'nexus-badge nexus-badge-error',
    cancelled: 'nexus-badge nexus-badge-error',
    completed: 'nexus-badge nexus-badge-info',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getModeBadge(mode: string) {
  const map: Record<string, string> = {
    flight: 'nexus-badge nexus-badge-primary',
    train: 'nexus-badge nexus-badge-success',
    car: 'nexus-badge nexus-badge-warning',
    bus: 'nexus-badge nexus-badge-purple',
  };
  return map[mode] || 'nexus-badge nexus-badge-info';
}

/* ── Component ── */
export default function TravelPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [travels, setTravels] = useState<TravelRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const [form, setForm] = useState({
    employeeId: '', purpose: '', destination: '', startDate: '', endDate: '', mode: 'flight', estimatedCost: '', notes: '',
  });

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [travRes, empRes] = await Promise.all([
        fetch('/api/travel?limit=50', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (travRes.ok) { const d = await travRes.json(); setTravels(d.travelRequests || d.travels || []); }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch {
      toast.error('Failed to load travel requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Submit Request */
  const handleSubmit = async () => {
    if (!form.employeeId || !form.purpose || !form.destination || !form.startDate || !form.endDate) { toast.error('Please fill all required fields'); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/travel', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : null, status: 'pending' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Travel request submitted successfully');
      setShowModal(false);
      setForm({ employeeId: '', purpose: '', destination: '', startDate: '', endDate: '', mode: 'flight', estimatedCost: '', notes: '' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit travel request');
    } finally {
      setSubmitting(false);
    }
  };

  /* Approve / Reject */
  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    try {
      setActioning(id);
      const res = await fetch(`/api/travel/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Travel request ${status}`);
      fetchData();
    } catch {
      toast.error('Failed to update travel request');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <FiMap className="w-6 h-6" />
            Travel Requests
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage business travel requests and approvals</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" /> New Request
        </button>
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Purpose</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Destination</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Dates</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Mode</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Est. Cost</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                {isAdmin && <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-14 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    {isAdmin && <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>}
                  </tr>
                ))
              ) : travels.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center">
                    <FiNavigation className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No travel requests found</p>
                  </td>
                </tr>
              ) : (
                travels.map(t => (
                  <tr key={t.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{t.employee ? `${t.employee.firstName} ${t.employee.lastName}` : 'Unknown'}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary truncate max-w-[150px]">{t.purpose}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{t.destination}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">
                      <div className="flex items-center gap-1"><FiCalendar className="w-3 h-3" />{formatDate(t.startDate)} — {formatDate(t.endDate)}</div>
                    </td>
                    <td className="px-4 py-3"><span className={getModeBadge(t.mode)}>{t.mode}</span></td>
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary text-right">{formatCurrency(t.estimatedCost)}</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(t.status)}>{t.status}</span></td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {t.status === 'pending' && (
                            <>
                              <button onClick={() => handleAction(t.id, 'approved')} disabled={actioning === t.id} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Approve">
                                <FiCheck className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleAction(t.id, 'rejected')} disabled={actioning === t.id} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Reject">
                                <FiX className="w-4 h-4" />
                              </button>
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

      {/* New Request Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full animate-slide-in-down max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">New Travel Request</h2>
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
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Purpose *</label>
                <input type="text" value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Business purpose" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Destination *</label>
                <input type="text" value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="City, Country" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Start Date *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">End Date *</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Travel Mode</label>
                  <select value={form.mode} onChange={e => setForm(p => ({ ...p, mode: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="flight">Flight</option>
                    <option value="train">Train</option>
                    <option value="car">Car</option>
                    <option value="bus">Bus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Estimated Cost</label>
                  <input type="number" value={form.estimatedCost} onChange={e => setForm(p => ({ ...p, estimatedCost: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Additional notes..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
