'use client';

/**
 * HR Onboarding Review page.
 *
 * HR sees all candidates in the onboarding pipeline, can:
 * - Review uploaded documents (approve/reject)
 * - Update BGV status (pending → in_progress → approved/failed)
 * - Mark as Joined (provisional employee)
 * - Initiate BGV with vendor
 */
import { useEffect, useState, useCallback } from 'react';
import {
  FiCheckCircle, FiXCircle, FiClock, FiShield, FiUserPlus, FiLoader,
  FiRefreshCw, FiAlertCircle, FiFileText, FiEye, FiUpload, FiCalendar,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Candidate {
  id: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle?: string;
  onboardingStatus: string;
  backgroundCheckStatus: string;
  companyEmail?: string;
  ctc?: number;
  joiningDate?: string;
  documents: Array<{
    id: string;
    documentType: string;
    documentLabel: string;
    status: string;
    reviewNotes?: string;
    uploadedAt?: string;
    fileName?: string;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  bgv_pending: 'BGV Pending',
  provisional_employee: 'Provisional Employee',
  active_employee: 'Active Employee',
  bgv_failed: 'BGV Failed',
  pending: 'Pending',
};

const STATUS_COLORS: Record<string, string> = {
  bgv_pending: 'bg-amber-100 text-amber-800',
  provisional_employee: 'bg-blue-100 text-blue-800',
  active_employee: 'bg-emerald-100 text-emerald-800',
  bgv_failed: 'bg-red-100 text-red-800',
};

const DOC_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

export default function OnboardingReviewPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/progress', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      setCandidates(Array.isArray(data) ? data : (data.candidates || data.data || []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const handleDocReview = async (docId: string, action: 'approve' | 'reject') => {
    const notes = action === 'reject' ? prompt('Reason for rejection (required):') : '';
    if (action === 'reject' && !notes?.trim()) { toast.error('Reason required for rejection'); return; }
    setActionLoading(docId);
    try {
      const res = await fetch(`/api/onboarding/documents/${docId}/review`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ action, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(`Document ${action === 'approve' ? 'approved' : 'rejected'}`);
      fetchCandidates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally { setActionLoading(null); }
  };

  const handleBGV = async (candidateId: string, bgvStatus: string) => {
    setActionLoading(`${candidateId}-bgv`);
    try {
      const res = await fetch('/api/onboarding/bgv', {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ preboardingCandidateId: candidateId, bgvStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || `BGV: ${bgvStatus}`);
      fetchCandidates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally { setActionLoading(null); }
  };

  const handleMarkJoined = async (candidateId: string) => {
    setActionLoading(`${candidateId}-join`);
    try {
      const res = await fetch('/api/onboarding/mark-joined', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ preboardingCandidateId: candidateId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || 'Marked as Joined');
      fetchCandidates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally { setActionLoading(null); }
  };

  if (loading) return (<div className="flex items-center justify-center py-12 text-muted-foreground"><FiLoader className="h-5 w-5 animate-spin mr-2" /> Loading onboarding candidates…</div>);
  if (error) return (<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-2"><FiAlertCircle className="h-5 w-5 shrink-0 mt-0.5" /><div>{error}</div></div>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><FiUserPlus className="h-6 w-6 text-emerald-600" /> Onboarding Review</h1>
          <p className="text-sm text-muted-foreground mt-1">Review candidate documents, update BGV status, and manage onboarding pipeline.</p>
        </div>
        <button onClick={fetchCandidates} disabled={loading} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-accent flex items-center gap-2"><FiRefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      {candidates.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <FiUserPlus className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium">No candidates in onboarding pipeline</h3>
          <p className="text-sm text-muted-foreground mt-1">Convert a candidate to start the onboarding process.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => {
            const isExpanded = expandedId === c.id;
            const approvedDocs = c.documents?.filter(d => d.status === 'approved').length || 0;
            const submittedDocs = c.documents?.filter(d => d.status === 'submitted').length || 0;
            const totalDocs = c.documents?.length || 0;
            return (
              <div key={c.id} className="border rounded-lg overflow-hidden">
                {/* Header row */}
                <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold shrink-0">
                    {(c.candidateName || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {c.candidateName}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.onboardingStatus] || 'bg-slate-100 text-slate-700'}`}>{STATUS_LABELS[c.onboardingStatus] || c.onboardingStatus}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.backgroundCheckStatus === 'cleared' ? 'bg-emerald-100 text-emerald-700' : c.backgroundCheckStatus === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>BGV: {c.backgroundCheckStatus}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.candidateEmail} · {c.companyEmail || 'No company email'} · {c.jobTitle || 'No position'}</div>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 shrink-0">
                    <span>{approvedDocs}/{totalDocs} approved</span>
                    {submittedDocs > 0 && <span className="text-blue-600">{submittedDocs} pending review</span>}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t bg-muted/10 p-4 space-y-4">
                    {/* Documents */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1"><FiFileText className="h-3.5 w-3.5" /> Documents</h4>
                      <div className="space-y-2">
                        {c.documents?.map(doc => (
                          <div key={doc.id} className="flex items-center gap-3 p-2 border rounded-md bg-background">
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${doc.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : doc.status === 'rejected' ? 'bg-red-100 text-red-600' : doc.status === 'submitted' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                              <FiFileText className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{doc.documentLabel}</div>
                              <div className="text-xs text-muted-foreground">
                                {doc.fileName && <span>{doc.fileName}</span>}
                                {doc.uploadedAt && <span> · {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}</span>}
                              </div>
                              {doc.reviewNotes && <div className="text-xs text-red-600 mt-0.5">Note: {doc.reviewNotes}</div>}
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${DOC_STATUS_COLORS[doc.status] || DOC_STATUS_COLORS.pending}`}>{doc.status}</span>
                            {doc.status === 'submitted' && (
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => handleDocReview(doc.id, 'approve')} disabled={actionLoading === doc.id} className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50" title="Approve"><FiCheckCircle className="h-4 w-4" /></button>
                                <button onClick={() => handleDocReview(doc.id, 'reject')} disabled={actionLoading === doc.id} className="p-1.5 rounded-md text-red-500 hover:bg-red-50" title="Reject"><FiXCircle className="h-4 w-4" /></button>
                              </div>
                            )}
                          </div>
                        ))}
                        {(!c.documents || c.documents.length === 0) && <div className="text-sm text-muted-foreground text-center py-2">No documents</div>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {c.onboardingStatus === 'bgv_pending' && (
                        <>
                          <button onClick={() => handleBGV(c.id, 'in_progress')} disabled={actionLoading === `${c.id}-bgv`} className="px-3 py-1.5 text-xs border rounded-md hover:bg-accent flex items-center gap-1.5"><FiClock className="h-3.5 w-3.5" /> Start BGV</button>
                          <button onClick={() => handleMarkJoined(c.id)} disabled={actionLoading === `${c.id}-join`} className="px-3 py-1.5 text-xs border rounded-md hover:bg-accent flex items-center gap-1.5"><FiCalendar className="h-3.5 w-3.5" /> Mark as Joined</button>
                        </>
                      )}
                      {c.backgroundCheckStatus !== 'cleared' && c.backgroundCheckStatus !== 'failed' && c.onboardingStatus !== 'active_employee' && (
                        <>
                          <button onClick={() => handleBGV(c.id, 'approved')} disabled={actionLoading === `${c.id}-bgv`} className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700 flex items-center gap-1.5"><FiCheckCircle className="h-3.5 w-3.5" /> Approve BGV</button>
                          <button onClick={() => handleBGV(c.id, 'failed')} disabled={actionLoading === `${c.id}-bgv`} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-1.5"><FiXCircle className="h-3.5 w-3.5" /> Fail BGV</button>
                        </>
                      )}
                      {c.backgroundCheckStatus === 'in_progress' && (
                        <span className="text-xs text-blue-600 flex items-center gap-1 px-2 py-1.5"><FiLoader className="h-3.5 w-3.5 animate-spin" /> BGV in progress…</span>
                      )}
                      {c.onboardingStatus === 'active_employee' && (
                        <span className="text-xs text-emerald-600 flex items-center gap-1 px-2 py-1.5"><FiCheckCircle className="h-3.5 w-3.5" /> Employee activated</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
