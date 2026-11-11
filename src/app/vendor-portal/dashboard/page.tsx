'use client';

/**
 * Vendor Admin Dashboard — vendor-portal/dashboard
 *
 * Vendor admin sees requests assigned to their vendor company.
 * Can assign unassigned requests to vendor employees.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  FiShield, FiRefreshCw, FiLoader, FiAlertCircle, FiUserPlus, FiClock,
  FiCheckCircle, FiFileText, FiUsers,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface BgvRequest {
  id: string;
  candidateEmail: string;
  candidateName?: string;
  status: string;
  vendorName?: string;
  createdAt: string;
  assignedVendorUserId?: string;
  checks?: Array<{ id: string; checkType: string; checkLabel?: string; status: string; result?: string }>;
}

interface VendorStaff {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  awaiting_assignment: 'Awaiting Assignment',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  awaiting_information: 'Awaiting Info',
  submitted_for_hr_review: 'Submitted for Review',
  rework_required: 'Rework Required',
  approved_by_hr: 'Approved',
  rejected_by_hr: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  awaiting_assignment: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-blue-100 text-blue-800',
  awaiting_information: 'bg-amber-100 text-amber-800',
  submitted_for_hr_review: 'bg-violet-100 text-violet-800',
  rework_required: 'bg-orange-100 text-orange-800',
  approved_by_hr: 'bg-emerald-100 text-emerald-800',
  rejected_by_hr: 'bg-red-100 text-red-800',
};

export default function VendorDashboardPage() {
  const [requests, setRequests] = useState<BgvRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendorInfo, setVendorInfo] = useState<{ vendorCompanyId: string; role: string } | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [staff, setStaff] = useState<VendorStaff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor/requests', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setRequests(data.requests || []);
      setVendorInfo({ vendorCompanyId: data.vendorCompanyId, role: data.role });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Load vendor staff list (for the assignment dropdown) once we know the vendor company
  useEffect(() => {
    if (!vendorInfo?.vendorCompanyId) return;
    fetch(`/api/vendors/${vendorInfo.vendorCompanyId}/users`, { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : { users: [] }))
      .then(d => setStaff(d.users || []))
      .catch(() => setStaff([]));
  }, [vendorInfo?.vendorCompanyId]);

  const activeStaff = staff.filter(s => s.status === 'active' && s.role === 'vendor_employee');

  const handleAssign = async (reqId: string) => {
    const vendorUserId = selectedStaffId[reqId];
    if (!vendorUserId) { toast.error('Select a team member to assign'); return; }
    setAssigningId(reqId);
    try {
      const res = await fetch(`/api/vendor/requests/${reqId}/assign`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ vendorUserId, reason: 'Initial assignment' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || 'Assigned');
      fetchRequests();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setAssigningId(null); }
  };

  const unassigned = requests.filter(r => r.status === 'awaiting_assignment');
  const assigned = requests.filter(r => r.status === 'assigned' || r.status === 'in_progress');
  const submitted = requests.filter(r => r.status === 'submitted_for_hr_review');
  const completed = requests.filter(r => r.status === 'approved_by_hr' || r.status === 'rejected_by_hr');

  if (loading) return (<div className="min-h-screen flex items-center justify-center"><FiLoader className="h-8 w-8 animate-spin text-slate-600" /></div>);
  if (error) return (<div className="min-h-screen p-6"><div className="max-w-3xl mx-auto bg-white rounded-xl p-8 text-center"><FiAlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" /><h2 className="text-xl font-bold">Access Denied</h2><p className="text-slate-600 mt-2">{error}</p></div></div>);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold flex items-center gap-3"><FiShield className="h-6 w-6" /> Vendor Dashboard</h1>
          <p className="text-slate-300 mt-1">Role: {vendorInfo?.role === 'vendor_admin' ? 'Vendor Admin' : 'Vendor Employee'}</p>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <div className="flex justify-end">
          <button onClick={fetchRequests} disabled={loading} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-white flex items-center gap-2"><FiRefreshCw className="h-4 w-4" /> Refresh</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Unassigned" value={unassigned.length} color="text-amber-600" icon={<FiClock className="h-5 w-5" />} />
          <StatCard label="In Progress" value={assigned.length} color="text-blue-600" icon={<FiUsers className="h-5 w-5" />} />
          <StatCard label="Submitted" value={submitted.length} color="text-violet-600" icon={<FiFileText className="h-5 w-5" />} />
          <StatCard label="Completed" value={completed.length} color="text-emerald-600" icon={<FiCheckCircle className="h-5 w-5" />} />
        </div>

        {/* Unassigned */}
        {unassigned.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-3">Awaiting Assignment ({unassigned.length})</h2>
            <div className="space-y-2">
              {unassigned.map(req => (
                <div key={req.id} className="bg-white border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{req.candidateName || req.candidateEmail}</div>
                      <div className="text-xs text-slate-500">{req.candidateEmail} · {new Date(req.createdAt).toLocaleDateString('en-IN')}</div>
                    </div>
                    {vendorInfo?.role === 'vendor_admin' && activeStaff.length > 0 && (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedStaffId[req.id] || ''}
                          onChange={(e) => setSelectedStaffId(prev => ({ ...prev, [req.id]: e.target.value }))}
                          className="text-xs border rounded-md px-2 py-1.5 bg-white max-w-[220px]"
                        >
                          <option value="">Assign to team member…</option>
                          {activeStaff.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                          ))}
                        </select>
                        <button onClick={() => handleAssign(req.id)} disabled={assigningId === req.id || !selectedStaffId[req.id]} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                          {assigningId === req.id ? <FiLoader className="h-3.5 w-3.5 animate-spin" /> : <FiUserPlus className="h-3.5 w-3.5" />} Assign
                        </button>
                      </div>
                    )}
                  </div>
                  {vendorInfo?.role === 'vendor_admin' && activeStaff.length === 0 && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2">
                      No active vendor employees yet. Add team members from the Vendors page (or ask HR to invite them).
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All requests */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-3">All Requests ({requests.length})</h2>
          <div className="space-y-2">
            {requests.map(req => (
              <div key={req.id} className="bg-white border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium flex items-center gap-2">{req.candidateName || req.candidateEmail}<span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[req.status] || 'bg-slate-100'}`}>{STATUS_LABELS[req.status] || req.status}</span></div>
                    <div className="text-xs text-slate-500 mt-0.5">{req.candidateEmail} · {new Date(req.createdAt).toLocaleDateString('en-IN')}</div>
                  </div>
                  {req.status === 'assigned' || req.status === 'in_progress' ? <a href={`/vendor-portal/requests/${req.id}`} className="text-xs text-blue-600 hover:underline">Open →</a> : null}
                </div>
                {req.checks && req.checks.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {req.checks.map(c => <span key={c.id} className="text-[10px] px-2 py-0.5 rounded border bg-slate-50">{c.checkLabel || c.checkType}: {c.status}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {requests.length === 0 && <div className="text-center py-12"><FiShield className="h-10 w-10 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No BGV requests assigned to your vendor company yet.</p></div>}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (<div className="bg-white border rounded-lg p-3"><div className="flex items-center gap-2">{icon}<div><div className={`text-xl font-bold ${color}`}>{value}</div><div className="text-[10px] text-slate-500 uppercase">{label}</div></div></div></div>);
}
