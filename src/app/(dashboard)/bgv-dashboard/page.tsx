'use client';

import { useEffect, useState, useCallback } from 'react';
import { FiShield, FiRefreshCw, FiLoader, FiAlertCircle, FiCheckCircle, FiXCircle, FiClock, FiFileText } from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface BgvRequest {
  id: string;
  candidateEmail: string;
  candidateName?: string;
  vendorCompanyId: string;
  vendorName?: string;
  status: string;
  dueDate?: string;
  instructions?: string;
  createdAt: string;
  checks?: Array<{ id: string; checkType: string; checkLabel?: string; status: string; result?: string; findings?: string }>;
  reports?: Array<{ id: string; version: number; summary?: string; overallResult?: string; status: string; hrDecision?: string }>;
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
  cancelled: 'bg-slate-100 text-slate-600',
};

export default function BgvDashboardPage() {
  const [requests, setRequests] = useState<BgvRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bgv/requests', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleApprove = async (reqId: string) => {
    setActionLoading(`${reqId}-approve`);
    try {
      const res = await fetch(`/api/bgv/requests/${reqId}/approve`, { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || 'BGV Approved!');
      fetchRequests();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (reqId: string) => {
    const reason = prompt('Reason for rejection (required):');
    if (!reason?.trim()) { toast.error('Reason required'); return; }
    setActionLoading(`${reqId}-reject`);
    try {
      const res = await fetch(`/api/bgv/requests/${reqId}/reject`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ reason }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || 'BGV Rejected');
      fetchRequests();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setActionLoading(null); }
  };

  if (loading) return (<div className="flex items-center justify-center py-12 text-muted-foreground"><FiLoader className="h-5 w-5 animate-spin mr-2" /> Loading BGV requests…</div>);
  if (error) return (<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2"><FiAlertCircle className="h-5 w-5 shrink-0 mt-0.5" /><div>{error}</div></div>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><FiShield className="h-6 w-6 text-emerald-600" /> BGV Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Track all Background Verification requests and make final decisions.</p>
        </div>
        <button onClick={fetchRequests} disabled={loading} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-accent flex items-center gap-2"><FiRefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <FiShield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">No BGV requests</h3>
          <p className="text-sm text-muted-foreground mt-1">Initiate BGV from a candidate&apos;s onboarding profile.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold shrink-0"><FiShield className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {req.candidateName || req.candidateEmail}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[req.status] || 'bg-slate-100 text-slate-700'}`}>{STATUS_LABELS[req.status] || req.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{req.candidateEmail} · Vendor: {req.vendorName || req.vendorCompanyId} · {new Date(req.createdAt).toLocaleDateString('en-IN')}</div>
                  </div>
                </div>
                {req.status === 'submitted_for_hr_review' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleApprove(req.id)} disabled={actionLoading === `${req.id}-approve`} className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700 flex items-center gap-1.5"><FiCheckCircle className="h-3.5 w-3.5" /> Approve</button>
                    <button onClick={() => handleReject(req.id)} disabled={actionLoading === `${req.id}-reject`} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-1.5"><FiXCircle className="h-3.5 w-3.5" /> Reject</button>
                  </div>
                )}
                {req.status === 'approved_by_hr' && <span className="text-xs text-emerald-600 flex items-center gap-1 px-2 py-1.5"><FiCheckCircle className="h-3.5 w-3.5" /> Approved</span>}
                {req.status === 'rejected_by_hr' && <span className="text-xs text-red-600 flex items-center gap-1 px-2 py-1.5"><FiXCircle className="h-3.5 w-3.5" /> Rejected</span>}
              </div>

              {/* Checks */}
              {req.checks && req.checks.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Verification Checks</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {req.checks.map(check => (
                      <div key={check.id} className="text-xs border rounded p-2">
                        <div className="font-medium">{check.checkLabel || check.checkType}</div>
                        <div className="text-muted-foreground mt-0.5">Status: {check.status}</div>
                        {check.result && <div className={`mt-0.5 font-medium ${check.result === 'Clear' ? 'text-emerald-600' : check.result === 'Discrepancy Found' ? 'text-red-600' : 'text-amber-600'}`}>{check.result}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Latest report */}
              {req.reports && req.reports.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Latest Report (v{req.reports[0].version})</div>
                  <div className="text-sm bg-muted/30 p-3 rounded">
                    {req.reports[0].summary || 'No summary provided'}
                    {req.reports[0].overallResult && <div className="mt-1 text-xs"><strong>Overall:</strong> {req.reports[0].overallResult}</div>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
