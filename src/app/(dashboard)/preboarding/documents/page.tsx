'use client';

/* Task 4-c — Document Management (Preboarding BRD 5.8) — REWORKED per mock screens.
 *
 * Two-level flow (replaces the old single cross-candidate queue):
 *   Level 1  Candidates list — one row per candidate with a document summary
 *            ("2 approved · 3 pending review · 1 resubmit") + BGV chip +
 *            "View candidate" action.
 *   Level 2  Candidate workspace — opened by "View candidate":
 *            • candidate header (avatar, job · PRE-id, submitted date, Initiate BGV)
 *            • 4 summary cards (Required / Approved / Pending review / Resubmission requested)
 *            • Documents table (Document | Submitted | Status | Action: View/Review)
 *            • Right preview panel: universal viewer (image / PDF / Word),
 *              Download + Open full preview, Approve / Reject / Request
 *              resubmission with reason + due-date form.
 *            • Activity timeline.
 *
 * Verification & Approvals (BRD 5.9) is merged here — /preboarding/verification
 * redirects to this page.
 *
 * Uses live contracts:
 *   GET   /api/preboarding/brd/pipeline                       (level 1 candidates)
 *   GET   /api/preboarding/brd/documents?candidateId=<id>     (level 2 docs, light rows)
 *   PATCH /api/preboarding/brd/documents                      {documentId, action, remarks}
 *   GET   /api/preboarding/brd/activity?candidateEmail=<e>    (activity timeline)
 *   GET   /api/preboarding/brd/documents/<id>/file            (file bytes — viewer)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  FiArrowLeft,
  FiCheckCircle,
  FiChevronRight,
  FiCornerUpLeft,
  FiDownload,
  FiFile,
  FiFileText,
  FiInfo,
  FiLock,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiUser,
  FiX,
  FiXCircle,
} from 'react-icons/fi';
import DocumentPreview from '@/components/preboarding/DocumentPreview';
import BgvPanel from '@/components/preboarding/BgvPanel';

/* ── Auth helper ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface DocVersion {
  id: string;
  version: number;
  fileName: string | null;
  fileSize: number | null;
  status: string | null;
  uploadedAt: string | null;
  archivedAt: string;
  viewUrl: string;
  downloadUrl: string;
}

interface PipelineDoc {
  id: string;
  documentType: string | null;
  documentLabel: string | null;
  status: string;
  reviewNotes: string | null;
  uploadedAt: string | null;
  fileName: string | null;
}

interface PipelineCandidate {
  id: string;
  preboardingId: string | null;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string | null;
  department: string | null;
  stageLabel: string;
  bgvStatus: string;
  portalSubmittedAt: string | null;
  joiningDate: string | null;
  documentStatus: string;
  readinessPercent: number;
  documents: PipelineDoc[];
}

interface WorkspaceDoc {
  id: string;
  documentType: string;
  documentLabel: string;
  status: string;
  reviewNotes?: string | null;
  uploadedAt?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  fileMimeType?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  documentNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  version?: number | null;
  expired?: boolean;
  versions?: DocVersion[];
  hasFile: boolean;
  viewUrl?: string | null;
  downloadUrl?: string | null;
  candidateName?: string | null;
  candidateEmail?: string | null;
  preboardingId?: string | null;
  jobTitle?: string | null;
}

interface ActivityItem {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
  userName?: string | null;
}

/* ── Status presentation (mock vocabulary) ── */
const STATUS_META: Record<string, { label: string; chip: string }> = {
  approved: { label: 'Approved', chip: 'bg-emerald-100 text-emerald-700' },
  submitted: { label: 'Pending review', chip: 'bg-amber-100 text-amber-700' },
  pending: { label: 'Not submitted', chip: 'bg-slate-100 text-slate-500' },
  resubmission_requested: { label: 'Resubmission requested', chip: 'bg-orange-100 text-orange-700' },
  rejected: { label: 'Rejected', chip: 'bg-red-100 text-red-700' },
};

function statusMeta(status: string) {
  return STATUS_META[status] || { label: status.replace(/_/g, ' '), chip: 'bg-slate-100 text-slate-600' };
}

const BGV_META: Record<string, { label: string; chip: string }> = {
  pending: { label: 'Not initiated', chip: 'bg-slate-100 text-slate-600' },
  not_initiated: { label: 'Not initiated', chip: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In progress', chip: 'bg-violet-100 text-violet-700' },
  completed: { label: 'Cleared', chip: 'bg-emerald-100 text-emerald-700' },
  approved_by_hr: { label: 'Cleared', chip: 'bg-emerald-100 text-emerald-700' },
  rejected_by_hr: { label: ' flagged', chip: 'bg-red-100 text-red-700' },
};

function bgvMeta(status?: string | null) {
  const key = String(status || 'pending').toLowerCase();
  return BGV_META[key] || { label: key.replace(/_/g, ' '), chip: 'bg-slate-100 text-slate-600' };
}

/* ── Date helpers ── */
function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initials(name?: string | null): string {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';
}

const AVATAR_COLORS = ['bg-teal-600', 'bg-violet-600', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-600', 'bg-sky-600'];
function avatarColor(name?: string | null): string {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/* ── Per-candidate document summary (mock wording) ── */
interface DocSummary { total: number; approved: number; pendingReview: number; resubmission: number; notSubmitted: number }
function summarize(docs: { status: string }[]): DocSummary {
  const s = { total: docs.length, approved: 0, pendingReview: 0, resubmission: 0, notSubmitted: 0 };
  for (const d of docs) {
    if (d.status === 'approved') s.approved += 1;
    else if (d.status === 'submitted') s.pendingReview += 1;
    else if (d.status === 'resubmission_requested' || d.status === 'rejected') s.resubmission += 1;
    else s.notSubmitted += 1;
  }
  return s;
}
function summaryText(s: DocSummary): string {
  if (s.total === 0) return 'No documents';
  const parts: string[] = [];
  if (s.approved) parts.push(`${s.approved} approved`);
  if (s.pendingReview) parts.push(`${s.pendingReview} pending review`);
  if (s.resubmission) parts.push(`${s.resubmission} resubmit`);
  if (s.notSubmitted) parts.push(`${s.notSubmitted} not submitted`);
  if (parts.length === 0) return `${s.total} required`;
  return parts.join(' · ');
}

type ListFilter = 'all' | 'pending_review' | 'approved' | 'resubmission' | 'action_needed';

const LIST_FILTERS: { key: ListFilter; label: string }[] = [
  { key: 'all', label: 'All candidates' },
  { key: 'action_needed', label: 'Action needed' },
  { key: 'pending_review', label: 'Pending review' },
  { key: 'approved', label: 'All approved' },
  { key: 'resubmission', label: 'Resubmission requested' },
];

/* ════════════════════════════ PAGE ════════════════════════════ */
export default function PreboardingDocumentsPage() {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'candidate'>('list');
  const [selectedCandidate, setSelectedCandidate] = useState<PipelineCandidate | null>(null);

  return (
    <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-6">
      {view === 'list' || !selectedCandidate ? (
        <CandidatesList
          onOpen={(c) => {
            setSelectedCandidate(c);
            setView('candidate');
            window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
          }}
        />
      ) : (
        <>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm mb-3">
            <button onClick={() => { setView('list'); setSelectedCandidate(null); }} className="text-teal-700 hover:text-teal-800 font-medium">Documents</button>
            <FiChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500">{selectedCandidate.candidateName}</span>
          </nav>
          <CandidateWorkspace
            key={selectedCandidate.id}
            candidate={selectedCandidate}
            onBack={() => { setView('list'); setSelectedCandidate(null); }}
            onInitiateBgv={() => {
              // Per the vendor-access brief: BGV lives on the SAME candidate
              // workspace — scroll to the inline BGV panel.
              window.setTimeout(() => {
                document.querySelector('[data-testid="bgv-panel"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 100);
            }}
          />
        </>
      )}
    </div>
  );
}

/* ════════════════════ LEVEL 1 — CANDIDATES LIST ════════════════════ */
function CandidatesList({ onOpen }: { onOpen: (c: PipelineCandidate) => void }) {
  const [candidates, setCandidates] = useState<PipelineCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ListFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/preboarding/brd/pipeline', { headers: getAuthHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Failed to load candidates (${res.status}).`);
        return;
      }
      const body = await res.json();
      setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
    } catch {
      setLoadError('Network error — could not load candidates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      const matchQ = !q ||
        c.candidateName?.toLowerCase().includes(q) ||
        c.candidateEmail?.toLowerCase().includes(q) ||
        c.preboardingId?.toLowerCase().includes(q) ||
        c.jobTitle?.toLowerCase().includes(q);
      const s = summarize(c.documents || []);
      const matchF =
        filter === 'all' ||
        (filter === 'pending_review' && s.pendingReview > 0) ||
        (filter === 'approved' && s.total > 0 && s.approved === s.total) ||
        (filter === 'resubmission' && s.resubmission > 0) ||
        (filter === 'action_needed' && (s.pendingReview > 0 || s.resubmission > 0));
      return matchQ && matchF;
    });
  }, [candidates, search, filter]);

  const totalPendingReview = useMemo(
    () => candidates.reduce((acc, c) => acc + summarize(c.documents || []).pendingReview, 0),
    [candidates],
  );
  const totalResubmission = useMemo(
    () => candidates.reduce((acc, c) => acc + summarize(c.documents || []).resubmission, 0),
    [candidates],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Documents</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review, approve or reject documents submitted by preboarding candidates — open a candidate to see their documents.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg self-start sm:self-auto"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Overview strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Candidates</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{candidates.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Documents pending review</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{loading ? '…' : totalPendingReview}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">Resubmission requested</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{loading ? '…' : totalResubmission}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1 min-w-0">
          <FiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidates by name, email, PRE-id or job…"
            className="border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm w-full"
            aria-label="Search candidates"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LIST_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === f.key ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loadError ? (
          <div className="p-12 text-center">
            <FiInfo className="w-10 h-10 text-red-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">{loadError}</p>
            <button onClick={() => void load()} className="mt-4 inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg">
              <FiRefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : loading ? (
          <div className="p-5 space-y-3" aria-label="Loading candidates">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <FiUser className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-600">No candidates found</p>
            <p className="text-xs text-slate-400 mt-1">Try a different search term or filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Candidate</th>
                  <th className="text-left px-4 py-3 font-medium">Job</th>
                  <th className="text-left px-4 py-3 font-medium">Documents</th>
                  <th className="text-left px-4 py-3 font-medium">BGV</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const s = summarize(c.documents || []);
                  const bgv = bgvMeta(c.bgvStatus);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className={`w-9 h-9 rounded-full text-white text-xs font-semibold flex items-center justify-center shrink-0 ${avatarColor(c.candidateName)}`}>
                            {initials(c.candidateName)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">{c.candidateName || 'Unknown candidate'}</p>
                            <p className="text-xs text-slate-400 truncate">{c.candidateEmail || c.preboardingId || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-slate-700">{c.jobTitle || '—'}</p>
                        <p className="text-xs text-slate-400">{c.preboardingId || ''}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-700">{summaryText(s)}</span>
                          {s.resubmission > 0 ? <span className="w-2 h-2 rounded-full bg-orange-500" title="Resubmission requested" /> : null}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{s.total} document{s.total === 1 ? '' : 's'} required</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${bgv.chip}`}>{bgv.label}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => onOpen(c)}
                          className="inline-flex items-center gap-1.5 border border-teal-600 text-teal-700 hover:bg-teal-600 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                        >
                          View candidate <FiChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <FiInfo className="w-3.5 h-3.5" /> Select <span className="font-medium text-slate-500">View candidate</span> to review that candidate&apos;s documents.
      </p>
    </div>
  );
}

/* ════════════════ LEVEL 2 — CANDIDATE DOCUMENTS WORKSPACE ════════════════ */
function CandidateWorkspace({
  candidate,
  onBack,
  onInitiateBgv,
}: {
  candidate: PipelineCandidate;
  onBack: () => void;
  onInitiateBgv: () => void;
}) {
  const [docs, setDocs] = useState<WorkspaceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  /* action form: reject | resubmit */
  const [formMode, setFormMode] = useState<'reject' | 'resubmit' | null>(null);
  const [reason, setReason] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/preboarding/brd/documents?candidateId=${encodeURIComponent(candidate.id)}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Failed to load documents (${res.status}).`);
        return;
      }
      const body = await res.json();
      const list: WorkspaceDoc[] = Array.isArray(body.documents) ? body.documents : [];
      setDocs(list);
      // keep a valid selection
      setSelectedId((prev) => (prev && list.some((d) => d.id === prev) ? prev : list[0]?.id || null));
    } catch {
      setLoadError('Network error — could not load documents.');
    } finally {
      setLoading(false);
    }
  }, [candidate.id]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/preboarding/brd/activity?candidateEmail=${encodeURIComponent(candidate.candidateEmail || '')}&limit=15`, { headers: getAuthHeaders() });
      if (res.ok) {
        const body = await res.json();
        setActivity(Array.isArray(body.activities) ? body.activities : Array.isArray(body.activity) ? body.activity : []);
      } else {
        setActivity([]);
      }
    } catch {
      setActivity([]);
    } finally {
      setActivityLoading(false);
    }
  }, [candidate.candidateEmail]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDocs();
      void loadActivity();
    });
  }, [loadDocs, loadActivity]);

  const summary = useMemo(() => summarize(docs), [docs]);
  const selected = useMemo(() => docs.find((d) => d.id === selectedId) || null, [docs, selectedId]);
  const allApproved = summary.total > 0 && summary.approved === summary.total;
  const bgv = bgvMeta(candidate.bgvStatus);
  const bgvActive = !['pending', 'not_initiated'].includes(String(candidate.bgvStatus || 'pending').toLowerCase());

  /* selection handler — resets the action form so it never leaks across docs */
  const selectDoc = useCallback((id: string | null) => {
    setSelectedId(id);
    setFormMode(null);
    setReason('');
    setDueDate('');
  }, []);

  const docAction = useCallback(
    async (documentId: string, action: 'approve' | 'reject' | 'request_resubmission', remarks: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/preboarding/brd/documents', {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ documentId, action, remarks }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error || 'Document action failed.');
          return false;
        }
        toast.success(body.message || 'Document updated.');
        await loadDocs();
        await loadActivity();
        return true;
      } catch {
        toast.error('Network error — document action failed.');
        return false;
      }
    },
    [loadDocs, loadActivity],
  );

  const handleApprove = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    const ok = await docAction(selected.id, 'approve', '');
    setBusy(false);
    if (ok) setFormMode(null);
  }, [selected, docAction]);

  const handleFormSubmit = useCallback(async () => {
    if (!selected || !formMode) return;
    if (!reason.trim()) {
      toast.error(formMode === 'reject' ? 'Rejection remarks are mandatory (BRD 5.8 F).' : 'Please describe what the candidate must correct.');
      return;
    }
    setBusy(true);
    const remarks = dueDate ? `${reason.trim()} [Resubmission due by: ${dueDate}]` : reason.trim();
    const ok = await docAction(selected.id, formMode === 'reject' ? 'reject' : 'request_resubmission', remarks);
    setBusy(false);
    if (ok) setFormMode(null);
  }, [selected, formMode, reason, dueDate, docAction]);

  return (
    <div className="space-y-5">
      {/* ── Candidate header ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <button onClick={onBack} className="lg:hidden w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 shrink-0" aria-label="Back to documents list">
              <FiArrowLeft className="w-4 h-4" />
            </button>
            <span className={`w-12 h-12 rounded-full text-white text-sm font-semibold flex items-center justify-center shrink-0 ${avatarColor(candidate.candidateName)}`}>
              {initials(candidate.candidateName)}
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-800 truncate">{candidate.candidateName || 'Unknown candidate'}</h1>
              <p className="text-sm text-slate-500 truncate">
                {candidate.jobTitle || '—'}{candidate.preboardingId ? ` · ${candidate.preboardingId}` : ''}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 lg:ml-4 lg:pl-4 lg:border-l lg:border-slate-200">
              <FiFileText className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="text-sm">
                <span className="text-slate-700">Submitted</span>{' '}
                <span className="text-slate-500">{candidate.portalSubmittedAt ? fmtDate(candidate.portalSubmittedAt) : '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
            {bgvActive ? (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${bgv.chip}`}>BGV: {bgv.label}</span>
            ) : (
              <div className="text-right">
                <button
                  onClick={onInitiateBgv}
                  className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border bg-teal-600 border-teal-600 text-white hover:bg-teal-700"
                  title="Initiate background verification — BGV section below"
                >
                  <FiShield className="w-4 h-4" /> Initiate BGV
                </button>
                <p className="text-[11px] text-slate-400 mt-1">{allApproved ? 'All documents approved — ready' : 'Required document approvals pending'}</p>
              </div>
            )}
            <button onClick={onBack} className="hidden lg:inline-flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg">
              <FiArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryCard icon={<FiFileText className="w-4 h-4" />} tint="bg-slate-100 text-slate-600" label="Required" value={loading ? '…' : summary.total} />
        <SummaryCard icon={<FiCheckCircle className="w-4 h-4" />} tint="bg-emerald-100 text-emerald-600" label="Approved" value={loading ? '…' : summary.approved} />
        <SummaryCard icon={<FiInfo className="w-4 h-4" />} tint="bg-amber-100 text-amber-600" label="Pending review" value={loading ? '…' : summary.pendingReview} />
        <SummaryCard icon={<FiCornerUpLeft className="w-4 h-4" />} tint="bg-orange-100 text-orange-600" label="Resubmission requested" value={loading ? '…' : summary.resubmission} />
      </div>

      {/* ── Error bar ── */}
      {loadError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700">{loadError}</p>
          <button onClick={() => void loadDocs()} className="text-xs font-medium bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg">Retry</button>
        </div>
      ) : null}

      {/* ── Main split: table+activity | preview panel ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_460px] gap-5 items-start">
        {/* Left column */}
        <div className="space-y-5 min-w-0">
          {/* Documents table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Documents ({loading ? '…' : summary.total})</h2>
              <button onClick={() => void loadDocs()} className="text-teal-700 hover:text-teal-800 text-xs font-medium inline-flex items-center gap-1">
                <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            {loading ? (
              <div className="p-4 space-y-3" aria-label="Loading documents">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
              </div>
            ) : docs.length === 0 ? (
              <div className="p-10 text-center">
                <FiFileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">No documents configured for this candidate</p>
                <p className="text-xs text-slate-400 mt-1">Required documents are defined in Onboarding settings.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[640px] w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Document</th>
                      <th className="text-left px-4 py-3 font-medium">Submitted</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-right px-4 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {docs.map((doc) => {
                      const meta = statusMeta(doc.status);
                      const isSelected = doc.id === selectedId;
                      return (
                        <tr
                          key={doc.id}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-teal-50/70 border-l-2 border-l-teal-600' : 'hover:bg-slate-50/60'}`}
                          onClick={() => selectDoc(doc.id)}
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <FiFile className={`w-4 h-4 shrink-0 ${isSelected ? 'text-teal-700' : 'text-slate-400'}`} />
                              <div className="min-w-0">
                                <p className={`font-medium truncate max-w-[240px] ${isSelected ? 'text-teal-900' : 'text-slate-800'}`}>
                                  {doc.documentLabel || doc.documentType}
                                  {doc.version ? <span className="ml-1.5 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1 py-px align-middle" title="Current version (re-uploads archive previous versions)">v{doc.version}</span> : null}
                                  {doc.expired ? <span className="ml-1.5 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1 py-px align-middle" title={`Expired ${doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString('en-IN') : ''}`}>EXPIRED</span> : null}
                                </p>
                                {doc.fileName ? <p className="text-[11px] text-slate-400 truncate max-w-[240px]" title={doc.fileName}>{doc.fileName}</p> : null}
                                {doc.documentNumber ? <p className="text-[11px] text-slate-400 truncate max-w-[240px]">No. {doc.documentNumber}{doc.expiryDate ? ` · expires ${new Date(doc.expiryDate).toLocaleDateString('en-IN')}` : ''}</p> : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="text-slate-600">{doc.uploadedAt ? fmtDateTime(doc.uploadedAt) : '—'}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${meta.chip}`}>
                              {doc.status === 'approved' ? <FiCheckCircle className="w-3 h-3" /> : doc.status === 'pending' ? <FiInfo className="w-3 h-3" /> : doc.status === 'rejected' ? <FiXCircle className="w-3 h-3" /> : <FiInfo className="w-3 h-3" />}
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {doc.status === 'approved' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); selectDoc(doc.id); }}
                                className="inline-flex items-center gap-1 border border-teal-600 text-teal-700 hover:bg-teal-600 hover:text-white text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors"
                              >
                                View
                              </button>
                            ) : !doc.hasFile ? (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400 px-2 py-1.5" title="Candidate has not uploaded this document yet">
                                <FiInfo className="w-3.5 h-3.5" /> No file
                              </span>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); selectDoc(doc.id); }}
                                className={`inline-flex items-center gap-1 text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors ${
                                  isSelected ? 'bg-teal-600 text-white' : 'border border-teal-600 text-teal-700 hover:bg-teal-600 hover:text-white'
                                }`}
                              >
                                Review
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Activity</h2>
            {activityLoading ? (
              <div className="space-y-2" aria-label="Loading activity">
                {[0, 1, 2].map((i) => <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}
              </div>
            ) : activity.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No activity recorded for this candidate yet.</p>
            ) : (
              <ol className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 break-words">{a.details || a.action}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {a.userName ? `${a.userName} · ` : ''}{fmtDateTime(a.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Right column — preview panel (sticky on desktop) */}
        <div className="xl:sticky xl:top-4 min-w-0">
          {selected ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* panel header */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-800 truncate">{selected.documentLabel || selected.documentType}</h2>
                  <p className="text-xs text-slate-400 truncate">{selected.candidateName || candidate.candidateName} · Uploaded {selected.uploadedAt ? fmtDateTime(selected.uploadedAt) : '—'}</p>
                </div>
                <button onClick={() => selectDoc(null)} className="xl:hidden w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-500 hover:bg-slate-50 shrink-0" aria-label="Close preview">
                  <FiX className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Viewer or empty state */}
                {selected.hasFile ? (
                  <DocumentPreview
                    documentId={selected.id}
                    fileName={selected.fileName}
                    fileSize={selected.fileSize}
                    mimeType={selected.mimeType || selected.fileMimeType}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 h-56 flex flex-col items-center justify-center gap-2 text-center px-6">
                    <FiFileText className="w-8 h-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">No file uploaded yet</p>
                    <p className="text-xs text-slate-400">The candidate has not submitted this document. Approving is blocked until a file is uploaded.</p>
                  </div>
                )}

                {/* HR note (rejected / resubmission requested) */}
                {(selected.status === 'rejected' || selected.status === 'resubmission_requested') && selected.reviewNotes ? (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-3.5 py-3">
                    <p className="text-xs font-semibold text-orange-700 mb-0.5">Request / rejection note sent to candidate</p>
                    <p className="text-sm text-orange-800 break-words">{selected.reviewNotes}</p>
                    {selected.reviewedAt ? <p className="text-[11px] text-orange-500 mt-1">{fmtDateTime(selected.reviewedAt)}{selected.reviewedBy ? ` · by ${selected.reviewedBy}` : ''}</p> : null}
                  </div>
                ) : null}

                {/* Details & version history (BRD 5.8) */}
                {(selected.documentNumber || selected.issueDate || selected.expiryDate || (selected.versions && selected.versions.length > 0) || (selected.version || 0) > 1) ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-600">Document details</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-slate-500">Document number</span>
                      <span className="text-slate-800 font-medium text-right">{selected.documentNumber || '—'}</span>
                      <span className="text-slate-500">Issue date</span>
                      <span className="text-slate-800 font-medium text-right">{selected.issueDate ? new Date(selected.issueDate).toLocaleDateString('en-IN') : '—'}</span>
                      <span className="text-slate-500">Expiry date</span>
                      <span className={`font-medium text-right ${selected.expired ? 'text-red-600' : 'text-slate-800'}`}>
                        {selected.expiryDate ? new Date(selected.expiryDate).toLocaleDateString('en-IN') : '—'}{selected.expired ? ' · EXPIRED' : ''}
                      </span>
                      <span className="text-slate-500">Current version</span>
                      <span className="text-slate-800 font-medium text-right">v{selected.version || 0}</span>
                    </div>
                    {selected.versions && selected.versions.length > 0 ? (
                      <div className="pt-1">
                        <p className="text-xs font-semibold text-slate-600 mb-1.5">Version history</p>
                        <ul className="space-y-1">
                          {selected.versions.map((v) => (
                            <li key={v.id} className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                              <span className="min-w-0">
                                <span className="font-semibold text-slate-700">v{v.version}</span>
                                <span className="text-slate-400 ml-1.5 truncate">{v.fileName || 'file'}</span>
                                <span className="text-slate-400 ml-1.5 whitespace-nowrap">· {v.uploadedAt ? new Date(v.uploadedAt).toLocaleDateString('en-IN') : '—'}</span>
                              </span>
                              <span className="flex items-center gap-2 shrink-0">
                                <a href={v.viewUrl} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:text-teal-900 font-medium" onClick={(e) => e.stopPropagation()}>View</a>
                                <a href={v.downloadUrl} className="text-slate-500 hover:text-slate-800 font-medium" onClick={(e) => e.stopPropagation()}>Download</a>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Status + actions */}
                <div className="rounded-xl border border-slate-200 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Status</span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusMeta(selected.status).chip}`}>
                      {statusMeta(selected.status).label}
                    </span>
                  </div>

                  {selected.status === 'approved' ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                      <FiLock className="w-4 h-4 shrink-0" /> Approved — locked. Approved documents cannot be re-reviewed.
                    </div>
                  ) : !selected.hasFile ? (
                    <p className="text-xs text-slate-400 px-1">Waiting for the candidate to upload this document. Use the reminder actions on the candidate profile to nudge them.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => void handleApprove()}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-60"
                        >
                          <FiCheckCircle className="w-4 h-4" /> {busy && formMode === null ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setFormMode(formMode === 'reject' ? null : 'reject')}
                          className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                            formMode === 'reject' ? 'bg-red-600 border-red-600 text-white' : 'border-red-300 text-red-600 hover:bg-red-50'
                          }`}
                        >
                          <FiXCircle className="w-4 h-4" /> Reject
                        </button>
                        <button
                          onClick={() => setFormMode(formMode === 'resubmit' ? null : 'resubmit')}
                          className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                            formMode === 'resubmit' ? 'bg-amber-500 border-amber-500 text-white' : 'border-amber-300 text-amber-600 hover:bg-amber-50'
                          }`}
                        >
                          <FiCornerUpLeft className="w-4 h-4" /> Resubmit
                        </button>
                      </div>

                      {/* Reject / resubmission form */}
                      {formMode ? (
                        <div className={`rounded-lg border p-3.5 space-y-3 ${formMode === 'reject' ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                          <p className={`text-sm font-semibold ${formMode === 'reject' ? 'text-red-700' : 'text-amber-700'}`}>
                            {formMode === 'reject' ? 'Reject document' : 'Request a replacement document'}
                          </p>
                          <div>
                            <label htmlFor="doc-reason" className="block text-xs font-medium text-slate-600 mb-1">
                              Reason {formMode === 'reject' ? '*' : '*'}
                            </label>
                            <textarea
                              id="doc-reason"
                              rows={3}
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder={formMode === 'reject' ? 'State the reason for rejection' : 'The certificate is blurry. Please upload a clear, complete copy.'}
                              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <label htmlFor="doc-due" className="text-xs font-medium text-slate-600 whitespace-nowrap">Due date (optional)</label>
                            <input
                              id="doc-due"
                              type="date"
                              value={dueDate}
                              onChange={(e) => setDueDate(e.target.value)}
                              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                            />
                          </div>
                          <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-teal-600 w-3.5 h-3.5" />
                            Notify candidate by email and in-app notification
                          </label>
                          <button
                            onClick={() => void handleFormSubmit()}
                            disabled={busy}
                            className={`w-full inline-flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2.5 rounded-lg text-white disabled:opacity-60 ${
                              formMode === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'
                            }`}
                          >
                            {busy ? 'Sending…' : formMode === 'reject' ? 'Confirm rejection' : 'Send resubmission request'}
                          </button>
                          <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <FiInfo className="w-3 h-3 shrink-0" /> Only this document will be reopened. Approved documents remain unchanged.
                          </p>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
              <FiFileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">Select a document to preview</p>
              <p className="text-xs text-slate-400 mt-1">Choose <span className="font-medium">Review</span> or <span className="font-medium">View</span> beside a document in the table.</p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400">
                <FiDownload className="w-3.5 h-3.5" /> Documents can be downloaded from the preview panel.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── BGV section (full width below the table+preview split) ── */}
      <BgvPanel
        candidateId={candidate.id}
        candidateName={candidate.candidateName || 'Unknown candidate'}
        candidateEmail={candidate.candidateEmail || ''}
        documents={docs.map((d) => ({ id: d.id, documentLabel: d.documentLabel || null, documentType: d.documentType || null, status: d.status }))}
        bgvStatus={candidate.bgvStatus}
        onCaseChanged={loadActivity}
      />
    </div>
  );
}

/* ── Small presentational bits ── */
function SummaryCard({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: number | '…' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3.5 flex items-center gap-3">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
        <p className="text-xs text-slate-500 truncate">{label}</p>
      </div>
    </div>
  );
}
