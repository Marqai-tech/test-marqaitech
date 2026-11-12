'use client';

/* Task 4-c — Candidate Details (Preboarding BRD screen 3 + tabs).
 * Self-contained HR-side profile: header card with actions (reminder, joining
 * date, confirm joining, return for correction, cancel), tabbed detail view
 * (Details | Documents | Verification | Readiness | Activity | Messages).
 * Uses live contracts:
 *   GET   /api/preboarding/brd/candidate/<id>
 *   PATCH /api/preboarding/brd/candidate/<id>            {action, ...}
 *   PATCH /api/preboarding/brd/documents                 {documentId, action, remarks}
 *   GET/PATCH /api/preboarding/brd/readiness             ?candidateId / {candidateId, ...}
 *   GET   /api/preboarding/brd/activity?candidateEmail=  audit timeline
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowLeft,
  FiBookOpen,
  FiBriefcase,
  FiCalendar,
  FiCheckCircle,
  FiCheckSquare,
  FiClock,
  FiCornerUpLeft,
  FiCreditCard,
  FiExternalLink,
  FiFileText,
  FiInfo,
  FiLock,
  FiMail,
  FiMapPin,
  FiMessageSquare,
  FiPhone,
  FiRefreshCw,
  FiSend,
  FiSquare,
  FiUser,
  FiUsers,
  FiXCircle,
} from 'react-icons/fi';

/* ── Auth helper (BRD pages read the per-tab token directly) ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface PortalPersonal {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  personalEmail?: string | null;
  mobileNumber?: string | null;
  alternateMobile?: string | null;
  nationality?: string | null;
  maritalStatus?: string | null;
}

interface PortalAddress {
  permanentAddressLine1?: string | null;
  permanentAddressLine2?: string | null;
  permanentCountry?: string | null;
  permanentState?: string | null;
  permanentCity?: string | null;
  permanentPincode?: string | null;
  currentSameAsPermanent?: boolean;
  currentAddressLine1?: string | null;
  currentAddressLine2?: string | null;
  currentCountry?: string | null;
  currentState?: string | null;
  currentCity?: string | null;
  currentPincode?: string | null;
}

interface PortalFamily {
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactMobile?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
  spouseName?: string | null;
}

interface PortalEducationRecord {
  qualification?: string | null;
  specialization?: string | null;
  institutionName?: string | null;
  universityBoard?: string | null;
  startYear?: string | null;
  endYear?: string | null;
  percentage?: string | null;
}

interface PortalPrevEmployment {
  companyName?: string | null;
  designation?: string | null;
  employmentType?: string | null;
  dateOfJoining?: string | null;
  lastWorkingDate?: string | null;
  totalExperience?: string | null;
  reasonForLeaving?: string | null;
}

interface PortalCurrentEmployment {
  currentlyEmployed?: boolean;
  currentCompany?: string | null;
  currentDesignation?: string | null;
  noticePeriod?: string | null;
  lastWorkingDate?: string | null;
}

interface PortalBank {
  accountHolderName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  confirmAccountNumber?: string | null;
  ifscCode?: string | null;
  branchName?: string | null;
  accountType?: string | null;
  panNumber?: string | null;
  uanNumber?: string | null;
  pfNumber?: string | null;
  esiNumber?: string | null;
}

interface PortalDetails {
  personal?: PortalPersonal;
  address?: PortalAddress;
  family?: PortalFamily;
  education?: {
    records?: PortalEducationRecord[];
    previousEmployment?: PortalPrevEmployment[];
    currentEmployment?: PortalCurrentEmployment;
  };
  bank?: PortalBank;
}

interface CandidateRecord {
  id: string;
  preboardingId?: string | null;
  candidateName?: string | null;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  designation?: string | null;
  reportingManager?: string | null;
  companyEmail?: string | null;
  employmentType?: string | null;
  workLocation?: string | null;
  workMode?: string | null;
  branch?: string | null;
  recruiter?: string | null;
  hrAssignedTo?: string | null;
  joiningDate?: string | null;
  offerStatus?: string | null;
  offerDate?: string | null;
  documentStatus?: string | null;
  verificationStatus?: string | null;
  joiningReadiness?: string | null;
  readinessPercent?: number | null;
  stage?: string | null;
  stageLabel?: string | null;
  onboardingStatus?: string | null;
  bgvStatus?: string | null;
  employeeId?: string | null;
  correctionNote?: string | null;
  portalSubmittedAt?: string | null;
  joiningConfirmed?: boolean | null;
  actualJoiningDate?: string | null;
  reportingTime?: string | null;
  reportingLocation?: string | null;
  portalDetails?: PortalDetails | null;
}

interface CandidateDoc {
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
}

interface ReadinessItem {
  requirement: string;
  responsibleRole: string;
  status: 'complete' | 'pending';
  source: string;
}

interface ReadinessDetail {
  items?: ReadinessItem[];
  completed?: number;
  percent?: number;
  canMarkReady?: boolean;
  mandatoryPending?: string[];
}

interface CandidateMessage {
  id: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

interface ActivityRecord {
  id: string;
  action: string;
  module: string;
  details: string;
  createdAt: string;
  userName?: string | null;
  userEmail?: string | null;
}

interface CandidatePayload {
  candidate: CandidateRecord;
  documents?: CandidateDoc[];
  readiness?: { items?: ReadinessItem[]; completed?: number; percent?: number };
  messages?: CandidateMessage[];
}

/* ── Modal state (single union keeps confirm-modals in sync) ── */
type ActionModal =
  | { kind: 'reminder' }
  | { kind: 'joining-date'; joiningDate: string; reason: string }
  | { kind: 'confirm-joining' }
  | { kind: 'correction'; note: string }
  | { kind: 'cancel'; reason: string }
  | { kind: 'doc-approve'; docId: string; label: string }
  | { kind: 'doc-reject'; docId: string; label: string; remarks: string }
  | { kind: 'doc-resubmit'; docId: string; label: string; remarks: string }
  | null;

type DetailsTab = 'details' | 'documents' | 'verification' | 'readiness' | 'activity' | 'messages';

/* ── Small shared pieces ── */
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

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

/* BRD 5.7 — sensitive masking: bank account shows last 4 only. */
function maskAccount(v?: string | null): string {
  if (!v) return '—';
  const clean = String(v).trim();
  if (clean.length <= 4) return `••••${clean}`;
  return `••••••${clean.slice(-4)}`;
}

/* BRD 5.7 — PAN: show first 3 and last character only. */
function maskPan(v?: string | null): string {
  if (!v) return '—';
  const clean = String(v).trim().toUpperCase();
  if (clean.length <= 4) return '••••••••';
  return `${clean.slice(0, 3)}${'•'.repeat(Math.max(4, clean.length - 4))}${clean.slice(-1)}`;
}

const STAGE_BADGE: Record<string, string> = {
  initiated: 'bg-slate-100 text-slate-600',
  details_pending: 'bg-amber-100 text-amber-700',
  verification: 'bg-violet-100 text-violet-700',
  ready_to_join: 'bg-teal-100 text-teal-700',
  joined: 'bg-emerald-100 text-emerald-700',
  did_not_join: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

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

function StageBadge({ stage, label }: { stage?: string | null; label?: string | null }) {
  const cls = STAGE_BADGE[stage || ''] || 'bg-slate-100 text-slate-600';
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>{label || (stage || 'unknown').replace(/_/g, ' ')}</span>;
}

function ReadinessRing({ percent }: { percent: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent || 0));
  const filled = (clamped / 100) * c;
  return (
    <div className="relative w-16 h-16 shrink-0" title={`Joining readiness: ${clamped}%`}>
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#0d9488"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">{clamped}%</span>
    </div>
  );
}

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
  tone: 'primary' | 'danger' | 'outline-danger';
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const btn =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : tone === 'outline-danger'
        ? 'border border-red-300 text-red-600 hover:bg-red-50'
        : 'bg-teal-600 hover:bg-teal-700 text-white';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100">
        <span className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">{icon}</span>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function FieldGrid({ fields }: { fields: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">{label}</dt>
          <dd className="text-sm text-slate-700 mt-0.5 break-words">{value === null || value === undefined || value === '' ? '—' : value}</dd>
        </div>
      ))}
    </dl>
  );
}

function NotSubmitted({ what }: { what: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400">
      <FiInfo className="w-4 h-4 shrink-0" />
      <span>{what} — not submitted yet.</span>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="text-center py-12">
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">{icon}</div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {subtitle ? <p className="text-xs text-slate-400 mt-1">{subtitle}</p> : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6" aria-label="Loading candidate details">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-56 bg-slate-200 rounded" />
            <div className="h-4 w-80 bg-slate-100 rounded" />
          </div>
          <div className="w-16 h-16 rounded-full bg-slate-100" />
        </div>
      </div>
      <div className="h-9 w-full max-w-xl bg-slate-100 rounded-lg animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 animate-pulse">
            <div className="h-4 w-40 bg-slate-200 rounded mb-4" />
            <div className="space-y-2.5">
              {[0, 1, 2].map((j) => (
                <div key={j} className="h-3.5 w-full bg-slate-100 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function PreboardingCandidateDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [data, setData] = useState<CandidatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [activeTab, setActiveTab] = useState<DetailsTab>('details');
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [busy, setBusy] = useState(false);

  const [readinessDetail, setReadinessDetail] = useState<ReadinessDetail | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);

  const [activities, setActivities] = useState<ActivityRecord[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const candidate = data?.candidate;

  /* ── Main load ── */
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/preboarding/brd/candidate/${encodeURIComponent(id)}`, { headers: getAuthHeaders() });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error || `Failed to load candidate (${res.status}).`);
        return;
      }
      const payload: CandidatePayload = await res.json();
      setData(payload);
    } catch {
      setLoadError('Network error — could not load candidate details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // queueMicrotask defers the setState-triggering fetch call out of the
    // synchronous effect body (avoids react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  /* ── Readiness detail (canMarkReady / mandatoryPending + fresh items) ── */
  const loadReadinessDetail = useCallback(async () => {
    if (!id) return;
    setReadinessLoading(true);
    try {
      const res = await fetch(`/api/preboarding/brd/readiness?candidateId=${encodeURIComponent(id)}`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const detail: ReadinessDetail = await res.json();
      setReadinessDetail(detail);
    } catch {
      /* keep contract (1) readiness as fallback */
    } finally {
      setReadinessLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // queueMicrotask defers the setState-triggering fetch call out of the
    // synchronous effect body (avoids react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (activeTab === 'readiness') void loadReadinessDetail();
    });
  }, [activeTab, loadReadinessDetail]);

  /* ── Activity audit trail (lazy) ── */
  const candidateEmail = candidate?.candidateEmail || '';
  const loadActivity = useCallback(async () => {
    if (!candidateEmail) return;
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/preboarding/brd/activity?candidateEmail=${encodeURIComponent(candidateEmail)}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        toast.error('Could not load activity timeline.');
        return;
      }
      const body = await res.json();
      setActivities(Array.isArray(body.activities) ? body.activities : []);
    } catch {
      toast.error('Could not load activity timeline.');
    } finally {
      setActivityLoading(false);
    }
  }, [candidateEmail]);

  useEffect(() => {
    // queueMicrotask defers the setState-triggering fetch call out of the
    // synchronous effect body (avoids react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (activeTab === 'activity' && activities === null && candidateEmail) void loadActivity();
    });
  }, [activeTab, activities, candidateEmail, loadActivity]);

  /* ── Candidate-level actions (contract 2) ── */
  const candidateAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}): Promise<boolean> => {
      try {
        const res = await fetch(`/api/preboarding/brd/candidate/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ action, ...extra }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error || 'Action failed.');
          return false;
        }
        toast.success(body.message || 'Action completed.');
        await load();
        return true;
      } catch {
        toast.error('Network error — action failed.');
        return false;
      }
    },
    [id, load],
  );

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

  /* ── Readiness toggles (manual items) ── */
  const toggleRequirement = useCallback(
    async (requirement: string, status: 'complete' | 'pending') => {
      try {
        const res = await fetch('/api/preboarding/brd/readiness', {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ candidateId: id, requirement, status }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error || 'Could not update the readiness item.');
          return;
        }
        toast.success(body.message || `Requirement marked ${status}.`);
        await Promise.all([loadReadinessDetail(), load()]);
      } catch {
        toast.error('Network error — could not update readiness.');
      }
    },
    [id, load, loadReadinessDetail],
  );

  const markReadyToJoin = useCallback(async () => {
    setMarkingReady(true);
    try {
      const res = await fetch('/api/preboarding/brd/readiness', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ candidateId: id, action: 'mark-ready-to-join' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Cannot mark Ready to Join.', { duration: 6000 });
        await Promise.all([loadReadinessDetail(), load()]);
        return;
      }
      toast.success(body.message || 'Candidate marked Ready to Join.');
      await load();
    } catch {
      toast.error('Network error — could not mark Ready to Join.');
    } finally {
      setMarkingReady(false);
    }
  }, [id, load, loadReadinessDetail]);

  /* ── Confirm-modal dispatch ── */
  const handleModalConfirm = useCallback(async () => {
    const modal = actionModal;
    if (!modal) return;
    if (modal.kind === 'joining-date') {
      if (!modal.joiningDate) {
        toast.error('Please select the new joining date.');
        return;
      }
      if (!modal.reason.trim()) {
        toast.error('A reason is required when changing the joining date (BRD 5.2 D.7).');
        return;
      }
      setBusy(true);
      const ok = await candidateAction('update-joining-date', { joiningDate: modal.joiningDate, reason: modal.reason.trim() });
      setBusy(false);
      if (ok) setActionModal(null);
      return;
    }
    if (modal.kind === 'cancel') {
      if (!modal.reason.trim()) {
        toast.error('A cancellation reason is mandatory (BRD 5.2 C).');
        return;
      }
      setBusy(true);
      const ok = await candidateAction('cancel', { reason: modal.reason.trim() });
      setBusy(false);
      if (ok) setActionModal(null);
      return;
    }
    if (modal.kind === 'correction') {
      if (!modal.note.trim()) {
        toast.error('A correction note is required.');
        return;
      }
      setBusy(true);
      const ok = await candidateAction('return-for-correction', { note: modal.note.trim() });
      setBusy(false);
      if (ok) setActionModal(null);
      return;
    }
    if (modal.kind === 'doc-approve') {
      setBusy(true);
      const ok = await docAction(modal.docId, 'approve', '');
      setBusy(false);
      if (ok) setActionModal(null);
      return;
    }
    if (modal.kind === 'doc-reject') {
      if (!modal.remarks.trim()) {
        toast.error('Rejection remarks are mandatory (BRD 5.8 F).');
        return;
      }
      setBusy(true);
      const ok = await docAction(modal.docId, 'reject', modal.remarks.trim());
      setBusy(false);
      if (ok) setActionModal(null);
      return;
    }
    if (modal.kind === 'doc-resubmit') {
      if (!modal.remarks.trim()) {
        toast.error('Please describe what the candidate must correct.');
        return;
      }
      setBusy(true);
      const ok = await docAction(modal.docId, 'request_resubmission', modal.remarks.trim());
      setBusy(false);
      if (ok) setActionModal(null);
      return;
    }
    // reminder / confirm-joining — no fields
    setBusy(true);
    const ok = await candidateAction(modal.kind === 'confirm-joining' ? 'confirm-joining' : 'send-reminder');
    setBusy(false);
    if (ok) setActionModal(null);
  }, [actionModal, candidateAction, docAction]);

  /* ── States ── */
  if (!id || notFound) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <FiAlertTriangle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-700">Candidate not found</h2>
          <p className="text-sm text-slate-400 mt-1">This preboarding record does not exist or has been removed.</p>
          <Link href="/preboarding" className="mt-5 inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg">
            <FiArrowLeft className="w-4 h-4" /> Back to Preboarding
          </Link>
        </div>
      </div>
    );
  }

  if (loading && !data) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6"><Skeleton /></div>;

  if (loadError && !data) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <FiAlertTriangle className="w-10 h-10 text-red-300 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-700">Something went wrong</h2>
          <p className="text-sm text-slate-400 mt-1">{loadError}</p>
          <button
            onClick={() => void load()}
            className="mt-5 inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
          >
            <FiRefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!candidate) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6"><Skeleton /></div>;

  const documents: CandidateDoc[] = data?.documents || [];
  const messages: CandidateMessage[] = data?.messages || [];
  const readinessItems: ReadinessItem[] =
    readinessDetail?.items && readinessDetail.items.length > 0
      ? readinessDetail.items
      : data?.readiness?.items || [];
  const readinessPercent = readinessDetail?.percent ?? data?.readiness?.percent ?? candidate.readinessPercent ?? 0;
  const canMarkReady = readinessDetail?.canMarkReady;
  const mandatoryPending = readinessDetail?.mandatoryPending || [];
  const portal = candidate.portalDetails || {};

  const initials = (candidate.candidateName || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const stage = candidate.stage || 'initiated';
  const isJoined = stage === 'joined';
  const personal = portal.personal;
  const address = portal.address;
  const family = portal.family;
  const education = portal.education;
  const bank = portal.bank;

  const permanentAddress = address
    ? [
        address.permanentAddressLine1,
        address.permanentAddressLine2,
        address.permanentCity,
        address.permanentState,
        address.permanentPincode,
        address.permanentCountry,
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  const currentAddress = address
    ? [
        address.currentAddressLine1,
        address.currentAddressLine2,
        address.currentCity,
        address.currentState,
        address.currentPincode,
        address.currentCountry,
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  const verificationQueue = documents.filter((d) => ['pending', 'submitted', 'resubmission_requested'].includes(d.status));

  const TABS: { key: DetailsTab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'documents', label: 'Documents' },
    { key: 'verification', label: 'Verification' },
    { key: 'readiness', label: 'Readiness' },
    { key: 'activity', label: 'Activity' },
    { key: 'messages', label: 'Messages' },
  ];

  /* ── Documents table (shared by Documents & Verification tabs) ── */
  const renderDocTable = (docs: CandidateDoc[]) => {
    if (docs.length === 0) {
      return <EmptyState icon={<FiFileText className="w-6 h-6" />} title="No documents in this queue" subtitle="Documents the candidate uploads will appear here." />;
    }
    return (
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Document</th>
              <th className="text-left px-4 py-3 font-medium">Uploaded</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.map((doc) => (
              <tr key={doc.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3.5">
                  <p className="font-medium text-slate-800">{doc.documentLabel || doc.documentType}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{doc.documentType}</p>
                </td>
                <td className="px-4 py-3.5">
                  <p className="text-slate-700">{fmtDate(doc.uploadedAt)}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]" title={doc.fileName || undefined}>
                    {doc.fileName ? `${doc.fileName}${doc.fileSize ? ` · ${fmtSize(doc.fileSize)}` : ''}` : 'No file'}
                  </p>
                </td>
                <td className="px-4 py-3.5">
                  <StatusChip status={doc.status} />
                  {doc.reviewNotes ? <p className="text-xs text-slate-500 mt-1 max-w-[220px]">“{doc.reviewNotes}”</p> : null}
                </td>
                <td className="px-4 py-3.5 text-right">
                  {doc.status === 'approved' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <FiLock className="w-3.5 h-3.5" /> Approved — locked
                    </span>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                      {doc.fileUrl ? (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                          title="View file"
                        >
                          <FiExternalLink className="w-3.5 h-3.5" /> View
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400 px-2 py-1.5" title="No file uploaded yet">
                          <FiInfo className="w-3.5 h-3.5" /> No file
                        </span>
                      )}
                      <button
                        onClick={() => setActionModal({ kind: 'doc-approve', docId: doc.id, label: doc.documentLabel })}
                        className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      >
                        <FiCheckCircle className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => setActionModal({ kind: 'doc-reject', docId: doc.id, label: doc.documentLabel, remarks: '' })}
                        className="inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      >
                        <FiXCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                      <button
                        onClick={() => setActionModal({ kind: 'doc-resubmit', docId: doc.id, label: doc.documentLabel, remarks: '' })}
                        className="inline-flex items-center gap-1 border border-orange-300 text-orange-600 hover:bg-orange-50 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      >
                        <FiCornerUpLeft className="w-3.5 h-3.5" /> Resubmission
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ── Header card ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="w-16 h-16 rounded-full bg-teal-600 text-white flex items-center justify-center text-xl font-bold shrink-0" aria-hidden="true">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg font-bold text-slate-800 truncate">{candidate.candidateName || 'Unnamed candidate'}</h1>
                {candidate.preboardingId ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 font-mono">{candidate.preboardingId}</span>
                ) : null}
                <StageBadge stage={stage} label={candidate.stageLabel} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
                {candidate.candidateEmail ? (
                  <span className="inline-flex items-center gap-1.5"><FiMail className="w-3.5 h-3.5 text-slate-400" /> {candidate.candidateEmail}</span>
                ) : null}
                {candidate.candidatePhone ? (
                  <span className="inline-flex items-center gap-1.5"><FiPhone className="w-3.5 h-3.5 text-slate-400" /> {candidate.candidatePhone}</span>
                ) : null}
              </div>
              <p className="text-sm text-slate-600 mt-1.5">
                {[candidate.jobTitle, candidate.department, candidate.designation].filter(Boolean).join(' • ') || '—'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><FiCalendar className="w-3.5 h-3.5 text-slate-400" /> Joining: {fmtDate(candidate.joiningDate)}</span>
                {candidate.bgvStatus ? <span className="inline-flex items-center gap-1.5"><FiInfo className="w-3.5 h-3.5 text-slate-400" /> BGV: {candidate.bgvStatus}</span> : null}
                {candidate.employeeId ? <span className="inline-flex items-center gap-1.5"><FiUser className="w-3.5 h-3.5 text-slate-400" /> Employee ID: {candidate.employeeId}</span> : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-4">
            <ReadinessRing percent={readinessPercent} />
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setActionModal({ kind: 'reminder' })}
                className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg"
              >
                <FiSend className="w-4 h-4" /> Send Reminder
              </button>
              <button
                onClick={() => setActionModal({ kind: 'joining-date', joiningDate: (candidate.joiningDate || '').slice(0, 10), reason: '' })}
                className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg"
              >
                <FiCalendar className="w-4 h-4" /> Update Joining Date
              </button>
              <button
                onClick={() => setActionModal({ kind: 'confirm-joining' })}
                disabled={Boolean(candidate.joiningConfirmed)}
                title={candidate.joiningConfirmed ? 'Joining already confirmed' : 'Confirm the candidate has joined'}
                className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg disabled:opacity-60 disabled:hover:bg-teal-600"
              >
                <FiCheckCircle className="w-4 h-4" /> Confirm Joining
              </button>
              <button
                onClick={() => setActionModal({ kind: 'correction', note: '' })}
                className="inline-flex items-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium px-3.5 py-2 rounded-lg"
              >
                <FiCornerUpLeft className="w-4 h-4" /> Return for Correction
              </button>
              {!isJoined ? (
                <button
                  onClick={() => setActionModal({ kind: 'cancel', reason: '' })}
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
                >
                  <FiXCircle className="w-4 h-4" /> Cancel Preboarding
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {candidate.correctionNote ? (
          <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <FiAlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">Returned for correction</p>
              <p className="text-amber-700 mt-0.5">{candidate.correctionNote}</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Tab bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex overflow-x-auto border-b border-slate-100 px-2" role="tablist" aria-label="Candidate detail tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key ? 'text-teal-700 border-teal-600' : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* ═══ DETAILS TAB ═══ */}
          {activeTab === 'details' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SectionCard title="Employment & Offer" icon={<FiBriefcase className="w-4 h-4" />}>
                <FieldGrid
                  fields={[
                    ['Job Title', candidate.jobTitle || '—'],
                    ['Department', candidate.department || '—'],
                    ['Designation', candidate.designation || '—'],
                    ['Reporting Manager', candidate.reportingManager || '—'],
                    ['Employment Type', candidate.employmentType || '—'],
                    ['Work Location', candidate.workLocation || '—'],
                    ['Work Mode', candidate.workMode || '—'],
                    ['Branch', candidate.branch || '—'],
                    ['Company Email', candidate.companyEmail || '—'],
                    ['Offer Date', fmtDate(candidate.offerDate)],
                    ['Joining Date', fmtDate(candidate.joiningDate)],
                    ['BGV Status', candidate.bgvStatus ? <span key="bgv" className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">{candidate.bgvStatus}</span> : '—'],
                    ...(candidate.employeeId ? ([['Employee ID', candidate.employeeId]] as [string, React.ReactNode][]) : []),
                  ]}
                />
              </SectionCard>

              <SectionCard title="Personal Information" icon={<FiUser className="w-4 h-4" />}>
                {personal ? (
                  <FieldGrid
                    fields={[
                      ['Full Name', [personal.firstName, personal.middleName, personal.lastName].filter(Boolean).join(' ')],
                      ['Date of Birth', fmtDate(personal.dateOfBirth)],
                      ['Gender', personal.gender || '—'],
                      ['Personal Email', personal.personalEmail || '—'],
                      ['Mobile Number', personal.mobileNumber || '—'],
                      ['Alternate Mobile', personal.alternateMobile || '—'],
                      ['Nationality', personal.nationality || '—'],
                      ['Marital Status', personal.maritalStatus || '—'],
                    ]}
                  />
                ) : (
                  <NotSubmitted what="Personal information" />
                )}
              </SectionCard>

              <SectionCard title="Address" icon={<FiMapPin className="w-4 h-4" />}>
                {address ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium mb-1">Permanent Address</p>
                      <p className="text-sm text-slate-700">{permanentAddress || '—'}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">Current Address</p>
                        {address.currentSameAsPermanent ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">Same as permanent</span>
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-700">{address.currentSameAsPermanent ? permanentAddress || '—' : currentAddress || '—'}</p>
                    </div>
                  </div>
                ) : (
                  <NotSubmitted what="Address details" />
                )}
              </SectionCard>

              <SectionCard title="Family & Emergency Contact" icon={<FiUsers className="w-4 h-4" />}>
                {family ? (
                  <FieldGrid
                    fields={[
                      ['Emergency Contact', family.emergencyContactName || '—'],
                      ['Relationship', family.emergencyContactRelation || '—'],
                      ['Emergency Mobile', family.emergencyContactMobile || '—'],
                      ['Father\u2019s Name', family.fatherName || '—'],
                      ['Mother\u2019s Name', family.motherName || '—'],
                      ['Spouse Name', family.spouseName || '—'],
                    ]}
                  />
                ) : (
                  <NotSubmitted what="Family details" />
                )}
              </SectionCard>

              <SectionCard title="Education" icon={<FiBookOpen className="w-4 h-4" />}>
                {education?.records && education.records.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-[560px] w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Qualification</th>
                          <th className="text-left px-3 py-2 font-medium">Institution</th>
                          <th className="text-left px-3 py-2 font-medium">Years</th>
                          <th className="text-left px-3 py-2 font-medium">Percentage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {education.records.map((rec, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2.5 text-slate-700">
                              <p className="font-medium">{rec.qualification || '—'}</p>
                              {rec.specialization ? <p className="text-xs text-slate-400">{rec.specialization}</p> : null}
                              {rec.universityBoard ? <p className="text-xs text-slate-400">{rec.universityBoard}</p> : null}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">{rec.institutionName || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{[rec.startYear, rec.endYear].filter(Boolean).join(' – ') || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-600">{rec.percentage || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <NotSubmitted what="Education records" />
                )}
              </SectionCard>

              <SectionCard title="Previous Employment" icon={<FiBriefcase className="w-4 h-4" />}>
                {education?.previousEmployment && education.previousEmployment.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-[640px] w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Company</th>
                          <th className="text-left px-3 py-2 font-medium">Designation</th>
                          <th className="text-left px-3 py-2 font-medium">Tenure</th>
                          <th className="text-left px-3 py-2 font-medium">Reason for Leaving</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {education.previousEmployment.map((rec, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2.5 text-slate-700">
                              <p className="font-medium">{rec.companyName || '—'}</p>
                              {rec.employmentType ? <p className="text-xs text-slate-400">{rec.employmentType}</p> : null}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">{rec.designation || '—'}</td>
                            <td className="px-3 py-2.5 text-slate-600">
                              <p className="whitespace-nowrap">{[rec.dateOfJoining, rec.lastWorkingDate].map((d) => (d ? fmtDate(d) : '—')).join(' – ')}</p>
                              {rec.totalExperience ? <p className="text-xs text-slate-400">{rec.totalExperience} total</p> : null}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">{rec.reasonForLeaving || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <NotSubmitted what="Previous employment history" />
                )}
              </SectionCard>

              <SectionCard title="Current Employment" icon={<FiBriefcase className="w-4 h-4" />}>
                {education?.currentEmployment ? (
                  <FieldGrid
                    fields={[
                      [
                        'Currently Employed',
                        <span
                          key="cur"
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            education.currentEmployment.currentlyEmployed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {education.currentEmployment.currentlyEmployed ? 'Yes' : 'No'}
                        </span>,
                      ],
                      ['Current Company', education.currentEmployment.currentCompany || '—'],
                      ['Current Designation', education.currentEmployment.currentDesignation || '—'],
                      ['Notice Period', education.currentEmployment.noticePeriod || '—'],
                      ['Last Working Date', fmtDate(education.currentEmployment.lastWorkingDate)],
                    ]}
                  />
                ) : (
                  <NotSubmitted what="Current employment details" />
                )}
              </SectionCard>

              <SectionCard title="Bank & Statutory" icon={<FiCreditCard className="w-4 h-4" />}>
                {bank ? (
                  <FieldGrid
                    fields={[
                      ['Account Holder', bank.accountHolderName || '—'],
                      ['Bank Name', bank.bankName || '—'],
                      ['Account Number', maskAccount(bank.accountNumber)],
                      ['IFSC Code', bank.ifscCode || '—'],
                      ['Branch', bank.branchName || '—'],
                      ['Account Type', bank.accountType || '—'],
                      ['PAN', maskPan(bank.panNumber)],
                      ['UAN Number', bank.uanNumber || '—'],
                      ['PF Number', bank.pfNumber || '—'],
                      ['ESI Number', bank.esiNumber || '—'],
                    ]}
                  />
                ) : (
                  <NotSubmitted what="Bank & statutory details" />
                )}
              </SectionCard>
            </div>
          ) : null}

          {/* ═══ DOCUMENTS TAB ═══ */}
          {activeTab === 'documents' ? <div>{renderDocTable(documents)}</div> : null}

          {/* ═══ VERIFICATION TAB ═══ */}
          {activeTab === 'verification' ? (
            <div>
              <p className="text-sm text-slate-500 mb-4">
                Focused verification queue — documents awaiting review. Approved documents are locked and remain visible under the Documents tab.
              </p>
              {renderDocTable(verificationQueue)}
            </div>
          ) : null}

          {/* ═══ READINESS TAB ═══ */}
          {activeTab === 'readiness' ? (
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <p className="text-3xl font-bold text-slate-800">{Math.max(0, Math.min(100, readinessPercent))}%</p>
                    <p className="text-xs text-slate-400 mt-0.5">Joining readiness</p>
                    <div className="mt-3 h-2.5 w-full max-w-md bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, readinessPercent))}%` }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {readinessDetail?.completed ?? data?.readiness?.completed ?? 0} of {readinessItems.length} requirements complete
                    </p>
                  </div>
                  <span
                    title={
                      canMarkReady === false
                        ? `Cannot mark Ready to Join — mandatory items incomplete: ${mandatoryPending.join(', ')}`
                        : 'Mark the candidate Ready to Join (BRD 5.10)'
                    }
                  >
                    <button
                      onClick={() => void markReadyToJoin()}
                      disabled={markingReady || readinessLoading || canMarkReady === false}
                      className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg disabled:opacity-60 disabled:hover:bg-teal-600"
                    >
                      <FiCheckCircle className="w-4 h-4" /> {markingReady ? 'Marking…' : 'Mark Ready to Join'}
                    </button>
                  </span>
                </div>
                {canMarkReady === false && mandatoryPending.length > 0 ? (
                  <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
                    <FiAlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700">
                      Mandatory items incomplete: {mandatoryPending.join(', ')} — the candidate must not be marked Ready to Join (BRD 5.9).
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                {readinessItems.length === 0 ? (
                  <EmptyState icon={<FiCheckSquare className="w-6 h-6" />} title="No readiness requirements yet" subtitle="The checklist appears once joining details are configured." />
                ) : (
                  readinessItems.map((item) => (
                    <div key={item.requirement} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {item.status === 'complete' ? (
                          <FiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                        ) : (
                          <FiClock className="w-5 h-5 text-amber-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{item.requirement}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Responsible: {item.responsibleRole || 'HR'}
                            {item.source === 'manual' ? ' · manual' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.status === 'complete' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.status === 'complete' ? 'Complete' : 'Pending'}
                        </span>
                        {item.source === 'manual' ? (
                          item.status === 'complete' ? (
                            <button
                              onClick={() => void toggleRequirement(item.requirement, 'pending')}
                              className="inline-flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                            >
                              <FiSquare className="w-3.5 h-3.5" /> Mark Pending
                            </button>
                          ) : (
                            <button
                              onClick={() => void toggleRequirement(item.requirement, 'complete')}
                              className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg"
                            >
                              <FiCheckSquare className="w-3.5 h-3.5" /> Mark Complete
                            </button>
                          )
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {/* ═══ ACTIVITY TAB ═══ */}
          {activeTab === 'activity' ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              {activityLoading ? (
                <div className="space-y-3" aria-label="Loading activity">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : activities === null ? (
                <EmptyState icon={<FiActivity className="w-6 h-6" />} title="Activity unavailable" subtitle="Could not load the audit trail." />
              ) : activities.length === 0 ? (
                <EmptyState icon={<FiActivity className="w-6 h-6" />} title="No activity yet" subtitle="Preboarding actions will be recorded here." />
              ) : (
                <ol className="relative border-l-2 border-slate-100 ml-3 space-y-5">
                  {activities.map((a) => (
                    <li key={a.id} className="ml-5">
                      <span className="absolute -left-[11px] w-5 h-5 rounded-full bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center">
                        <FiActivity className="w-3 h-3" />
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{a.action}</span>
                        <span className="text-[11px] text-slate-400">{a.module}</span>
                        <span className="text-[11px] text-slate-400">· {timeAgo(a.createdAt)}</span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1 break-words">{a.details}</p>
                      {a.userName ? <p className="text-xs text-slate-400 mt-0.5">by {a.userName}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {/* ═══ MESSAGES TAB ═══ */}
          {activeTab === 'messages' ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              {messages.length === 0 ? (
                <EmptyState icon={<FiMessageSquare className="w-6 h-6" />} title="No messages" subtitle="Communication with the candidate will appear here." />
              ) : (
                <ul className="space-y-3 max-h-96 overflow-y-auto">
                  {messages.map((m) => (
                    <li key={m.id} className="flex items-start gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          m.senderRole === 'candidate' ? 'bg-violet-100 text-violet-600' : 'bg-teal-100 text-teal-700'
                        }`}
                      >
                        <FiMessageSquare className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              m.senderRole === 'candidate' ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700'
                            }`}
                          >
                            {(m.senderRole || 'system').replace(/_/g, ' ')}
                          </span>
                          <span className="text-[11px] text-slate-400">{fmtDate(m.createdAt)} · {timeAgo(m.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-700 mt-1 break-words">{m.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Confirm modals ── */}
      {actionModal?.kind === 'reminder' ? (
        <ConfirmModal
          title="Send Reminder"
          tone="primary"
          confirmLabel="Send Reminder"
          busy={busy}
          onClose={() => setActionModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <p className="text-sm text-slate-500">
            A reminder email will be sent to <span className="font-medium text-slate-700">{candidate.candidateEmail || 'the candidate'}</span> to complete pending preboarding steps.
          </p>
        </ConfirmModal>
      ) : null}

      {actionModal?.kind === 'joining-date' ? (
        <ConfirmModal
          title="Update Joining Date"
          tone="primary"
          confirmLabel="Update Joining Date"
          busy={busy}
          onClose={() => setActionModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <label className="block text-xs font-medium text-slate-500 mb-1 mt-2" htmlFor="jd-new">New joining date *</label>
          <input
            id="jd-new"
            type="date"
            value={actionModal.joiningDate}
            onChange={(e) => setActionModal({ ...actionModal, joiningDate: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
          <label className="block text-xs font-medium text-slate-500 mb-1 mt-3" htmlFor="jd-reason">Reason for change *</label>
          <textarea
            id="jd-reason"
            rows={3}
            value={actionModal.reason}
            onChange={(e) => setActionModal({ ...actionModal, reason: e.target.value })}
            placeholder="Explain why the joining date is changing (BRD 5.2 D.7)"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        </ConfirmModal>
      ) : null}

      {actionModal?.kind === 'confirm-joining' ? (
        <ConfirmModal
          title="Confirm Joining"
          tone="primary"
          confirmLabel="Confirm Joining"
          busy={busy}
          onClose={() => setActionModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <p className="text-sm text-slate-500">
            Confirm that <span className="font-medium text-slate-700">{candidate.candidateName}</span> has actually joined on{' '}
            <span className="font-medium text-slate-700">{fmtDate(candidate.joiningDate)}</span>. The preboarding stage will move to{' '}
            <span className="font-medium text-slate-700">Joined</span>.
          </p>
          {candidate.reportingTime || candidate.reportingLocation ? (
            <p className="text-xs text-slate-400 mt-2">
              Reporting: {[candidate.reportingTime, candidate.reportingLocation].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </ConfirmModal>
      ) : null}

      {actionModal?.kind === 'correction' ? (
        <ConfirmModal
          title="Return for Correction"
          tone="outline-danger"
          confirmLabel="Return for Correction"
          busy={busy}
          onClose={() => setActionModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <p className="text-sm text-slate-500 mt-1">
            The candidate will be asked to review and re-submit their preboarding details.
          </p>
          <label className="block text-xs font-medium text-slate-500 mb-1 mt-3" htmlFor="corr-note">Correction note *</label>
          <textarea
            id="corr-note"
            rows={4}
            value={actionModal.note}
            onChange={(e) => setActionModal({ ...actionModal, note: e.target.value })}
            placeholder="Describe exactly what the candidate must correct…"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        </ConfirmModal>
      ) : null}

      {actionModal?.kind === 'cancel' ? (
        <ConfirmModal
          title="Cancel Preboarding"
          tone="danger"
          confirmLabel="Cancel Preboarding"
          busy={busy}
          onClose={() => setActionModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <p className="text-sm text-slate-500 mt-1">
            This will move <span className="font-medium text-slate-700">{candidate.candidateName}</span> to the Cancelled stage. This does not delete the record.
          </p>
          <label className="block text-xs font-medium text-slate-500 mb-1 mt-3" htmlFor="cancel-reason">Cancellation reason *</label>
          <textarea
            id="cancel-reason"
            rows={3}
            value={actionModal.reason}
            onChange={(e) => setActionModal({ ...actionModal, reason: e.target.value })}
            placeholder="A reason is mandatory (BRD 5.2 C)"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        </ConfirmModal>
      ) : null}

      {actionModal?.kind === 'doc-approve' ? (
        <ConfirmModal
          title="Approve Document"
          tone="primary"
          confirmLabel="Approve"
          busy={busy}
          onClose={() => setActionModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <p className="text-sm text-slate-500 mt-1">
            Approve <span className="font-medium text-slate-700">{actionModal.label}</span> for verification? Approved documents are locked and cannot be re-reviewed.
          </p>
        </ConfirmModal>
      ) : null}

      {actionModal?.kind === 'doc-reject' ? (
        <ConfirmModal
          title="Reject Document"
          tone="danger"
          confirmLabel="Reject Document"
          busy={busy}
          onClose={() => setActionModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <p className="text-sm text-slate-500 mt-1">
            Reject <span className="font-medium text-slate-700">{actionModal.label}</span>? Rejection remarks are mandatory and visible to the candidate.
          </p>
          <label className="block text-xs font-medium text-slate-500 mb-1 mt-3" htmlFor="rej-remarks">Rejection remarks *</label>
          <textarea
            id="rej-remarks"
            rows={3}
            value={actionModal.remarks}
            onChange={(e) => setActionModal({ ...actionModal, remarks: e.target.value })}
            placeholder="State the reason for rejection (BRD 5.8 F)"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        </ConfirmModal>
      ) : null}

      {actionModal?.kind === 'doc-resubmit' ? (
        <ConfirmModal
          title="Request Resubmission"
          tone="primary"
          confirmLabel="Request Resubmission"
          busy={busy}
          onClose={() => setActionModal(null)}
          onConfirm={() => void handleModalConfirm()}
        >
          <p className="text-sm text-slate-500 mt-1">
            Ask the candidate to re-upload <span className="font-medium text-slate-700">{actionModal.label}</span>. Describe what must be corrected.
          </p>
          <label className="block text-xs font-medium text-slate-500 mb-1 mt-3" htmlFor="rs-remarks">What must be corrected? *</label>
          <textarea
            id="rs-remarks"
            rows={3}
            value={actionModal.remarks}
            onChange={(e) => setActionModal({ ...actionModal, remarks: e.target.value })}
            placeholder="e.g. Document is blurry — please re-upload a clear scan"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        </ConfirmModal>
      ) : null}
    </div>
  );
}
