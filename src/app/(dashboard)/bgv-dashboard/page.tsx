'use client';

/**
 * HR BGV Cases dashboard — /bgv-dashboard
 *
 * Lists every BGV case with case number, vendor, investigator, due date,
 * progress (check states only — draft findings are private to the vendor)
 * and an inline review panel (GET /api/bgv/requests/[id]) that shows the
 * submitted report snapshots with evidence, standard PDF download, vendor
 * PDF, and the final decision buttons (Approve / Request Rework / Reject).
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FiShield, FiRefreshCw, FiLoader, FiAlertCircle, FiCheckCircle, FiXCircle,
  FiInfo, FiDownload, FiEye, FiClock, FiSearch, FiChevronDown, FiChevronRight,
  FiCornerUpLeft, FiFileText,
} from 'react-icons/fi';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

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

const RESULT_META: Record<string, { chip: string }> = {
  Clear: { chip: 'bg-emerald-100 text-emerald-700' },
  'Discrepancy Found': { chip: 'bg-red-100 text-red-700' },
  'Unable to Verify': { chip: 'bg-slate-200 text-slate-700' },
};

interface CaseRow {
  id: string; caseNumber?: string; status: string; candidateName?: string; candidateEmail: string;
  vendorName?: string; assigneeName?: string; dueDate?: string; createdAt?: string;
  checkStates?: { id: string; status: string }[]; reportCount?: number;
}

interface ReportView {
  id: string; version: number; summary?: string; overallResult?: string; submittedAt?: string;
  investigatorName?: string; pdfStatus?: string; pdfError?: string; hasStandardPdf?: boolean;
  hasVendorPdf?: boolean; hrDecision?: string | null; hrDecisionAt?: string; hrDecisionReason?: string;
  checks: Array<{ checkId: string; checkLabel: string; result: string | null; findings: string | null; verificationDate: string | null; evidenceFiles: { id: string; fileName: string }[] }>;
}

interface CaseDetail {
  request: CaseRow & { reworkReason?: string | null; reworkDueDate?: string | null; instructions?: string };
  progress: { total: number; completed: number };
  progressPercent: number;
  reports: ReportView[];
  hasSubmittedReport: boolean;
}

const FILTERS = ['all', 'unassigned', 'in_progress', 'submitted', 'rework', 'closed'] as const;

export default function BgvDashboardPage() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decision, setDecision] = useState<'approve' | 'rework' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [reworkDue, setReworkDue] = useState('');
  const [reworkCheckIds, setReworkCheckIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/bgv/requests', { headers: getAuthHeaders() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      setRows(d.requests || []);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const openCase = useCallback(async (id: string) => {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id); setDetail(null); setDetailLoading(true); setDecision(null); setReason('');
    try {
      const res = await fetch(`/api/bgv/requests/${id}`, { headers: getAuthHeaders() });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setDetail(d); else toast.error(d.error || 'Could not load case');
    } finally { setDetailLoading(false); }
  }, [openId]);

  const decide = async (kind: 'approve' | 'rework' | 'reject') => {
    if (!openId) return;
    if (kind !== 'approve' && !reason.trim()) { toast.error('Reason is mandatory for rework/rejection.'); return; }
    if (!confirm(kind === 'approve' ? 'Approve BGV? Final decision.' : kind === 'reject' ? 'Reject BGV? Final decision.' : 'Send back for rework?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/bgv/requests/${openId}/${kind}`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify(kind === 'approve' ? { reason: reason || undefined } : kind === 'reject' ? { reason } : { action: 'rework_required', reason, checkIds: reworkCheckIds, dueDate: reworkDue || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Decision failed');
      toast.success(d.message || 'Decision recorded.');
      setDecision(null); setReason('');
      await load();
      await openCaseRefresh(openId);
    } catch (e: any) { toast.error(e instanceof Error ? e.message : 'Decision failed'); }
    finally { setBusy(false); }
  };

  const openCaseRefresh = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/bgv/requests/${id}`, { headers: getAuthHeaders() });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setDetail(d);
    } finally { setDetailLoading(false); }
  };

  const downloadPdf = async (caseId: string, version: number) => {
    try {
      const res = await fetch(`/api/bgv/requests/${caseId}/report-pdf?version=${version}`, { headers: getAuthHeaders() });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'PDF failed'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `Marqaitech-Standard-BGV-Report-v${version}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) { toast.error(e instanceof Error ? e.message : 'PDF failed'); }
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

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchQ = !q || r.candidateName?.toLowerCase().includes(q) || r.candidateEmail?.toLowerCase().includes(q) || r.caseNumber?.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
    const matchF =
      filter === 'all' ? true :
      filter === 'unassigned' ? r.status === 'awaiting_assignment' :
      filter === 'in_progress' ? ['assigned', 'in_progress'].includes(r.status) :
      filter === 'submitted' ? ['submitted_for_hr_review', 'awaiting_information'].includes(r.status) :
      filter === 'rework' ? r.status === 'rework_required' :
      ['approved_by_hr', 'rejected_by_hr', 'cancelled'].includes(r.status);
    return matchQ && matchF;
  });

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 inline-flex items-center gap-2"><FiShield className="text-teal-600" /> BGV Cases</h1>
          <p className="text-sm text-slate-500 mt-0.5">Background verification cases initiated by HR — vendor progress, submitted reports and final decisions.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg self-start sm:self-auto">
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition-colors ${
                filter === f ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {f === 'in_progress' ? 'In progress' : f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="relative md:ml-auto md:w-72">
          <FiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search candidate / case ID…"
            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" aria-label="Search BGV cases" />
        </div>
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <FiAlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">{error}</p>
          <button onClick={load} className="mt-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg">Retry</button>
        </div>
      ) : loading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-white border rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <FiShield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">No BGV cases in this view</p>
          <p className="text-xs text-slate-400 mt-1">Initiate BGV from Recruitment → Preboarding → Candidate → Documents.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const total = r.checkStates?.length || 0;
            const done = r.checkStates?.filter((c) => c.status === 'completed').length || 0;
            const pct = total ? Math.round((done / total) * 100) : 0;
            const meta = CASE_STATUS_META[r.status] || { label: r.status, chip: 'bg-slate-100 text-slate-700' };
            const isOpen = openId === r.id;
            return (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button onClick={() => openCase(r.id)} className="w-full text-left px-4 py-3.5 hover:bg-slate-50/60 transition-colors">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${meta.chip}`}>{meta.label}</span>
                    {r.caseNumber && <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{r.caseNumber}</span>}
                    <span className="text-sm font-medium text-slate-800">{r.candidateName || 'Unknown candidate'}</span>
                    <span className="text-xs text-slate-400">{r.candidateEmail}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-400">
                      {isOpen ? 'Hide review' : 'Review'} {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                    <span>Vendor: <b className="text-slate-600">{r.vendorName || '—'}</b></span>
                    <span>Investigator: <b className="text-slate-600">{r.assigneeName || 'Unassigned'}</b></span>
                    {r.dueDate && <span className="inline-flex items-center gap-1"><FiClock /> Due {new Date(r.dueDate).toLocaleDateString('en-GB')}</span>}
                    <span className="inline-flex items-center gap-2">
                      Progress {done}/{total}
                      <span className="inline-block w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden align-middle">
                        <span className="inline-block h-full bg-teal-500 rounded-full align-top" style={{ width: `${pct}%` }} />
                      </span>
                      {pct}%
                    </span>
                    {(r.reportCount || 0) > 0 && <span className="text-violet-600">{r.reportCount} report version{(r.reportCount || 0) > 1 ? 's' : ''}</span>}
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-t border-slate-100 p-4 bg-slate-50/40">
                    {detailLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500 py-3"><FiLoader className="animate-spin text-teal-600" /> Loading case…</div>
                    ) : detail ? (
                      <div className="space-y-4">
                        {detail.request.reworkReason && (
                          <div className="border border-orange-200 bg-orange-50 rounded-lg px-3.5 py-2.5 text-sm">
                            <p className="font-medium text-orange-700">Rework requested</p>
                            <p className="text-orange-800 text-xs mt-0.5">{detail.request.reworkReason}</p>
                          </div>
                        )}

                        {!detail.hasSubmittedReport ? (
                          <div className="border border-slate-200 bg-white rounded-lg px-4 py-3 text-sm text-slate-600 flex items-start gap-2">
                            <FiInfo className="mt-0.5 text-slate-400 shrink-0" />
                            <span><b>Report available after vendor submission.</b> Draft findings are private to the vendor. Current progress: {detail.progress.completed}/{detail.progress.total} checks completed.</span>
                          </div>
                        ) : null}

                        {detail.reports.map((rep) => (
                          <div key={rep.id} className="bg-white border rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b bg-slate-50/60 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-800">Submitted Report v{rep.version}</p>
                                <p className="text-xs text-slate-500">
                                  {rep.investigatorName ? `Investigator: ${rep.investigatorName} · ` : ''}
                                  {rep.submittedAt ? `submitted ${new Date(rep.submittedAt).toLocaleString('en-GB')}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rep.hrDecision === 'approved' ? 'bg-emerald-100 text-emerald-700' : rep.hrDecision === 'rejected' ? 'bg-red-100 text-red-700' : rep.hrDecision === 'rework_required' ? 'bg-orange-100 text-orange-700' : 'bg-violet-100 text-violet-700'}`}>
                                  {rep.hrDecision || 'Awaiting decision'}
                                </span>
                                <button onClick={() => downloadPdf(r.id, rep.version)} disabled={rep.pdfStatus === 'failed'}
                                  className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg disabled:opacity-40">
                                  <FiDownload className="w-3.5 h-3.5" /> Standard PDF
                                </button>
                                {rep.hasVendorPdf && (
                                  <button onClick={async () => {
                                    const res = await fetch(`/api/bgv/requests/${r.id}/report-pdf?version=${rep.version}&vendor=1`, { headers: getAuthHeaders() });
                                    if (res.ok) { const blob = await res.blob(); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 30000); }
                                  }} className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg">
                                    <FiFileText className="w-3.5 h-3.5" /> Vendor PDF
                                  </button>
                                )}
                              </div>
                            </div>
                            {rep.pdfStatus === 'failed' && <p className="text-xs text-red-600 px-4 pt-2">Standard PDF generation failed ({rep.pdfError || 'error'}) — recorded; will regenerate on next download attempt.</p>}
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                <tr>
                                  <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                                  <th className="text-left px-4 py-2.5 font-medium">Check</th>
                                  <th className="text-left px-4 py-2.5 font-medium">Result</th>
                                  <th className="text-left px-4 py-2.5 font-medium">Findings</th>
                                  <th className="text-left px-4 py-2.5 font-medium">Evidence</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {rep.checks.map((c, i) => (
                                  <tr key={c.checkId}>
                                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                                    <td className="px-4 py-3 font-medium text-slate-700">{c.checkLabel}</td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_META[c.result || '']?.chip || 'bg-amber-100 text-amber-700'}`}>{c.result || 'Pending'}</span>
                                      {c.verificationDate && <p className="text-[10px] text-slate-400 mt-0.5">{new Date(c.verificationDate).toLocaleDateString('en-GB')}</p>}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[240px]">{c.findings || '—'}</td>
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
                            <div className="px-4 py-3 border-t bg-slate-50/60 text-xs text-slate-600">
                              <b>Overall findings:</b> {rep.summary || '—'}
                            </div>
                          </div>
                        ))}

                        {detail.request.status !== 'approved_by_hr' && detail.request.status !== 'rejected_by_hr' && detail.hasSubmittedReport && (
                          <div className="bg-white border rounded-xl p-4 space-y-3">
                            <p className="text-sm font-semibold text-slate-800">Final Decision</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <button onClick={() => setDecision('approve')} className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border ${decision === 'approve' ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}><FiCheckCircle className="w-4 h-4" /> Approve BGV</button>
                              <button onClick={() => setDecision('rework')} className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border ${decision === 'rework' ? 'bg-amber-500 border-amber-500 text-white' : 'border-amber-300 text-amber-600 hover:bg-amber-50'}`}><FiCornerUpLeft className="w-4 h-4" /> Request Rework</button>
                              <button onClick={() => setDecision('reject')} className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border ${decision === 'reject' ? 'bg-red-600 border-red-600 text-white' : 'border-red-300 text-red-600 hover:bg-red-50'}`}><FiXCircle className="w-4 h-4" /> Reject</button>
                            </div>
                            {decision && decision !== 'approve' && (
                              <div className="rounded-lg border border-slate-200 p-3.5 space-y-3">
                                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason (mandatory) — sent to the investigator and vendor admin" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                                {decision === 'rework' && (
                                  <div className="flex items-center gap-3">
                                    <label className="text-xs font-medium text-slate-600">Correct by (optional)</label>
                                    <input type="date" value={reworkDue} onChange={(e) => setReworkDue(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" />
                                  </div>
                                )}
                              </div>
                            )}
                            {decision && (
                              <button onClick={() => decide(decision)} disabled={busy}
                                className={`w-full inline-flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2.5 rounded-lg text-white disabled:opacity-60 ${decision === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : decision === 'rework' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700'}`}>
                                {busy ? 'Recording…' : 'Confirm decision'}
                              </button>
                            )}
                            <p className="text-[11px] text-slate-400">A vendor Clear result never auto-approves BGV — only HR decides. Approval triggers the existing employee-activation flow once.</p>
                          </div>
                        )}

                        {['approved_by_hr', 'rejected_by_hr'].includes(detail.request.status) && (
                          <div className="border border-slate-200 bg-white rounded-lg px-4 py-3 text-sm text-slate-600 flex items-center gap-2">
                            <FiCheckCircle className={detail.request.status === 'approved_by_hr' ? 'text-emerald-600' : 'text-red-500'} />
                            Final decision: <b>{CASE_STATUS_META[detail.request.status]?.label}</b>. Case closed.
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 py-2">Case details unavailable.</p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
