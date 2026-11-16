'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FiArrowLeft, FiCheck, FiInfo, FiAlertTriangle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() { const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null; return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; }

export default function RequestAdjustmentPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [shortfallDays, setShortfallDays] = useState('');
  const [modeA, setModeA] = useState(false);
  const [modeADays, setModeADays] = useState('');
  const [modeB, setModeB] = useState(false);
  const [donorTypeId, setDonorTypeId] = useState('');
  const [modeBDays, setModeBDays] = useState('');
  const [reason, setReason] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const h = getAuthHeaders();
      const sq = scopeQuery();
      const sep = sq ? `&${sq}` : '';
      const [ltRes, balRes, empRes] = await Promise.all([
        fetch(`/api/leave-types?limit=50${sep}`, { headers: h }),
        fetch(`/api/leave/balance${sep ? `?${sq}` : ''}`, { headers: h }).catch(() => null),
        fetch(`/api/employees?limit=1&own=1&includePhotos=0${sep}`, { headers: h }),
      ]);
      if (ltRes.ok) { const d = await ltRes.json(); setLeaveTypes((d.data || []).filter((t: any) => t.status === 'active' || t.status === undefined)); }
      if (balRes?.ok) { const d = await balRes.json(); setBalances(d.balances || []); }
      if (empRes.ok) { const d = await empRes.json(); const me = d.employees?.find((e: any) => e.email === user?.email || e.userId === user?.id); if (me) setEmployee(me); }
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  }, [user?.email, scopeQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedBalance = balances.find(b => b.leaveType?.id === leaveTypeId);
  const available = selectedBalance ? Math.max(0, (selectedBalance.total || 0) - (selectedBalance.used || 0)) : 0;
  const shortfall = Number(shortfallDays) || 0;
  const totalCovered = (modeA ? Number(modeADays) || 0 : 0) + (modeB ? Number(modeBDays) || 0 : 0);
  const canSubmit = leaveTypeId && shortfall > 0 && totalCovered >= shortfall && reason.trim().length > 0 && employee?.id;

  const handleSubmit = async () => {
    if (!canSubmit) { toast.error('Please fill all required fields and ensure coverage ≥ shortfall'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/leave/adjustments', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: employee.id, leaveTypeId, shortfallDays: shortfall,
          modeA, modeADays: modeA ? Number(modeADays) || 0 : 0,
          modeB, modeBDonorTypeId: modeB ? donorTypeId : null, modeBDays: modeB ? Number(modeBDays) || 0 : 0,
          reason,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Adjustment request submitted — awaiting manager approval');
      router.push('/leave/adjustments');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[40vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>;

  const inputClass = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/leave/adjustments')} className="p-2 text-slate-400 hover:text-slate-600"><FiArrowLeft className="w-5 h-5" /></button>
        <div><h1 className="text-xl font-bold text-thb-text-primary">Request Leave Adjustment</h1><p className="text-sm text-thb-text-secondary">Cover a balance shortfall by advancing next year or transferring from another type</p></div>
      </div>

      <div className="thb-card p-5 space-y-4">
        {/* Leave type */}
        <div>
          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Leave type *</label>
          <select className={inputClass} value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)}>
            <option value="">Select leave type…</option>
            {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
          </select>
          {selectedBalance && <p className="text-xs text-slate-500 mt-1">Available balance: <b className="text-emerald-600">{available}</b> days</p>}
        </div>

        {/* Shortfall */}
        <div>
          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Shortfall days *</label>
          <input type="number" step="0.5" min="0.5" className={inputClass} value={shortfallDays} onChange={e => setShortfallDays(e.target.value)} placeholder="e.g. 3" />
          <p className="text-xs text-slate-500 mt-1">Days needed beyond your current balance</p>
        </div>

        {/* Mode A */}
        <div className="border border-slate-200 rounded-lg p-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={modeA} onChange={e => setModeA(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-600" />
            <span className="text-sm font-medium text-thb-text-primary">Mode A — Advance from next year</span>
          </label>
          {modeA && (
            <div className="mt-2 ml-6">
              <input type="number" step="0.5" min="0" className={inputClass} value={modeADays} onChange={e => setModeADays(e.target.value)} placeholder="Days to advance from next year" />
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><FiAlertTriangle className="w-3 h-3" /> This reduces your next year's entitlement</p>
            </div>
          )}
        </div>

        {/* Mode B */}
        <div className="border border-slate-200 rounded-lg p-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={modeB} onChange={e => setModeB(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-600" />
            <span className="text-sm font-medium text-thb-text-primary">Mode B — Transfer from another leave type</span>
          </label>
          {modeB && (
            <div className="mt-2 ml-6 space-y-2">
              <select className={inputClass} value={donorTypeId} onChange={e => setDonorTypeId(e.target.value)}>
                <option value="">Select donor leave type…</option>
                {leaveTypes.filter(t => t.id !== leaveTypeId).map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
              </select>
              <input type="number" step="0.5" min="0" className={inputClass} value={modeBDays} onChange={e => setModeBDays(e.target.value)} placeholder="Days to transfer" />
            </div>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Reason *</label>
          <textarea rows={3} className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why do you need this adjustment?" />
        </div>

        {/* Summary */}
        {shortfall > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Shortfall</span><span className="font-bold text-red-600">{shortfall} days</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-slate-500">Coverage</span><span className={`font-bold ${totalCovered >= shortfall ? 'text-emerald-600' : 'text-amber-600'}`}>{totalCovered} days</span>
            </div>
            {totalCovered < shortfall && totalCovered > 0 && <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><FiInfo className="w-3 h-3" /> Coverage is {shortfall - totalCovered} day(s) short</p>}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => router.push('/leave/adjustments')} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={!canSubmit || submitting} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {submitting ? 'Submitting…' : <><FiCheck className="w-4 h-4" /> Submit request</>}
          </button>
        </div>
      </div>
    </div>
  );
}
