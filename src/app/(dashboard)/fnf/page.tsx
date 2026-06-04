'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiX, FiDollarSign, FiCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface FNFCalculation {
  id: string; pendingSalary: number; leaveEncashment: number; bonus: number; incentives: number; noticeRecovery: number; assetRecovery: number; loanRecovery: number; taxDeduction: number; otherRecoveries: number; totalEarnings: number; totalDeductions: number; netAmount: number; currency: string; status: string;
  employee?: { firstName: string; lastName: string; employeeId: string };
}

export default function FNFPage() {
  const [calculations, setCalculations] = useState<FNFCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    employeeId: '', separationId: '', pendingSalary: 0, leaveEncashment: 0, bonus: 0, incentives: 0, noticeRecovery: 0, assetRecovery: 0, loanRecovery: 0, taxDeduction: 0, otherRecoveries: 0,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/fnf', { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setCalculations(Array.isArray(data) ? data : data.calculations || []); }
    } catch { toast.error('Failed to load FNF data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalEarnings = form.pendingSalary + form.leaveEncashment + form.bonus + form.incentives;
  const totalDeductions = form.noticeRecovery + form.assetRecovery + form.loanRecovery + form.taxDeduction + form.otherRecoveries;
  const netAmount = totalEarnings - totalDeductions;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId) { toast.error('Employee ID is required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/fnf', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ...form, totalEarnings, totalDeductions, netAmount }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('FNF calculated');
      setShowCalcModal(false);
      setForm({ employeeId: '', separationId: '', pendingSalary: 0, leaveEncashment: 0, bonus: 0, incentives: 0, noticeRecovery: 0, assetRecovery: 0, loanRecovery: 0, taxDeduction: 0, otherRecoveries: 0 });
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/fnf/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status: action }) });
      if (!res.ok) throw new Error('Failed');
      toast.success(`FNF ${action}`);
      fetchData();
    } catch { toast.error('Action failed'); }
  };

  const statusConfig: Record<string, { bg: string; text: string }> = {
    pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
    approved: { bg: 'bg-blue-100', text: 'text-blue-700' },
    paid: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    cancelled: { bg: 'bg-red-100', text: 'text-red-700' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">FNF Settlement</h1><p className="text-slate-500 mt-1">Full and Final settlement calculations</p></div>
        <button onClick={() => setShowCalcModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"><FiDollarSign className="w-4 h-4" /> Calculate FNF</button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden"><div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />))}</div></div>
      ) : calculations.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center"><FiDollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No FNF calculations found</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Employee', 'Pending Salary', 'Leave Encash.', 'Total Earnings', 'Total Deductions', 'Net Amount', 'Status', 'Actions'].map((h) => (<th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calculations.map((fnf) => (
                  <tr key={fnf.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{fnf.employee ? `${fnf.employee.firstName} ${fnf.employee.lastName}` : '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{fnf.currency} {fnf.pendingSalary?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{fnf.currency} {fnf.leaveEncashment?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm font-medium text-emerald-600">{fnf.currency} {fnf.totalEarnings?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm font-medium text-red-600">{fnf.currency} {fnf.totalDeductions?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900">{fnf.currency} {fnf.netAmount?.toLocaleString()}</td>
                    <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[fnf.status]?.bg || ''} ${statusConfig[fnf.status]?.text || ''}`}>{fnf.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {fnf.status === 'pending' && <button onClick={() => handleAction(fnf.id, 'approved')} className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 flex items-center gap-1"><FiCheck className="w-3 h-3" />Approve</button>}
                        {fnf.status === 'approved' && <button onClick={() => handleAction(fnf.id, 'paid')} className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100 flex items-center gap-1"><FiDollarSign className="w-3 h-3" />Pay</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calculate FNF Modal */}
      {showCalcModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCalcModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200"><h2 className="text-lg font-semibold text-slate-900">Calculate FNF</h2><button onClick={() => setShowCalcModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><FiX className="w-5 h-5 text-slate-500" /></button></div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Employee ID *</label><input required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="Enter employee ID" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Separation ID</label><input value={form.separationId} onChange={(e) => setForm({ ...form, separationId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" /></div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-emerald-700 mb-3">Earnings</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'pendingSalary', label: 'Pending Salary' },
                    { key: 'leaveEncashment', label: 'Leave Encashment' },
                    { key: 'bonus', label: 'Bonus' },
                    { key: 'incentives', label: 'Incentives' },
                  ].map(({ key, label }) => (
                    <div key={key}><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label><input type="number" value={(form as Record<string, number>)[key]} onChange={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/20" /></div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-red-700 mb-3">Deductions</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'noticeRecovery', label: 'Notice Recovery' },
                    { key: 'assetRecovery', label: 'Asset Recovery' },
                    { key: 'loanRecovery', label: 'Loan Recovery' },
                    { key: 'taxDeduction', label: 'Tax Deduction' },
                    { key: 'otherRecoveries', label: 'Other Recoveries' },
                  ].map(({ key, label }) => (
                    <div key={key}><label className="block text-xs font-medium text-slate-600 mb-1">{label}</label><input type="number" value={(form as Record<string, number>)[key]} onChange={(e) => setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/20" /></div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-600">Total Earnings:</span><span className="font-semibold text-emerald-600">${totalEarnings.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600">Total Deductions:</span><span className="font-semibold text-red-600">${totalDeductions.toLocaleString()}</span></div>
                <div className="flex justify-between text-base border-t border-slate-200 pt-2"><span className="font-medium text-slate-900">Net Amount:</span><span className="font-bold text-slate-900">${netAmount.toLocaleString()}</span></div>
              </div>

              <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => setShowCalcModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button><button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Calculating...' : 'Calculate'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
