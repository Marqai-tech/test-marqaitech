'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiX, FiDollarSign, FiCheck, FiEye, FiEdit2, FiTrash2, FiAlertCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface FNFCalculation {
  id: string; pendingSalary: number; leaveEncashment: number; bonus: number; incentives: number; noticeRecovery: number; assetRecovery: number; loanRecovery: number; taxDeduction: number; otherRecoveries: number; totalEarnings: number; totalDeductions: number; netAmount: number; currency: string; status: string; remarks?: string | null;
  employee?: { firstName: string; lastName: string; employeeId: string };
}

const initialForm = {
  employeeId: '', separationId: '', pendingSalary: 0, leaveEncashment: 0, bonus: 0, incentives: 0, noticeRecovery: 0, assetRecovery: 0, loanRecovery: 0, taxDeduction: 0, otherRecoveries: 0,
};

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'nexus-badge nexus-badge-warning',
    approved: 'nexus-badge nexus-badge-info',
    paid: 'nexus-badge nexus-badge-success',
    cancelled: 'nexus-badge nexus-badge-error',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

export default function FNFPage() {
  const [calculations, setCalculations] = useState<FNFCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/fnf?limit=100', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setCalculations(Array.isArray(data) ? data : data.fnfCalculations || data.calculations || []); }
    } catch { toast.error('Failed to load FNF data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  const totalEarnings = form.pendingSalary + form.leaveEncashment + form.bonus + form.incentives;
  const totalDeductions = form.noticeRecovery + form.assetRecovery + form.loanRecovery + form.taxDeduction + form.otherRecoveries;
  const netAmount = totalEarnings - totalDeductions;

  const handleAddNew = () => {
    setForm(initialForm);
    setEditingId(null);
    setShowForm(true);
    setViewingId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleEdit = (item: FNFCalculation) => {
    setForm({
      employeeId: item.employee?.employeeId || '',
      separationId: '',
      pendingSalary: item.pendingSalary || 0,
      leaveEncashment: item.leaveEncashment || 0,
      bonus: item.bonus || 0,
      incentives: item.incentives || 0,
      noticeRecovery: item.noticeRecovery || 0,
      assetRecovery: item.assetRecovery || 0,
      loanRecovery: item.loanRecovery || 0,
      taxDeduction: item.taxDeduction || 0,
      otherRecoveries: item.otherRecoveries || 0,
    });
    setEditingId(item.id);
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
    if (!form.employeeId && !editingId) { toast.error('Employee ID is required'); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/fnf/${editingId}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ ...form, totalEarnings, totalDeductions, netAmount }) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('FNF updated');
      } else {
        const res = await fetch('/api/fnf', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...form, totalEarnings, totalDeductions, netAmount }) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        toast.success('FNF calculated');
      }
      handleCancelForm();
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/fnf/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('FNF record deleted');
      setDeleteConfirmId(null);
      if (viewingId === id) setViewingId(null);
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed to delete'); }
    finally { setDeleting(false); }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/fnf/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status: action }) });
      if (!res.ok) throw new Error('Failed');
      toast.success(`FNF ${action}`);
      fetchData();
    } catch { toast.error('Action failed'); }
  };

  const colCount = 9;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary">FNF Settlement</h1>
          <p className="text-nexus-text-secondary mt-1">Full and Final settlement calculations</p>
        </div>
        <button onClick={handleAddNew} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
          <FiDollarSign className="w-4 h-4" /> Calculate FNF
        </button>
      </div>

      {/* View Panel */}
      {viewingId && (() => {
        const item = calculations.find(i => i.id === viewingId);
        if (!item) return null;
        return (
          <div id="view-panel" className="nexus-card border-l-4 border-l-emerald-500">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-nexus-text-primary">FNF Settlement Details</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleEdit(item)} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors flex items-center gap-1"><FiEdit2 className="w-3.5 h-3.5" />Edit</button>
                  <button onClick={() => setViewingId(null)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div><span className="text-xs font-medium text-nexus-text-secondary">Employee</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : '—'}</p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Currency</span><p className="text-sm font-medium text-nexus-text-primary mt-0.5">{item.currency || 'USD'}</p></div>
                <div><span className="text-xs font-medium text-nexus-text-secondary">Status</span><p className="mt-0.5"><span className={getStatusBadge(item.status)}>{item.status}</span></p></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Earnings */}
                <div className="bg-emerald-50/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-emerald-700 mb-3">Earnings</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Pending Salary</span><span className="font-medium text-nexus-text-primary">{item.currency} {item.pendingSalary?.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Leave Encashment</span><span className="font-medium text-nexus-text-primary">{item.currency} {item.leaveEncashment?.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Bonus</span><span className="font-medium text-nexus-text-primary">{item.currency} {item.bonus?.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Incentives</span><span className="font-medium text-nexus-text-primary">{item.currency} {item.incentives?.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm border-t border-emerald-200 pt-2 mt-2"><span className="font-semibold text-emerald-700">Total Earnings</span><span className="font-bold text-emerald-700">{item.currency} {item.totalEarnings?.toLocaleString()}</span></div>
                  </div>
                </div>

                {/* Deductions */}
                <div className="bg-red-50/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-red-700 mb-3">Deductions</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Notice Recovery</span><span className="font-medium text-nexus-text-primary">{item.currency} {item.noticeRecovery?.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Asset Recovery</span><span className="font-medium text-nexus-text-primary">{item.currency} {item.assetRecovery?.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Loan Recovery</span><span className="font-medium text-nexus-text-primary">{item.currency} {item.loanRecovery?.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Tax Deduction</span><span className="font-medium text-nexus-text-primary">{item.currency} {item.taxDeduction?.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Other Recoveries</span><span className="font-medium text-nexus-text-primary">{item.currency} {item.otherRecoveries?.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm border-t border-red-200 pt-2 mt-2"><span className="font-semibold text-red-700">Total Deductions</span><span className="font-bold text-red-700">{item.currency} {item.totalDeductions?.toLocaleString()}</span></div>
                  </div>
                </div>
              </div>

              {/* Net Amount */}
              <div className="mt-4 bg-slate-50 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-nexus-text-primary">Net Amount</span>
                  <span className="text-xl font-bold text-nexus-text-primary">{item.currency} {item.netAmount?.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Embedded Form */}
      {showForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-blue-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingId ? 'Edit FNF Settlement' : 'Calculate New FNF'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee ID *</label>
                <input required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="Enter employee ID" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" disabled={!!editingId} />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Separation ID</label>
                <input value={form.separationId} onChange={(e) => setForm({ ...form, separationId: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
            </div>

            {/* Earnings */}
            <div className="border-t border-nexus-border pt-4 mb-4">
              <h3 className="text-sm font-semibold text-emerald-700 mb-3">Earnings</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { key: 'pendingSalary', label: 'Pending Salary' },
                  { key: 'leaveEncashment', label: 'Leave Encashment' },
                  { key: 'bonus', label: 'Bonus' },
                  { key: 'incentives', label: 'Incentives' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">{label}</label>
                    <input type="number" value={(form as Record<string, number>)[key]} onChange={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                ))}
              </div>
            </div>

            {/* Deductions */}
            <div className="border-t border-nexus-border pt-4 mb-4">
              <h3 className="text-sm font-semibold text-red-700 mb-3">Deductions</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { key: 'noticeRecovery', label: 'Notice Recovery' },
                  { key: 'assetRecovery', label: 'Asset Recovery' },
                  { key: 'loanRecovery', label: 'Loan Recovery' },
                  { key: 'taxDeduction', label: 'Tax Deduction' },
                  { key: 'otherRecoveries', label: 'Other Recoveries' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">{label}</label>
                    <input type="number" value={(form as Record<string, number>)[key]} onChange={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                ))}
              </div>
            </div>

            {/* Live Summary */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 mb-4">
              <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Total Earnings:</span><span className="font-semibold text-emerald-600">{totalEarnings.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-nexus-text-secondary">Total Deductions:</span><span className="font-semibold text-red-600">{totalDeductions.toLocaleString()}</span></div>
              <div className="flex justify-between text-base border-t border-nexus-border pt-2"><span className="font-medium text-nexus-text-primary">Net Amount:</span><span className="font-bold text-nexus-text-primary">{netAmount.toLocaleString()}</span></div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">{submitting ? 'Saving...' : editingId ? 'Update' : 'Calculate'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Pending Salary</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Leave Encash.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Total Earnings</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Total Deductions</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Net Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Workflow</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    {Array.from({ length: colCount }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : calculations.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center">
                    <FiAlertCircle className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No FNF calculations found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Calculate your first FNF settlement to get started</p>
                  </td>
                </tr>
              ) : (
                calculations.map((fnf) => (
                  <tr key={fnf.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                    {deleteConfirmId === fnf.id ? (
                      <td colSpan={colCount} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-700 font-medium">Are you sure you want to delete this FNF record?</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleDelete(fnf.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">{deleting ? 'Deleting...' : 'Confirm'}</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{fnf.employee ? `${fnf.employee.firstName} ${fnf.employee.lastName}` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{fnf.currency} {fnf.pendingSalary?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-nexus-text-secondary">{fnf.currency} {fnf.leaveEncashment?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm font-medium text-emerald-600">{fnf.currency} {fnf.totalEarnings?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm font-medium text-red-600">{fnf.currency} {fnf.totalDeductions?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm font-bold text-nexus-text-primary">{fnf.currency} {fnf.netAmount?.toLocaleString()}</td>
                        <td className="px-4 py-3"><span className={getStatusBadge(fnf.status)}>{fnf.status}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {fnf.status === 'pending' && <button onClick={() => handleAction(fnf.id, 'approved')} className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 flex items-center gap-1"><FiCheck className="w-3 h-3" />Approve</button>}
                            {fnf.status === 'approved' && <button onClick={() => handleAction(fnf.id, 'paid')} className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100 flex items-center gap-1"><FiDollarSign className="w-3 h-3" />Pay</button>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => { setViewingId(fnf.id); setTimeout(() => document.getElementById('view-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="View"><FiEye className="w-4 h-4" /></button>
                            <button onClick={() => handleEdit(fnf)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit"><FiEdit2 className="w-4 h-4" /></button>
                            <button onClick={() => setDeleteConfirmId(fnf.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                          </div>
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
