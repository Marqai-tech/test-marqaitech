'use client';

/**
 * BgvPanel — HR-side BGV section inside the preboarding candidate workspace
 * (mock screens 07, 16, 15).
 *
 * Three states driven by the candidate's BGV case:
 *  1. No active case  → "Initiate Background Verification" form: vendor
 *     select, required checks, explicit document selection (approved only),
 *     due date, instructions + confirmation note that the case goes to the
 *     vendor admin's unassigned queue. Gate: required documents approved.
 *     Unmet requirements are shown explicitly; an existing case replaces the
 *     action with "View BGV Case".
 *  2. Active case (before submission) → progress-only view: status, vendor,
 *     investigator, due date, progress bar + "Report available after vendor
 *     submission. Draft findings are private to the vendor."
 *  3. Submitted → report review: exact submitted standard form (snapshot),
 *     check results + evidence, Download Standard PDF, optional vendor PDF,
 *     version history, and the final decision buttons (Approve / Request
 *     Rework / Reject with mandatory reason).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  FiShield, FiRefreshCw, FiLoader, FiAlertCircle, FiCheckCircle, FiXCircle,
  FiCornerUpLeft, FiInfo, FiDownload, FiEye, FiClock, FiFileText, FiChevronDown,
} from 'react-icons/fi';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const HR_ROLES_OK = true;

const STANDARD_CHECKS = [
  { type: 'identity', label: 'Identity Verification (Aadhaar/PAN)' },
  { type: 'address', label: 'Address Verification' },
  { type: 'education', label: 'Education Verification' },
  { type: 'employment', label: 'Previous Employment Verification' },
  { type: 'criminal', label: 'Criminal Record Check' },
  { type: 'reference', label: 'Reference Check' },
];

const CASE_STATUS_META: Record<string, { label: string; chip: string }> = {
  awaiting_assignment: { label: 'Awaiting Assignment', chip: 'bg-amber-100 text-amber-800' },
  assigned: { label: 'Assigned', chip: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'In Progress', chip: 'bg-blue-100 text-blue-800' },
  submitted_for_hr_review: { label: 'Submitted for HR Review', chip: 'bg-violet-100 text-violet-800' },
  awaiting_information: { label: 'Awaiting Information', chip: 'bg-amber-100 text-amber-800' },
  rework_required: { label: 'Rework Required', chip: 'bg-orange-100 text-orange-800' },
  approved_by_hr: { label: 'Approved by HR', chip: 'bg-emerald-100 text-emerald-800' },
  rejected_by_hr: { label: 'Rejected by HR', chip: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelled', chip: 'bg-slate-100 text-slate-600' },
};

const RESULT_META: Record<string, { chip: string; icon: ReactNode }> = {
  Clear: { chip: 'bg-emerald-100 text-emerald-700', icon: <FiCheckCircle className="w-3 h-3" /> },
  'Discrepancy Found': { chip: 'bg-red-100 text-red-700', icon: <FiXCircle className="w-3 h-3" /> },
  'Unable to Verify': { chip: 'bg-slate-200 text-slate-700', icon: <FiInfo className="w-3 h-3" /> },
};

interface CaseSummary {
  id: string; caseNumber?: string; status: string; vendorName?: string;
  assigneeName?: string; assigneeEmail?: string; dueDate?: string;
  createdAt?: string; updatedAt?: string; version?: number;
  checkStates?: { id: string; status: string }[];
  reportCount?: number;
}

interface SharedDoc { id: string; documentType: string | null; documentLabel: string | null }

export interface BgvPanelDoc {
  id: string;
  documentLabel: string | null;
  documentType: string | null;
  status: string;
}

interface ReportView {
  id: string; version: number; summary?: string; overallResult?: string;
  submittedAt?: string; investigatorName?: string; investigatorEmail?: string;
  pdfStatus?: string; pdfError?: string; hasStandardPdf?: boolean; hasVendorPdf?: boolean;
  vendorPdfName?: string; hrDecision?: string | null; hrDecisionAt?: string; hrDecisionReason?: string;
  checks: Array<{
    checkId: string; checkLabel: string; checkType: string; result: string | null;
    findings: string | null; verificationDate: string | null;
    evidenceIds: string[]; evidenceFiles: { id: string; fileName: string }[];
  }>;
}

interface CaseDetail {
  request: CaseSummary & { instructions?: string; reworkReason?: string | null; reworkDueDate?: string | null; initiatedByName?: string; candidateName?: string; candidateEmail?: string };
  checks: { id: string; checkType: string; checkLabel: string; status: string }[];
  progress: { total: number; pending: number; inProgress: number; completed: number };
  progressPercent: number;
  reports: ReportView[];
  sharedDocuments: SharedDoc[];
  hasSubmittedReport: boolean;
}

interface Vendor { id: string; name: string; status?: string }

export default function BgvPanel({
  candidateId,
  candidateName,
  candidateEmail,
  documents,
  bgvStatus,
  onCaseChanged,
}: {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  documents: BgvPanelDoc[];
  /** Candidate-level BGV outcome from earlier cycles (cleared / failed / …). */
  bgvStatus?: string | null;
  onCaseChanged?: () => void;
}) {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);

  // initiate form state
  const [vendorId, setVendorId] = useState('');
  const [selChecks, setSelChecks] = useState<string[]>(STANDARD_CHECKS.slice(0, 3).map((c) => c.type));
  const [selDocs, setSelDocs] = useState<string[] | null>(null); // null = auto (all approved)
  const [dueDate, setDueDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [initiating, setInitiating] = useState(false);

  // review state
  const [decision, setDecision] = useState<'approve' | 'rework' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [reworkDue, setReworkDue] = useState('');
  const [reworkCheckIds, setReworkCheckIds] = useState<string[]>([]);
  const [deciding, setDeciding] = useState(false);

  const approvedDocs = useMemo(() => documents.filter((d) => d.status === 'approved'), [documents]);
  const activeCase = cases.find((c) => !['approved_by_hr', 'rejected_by_hr', 'cancelled'].includes(c.status));
  // A terminal BGV outcome (cleared/failed) from an earlier cycle blocks a new
  // case — the server enforces this; show a notice instead of the form.
  const bgvSettled = ['cleared', 'failed'].includes(String(bgvStatus || '').toLowerCase());
  const latestTerminalCase = cases.length > 0 ? cases[0] : null;
  const latestSubmitted = detail?.reports?.length ? detail.reports[detail.reports.length - 1] : null;

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bgv/requests?preboardingCandidateId=${encodeURIComponent(candidateId)}`, { headers: getAuthHeaders() });
      const d = await res.json().catch(() => ({}));
      setCases(res.ok ? (d.requests || []) : []);
    } catch { setCases([]); }
    finally { setLoading(false); }
  }, [candidateId]);

  const loadDetail = useCallback(async (caseId: string) => {
    try {
      const res = await fetch(`/api/bgv/requests/${caseId}`, { headers: getAuthHeaders() });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setDetail(d);
      else setDetail(null);
    } catch { setDetail(null); }
  }, []);

  const loadVendors = useCallback(async () => {
    setVendorsLoading(true);
    try {
      const res = await fetch('/api/vendors', { headers: getAuthHeaders() });
      const d = await res.json().catch(() => ({}));
      setVendors((d.vendors || []).filter((v: Vendor) => !v.status || v.status === 'active'));
    } catch { setVendors([]); }
    finally { setVendorsLoading(false); }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadCases();
      void loadVendors();
    });
  }, [loadCases, loadVendors]);

  useEffect(() => {
    queueMicrotask(() => {
      if (activeCase?.id) void loadDetail(activeCase.id);
      else setDetail(null);
    });
  }, [activeCase?.id, loadDetail]);

  // Pre-select all approved documents (mock 07) — derived, not an effect.
  const selectedDocIds = selDocs ?? approvedDocs.map((d) => d.id);

  const unmet: string[] = [];
  if (approvedDocs.length === 0) unmet.push('No approved documents yet — approve the required documents first.');
  if (selChecks.length === 0 && !confirmOpen) unmet.push(''); // shown inline
  const allApprovedGate = approvedDocs.length > 0 && approvedDocs.length === documents.filter((d) => d.status !== 'pending').length;

  const initiate = async () => {
    if (!vendorId) { toast.error('Select the vendor company'); return; }
    if (selChecks.length === 0) { toast.error('Select at least one verification check'); return; }
    if (selectedDocIds.length === 0) { toast.error('Select at least one approved document to share'); return; }
    setInitiating(true);
    try {
      const res = await fetch('/api/bgv/initiate', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          preboardingCandidateId: candidateId,
          vendorCompanyId: vendorId,
          checks: selChecks.map((t) => ({ type: t, label: STANDARD_CHECKS.find((s) => s.type === t)?.label || t })),
          documents: selectedDocIds,
          dueDate: dueDate || undefined,
          instructions: instructions || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Failed to initiate BGV');
      toast.success(d.message || 'BGV case created — vendor admin notified.');
      setConfirmOpen(false);
      setDecision(null); setReason('');
      await loadCases();
      onCaseChanged?.();
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : 'Failed to initiate BGV');
    } finally { setInitiating(false); }
  };

  const decide = async (kind: 'approve' | 'reject' | 'rework') => {
    if (!activeCase) return;
    if (kind !== 'approve' && !reason.trim()) {
      toast.error(kind === 'reject' ? 'A rejection reason is mandatory.' : 'A rework reason is mandatory.');
      return;
    }
    if (!confirm(kind === 'approve' ? 'Approve BGV for this candidate? This is the final decision.' : kind === 'reject' ? 'Reject BGV for this candidate? This is the final decision.' : 'Send the case back to the vendor for rework?')) return;
    setDeciding(true);
    try {
      const url = `/api/bgv/requests/${activeCase.id}/${kind}`;
      const res = await fetch(url, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify(
          kind === 'approve'
            ? { reason: reason || undefined }
            : kind === 'reject'
              ? { reason }
              : { action: 'rework_required', reason, checkIds: reworkCheckIds, dueDate: reworkDue || undefined },
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Decision failed');
      toast.success(d.message || 'Decision recorded.');
      setDecision(null); setReason(''); setReworkCheckIds([]);
      await loadCases();
      await loadDetail(activeCase.id);
      onCaseChanged?.();
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : 'Decision failed');
    } finally { setDeciding(false); }
  };

  const downloadPdf = async (version: number) => {
    try {
      const res = await fetch(`/api/bgv/requests/${activeCase?.id}/report-pdf?version=${version}`, { headers: getAuthHeaders() });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'PDF download failed'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Marqaitech-Standard-BGV-Report-v${version}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) { toast.error(e instanceof Error ? e.message : 'PDF download failed'); }
  };

  const viewEvidence = async (evidenceId: string) => {
    try {
      const res = await fetch(`/api/bgv/evidence/${evidenceId}/file`, { headers: getAuthHeaders() });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Evidence unavailable'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e: any) { toast.error(e instanceof Error ? e.message : 'Evidence unavailable'); }
  };

  /* ─────────────── render ─────────────── */
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" data-testid="bgv-panel">
      <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/60">
        <h2 className="text-sm font-semibold text-slate-800 inline-flex items-center gap-2">
          <FiShield className="text-teal-600" /> Background Verification (BGV)
        </h2>
        <button onClick={() => { loadCases(); if (activeCase?.id) loadDetail(activeCase.id); }} className="text-teal-700 hover:text-teal-800 text-xs font-medium inline-flex items-center gap-1">
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="space-y-2" aria-label="Loading BGV status">
            {[0, 1].map((i) => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : activeCase ? (
          /* ── CASE EXISTS ── */
          detail ? (
            <div className="space-y-4">
              {/* status header (screen 16) */}
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${CASE_STATUS_META[detail.request.status]?.chip || 'bg-slate-100 text-slate-700'}`}>
                  {CASE_STATUS_META[detail.request.status]?.label || detail.request.status}
                </span>
                {detail.request.caseNumber && <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{detail.request.caseNumber}</span>}
                <span className="text-xs text-slate-500">Vendor: <b className="text-slate-700">{detail.request.vendorName || '—'}</b></span>
                <span className="text-xs text-slate-500">Investigator: <b className="text-slate-700">{detail.request.assigneeName || 'Not assigned yet'}</b></span>
                {detail.request.dueDate && <span className="text-xs text-slate-500 inline-flex items-center gap-1"><FiClock /> Due {new Date(detail.request.dueDate).toLocaleDateString('en-GB')}</span>}
              </div>

              {detail.request.instructions && <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Instructions to vendor: {detail.request.instructions}</p>}
              {detail.request.reworkReason && (
                <div className="border border-orange-200 bg-orange-50 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-orange-700">Rework in progress — HR reason sent to vendor</p>
                  <p className="text-sm text-orange-800 mt-0.5">{detail.request.reworkReason}</p>
                  {detail.request.reworkDueDate && <p className="text-[11px] text-orange-500 mt-0.5">Correct by {new Date(detail.request.reworkDueDate).toLocaleDateString('en-GB')}</p>}
                </div>
              )}

              {/* progress bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-500">Progress</span>
                  <span className="text-slate-700 font-medium">{detail.progress.completed} of {detail.progress.total} checks completed · {detail.progressPercent}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${detail.progressPercent}%` }} />
                </div>
              </div>

              {!detail.hasSubmittedReport ? (
                <div className="border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600 flex items-start gap-2">
                  <FiInfo className="mt-0.5 text-slate-400 shrink-0" />
                  <span><b>Report available after vendor submission.</b> Draft findings are private to the vendor — HR sees progress only until the investigator submits.</span>
                </div>
              ) : null}

              {/* submitted report review (screen 15) */}
              {latestSubmitted ? (
                <div className="space-y-4">
                  <div className="bg-white border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50/60 border-b flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <p className="font-semibold text-slate-800">Submitted Report — {candidateName} <span className="text-slate-400 font-normal">(v{latestSubmitted.version})</span></p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Vendor {detail.request.vendorName} · Investigator {latestSubmitted.investigatorName || '—'}
                          {latestSubmitted.submittedAt ? ` · submitted ${new Date(latestSubmitted.submittedAt).toLocaleString('en-GB')}` : ''}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${latestSubmitted.hrDecision === 'approved' ? 'bg-emerald-100 text-emerald-700' : latestSubmitted.hrDecision === 'rejected' ? 'bg-red-100 text-red-700' : latestSubmitted.hrDecision === 'rework_required' ? 'bg-orange-100 text-orange-700' : 'bg-violet-100 text-violet-700'}`}>
                        {latestSubmitted.hrDecision || 'Awaiting decision'}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                          <th className="text-left px-4 py-2.5 font-medium">Check</th>
                          <th className="text-left px-4 py-2.5 font-medium">Result</th>
                          <th className="text-left px-4 py-2.5 font-medium">Findings (summary)</th>
                          <th className="text-left px-4 py-2.5 font-medium">Evidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {latestSubmitted.checks.map((c, i) => (
                          <tr key={c.checkId}>
                            <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                            <td className="px-4 py-3 font-medium text-slate-700">{c.checkLabel || c.checkType}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_META[c.result || '']?.chip || 'bg-amber-100 text-amber-700'}`}>
                                {RESULT_META[c.result || '']?.icon}{c.result || 'Pending'}
                              </span>
                              {c.verificationDate && <p className="text-[10px] text-slate-400 mt-0.5">{new Date(c.verificationDate).toLocaleDateString('en-GB')}</p>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 max-w-[260px]">{c.findings || '—'}</td>
                            <td className="px-4 py-3">
                              {c.evidenceFiles?.length ? (
                                <div className="flex flex-col gap-1">
                                  {c.evidenceFiles.map((e) => (
                                    <button key={e.id} onClick={() => viewEvidence(e.id)} className="text-xs text-teal-700 hover:underline inline-flex items-center gap-1 text-left">
                                      <FiEye className="w-3 h-3" /> {e.fileName}
                                    </button>
                                  ))}
                                </div>
                              ) : <span className="text-xs text-slate-400">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-4 py-3 border-t bg-slate-50/60">
                      <p className="text-xs text-slate-500"><b>Overall findings:</b> {latestSubmitted.summary || '—'}</p>
                    </div>
                  </div>

                  {/* PDFs */}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => downloadPdf(latestSubmitted.version)} disabled={latestSubmitted.pdfStatus === 'failed'}
                      className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg disabled:opacity-40">
                      <FiDownload /> Download Standard PDF (v{latestSubmitted.version})
                    </button>
                    {latestSubmitted.pdfStatus === 'failed' && (
                      <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Standard PDF failed ({latestSubmitted.pdfError || 'error'}) — recorded, retry from the report endpoint.</span>
                    )}
                    {latestSubmitted.hasVendorPdf && (
                      <button onClick={async () => {
                        const res = await fetch(`/api/bgv/requests/${activeCase.id}/report-pdf?version=${latestSubmitted.version}&vendor=1`, { headers: getAuthHeaders() });
                        if (res.ok) { const blob = await res.blob(); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 30000); }
                        else toast.error('Vendor PDF unavailable');
                      }} className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg">
                        <FiEye /> View Vendor PDF{latestSubmitted.vendorPdfName ? ` (${latestSubmitted.vendorPdfName})` : ''}
                      </button>
                    )}
                  </div>

                  {/* version history */}
                  {detail.reports.length > 1 && (
                    <div className="text-xs text-slate-500">
                      Version history: {detail.reports.map((r) => `v${r.version} (${new Date(r.submittedAt || '').toLocaleDateString('en-GB')}${r.hrDecision ? `, ${r.hrDecision}` : ''})`).join(' → ')}
                    </div>
                  )}

                  {/* decision block (screen 12) */}
                  {['approved_by_hr', 'rejected_by_hr', 'cancelled'].includes(detail.request.status) ? (
                    <div className="border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600 flex items-center gap-2">
                      <FiCheckCircle className={detail.request.status === 'approved_by_hr' ? 'text-emerald-600' : 'text-slate-400'} />
                      Final decision recorded: <b>{CASE_STATUS_META[detail.request.status]?.label}</b>. The case is closed.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                      <p className="text-sm font-semibold text-slate-800">Final Decision</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button onClick={() => setDecision(decision === 'approve' ? null : 'approve')}
                          className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                            decision === 'approve' ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
                          <FiCheckCircle className="w-4 h-4" /> Approve BGV
                        </button>
                        <button onClick={() => setDecision(decision === 'rework' ? null : 'rework')}
                          className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                            decision === 'rework' ? 'bg-amber-500 border-amber-500 text-white' : 'border-amber-300 text-amber-600 hover:bg-amber-50'}`}>
                          <FiCornerUpLeft className="w-4 h-4" /> Request Rework
                        </button>
                        <button onClick={() => setDecision(decision === 'reject' ? null : 'reject')}
                          className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                            decision === 'reject' ? 'bg-red-600 border-red-600 text-white' : 'border-red-300 text-red-600 hover:bg-red-50'}`}>
                          <FiXCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>

                      {decision && decision !== 'approve' && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                          <div>
                            <label className="text-xs font-medium text-slate-600 mb-1 block">Reason * {decision === 'reject' ? '(mandatory)' : '(mandatory — sent to the investigator)'}</label>
                            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                              placeholder={decision === 'reject' ? 'State the reason for rejection' : 'Explain exactly what must be corrected…'}
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
                          </div>
                          {decision === 'rework' && (
                            <>
                              <div>
                                <p className="text-xs font-medium text-slate-600 mb-1.5">Checks to correct (default: all)</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto border rounded-md p-2">
                                  {detail.reports[detail.reports.length - 1]?.checks.map((c) => (
                                    <label key={c.checkId} className="flex items-center gap-2 text-xs cursor-pointer">
                                      <input type="checkbox" className="accent-teal-600"
                                        checked={reworkCheckIds.includes(c.checkId)}
                                        onChange={() => setReworkCheckIds((p) => (p.includes(c.checkId) ? p.filter((x) => x !== c.checkId) : [...p, c.checkId]))} />
                                      {c.checkLabel || c.checkType}
                                    </label>
                                  ))}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">Leave all unchecked to ask the vendor to re-verify everything.</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Correct by (optional)</label>
                                <input type="date" value={reworkDue} onChange={(e) => setReworkDue(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white" />
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {decision && (
                        <button onClick={() => decide(decision)} disabled={deciding}
                          className={`w-full inline-flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2.5 rounded-lg text-white disabled:opacity-60 ${
                            decision === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : decision === 'rework' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700'}`}>
                          {deciding ? 'Recording…' : decision === 'approve' ? 'Confirm Approval' : decision === 'rework' ? 'Send rework request' : 'Confirm Rejection'}
                        </button>
                      )}
                      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <FiInfo className="w-3 h-3 shrink-0" /> A vendor Clear result never auto-approves BGV — only HR decides. Employment/joining state is untouched by vendor actions.
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-600 py-3">
              <FiLoader className="animate-spin text-teal-600" /> Loading case {activeCase.caseNumber || ''}…
            </div>
          )
        ) : bgvSettled ? (
          /* ── BGV already settled in an earlier cycle — server rejects re-initiation ── */
          <div className={`border rounded-lg px-3.5 py-3 text-sm flex items-start gap-2 ${String(bgvStatus).toLowerCase() === 'failed' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {String(bgvStatus).toLowerCase() === 'failed' ? <FiXCircle className="mt-0.5 shrink-0" /> : <FiCheckCircle className="mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium">Background verification is already {String(bgvStatus).toLowerCase() === 'failed' ? 'marked failed' : 'cleared'} for this candidate.</p>
              <p className="text-xs mt-0.5 opacity-80">A new BGV case can only be opened after HR explicitly resets the candidate&apos;s BGV status in the candidate record. {latestTerminalCase ? `Most recent case: ${latestTerminalCase.caseNumber || latestTerminalCase.id}.` : ''}</p>
            </div>
          </div>
        ) : (
          /* ── NO CASE → initiation form (screen 07) ── */
          <div className="space-y-4">
            {!allApprovedGate && unmet.length > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded-lg px-3.5 py-3 text-sm text-amber-800 flex items-start gap-2">
                <FiAlertCircle className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">BGV initiation requirements not met yet:</p>
                  <ul className="list-disc ml-4 mt-1 text-xs space-y-0.5">
                    {unmet.filter(Boolean).map((u, i) => <li key={i}>{u}</li>)}
                  </ul>
                  <p className="text-[11px] text-amber-600 mt-1">Documents pending: {documents.filter((d) => d.status !== 'approved' && d.status !== 'pending').length} in review · {approvedDocs.length}/{documents.filter((d) => d.status !== 'pending').length} approved</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Vendor *</label>
                  {vendorsLoading ? (
                    <div className="text-xs text-slate-400 flex items-center gap-2 py-2"><FiLoader className="animate-spin" /> Loading vendors…</div>
                  ) : vendors.length === 0 ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2.5">No active vendors. Add one under Vendor Management first.</p>
                  ) : (
                    <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white">
                      <option value="">Select vendor…</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Checks to include *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 border border-slate-200 rounded-lg p-2.5 max-h-40 overflow-y-auto">
                    {STANDARD_CHECKS.map((c) => (
                      <label key={c.type} className="flex items-center gap-2 text-xs cursor-pointer text-slate-700">
                        <input type="checkbox" className="accent-teal-600" checked={selChecks.includes(c.type)}
                          onChange={() => setSelChecks((p) => (p.includes(c.type) ? p.filter((x) => x !== c.type) : [...p, c.type]))} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Due date</label>
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Instructions</label>
                    <input type="text" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Complete within 7 days" className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white" />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Documents shared with vendor * (approved only)</label>
                  <div className="border border-slate-200 rounded-lg p-2.5 max-h-40 overflow-y-auto space-y-1.5">
                    {approvedDocs.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2 text-center">No approved documents yet.</p>
                    ) : approvedDocs.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer text-slate-700">
                        <input type="checkbox" className="accent-teal-600" checked={selectedDocIds.includes(d.id)}
                          onChange={() => setSelDocs((p) => {
                            const cur = p ?? approvedDocs.map((x) => x.id);
                            return cur.includes(d.id) ? cur.filter((x) => x !== d.id) : [...cur, d.id];
                          })} />
                        <FiFileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{d.documentLabel || d.documentType}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-800 flex items-start gap-2">
                  <FiInfo className="mt-0.5 shrink-0" />
                  <span>The request goes to the selected vendor company&apos;s <b>admin</b> unassigned queue — they assign one of their active employees. HR never picks the investigator.</span>
                </div>
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!vendorId || selChecks.length === 0 || selectedDocIds.length === 0}
                  className="w-full inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg disabled:opacity-40">
                  <FiShield /> Initiate BGV
                </button>
              </div>
            </div>

            {/* confirm dialog */}
            {confirmOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !initiating && setConfirmOpen(false)}>
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                  <div className="px-4 py-3.5 border-b"><h3 className="font-semibold text-slate-800">Confirm BGV initiation</h3></div>
                  <div className="p-4 space-y-2 text-sm text-slate-700">
                    <p><b>Candidate:</b> {candidateName} ({candidateEmail})</p>
                    <p><b>Vendor:</b> {vendors.find((v) => v.id === vendorId)?.name || '—'}</p>
                    <p><b>Checks:</b> {selChecks.map((t) => STANDARD_CHECKS.find((s) => s.type === t)?.label || t).join(', ')}</p>
                    <p><b>Documents:</b> {selectedDocIds.length} approved file(s)</p>
                    <p><b>Due:</b> {dueDate || '—'}{instructions ? ` · ${instructions}` : ''}</p>
                    <p className="text-xs text-slate-500 bg-slate-50 border rounded-lg px-3 py-2 mt-2">After confirmation the case appears as <b>Awaiting Assignment</b> in the vendor admin&apos;s dashboard and they are notified by email.</p>
                  </div>
                  <div className="px-4 py-3 border-t flex justify-end gap-2">
                    <button onClick={() => setConfirmOpen(false)} disabled={initiating} className="px-3.5 py-2 text-sm border rounded-lg hover:bg-slate-50">Cancel</button>
                    <button onClick={initiate} disabled={initiating} className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2">
                      {initiating ? <FiLoader className="animate-spin" /> : <FiShield />} Confirm & Send
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
