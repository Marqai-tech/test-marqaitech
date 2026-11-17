'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiClipboard, FiRefreshCw, FiLoader, FiChevronDown, FiCheckCircle, FiXCircle, FiClock,
  FiFileText, FiAlertCircle, FiUser, FiShield, FiCalendar,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface CheckRow { id: string; checkType: string; checkLabel?: string; status: string; result?: string | null; findings?: string | null; completedAt?: string | null }
interface ReportRow { id: string; version: number; submittedById: string; submittedAt?: string; summary?: string | null; overallResult?: string | null; status: string; hrDecision?: string | null; hrDecisionReason?: string | null }
interface RequestRow {
  id: string; candidateEmail: string; candidateName?: string | null; vendorCompanyId: string;
  vendorName?: string | null; status: string; dueDate?: string | null; instructions?: string | null;
  assignedVendorUserId?: string | null; createdAt: string; updatedAt?: string;
  checks?: CheckRow[]; reports?: ReportRow[];
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
const CHECK_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600', in_progress: 'bg-blue-100 text-blue-800', completed: 'bg-emerald-100 text-emerald-800',
};

export default function VendorManagementRequestsPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bgv/requests', { headers: getAuthHeaders() });
      const data = res.ok ? await res.json() : { requests: [] };
      setRequests(data.requests || []);
    } catch { toast.error('Failed to load BGV requests'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchRequests()); }, [fetchRequests]);

  const vendors = Array.from(new Set(requests.map(r => r.vendorName).filter(Boolean))) as string[];
  const filtered = requests.filter(r =>
    (statusFilter === 'all' || r.status === statusFilter) &&
    (vendorFilter === 'all' || r.vendorName === vendorFilter)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary">BGV Requests</h1>
          <p className="text-thb-text-secondary mt-1">All background-verification requests across vendors — live tracking of checks and reports</p>
        </div>
        <button onClick={fetchRequests} className="inline-flex items-center gap-2 px-3 py-2.5 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50">
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-wrap">
          {['all', 'awaiting_assignment', 'assigned', 'in_progress', 'submitted_for_hr_review', 'approved_by_hr', 'rejected_by_hr'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-green-600 text-white' : 'bg-slate-100 text-thb-text-secondary hover:bg-slate-200'}`}>
              {s === 'all' ? `All (${requests.length})` : REQ_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {vendors.length > 0 && (
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-thb-border text-thb-text-secondary sm:ml-auto sm:self-start">
            <option value="all">All vendors</option>
            {vendors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
      </div>

      {/* Requests */}
      {loading ? (
        <div className="thb-card overflow-hidden"><div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}</div></div>
      ) : filtered.length === 0 ? (
        <div className="thb-card p-12 text-center">
          <FiClipboard className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
          <p className="text-thb-text-secondary">{requests.length === 0 ? 'No BGV requests yet. Initiate one from Onboarding Review → Initiate BGV with Vendor.' : 'No requests match the selected filters.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const isExpanded = expandedId === r.id;
            const checks = r.checks || [];
            const done = checks.filter(c => c.status === 'completed').length;
            const latestReport = (r.reports || [])[0];
            return (
              <div key={r.id} className="thb-card overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : r.id)} className="w-full text-left p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shrink-0"><FiUser className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-thb-text-primary">{r.candidateName || r.candidateEmail}</span>
                        <span className="text-xs text-thb-text-muted truncate">{r.candidateEmail}</span>
                      </div>
                      <div className="text-xs text-thb-text-secondary flex items-center gap-3 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1"><FiShield className="w-3 h-3" />{r.vendorName || 'Unknown vendor'}</span>
                        <span className="inline-flex items-center gap-1"><FiCalendar className="w-3 h-3" />{new Date(r.createdAt).toLocaleDateString()}</span>
                        {r.dueDate && <span className="inline-flex items-center gap-1 text-amber-700">Due {new Date(r.dueDate).toLocaleDateString()}</span>}
                        <span>{done}/{checks.length} checks done</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${REQ_STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-600'}`}>{REQ_STATUS_LABELS[r.status] || r.status}</span>
                      <FiChevronDown className={`w-4 h-4 text-thb-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  {/* checks progress bar */}
                  <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all" style={{ width: checks.length ? `${Math.round((done / checks.length) * 100)}%` : '0%' }} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-thb-border bg-slate-50/50 p-4 sm:p-5 space-y-4">
                    {r.instructions && (
                      <div className="bg-white rounded-xl border border-thb-border p-3 text-sm text-thb-text-secondary"><b className="text-thb-text-primary">HR instructions:</b> {r.instructions}</div>
                    )}

                    {/* Checks */}
                    <div>
                      <h4 className="text-sm font-semibold text-thb-text-primary mb-2 flex items-center gap-2"><FiCheckCircle className="w-4 h-4 text-green-600" /> Verification Checks</h4>
                      {checks.length === 0 ? (
                        <div className="bg-white rounded-xl border border-thb-border p-4 text-sm text-thb-text-secondary">No checks recorded for this request.</div>
                      ) : (
                        <div className="bg-white rounded-xl border border-thb-border overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-thb-border">
                              <tr>{['Check', 'Status', 'Result', 'Findings', 'Completed'].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {checks.map(c => (
                                <tr key={c.id}>
                                  <td className="px-4 py-2.5 font-medium text-thb-text-primary capitalize">{c.checkLabel || c.checkType.replace(/_/g, ' ')}</td>
                                  <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHECK_STATUS_COLORS[c.status] || 'bg-slate-100 text-slate-600'}`}>{c.status.replace(/_/g, ' ')}</span></td>
                                  <td className="px-4 py-2.5">
                                    {c.result ? (
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.result === 'Clear' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{c.result}</span>
                                    ) : <span className="text-thb-text-muted">—</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-thb-text-secondary max-w-xs truncate" title={c.findings || ''}>{c.findings || '—'}</td>
                                  <td className="px-4 py-2.5 text-xs text-thb-text-secondary">{c.completedAt ? new Date(c.completedAt).toLocaleDateString() : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Reports */}
                    <div>
                      <h4 className="text-sm font-semibold text-thb-text-primary mb-2 flex items-center gap-2"><FiFileText className="w-4 h-4 text-green-600" /> Vendor Reports</h4>
                      {(r.reports || []).length === 0 ? (
                        <div className="bg-white rounded-xl border border-thb-border p-4 text-sm text-thb-text-secondary">No reports submitted yet.</div>
                      ) : (
                        <div className="space-y-2">
                          {(r.reports || []).map(rep => (
                            <div key={rep.id} className="bg-white rounded-xl border border-thb-border p-4">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-thb-text-primary">Report v{rep.version}</span>
                                {rep.overallResult && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rep.overallResult === 'Clear' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{rep.overallResult}</span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rep.hrDecision === 'approved' ? 'bg-emerald-100 text-emerald-700' : rep.hrDecision === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {rep.hrDecision ? `HR ${rep.hrDecision}` : rep.status}
                                </span>
                                {rep.submittedAt && <span className="text-xs text-thb-text-muted ml-auto">{new Date(rep.submittedAt).toLocaleString()}</span>}
                              </div>
                              {rep.summary && <p className="text-sm text-thb-text-secondary">{rep.summary}</p>}
                              {rep.hrDecisionReason && <p className="text-xs text-amber-700 mt-1"><b>HR note:</b> {rep.hrDecisionReason}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-thb-text-muted">
        Showing {filtered.length} of {requests.length} BGV requests. HR decisions (approve/reject) are made on the BGV Dashboard in the Onboarding module.
      </p>
    </div>
  );
}
