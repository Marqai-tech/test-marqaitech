'use client';

import { useEffect, useState, useCallback } from 'react';
import { FiClock, FiPlus, FiRefreshCw, FiCheckCircle, FiXCircle, FiGift, FiEye, FiEdit2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import ModuleTips from '@/components/ModuleTips';
import ApproverChainPreview from '@/components/ApproverChainPreview';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface OTRequest {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  estimatedHours: number;
  reason: string;
  payoutPreference: string;
  status: string;
  compOffCreditedAt: string | null;
  comments?: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string };
}

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function localTimeInput(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function hoursBetweenTimes(start: string, end: string) {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  return endMinutes > startMinutes ? Math.round(((endMinutes - startMinutes) / 60) * 100) / 100 : 0;
}

export default function OvertimeRequestPage() {
  const { user } = useAuthStore();
  const userRole = user?.role;
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'company_hr_admin', 'hr_admin', 'hrhead', 'recruitmenthead'].includes(user?.role || '');

  const [items, setItems] = useState<OTRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<OTRequest | null>(null);

  const today = localToday();
  const [form, setForm] = useState({
    date: today,
    startTime: '',
    endTime: '',
    reason: '',
    payoutPreference: 'payout',
  });

  const fetchItems = useCallback(async (): Promise<OTRequest[] | null> => {
    try {
      const scopedParams = new URLSearchParams(scopeQuery());
      if (userRole === 'super_admin' && selectedTenantId) scopedParams.set('tenantId', selectedTenantId);
      const sq = scopedParams.toString();
      const r = await fetch(`/api/attendance/overtime-request?limit=100${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      return d.overtimeRequests || [];
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
      return null;
    }
  }, [scopeQuery, selectedTenantId, userRole]);

  useEffect(() => {
    let active = true;
    void fetchItems().then(requests => {
      if (!active) return;
      if (requests) setItems(requests);
      setLoading(false);
    });
    return () => { active = false; };
  }, [fetchItems]);

  const refreshItems = useCallback(async () => {
    const requests = await fetchItems();
    if (requests) setItems(requests);
  }, [fetchItems]);

  const computedHours = form.startTime && form.endTime ? hoursBetweenTimes(form.startTime, form.endTime) : 0;

  const handleSubmit = async () => {
    if (!form.date || !form.startTime || !form.endTime || !form.reason) {
      toast.error('All fields are required');
      return;
    }
    setSubmitting(true);
    try {
      if (form.date > today) {
        toast.error('Overtime cannot be requested for a future date.');
        return;
      }
      if (!computedHours) {
        toast.error('End time must be after start time');
        return;
      }
      const r = await fetch(editingId ? `/api/attendance/overtime-request/${editingId}` : '/api/attendance/overtime-request', {
        method: editingId ? 'PATCH' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          date: form.date, startTime: form.startTime, endTime: form.endTime,
          reason: form.reason, payoutPreference: form.payoutPreference,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      toast.success(editingId ? 'Overtime request updated' : 'Overtime request submitted');
      setShowForm(false);
      setEditingId(null);
      setForm({ date: today, startTime: '', endTime: '', reason: '', payoutPreference: 'payout' });
      void refreshItems();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const r = await fetch(`/api/attendance/overtime-request/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      toast.success(`Request ${status}`);
      void refreshItems();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleEdit = (item: OTRequest) => {
    setViewingItem(null);
    setEditingId(item.id);
    setForm({
      date: item.date.slice(0, 10),
      startTime: localTimeInput(item.startTime),
      endTime: localTimeInput(item.endTime),
      reason: item.reason || '',
      payoutPreference: item.payoutPreference === 'comp_off' ? 'comp_off' : 'payout',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelRequest = async (item: OTRequest) => {
    if (!window.confirm('Cancel this pending overtime request?')) return;
    try {
      const r = await fetch(`/api/attendance/overtime-request/${item.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to cancel');
      toast.success('Overtime request cancelled');
      setViewingItem(null);
      void refreshItems();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to cancel request');
    }
  };

  const fmtDate = (d: string) => {
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FiClock className="w-6 h-6 text-teal-500" />
            Overtime Requests
          </h1>
          <p className="text-sm text-slate-500 mt-1">Pre-OT approval workflow · Convert OT to Comp-Off or payout</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="3boxes-btn-primary flex items-center gap-2">
          <FiPlus className="w-4 h-4" /> Request Overtime
        </button>
      </div>

      <ModuleTips moduleKey="attendance-overtime">
        <p><strong>REQ-OT-02/03:</strong> Pre-approve your overtime BEFORE working it so your late check-out does not trigger an alert. Choose <strong>payout</strong> (paid in next payroll run) or <strong>comp-off</strong> (credited as compensatory leave, expires in 90 days).</p>
      </ModuleTips>

      {showForm && (
        <div className="thb-card p-6 border-l-4 border-l-teal-500">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">New Overtime Request</h2>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Date <span className="text-red-500 font-bold">*</span></label>
              <input type="date" max={today} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="3boxes-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Start Time <span className="text-red-500 font-bold">*</span></label>
              <input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} className="3boxes-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">End Time <span className="text-red-500 font-bold">*</span></label>
              <input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} className="3boxes-input w-full" />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-600 mb-1">Reason <span className="text-red-500 font-bold">*</span></label>
            <input type="text" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="3boxes-input w-full" placeholder="e.g. Production release support" />
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-600 mb-1">Payout Preference <span className="text-red-500 font-bold">*</span></label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${form.payoutPreference === 'payout' ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}`}>
                <input type="radio" checked={form.payoutPreference === 'payout'} onChange={() => setForm({ ...form, payoutPreference: 'payout' })} />
                <div>
                  <p className="text-sm font-medium text-slate-700">Payout</p>
                  <p className="text-xs text-slate-500">Paid in next payroll run</p>
                </div>
              </label>
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${form.payoutPreference === 'comp_off' ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}`}>
                <input type="radio" checked={form.payoutPreference === 'comp_off'} onChange={() => setForm({ ...form, payoutPreference: 'comp_off' })} />
                <div>
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1"><FiGift className="w-3.5 h-3.5" /> Comp-Off</p>
                  <p className="text-xs text-slate-500">Credited as leave, expires in 90 days</p>
                </div>
              </label>
            </div>
          </div>
          {form.startTime && form.endTime && (
            <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-lg">
              <p className={`text-sm font-medium ${computedHours > 0 ? 'text-green-700' : 'text-red-600'}`}>
                OT Duration: {computedHours > 0 ? `${computedHours} hour${computedHours === 1 ? '' : 's'}` : 'End time must be after start time'}
              </p>
            </div>
          )}
          <ApproverChainPreview module="overtime" compact />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="3boxes-btn-secondary">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting} className="3boxes-btn-primary flex items-center gap-2">
              {submitting ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiPlus className="w-4 h-4" />}
              {editingId ? 'Save Changes' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}

      <div className="thb-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {isAdmin && <th className="text-left px-4 py-3 font-semibold text-slate-700">Employee</th>}
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">From</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">To</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Hours</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Reason</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Preference</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-slate-400">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={isAdmin ? 9 : 8} className="text-center py-12 text-slate-500">No overtime requests yet</td></tr>
              ) : items.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  {isAdmin && <td className="px-4 py-3 text-slate-700">{r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : '—'}</td>}
                  <td className="px-4 py-3 text-slate-700">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 text-slate-700">{fmtTime(r.startTime)}</td>
                  <td className="px-4 py-3 text-slate-700">{fmtTime(r.endTime)}</td>
                  <td className="px-4 py-3 text-slate-700">{r.estimatedHours}h</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{r.reason}</td>
                  <td className="px-4 py-3 text-slate-700 capitalize">
                    {r.payoutPreference.replace('_', '-')}
                    {r.compOffCreditedAt && <span className="ml-1 text-[9px] text-emerald-600">✓ credited</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`thb-badge ${
                      r.status === 'approved' ? 'thb-badge-success' :
                      r.status === 'rejected' ? 'thb-badge-error' : 'thb-badge-warning'
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setViewingItem(r)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="View request" aria-label="View request">
                        <FiEye className="w-4 h-4" />
                      </button>
                      {!isAdmin && r.status === 'pending' && (
                        <>
                          <button onClick={() => handleEdit(r)} className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded" title="Edit pending request" aria-label="Edit pending request">
                            <FiEdit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleCancelRequest(r)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded" title="Cancel pending request" aria-label="Cancel pending request">
                            <FiXCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {isAdmin && r.status === 'pending' && (
                        <>
                          <button onClick={() => handleAction(r.id, 'approved')} className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded" title="Approve">
                            <FiCheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleAction(r.id, 'rejected')} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded" title="Reject">
                            <FiXCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="overtime-view-title">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 id="overtime-view-title" className="text-lg font-semibold text-slate-800">Overtime Request</h2>
              <button onClick={() => setViewingItem(null)} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-slate-500">Date</dt><dd className="text-slate-800">{fmtDate(viewingItem.date)}</dd>
              <dt className="text-slate-500">Time</dt><dd className="text-slate-800">{fmtTime(viewingItem.startTime)} – {fmtTime(viewingItem.endTime)}</dd>
              <dt className="text-slate-500">Duration</dt><dd className="text-slate-800">{viewingItem.estimatedHours} hours</dd>
              <dt className="text-slate-500">Preference</dt><dd className="text-slate-800 capitalize">{viewingItem.payoutPreference.replace('_', '-')}</dd>
              <dt className="text-slate-500">Status</dt><dd className="text-slate-800 capitalize">{viewingItem.status}</dd>
              <dt className="text-slate-500">Reason</dt><dd className="text-slate-800 col-span-1 break-words">{viewingItem.reason}</dd>
              {viewingItem.comments && <><dt className="text-slate-500">Approver comments</dt><dd className="text-slate-800 break-words">{viewingItem.comments}</dd></>}
            </dl>
            {!isAdmin && viewingItem.status === 'pending' && (
              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => handleEdit(viewingItem)} className="3boxes-btn-secondary">Edit</button>
                <button onClick={() => handleCancelRequest(viewingItem)} className="3boxes-btn-secondary text-red-600">Cancel Request</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
