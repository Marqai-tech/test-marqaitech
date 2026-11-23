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
 *   - Summary cards: Total Candidates / New Applications / In Screening / Shortlisted
 *   - Filter card: Job Posting, search, Source, Experience, Status, Sort, Clear Filters
 *   - Candidate list: aligned compact rows, internal vertical scroll only
 *   - "View Profile" → FULL-PAGE profile (never a modal): resume preview +
 *     download, skills, experience, education, screening answers, recruiter
 *     notes, tags, activity timeline, per-application status actions
 *
 * Status flow (forward-only): applied → screening → shortlisted. Rejected is
 * terminal and always asks for confirmation. Backward moves are not offered.
 *
 * Data: everything dynamic from the existing APIs.
 *   - GET  /api/recruitment/candidate-search  (aggregated candidates; now also
 *     returns source / notes / resume / coverLetter per application)
 *   - GET  /api/recruitment?limit=200         (job postings for the filter)
 *   - PATCH /api/recruitment/:applicationId   ({ status } for stage moves,
 *     { recruiterNotes | tags } stored inside the notes JSON next to the AI
 *     feedback keys — nothing is overwritten)
 *   No candidate data is hardcoded; every value on screen comes from the DB.
 */
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Search, RefreshCw, Download, X, Eye, FileText, Tag, StickyNote, Clock, MapPin,
  Mail, Phone, Briefcase, Award, Star, ArrowRight, ArrowLeft, CheckCircle2,
  Ban, Loader2, AlertTriangle, Calendar, Users, UserPlus, UserCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

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

const INPUT_CLS = 'h-[34px] w-full rounded-[7px] border border-slate-300 bg-white px-2.5 text-[12px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';
const CARD_CLS = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const SECTION_TITLE = 'text-[12.5px] font-bold text-slate-800';
const LABEL_CLS = 'text-[11px] font-semibold text-slate-500';

const STATUS_META: Record<string, { label: string; badge: string; next?: string; nextLabel?: string }> = {
  applied: { label: 'Applied', badge: 'bg-blue-50 text-blue-700 border-blue-200', next: 'screening', nextLabel: 'Move to Screening' },
  screening: { label: 'Screening', badge: 'bg-amber-50 text-amber-700 border-amber-200', next: 'shortlisted', nextLabel: 'Shortlist' },
  shortlisted: { label: 'Shortlisted', badge: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', badge: 'bg-red-50 text-red-700 border-red-200' },
  interview: { label: 'In Interviews', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  interview_completed: { label: 'Interview Done', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  offered: { label: 'Offered', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  hired: { label: 'Hired', badge: 'bg-green-100 text-green-800 border-green-300' },
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

/** notes field doubles as AI-feedback JSON; recruiter notes/tags live inside it. */
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
  const [resumeLoading, setResumeLoading] = useState(false);
  const profileScrollRef = useRef<HTMLDivElement | null>(null);

  // actions
  const [transitioningApp, setTransitioningApp] = useState<string | null>(null);
  const [confirmRejectApp, setConfirmRejectApp] = useState<string | null>(null);
  // inline row composers
  const [noteRowEmail, setNoteRowEmail] = useState<string | null>(null);
  const [tagRowEmail, setTagRowEmail] = useState<string | null>(null);
  const [rowNoteText, setRowNoteText] = useState('');
  const [rowTagText, setRowTagText] = useState('');
  // profile composers
  const [profileNoteText, setProfileNoteText] = useState('');
  const [profileTagText, setProfileTagText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
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
    let applied = 0, screening = 0, shortlisted = 0;
    for (const e of entries) {
      for (const a of e.applications || []) {
        if (a.status === 'applied') applied += 1;
        else if (a.status === 'screening') screening += 1;
        else if (a.status === 'shortlisted') shortlisted += 1;
      }
    }
    return { total: entries.length, applied, screening, shortlisted };
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
    setResumeLoading(true);
    setProfileNoteText('');
    setProfileTagText('');
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
      if (next === 'shortlisted') {
        toast.success('Candidate shortlisted. Continue interview scheduling from Scheduled Interviews.');
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

  /** Persist recruiter notes / tags on the primary application (notes JSON). */
  const persistNotes = async (app: AppRow, patch: { recruiterNotes?: RecruiterNote[]; tags?: string[] }) => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/recruitment/${app.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      await fetchData();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
      return false;
    } finally {
      setSavingNotes(false);
    }
  };

  const saveNote = async (app: AppRow | null, email: string, text: string, fromProfile: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) { toast.error('Note cannot be empty'); return; }
    if (!app) { toast.error('No application linked to this candidate'); return; }
    const parsed = parseApplicationNotes(app.notes);
    const note: RecruiterNote = { text: trimmed, at: new Date().toISOString() };
    const ok = await persistNotes(app, { recruiterNotes: [note, ...parsed.recruiterNotes] });
    if (ok) {
      toast.success('Note added');
      if (fromProfile) setProfileNoteText(''); else { setRowNoteText(''); setNoteRowEmail(null); }
    }
  };

  const addTag = async (app: AppRow | null, text: string, fromProfile: boolean) => {
    const tag = text.trim();
    if (!tag) { toast.error('Enter a tag first'); return; }
    if (!app) { toast.error('No application linked to this candidate'); return; }
    const parsed = parseApplicationNotes(app.notes);
    if (parsed.tags.some(t => t.toLowerCase() === tag.toLowerCase())) { toast.error('Tag already added'); return; }
    const ok = await persistNotes(app, { tags: [...parsed.tags, tag] });
    if (ok) {
      toast.success('Tag added');
      if (fromProfile) setProfileTagText(''); else { setRowTagText(''); setTagRowEmail(null); }
    }
  };

  const removeTag = async (app: AppRow | null, tag: string) => {
    if (!app) return;
    const parsed = parseApplicationNotes(app.notes);
    const ok = await persistNotes(app, { tags: parsed.tags.filter(t => t !== tag) });
    if (ok) toast.success('Tag removed');
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
        const parsed = parseApplicationNotes(app?.notes);
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

  const resumeDot = (app?: AppRow) => (
    <span
      title={app?.resume ? 'Resume on file — click View Profile to preview' : 'No resume uploaded'}
      className={`inline-flex h-[22px] w-[26px] items-center justify-center rounded-md border ${app?.resume ? 'border-green-200 bg-green-50 text-green-600' : 'border-slate-200 bg-slate-50 text-slate-300'}`}
    >
      <FileText className="h-3 w-3" />
    </span>
  );

  const skillChips = (skills: string[], max = 3) => {
    if (!skills.length) return <span className="text-[11px] text-slate-400">No skills parsed</span>;
    const shown = skills.slice(0, max);
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {shown.map(s => (
          <span key={s} className="inline-flex h-[20px] max-w-[110px] items-center truncate rounded-md border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </span>
        ))}
        {skills.length > max && (
          <span className="text-[10px] font-semibold text-slate-400">+{skills.length - max}</span>
        )}
      </div>
    );
  };

  const forwardBtn = (app: AppRow, name: string, compact?: boolean) => {
    const meta = STATUS_META[app.status || ''];
    if (!meta?.next) return null;
    return (
      <button
        onClick={() => transitionStatus(app, meta.next as string, name)}
        disabled={transitioningApp === app.id}
        className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-[10.5px] font-bold text-white shadow-sm shadow-green-600/20 transition hover:bg-green-700 disabled:opacity-60"
        title={meta.nextLabel}
      >
        {transitioningApp === app.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
        {compact ? meta.nextLabel : meta.nextLabel}
      </button>
    );
  };

  const rejectBtn = (app: AppRow, name: string) => {
    // Rejection is a screening-scope decision: only offered while this screen
    // owns the candidate (Applied / Screening). Shortlisted and beyond are
    // managed further down the pipeline; rejected is terminal.
    if (app.status !== 'applied' && app.status !== 'screening') return null;
    if (confirmRejectApp === app.id) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5">
          <span className="text-[10.5px] font-bold text-red-700">Reject?</span>
          <button
            onClick={() => rejectCandidate(app, name)}
            disabled={transitioningApp === app.id}
            className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
          >{transitioningApp === app.id ? '…' : 'Yes'}</button>
          <button
            onClick={() => setConfirmRejectApp(null)}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50"
          >No</button>
        </span>
      );
    }
    return (
      <button
        onClick={() => setConfirmRejectApp(app.id)}
        disabled={transitioningApp === app.id}
        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10.5px] font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        title="Reject candidate"
      >
        <Ban className="h-3 w-3" /> Reject
      </button>
    );
  };

  /* ═══════════════════════════ candidate row ══════════════════════════════ */

  const renderRow = (e: CandidateEntry) => {
    const app = e.applications?.[0];
    const parsed = parseApplicationNotes(app?.notes);
    const match = e.matchScore;
    return (
      <div key={e.candidateEmail}>
        <div className="grid grid-cols-1 items-center gap-x-3 gap-y-1.5 px-3 py-2.5 transition hover:bg-slate-50/70 lg:grid-cols-[minmax(180px,1.4fr)_minmax(140px,1.1fr)_54px_minmax(170px,1.7fr)_80px_82px_118px_auto]">
          {/* candidate */}
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-bold text-emerald-700">
              {initials(e.candidateName)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-bold text-slate-800">{e.candidateName || 'Unknown'}</div>
              <div className="flex min-w-0 items-center gap-1 text-[10.5px] text-slate-500">
                <Mail className="h-3 w-3 shrink-0" /><span className="truncate">{e.candidateEmail}</span>
              </div>
            </div>
          </div>
          {/* applied to */}
          <div className="min-w-0">
            <div className="truncate text-[11.5px] font-semibold text-slate-700">{app?.jobTitle || app?.position || 'Position not specified'}</div>
            <div className="truncate text-[10.5px] text-slate-500">{app?.department || '—'}{app?.company ? ` · ${app.company}` : ''}</div>
          </div>
          {/* experience */}
          <div className="text-[11.5px] font-semibold text-slate-700">
            {e.totalExperienceYears ? `${Number(e.totalExperienceYears).toFixed(1)}y` : '—'}
          </div>
          {/* skills */}
          <div className="min-w-0">{skillChips(e.skills || [])}</div>
          {/* source */}
          <div className="truncate text-[11px] font-medium text-slate-600">{sourceLabel(app?.source)}</div>
          {/* applied date */}
          <div className="flex items-center gap-1 text-[11px] text-slate-600">
            <Calendar className="h-3 w-3 shrink-0 text-slate-400" />{fmtDate(app?.appliedDate || e.latestAppliedDate)}
          </div>
          {/* status + resume */}
          <div className="flex items-center gap-1.5">
            {statusBadge(app?.status || e.latestStatus)}
            {resumeDot(app)}
            {match != null && (
              <span title="AI match score" className="inline-flex h-[22px] items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-bold text-slate-600">
                <Star className="h-2.5 w-2.5 text-amber-500" />{Math.round(match)}%
              </span>
            )}
          </div>
          {/* actions */}
          <div className="flex items-center justify-start gap-1 lg:justify-end">
            {(app?.status === 'shortlisted') && (
              <span title="Next step happens in Scheduled Interviews" className="mr-1 hidden text-[10px] font-semibold text-green-600 xl:inline">
                Interview stage →
              </span>
            )}
            {app && forwardBtn(app, e.candidateName, true)}
            {app && rejectBtn(app, e.candidateName)}
            {app && (
              <MiniIconBtn title="Add note" active={noteRowEmail === e.candidateEmail} onClick={() => { setNoteRowEmail(noteRowEmail === e.candidateEmail ? null : e.candidateEmail); setTagRowEmail(null); setRowNoteText(''); }}>
                <StickyNote className="h-3.5 w-3.5" />
              </MiniIconBtn>
            )}
            {app && (
              <MiniIconBtn title="Add tag" active={tagRowEmail === e.candidateEmail} onClick={() => { setTagRowEmail(tagRowEmail === e.candidateEmail ? null : e.candidateEmail); setNoteRowEmail(null); setRowTagText(''); }}>
                <Tag className="h-3.5 w-3.5" />
              </MiniIconBtn>
            )}
            {app?.resume && (
              <MiniIconBtn title="View resume" onClick={() => openProfile(e.candidateEmail)}>
                <FileText className="h-3.5 w-3.5" />
              </MiniIconBtn>
            )}
            <button
              onClick={() => openProfile(e.candidateEmail)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] font-bold text-green-700 transition hover:border-green-300 hover:bg-green-50"
            >
              <Eye className="h-3 w-3" /> View Profile
            </button>
          </div>
        </div>

        {/* inline note composer (no modals) */}
        {noteRowEmail === e.candidateEmail && app && (
          <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <StickyNote className="h-3.5 w-3.5 shrink-0 text-green-600" />
              <input
                autoFocus
                value={rowNoteText}
                onChange={ev => setRowNoteText(ev.target.value)}
                onKeyDown={ev => { if (ev.key === 'Enter') saveNote(app, e.candidateEmail, rowNoteText, false); }}
                placeholder={`Note about ${e.candidateName}…`}
                className={INPUT_CLS}
              />
              <button
                onClick={() => saveNote(app, e.candidateEmail, rowNoteText, false)}
                disabled={savingNotes}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-[10.5px] font-bold text-white transition hover:bg-green-700 disabled:opacity-60"
              >
                {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save Note
              </button>
            </div>
          </div>
        )}

        {/* inline tag composer (no modals) */}
        {tagRowEmail === e.candidateEmail && app && (
          <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="h-3.5 w-3.5 shrink-0 text-green-600" />
              {parsed.tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
                  {t}
                  <button onClick={() => removeTag(app, t)} title="Remove tag" className="text-emerald-500 transition hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                autoFocus
                value={rowTagText}
                onChange={ev => setRowTagText(ev.target.value)}
                onKeyDown={ev => { if (ev.key === 'Enter') addTag(app, rowTagText, false); }}
                placeholder="Add tag…"
                className={`${INPUT_CLS} max-w-[220px]`}
              />
              <button
                onClick={() => addTag(app, rowTagText, false)}
                disabled={savingNotes}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-[10.5px] font-bold text-white transition hover:bg-green-700 disabled:opacity-60"
              >
                {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Add Tag
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ═══════════════════════════ profile screen ═════════════════════════════ */

  const renderProfile = (e: CandidateEntry) => {
    const primary = e.applications?.[0] || null;
    const parsedNotes = parseApplicationNotes(primary?.notes);
    const parsed = e.parsedResume;
    // Post-shortlist guidance — every shortlisted candidate's profile carries
    // the routing message (dismissable for the session).
    const showBanner = primary?.status === 'shortlisted' && bannerDismissedFor !== e.candidateEmail;
    const timeline = [
      ...(e.applications || []).map(a => ({ icon: 'job', title: `Applied to ${a.jobTitle || a.position || 'a position'}`, at: a.appliedDate, sub: `Source: ${sourceLabel(a.source)}` })),
      ...parsedNotes.recruiterNotes.map(n => ({ icon: 'note', title: 'Recruiter note added', at: n.at, sub: n.text })),
      ...(primary?.updatedAt ? [{ icon: 'clock', title: 'Application last updated', at: primary.updatedAt, sub: '' }] : []),
    ]
      .filter(ev => ev.at)
      .sort((a, b) => new Date(b.at as string).getTime() - new Date(a.at as string).getTime())
      .slice(0, 12);

    return (
      <div className="flex min-h-0 flex-col gap-3">
        {/* profile header */}
        <div className={CARD_CLS + ' p-4'}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <button
                onClick={() => { setViewEmail(null); setBannerDismissedFor(null); }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[14px] font-bold text-emerald-700">
                {initials(e.candidateName)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-[17px] font-bold text-slate-900">{e.candidateName || 'Unknown'}</h1>
                  {statusBadge(primary?.status || e.latestStatus)}
                  {e.matchScore != null && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">
                      <Star className="h-3 w-3" /> {Math.round(e.matchScore)}% AI match
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{e.candidateEmail || '—'}</span>
                  <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{e.candidatePhone || parsed?.phone || '—'}</span>
                  {(parsed?.location) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{parsed.location}</span>}
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{e.totalExperienceYears ? `${Number(e.totalExperienceYears).toFixed(1)} years experience` : 'Experience not parsed'}</span>
                </div>
              </div>
            </div>
            {primary && (
              <div className="flex flex-wrap items-center gap-1.5">
                {forwardBtn(primary, e.candidateName)}
                {rejectBtn(primary, e.candidateName)}
              </div>
            )}
          </div>
          {showBanner && (
            <div className="mt-3 flex items-start justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <p className="text-[12px] font-semibold text-green-800">
                  Candidate shortlisted. Continue interview scheduling from Scheduled Interviews.
                </p>
              </div>
              <button onClick={() => setBannerDismissedFor(e.candidateEmail)} title="Dismiss" className="text-green-500 transition hover:text-green-700">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* profile body — two columns, single scroll */}
        <div ref={profileScrollRef} className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pr-0.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* left column */}
          <div className="flex flex-col gap-3">
            {/* applied to */}
            <div className={CARD_CLS + ' p-4'}>
              <div className="mb-2.5 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-green-600" />
                <h3 className={SECTION_TITLE}>Applied To ({(e.applications || []).length})</h3>
              </div>
              <div className="space-y-2">
                {(e.applications || []).map(a => (
                  <div key={a.id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-bold text-slate-800">{a.jobTitle || a.position || 'Position not specified'}</div>
                        <div className="truncate text-[10.5px] text-slate-500">{a.department || '—'}{a.company ? ` · ${a.company}` : ''} · Applied {fmtDate(a.appliedDate)} · Source: {sourceLabel(a.source)}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {statusBadge(a.status)}
                        {forwardBtn(a, e.candidateName, true)}
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

            {/* skills */}
            <div className={CARD_CLS + ' p-4'}>
              <div className="mb-2.5 flex items-center gap-2">
                <Award className="h-4 w-4 text-green-600" />
                <h3 className={SECTION_TITLE}>Skills ({(e.skills || []).length})</h3>
              </div>
              {(e.skills || []).length ? (
                <div className="flex flex-wrap gap-1.5">
                  {(e.skills || []).map(s => (
                    <span key={s} className="inline-flex h-[22px] items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700">
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </span>
                  ))}
                </div>
              ) : <p className="text-[11.5px] text-slate-400">No skills parsed from the resume yet.</p>}
            </div>

            {/* experience */}
            <div className={CARD_CLS + ' p-4'}>
              <div className="mb-2.5 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-green-600" />
                <h3 className={SECTION_TITLE}>Experience</h3>
                <span className="text-[10.5px] font-semibold text-slate-400">Total {e.totalExperienceYears ? `${Number(e.totalExperienceYears).toFixed(1)} yrs` : '—'}</span>
              </div>
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
              <div className="mb-2.5 flex items-center gap-2">
                <Award className="h-4 w-4 text-green-600" />
                <h3 className={SECTION_TITLE}>Education</h3>
              </div>
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
                <div className="mb-2.5 flex items-center gap-2">
                  <Award className="h-4 w-4 text-green-600" />
                  <h3 className={SECTION_TITLE}>Certifications ({(parsed?.certifications || []).length})</h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(parsed?.certifications || []).map((c, i) => (
                    <span key={i} className="inline-flex h-[22px] max-w-[240px] items-center truncate rounded-md border border-blue-200 bg-blue-50 px-2 text-[11px] font-semibold text-blue-700">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* right column */}
          <div className="flex flex-col gap-3">
            {/* resume */}
            <div className={CARD_CLS + ' p-4'}>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-600" />
                  <h3 className={SECTION_TITLE}>Resume</h3>
                </div>
                {primary?.resume && (
                  <a
                    href={primary.resume}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-[10.5px] font-bold text-white shadow-sm shadow-green-600/20 transition hover:bg-green-700"
                  >
                    <Download className="h-3 w-3" /> Download
                  </a>
                )}
              </div>
              {primary?.resume ? (
                isPdfResume(primary.resume) ? (
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
                      className="h-72 w-full rounded-lg border border-slate-200 bg-white"
                      onLoad={() => setResumeLoading(false)}
                    />
                  </div>
                ) : (
                  <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
                    <FileText className="h-8 w-8 text-slate-400" />
                    <p className="text-[12px] font-semibold text-slate-600">Resume on file (non-PDF)</p>
                    <p className="text-[11px] text-slate-400">Use the Download button above to open it.</p>
                  </div>
                )
              ) : (
                <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
                  <FileText className="h-8 w-8 text-slate-300" />
                  <p className="text-[12px] font-semibold text-slate-500">No resume uploaded</p>
                  <p className="text-[11px] text-slate-400">The candidate did not attach a resume to this application.</p>
                </div>
              )}
            </div>

            {/* screening answers */}
            <div className={CARD_CLS + ' p-4'}>
              <div className="mb-2.5 flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-green-600" />
                <h3 className={SECTION_TITLE}>Screening Answers</h3>
              </div>
              {primary?.coverLetter ? (
                <div className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-[11.5px] leading-relaxed text-slate-700">
                  {primary.coverLetter}
                </div>
              ) : (
                <p className="text-[11.5px] text-slate-400">No screening answers on file for this application.</p>
              )}
            </div>

            {/* recruiter notes */}
            <div className={CARD_CLS + ' p-4'}>
              <div className="mb-2.5 flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-green-600" />
                <h3 className={SECTION_TITLE}>Recruiter Notes ({parsedNotes.recruiterNotes.length})</h3>
              </div>
              {primary ? (
                <div className="space-y-2.5">
                  {parsedNotes.legacy && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-[11.5px] text-slate-600">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Earlier note</span>
                      <p className="mt-1 whitespace-pre-wrap">{parsedNotes.legacy}</p>
                    </div>
                  )}
                  {parsedNotes.recruiterNotes.map((n, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 p-2.5">
                      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                        <span className="font-bold uppercase tracking-wide">Recruiter</span>
                        <span>{new Date(n.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[11.5px] text-slate-700">{n.text}</p>
                    </div>
                  ))}
                  {parsedNotes.recruiterNotes.length === 0 && !parsedNotes.legacy && (
                    <p className="text-[11.5px] text-slate-400">No notes yet — add the first screening note below.</p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      value={profileNoteText}
                      onChange={ev => setProfileNoteText(ev.target.value)}
                      onKeyDown={ev => { if (ev.key === 'Enter') saveNote(primary, e.candidateEmail, profileNoteText, true); }}
                      placeholder="Add a screening note…"
                      className={INPUT_CLS}
                    />
                    <button
                      onClick={() => saveNote(primary, e.candidateEmail, profileNoteText, true)}
                      disabled={savingNotes}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-[10.5px] font-bold text-white transition hover:bg-green-700 disabled:opacity-60"
                    >
                      {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Add Note
                    </button>
                  </div>
                </div>
              ) : <p className="text-[11.5px] text-slate-400">No application linked — notes unavailable.</p>}
            </div>

            {/* tags */}
            <div className={CARD_CLS + ' p-4'}>
              <div className="mb-2.5 flex items-center gap-2">
                <Tag className="h-4 w-4 text-green-600" />
                <h3 className={SECTION_TITLE}>Tags ({parsedNotes.tags.length})</h3>
              </div>
              {primary ? (
                <div className="space-y-2">
                  {parsedNotes.tags.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {parsedNotes.tags.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                          {t}
                          <button onClick={() => removeTag(primary, t)} title="Remove tag" className="text-emerald-500 transition hover:text-red-500">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : <p className="text-[11.5px] text-slate-400">No tags yet.</p>}
                  <div className="flex items-center gap-2">
                    <input
                      value={profileTagText}
                      onChange={ev => setProfileTagText(ev.target.value)}
                      onKeyDown={ev => { if (ev.key === 'Enter') addTag(primary, profileTagText, true); }}
                      placeholder="Add tag…"
                      className={INPUT_CLS}
                    />
                    <button
                      onClick={() => addTag(primary, profileTagText, true)}
                      disabled={savingNotes}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-green-300 bg-white px-2.5 py-1.5 text-[10.5px] font-bold text-green-700 transition hover:bg-green-50 disabled:opacity-60"
                    >
                      {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Add Tag
                    </button>
                  </div>
                </div>
              ) : <p className="text-[11.5px] text-slate-400">No application linked — tags unavailable.</p>}
            </div>

            {/* activity timeline */}
            <div className={CARD_CLS + ' p-4'}>
              <div className="mb-2.5 flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-600" />
                <h3 className={SECTION_TITLE}>Activity Timeline</h3>
              </div>
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
    );
  };

  /* ═════════════════════════════ list screen ══════════════════════════════ */

  const kpiCards = [
    { key: 'all', label: 'Total Candidates', value: kpis.total, icon: Users, tone: 'text-slate-700', ring: 'bg-slate-100 text-slate-600' },
    { key: 'applied', label: 'New Applications', value: kpis.applied, icon: UserPlus, tone: 'text-blue-600', ring: 'bg-blue-50 text-blue-600' },
    { key: 'screening', label: 'In Screening', value: kpis.screening, icon: UserCheck, tone: 'text-amber-600', ring: 'bg-amber-50 text-amber-600' },
    { key: 'shortlisted', label: 'Shortlisted', value: kpis.shortlisted, icon: CheckCircle2, tone: 'text-green-600', ring: 'bg-green-50 text-green-600' },
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
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span>Recruitment</span><span className="text-slate-300">/</span>
                <span className="font-semibold text-green-700">Find Candidates</span>
              </div>
              <h1 className="mt-0.5 text-[19px] font-bold text-slate-900">Find Candidates</h1>
              <p className="text-[12px] text-slate-500">Search, review, screen, and shortlist candidates.</p>
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

          {/* filters */}
          <div className={CARD_CLS + ' space-y-2.5 p-3'}>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filters.jobId}
                onChange={ev => setFilters(f => ({ ...f, jobId: ev.target.value }))}
                className={`${INPUT_CLS} max-w-[240px]`}
                title="Job Posting"
              >
                <option value="all">All job postings</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={filters.q}
                  onChange={ev => setFilters(f => ({ ...f, q: ev.target.value }))}
                  placeholder="Search by candidate name, email, skill, or job title…"
                  className={`${INPUT_CLS} pl-8`}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filters.source}
                onChange={ev => setFilters(f => ({ ...f, source: ev.target.value }))}
                className={`${INPUT_CLS} w-[130px]`}
                title="Source"
              >
                <option value="all">All sources</option>
                {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div className="flex items-center gap-1" title="Experience range (years)">
                <input
                  type="number" min="0" placeholder="Min"
                  value={filters.minExp}
                  onChange={ev => setFilters(f => ({ ...f, minExp: ev.target.value }))}
                  className={`${INPUT_CLS} w-[74px]`}
                />
                <span className="text-[11px] text-slate-400">–</span>
                <input
                  type="number" min="0" placeholder="Max"
                  value={filters.maxExp}
                  onChange={ev => setFilters(f => ({ ...f, maxExp: ev.target.value }))}
                  className={`${INPUT_CLS} w-[74px]`}
                />
              </div>
              <select
                value={filters.status}
                onChange={ev => setFilters(f => ({ ...f, status: ev.target.value }))}
                className={`${INPUT_CLS} w-[150px]`}
                title="Status"
              >
                <option value="all">All statuses</option>
                <option value="applied">Applied</option>
                <option value="screening">Screening</option>
                <option value="shortlisted">Shortlisted</option>
                <option value="rejected">Rejected</option>
              </select>
              <select
                value={filters.sort}
                onChange={ev => setFilters(f => ({ ...f, sort: ev.target.value }))}
                className={`${INPUT_CLS} w-[170px]`}
                title="Sort by"
              >
                <option value="newest">Sort: Newest first</option>
                <option value="match">Sort: Match score</option>
                <option value="experience">Sort: Experience</option>
              </select>
              <button
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                <X className="h-3 w-3" /> Clear Filters
              </button>
              <span className="ml-auto text-[11px] font-semibold text-slate-400">
                {loading ? 'Loading…' : `${visibleEntries.length} of ${entries.length} candidate${entries.length === 1 ? '' : 's'}`}
              </span>
            </div>
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

          {/* candidate list — internal vertical scroll only */}
          <div className={`${CARD_CLS} flex min-h-0 flex-1 flex-col overflow-hidden`}>
            {/* aligned column headers */}
            <div className="grid grid-cols-1 gap-x-3 border-b border-slate-200 bg-slate-50/80 px-3 py-2 lg:grid-cols-[minmax(180px,1.4fr)_minmax(140px,1.1fr)_54px_minmax(170px,1.7fr)_80px_82px_118px_auto]">
              {['Candidate', 'Applied To', 'Exp.', 'Skills', 'Source', 'Applied', 'Status', ''].map((h, i) => (
                <div key={i} className={`hidden text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:block ${i === 7 ? 'text-right' : ''}`}>{h}</div>
              ))}
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:hidden">Candidates</div>
            </div>
            <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
              {loading && (
                <div className="space-y-0">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-3 px-3 py-3">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
                      <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
                      <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
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

              {!loading && !error && visibleEntries.map(e => renderRow(e))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* small reusable icon button (kept outside the component to keep renderRow tidy) */
function MiniIconBtn(props: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border transition ${props.active ? 'border-green-300 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
    >
      {props.children}
    </button>
  );
}
