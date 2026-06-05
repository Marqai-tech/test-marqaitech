'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiCreditCard,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiDollarSign,
  FiClock,
  FiCheckCircle,
  FiRefreshCw,
  FiEye,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Expense {
  id: string;
  employeeId: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  receipt?: string | null;
  description?: string | null;
  status: string;
  approvedBy?: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string } | null;
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

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'nexus-badge',
    submitted: 'nexus-badge nexus-badge-warning',
    approved: 'nexus-badge nexus-badge-success',
    rejected: 'nexus-badge nexus-badge-error',
    reimbursed: 'nexus-badge nexus-badge-info',
  };
  return map[status] || 'nexus-badge';
}

function getCategoryLabel(cat: string) {
  const map: Record<string, string> = {
    travel: 'Travel',
    meals: 'Meals',
    office_supplies: 'Office Supplies',
    software: 'Software',
    hardware: 'Hardware',
    training: 'Training',
    entertainment: 'Entertainment',
    other: 'Other',
  };
  return map[cat] || cat;
}

const EXPENSE_CATEGORIES = ['travel', 'meals', 'office_supplies', 'software', 'hardware', 'training', 'entertainment', 'other'];
const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'reimbursed'];

const initialForm = {
  title: '',
  category: '',
  amount: '',
  date: '',
  receipt: '',
  description: '',
  status: 'draft',
};

/* ── Component ── */
export default function ExpensesPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Expense | null>(null);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [expRes, empRes] = await Promise.all([
        fetch('/api/expenses?limit=100', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (expRes.ok) {
        const data = await expRes.json();
        setExpenses(data.expenses || []);
      }
      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(empData.employees || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  /* Form handlers */
  const handleOpenAdd = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenView = (record: Expense) => {
    setViewingId(record.id);
    setViewingRecord(record);
    setShowForm(false);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCloseView = () => {
    setViewingId(null);
    setViewingRecord(null);
  };

  const handleOpenEdit = (expense: Expense) => {
    setViewingId(null);
    setViewingRecord(null);
    setForm({
      title: expense.title,
      category: expense.category,
      amount: expense.amount != null ? String(expense.amount) : '',
      date: expense.date ? expense.date.split('T')[0] : '',
      receipt: expense.receipt || '',
      description: expense.description || '',
      status: expense.status,
    });
    setEditingId(expense.id);
    setShowForm(true);
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.category || !form.amount || !form.date) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        category: form.category,
        amount: parseFloat(form.amount),
        date: form.date,
        receipt: form.receipt.trim() || null,
        description: form.description.trim() || null,
        status: form.status,
      };

      const url = editingId ? `/api/expenses/${editingId}` : '/api/expenses';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Expense updated successfully' : 'Expense created successfully');
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSubmitting(false);
    }
  };

  /* Delete */
  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Expense deleted successfully');
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete expense');
    } finally {
      setDeleting(false);
    }
  };

  /* Filtering */
  const filtered = expenses.filter(e => {
    const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase()) || (e.description || '').toLowerCase().includes(search.toLowerCase());
    const matchCategory = !filterCategory || e.category === filterCategory;
    const matchStatus = !filterStatus || e.status === filterStatus;
    return matchSearch && matchCategory && matchStatus;
  });

  /* Summary */
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const pending = expenses.filter(e => e.status === 'submitted' || e.status === 'draft').reduce((sum, e) => sum + (e.amount || 0), 0);
  const approved = expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + (e.amount || 0), 0);
  const reimbursed = expenses.filter(e => e.status === 'reimbursed').reduce((sum, e) => sum + (e.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiCreditCard className="w-6 h-6 text-rose-500" />
            Expenses
          </h1>
          <p className="text-nexus-text-secondary mt-1">Track and manage expense claims</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Add Expense
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiDollarSign className="w-5 h-5 text-blue-500" /></div>
            <div>
              <p className="text-lg font-bold text-nexus-text-primary">{formatCurrency(totalExpenses)}</p>
              <p className="text-xs text-nexus-text-muted">Total Expenses</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiClock className="w-5 h-5 text-amber-500" /></div>
            <div>
              <p className="text-lg font-bold text-nexus-text-primary">{formatCurrency(pending)}</p>
              <p className="text-xs text-nexus-text-muted">Pending</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div>
            <div>
              <p className="text-lg font-bold text-nexus-text-primary">{formatCurrency(approved)}</p>
              <p className="text-xs text-nexus-text-muted">Approved</p>
            </div>
          </div>
        </div>
        <div className="nexus-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center"><FiRefreshCw className="w-5 h-5 text-cyan-500" /></div>
            <div>
              <p className="text-lg font-bold text-nexus-text-primary">{formatCurrency(reimbursed)}</p>
              <p className="text-xs text-nexus-text-muted">Reimbursed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Form */}
      {viewingId && viewingRecord && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-violet-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2">
                <FiEye className="w-5 h-5 text-violet-500" />
                View Expense
              </h2>
              <button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Title</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.title}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Category</p>
                <p className="text-sm text-nexus-text-primary">{getCategoryLabel(viewingRecord.category)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Employee</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.employee ? `${viewingRecord.employee.firstName} ${viewingRecord.employee.lastName}` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Amount</p>
                <p className="text-sm text-nexus-text-primary">{formatCurrency(viewingRecord.amount)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Date</p>
                <p className="text-sm text-nexus-text-primary">{formatDate(viewingRecord.date)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Receipt</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.receipt || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Status</p>
                <p className="text-sm text-nexus-text-primary">{viewingRecord.status}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-medium text-nexus-text-secondary mb-1">Description</p>
                <p className="text-sm text-nexus-text-primary whitespace-pre-wrap">{viewingRecord.description || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={() => { handleOpenEdit(viewingRecord); setViewingId(null); }} className="px-4 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
                <FiEdit2 className="w-4 h-4 inline mr-1" /> Edit
              </button>
              <button onClick={handleCloseView} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Expense' : 'Add Expense'}</h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Expense title" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Category *</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="">Select category</option>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Amount *</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Date *</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Receipt URL</label>
                <input type="text" value={form.receipt} onChange={e => setForm(p => ({ ...p, receipt: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="https://..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  {EXPENSE_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Expense description..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search expenses..." />
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-nexus-text-muted" />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Categories</option>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            <option value="">All Statuses</option>
            {EXPENSE_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <FiCreditCard className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No expenses found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(expense => (
                  <tr key={expense.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === expense.id ? (
                      <td colSpan={7} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Are you sure you want to delete &quot;{expense.title}&quot;?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(expense.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{expense.title}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{getCategoryLabel(expense.category)}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{expense.employee ? `${expense.employee.firstName} ${expense.employee.lastName}` : '—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-nexus-text-primary">{formatCurrency(expense.amount)}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(expense.date)}</td>
                        <td className="px-4 py-3"><span className={getStatusBadge(expense.status)}>{expense.status}</span></td>
                        <td className="px-4 py-3">
                          {isAdmin && (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => handleOpenView(expense)} className="p-2 rounded-lg text-nexus-text-muted hover:text-violet-500 hover:bg-violet-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                              <button onClick={() => handleOpenEdit(expense)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                              <button onClick={() => { setDeleteConfirmId(expense.id); setShowForm(false); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                            </div>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
