'use client';

/**
 * Find Candidates — recruitment screening screen (redesigned).
 *
 * Scope of this screen ONLY: candidate discovery, resume review, screening,
 * shortlisting and rejection. Interview scheduling, offers, preboarding and
 * BGV live in their own modules and are never started from here.
 *
 * Layout (viewport-fit, no horizontal scrolling):
 *   - Header: breadcrumb, title, subtitle, Refresh + Export
 *   - Summary cards: Total Candidates / New Applications / In Screening /
 *     Shortlisted / In Interview / Offered
 *   - Filter card: Job Posting, search, Source, Experience, Status, Sort,
 *     Clear Filters
 *   - Candidate list: responsive card grid (1 / 2 / 3 columns). Each card:
 *     avatar + name + role, colored status badge, one experience · source
 *     detail line, up to 4 skill chips (+N more), ONE full-width advance
 *     button (STATUS_META.nextLabel), email and View Profile. Cards carry no
 *     note / tag / reject actions — rejection lives in the profile only.
 *   - "View Profile" → FULL-PAGE profile (never a modal): header card with
 *     status badge + one-click advance / Reject actions and an Applied →
 *     Screening → Shortlisted → Interview → Offer → Hired pipeline stepper,
 *     then full-width Resume (preview toggle + download) and Applied To
 *     cards, followed by Contact, Skills, Experience, Education,
 *     Certifications, Screening Answers and the Activity timeline.
 *
 * Status flow (forward-only): applied → screening → shortlisted → interview →
 * offered. The interview-stage and offer-stage moves happen HERE (Move to
 * Interview / Move to Offer buttons); the follow-up actions live in their own
 * tabs and every transition surfaces a guidance toast + banner saying where to
 * go next:
 *   shortlisted → interview : schedule the slot in Scheduled Interviews →
 *                             Schedule Interview tab.
 *   interview    → offered  : create + release the offer in the Offer
 *                             Management tab (offer must pass the job's
 *                             interview-plan completion gate server-side).
 * Rejected is terminal and always asks for confirmation. Backward moves are
 * not offered.
 *
 * Data: everything dynamic from the existing APIs.
 *   - GET  /api/recruitment/candidate-search  (aggregated candidates; returns
 *     source / notes / resume / coverLetter per application)
 *   - GET  /api/recruitment?limit=200         (job postings for the filter)
 *   - PATCH /api/recruitment/:applicationId   ({ status } for stage moves)
 *   No candidate data is hardcoded; every value on screen comes from the DB.
 */
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Search, RefreshCw, Download, X, FileText, StickyNote, Clock,
  Mail, Briefcase, Award, Star, ArrowLeft, CheckCircle2,
  Loader2, AlertTriangle, Calendar, Users, UserPlus, UserCheck,
  ChevronRight, UserRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { BackButton } from '@/components/hrms/BackButton';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ─────────────────────────────── data types ─────────────────────────────── */

interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  skills?: string[];
  experience?: Array<{ company?: string; role?: string; duration?: string }>;
  education?: Array<{ degree?: string; institution?: string; year?: string }>;
  certifications?: string[];
  languages?: string[];
}

interface AppRow {
  id: string;
  jobPostingId?: string;
  jobTitle?: string;
  position?: string;
  department?: string;
  company?: string;
  status?: string;
  appliedDate?: string;
  source?: string;
  notes?: string | null;
  resume?: string | null;
  coverLetter?: string | null;
  rating?: number | null;
  updatedAt?: string;
}

interface CandidateEntry {
  candidateEmail: string;
  candidateName: string;
  candidatePhone?: string;
  skills: string[];
  totalExperienceYears?: number;
  expectedSalaryLpa?: number | null;
  latestStatus?: string;
  latestAppliedDate?: string;
  parsedResume?: ParsedResume;
  matchScore?: number | null;
  applications: AppRow[];
}

interface JobPosting { id: string; title: string; }

interface RecruiterNote { text: string; at: string; }

/* ─────────────────────────── design-system tokens ────────────────────────── */

/* Filter-bar controls: fixed height, NO w-full — explicit widths below must
   win, otherwise every dropdown stretches to 100% and stacks vertically. */
const FILTER_CLS = 'h-[30px] rounded-[7px] border border-slate-300 bg-white px-2 text-[11.5px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15';
const CARD_CLS = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const SECTION_TITLE = 'text-[12.5px] font-bold text-slate-800';

const STATUS_META: Record<string, { label: string; badge: string; next?: string; nextLabel?: string }> = {
  applied: { label: 'Applied', badge: 'bg-blue-50 text-blue-700 border-blue-200', next: 'screening', nextLabel: 'Move to Screening' },
  screening: { label: 'Screening', badge: 'bg-amber-50 text-amber-700 border-amber-200', next: 'shortlisted', nextLabel: 'Shortlist' },
  shortlisted: { label: 'Shortlisted', badge: 'bg-green-50 text-green-700 border-green-200', next: 'interview', nextLabel: 'Move to Interview' },
  rejected: { label: 'Rejected', badge: 'bg-red-50 text-red-700 border-red-200' },
  interview: { label: 'In Interviews', badge: 'bg-purple-50 text-purple-700 border-purple-200', next: 'offered', nextLabel: 'Move to Offer' },
  interview_completed: { label: 'Interview Done', badge: 'bg-purple-50 text-purple-700 border-purple-200', next: 'offered', nextLabel: 'Move to Offer' },
  offered: { label: 'Offered', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  hired: { label: 'Hired', badge: 'bg-green-100 text-green-800 border-green-300' },
};

/* Pipeline order for the profile stepper (Applied → … → Hired). */
const PIPELINE_STAGES: Array<{ key: string; label: string }> = [
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interview', label: 'Interview' },
  { key: 'offered', label: 'Offer' },
  { key: 'hired', label: 'Hired' },
];

/* Stage guidance — where the FOLLOW-UP action for the current stage lives.
   Shown in the profile banner (and referenced by transition toasts) so HR
   always knows which tab handles the next step. */
const STAGE_GUIDANCE: Record<string, { headline: string; hint: string }> = {
  shortlisted: {
    headline: 'Candidate shortlisted — next step: Interview stage.',
    hint: 'Click “Move to Interview” to advance the stage, then book the slot from Scheduled Interviews → Schedule Interview tab.',
  },
  interview: {
    headline: 'Candidate is in the Interview stage.',
    hint: 'Schedule interview rounds from Scheduled Interviews → Schedule Interview tab. Once the rounds are done, click “Move to Offer” here.',
  },
  offered: {
    headline: 'Candidate is at the Offer stage.',
    hint: 'Create and release the offer from the Offer Management tab (create offer → approval → send).',
  },
};

const SOURCE_LABELS: Record<string, string> = {
  website: 'Website', referral: 'Referral', linkedin: 'LinkedIn', indeed: 'Indeed', other: 'Other',
};

function statusLabel(status?: string): string {
  if (!status) return '—';
  if (STATUS_META[status]) return STATUS_META[status].label;
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function statusBadgeCls(status?: string): string {
  return STATUS_META[status || '']?.badge || 'bg-slate-100 text-slate-700 border-slate-200';
}

function sourceLabel(source?: string): string {
  if (!source) return '—';
  return SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1);
}

function initials(name?: string): string {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isPdfResume(resume?: string | null): boolean {
  if (!resume) return false;
  const r = resume.toLowerCase();
  return r.startsWith('data:application/pdf') || r.endsWith('.pdf') || r.includes('.pdf?') || r.includes('.pdf#');
}

/** notes field doubles as AI-feedback JSON; legacy recruiter notes still show in the timeline. */
function parseApplicationNotes(raw?: string | null): { legacy: string; recruiterNotes: RecruiterNote[]; tags: string[] } {
  if (!raw) return { legacy: '', recruiterNotes: [], tags: [] };
  const s = String(raw).trim();
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const legacy = typeof obj.raw === 'string' ? obj.raw : '';
      const recruiterNotes = Array.isArray(obj.recruiterNotes)
        ? (obj.recruiterNotes as RecruiterNote[]).filter(n => n && typeof n.text === 'string' && n.text.trim())
        : [];
      const tags = Array.isArray(obj.tags) ? (obj.tags as unknown[]).filter(t => typeof t === 'string' && t.trim()) as string[] : [];
      return { legacy, recruiterNotes, tags };
    }
  } catch { /* plain-text legacy note */ }
  return { legacy: s, recruiterNotes: [], tags: [] };
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ───────────────────── small shared presentational pieces ─────────────────── */

function CardHead({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <h3 className={SECTION_TITLE}>{title}</h3>
      </div>
      {right}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <p className="mt-0.5 break-words text-[11.5px] font-semibold text-slate-700">{value}</p>
    </div>
  );
}

/* ══════════════════════════════ main component ═══════════════════════════ */

export function FindCandidates() {
  const [entries, setEntries] = useState<CandidateEntry[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    jobId: 'all', q: '', source: 'all', minExp: '', maxExp: '', status: 'all', sort: 'newest',
  });

  // profile (full page — never a modal)
  const [viewEmail, setViewEmail] = useState<string | null>(null);
  const [bannerDismissedFor, setBannerDismissedFor] = useState<string | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const profileScrollRef = useRef<HTMLDivElement | null>(null);

  // actions
  const [transitioningApp, setTransitioningApp] = useState<string | null>(null);
  const [confirmRejectApp, setConfirmRejectApp] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  /* ───────────────────────────── data loading ───────────────────────────── */

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/recruitment?limit=200', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setJobs((data?.jobPostings || []).map((j: { id: string; title: string }) => ({ id: j.id, title: j.title })));
    } catch { /* non-fatal — job filter still usable with 'All jobs' */ }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.minExp) params.set('minExperienceYears', filters.minExp);
      if (filters.maxExp) params.set('maxExperienceYears', filters.maxExp);
      if (filters.jobId !== 'all') params.set('jobPostingId', filters.jobId);
      const res = await fetch(`/api/recruitment/candidate-search?${params.toString()}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`Failed to load candidates (${res.status})`);
      const data = await res.json();
      const list: CandidateEntry[] = data?.candidates || data?.results || data?.data || (Array.isArray(data) ? data : []);
      setEntries(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [filters.q, filters.minExp, filters.maxExp, filters.jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  /* ──────────────────────────── derived values ──────────────────────────── */

  const visibleEntries = useMemo(() => {
    const ql = filters.q.trim().toLowerCase();
    let list = entries.filter(e => {
      if (ql) {
        const hitName = (e.candidateName || '').toLowerCase().includes(ql);
        const hitEmail = (e.candidateEmail || '').toLowerCase().includes(ql);
        const hitSkill = (e.skills || []).some(s => s.includes(ql));
        const hitJob = (e.applications || []).some(a => (a.jobTitle || a.position || '').toLowerCase().includes(ql));
        if (!hitName && !hitEmail && !hitSkill && !hitJob) return false;
      }
      if (filters.source !== 'all') {
        const src = e.applications?.[0]?.source || '';
        if (src !== filters.source) return false;
      }
      if (filters.status !== 'all' && (e.applications?.[0]?.status || e.latestStatus) !== filters.status) return false;
      return true;
    });
    const t = (s?: string) => { const d = new Date(s || 0); return isNaN(d.getTime()) ? 0 : d.getTime(); };
    list = [...list].sort((a, b) => {
      if (filters.sort === 'match') return (b.matchScore ?? -1) - (a.matchScore ?? -1);
      if (filters.sort === 'experience') return (b.totalExperienceYears ?? 0) - (a.totalExperienceYears ?? 0);
      return t(b.latestAppliedDate) - t(a.latestAppliedDate);
    });
    return list;
  }, [entries, filters.q, filters.source, filters.status, filters.sort]);

  const kpis = useMemo(() => {
    let applied = 0, screening = 0, shortlisted = 0, interview = 0, offered = 0;
    for (const e of entries) {
      for (const a of e.applications || []) {
        if (a.status === 'applied') applied += 1;
        else if (a.status === 'screening') screening += 1;
        else if (a.status === 'shortlisted') shortlisted += 1;
        else if (a.status === 'interview' || a.status === 'interview_completed') interview += 1;
        else if (a.status === 'offered') offered += 1;
      }
    }
    return { total: entries.length, applied, screening, shortlisted, interview, offered };
  }, [entries]);

  const profileEntry = useMemo(
    () => (viewEmail ? entries.find(e => e.candidateEmail === viewEmail) || null : null),
    [entries, viewEmail],
  );

  const hasActiveFilters = filters.jobId !== 'all' || filters.q.trim() !== '' || filters.source !== 'all'
    || filters.minExp !== '' || filters.maxExp !== '' || filters.status !== 'all';

  /* ─────────────────────────────── actions ──────────────────────────────── */

  const openProfile = (email: string) => {
    setViewEmail(email);
    setResumeOpen(false);
    setResumeLoading(false);
    setConfirmRejectApp(null);
    requestAnimationFrame(() => profileScrollRef.current?.scrollTo({ top: 0 }));
  };

  const transitionStatus = async (app: AppRow, next: string, candidateName: string) => {
    setTransitioningApp(app.id);
    try {
      const res = await fetch(`/api/recruitment/${app.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      // Guidance toast — every stage move tells HR exactly which tab owns the
      // follow-up action (schedule the interview / release the offer).
      if (next === 'interview') {
        toast.success(`${candidateName} moved to the Interview stage. Now schedule the interview from Scheduled Interviews → Schedule Interview tab.`, { duration: 7000 });
      } else if (next === 'offered') {
        toast.success(`${candidateName} moved to Offered. Now create and release the offer from the Offer Management tab.`, { duration: 7000 });
      } else if (next === 'shortlisted') {
        toast.success(`Candidate shortlisted. Click “Move to Interview” to advance the stage, then schedule from Scheduled Interviews.`, { duration: 7000 });
      } else {
        toast.success(`${candidateName} moved to ${statusLabel(next)}`);
      }
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setTransitioningApp(null);
    }
  };

  const rejectCandidate = async (app: AppRow, candidateName: string) => {
    setTransitioningApp(app.id);
    try {
      const res = await fetch(`/api/recruitment/${app.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'rejected' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      toast.success(`${candidateName} rejected`);
      setConfirmRejectApp(null);
      await fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reject candidate');
    } finally {
      setTransitioningApp(null);
    }
  };

  const clearFilters = () => {
    setFilters({ jobId: 'all', q: '', source: 'all', minExp: '', maxExp: '', status: 'all', sort: 'newest' });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const header = ['Name', 'Email', 'Phone', 'Applied To', 'Department', 'Experience (years)', 'Skills', 'Source', 'Applied Date', 'Status', 'Resume'];
      const lines = [header.join(',')];
      for (const e of visibleEntries) {
        const app = e.applications?.[0];
        lines.push([
          e.candidateName, e.candidateEmail, e.candidatePhone || '', app?.jobTitle || app?.position || '',
          app?.department || '', String(e.totalExperienceYears ?? ''),
          (e.skills || []).slice(0, 8).join('; '), sourceLabel(app?.source), fmtDate(app?.appliedDate || e.latestAppliedDate),
          statusLabel(app?.status || e.latestStatus), app?.resume ? 'Yes' : 'No',
        ].map(csvEscape).join(','));
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `find-candidates-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${visibleEntries.length} candidate${visibleEntries.length === 1 ? '' : 's'} to CSV`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  /* ═════════════════════════ shared small pieces ══════════════════════════ */

  const statusBadge = (status?: string, extra?: string) => (
    <span className={`inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-[10.5px] font-bold ${statusBadgeCls(status)} ${extra || ''}`}>
      {status === 'shortlisted' && <CheckCircle2 className="h-3 w-3" />}
      {statusLabel(status)}
    </span>
  );

  const skillChips = (skills: string[], max = 4) => {
    if (!skills.length) return <span className="text-[11px] text-slate-400">No skills parsed</span>;
    const shown = skills.slice(0, max);
    const extra = skills.length - shown.length;
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {shown.map(s => (
          <span
            key={s}
            title={s}
            className="inline-flex h-[22px] max-w-[130px] items-center truncate rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-700"
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </span>
        ))}
        {extra > 0 && (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            +{extra} more
          </span>
        )}
      </div>
    );
  };

  /** One-click forward-stage button. `block` renders the full-width card footer variant. */
  const forwardBtn = (app: AppRow, name: string, block?: boolean) => {
    const next = STATUS_META[app.status || '']?.next;
    const nextLabel = STATUS_META[app.status || '']?.nextLabel;
    if (!next || !nextLabel) return null;
    const busy = transitioningApp === app.id;
    const hint = next === 'interview'
      ? 'Advance to the Interview stage — then schedule the slot from Scheduled Interviews → Schedule Interview tab'
      : next === 'offered'
        ? 'Advance to the Offer stage — then create and release the offer from the Offer Management tab'
        : nextLabel;
    if (block) {
      return (
        <button
          onClick={() => transitionStatus(app, next, name)}
          disabled={busy}
          className="inline-flex h-[34px] w-full items-center justify-center gap-1 rounded-md bg-green-600 px-3 text-[11.5px] font-bold text-white shadow-sm shadow-green-600/20 transition hover:bg-green-700 disabled:opacity-60"
          title={hint}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {nextLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      );
    }
    return (
      <button
        onClick={() => transitionStatus(app, next, name)}
        disabled={busy}
        className="inline-flex h-[28px] items-center gap-1 rounded-md bg-green-600 px-2.5 text-[10.5px] font-bold text-white shadow-sm shadow-green-600/20 transition hover:bg-green-700 disabled:opacity-60"
        title={hint}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {nextLabel}
        <ChevronRight className="h-3 w-3" aria-hidden />
      </button>
    );
  };

  /** Reject button (always confirms first).
   *  Application rows: screening scope only (Applied / Screening).
   *  Profile header (`anyStage`): any non-terminal stage — never hired/rejected. */
  const rejectBtn = (app: AppRow, name: string, anyStage?: boolean) => {
    if (app.status === 'hired' || app.status === 'rejected') return null;
    if (!anyStage && app.status !== 'applied' && app.status !== 'screening') return null;
    const busy = transitioningApp === app.id;
    if (confirmRejectApp === app.id) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-1">
          <span className="text-[10.5px] font-bold text-red-700">Reject?</span>
          <button
            onClick={() => rejectCandidate(app, name)}
            disabled={busy}
            className="inline-flex h-[26px] items-center rounded bg-red-600 px-2 text-[10.5px] font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
          >{busy ? '…' : 'Yes'}</button>
          <button
            onClick={() => setConfirmRejectApp(null)}
            className="inline-flex h-[26px] items-center rounded border border-slate-200 bg-white px-2 text-[10.5px] font-bold text-slate-600 transition hover:bg-slate-50"
          >No</button>
        </span>
      );
    }
    return (
      <button
        onClick={() => setConfirmRejectApp(app.id)}
        disabled={busy}
        className="inline-flex h-[28px] items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 text-[10.5px] font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        title="Reject candidate"
      >
        <X className="h-3 w-3" /> Reject
      </button>
    );
  };

  /* ═══════════════════════════ candidate card ═════════════════════════════ */

  const renderCard = (e: CandidateEntry) => {
    const app = e.applications?.[0];
    const status = app?.status || e.latestStatus;
    const meta = STATUS_META[status || ''];
    const exp0 = e.parsedResume?.experience?.[0];
    const appliedTitle = app?.jobTitle || app?.position || '';
    const roleLine = exp0?.role
      ? [exp0.role, exp0.company].filter(Boolean).join(' · ')
      : appliedTitle ? `Applied for ${appliedTitle}` : '';
    const src = sourceLabel(app?.source);
    const detail = [
      e.totalExperienceYears ? `${Number(e.totalExperienceYears).toFixed(1)} yrs experience` : '',
      src !== '—' ? src : '',
      e.matchScore != null ? `${Math.round(e.matchScore)}% match` : '',
    ].filter(Boolean).join(' · ');

    return (
      <div key={e.candidateEmail} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-green-200 hover:shadow">
        {/* identity row — avatar + name/role left, status badge right */}
        <div className="flex items-start gap-2.5">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-green-50 text-[12px] font-extrabold text-green-700">
            {initials(e.candidateName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-extrabold text-slate-900" title={e.candidateName}>{e.candidateName || 'Unknown'}</p>
            <p className="line-clamp-2 break-words text-[11px] leading-4 text-slate-500" title={roleLine}>{roleLine || '—'}</p>
          </div>
          <span
            className={`inline-flex h-[22px] flex-none items-center rounded-full border px-2 text-[10.5px] font-bold capitalize ${statusBadgeCls(status)}`}
            title={statusLabel(status)}
          >
            {statusLabel(status)}
          </span>
        </div>

        {/* one detail line — experience · source · match */}
        <p className="mt-2.5 truncate text-[10px] text-slate-400" title={detail}>{detail || '—'}</p>

        {/* skills — max 4 chips, then "+N more" so cards stay even */}
        <div className="mt-2">{skillChips(e.skills || [], 4)}</div>

        {/* footer — one-click advance button, email, View Profile; always bottom-aligned */}
        <div className="mt-auto pt-3">
          {app && meta?.next ? forwardBtn(app, e.candidateName, true) : null}
          <p className={`truncate text-[10px] text-slate-400 ${app && meta?.next ? 'mt-2' : ''}`} title={e.candidateEmail}>
            {e.candidateEmail || '—'}
          </p>
          <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2.5">
            <button
              onClick={() => openProfile(e.candidateEmail)}
              className="inline-flex h-[28px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-green-700 transition hover:border-green-300 hover:bg-green-50"
            >
              <UserRound className="h-3.5 w-3.5" /> View Profile
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ═══════════════════════════ profile screen ═════════════════════════════ */

  const renderProfile = (e: CandidateEntry) => {
    const primary = e.applications?.[0] || null;
    const parsedNotes = parseApplicationNotes(primary?.notes);
    const parsed = e.parsedResume;
    // Stage guidance — the profile header banner routes HR to the tab that
    // owns the follow-up action for the CURRENT stage (shortlisted / interview
    // / offered). Dismissal is per candidate + per stage, so advancing the
    // stage brings up the next guidance.
    const guidance = primary ? STAGE_GUIDANCE[primary.status || ''] : undefined;
    const bannerKey = `${e.candidateEmail}|${primary?.status || ''}`;
    const showBanner = !!guidance && bannerDismissedFor !== bannerKey;

    // Pipeline stepper — the current stage comes from the primary (first)
    // application; interview_completed maps onto the Interview pill.
    const stageKey = primary?.status === 'interview_completed' ? 'interview' : (primary?.status || '');
    const curIdx = PIPELINE_STAGES.findIndex(s => s.key === stageKey);

    const exp0 = parsed?.experience?.[0];
    const appliedTitle = primary?.jobTitle || primary?.position || '';
    const roleLine = exp0?.role
      ? [exp0.role, exp0.company].filter(Boolean).join(' · ')
      : appliedTitle ? `Applied for ${appliedTitle}` : '';
    const expLine = e.totalExperienceYears ? `${Number(e.totalExperienceYears).toFixed(1)} yrs experience` : '';

    const timeline = [
      ...(e.applications || []).map(a => ({ title: `Applied to ${a.jobTitle || a.position || 'a position'}`, at: a.appliedDate, sub: `Source: ${sourceLabel(a.source)}` })),
      ...parsedNotes.recruiterNotes.map(n => ({ title: 'Recruiter note added', at: n.at, sub: n.text })),
      ...(primary?.updatedAt ? [{ title: 'Application last updated', at: primary.updatedAt, sub: '' }] : []),
    ]
      .filter(ev => ev.at)
      .sort((a, b) => new Date(b.at as string).getTime() - new Date(a.at as string).getTime())
      .slice(0, 12);

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* profile header — identity left; status badge + advance / reject right; pipeline stepper below */}
        <div className={CARD_CLS + ' p-4'}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <button
                onClick={() => { setViewEmail(null); setBannerDismissedFor(null); }}
                className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-green-50 text-[14px] font-extrabold text-green-700">
                {initials(e.candidateName)}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-[17px] font-bold text-slate-900">{e.candidateName || 'Unknown'}</h1>
                <p className="mt-0.5 break-words text-[11.5px] text-slate-500">
                  {[roleLine, expLine].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            </div>
            {primary && (
              <div className="flex flex-none flex-wrap items-center gap-2">
                {statusBadge(primary.status || e.latestStatus)}
                {e.matchScore != null && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">
                    <Star className="h-3 w-3" /> {Math.round(e.matchScore)}% AI match
                  </span>
                )}
                {forwardBtn(primary, e.candidateName)}
                {rejectBtn(primary, e.candidateName, true)}
              </div>
            )}
          </div>

          {/* pipeline stepper — Applied → Screening → Shortlisted → Interview → Offer → Hired */}
          <div className="mt-3 flex w-full flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
            <span className="mr-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Pipeline</span>
            {PIPELINE_STAGES.map((s, i) => (
              <React.Fragment key={s.key}>
                {i > 0 && <ChevronRight className="h-3 w-3 flex-none text-slate-300" aria-hidden />}
                <span
                  className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-[10px] font-bold ${
                    s.key === stageKey
                      ? `border ${statusBadgeCls(stageKey)}`
                      : curIdx >= 0 && i < curIdx
                        ? 'bg-green-50 text-green-600'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
              </React.Fragment>
            ))}
            {primary?.status === 'rejected' && (
              <>
                <ChevronRight className="h-3 w-3 flex-none text-slate-300" aria-hidden />
                <span className="inline-flex h-[22px] items-center rounded-full bg-red-100 px-2.5 text-[10px] font-bold text-red-700">Rejected</span>
              </>
            )}
          </div>

          {showBanner && guidance && (
            <div className="mt-3 flex items-start justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <p className="text-[12px] font-semibold text-green-800">
                  {guidance.headline} <span className="font-normal text-green-700">{guidance.hint}</span>
                </p>
              </div>
              <button onClick={() => setBannerDismissedFor(bannerKey)} title="Dismiss" className="text-green-500 transition hover:text-green-700">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* profile body — full-width Resume + Applied To, then 2-col details, single scroll */}
        <div ref={profileScrollRef} className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          <div className="flex flex-col gap-3">
            {/* resume — preview toggle + download */}
            <div className={CARD_CLS + ' p-4'}>
              <CardHead
                icon={<FileText className="h-4 w-4 text-green-600" />}
                title="Resume"
                right={primary?.resume ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => {
                        if (resumeOpen) setResumeOpen(false);
                        else { setResumeOpen(true); setResumeLoading(true); }
                      }}
                      className="inline-flex h-[28px] items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      {resumeOpen ? 'Hide Resume' : 'View Resume'}
                    </button>
                    <a
                      href={primary.resume}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-[28px] items-center gap-1 rounded-md bg-green-600 px-2.5 text-[11px] font-bold text-white shadow-sm shadow-green-600/20 transition hover:bg-green-700"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </div>
                ) : undefined}
              />
              {primary?.resume ? (
                isPdfResume(primary.resume) ? (
                  resumeOpen ? (
                    <div className="relative">
                      {resumeLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                          <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading resume preview…
                          </div>
                        </div>
                      )}
                      <iframe
                        src={primary.resume}
                        title={`${e.candidateName} resume preview`}
                        className="h-[440px] w-full rounded-lg border border-slate-200 bg-white"
                        onLoad={() => setResumeLoading(false)}
                      />
                    </div>
                  ) : (
                    <p className="text-[11.5px] text-slate-500">Resume on file — click “View Resume” to preview it here, or download a copy.</p>
                  )
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
                    <FileText className="h-8 w-8 text-slate-400" />
                    <p className="text-[12px] font-semibold text-slate-600">Resume on file (non-PDF)</p>
                    <p className="text-[11px] text-slate-400">Use the Download button above to open it.</p>
                  </div>
                )
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
                  <FileText className="h-8 w-8 text-slate-300" />
                  <p className="text-[12px] font-semibold text-slate-500">No resume uploaded</p>
                  <p className="text-[11px] text-slate-400">The candidate did not attach a resume to this application.</p>
                </div>
              )}
            </div>

            {/* applied to — per-application stage actions */}
            <div className={CARD_CLS + ' p-4'}>
              <CardHead
                icon={<Briefcase className="h-4 w-4 text-green-600" />}
                title={`Applied To (${(e.applications || []).length})`}
              />
              <div className="space-y-2">
                {(e.applications || []).map(a => (
                  <div key={a.id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-bold text-slate-800" title={a.jobTitle || a.position || 'Position not specified'}>
                          {a.jobTitle || a.position || 'Position not specified'}
                        </div>
                        <div className="truncate text-[10.5px] text-slate-500">
                          {a.department || '—'}{a.company ? ` · ${a.company}` : ''} · Applied {fmtDate(a.appliedDate)} · Source: {sourceLabel(a.source)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {statusBadge(a.status)}
                        {forwardBtn(a, e.candidateName)}
                        {rejectBtn(a, e.candidateName)}
                      </div>
                    </div>
                  </div>
                ))}
                {(!e.applications || e.applications.length === 0) && (
                  <p className="text-[11.5px] text-slate-400">No linked applications.</p>
                )}
              </div>
            </div>

            {/* details — two columns */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* contact */}
              <div className={CARD_CLS + ' p-4'}>
                <CardHead icon={<Mail className="h-4 w-4 text-green-600" />} title="Contact" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InfoCell label="Email" value={e.candidateEmail || '—'} />
                  <InfoCell label="Phone" value={e.candidatePhone || parsed?.phone || 'Not added'} />
                  <InfoCell label="Source" value={sourceLabel(primary?.source)} />
                  <InfoCell label="Location" value={parsed?.location || 'Not added'} />
                </div>
              </div>

              {/* skills */}
              <div className={CARD_CLS + ' p-4'}>
                <CardHead icon={<Award className="h-4 w-4 text-green-600" />} title={`Skills (${(e.skills || []).length})`} />
                {(e.skills || []).length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(e.skills || []).map(s => (
                      <span key={s} title={s} className="inline-flex h-[22px] items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700">
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </span>
                    ))}
                  </div>
                ) : <p className="text-[11.5px] text-slate-400">No skills parsed from the resume yet.</p>}
              </div>

              {/* experience */}
              <div className={CARD_CLS + ' p-4'}>
                <CardHead
                  icon={<Briefcase className="h-4 w-4 text-green-600" />}
                  title="Experience"
                  right={<span className="text-[10.5px] font-semibold text-slate-400">Total {e.totalExperienceYears ? `${Number(e.totalExperienceYears).toFixed(1)} yrs` : '—'}</span>}
                />
                {(parsed?.experience || []).length ? (
                  <div className="space-y-2">
                    {(parsed?.experience || []).map((x, i) => (
                      <div key={i} className="rounded-lg border border-slate-200 px-2.5 py-2">
                        <div className="text-[12px] font-bold text-slate-800">{x.role || 'Role'}</div>
                        <div className="text-[10.5px] text-slate-500">{x.company || 'Company'} · {x.duration || 'Duration N/A'}</div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[11.5px] text-slate-400">No experience entries parsed from the resume.</p>}
              </div>

              {/* education */}
              <div className={CARD_CLS + ' p-4'}>
                <CardHead icon={<Award className="h-4 w-4 text-green-600" />} title="Education" />
                {(parsed?.education || []).length ? (
                  <div className="space-y-2">
                    {(parsed?.education || []).map((x, i) => (
                      <div key={i} className="rounded-lg border border-slate-200 px-2.5 py-2">
                        <div className="text-[12px] font-bold text-slate-800">{x.degree || 'Degree'}</div>
                        <div className="text-[10.5px] text-slate-500">{x.institution || 'Institution'}{x.year ? ` · ${x.year}` : ''}</div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[11.5px] text-slate-400">No education entries parsed from the resume.</p>}
              </div>

              {/* certifications */}
              {(parsed?.certifications || []).length > 0 && (
                <div className={CARD_CLS + ' p-4'}>
                  <CardHead icon={<Award className="h-4 w-4 text-green-600" />} title={`Certifications (${(parsed?.certifications || []).length})`} />
                  <div className="flex flex-wrap gap-1.5">
                    {(parsed?.certifications || []).map((c, i) => (
                      <span key={i} title={c} className="inline-flex h-[22px] max-w-[240px] items-center truncate rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-semibold text-blue-700">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* screening answers */}
              <div className={CARD_CLS + ' p-4'}>
                <CardHead icon={<StickyNote className="h-4 w-4 text-green-600" />} title="Screening Answers" />
                {primary?.coverLetter ? (
                  <div className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-[11.5px] leading-relaxed text-slate-700">
                    {primary.coverLetter}
                  </div>
                ) : (
                  <p className="text-[11.5px] text-slate-400">No screening answers on file for this application.</p>
                )}
              </div>

              {/* activity timeline */}
              <div className={CARD_CLS + ' p-4'}>
                <CardHead icon={<Clock className="h-4 w-4 text-green-600" />} title="Activity Timeline" />
                {timeline.length ? (
                  <div className="relative ml-1.5 space-y-3 border-l border-slate-200 pl-4">
                    {timeline.map((ev, i) => (
                      <div key={i} className="relative">
                        <span className="absolute -left-[21px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-green-500" />
                        <div className="text-[11.5px] font-semibold text-slate-700">{ev.title}</div>
                        <div className="text-[10.5px] text-slate-400">{fmtDate(ev.at as string)}{ev.sub ? ` · ${ev.sub}` : ''}</div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[11.5px] text-slate-400">No activity recorded yet.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ═════════════════════════════ list screen ══════════════════════════════ */

  const kpiCards = [
    { key: 'all', label: 'Total Candidates', value: kpis.total, icon: Users, tone: 'text-slate-700', ring: 'bg-slate-100 text-slate-600' },
    { key: 'applied', label: 'New Applications', value: kpis.applied, icon: UserPlus, tone: 'text-blue-600', ring: 'bg-blue-50 text-blue-600' },
    { key: 'screening', label: 'In Screening', value: kpis.screening, icon: UserCheck, tone: 'text-amber-600', ring: 'bg-amber-50 text-amber-600' },
    { key: 'shortlisted', label: 'Shortlisted', value: kpis.shortlisted, icon: CheckCircle2, tone: 'text-green-600', ring: 'bg-green-50 text-green-600' },
    { key: 'interview', label: 'In Interview', value: kpis.interview, icon: Calendar, tone: 'text-purple-600', ring: 'bg-purple-50 text-purple-600' },
    { key: 'offered', label: 'Offered', value: kpis.offered, icon: Star, tone: 'text-teal-600', ring: 'bg-teal-50 text-teal-600' },
  ];

  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 8rem)', minHeight: 560 }}>
      {viewEmail && profileEntry ? (
        renderProfile(profileEntry)
      ) : (
        <>
          {/* header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2">
                <BackButton fallbackHref="/recruitment" />
              </div>
              <div className="flex items-center gap-1.5 text-sm text-slate-500">
                <span>Recruitment</span><span className="text-slate-400">/</span>
                <span className="font-medium text-slate-700">Find Candidates</span>
              </div>
              <h1 className="mt-0.5 text-xl font-bold text-slate-900">Find Candidates</h1>
              <p className="mt-1 text-sm text-slate-500">Search, review, screen, and shortlist candidates.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchData()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || visibleEntries.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-[11.5px] font-bold text-white shadow-sm shadow-green-600/25 transition hover:bg-green-700 disabled:opacity-60"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Export
              </button>
            </div>
          </div>

          {/* summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {kpiCards.map(k => (
              <button
                key={k.key}
                onClick={() => setFilters(f => ({ ...f, status: k.key === 'all' ? 'all' : k.key }))}
                className={`${CARD_CLS} flex items-center gap-3 p-3 text-left transition hover:border-green-300 hover:shadow`}
                title={k.key === 'all' ? 'Show all candidates' : `Filter by ${statusLabel(k.key)}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.ring}`}>
                  <k.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{k.label}</span>
                  <span className={`block text-[18px] font-bold leading-tight ${k.tone}`}>{loading ? '…' : k.value}</span>
                </span>
              </button>
            ))}
          </div>

          {/* compact filter bar — every field on one row; wraps gracefully below ~1200px */}
          <div className={CARD_CLS + ' flex flex-wrap items-center gap-1.5 px-2.5 py-2'}>
            <span className="hidden text-[9px] font-extrabold uppercase tracking-wider text-slate-400 sm:inline">Filter</span>
            <select
              value={filters.jobId}
              onChange={ev => setFilters(f => ({ ...f, jobId: ev.target.value }))}
              className={FILTER_CLS + ' w-[150px] flex-none'}
              title="Job Posting"
            >
              <option value="all">All job postings</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.q}
                onChange={ev => setFilters(f => ({ ...f, q: ev.target.value }))}
                placeholder="Search by candidate name, email, skill, or job title…"
                className={FILTER_CLS + ' w-full pl-7'}
              />
            </div>
            <select
              value={filters.source}
              onChange={ev => setFilters(f => ({ ...f, source: ev.target.value }))}
              className={FILTER_CLS + ' w-[104px] flex-none'}
              title="Source"
            >
              <option value="all">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="hidden text-[9px] font-extrabold uppercase tracking-wider text-slate-400 md:inline">Exp</span>
            <input
              type="number" min="0" placeholder="Min"
              value={filters.minExp}
              onChange={ev => setFilters(f => ({ ...f, minExp: ev.target.value }))}
              className={FILTER_CLS + ' w-[56px] flex-none'}
              title="Min experience (years)"
            />
            <span className="text-[11px] text-slate-400">–</span>
            <input
              type="number" min="0" placeholder="Max"
              value={filters.maxExp}
              onChange={ev => setFilters(f => ({ ...f, maxExp: ev.target.value }))}
              className={FILTER_CLS + ' w-[56px] flex-none'}
              title="Max experience (years)"
            />
            <select
              value={filters.status}
              onChange={ev => setFilters(f => ({ ...f, status: ev.target.value }))}
              className={FILTER_CLS + ' w-[118px] flex-none'}
              title="Status"
            >
              <option value="all">All statuses</option>
              <option value="applied">Applied</option>
              <option value="screening">Screening</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="interview">In Interviews</option>
              <option value="offered">Offered</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              value={filters.sort}
              onChange={ev => setFilters(f => ({ ...f, sort: ev.target.value }))}
              className={FILTER_CLS + ' w-[142px] flex-none'}
              title="Sort by"
            >
              <option value="newest">Sort: Newest first</option>
              <option value="match">Sort: Match score</option>
              <option value="experience">Sort: Experience</option>
            </select>
            <button
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="inline-flex h-[30px] flex-none items-center gap-1 rounded-[7px] border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
            >
              <X className="h-3 w-3" /> Clear Filters
            </button>
            <span className="ml-auto whitespace-nowrap text-[11px] font-semibold text-slate-400">
              {loading ? 'Loading…' : `${visibleEntries.length} of ${entries.length} candidate${entries.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {/* error */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold">{error}</p>
                <button onClick={() => fetchData()} className="mt-1 font-bold text-red-700 underline">Try again</button>
              </div>
            </div>
          )}

          {/* candidate cards — responsive grid, internal vertical scroll only */}
          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {loading && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-2.5">
                      <div className="h-10 w-10 flex-none animate-pulse rounded-full bg-slate-100" />
                      <div className="min-w-0 flex-1 space-y-1.5 pt-1">
                        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                        <div className="h-2.5 w-3/4 animate-pulse rounded bg-slate-100" />
                      </div>
                    </div>
                    <div className="mt-3 h-2.5 w-2/3 animate-pulse rounded bg-slate-100" />
                    <div className="mt-3 flex gap-1.5">
                      <div className="h-[22px] w-16 animate-pulse rounded-md bg-slate-100" />
                      <div className="h-[22px] w-16 animate-pulse rounded-md bg-slate-100" />
                      <div className="h-[22px] w-16 animate-pulse rounded-md bg-slate-100" />
                    </div>
                    <div className="mt-4 h-[34px] animate-pulse rounded-md bg-slate-100" />
                  </div>
                ))}
              </div>
            )}

            {!loading && !error && entries.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <Users className="h-9 w-9 text-slate-300" />
                <p className="text-[13px] font-bold text-slate-700">No candidates yet</p>
                <p className="max-w-sm text-[11.5px] text-slate-400">
                  Candidates appear here as soon as they apply to your job postings. Share your postings or connect the careers page to start receiving applications.
                </p>
              </div>
            )}

            {!loading && !error && entries.length > 0 && visibleEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <Search className="h-9 w-9 text-slate-300" />
                <p className="text-[13px] font-bold text-slate-700">No candidates match these filters</p>
                <p className="text-[11.5px] text-slate-400">Try widening the search or clearing a filter or two.</p>
                <button
                  onClick={clearFilters}
                  className="mt-1 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-green-700 transition hover:bg-green-50"
                >
                  <X className="h-3 w-3" /> Clear Filters
                </button>
              </div>
            )}

            {!loading && !error && visibleEntries.length > 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleEntries.map(e => renderCard(e))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
