'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiCreditCard,
  FiPlus,
  FiX,
  FiCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface ExpenseClaim {
  id: string;
  employeeId: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
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

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'nexus-badge nexus-badge-warning',
    approved: 'nexus-badge nexus-badge-success',
    rejected: 'nexus-badge nexus-badge-error',
    paid: 'nexus-badge nexus-badge-info',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

function getCategoryBadge(category: string) {
  const map: Record<string, string> = {
    travel: 'nexus-badge nexus-badge-primary',
    food: 'nexus-badge nexus-badge-warning',
    accommodation: 'nexus-badge nexus-badge-purple',
    transport: 'nexus-badge nexus-badge-info',
    medical: 'nexus-badge nexus-badge-error',
    other: 'nexus-badge nexus-badge-success',
  };
  return map[category] || 'nexus-badge nexus-badge-info';
}

/* ── Component ── */
export default function ExpensesPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [expenses, setExpenses] = useState<ExpenseClaim[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const [form, setForm] = useState({
    employeeId: '', title: '', category: 'travel', amount: '', currency: 'USD', date: '', description: '',
  });

  /* Fetch */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [expRes, empRes] = await Promise.all([
        fetch('/api/expenses?limit=50', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (expRes.ok) { const d = await expRes.json(); setExpenses(d.expenseClaims || d.expenses || []); }
      if (empRes.ok) { const d = await empRes.json(); setEmployees(d.employees || []); }
    } catch {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Submit Claim */
  const handleSubmit = async () => {
    if (!form.employeeId || !form.title || !form.amount || !form.date) { toast.error('Please fill all required fields'); return; }
    try {
      setSubmitting(true);
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount), status: 'pending' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Expense claim submitted successfully');
      setShowModal(false);
      setForm({ employeeId: '', title: '', category: 'travel', amount: '', currency: 'USD', date: '', description: '' });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit expense claim');
    } finally {
      setSubmitting(false);
    }
  };

  /* Approve / Reject */
  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    try {
      setActioning(id);
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Expense ${status}`);
      fetchData();
    } catch {
      toast.error('Failed to update expense');
    } finally {
      setActioning(null);
    }
  };

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
  const pendingAmount = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text flex items-center gap-2">
            <FiCreditCard className="w-6 h-6" />
            Expense Claims
          </h1>
          <p className="text-nexus-text-secondary mt-1">Submit and manage expense reimbursements</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiPlus className="w-4 h-4" /> Submit Claim
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="nexus-card p-5">
          <p className="text-xs font-medium text-nexus-text-secondary">Total Claims</p>
          <p className="text-2xl font-bold text-nexus-text-primary mt-1">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="nexus-card p-5">
          <p className="text-xs font-medium text-nexus-text-secondary">Pending Amount</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(pendingAmount)}</p>
        </div>
        <div className="nexus-card p-5">
          <p className="text-xs font-medium text-nexus-text-secondary">Total Claims</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">{expenses.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Category</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Currency</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                {isAdmin && <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-10 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    {isAdmin && <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>}
                  </tr>
                ))
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-12 text-center">
                    <FiCreditCard className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No expense claims found</p>
                  </td>
                </tr>
              ) : (
                expenses.map(e => (
                  <tr key={e.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{e.title}</td>
                    <td className="px-4 py-3"><span className={getCategoryBadge(e.category)}>{e.category}</span></td>
                    <td className="px-4 py-3 text-sm font-semibold text-nexus-text-primary text-right">{formatCurrency(e.amount, e.currency)}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{e.currency}</td>
                    <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(e.date)}</td>
                    <td className="px-4 py-3"><span className={getStatusBadge(e.status)}>{e.status}</span></td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {e.status === 'pending' && (
                            <>
                              <button onClick={() => handleAction(e.id, 'approved')} disabled={actioning === e.id} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Approve"><FiCheck className="w-4 h-4" /></button>
                              <button onClick={() => handleAction(e.id, 'rejected')} disabled={actioning === e.id} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Reject"><FiX className="w-4 h-4" /></button>
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

      {/* Submit Claim Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-slide-in-down max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Submit Expense Claim</h2>
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
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Expense title" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="travel">Travel</option>
                    <option value="food">Food</option>
                    <option value="accommodation">Accommodation</option>
                    <option value="transport">Transport</option>
                    <option value="medical">Medical</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Amount *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Currency</label>
                  <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="INR">INR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Date *</label>
                  <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Description..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Submitting...' : 'Submit Claim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
