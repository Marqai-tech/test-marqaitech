'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  FiRefreshCw, FiSearch, FiMoreVertical, FiEye, FiBell, FiCalendar,
  FiCheckSquare, FiRotateCcw, FiXCircle, FiUsers, FiFileText, FiCheckCircle,
  FiClock, FiUserPlus, FiX, FiAlertCircle, FiLoader, FiChevronLeft,
  FiChevronRight, FiFilter, FiUserCheck,
} from 'react-icons/fi';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface PreboardingDocument {
  id: string;
  documentType: string | null;
  documentLabel: string | null;
  status: string;
  reviewNotes: string | null;
  uploadedAt: string | null;
  fileName: string | null;
}

interface PreboardingCandidate {
  id: string;
  preboardingId: string | null;
  candidateId: string | null;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string | null;
  department: string | null;
  companyEmail: string | null;
  recruiter: string | null;
  hrAssignedTo: string | null;
  joiningDate: string | null;
  employmentType: string | null;
  company: string | null;
  branch: string | null;
  offerStatus: string;
  documentStatus: string;
  verificationStatus: string;
  joiningReadiness: string;
  readinessPercent: number;
  stage: string;
  stageLabel: string;
  joiningConfirmed: boolean;
  documents: PreboardingDocument[];
  createdAt: string;
}

interface PipelineMetrics {
  totalPreboarding: number;
  upcomingJoiners: number;
  joiningThisWeek: number;
  documentsPending: number;
  verificationPending: number;
  documentsRejected: number;
  joiningReadinessPending: number;
  joiningConfirmed: number;
  joiningCompleted: number;
  didNotJoin: number;
  stageCounts: Record<string, number>;
}

interface PipelineResponse {
  candidates: PreboardingCandidate[];
  metrics: PipelineMetrics;
  total: number;
}

const PAGE_SIZE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'initiated', label: 'Initiated' },
  { value: 'details_pending', label: 'Details Pending' },
  { value: 'verification', label: 'Verification' },
  { value: 'ready_to_join', label: 'Ready to Join' },
  { value: 'joined', label: 'Joined' },
  { value: 'did_not_join', label: 'Did Not Join' },
  { value: 'cancelled', label: 'Cancelled' },
];

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function stageChipClass(stage: string): string {
  switch (stage) {
    case 'initiated': return 'bg-slate-100 text-slate-700';
    case 'details_pending': return 'bg-amber-50 text-amber-700';
    case 'verification': return 'bg-violet-50 text-violet-700';
    case 'ready_to_join': return 'bg-teal-50 text-teal-700';
    case 'joined': return 'bg-emerald-50 text-emerald-700';
    case 'did_not_join': return 'bg-red-50 text-red-700';
    case 'cancelled': return 'bg-slate-100 text-slate-500';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function verificationChipClass(status: string): string {
  switch (status) {
    case 'Verified': return 'bg-emerald-50 text-emerald-700';
    case 'In Review': return 'bg-violet-50 text-violet-700';
    case 'Rejected': return 'bg-red-50 text-red-700';
    default: return 'bg-amber-50 text-amber-700';
  }
}

// ─────────────────────────────────────────────────────────────
// Modal shells (plain JSX, no shadcn Dialog dependency)
// ─────────────────────────────────────────────────────────────

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function ModalShell({ title, onClose, children }: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main content (needs useSearchParams → rendered inside Suspense)
// ─────────────────────────────────────────────────────────────

function CandidatesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-derived initial filters (applied once at mount)
  const initialStage = searchParams.get('stage') || '';
  const initialSearch = searchParams.get('search') || '';
  const initialDepartment = searchParams.get('department') || '';
  const initialReadiness = searchParams.get('readiness') || '';
  const initialFilter = searchParams.get('filter') || '';
  const initialVerification = searchParams.get('verification') || '';
  const initialDateRange = searchParams.get('dateRange') || '';
  const initialRecruiter = searchParams.get('recruiter') || '';
  const initialCompany = searchParams.get('company') || '';
  const initialBranch = searchParams.get('branch') || '';
  const initialEmploymentType = searchParams.get('employmentType') || '';

  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // captured at fetch time so render-time derivations stay pure (no Date.now in render)
  const [nowMs, setNowMs] = useState(0);

  // Filters
  const [search, setSearch] = useState(initialSearch);
  const [stage, setStage] = useState(initialStage);
  const [department, setDepartment] = useState(initialDepartment);
  const [jobTitle, setJobTitle] = useState('');
  const [dateRange, setDateRange] = useState(initialDateRange);
  const [recruiter, setRecruiter] = useState(initialRecruiter);
  const [company, setCompany] = useState(initialCompany);
  const [branch, setBranch] = useState(initialBranch);
  const [employmentType, setEmploymentType] = useState(initialEmploymentType);
  const [verification, setVerification] = useState(initialVerification);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [filter, setFilter] = useState(initialFilter); // documents_pending | verification_pending | remind
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [confirmedOnly, setConfirmedOnly] = useState(false);

  // Selection + menus + modals
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ candidate: PreboardingCandidate; top: number; left: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [dateModal, setDateModal] = useState<PreboardingCandidate | null>(null);
  const [dateValue, setDateValue] = useState('');
  const [dateReason, setDateReason] = useState('');
  const [correctionModal, setCorrectionModal] = useState<PreboardingCandidate | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [cancelModal, setCancelModal] = useState<PreboardingCandidate | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [assignModal, setAssignModal] = useState(false);
  const [assignHr, setAssignHr] = useState('');
  const [bulkCancelModal, setBulkCancelModal] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState('');
  const [page, setPage] = useState(1);

  // ─── Data fetching ───

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/preboarding/brd/pipeline', { headers: getAuthHeaders() });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as PipelineResponse;
      setNowMs(Date.now());
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preboarding candidates');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // queueMicrotask defers the setState-triggering fetch call out of the
    // synchronous effect body (avoids react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      fetchData();
    });
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // ─── Distinct option values ───

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const jobTitles = useMemo(
    () => Array.from(new Set(candidates.map(c => c.jobTitle).filter((j): j is string => Boolean(j)))).sort(),
    [candidates],
  );
  const departments = useMemo(
    () => Array.from(new Set(candidates.map(c => c.department).filter((d): d is string => Boolean(d)))).sort(),
    [candidates],
  );
  const recruiters = useMemo(
    () => Array.from(new Set(candidates.map(c => c.recruiter).filter((r): r is string => Boolean(r)))).sort(),
    [candidates],
  );
  const companies = useMemo(
    () => Array.from(new Set(candidates.map(c => c.company).filter((x): x is string => Boolean(x)))).sort(),
    [candidates],
  );
  const branchNames = useMemo(
    () => Array.from(new Set(candidates.map(c => c.branch).filter((x): x is string => Boolean(x)))).sort(),
    [candidates],
  );
  const employmentTypes = useMemo(
    () => Array.from(new Set(candidates.map(c => c.employmentType).filter((x): x is string => Boolean(x)))).sort(),
    [candidates],
  );

  // ─── Client-side filtering ───

  const filtered = useMemo(() => {
    const now = nowMs; // timestamp captured at fetch time, not during render
    let rows = candidates;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(c =>
        [c.candidateName, c.candidateEmail, c.preboardingId].some(v => String(v || '').toLowerCase().includes(q)));
    }
    if (jobTitle) rows = rows.filter(c => c.jobTitle === jobTitle);
    if (department) rows = rows.filter(c => c.department === department);
    if (recruiter) rows = rows.filter(c => c.recruiter === recruiter);
    if (company) rows = rows.filter(c => c.company === company);
    if (branch) rows = rows.filter(c => c.branch === branch);
    if (employmentType) rows = rows.filter(c => c.employmentType === employmentType);
    if (stage) rows = rows.filter(c => c.stage === stage);
    if (verification) rows = rows.filter(c => c.verificationStatus === verification);
    if (readiness) rows = rows.filter(c => c.joiningReadiness === readiness);
    if (dateRange === 'this_week') {
      rows = rows.filter(c => c.joiningDate && new Date(c.joiningDate).getTime() > now && new Date(c.joiningDate).getTime() - now <= 7 * DAY_MS);
    } else if (dateRange === 'this_month') {
      rows = rows.filter(c => {
        if (!c.joiningDate) return false;
        const d = new Date(c.joiningDate);
        const n = new Date();
        return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
      });
    } else if (dateRange === 'overdue') {
      rows = rows.filter(c => c.joiningDate && new Date(c.joiningDate).getTime() < now && !['joined', 'did_not_join', 'cancelled'].includes(c.stage));
    }
    if (filter === 'documents_pending') rows = rows.filter(c => c.documentStatus === 'Pending');
    else if (filter === 'verification_pending') rows = rows.filter(c => c.verificationStatus === 'In Review');
    else if (filter === 'remind') rows = rows.filter(c => (c.documents || []).some(d => d.status === 'pending' || d.status === 'rejected'));
    if (upcomingOnly) {
      rows = rows.filter(c => c.joiningDate && new Date(c.joiningDate).getTime() > now && !['joined', 'did_not_join', 'cancelled'].includes(c.stage));
    }
    if (confirmedOnly) rows = rows.filter(c => c.joiningConfirmed);
    return rows;
  }, [candidates, nowMs, search, jobTitle, department, recruiter, stage, verification, readiness, dateRange, filter, upcomingOnly, confirmedOnly, company, branch, employmentType]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  const resetPage = () => setPage(1);

  const clearFilters = () => {
    setSearch(''); setStage(''); setDepartment(''); setJobTitle('');
    setDateRange(''); setRecruiter(''); setVerification(''); setReadiness('');
    setCompany(''); setBranch(''); setEmploymentType('');
    setFilter(''); setUpcomingOnly(false); setConfirmedOnly(false);
    resetPage();
  };

  const activeFilterCount = [search, stage, department, jobTitle, dateRange, recruiter, verification, readiness, filter].filter(Boolean).length + (upcomingOnly ? 1 : 0) + (confirmedOnly ? 1 : 0);

  // ─── Selection ───

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const ids = paged.map(c => c.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  // ─── Row actions ───

  const runAction = useCallback(async (id: string, body: Record<string, unknown>, successMsg: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/preboarding/brd/candidate/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error || `Request failed (${res.status})`);
      }
      toast.success(successMsg);
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }, [fetchData]);

  const runBulk = useCallback(async (ids: string[], bodyOf: (id: string) => Record<string, unknown>, successMsg: string) => {
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/preboarding/brd/candidate/${id}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(bodyOf(id)),
        });
        if (res.ok) ok += 1; else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (failed === 0) toast.success(successMsg);
    else toast.error(`${ok} succeeded, ${failed} failed`);
    await fetchData();
  }, [fetchData]);

  const openMenu = (candidate: PreboardingCandidate, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const menuW = 208;
    const menuH = 260;
    let left = rect.right - menuW;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    let top = rect.bottom + 4;
    if (top + menuH > window.innerHeight) top = Math.max(8, rect.top - menuH - 4);
    setMenu({ candidate, top, left });
  };

  // ─── Bottom info bar numbers ───

  const next7Days = useMemo(() => {
    const now = nowMs; // timestamp captured at fetch time, not during render
    return candidates.filter(c =>
      c.joiningDate && new Date(c.joiningDate).getTime() > now &&
      new Date(c.joiningDate).getTime() - now <= 7 * DAY_MS &&
      !['joined', 'did_not_join', 'cancelled'].includes(c.stage)).length;
  }, [candidates, nowMs]);

  const docsPendingSubmission = useMemo(
    () => candidates.reduce((acc, c) => acc + (c.documents || []).filter(d => d.status === 'pending').length, 0),
    [candidates],
  );

  // ─── Loading / error states ───

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="h-10 w-72 rounded-lg bg-slate-200 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
              <div className="h-6 w-24 rounded bg-slate-200 animate-pulse" />
              <div className="h-8 w-12 rounded bg-slate-200 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="h-10 w-full rounded-lg bg-slate-100 animate-pulse mb-4" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 w-full rounded bg-slate-50 animate-pulse mb-2" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6 flex items-start gap-4">
          <FiAlertCircle className="text-red-500 text-xl mt-0.5 shrink-0" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-red-700">Failed to load preboarding candidates</h2>
            <p className="text-sm text-slate-500 mt-1">{error}</p>
            <button
              onClick={() => fetchData()}
              className="mt-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
            >
              <FiRefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* 1. Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="h-10 w-1.5 rounded-full bg-teal-600 shrink-0" aria-hidden="true" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Preboarding Candidates</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">
                {filtered.length} {filtered.length === 1 ? 'candidate' : 'candidates'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">Manage candidates in preboarding process</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 bg-white self-start sm:self-auto"
        >
          <FiRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {/* 2. Metric mini-cards */}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4" aria-label="Preboarding metrics">
        <button
          onClick={() => { clearFilters(); }}
          className={`bg-white rounded-xl border shadow-sm p-4 text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500 ${activeFilterCount === 0 ? 'border-teal-400 ring-1 ring-teal-400' : 'border-slate-200 hover:border-teal-300'}`}
        >
          <div className="text-xs font-medium text-slate-500 inline-flex items-center gap-1.5"><FiUsers className="text-teal-600 w-3.5 h-3.5" /> Total Preboarding</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{metrics?.totalPreboarding ?? 0}</div>
        </button>
        <button
          onClick={() => { setUpcomingOnly(v => !v); setFilter(''); resetPage(); }}
          className={`bg-white rounded-xl border shadow-sm p-4 text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500 ${upcomingOnly ? 'border-teal-400 ring-1 ring-teal-400' : 'border-slate-200 hover:border-teal-300'}`}
        >
          <div className="text-xs font-medium text-slate-500 inline-flex items-center gap-1.5"><FiClock className="text-emerald-600 w-3.5 h-3.5" /> Upcoming Joiners</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{metrics?.upcomingJoiners ?? 0}</div>
        </button>
        <button
          onClick={() => { setFilter(f => (f === 'documents_pending' ? '' : 'documents_pending')); setUpcomingOnly(false); resetPage(); }}
          className={`bg-white rounded-xl border shadow-sm p-4 text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500 ${filter === 'documents_pending' ? 'border-teal-400 ring-1 ring-teal-400' : 'border-slate-200 hover:border-teal-300'}`}
        >
          <div className="text-xs font-medium text-slate-500 inline-flex items-center gap-1.5"><FiFileText className="text-amber-600 w-3.5 h-3.5" /> Documents Pending</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{metrics?.documentsPending ?? 0}</div>
        </button>
        <button
          onClick={() => { setFilter(f => (f === 'verification_pending' ? '' : 'verification_pending')); setUpcomingOnly(false); resetPage(); }}
          className={`bg-white rounded-xl border shadow-sm p-4 text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500 ${filter === 'verification_pending' ? 'border-teal-400 ring-1 ring-teal-400' : 'border-slate-200 hover:border-teal-300'}`}
        >
          <div className="text-xs font-medium text-slate-500 inline-flex items-center gap-1.5"><FiCheckCircle className="text-violet-600 w-3.5 h-3.5" /> Verification Pending</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{metrics?.verificationPending ?? 0}</div>
        </button>
        <button
          onClick={() => { setConfirmedOnly(v => !v); resetPage(); }}
          className={`bg-white rounded-xl border shadow-sm p-4 text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500 ${confirmedOnly ? 'border-teal-400 ring-1 ring-teal-400' : 'border-slate-200 hover:border-teal-300'}`}
        >
          <div className="text-xs font-medium text-slate-500 inline-flex items-center gap-1.5"><FiUserCheck className="text-emerald-600 w-3.5 h-3.5" /> Joining Confirmed</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{metrics?.joiningConfirmed ?? 0}</div>
        </button>
      </section>

      {/* 3. Toolbar */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4" aria-label="Filters toolbar">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); resetPage(); }}
              placeholder="Search name, email or preboarding ID..."
              aria-label="Search candidates"
              className="border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm w-full"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:items-center gap-3">
            <select
              value={jobTitle}
              onChange={e => { setJobTitle(e.target.value); resetPage(); }}
              aria-label="Filter by job title"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white w-full lg:w-auto"
            >
              <option value="">All Job Titles</option>
              {jobTitles.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
            <select
              value={department}
              onChange={e => { setDepartment(e.target.value); resetPage(); }}
              aria-label="Filter by department"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white w-full lg:w-auto"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={dateRange}
              onChange={e => { setDateRange(e.target.value); resetPage(); }}
              aria-label="Filter by joining date"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white w-full lg:w-auto"
            >
              <option value="">Joining: Any</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="overdue">Overdue</option>
            </select>
            <select
              value={stage}
              onChange={e => { setStage(e.target.value); resetPage(); }}
              aria-label="Filter by preboarding status"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white w-full lg:w-auto"
            >
              <option value="">All Statuses</option>
              {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              value={recruiter}
              onChange={e => { setRecruiter(e.target.value); resetPage(); }}
              aria-label="Filter by recruiter"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white w-full lg:w-auto"
            >
              <option value="">All Recruiters</option>
              {recruiters.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={company}
              onChange={e => { setCompany(e.target.value); resetPage(); }}
              aria-label="Filter by company"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white w-full lg:w-auto"
            >
              <option value="">All Companies</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={branch}
              onChange={e => { setBranch(e.target.value); resetPage(); }}
              aria-label="Filter by branch"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white w-full lg:w-auto"
            >
              <option value="">All Branches</option>
              {branchNames.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select
              value={employmentType}
              onChange={e => { setEmploymentType(e.target.value); resetPage(); }}
              aria-label="Filter by employment type"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white w-full lg:w-auto"
            >
              <option value="">All Types</option>
              {employmentTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={clearFilters}
              className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center justify-center gap-2 bg-white"
            >
              <FiRotateCcw className="w-4 h-4" /> Clear
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <FiFilter className="w-3.5 h-3.5" /> {filtered.length} Results
            {activeFilterCount > 0 && <span className="text-teal-600 font-medium">({activeFilterCount} active)</span>}
          </span>
          <span>Page {currentPage} of {totalPages}</span>
        </div>
      </section>

      {/* 4. Main table */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-label="Preboarding candidates table">
        {paged.length === 0 ? (
          <div className="p-10 text-center">
            <FiUsers className="text-slate-300 text-3xl mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-700">No candidates found</h3>
            <p className="text-sm text-slate-500 mt-1">
              {activeFilterCount > 0 ? 'Try adjusting or clearing the filters.' : 'Initiate preboarding from accepted offers to see candidates here.'}
            </p>
            {activeFilterCount > 0 ? (
              <button onClick={clearFilters} className="mt-4 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 bg-white">
                <FiRotateCcw className="w-4 h-4" /> Clear Filters
              </button>
            ) : (
              <button onClick={() => router.push('/offers')} className="mt-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2">
                <FiUserPlus className="w-4 h-4" /> Initiate Preboarding
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={paged.length > 0 && paged.every(c => selected.has(c.id))}
                      onChange={toggleAllVisible}
                      aria-label="Select all visible candidates"
                      className="h-4 w-4 rounded border-slate-300 accent-teal-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-medium">Preboarding ID</th>
                  <th className="px-3 py-3 text-left font-medium">Candidate ID</th>
                  <th className="px-3 py-3 text-left font-medium">Candidate Name</th>
                  <th className="px-3 py-3 text-left font-medium">Job Title</th>
                  <th className="px-3 py-3 text-left font-medium">Department</th>
                  <th className="px-3 py-3 text-left font-medium">Company</th>
                  <th className="px-3 py-3 text-left font-medium">Recruiter</th>
                  <th className="px-3 py-3 text-left font-medium">Joining Date</th>
                  <th className="px-3 py-3 text-left font-medium">Offer Status</th>
                  <th className="px-3 py-3 text-left font-medium">Document Status</th>
                  <th className="px-3 py-3 text-left font-medium">Verification Status</th>
                  <th className="px-3 py-3 text-left font-medium">Joining Readiness</th>
                  <th className="px-3 py-3 text-left font-medium">Preboarding Status</th>
                  <th className="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map(c => (
                  <tr key={c.id} className={`hover:bg-slate-50/60 transition-colors ${selected.has(c.id) ? 'bg-teal-50/40' : ''}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleRow(c.id)}
                        aria-label={`Select ${c.candidateName}`}
                        className="h-4 w-4 rounded border-slate-300 accent-teal-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-800 whitespace-nowrap">{c.preboardingId || '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                      {c.candidateId ? (
                        <button
                          onClick={() => router.push(`/candidates/${c.candidateId}`)}
                          className="text-teal-600 hover:text-teal-700 hover:underline"
                          title="Open candidate profile"
                        >
                          {c.candidateId.slice(0, 8)}
                        </button>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-800">{c.candidateName}</div>
                      <div className="text-xs text-slate-500">{c.candidateEmail || '—'}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.jobTitle || '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.department || '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.companyEmail || '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.recruiter || '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{formatDate(c.joiningDate)}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.offerStatus === 'Accepted' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {c.offerStatus || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.documentStatus === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {c.documentStatus || 'Pending'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${verificationChipClass(c.verificationStatus)}`}>
                        {c.verificationStatus || 'Pending'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.joiningReadiness === 'Ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {c.joiningReadiness || 'Not Ready'} · {c.readinessPercent ?? 0}%
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${stageChipClass(c.stage)}`}>
                        {c.stageLabel || c.stage}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={e => openMenu(c, e)}
                        aria-label={`Actions for ${c.candidateName}`}
                        aria-haspopup="menu"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <FiMoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 7. Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg p-2 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <FiChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(7, totalPages) }).map((_, i) => {
                const pn = i + 1;
                return (
                  <button
                    key={pn}
                    onClick={() => setPage(pn)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${pn === currentPage ? 'bg-teal-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                    aria-label={`Page ${pn}`}
                    aria-current={pn === currentPage ? 'page' : undefined}
                  >
                    {pn}
                  </button>
                );
              })}
              {totalPages > 7 && <span className="text-slate-400 px-1">…</span>}
              {totalPages > 7 && (
                <button
                  onClick={() => setPage(totalPages)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${currentPage === totalPages ? 'bg-teal-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                >
                  {totalPages}
                </button>
              )}
              <button
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg p-2 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 8. Bottom info bar */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" aria-label="Joining forecast">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{next7Days}</span> candidates are expected to join in the next 7 days
          <span className="mx-2 text-slate-300">•</span>
          <span className="font-semibold text-slate-900">{docsPendingSubmission}</span> documents are pending submission
        </p>
        <button
          onClick={() => router.push('/offers')}
          className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
        >
          <FiUserPlus className="w-4 h-4" /> Initiate Preboarding
        </button>
      </section>

      {/* Action menu (fixed positioning avoids clipping by table overflow container) */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} aria-hidden="true" />
          <div
            className="fixed z-50 w-52 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5"
            style={{ top: menu.top, left: menu.left }}
            role="menu"
            aria-label={`Actions for ${menu.candidate.candidateName}`}
          >
            <button
              onClick={() => { const id = menu.candidate.id; setMenu(null); router.push(`/preboarding/candidates/${id}`); }}
              className="w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
              role="menuitem"
            >
              <FiEye className="w-4 h-4 text-slate-400" /> View Profile
            </button>
            <button
              onClick={() => { const c = menu.candidate; setMenu(null); runAction(c.id, { action: 'send-reminder' }, 'Reminder sent'); }}
              disabled={busyId === menu.candidate.id}
              className="w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 disabled:opacity-50"
              role="menuitem"
            >
              {busyId === menu.candidate.id ? <FiLoader className="w-4 h-4 text-teal-600 animate-spin" /> : <FiBell className="w-4 h-4 text-slate-400" />} Send Reminder
            </button>
            <button
              onClick={() => { const c = menu.candidate; setMenu(null); setDateValue(c.joiningDate ? new Date(c.joiningDate).toISOString().slice(0, 10) : ''); setDateReason(''); setDateModal(c); }}
              className="w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
              role="menuitem"
            >
              <FiCalendar className="w-4 h-4 text-slate-400" /> Update Joining Date
            </button>
            <button
              onClick={() => { const c = menu.candidate; setMenu(null); runAction(c.id, { action: 'confirm-joining' }, 'Joining confirmed'); }}
              disabled={busyId === menu.candidate.id || c_isConfirmedOrJoined(menu.candidate)}
              className="w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 disabled:opacity-50"
              role="menuitem"
            >
              <FiCheckSquare className="w-4 h-4 text-slate-400" /> Mark Joining Confirmed
            </button>
            <button
              onClick={() => { const c = menu.candidate; setMenu(null); setCorrectionNote(''); setCorrectionModal(c); }}
              className="w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
              role="menuitem"
            >
              <FiRotateCcw className="w-4 h-4 text-slate-400" /> Return for Correction
            </button>
            {menu.candidate.stage !== 'joined' && (
              <button
                onClick={() => { const c = menu.candidate; setMenu(null); setCancelReason(''); setCancelModal(c); }}
                className="w-full text-left px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 inline-flex items-center gap-2"
                role="menuitem"
              >
                <FiXCircle className="w-4 h-4" /> Cancel Preboarding
              </button>
            )}
          </div>
        </>
      )}

      {/* Update Joining Date modal */}
      {dateModal && (
        <ModalShell title="Update Joining Date" onClose={() => setDateModal(null)}>
          <p className="text-sm text-slate-500 mb-4">
            For <span className="font-medium text-slate-800">{dateModal.candidateName}</span> ({dateModal.preboardingId || '—'})
          </p>
          <div className="space-y-4">
            <div>
              <label htmlFor="jd-date" className="block text-xs font-medium text-slate-500 mb-1">New Joining Date <span className="text-red-500">*</span></label>
              <input
                id="jd-date"
                type="date"
                value={dateValue}
                onChange={e => setDateValue(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label htmlFor="jd-reason" className="block text-xs font-medium text-slate-500 mb-1">Reason <span className="text-red-500">*</span> (mandatory)</label>
              <textarea
                id="jd-reason"
                value={dateReason}
                onChange={e => setDateReason(e.target.value)}
                rows={3}
                placeholder="e.g. Candidate requested postponement by two weeks"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full resize-none"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setDateModal(null)} className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!dateModal) return;
                const id = dateModal.id;
                setDateModal(null);
                runAction(id, { action: 'update-joining-date', joiningDate: dateValue, reason: dateReason.trim() }, 'Joining date updated');
              }}
              disabled={!dateValue || !dateReason.trim() || busyId === dateModal.id}
              className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busyId === dateModal.id && <FiLoader className="w-4 h-4 animate-spin" />} Update Date
            </button>
          </div>
        </ModalShell>
      )}

      {/* Return for Correction modal */}
      {correctionModal && (
        <ModalShell title="Return for Correction" onClose={() => setCorrectionModal(null)}>
          <p className="text-sm text-slate-500 mb-4">
            Send <span className="font-medium text-slate-800">{correctionModal.candidateName}</span>&apos;s portal back for corrections. They will be able to re-submit their details.
          </p>
          <div>
            <label htmlFor="rc-note" className="block text-xs font-medium text-slate-500 mb-1">Correction Note <span className="text-red-500">*</span> (mandatory)</label>
            <textarea
              id="rc-note"
              value={correctionNote}
              onChange={e => setCorrectionNote(e.target.value)}
              rows={4}
              placeholder="Describe what needs to be corrected..."
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full resize-none"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setCorrectionModal(null)} className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg">
              Cancel
            </button>
            <button
              onClick={() => {
                if (!correctionModal) return;
                const id = correctionModal.id;
                setCorrectionModal(null);
                runAction(id, { action: 'return-for-correction', note: correctionNote.trim() }, 'Returned for correction');
              }}
              disabled={!correctionNote.trim() || busyId === correctionModal.id}
              className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busyId === correctionModal.id && <FiLoader className="w-4 h-4 animate-spin" />} Return for Correction
            </button>
          </div>
        </ModalShell>
      )}

      {/* Cancel Preboarding modal (single) */}
      {cancelModal && (
        <ModalShell title="Cancel Preboarding" onClose={() => setCancelModal(null)}>
          <p className="text-sm text-slate-500 mb-4">
            Cancel the preboarding of <span className="font-medium text-slate-800">{cancelModal.candidateName}</span> ({cancelModal.preboardingId || '—'}). This action cannot be undone.
          </p>
          <div>
            <label htmlFor="cl-reason" className="block text-xs font-medium text-slate-500 mb-1">Cancellation Reason <span className="text-red-500">*</span> (mandatory)</label>
            <textarea
              id="cl-reason"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              placeholder="e.g. Candidate accepted another offer"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full resize-none"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setCancelModal(null)} className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg">
              Keep Active
            </button>
            <button
              onClick={() => {
                if (!cancelModal) return;
                const id = cancelModal.id;
                setCancelModal(null);
                runAction(id, { action: 'cancel', reason: cancelReason.trim() }, 'Preboarding cancelled');
              }}
              disabled={!cancelReason.trim() || busyId === cancelModal.id}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busyId === cancelModal.id && <FiLoader className="w-4 h-4 animate-spin" />} Cancel Preboarding
            </button>
          </div>
        </ModalShell>
      )}

      {/* Assign HR modal (bulk) */}
      {assignModal && (
        <ModalShell title="Assign HR" onClose={() => setAssignModal(false)}>
          <p className="text-sm text-slate-500 mb-4">Assign an HR owner to {selected.size} selected candidate{selected.size > 1 ? 's' : ''}.</p>
          <div>
            <label htmlFor="ah-name" className="block text-xs font-medium text-slate-500 mb-1">HR Name <span className="text-red-500">*</span></label>
            <input
              id="ah-name"
              type="text"
              value={assignHr}
              onChange={e => setAssignHr(e.target.value)}
              placeholder="e.g. Priya Sharma"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setAssignModal(false)} className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg">
              Cancel
            </button>
            <button
              onClick={() => {
                const ids = Array.from(selected);
                setAssignModal(false);
                runBulk(ids, () => ({ action: 'assign-hr', hrAssignedTo: assignHr.trim() }), `HR assigned to ${ids.length} candidate${ids.length > 1 ? 's' : ''}`);
              }}
              disabled={!assignHr.trim() || bulkBusy}
              className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkBusy && <FiLoader className="w-4 h-4 animate-spin" />} Assign
            </button>
          </div>
        </ModalShell>
      )}

      {/* Bulk Cancel modal */}
      {bulkCancelModal && (
        <ModalShell title="Cancel Preboarding (Bulk)" onClose={() => setBulkCancelModal(false)}>
          <p className="text-sm text-slate-500 mb-4">
            Cancel preboarding for <span className="font-medium text-slate-800">{selected.size} selected candidate{selected.size > 1 ? 's' : ''}</span>. This action cannot be undone.
          </p>
          <div>
            <label htmlFor="bc-reason" className="block text-xs font-medium text-slate-500 mb-1">Cancellation Reason <span className="text-red-500">*</span> (mandatory)</label>
            <textarea
              id="bc-reason"
              value={bulkCancelReason}
              onChange={e => setBulkCancelReason(e.target.value)}
              rows={3}
              placeholder="e.g. Requisition closed — positions no longer available"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full resize-none"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setBulkCancelModal(false)} className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg">
              Keep Active
            </button>
            <button
              onClick={() => {
                const ids = Array.from(selected);
                setBulkCancelModal(false);
                runBulk(ids, () => ({ action: 'cancel', reason: bulkCancelReason.trim() }), `Preboarding cancelled for ${ids.length} candidate${ids.length > 1 ? 's' : ''}`);
              }}
              disabled={!bulkCancelReason.trim() || bulkBusy}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkBusy && <FiLoader className="w-4 h-4 animate-spin" />} Cancel Preboarding
            </button>
          </div>
        </ModalShell>
      )}

      {/* 6. Bulk selection floating action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-3 max-w-[95vw] flex-wrap">
          <span className="text-sm font-medium whitespace-nowrap">{selected.size} selected</span>
          <span className="h-5 w-px bg-slate-700" aria-hidden="true" />
          <button
            onClick={() => {
              const ids = Array.from(selected);
              runBulk(ids, () => ({ action: 'send-reminder' }), `Reminder sent to ${ids.length} candidate${ids.length > 1 ? 's' : ''}`);
            }}
            disabled={bulkBusy}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {bulkBusy ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiBell className="w-4 h-4" />} Send Reminder
          </button>
          <button
            onClick={() => { setAssignHr(''); setAssignModal(true); }}
            disabled={bulkBusy}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <FiUserCheck className="w-4 h-4" /> Assign HR
          </button>
          <button
            onClick={() => { setBulkCancelReason(''); setBulkCancelModal(true); }}
            disabled={bulkBusy}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-red-500/90 hover:bg-red-500 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <FiXCircle className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
            className="text-sm px-2 py-1.5 rounded-lg hover:bg-white/10 text-slate-300"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// helper kept outside component to keep JSX tidy
function c_isConfirmedOrJoined(c: PreboardingCandidate): boolean {
  return c.stage === 'joined' || Boolean(c.joiningConfirmed);
}

// ─────────────────────────────────────────────────────────────
// Page wrapper — useSearchParams requires a Suspense boundary
// ─────────────────────────────────────────────────────────────

export default function PreboardingCandidatesPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="h-10 w-72 rounded-lg bg-slate-200 animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="h-6 w-24 rounded bg-slate-200 animate-pulse" />
                <div className="h-8 w-12 rounded bg-slate-200 animate-pulse mt-3" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="h-10 w-full rounded-lg bg-slate-100 animate-pulse mb-4" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 w-full rounded bg-slate-50 animate-pulse mb-2" />
            ))}
          </div>
        </div>
      }
    >
      <CandidatesContent />
    </Suspense>
  );
}
