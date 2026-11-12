'use client';

/* Task 4-c — Verification & Approvals (Preboarding BRD 5.9).
 * HR-side verification workspace: BRD tabs (Pending Verification | Approved |
 * Rejected | Awaiting Resubmission | All Records), candidate-details pending
 * banner, verification table with Approve / Reject / Request Resubmission,
 * approval rules + verification category cards.
 * Uses live contracts:
 *   GET   /api/preboarding/brd/documents?tab=<...>
 *   PATCH /api/preboarding/brd/documents  {documentId, action, remarks}
 *   GET   /api/preboarding/brd/pipeline   (candidates whose details are in verification)
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  FiAlertTriangle,
  FiBriefcase,
  FiCheckCircle,
  FiCornerUpLeft,
  FiCreditCard,
  FiEye,
  FiFileText,
  FiInfo,
  FiLock,
  FiRefreshCw,
  FiShield,
  FiUser,
  FiXCircle,
} from 'react-icons/fi';

/* ── Auth helper ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface VerificationDoc {
  id: string;
  documentType: string;
  documentLabel: string;
  status: string;
  reviewNotes?: string | null;
  uploadedAt?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileUrl?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  preboardingCandidateId?: string | null;
  candidateName?: string | null;
  candidateEmail?: string | null;
  preboardingId?: string | null;
  jobTitle?: string | null;
}

interface PipelineCandidate {
  id: string;
  preboardingId?: string | null;
  candidateName?: string | null;
  candidateEmail?: string | null;
  jobTitle?: string | null;
  stage?: string | null;
  stageLabel?: string | null;
  verificationStatus?: string | null;
  portalSubmittedAt?: string | null;
}

type VTabKey = 'pending' | 'approved' | 'rejected' | 'awaiting' | 'all';

type DocModal =
  | { kind: 'approve'; docId: string; label: string }
  | { kind: 'reject'; docId: string; label: string; remarks: string }
  | { kind: 'resubmit'; docId: string; label: string; remarks: string }
  | null;

/* ── Tokens / helpers ── */
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const DOC_STATUS_CHIP: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  submitted: 'bg-violet-100 text-violet-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  resubmission_requested: 'bg-orange-100 text-orange-700',
};

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DOC_STATUS_CHIP[status] || 'bg-slate-100 text-slate-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/* BRD 5.9 tabs — EXACT labels per the spec.
 * 'Pending Verification' maps to tab=submitted (documents awaiting review). */
const VTABS: { key: VTabKey; label: string; apiTab: string }[] = [
  { key: 'pending', label: 'Pending Verification', apiTab: 'submitted' },
  { key: 'approved', label: 'Approved', apiTab: 'approved' },
  { key: 'rejected', label: 'Rejected', apiTab: 'rejected' },
  { key: 'awaiting', label: 'Awaiting Resubmission', apiTab: 'awaiting_resubmission' },
  { key: 'all', label: 'All Records', apiTab: 'all' },
];

const CATEGORY_CARDS: { title: string; owner: string; action: string; icon: React.ReactNode; accent: string }[] = [
  { title: 'Personal details & documents', owner: 'HR Executive', action: 'Verify & approve', icon: <FiUser className="w-4 h-4" />, accent: 'bg-teal-50 text-teal-700' },
  { title: 'Bank & payroll details', owner: 'Payroll / Finance', action: 'Verify', icon: <FiCreditCard className="w-4 h-4" />, accent: 'bg-violet-50 text-violet-700' },
  { title: 'Employment & joining details', owner: 'HR Admin', action: 'Review & approve', icon: <FiBriefcase className="w-4 h-4" />, accent: 'bg-amber-50 text-amber-700' },
];

function ConfirmModal({
  title,
  tone,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  tone: 'primary' | 'danger';
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const btn = tone === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-800 mb-1">{title}</h3>
        {children}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={busy} className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy} className={`${btn} text-sm font-medium px-3.5 py-2 rounded-lg disabled:opacity-60`}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ── */
export default function VerificationApprovalsPage() {
  const [activeTab, setActiveTab] = useState<VTabKey>('pending');
  const [docs, setDocs] = useState<VerificationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [detailsPending, setDetailsPending] = useState<PipelineCandidate[]>([]);
  const [detailsPendingLoading, setDetailsPendingLoading] = useState(false);

  const [modal, setModal] = useState<DocModal>(null);
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const activeApiTab = VTABS.find((t) => t.key === activeTab)?.apiTab || 'all';

  /* ── Document queue load (contract 3) ── */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/preboarding/brd/documents?tab=${encodeURIComponent(activeApiTab)}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Failed to load verification queue (${res.status}).`);
        return;
      }
      const body = await res.json();
      setDocs(Array.isArray(body.documents) ? body.documents : []);
    } catch {
      setLoadError('Network error — could not load the verification queue.');
    } finally {
      setLoading(false);
    }
  }, [activeApiTab]);

  useEffect(() => {
    // queueMicrotask defers the setState-triggering fetch call out of the
    // synchronous effect body (avoids react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  /* ── Candidates whose details (not documents) are pending verification ── */
  useEffect(() => {
    if (activeTab !== 'pending') return;
    let cancelled = false;
    const run = async () => {
      setDetailsPendingLoading(true);
      try {
        const res = await fetch('/api/preboarding/brd/pipeline', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        if (!body || cancelled) return;
        const list: PipelineCandidate[] = (Array.isArray(body.candidates) ? body.candidates : []).filter(
          (c: PipelineCandidate) => c.stage === 'verification' && c.portalSubmittedAt && c.verificationStatus !== 'Verified',
        );
        setDetailsPending(list);
      } catch {
        /* banner is informational — ignore fetch failures */
      } finally {
        if (!cancelled) setDetailsPendingLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, refreshTick]);

  /* ── Document actions (contract 4) ── */
  const docAction = useCallback(
    async (documentId: string, action: 'approve' | 'reject' | 'request_resubmission', remarks?: string): Promise<boolean> => {
      if (action !== 'approve' && !remarks?.trim()) {
        toast.error('Remarks are mandatory for this action.');
        return false;
      }
      try {
        const res = await fetch('/api/preboarding/brd/documents', {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ documentId, action, remarks: remarks || '' }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error || 'Document action failed.');
          return false;
        }
        toast.success(body.message || 'Document updated.');
        await load();
        setRefreshTick((t) => t + 1);
        return true;
      } catch {
        toast.error('Network error — document action failed.');
        return false;
      }
    },
    [load],
  );

  const handleModalConfirm = useCallback(async () => {
    const m = modal;
    if (!m) return;
    if (m.kind === 'reject' && !m.remarks.trim()) {
      toast.error('Every rejection requires a reason (BRD 5.9).');
      return;
    }
    if (m.kind === 'resubmit' && !m.remarks.trim()) {
      toast.error('Please describe what the candidate must correct.');
      return;
    }
    setBusy(true);
    let ok = false;
    if (m.kind === 'approve') ok = await docAction(m.docId, 'approve', '');
    else if (m.kind === 'reject') ok = await docAction(m.docId, 'reject', m.remarks.trim());
    else ok = await docAction(m.docId, 'request_resubmission', m.remarks.trim());
    setBusy(false);
    if (ok) setModal(null);
  }, [modal, docAction]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Verification &amp; Approvals</h1>
          <p className="text-sm text-slate-500 mt-0.5">Verify candidate details and documents</p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg self-start sm:self-auto"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* ── Category info cards (BRD 5.9) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CATEGORY_CARDS.map((cat) => (
          <div key={cat.title} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-3">
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cat.accent}`}>{cat.icon}</span>
            <div>
              <p className="text-sm font-semibold text-slate-800">{cat.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {cat.owner} — {cat.action}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── BRD tabs ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex overflow-x-auto border-b border-slate-100 px-2" role="tablist" aria-label="Verification tabs">
          {VTABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === t.key ? 'text-teal-700 border-teal-600' : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-5">
          {/* ── Details-pending banner (Pending Verification tab only) ── */}
          {activeTab === 'pending' ? (
            detailsPendingLoading ? (
              <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
            ) : detailsPending.length > 0 ? (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FiShield className="w-4 h-4 text-violet-700" />
                  <p className="text-sm font-semibold text-violet-800">
                    Details pending verification: {detailsPending.length} candidate{detailsPending.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {detailsPending.map((c) => (
                    <div key={c.id} className="bg-white rounded-lg border border-violet-100 px-3.5 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.candidateName || 'Unnamed candidate'}</p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {c.preboardingId || '—'}
                          {c.jobTitle ? ` · ${c.jobTitle}` : ''}
                        </p>
                      </div>
                      <Link
                        href={`/preboarding/candidates/${c.id}`}
                        className="inline-flex items-center gap-1 border border-violet-300 text-violet-700 hover:bg-violet-50 text-xs font-medium px-2.5 py-1.5 rounded-lg shrink-0"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-violet-600 mt-3">
                  These candidates submitted their joining details and are awaiting HR review of the submitted information itself.
                </p>
              </div>
            ) : null
          ) : null}

          {/* ── Verification table ── */}
          {loadError ? (
            <div className="p-12 text-center">
              <FiAlertTriangle className="w-10 h-10 text-red-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">{loadError}</p>
              <button
                onClick={() => void load()}
                className="mt-4 inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
              >
                <FiRefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-3" aria-label="Loading verification queue">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <FiFileText className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-slate-600">No documents in this view</p>
              <p className="text-xs text-slate-400 mt-1">Switch tabs to see other verification states.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Candidate</th>
                    <th className="text-left px-4 py-3 font-medium">Document</th>
                    <th className="text-center px-4 py-3 font-medium">Preview</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Remarks</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {docs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-800">{doc.candidateName || 'Unknown candidate'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {doc.preboardingId || '—'}
                          {doc.candidateEmail ? ` · ${doc.candidateEmail}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-700">{doc.documentLabel || doc.documentType}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{doc.documentType}</p>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {doc.fileUrl ? (
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open file in new tab"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                          >
                            <FiEye className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusChip status={doc.status} />
                        {doc.reviewedBy || doc.reviewedAt ? (
                          <p className="text-xs text-slate-400 mt-1">
                            {doc.reviewedBy ? `by ${doc.reviewedBy}` : 'Reviewed'}
                            {doc.reviewedAt ? ` · ${fmtDate(doc.reviewedAt)}` : ''}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 max-w-[220px]">
                        {doc.reviewNotes ? (
                          <p className="text-xs text-slate-600 truncate" title={doc.reviewNotes}>
                            {doc.reviewNotes}
                          </p>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {doc.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                            <FiLock className="w-3.5 h-3.5" /> Approved — locked
                          </span>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                            <button
                              onClick={() => setModal({ kind: 'approve', docId: doc.id, label: doc.documentLabel })}
                              className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg"
                            >
                              <FiCheckCircle className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => setModal({ kind: 'reject', docId: doc.id, label: doc.documentLabel, remarks: '' })}
                              className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg"
                            >
                              <FiXCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                            <button
                              onClick={() => setModal({ kind: 'resubmit', docId: doc.id, label: doc.documentLabel, remarks: '' })}
                              className="inline-flex items-center gap-1 border border-orange-300 text-orange-600 hover:bg-orange-50 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                            >
                              <FiCornerUpLeft className="w-3.5 h-3.5" /> Resubmission
                            </button>
                            {doc.preboardingCandidateId ? (
                              <Link
                                href={`/preboarding/candidates/${doc.preboardingCandidateId}`}
                                className="inline-flex items-center gap-1 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                              >
                                <FiUser className="w-3.5 h-3.5" /> Profile
                              </Link>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Approval rules footer note (BRD 5.9) ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <FiInfo className="w-4 h-4 text-teal-600" />
          <h2 className="text-sm font-semibold text-slate-800">Approval rules</h2>
        </div>
        <ul className="space-y-2">
          {[
            'Every rejection requires a reason.',
            'Approval is recorded with user ID and timestamp.',
            'Candidate must not be marked Ready to Join if mandatory verification remains incomplete.',
          ].map((rule) => (
            <li key={rule} className="flex items-start gap-2 text-sm text-slate-600">
              <FiCheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              {rule}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Confirm modals ── */}
      {modal?.kind === 'approve' ? (
        <ConfirmModal
          title="Approve Document"
          tone="primary"
          confirmLabel="Approve"
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <p className="text-sm text-slate-500 mt-1">
            Approve <span className="font-medium text-slate-700">{modal.label}</span>? The approval is recorded with your user ID and timestamp, and the document becomes locked.
          </p>
        </ConfirmModal>
      ) : null}

      {modal?.kind === 'reject' ? (
        <ConfirmModal
          title="Reject Document"
          tone="danger"
          confirmLabel="Reject Document"
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <p className="text-sm text-slate-500 mt-1">
            Reject <span className="font-medium text-slate-700">{modal.label}</span>? Every rejection requires a reason (BRD 5.9).
          </p>
          <label className="block text-xs font-medium text-slate-500 mb-1 mt-3" htmlFor="v-rej-remarks">Rejection remarks *</label>
          <textarea
            id="v-rej-remarks"
            rows={3}
            value={modal.remarks}
            onChange={(e) => setModal({ ...modal, remarks: e.target.value })}
            placeholder="State the reason for rejection"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        </ConfirmModal>
      ) : null}

      {modal?.kind === 'resubmit' ? (
        <ConfirmModal
          title="Request Resubmission"
          tone="primary"
          confirmLabel="Request Resubmission"
          busy={busy}
          onClose={() => setModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <p className="text-sm text-slate-500 mt-1">
            Ask the candidate to re-upload <span className="font-medium text-slate-700">{modal.label}</span>. Describe what must be corrected.
          </p>
          <label className="block text-xs font-medium text-slate-500 mb-1 mt-3" htmlFor="v-rs-remarks">What must be corrected? *</label>
          <textarea
            id="v-rs-remarks"
            rows={3}
            value={modal.remarks}
            onChange={(e) => setModal({ ...modal, remarks: e.target.value })}
            placeholder="e.g. Document is blurry — please re-upload a clear scan"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        </ConfirmModal>
      ) : null}
    </div>
  );
}
