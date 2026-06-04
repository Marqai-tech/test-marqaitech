'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiDollarSign,
  FiPlus,
  FiX,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiFilter,
  FiEye,
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface FNFSettlement {
  id: string;
  employeeId?: string | null;
  basicSalary: number;
  pendingSalary: number;
  leaveEncashment: number;
  gratuity: number;
  bonus: number;
  deductions: number;
  totalAmount: number;
  status: string;
  paymentDate?: string | null;
  notes?: string | null;
  createdAt: string;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
}

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
  const map: Record<string, string> = { pending: 'nexus-badge nexus-badge-warning', processing: 'nexus-badge nexus-badge-info', paid: 'nexus-badge nexus-badge-success', disputed: 'nexus-badge nexus-badge-error' };
  return map[status] || 'nexus-badge';
}

const FNF_STATUSES = ['pending', 'processing', 'paid', 'disputed'];

const initialForm = { employeeId: '', basicSalary: '', pendingSalary: '', leaveEncashment: '', gratuity: '', bonus: '', deductions: '', status: 'pending', paymentDate: '', notes: '' };

export default function FNFPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(user?.role || '');

  const [settlements, setSettlements] = useState<FNFSettlement[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const [sRes, eRes] = await Promise.allSettled([
        fetch('/api/fnf?limit=100', { headers }),
        fetch('/api/employees?limit=500', { headers }),
      ]);
      if (sRes.status === 'fulfilled' && sRes.value.ok) { const data = await sRes.value.json(); setSettlements(data.settlements || []); }
      if (eRes.status === 'fulfilled' && eRes.value.ok) { const data = await eRes.value.json(); setEmployees(data.employees || []); }
    } catch (err) { console.error(err); toast.error('Failed to load settlements'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const getEmployeeName = (id: string | null | undefined) => {
    if (!id) return '—';
    const emp = employees.find(e => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}` : id;
  };

  // Auto-calculate
  const calcTotal = () => { const bs = parseFloat(form.basicSalary) || 0; const ps = parseFloat(form.pendingSalary) || 0; const le = parseFloat(form.leaveEncashment) || 0; const gr = parseFloat(form.gratuity) || 0; const bn = parseFloat(form.bonus) || 0; const ded = parseFloat(form.deductions) || 0; return bs + ps + le + gr + bn - ded; };

  const handleOpenAdd = () => { setForm(initialForm); setEditingId(null); setShowForm(true); setViewingId(null); setDeleteConfirmId(null); setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const handleOpenEdit = (s: FNFSettlement) => {
    setForm({ employeeId: s.employeeId || '', basicSalary: String(s.basicSalary), pendingSalary: String(s.pendingSalary), leaveEncashment: String(s.leaveEncashment), gratuity: String(s.gratuity), bonus: String(s.bonus), deductions: String(s.deductions), status: s.status, paymentDate: s.paymentDate ? s.paymentDate.split('T')[0] : '', notes: s.notes || '' });
    setEditingId(s.id); setShowForm(true); setViewingId(null); setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };
  const handleOpenView = (s: FNFSettlement) => { setViewingId(s.id); setShowForm(false); setDeleteConfirmId(null); setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); };
  const handleCloseView = () => setViewingId(null);
  const handleCancelForm = () => { setShowForm(false); setEditingId(null); setForm(initialForm); };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = { employeeId: form.employeeId || null, basicSalary: form.basicSalary, pendingSalary: form.pendingSalary, leaveEncashment: form.leaveEncashment, gratuity: form.gratuity, bonus: form.bonus, deductions: form.deductions, status: form.status, paymentDate: form.paymentDate || null, notes: form.notes.trim() || null };
      const url = editingId ? `/api/fnf/${editingId}` : '/api/fnf';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(editingId ? 'Settlement updated' : 'Settlement created');
      handleCancelForm(); fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try { setDeleting(true); const res = await fetch(`/api/fnf/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); } toast.success('Settlement deleted'); setDeleteConfirmId(null); fetchData(); }
    catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); } finally { setDeleting(false); }
  };

  const filtered = settlements.filter(s => {
    const empName = getEmployeeName(s.employeeId).toLowerCase();
    const matchSearch = !search || empName.includes(search.toLowerCase());
    const matchStatus = !filterStatus || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalCount = settlements.length;
  const pendingCount = settlements.filter(s => s.status === 'pending').length;
  const processingCount = settlements.filter(s => s.status === 'processing').length;
  const paidCount = settlements.filter(s => s.status === 'paid').length;

  const viewingItem = viewingId ? settlements.find(s => s.id === viewingId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2"><FiDollarSign className="w-6 h-6 text-emerald-500" />FNF Settlement</h1><p className="text-nexus-text-secondary mt-1">Manage full and final settlements</p></div>
        {isAdmin && (<button onClick={handleOpenAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors"><FiPlus className="w-4 h-4" />Add Settlement</button>)}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiDollarSign className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{totalCount}</p><p className="text-xs text-nexus-text-muted">Total Settlements</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><FiClock className="w-5 h-5 text-amber-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{pendingCount}</p><p className="text-xs text-nexus-text-muted">Pending</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FiAlertCircle className="w-5 h-5 text-blue-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{processingCount}</p><p className="text-xs text-nexus-text-muted">Processing</p></div></div></div>
        <div className="nexus-card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><FiCheckCircle className="w-5 h-5 text-emerald-500" /></div><div><p className="text-lg font-bold text-nexus-text-primary">{paidCount}</p><p className="text-xs text-nexus-text-muted">Paid</p></div></div></div>
      </div>

      {viewingItem && (
        <div id="view-panel" className="nexus-card border-l-4 border-l-emerald-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">Settlement Details</h2><button onClick={handleCloseView} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><p className="text-xs font-medium text-nexus-text-muted">Employee</p><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{getEmployeeName(viewingItem.employeeId)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Status</p><p className="mt-0.5"><span className={getStatusBadge(viewingItem.status)}>{viewingItem.status}</span></p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Payment Date</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatDate(viewingItem.paymentDate)}</p></div>
              <div className="border-t border-nexus-border pt-4 sm:col-span-2 lg:col-span-3"><p className="text-xs font-semibold text-nexus-text-secondary uppercase mb-2">Earnings</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Basic Salary</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.basicSalary)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Pending Salary</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.pendingSalary)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Leave Encashment</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.leaveEncashment)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Gratuity</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.gratuity)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Bonus</p><p className="text-sm text-nexus-text-primary mt-0.5">{formatCurrency(viewingItem.bonus)}</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Deductions</p><p className="text-sm font-semibold text-red-600 mt-0.5">-{formatCurrency(viewingItem.deductions)}</p></div>
              <div className="border-t border-nexus-border pt-4 sm:col-span-2 lg:col-span-3"><p className="text-xs font-semibold text-nexus-text-secondary uppercase mb-2">Total</p></div>
              <div><p className="text-xs font-medium text-nexus-text-muted">Total Amount</p><p className="text-sm font-bold text-emerald-600 mt-0.5">{formatCurrency(viewingItem.totalAmount)}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-nexus-text-muted">Notes</p><p className="text-sm text-nexus-text-primary mt-0.5">{viewingItem.notes || '—'}</p></div>
            </div>
            <div className="mt-4 pt-4 border-t border-nexus-border"><button onClick={handleCloseView} className="px-4 py-2 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Close</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div id="crud-form" className={`nexus-card border-l-4 ${editingId ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Settlement' : 'Add Settlement'}</h2><button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee</label><select value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">Select Employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Status</label><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">{FNF_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Payment Date</label><input type="date" value={form.paymentDate} onChange={e => setForm(p => ({ ...p, paymentDate: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" /></div>
              <div className="border-t border-nexus-border pt-4 sm:col-span-2 lg:col-span-3"><p className="text-xs font-semibold text-nexus-text-secondary uppercase">Earnings</p></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Basic Salary</label><input type="number" step="0.01" value={form.basicSalary} onChange={e => setForm(p => ({ ...p, basicSalary: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Pending Salary</label><input type="number" step="0.01" value={form.pendingSalary} onChange={e => setForm(p => ({ ...p, pendingSalary: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Leave Encashment</label><input type="number" step="0.01" value={form.leaveEncashment} onChange={e => setForm(p => ({ ...p, leaveEncashment: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Gratuity</label><input type="number" step="0.01" value={form.gratuity} onChange={e => setForm(p => ({ ...p, gratuity: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Bonus</label><input type="number" step="0.01" value={form.bonus} onChange={e => setForm(p => ({ ...p, bonus: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Deductions</label><input type="number" step="0.01" value={form.deductions} onChange={e => setForm(p => ({ ...p, deductions: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="0.00" /></div>
              <div className="border-t border-nexus-border pt-4"><p className="text-xs font-medium text-nexus-text-muted">Total Amount</p><p className="text-sm font-bold text-emerald-600 mt-0.5">{formatCurrency(calcTotal())}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><label className="block text-xs font-medium text-nexus-text-secondary mb-1">Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" placeholder="Notes..." /></div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25">{submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" /><input type="text" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Search settlements..." /></div>
        <div className="flex items-center gap-2"><FiFilter className="w-4 h-4 text-nexus-text-muted" /><select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"><option value="">All Statuses</option>{FNF_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
      </div>

      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-nexus-border bg-slate-50/50"><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Total Amount</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th><th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Payment Date</th><th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th></tr></thead>
            <tbody>
              {loading ? (Array.from({ length: 3 }).map((_, i) => (<tr key={i} className="border-b border-nexus-border/50 animate-pulse"><td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td><td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td></tr>)))
              : filtered.length === 0 ? (<tr><td colSpan={5} className="px-4 py-12 text-center"><FiDollarSign className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No settlements found</p></td></tr>)
              : filtered.map(s => (<tr key={s.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">{deleteConfirmId === s.id ? (<td colSpan={5} className="px-4 py-3 bg-red-50"><div className="flex items-center justify-between"><span className="text-sm text-red-700 font-medium">Delete this settlement?</span><div className="flex items-center gap-2"><button onClick={() => handleDelete(s.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50">{deleting ? 'Deleting...' : 'Confirm'}</button><button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button></div></div></td>) : (<><td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{getEmployeeName(s.employeeId)}</td><td className="px-4 py-3 text-sm font-bold text-emerald-600">{formatCurrency(s.totalAmount)}</td><td className="px-4 py-3"><span className={getStatusBadge(s.status)}>{s.status}</span></td><td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(s.paymentDate)}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><button onClick={() => handleOpenView(s)} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>{isAdmin && (<><button onClick={() => handleOpenEdit(s)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button><button onClick={() => { setDeleteConfirmId(s.id); setShowForm(false); setViewingId(null); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button></>)}</div></td></>)}</tr>)))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
