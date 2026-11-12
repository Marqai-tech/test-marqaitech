'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiShield, FiUsers, FiClipboard, FiRefreshCw, FiLoader, FiPlus,
  FiCheckCircle, FiClock, FiXCircle, FiFileText, FiChevronRight, FiSend, FiAlertCircle,
} from 'react-icons/fi';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface VendorUserRow { id: string; email: string; name: string; role: string; status: string; activated: boolean }
interface VendorRow { id: string; name: string; status: string; email?: string | null }
interface CheckRow { id: string; checkType: string; checkLabel?: string; status: string; result?: string | null }
interface RequestRow {
  id: string; candidateEmail: string; candidateName?: string | null; vendorCompanyId: string;
  vendorName?: string | null; status: string; dueDate?: string | null; createdAt: string;
  checks?: CheckRow[];
  reports?: Array<{ id: string; version: number; overallResult?: string | null; status: string; summary?: string | null }>;
}

const REQ_STATUS_LABELS: Record<string, string> = {
  awaiting_assignment: 'Awaiting Assignment', assigned: 'Assigned', in_progress: 'In Progress',
  awaiting_information: 'Awaiting Info', submitted_for_hr_review: 'Submitted for Review',
  rework_required: 'Rework Required', approved_by_hr: 'Approved', rejected_by_hr: 'Rejected', cancelled: 'Cancelled',
};
const REQ_STATUS_COLORS: Record<string, string> = {
  awaiting_assignment: 'bg-amber-100 text-amber-800', assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-blue-100 text-blue-800', awaiting_information: 'bg-amber-100 text-amber-800',
  submitted_for_hr_review: 'bg-violet-100 text-violet-800', rework_required: 'bg-orange-100 text-orange-800',
  approved_by_hr: 'bg-emerald-100 text-emerald-800', rejected_by_hr: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-100 text-slate-600',
};

export default function VendorManagementDashboardPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, VendorUserRow[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, rRes] = await Promise.all([
        fetch('/api/vendors', { headers: getAuthHeaders() }),
        fetch('/api/bgv/requests', { headers: getAuthHeaders() }),
      ]);
      const vData = vRes.ok ? await vRes.json() : { vendors: [] };
      const rData = rRes.ok ? await rRes.json() : { requests: [] };
      const vendorList: VendorRow[] = vData.vendors || [];
      const reqList: RequestRow[] = rData.requests || [];
      setVendors(vendorList);
      setRequests(reqList);
      // Load user lists per active vendor (for pending-invite + user counts)
      const counts: Record<string, VendorUserRow[]> = {};
      await Promise.all(vendorList.map(async v => {
        try {
          const res = await fetch(`/api/vendors/${v.id}/users`, { headers: getAuthHeaders() });
          const d = res.ok ? await res.json() : { users: [] };
          counts[v.id] = d.users || [];
        } catch { counts[v.id] = []; }
      }));
      setUserCounts(counts);
    } catch {
      toast.error('Failed to load vendor management data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchAll()); }, [fetchAll]);

  const activeVendors = vendors.filter(v => v.status === 'active');
  const totalUsers = Object.values(userCounts).reduce((a, u) => a + u.length, 0);
  const pendingInvites = Object.values(userCounts).reduce((a, u) => a + u.filter(x => x.status === 'pending').length, 0);
  const openRequests = requests.filter(r => !['approved_by_hr', 'rejected_by_hr', 'cancelled'].includes(r.status));
  const byStatus = (s: string) => requests.filter(r => r.status === s).length;

  const metrics = [
    { label: 'Active Vendors', value: activeVendors.length, icon: <FiShield className="w-5 h-5" />, color: 'from-teal-500 to-emerald-600', hint: `${vendors.length} total` },
    { label: 'Vendor Users', value: totalUsers, icon: <FiUsers className="w-5 h-5" />, color: 'from-blue-500 to-indigo-500', hint: `${pendingInvites} pending invite` },
    { label: 'Open BGV Requests', value: openRequests.length, icon: <FiClipboard className="w-5 h-5" />, color: 'from-amber-500 to-orange-500', hint: `${byStatus('awaiting_assignment')} awaiting assignment` },
    { label: 'Approved by HR', value: byStatus('approved_by_hr'), icon: <FiCheckCircle className="w-5 h-5" />, color: 'from-emerald-500 to-green-600', hint: `${byStatus('rejected_by_hr')} rejected` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary">Vendor Management</h1>
          <p className="text-thb-text-secondary mt-1">Background-verification vendors, portal users and BGV request tracking</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={fetchAll} className="inline-flex items-center gap-2 px-3 py-2.5 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => router.push('/vendor-management/vendors')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm">
            <FiPlus className="w-4 h-4" /> Manage Vendors
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(m => (
          <div key={m.label} className="thb-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wider">{m.label}</p>
                <p className="text-3xl font-bold text-thb-text-primary mt-1">{loading ? '…' : m.value}</p>
                <p className="text-xs text-thb-text-secondary mt-1">{m.hint}</p>
              </div>
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.color} text-white flex items-center justify-center shrink-0`}>{m.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Status pipeline */}
      <div className="thb-card p-5">
        <h2 className="text-sm font-semibold text-thb-text-primary mb-4 flex items-center gap-2"><FiClipboard className="w-4 h-4 text-green-600" /> BGV Request Pipeline</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {['awaiting_assignment', 'assigned', 'in_progress', 'submitted_for_hr_review', 'approved_by_hr', 'rejected_by_hr'].map(s => (
            <button key={s} onClick={() => router.push('/vendor-management/requests')} className="text-left p-3 rounded-xl border border-thb-border hover:border-green-400 hover:bg-green-50/50 transition-colors">
              <p className="text-2xl font-bold text-thb-text-primary">{byStatus(s)}</p>
              <p className="text-xs text-thb-text-secondary mt-0.5 leading-tight">{REQ_STATUS_LABELS[s]}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vendors summary */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2"><FiShield className="w-4 h-4 text-green-600" /> Vendors</h2>
            <button onClick={() => router.push('/vendor-management/vendors')} className="text-xs font-medium text-green-600 hover:text-green-700 inline-flex items-center gap-1">Manage <FiChevronRight className="w-3 h-3" /></button>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
          ) : vendors.length === 0 ? (
            <div className="p-8 text-center text-sm text-thb-text-secondary">
              <FiAlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
              No BGV vendors yet. Add a vendor company and its portal users to enable the vendor BGV flow.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {vendors.slice(0, 8).map(v => {
                const users = userCounts[v.id] || [];
                const open = requests.filter(r => r.vendorCompanyId === v.id && !['approved_by_hr', 'rejected_by_hr', 'cancelled'].includes(r.status)).length;
                return (
                  <button key={v.id} onClick={() => router.push('/vendor-management/vendors')} className="w-full text-left px-5 py-3 hover:bg-slate-50 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">{v.name[0]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-thb-text-primary truncate">{v.name}</div>
                      <div className="text-xs text-thb-text-muted">{users.length} user{users.length === 1 ? '' : 's'}{open > 0 ? ` · ${open} open request${open > 1 ? 's' : ''}` : ''}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${v.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{v.status}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent requests */}
        <div className="thb-card overflow-hidden">
          <div className="px-5 py-4 border-b border-thb-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-thb-text-primary flex items-center gap-2"><FiFileText className="w-4 h-4 text-green-600" /> Recent BGV Requests</h2>
            <button onClick={() => router.push('/vendor-management/requests')} className="text-xs font-medium text-green-600 hover:text-green-700 inline-flex items-center gap-1">View all <FiChevronRight className="w-3 h-3" /></button>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center text-sm text-thb-text-secondary">No BGV requests yet. Initiate from Onboarding Review → Initiate BGV with Vendor.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {requests.slice(0, 8).map(r => {
                const done = (r.checks || []).filter(c => c.status === 'completed').length;
                return (
                  <div key={r.id} className="px-5 py-3 hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-thb-text-primary truncate">{r.candidateName || r.candidateEmail}</div>
                        <div className="text-xs text-thb-text-muted truncate">{r.vendorName || '—'} · {done}/{r.checks?.length || 0} checks · {new Date(r.createdAt).toLocaleDateString()}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${REQ_STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-600'}`}>{REQ_STATUS_LABELS[r.status] || r.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* How-to card */}
      <div className="thb-card p-5">
        <h2 className="text-sm font-semibold text-thb-text-primary mb-3">How the vendor BGV flow works</h2>
        <ol className="text-sm text-thb-text-secondary space-y-2 list-decimal list-inside">
          <li>Add a <b>vendor company</b> and at least one <b>vendor admin / employee user</b> under <b>BGV Vendors</b> (users log in at /login → Vendor tab).</li>
          <li>From <b>Onboarding Review</b>, open a converted candidate → <b>Initiate BGV with Vendor</b> → select vendor + checks + documents to share.</li>
          <li>The vendor sees the request in their <b>Vendor Portal</b> (vendor admin assigns it to an employee).</li>
          <li>The vendor employee runs each check (Mark Clear / Discrepancy) and submits the report to HR.</li>
          <li>HR reviews the report on the <b>BGV Dashboard</b> → Approve/Reject. Approval assigns the final employee ID and activates the account.</li>
        </ol>
      </div>
    </div>
  );
}
