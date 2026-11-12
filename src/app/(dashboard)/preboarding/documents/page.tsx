'use client';

/* Task 4-c — Document Management (Preboarding BRD 5.8).
 * Cross-candidate document review queue: summary count chips, search/type
 * filters, verification table with Approve / Reject / Request Resubmission.
 * Uses live contracts:
 *   GET   /api/preboarding/brd/documents?tab=<pending|submitted|approved|rejected|awaiting_resubmission|all>
 *   PATCH /api/preboarding/brd/documents  {documentId, action, remarks}
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  FiCheckCircle,
  FiCornerUpLeft,
  FiExternalLink,
  FiEye,
  FiFileText,
  FiInfo,
  FiLock,
  FiRefreshCw,
  FiSearch,
  FiUser,
  FiXCircle,
} from 'react-icons/fi';

/* ── Auth helper ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface ManagementDoc {
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

interface DocumentCounts {
  all: number;
  pending: number;
  submitted: number;
  approved: number;
  rejected: number;
  awaiting_resubmission: number;
}

type TabKey = 'all' | 'pending' | 'submitted' | 'approved' | 'rejected' | 'awaiting_resubmission';

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

function fmtSize(bytes?: number | null): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

const COUNT_TABS: { key: TabKey; label: string; chip: string }[] = [
  { key: 'all', label: 'All', chip: 'bg-slate-100 text-slate-600' },
  { key: 'pending', label: 'Pending', chip: 'bg-amber-100 text-amber-700' },
  { key: 'submitted', label: 'Submitted', chip: 'bg-violet-100 text-violet-700' },
  { key: 'approved', label: 'Approved', chip: 'bg-emerald-100 text-emerald-700' },
  { key: 'rejected', label: 'Rejected', chip: 'bg-red-100 text-red-700' },
  { key: 'awaiting_resubmission', label: 'Awaiting Resubmission', chip: 'bg-orange-100 text-orange-700' },
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
export default function PreboardingDocumentsPage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [docs, setDocs] = useState<ManagementDoc[]>([]);
  const [counts, setCounts] = useState<DocumentCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [docType, setDocType] = useState('');

  const [modal, setModal] = useState<DocModal>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/preboarding/brd/documents?tab=${encodeURIComponent(tab)}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Failed to load documents (${res.status}).`);
        return;
      }
      const body = await res.json();
      setDocs(Array.isArray(body.documents) ? body.documents : []);
      setCounts(body.counts || null);
    } catch {
      setLoadError('Network error — could not load documents.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    // queueMicrotask defers the setState-triggering fetch call out of the
    // synchronous effect body (avoids react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const docTypes = useMemo(() => Array.from(new Set(docs.map((d) => d.documentLabel).filter(Boolean))).sort(), [docs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      const matchQ =
        !q ||
        (d.candidateName || '').toLowerCase().includes(q) ||
        (d.candidateEmail || '').toLowerCase().includes(q) ||
        (d.preboardingId || '').toLowerCase().includes(q);
      const matchType = !docType || d.documentLabel === docType;
      return matchQ && matchType;
    });
  }, [docs, search, docType]);

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
      toast.error('Rejection remarks are mandatory (BRD 5.8 F).');
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
          <h1 className="text-xl font-bold text-slate-800">Document Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Review, approve or reject documents submitted by preboarding candidates (BRD 5.8)</p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg self-start sm:self-auto"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* ── Summary count chips ── */}
      <div className="flex flex-wrap gap-2">
        {COUNT_TABS.map((t) => {
          const count = counts ? counts[t.key] : undefined;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                active ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${active ? 'bg-white/20 text-white' : t.chip}`}>
                {count === undefined ? '…' : count}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1 min-w-0">
          <FiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by candidate name or email…"
            className="border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm w-full"
            aria-label="Search documents by candidate"
          />
        </div>
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as TabKey)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full md:w-56 bg-white"
          aria-label="Filter by verification status"
        >
          {COUNT_TABS.map((t) => (
            <option key={t.key} value={t.key}>
              Status: {t.label}
            </option>
          ))}
        </select>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full md:w-60 bg-white"
          aria-label="Filter by document type"
        >
          <option value="">All document types</option>
          {docTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loadError ? (
          <div className="p-12 text-center">
            <FiInfo className="w-10 h-10 text-red-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">{loadError}</p>
            <button
              onClick={() => void load()}
              className="mt-4 inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
            >
              <FiRefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : loading ? (
          <div className="p-5 space-y-3" aria-label="Loading documents">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <FiFileText className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-600">No documents found</p>
            <p className="text-xs text-slate-400 mt-1">Try a different status tab, search term or document type filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Candidate</th>
                  <th className="text-left px-4 py-3 font-medium">Document</th>
                  <th className="text-left px-4 py-3 font-medium">Uploaded</th>
                  <th className="text-center px-4 py-3 font-medium">Preview</th>
                  <th className="text-left px-4 py-3 font-medium">Verification Status</th>
                  <th className="text-left px-4 py-3 font-medium">HR Remarks</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-800">{doc.candidateName || 'Unknown candidate'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {doc.preboardingId || '—'}
                        {doc.jobTitle ? ` · ${doc.jobTitle}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-700">{doc.documentLabel || doc.documentType}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{doc.documentType}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-slate-700">{fmtDate(doc.uploadedAt)}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[180px]" title={doc.fileName || undefined}>
                        {doc.fileName ? `${doc.fileName}${doc.fileSize ? ` · ${fmtSize(doc.fileSize)}` : ''}` : 'No file'}
                      </p>
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
            Approve <span className="font-medium text-slate-700">{modal.label}</span>? Approved documents are locked and cannot be re-reviewed.
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
            Reject <span className="font-medium text-slate-700">{modal.label}</span>? Rejection remarks are mandatory and visible to the candidate.
          </p>
          <label className="block text-xs font-medium text-slate-500 mb-1 mt-3" htmlFor="doc-rej-remarks">Rejection remarks *</label>
          <textarea
            id="doc-rej-remarks"
            rows={3}
            value={modal.remarks}
            onChange={(e) => setModal({ ...modal, remarks: e.target.value })}
            placeholder="State the reason for rejection (BRD 5.8 F)"
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
          <label className="block text-xs font-medium text-slate-500 mb-1 mt-3" htmlFor="doc-rs-remarks">What must be corrected? *</label>
          <textarea
            id="doc-rs-remarks"
            rows={3}
            value={modal.remarks}
            onChange={(e) => setModal({ ...modal, remarks: e.target.value })}
            placeholder="e.g. Document is blurry — please re-upload a clear scan"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        </ConfirmModal>
      ) : null}

      {/* footer note */}
      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <FiExternalLink className="w-3.5 h-3.5" /> Click a document preview to open the file in a new tab. Rejections require remarks (BRD 5.8 F).
      </p>
    </div>
  );
}
