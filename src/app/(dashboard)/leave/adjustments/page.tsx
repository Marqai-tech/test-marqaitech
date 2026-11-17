'use client';
import { useEffect, useState, useCallback } from 'react';
import { FiRefreshCw, FiEye, FiCheck, FiX, FiAlertTriangle, FiLayers } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() { const t = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null; return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; }

interface Adjustment {
  id: string; employeeId: string; leaveTypeId: string; shortfallDays: number;
  modeA: boolean; modeADays: number; modeB: boolean; modeBDonorTypeId: string | null; modeBDays: number;
  status: string; reason: string | null; createdAt: string;
  firstName: string; lastName: string; empcode: string;
  leavetypename: string; leavetypecode: string; calendarcolor: string | null;
}

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  manager_approved: { label: 'Manager Approved', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  hr_approved: { label: 'Approved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  rejected: { label: 'Rejected', bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-100 border-slate-200', text: 'text-slate-500' },
};

export default function AdjustmentsPage() {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(user?.role || '');
  const isManager = user?.role === 'manager' || isAdmin;
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState<Adjustment | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [remarks, setRemarks] = useState('');

  const fetchAdjustments = useCallback(async () => {
    try {
      setLoading(true);
      const sq = scopeQuery();
      const sep = sq ? `&${sq}` : '';
      const statusParam = filterStatus !== 'all' ? `&status=${filterStatus}` : '';
      const res = await fetch(`/api/leave/adjustments?limit=100${statusParam}${sep}`, { headers: getAuthHeaders() });
      if (res.ok) { const d = await res.json(); setAdjustments(d.data || []); }
    } catch { toast.error('Failed to load adjustments'); }
    finally { setLoading(false); }
  }, [scopeQuery, filterStatus]);

  useEffect(() => { fetchAdjustments(); }, [fetchAdjustments]);

  const handleAction = async (adj: Adjustment, action: 'approve' | 'reject', level: 'manager' | 'hr') => {
    if (action === 'reject' && !remarks.trim()) { toast.error('Remarks are mandatory on rejection'); return; }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/leave/adjustments/${adj.id}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ action, level, remarks }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(`${action === 'approve' ? 'Approved' : 'Rejected'} successfully`);
      setSelected(null); setRemarks(''); fetchAdjustments();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setActionLoading(false); }
  };

  const handleReverse = async (adj: Adjustment) => {
    if (!confirm('Reverse this approved adjustment? Ledger entries will be reversed.')) return;
    try {
      const res = await fetch(`/api/leave/adjustments/${adj.id}/reverse`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ reason: 'Admin cancellation' }) });
      if (!res.ok) throw new Error('Failed');
      toast.success('Adjustment reversed — ledger entries cancelled');
      fetchAdjustments();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  if (!isManager) return <div className="flex items-center justify-center min-h-[40vh]"><div className="text-center"><FiLayers className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-500">Adjustments are available to Manager/Admin roles.</p></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-50"><FiLayers className="w-5 h-5 text-violet-600" /></div>
          <div><h1 className="text-xl font-bold text-thb-text-primary">Leave Adjustments</h1><p className="text-sm text-thb-text-secondary">{adjustments.length} requests · Mode A (advance) + Mode B (transfer)</p></div>
        </div>
        <button onClick={fetchAdjustments} className="inline-flex items-center gap-2 px-3 py-2 text-slate-600 rounded-lg text-sm"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {['all', 'pending', 'manager_approved', 'hr_approved', 'rejected', 'cancelled'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${filterStatus === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {s === 'all' ? 'All' : STATUS_META[s]?.label || s}
            {filterStatus === s && <span className="ml-1.5 px-1 rounded-full bg-white/20">{adjustments.length}</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="thb-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-thb-border bg-slate-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Employee</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Leave Type</th>
              <th className="text-center px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Shortfall</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Mode</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Reason</th>
              <th className="text-center px-5 py-3 text-xs font-semibold text-thb-text-secondary uppercase">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading…</td></tr> :
              adjustments.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-slate-500">No adjustment requests.</td></tr> :
              adjustments.map(a => {
                const sm = STATUS_META[a.status] || STATUS_META.pending;
                return (
                  <tr key={a.id} className="border-b border-thb-border last:border-b-0 hover:bg-slate-50">
                    <td className="px-5 py-3"><p className="text-sm font-medium text-thb-text-primary">{a.firstName} {a.lastName}</p><p className="text-xs text-thb-text-muted">{a.empcode}</p></td>
                    <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5"><span className="w-6 h-6 rounded text-white text-[9px] font-bold flex items-center justify-center" style={{ background: a.calendarcolor || '#10b981' }}>{a.leavetypecode}</span><span className="text-sm text-slate-600">{a.leavetypename}</span></span></td>
                    <td className="px-5 py-3 text-center text-sm font-bold text-red-600">{a.shortfallDays} d</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{a.modeA && <span className="inline-block bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded mr-1">A: {a.modeADays}d</span>}{a.modeB && <span className="inline-block bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">B: {a.modeBDays}d</span>}</td>
                    <td className="px-5 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${sm.bg} ${sm.text}`}>{sm.label}</span></td>
                    <td className="px-5 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={a.reason || ''}>{a.reason || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {a.status === 'pending' && <button onClick={() => setSelected(a)} className="p-1.5 text-thb-text-muted hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Review"><FiEye className="w-4 h-4" /></button>}
                        {a.status === 'manager_approved' && isAdmin && <button onClick={() => setSelected(a)} className="p-1.5 text-thb-text-muted hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="HR Review"><FiEye className="w-4 h-4" /></button>}
                        {a.status === 'hr_approved' && <button onClick={() => handleReverse(a)} className="p-1.5 text-thb-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg" title="Reverse"><FiAlertTriangle className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !actionLoading && setSelected(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="font-semibold">Review Adjustment</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-slate-500">Employee</span><span className="font-medium">{selected.firstName} {selected.lastName}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Leave type</span><span className="font-medium">{selected.leavetypename}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Shortfall</span><span className="font-bold text-red-600">{selected.shortfallDays} days</span></div>
                {selected.modeA && <div className="flex justify-between"><span className="text-slate-500">Mode A (advance)</span><span className="font-medium">{selected.modeADays} days from next year</span></div>}
                {selected.modeB && <div className="flex justify-between"><span className="text-slate-500">Mode B (transfer)</span><span className="font-medium">{selected.modeBDays} days from donor</span></div>}
                <div className="flex justify-between"><span className="text-slate-500">Reason</span><span className="text-right">{selected.reason || '—'}</span></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Remarks {selected.status === 'pending' ? '(mandatory on reject)' : '(mandatory on reject)'}</label>
                <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Enter approval or rejection remarks…" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
              <button onClick={() => { setSelected(null); setRemarks(''); }} className="px-3 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={() => handleAction(selected, 'reject', selected.status === 'pending' ? 'manager' : 'hr')} disabled={actionLoading} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"><FiX className="w-4 h-4 inline mr-1" /> Reject</button>
              <button onClick={() => handleAction(selected, 'approve', selected.status === 'pending' ? 'manager' : 'hr')} disabled={actionLoading} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"><FiCheck className="w-4 h-4 inline mr-1" /> Approve</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
