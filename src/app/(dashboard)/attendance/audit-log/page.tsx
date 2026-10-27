'use client';

import { useEffect, useState, useCallback } from 'react';
import { FiLock, FiRefreshCw, FiEye } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import ModuleTips from '@/components/ModuleTips';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface AuditLog {
  id: string;
  action: string;
  beforeData: unknown;
  afterData: unknown;
  changedBy: string;
  changedByIp: string | null;
  reason: string | null;
  createdAt: string;
  employee: { id: string; firstName: string; lastName: string; employeeId: string };
}

// Spec §3: regularization request audit row — all 15 mandatory audit fields.
interface RegularizationAudit {
  id: string;
  // Requested For
  employeeId: string;
  employee: { id: string; firstName: string; lastName: string; employeeId: string };
  // Submitted By
  submittedById?: string | null;
  submittedByRole?: string | null;
  source?: string; // "employee" | "hr_proxy"
  // Request Type / Attendance Date
  date: string;
  punchType: string;
  // Requested Punch-in / Punch-out
  requestedTime: string;
  requestedPunchOut?: string | null;
  // Existing Punch-in / Punch-out (snapshot at submission)
  existingPunchIn?: string | null;
  existingPunchOut?: string | null;
  // Reason
  reason: string;
  // Approver / Status / Manager Comment
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  status: string;
  comments?: string | null;
  // Submitted Date & Time
  createdAt: string;
}

export default function AuditLogPage() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin'].includes(user?.role || '');

  const [tab, setTab] = useState<'changes' | 'regularization'>('changes');
  const [items, setItems] = useState<AuditLog[]>([]);
  const [regItems, setRegItems] = useState<RegularizationAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filterAction) params.set('action', filterAction);
      const sq = scopeQuery();
      const r = await fetch(`/api/attendance/audit-log?${params.toString()}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setItems(d.auditLogs || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filterAction, scopeQuery, selectedTenantId]);

  const fetchRegItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const sq = scopeQuery();
      const r = await fetch(`/api/attendance/regularize?${params.toString()}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setRegItems(d.regularizations || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, scopeQuery, selectedTenantId]);

  useEffect(() => {
    if (!isAdmin) return;
    if (tab === 'changes') fetchItems();
    else fetchRegItems();
  }, [fetchItems, fetchRegItems, isAdmin, tab]);

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <FiLock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Attendance Audit Logs are restricted to admins.</p>
      </div>
    );
  }

  const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const fmtTime = (d: string | null | undefined) => d
    ? new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const punchTypeLabel = (t: string) => ({
    check_in: 'Punch-in', check_out: 'Punch-out', break_in: 'Break-In',
    break_out: 'Break-Out', production_shortfall: 'Production Hours Shortfall',
  } as Record<string, string>)[t] || t;
  const sourceLabel = (s?: string) => s === 'hr_proxy' ? 'HR Proxy' : 'Employee';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FiLock className="w-6 h-6 text-slate-600" />
            Attendance Audit Trail
          </h1>
          <p className="text-sm text-slate-500 mt-1">Append-only log of every attendance change + spec-compliant regularization audit (15 mandatory fields)</p>
        </div>
        <button onClick={tab === 'changes' ? fetchItems : fetchRegItems} className="3boxes-btn-secondary flex items-center gap-2">
          <FiRefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <ModuleTips moduleKey="attendance-audit-log">
        <p><strong>REQ-SEC-ATT-04 + Regularization Spec §3:</strong> Every attendance change retains original + changed data, timestamp, and IP. Regularization requests additionally retain all 15 spec audit fields: Requested For, Submitted By, Request Type, Attendance Date, Existing Punch-in/out, Requested Punch-in/out, Reason, Approver, Status, Manager Comment, Submitted Date &amp; Time, Action Date &amp; Time, Source.</p>
      </ModuleTips>

      {/* Tab toggle */}
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setTab('changes')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'changes' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Attendance Changes (row-diff)
          </button>
          <button
            onClick={() => setTab('regularization')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'regularization' ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Regularization Audit (15 spec fields)
          </button>
        </div>

        {tab === 'changes' ? (
          <div className="flex items-center gap-3">
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="3boxes-input min-w-[200px]">
              <option value="">All actions</option>
              <option value="manual_edit">Manual edit</option>
              <option value="regularization_approved">Regularization approved</option>
              <option value="shift_change">Shift change</option>
              <option value="mass_correction">Mass correction</option>
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="3boxes-input min-w-[200px]">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <span className="text-xs text-slate-500">
              {regItems.length} regularization request{regItems.length === 1 ? '' : 's'} on file
            </span>
          </div>
        )}
      </div>

      {tab === 'changes' ? (
        <div className="thb-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Timestamp</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Employee</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Action</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Changed By</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">IP</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Reason</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-500">No audit entries yet</td></tr>
                ) : items.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700 text-xs">{fmtDateTime(l.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-700">{l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">{l.action.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 text-xs font-mono">{l.changedBy}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">{l.changedByIp || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate text-xs">{l.reason || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setSelected(l)} className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded" title="View diff">
                        <FiEye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ─── Spec §3: Regularization Audit table — all 15 mandatory fields ───
        <div className="thb-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Requested For</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Submitted By</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Source</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Request Type</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Attendance Date</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Existing Punch-in</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Existing Punch-out</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Requested Punch-in</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Requested Punch-out</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Reason</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Approver</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Status</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Manager Comment</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Submitted Date &amp; Time</th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700">Action Date &amp; Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={15} className="text-center py-8 text-slate-400">Loading...</td></tr>
                ) : regItems.length === 0 ? (
                  <tr><td colSpan={15} className="text-center py-12 text-slate-500">No regularization requests yet</td></tr>
                ) : regItems.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    {/* Spec §3 #1: Requested For */}
                    <td className="px-3 py-3 text-slate-800 font-medium whitespace-nowrap">
                      {r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : '—'}
                      <div className="text-[10px] text-slate-400 font-normal">{r.employee?.employeeId || ''}</div>
                    </td>
                    {/* Spec §3 #2: Submitted By */}
                    <td className="px-3 py-3 text-slate-700">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.source === 'hr_proxy' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-600'}`}>
                        {sourceLabel(r.source)}
                      </span>
                      {r.submittedByRole && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{r.submittedByRole}</div>
                      )}
                    </td>
                    {/* Spec §3 #15: Source */}
                    <td className="px-3 py-3 text-slate-700">{sourceLabel(r.source)}</td>
                    {/* Spec §3 #3: Request Type */}
                    <td className="px-3 py-3 text-slate-700">{punchTypeLabel(r.punchType)}</td>
                    {/* Spec §3 #4: Attendance Date */}
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap">{fmtDate(r.date)}</td>
                    {/* Spec §3 #5: Existing Punch-in */}
                    <td className="px-3 py-3 text-slate-700">{fmtTime(r.existingPunchIn)}</td>
                    {/* Spec §3 #6: Existing Punch-out */}
                    <td className="px-3 py-3 text-slate-700">{fmtTime(r.existingPunchOut)}</td>
                    {/* Spec §3 #7: Requested Punch-in */}
                    <td className="px-3 py-3 text-slate-700">{r.punchType === 'check_in' || r.punchType === 'break_in' ? fmtTime(r.requestedTime) : '—'}</td>
                    {/* Spec §3 #8: Requested Punch-out */}
                    <td className="px-3 py-3 text-slate-700">
                      {r.punchType === 'check_out' || r.punchType === 'break_out'
                        ? fmtTime(r.requestedTime)
                        : fmtTime(r.requestedPunchOut)}
                    </td>
                    {/* Spec §3 #9: Reason */}
                    <td className="px-3 py-3 text-slate-600 max-w-[200px] truncate" title={r.reason}>{r.reason}</td>
                    {/* Spec §3 #10: Approver */}
                    <td className="px-3 py-3 text-slate-700 text-[11px] font-mono">{r.approvedBy || '—'}</td>
                    {/* Spec §3 #11: Status */}
                    <td className="px-3 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{r.status}</span>
                    </td>
                    {/* Spec §3 #12: Manager Comment */}
                    <td className="px-3 py-3 text-slate-600 max-w-[200px] truncate" title={r.comments || ''}>{r.comments || '—'}</td>
                    {/* Spec §3 #13: Submitted Date & Time */}
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap text-[11px]">{fmtDateTime(r.createdAt)}</td>
                    {/* Spec §3 #14: Action Date & Time */}
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap text-[11px]">
                      {r.approvedAt ? fmtDateTime(r.approvedAt) : r.rejectedAt ? fmtDateTime(r.rejectedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Diff modal (attendance changes tab only) */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Audit Diff</h2>
                <p className="text-xs text-slate-500">{selected.action.replace(/_/g, ' ')} · {fmtDateTime(selected.createdAt)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">Before</h3>
                <pre className="text-xs bg-red-50 p-3 rounded-lg overflow-x-auto text-red-900">{JSON.stringify(selected.beforeData, null, 2) || '— (no prior record)'}</pre>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">After</h3>
                <pre className="text-xs bg-emerald-50 p-3 rounded-lg overflow-x-auto text-emerald-900">{JSON.stringify(selected.afterData, null, 2) || '—'}</pre>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 text-xs text-slate-600 space-y-1">
              <p><strong>Employee:</strong> {selected.employee?.firstName} {selected.employee?.lastName} ({selected.employee?.employeeId})</p>
              <p><strong>Changed by:</strong> {selected.changedBy} · IP: {selected.changedByIp || '—'}</p>
              <p><strong>Reason:</strong> {selected.reason || '—'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
