'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FiCheckCircle, FiXCircle, FiClock, FiPlus, FiRefreshCw, FiShield,
  FiGitMerge, FiMail, FiUserCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  module: string;
  requestedBy: string;
  status: string; // pending_approval | approved | rejected | implemented
  approvedBy: string | null;
  approvalMethod: string | null; // email_link | in_app
  approvedAt: string | null;
  rejectedReason: string | null;
  implementedAt: string | null;
  deployCommit: string | null;
  createdAt: string;
}

interface Counts {
  pending: number; approved: number; rejected: number; implemented: number;
}

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const statusBadge: Record<string, string> = {
  pending_approval: 'thb-badge thb-badge-warning',
  approved: 'thb-badge thb-badge-success',
  rejected: 'thb-badge thb-badge-error',
  implemented: 'thb-badge thb-badge-info',
};
const statusLabel: Record<string, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  implemented: 'Implemented',
};

export default function ChangeApprovalsPage() {
  const searchParams = useSearchParams();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0, implemented: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', module: 'super-admin', description: '' });
  // Email-link mode: ?token=<approval token> in the URL (arriving from the
  // approval email) shows a decision panel at the top of the page. Derived
  // from the URL directly — dismissal is tracked separately.
  const emailTokenParam = searchParams.get('token');
  const [tokenDismissed, setTokenDismissed] = useState(false);
  const emailToken = emailTokenParam && !tokenDismissed ? emailTokenParam : null;

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetch(`/api/super-admin/change-requests${qs}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
        setCounts(data.counts || { pending: 0, approved: 0, rejected: 0, implemented: 0 });
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || `Failed to load change requests (HTTP ${res.status})`);
      }
    } catch {
      toast.error('Failed to load change requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    queueMicrotask(() => fetchRequests());
  }, [fetchRequests]);

  const submitRequest = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Title and description are required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/super-admin/change-requests', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok || res.status === 201) {
        toast.success(`Change request submitted — approval email ${data.emailSent ? 'sent' : 'queued'} to ${data.approvalEmailTo}`);
        setShowForm(false);
        setForm({ title: '', module: 'super-admin', description: '' });
        fetchRequests();
      } else {
        toast.error(data.error || `Failed (HTTP ${res.status})`);
      }
    } catch {
      toast.error('Failed to submit change request');
    } finally {
      setSubmitting(false);
    }
  };

  const decideInApp = async (id: string, action: 'approve' | 'reject') => {
    let reason = '';
    if (action === 'reject') {
      reason = window.prompt('Rejection reason (required):') || '';
      if (!reason.trim()) return;
    } else if (!window.confirm('Approve this change? Once approved, the requested super-admin update may be implemented and deployed.')) return;
    setDeciding(id);
    try {
      const res = await fetch(`/api/super-admin/change-requests/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Change request ${action === 'approve' ? 'approved' : 'rejected'}`);
        fetchRequests();
      } else {
        toast.error(data.error || `Failed (HTTP ${res.status})`);
      }
    } catch {
      toast.error('Failed to record decision');
    } finally {
      setDeciding(null);
    }
  };

  const decideByEmailToken = async (action: 'approve' | 'reject') => {
    if (!emailToken) return;
    let reason = '';
    if (action === 'reject') {
      reason = window.prompt('Rejection reason (required):') || '';
      if (!reason.trim()) return;
    } else if (!window.confirm('Approve via the emailed link?')) return;
    try {
      const res = await fetch('/api/super-admin/change-requests/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: emailToken, action, reason }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Decision recorded: ${action.toUpperCase()}`);
        setTokenDismissed(true);
        fetchRequests();
      } else {
        toast.error(data.error || `Failed (HTTP ${res.status})`);
      }
    } catch {
      toast.error('Failed to record decision');
    }
  };

  const markImplemented = async (cr: ChangeRequest) => {
    const commit = window.prompt('Deploy commit hash (optional):') || '';
    try {
      const res = await fetch(`/api/super-admin/change-requests/${cr.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'implement', deployCommit: commit }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Marked as implemented');
        fetchRequests();
      } else {
        toast.error(data.error || `Failed (HTTP ${res.status})`);
      }
    } catch {
      toast.error('Failed to update request');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiShield className="text-amber-600" /> Change Approvals
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Governance for the super admin platform — every code or configuration update to a super-admin
            surface requires an approval from <b>mahesh@marqaitech.com</b> (via the emailed link) or from the
            super admin in-app <b>before it is deployed</b>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchRequests} className="thb-btn thb-btn-secondary flex items-center gap-2">
            <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setShowForm((s) => !s)} className="thb-btn thb-btn-primary flex items-center gap-2">
            <FiPlus /> New Change Request
          </button>
        </div>
      </div>

      {/* Email token decision panel */}
      {emailToken && (
        <div className="thb-card border-l-4 border-l-blue-600 p-4">
          <div className="flex items-start gap-3">
            <FiMail className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900">Approval email link detected</h3>
              <p className="text-sm text-slate-500">
                Record the approval or rejection for the change request referenced by this emailed link.
                The decision is attributed to the designated approver (mahesh@marqaitech.com).
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => decideByEmailToken('approve')} className="thb-btn thb-btn-primary flex items-center gap-2">
                  <FiUserCheck /> Approve via Email Link
                </button>
                <button onClick={() => decideByEmailToken('reject')} className="thb-btn thb-btn-danger flex items-center gap-2">
                  <FiXCircle /> Reject via Email Link
                </button>
                <button onClick={() => setTokenDismissed(true)} className="thb-btn thb-btn-secondary">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="thb-card p-4 flex items-center gap-3">
          <FiClock className="w-8 h-8 text-amber-500" />
          <div><div className="text-2xl font-bold">{counts.pending}</div><div className="text-xs text-slate-500">Pending Approval</div></div>
        </div>
        <div className="thb-card p-4 flex items-center gap-3">
          <FiCheckCircle className="w-8 h-8 text-emerald-600" />
          <div><div className="text-2xl font-bold">{counts.approved}</div><div className="text-xs text-slate-500">Approved</div></div>
        </div>
        <div className="thb-card p-4 flex items-center gap-3">
          <FiGitMerge className="w-8 h-8 text-sky-600" />
          <div><div className="text-2xl font-bold">{counts.implemented}</div><div className="text-xs text-slate-500">Implemented</div></div>
        </div>
        <div className="thb-card p-4 flex items-center gap-3">
          <FiXCircle className="w-8 h-8 text-rose-600" />
          <div><div className="text-2xl font-bold">{counts.rejected}</div><div className="text-xs text-slate-500">Rejected</div></div>
        </div>
      </div>

      {/* New request form */}
      {showForm && (
        <div className="thb-card p-6 space-y-4">
          <h3 className="font-semibold text-slate-900">Raise a new super-admin change request</h3>
          <p className="text-sm text-slate-500">
            Describe the change you intend to make to a super-admin surface (dashboard, tenant management,
            subscriptions, RBAC, governance pages…). The designated approver is emailed a decision link;
            the change may only be deployed after approval.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Title *</label>
              <input
                className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Add E2E encryption option to tenant management"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Module / surface</label>
              <input
                className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                value={form.module}
                onChange={(e) => setForm({ ...form, module: e.target.value })}
                placeholder="super-admin"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Description *</label>
            <textarea
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What changes, why it is needed, impact/risk, rollback plan…"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={submitRequest} disabled={submitting} className="thb-btn thb-btn-primary flex items-center gap-2 disabled:opacity-60">
              <FiMail /> Submit for Approval
            </button>
            <button onClick={() => setShowForm(false)} className="thb-btn thb-btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {['', 'pending_approval', 'approved', 'implemented', 'rejected'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm border ${statusFilter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            {s ? statusLabel[s] || s : 'All'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-4">
        {loading ? (
          <div className="thb-card p-8 text-center text-slate-400">Loading change requests…</div>
        ) : requests.length === 0 ? (
          <div className="thb-card p-8 text-center text-slate-400">
            No change requests {statusFilter ? `with status ${statusLabel[statusFilter] || statusFilter}` : 'yet'}.
          </div>
        ) : (
          requests.map((cr) => (
            <div key={cr.id} className="thb-card p-5">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-900">{cr.title}</h3>
                    <span className={statusBadge[cr.status] || 'thb-badge'}>{statusLabel[cr.status] || cr.status}</span>
                    <span className="thb-badge thb-badge-secondary">{cr.module}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{cr.description}</p>
                  <div className="text-xs text-slate-400 mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Requested by {cr.requestedBy} · {new Date(cr.createdAt).toLocaleString()}</span>
                    {cr.approvedBy && <span>Decided by {cr.approvedBy} ({cr.approvalMethod === 'email_link' ? 'email link' : 'in-app'}){cr.approvedAt ? ` · ${new Date(cr.approvedAt).toLocaleString()}` : ''}</span>}
                    {cr.rejectedReason && <span className="text-rose-600">Reason: {cr.rejectedReason}</span>}
                    {cr.deployCommit && <span>Commit: {cr.deployCommit}</span>}
                    {cr.implementedAt && <span>Implemented: {new Date(cr.implementedAt).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {cr.status === 'pending_approval' && (
                    <>
                      <button onClick={() => decideInApp(cr.id, 'approve')} disabled={deciding === cr.id} className="thb-btn thb-btn-primary flex items-center gap-2 disabled:opacity-60">
                        <FiCheckCircle /> Approve
                      </button>
                      <button onClick={() => decideInApp(cr.id, 'reject')} disabled={deciding === cr.id} className="thb-btn thb-btn-danger flex items-center gap-2 disabled:opacity-60">
                        <FiXCircle /> Reject
                      </button>
                    </>
                  )}
                  {cr.status === 'approved' && (
                    <button onClick={() => markImplemented(cr)} className="thb-btn thb-btn-secondary flex items-center gap-2">
                      <FiGitMerge /> Mark Implemented
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
