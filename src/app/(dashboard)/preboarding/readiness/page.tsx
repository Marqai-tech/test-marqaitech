'use client';

/* ─────────────────────────────────────────────────────────────────────────────
 * Joining Readiness (BRD 5.10)
 * Centralized readiness checklist — computed + manual items, mandatory gates,
 * "Mark Ready to Join" action, and HR day-to-day readiness tooling.
 * APIs: GET/PATCH /api/preboarding/brd/readiness, /api/preboarding/brd/pipeline,
 *       PATCH /api/preboarding/brd/candidate/<id>
 * ──────────────────────────────────────────────────────────────────────────── */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  FiCheckCircle,
  FiClock,
  FiRefreshCw,
  FiSearch,
  FiChevronDown,
  FiList,
  FiClipboard,
  FiBell,
  FiShield,
  FiFlag,
  FiCalendar,
  FiAlertTriangle,
  FiArrowRight,
  FiX,
  FiUserCheck,
} from 'react-icons/fi';

/* ── Auth helper ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface PipelineCandidate {
  id: string;
  preboardingId: string | null;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string | null;
  department: string | null;
  joiningDate: string | null;
  stage: string;
  stageLabel: string;
  readinessPercent: number;
  readinessCompleted: number;
  readinessTotal: number;
}

interface ReadinessItem {
  requirement: string;
  responsibleRole: string;
  status: 'complete' | 'pending';
  source: 'computed' | 'manual';
  updatedBy?: string;
  updatedAt?: string;
}

interface ReadinessData {
  candidateId: string;
  preboardingId: string | null;
  candidateName: string;
  items: ReadinessItem[];
  completed: number;
  total: number;
  percent: number;
  canMarkReady: boolean;
  mandatoryPending: string[];
  readyToJoinAt: string | null;
}

/* ── Constants ── */
const PREFERRED_STAGES = ['verification', 'ready_to_join'];
const PREFERRED_MIN = 5; // "plus all if few"

const SUMMARY_KEYS: { label: string; req: string }[] = [
  { label: 'Mandatory documents', req: 'Mandatory Documents' },
  { label: 'Bank verification', req: 'Bank Details' },
  { label: 'IT asset preparation', req: 'IT Requirements' },
  { label: 'Joining instructions', req: 'Joining Instructions' },
];

/* ── Small helpers ── */
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDay(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ════════════════════════════════════════════════════════════════════════════
 * Inner component (needs Suspense because of useSearchParams)
 * ══════════════════════════════════════════════════════════════════════════ */
function ReadinessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get('candidateId');

  /* ── Candidate list state ── */
  const [candidates, setCandidates] = useState<PipelineCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId);
  const ddRef = useRef<HTMLDivElement | null>(null);

  /* ── Readiness state ── */
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyReq, setBusyReq] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [mandatoryBlock, setMandatoryBlock] = useState<string[] | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

  /* ── Modals ── */
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTitle, setAssignTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);

  const [dateOpen, setDateOpen] = useState(false);
  const [newJoiningDate, setNewJoiningDate] = useState('');
  const [dateReason, setDateReason] = useState('');
  const [dateBusy, setDateBusy] = useState(false);
  const [dateError, setDateError] = useState('');

  /* ── Fetch pipeline candidates ── */
  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const res = await fetch('/api/preboarding/brd/pipeline', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load candidates');
      setCandidates(Array.isArray(data.candidates) ? (data.candidates as PipelineCandidate[]) : []);
    } catch (e) {
      setCandidatesError(e instanceof Error ? e.message : 'Failed to load candidates');
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  /* ── Fetch readiness for a candidate ── */
  const loadReadiness = useCallback(async (cid: string) => {
    setLoading(true);
    setError(null);
    setMandatoryBlock(null);
    try {
      const res = await fetch(`/api/preboarding/brd/readiness?candidateId=${encodeURIComponent(cid)}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load readiness');
      setReadiness(data as ReadinessData);
    } catch (e) {
      setReadiness(null);
      setError(e instanceof Error ? e.message : 'Failed to load readiness');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => loadCandidates()); }, [loadCandidates]);
  useEffect(() => {
    if (selectedId) queueMicrotask(() => loadReadiness(selectedId));
  }, [selectedId, loadReadiness]);

  /* close dropdown on outside click */
  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(ev.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Derived candidate list for the dropdown ── */
  const preferred = useMemo(
    () => candidates.filter((c) => PREFERRED_STAGES.includes(c.stage)),
    [candidates],
  );
  const baseList = useMemo(
    () => (preferred.length >= PREFERRED_MIN ? preferred : candidates),
    [preferred, candidates],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseList.slice(0, 60);
    const pool = baseList.length > 0 ? baseList : candidates;
    return pool
      .filter((c) =>
        [c.candidateName, c.candidateEmail, c.preboardingId, c.jobTitle, c.stageLabel]
          .some((v) => (v || '').toLowerCase().includes(q)))
      .slice(0, 60);
  }, [search, baseList, candidates]);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedId) || null,
    [candidates, selectedId],
  );

  /* ── Summary lines ── */
  const summary = useMemo(() => SUMMARY_KEYS.map(({ label, req }) => {
    const item = readiness?.items.find((i) => i.requirement === req);
    return { label, ok: item?.status === 'complete' };
  }), [readiness]);

  /* ── Actions ── */
  const toggleItem = async (item: ReadinessItem, next: 'complete' | 'pending') => {
    if (!selectedId || item.source !== 'manual') return;
    setBusyReq(item.requirement);
    try {
      const res = await fetch('/api/preboarding/brd/readiness', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ candidateId: selectedId, requirement: item.requirement, status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update item');
      toast.success(data.message || `${item.requirement} marked ${next}.`);
      await loadReadiness(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update item');
    } finally {
      setBusyReq(null);
    }
  };

  const sendReminder = async () => {
    if (!selectedId) return;
    const t = toast.loading('Sending reminder…');
    try {
      const res = await fetch(`/api/preboarding/brd/candidate/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'send-reminder' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reminder');
      toast.success(data.message || 'Reminder sent to candidate.', { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send reminder', { id: t });
    }
  };

  const markReadyToJoin = async () => {
    if (!selectedId) return;
    setMarking(true);
    setMandatoryBlock(null);
    try {
      const res = await fetch('/api/preboarding/brd/readiness', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ candidateId: selectedId, action: 'mark-ready-to-join' }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setMandatoryBlock(Array.isArray(data.mandatoryPending) ? data.mandatoryPending : []);
        toast.error('Mandatory items incomplete — cannot mark Ready to Join.');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to mark ready');
      toast.success('Candidate marked Ready to Join.');
      await loadReadiness(selectedId);
      loadCandidates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark ready');
    } finally {
      setMarking(false);
    }
  };

  const submitAssignTask = async () => {
    if (!assignTitle.trim()) { toast.error('Task title is required'); return; }
    if (!assignee.trim()) { toast.error('Assignee is required'); return; }
    setAssignBusy(true);
    try {
      // Visual-only per BRD 5.10 — tasks are tracked in the Onboarding Tasks module
      await new Promise((r) => setTimeout(r, 400));
      toast.success('Task assigned (tracked in Onboarding Tasks)');
      setAssignOpen(false);
      setAssignTitle('');
      setAssignee('');
      router.push('/preboarding/tasks');
    } finally {
      setAssignBusy(false);
    }
  };

  const submitUpdateJoiningDate = async () => {
    if (!selectedId) return;
    if (!newJoiningDate) { setDateError('New joining date is required'); return; }
    if (!dateReason.trim()) { setDateError('Reason is mandatory when updating the joining date'); return; }
    setDateBusy(true);
    setDateError('');
    try {
      const res = await fetch(`/api/preboarding/brd/candidate/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'update-joining-date', joiningDate: newJoiningDate, reason: dateReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update joining date');
      toast.success(data.message || 'Joining date updated and candidate notified.');
      setDateOpen(false);
      setNewJoiningDate('');
      setDateReason('');
      await loadReadiness(selectedId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update joining date');
    } finally {
      setDateBusy(false);
    }
  };

  /* ── Render helpers ── */
  const stageChip = (stage: string, label: string) => {
    const cls = stage === 'ready_to_join'
      ? 'bg-teal-50 text-teal-700'
      : stage === 'joined'
        ? 'bg-emerald-50 text-emerald-700'
        : stage === 'verification'
          ? 'bg-violet-50 text-violet-700'
          : 'bg-slate-100 text-slate-600';
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label || stage}</span>;
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Joining Readiness</h1>
          <p className="text-sm text-slate-500 mt-0.5">Centralized checklist — not just another status dropdown</p>
        </div>
        <button
          onClick={() => { loadCandidates(); if (selectedId) loadReadiness(selectedId); }}
          className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
        >
          <FiRefreshCw className={`h-4 w-4 ${candidatesLoading || loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Candidate selector ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">Select Candidate</label>
        <div className="relative" ref={ddRef}>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={
                selectedCandidate
                  ? `${selectedCandidate.candidateName}${selectedCandidate.jobTitle ? ` — ${selectedCandidate.jobTitle}` : ''}`
                  : 'Search by name, email, preboarding ID or job title…'
              }
              className="border border-slate-300 rounded-lg pl-9 pr-9 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
              aria-label="Search preboarding candidates"
            />
            {selectedCandidate && (
              <button
                onClick={() => { setSelectedId(null); setReadiness(null); setSearch(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear selection"
              >
                <FiX className="h-4 w-4" />
              </button>
            )}
            <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          {dropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {candidatesLoading ? (
                <div className="p-4 space-y-2">
                  {[0, 1, 2].map((i) => <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />)}
                </div>
              ) : candidatesError ? (
                <div className="p-4 text-sm text-red-600">
                  {candidatesError}
                  <button onClick={loadCandidates} className="ml-2 underline font-medium">Retry</button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No candidates match &ldquo;{search}&rdquo;.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => {
                          setSelectedId(c.id);
                          setSearch('');
                          setDropdownOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-800 truncate">
                            {c.candidateName}
                            {c.preboardingId ? <span className="ml-2 text-xs text-slate-400 font-normal">{c.preboardingId}</span> : null}
                          </span>
                          <span className="block text-xs text-slate-500 truncate">
                            {c.jobTitle || '—'}{c.joiningDate ? ` · joining ${fmtDay(c.joiningDate)}` : ''}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{c.readinessCompleted}/{c.readinessTotal}</span>
                          {stageChip(c.stage, c.stageLabel)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {preferred.length > 0 && preferred.length < candidates.length && !search && (
                <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100 bg-slate-50">
                  Showing candidates in Verification / Ready to Join. Type to search all {candidates.length}.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Mandatory-pending red panel (409 from Mark Ready) ── */}
      {mandatoryBlock && mandatoryBlock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <FiAlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">Cannot mark Ready to Join — mandatory items incomplete (BRD 5.10)</h3>
              <ul className="mt-2 space-y-1">
                {mandatoryBlock.map((m) => (
                  <li key={m} className="text-sm text-red-700 flex items-center gap-2">
                    <FiX className="h-3.5 w-3.5 shrink-0" /> {m}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-red-600">Mandatory requirements must not be bypassed simply because the overall percentage is high.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Already-ready banner ── */}
      {readiness?.readyToJoinAt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <FiUserCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800">
            Marked Ready to Join on <span className="font-semibold">{fmtDay(readiness.readyToJoinAt)}</span>
          </p>
        </div>
      )}

      {/* ── No candidate selected ── */}
      {!selectedId && !candidatesLoading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <FiSearch className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">Select a candidate to view their readiness</h3>
          <p className="text-sm text-slate-500 mt-1">Pick a candidate above to load the 15-requirement readiness checklist.</p>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {selectedId && loading && !readiness && (
        <div className="space-y-4" aria-hidden>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="h-24 w-48 bg-slate-100 rounded animate-pulse mx-auto" />
            <div className="h-3 w-full bg-slate-100 rounded animate-pulse mt-4" />
            <div className="h-3 w-2/3 bg-slate-100 rounded animate-pulse mt-2" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {selectedId && error && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <FiAlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">Failed to load readiness</h3>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
          <button
            onClick={() => selectedId && loadReadiness(selectedId)}
            className="mt-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
          >
            <FiRefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {/* ── Readiness panel ── */}
      {readiness && !loading && (
        <>
          {/* Metric + summary */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              {/* Big metric */}
              <div className="text-center lg:w-64 shrink-0">
                <p className="text-5xl font-bold text-slate-900 tracking-tight">
                  {readiness.completed}<span className="text-slate-300 text-3xl">/{readiness.total}</span>
                </p>
                <p className={`mt-1 text-sm font-semibold ${readiness.completed === readiness.total ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {readiness.total - readiness.completed > 0 ? `${readiness.total - readiness.completed} Pending` : 'All Complete'}
                </p>
                <p className="text-xs text-slate-500 mt-1">{readiness.percent}% of readiness checklist items completed.</p>
                <div className="mt-3 h-2.5 w-full bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={readiness.percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-teal-600 rounded-full transition-all duration-500" style={{ width: `${readiness.percent}%` }} />
                </div>
              </div>

              {/* Summary lines */}
              <div className="flex-1 grid sm:grid-cols-2 gap-x-6 gap-y-2 lg:border-l lg:border-slate-100 lg:pl-6">
                {summary.map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-sm text-slate-600">{s.label}</span>
                    {s.ok ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                        <FiCheckCircle className="h-4 w-4" /> Complete
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600">
                        <FiClock className="h-4 w-4" /> Pending
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions bar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
              >
                <FiList className="h-4 w-4" /> View Checklist
              </button>
              <button
                onClick={() => setAssignOpen(true)}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
              >
                <FiClipboard className="h-4 w-4" /> Assign Task
              </button>
              <button
                onClick={sendReminder}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
              >
                <FiBell className="h-4 w-4" /> Send Reminder
              </button>
              <button
                onClick={() => toast('Approval request sent to HR Admin — pending sign-off.', { duration: 4000 })}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
              >
                <FiShield className="h-4 w-4" /> Request Approval
              </button>
              <button
                onClick={() => setDateOpen(true)}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
              >
                <FiCalendar className="h-4 w-4" /> Update Joining Date
              </button>
              <button
                onClick={markReadyToJoin}
                disabled={marking || Boolean(readiness.readyToJoinAt)}
                className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <FiFlag className="h-4 w-4" /> {marking ? 'Marking…' : readiness.readyToJoinAt ? 'Ready to Join' : 'Mark Ready to Join'}
              </button>
            </div>
          </div>

          {/* Checklist table */}
          <div ref={tableRef} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 scroll-mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Readiness Checklist</h3>
              <span className="text-xs text-slate-400">{readiness.candidateName}{readiness.preboardingId ? ` · ${readiness.preboardingId}` : ''}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[800px] w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold">Requirement</th>
                    <th className="text-left py-3 px-4 font-semibold">Responsible Role</th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 font-semibold">Updated By</th>
                    <th className="text-left py-3 px-4 font-semibold">Updated At</th>
                    <th className="text-left py-3 px-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {readiness.items.map((item) => (
                    <tr key={item.requirement} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-4 font-medium text-slate-800">{item.requirement}</td>
                      <td className="py-2.5 px-4 text-slate-600">{item.responsibleRole || '—'}</td>
                      <td className="py-2.5 px-4">
                        {item.status === 'complete' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                            <FiCheckCircle className="h-3.5 w-3.5" /> Complete
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                            <FiClock className="h-3.5 w-3.5" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{item.source === 'manual' ? (item.updatedBy || '—') : <span className="text-slate-400 italic">auto</span>}</td>
                      <td className="py-2.5 px-4 text-slate-500 text-xs">{item.source === 'manual' && item.updatedAt ? fmtDate(item.updatedAt) : <span className="text-slate-400 italic">auto</span>}</td>
                      <td className="py-2.5 px-4">
                        {item.source === 'manual' ? (
                          busyReq === item.requirement ? (
                            <span className="text-xs text-slate-400">Saving…</span>
                          ) : item.status === 'complete' ? (
                            <button
                              onClick={() => toggleItem(item, 'pending')}
                              className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5"
                            >
                              <FiClock className="h-3.5 w-3.5" /> Mark Pending
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleItem(item, 'complete')}
                              className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5"
                            >
                              <FiCheckCircle className="h-3.5 w-3.5" /> Mark Complete
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-slate-400 italic">auto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Items marked <span className="italic">auto</span> are computed from completed preboarding steps and cannot be toggled manually.
            </p>
          </div>
        </>
      )}

      {/* ── Assign Task modal (visual only — BRD 5.10) ── */}
      {assignOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Assign readiness task">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Assign Task</h3>
              <button onClick={() => setAssignOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            {readiness && (
              <p className="text-xs text-slate-500">
                For <span className="font-medium text-slate-700">{readiness.candidateName}</span>
                {readiness.preboardingId ? ` · ${readiness.preboardingId}` : ''}
              </p>
            )}
            <div>
              <label htmlFor="task-title" className="block text-sm font-medium text-slate-700 mb-1">Task Title</label>
              <input
                id="task-title"
                type="text"
                value={assignTitle}
                onChange={(e) => setAssignTitle(e.target.value)}
                placeholder="e.g. Prepare laptop for joining day"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label htmlFor="task-assignee" className="block text-sm font-medium text-slate-700 mb-1">Assignee</label>
              <input
                id="task-assignee"
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="e.g. IT Admin — Rahul"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAssignOpen(false)} className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-3.5 py-2 rounded-lg text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={submitAssignTask}
                disabled={assignBusy}
                className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-60"
              >
                Assign Task <FiArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Update Joining Date modal ── */}
      {dateOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Update joining date">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Update Joining Date</h3>
              <button onClick={() => setDateOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label htmlFor="new-joining-date" className="block text-sm font-medium text-slate-700 mb-1">New Joining Date</label>
              <input
                id="new-joining-date"
                type="date"
                value={newJoiningDate}
                onChange={(e) => setNewJoiningDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label htmlFor="date-reason" className="block text-sm font-medium text-slate-700 mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea
                id="date-reason"
                value={dateReason}
                onChange={(e) => setDateReason(e.target.value)}
                rows={3}
                placeholder="Mandatory — recorded in the audit history and shared with the candidate"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
              />
            </div>
            {dateError && <p className="text-xs text-red-600 flex items-center gap-1.5"><FiAlertTriangle className="h-3.5 w-3.5" /> {dateError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setDateOpen(false)} className="border border-slate-300 text-slate-700 hover:bg-slate-50 px-3.5 py-2 rounded-lg text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={submitUpdateJoiningDate}
                disabled={dateBusy}
                className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-60"
              >
                {dateBusy ? 'Updating…' : 'Update Date'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Page (Suspense boundary required for useSearchParams)
 * ══════════════════════════════════════════════════════════════════════════ */
export default function JoiningReadinessPage() {
  return (
    <Suspense
      fallback={(
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-4" aria-busy="true">
          <div className="h-8 w-56 bg-slate-100 rounded animate-pulse" />
          <div className="h-24 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse" />
        </div>
      )}
    >
      <ReadinessInner />
    </Suspense>
  );
}
