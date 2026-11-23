'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   My Interviews — the panel member's view, redesigned in the Find-Candidates
   design language: "Next up" hero with prep material + join link, KPI filter
   cards, dense table, and the inline feedback form (kept from the previous
   design and upgraded with stars / segmented recommendation / custom fields).

   Endpoints (unchanged):
     GET  /api/interviews?scope=mine           my panel assignments
     POST /api/interviews/[id]/accept-decline  accept / decline / reschedule
     POST /api/interviews/[id]/feedback        submit my feedback
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback, Fragment } from 'react';
import {
  FiClock, FiVideo, FiMapPin, FiCheck, FiStar, FiX,
  FiAlertCircle, FiRefreshCw, FiChevronDown, FiSearch, FiPlus,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface PanelMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  designation: string;
  confirmationStatus: 'pending' | 'accepted' | 'declined' | 'requested_reschedule';
  reason?: string | null;
  hasFeedback?: boolean;
  feedbackRating?: number | null;
  feedbackRecommendation?: string | null;
}

interface Interview {
  id: string;
  jobApplicationId: string;
  type: string;
  date: string;
  time: string | null;
  duration: number | null;
  location: string | null;
  meetingUrl: string | null;
  status: string;
  candidateName: string | null;
  candidateEmail: string | null;
  jobTitle: string | null;
  round?: number | null;
  planTotal?: number | null;
  mode?: string | null;
  instructions?: string | null;
  evaluationAreas?: string | null;
  panelLeadId?: string | null;
  feedbackDeadline?: string | null;
  panelMembers?: PanelMember[];
}

/* ── Design tokens (Find-Candidates style) ── */
const FILTER_CLS = 'h-[30px] rounded-[7px] border border-slate-300 bg-white px-2 text-[11.5px] text-slate-800 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/15';
const INPUT_CLS = 'h-[32px] w-full rounded-[7px] border border-slate-300 bg-white px-2.5 text-[11.5px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15 disabled:bg-slate-50 disabled:text-slate-400';
const CARD_CLS = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const BTN_PRI = 'inline-flex items-center justify-center gap-1.5 h-[30px] px-3 rounded-[8px] bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
const BTN_GHOST = 'inline-flex items-center justify-center gap-1.5 h-[30px] px-2.5 rounded-[8px] bg-white border border-slate-300 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 transition disabled:opacity-50 shrink-0';
const BTN_SOFT_GREEN = 'inline-flex items-center justify-center gap-1.5 h-[26px] px-2.5 rounded-[7px] bg-green-50 border border-green-200 text-green-700 text-[10.5px] font-bold hover:bg-green-100 transition disabled:opacity-50 shrink-0';
const BTN_SOFT_RED = 'inline-flex items-center justify-center gap-1.5 h-[26px] px-2.5 rounded-[7px] bg-red-50 border border-red-200 text-red-600 text-[10.5px] font-bold hover:bg-red-100 transition disabled:opacity-50 shrink-0';
const BTN_SOFT_BLUE = 'inline-flex items-center justify-center gap-1.5 h-[26px] px-2.5 rounded-[7px] bg-blue-50 border border-blue-200 text-blue-600 text-[10.5px] font-bold hover:bg-blue-100 transition disabled:opacity-50 shrink-0';

/* ── Display metadata ── */
const TYPE_LABELS: Record<string, string> = {
  technical: 'Technical', hr: 'HR', managerial: 'Managerial', cultural: 'Cultural',
  final: 'Final', offline_panel: 'Panel', ai: 'AI', portfolio: 'Portfolio Review',
};
const STATUS_META: Record<string, { label: string; badge: string }> = {
  scheduled: { label: 'Scheduled', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', badge: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-50 text-red-700 border-red-200' },
  rescheduled: { label: 'Rescheduled', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
};
const CONFIRM_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  accepted: { label: 'Accepted', cls: 'bg-green-50 text-green-700 border-green-200' },
  declined: { label: 'Declined', cls: 'bg-red-50 text-red-700 border-red-200' },
  requested_reschedule: { label: 'Reschedule Req.', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
};
const REC_META: Record<string, { label: string; cls: string }> = {
  strong_hire: { label: 'Strong Hire', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  hire: { label: 'Hire', cls: 'bg-green-50 text-green-700 border-green-200' },
  hold: { label: 'Hold', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  next_round: { label: 'Next Round', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  reject: { label: 'Reject', cls: 'bg-red-50 text-red-700 border-red-200' },
};

const SKILL_OPTIONS = ['—', 'Poor', 'Average', 'Good', 'Excellent'];
const FIT_OPTIONS = ['—', 'Not a fit', 'Partial', 'Fit', 'Strong fit'];

const DECLINE_REASONS = ['Another interview', 'Meeting conflict', 'Approved leave', 'Client/project work', 'Outside working hours', 'Not the correct technical interviewer', 'Personal emergency', 'Other'];
const RESCHEDULE_REASONS = ['Need different date', 'Need different time', 'Conflict with another meeting', 'Other'];

/* ── Helpers ── */
const AVATAR_COLORS = [
  'from-violet-500 to-indigo-600', 'from-cyan-500 to-teal-600', 'from-amber-500 to-orange-600',
  'from-green-500 to-emerald-600', 'from-rose-500 to-red-600', 'from-sky-500 to-blue-600',
];
function initials(name?: string | null): string {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}
function avatarColor(seed?: string | null): string {
  // Null-safe by design — see the same fix in /interviews/page.tsx.
  const s = seed || '';
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function fmtDate(iso?: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'TBD';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtWeekday(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function typeLabel(t: string): string { return TYPE_LABELS[t] || (t ? t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Interview'); }
function parseEvalAreas(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [];
  } catch { return []; }
}
/** Milliseconds until the interview starts (negative = already started). */
function msUntil(iso?: string | null, time?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  if (time) { const [h, m] = time.split(':').map(Number); if (!isNaN(h)) d.setHours(h, m || 0, 0, 0); }
  return d.getTime() - Date.now();
}
/** "starts in 1h 24m" / "in 2 days" / "starts in 12m". */
function countdownLabel(iso?: string | null, time?: string | null): string | null {
  const ms = msUntil(iso, time);
  if (ms == null) return null;
  if (ms < 0) return 'started / past';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `starts in ${Math.max(mins, 1)}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `starts in ${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function MyInterviewsPage() {
  const { user } = useAuthStore();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  /* Filters */
  const [kpiFilter, setKpiFilter] = useState('all');
  const [q, setQ] = useState('');
  const [whenFilter, setWhenFilter] = useState('');
  const [sort, setSort] = useState('soonest');

  /* Inline expand (feedback form) */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* Inline feedback form — every field the endpoint accepts. */
  const [feedbackForm, setFeedbackForm] = useState<{
    interviewId: string;
    technicalSkills: string; communication: string; experience: string; problemSolving: string;
    roleSuitability: string; culturalFit: string; strengths: string; concerns: string;
    rating: string; recommendation: string; comments: string;
    customFields: Array<{ name: string; value: string }>;
    newFieldName: string; newFieldValue: string;
  } | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  /* Inline reason picker for decline / request-reschedule (replaces window.prompt). */
  const [reasonDraft, setReasonDraft] = useState<{ interviewId: string; action: 'decline' | 'request_reschedule'; reason: string } | null>(null);

  /* ── data ── */
  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/interviews?scope=mine', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.data || []);
      } else {
        toast.error('Failed to load interviews');
      }
    } catch {
      toast.error('Failed to load interviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchInterviews()); }, [fetchInterviews]);

  /* My panel-member record on an interview. */
  const myPanel = (i: Interview) => i.panelMembers?.find(p => p.userId === user?.id);
  const myStatus = (i: Interview) => myPanel(i)?.confirmationStatus || 'pending';

  /* ── actions ── */
  const handleRespond = async (interviewId: string, action: 'accept' | 'decline' | 'request_reschedule', reason?: string) => {
    if (action !== 'accept' && !(reason || '').trim()) { toast.error('A reason is required'); return; }
    setResponding(interviewId);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/accept-decline`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action, reason: reason || undefined, userId: user?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(action === 'accept' ? 'Interview accepted' : `Interview ${action === 'decline' ? 'declined' : 'reschedule requested'}`);
      setReasonDraft(null);
      fetchInterviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setResponding(null);
    }
  };

  const openFeedbackForm = (i: Interview) => {
    setExpandedId(i.id);
    setFeedbackForm({
      interviewId: i.id,
      technicalSkills: '', communication: '', experience: '', problemSolving: '',
      roleSuitability: '', culturalFit: '', strengths: '', concerns: '',
      rating: '', recommendation: '', comments: '',
      customFields: [], newFieldName: '', newFieldValue: '',
    });
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackForm) return;
    if (!feedbackForm.rating) { toast.error('Please select a rating'); return; }
    if (!feedbackForm.recommendation) { toast.error('Please select a recommendation'); return; }
    setSubmittingFeedback(true);
    try {
      const res = await fetch(`/api/interviews/${feedbackForm.interviewId}/feedback`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          technicalSkills: feedbackForm.technicalSkills || undefined,
          communication: feedbackForm.communication || undefined,
          experience: feedbackForm.experience || undefined,
          problemSolving: feedbackForm.problemSolving || undefined,
          roleSuitability: feedbackForm.roleSuitability || undefined,
          culturalFit: feedbackForm.culturalFit || undefined,
          strengths: feedbackForm.strengths || undefined,
          concerns: feedbackForm.concerns || undefined,
          rating: Number(feedbackForm.rating),
          recommendation: feedbackForm.recommendation,
          comments: feedbackForm.comments || undefined,
          customFields: feedbackForm.customFields.length > 0 ? feedbackForm.customFields : undefined,
          userId: user?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Feedback submitted');
      setFeedbackForm(null);
      setExpandedId(null);
      fetchInterviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  /* ═══════════ RENDER ═══════════ */

  /* ── Derived ── */
  const isToday = (i: Interview) => {
    const d = new Date(i.date);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };

  const upcoming = interviews.filter(i => i.status === 'scheduled');
  const myFeedbackMissing = (i: Interview) => (i.status === 'completed' || i.status === 'rescheduled') && myStatus(i) === 'accepted' && !myPanel(i)?.hasFeedback;

  const kpis = {
    today: upcoming.filter(isToday).length,
    awaitingMyReply: upcoming.filter(i => myStatus(i) === 'pending').length,
    feedbacksDue: interviews.filter(myFeedbackMissing).length,
    completed: interviews.filter(i => i.status === 'completed').length,
  };

  /* Next up: the soonest scheduled interview (accepted first), today if possible. */
  const nextUp = [...upcoming]
    .filter(i => (msUntil(i.date, i.time) ?? -1) > -24 * 3600 * 1000) // not long past
    .sort((a, b) => {
      const ra = myStatus(a) === 'pending' ? 1 : 0, rb = myStatus(b) === 'pending' ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return (msUntil(a.date, a.time) ?? 0) - (msUntil(b.date, b.time) ?? 0);
    })[0] || null;

  /* ── Filtered rows ── */
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfToday); endOfWeek.setDate(endOfWeek.getDate() + 7);

  const filtered = interviews.filter(i => {
    if (kpiFilter === 'today' && !(i.status === 'scheduled' && isToday(i))) return false;
    if (kpiFilter === 'awaiting_reply' && !(i.status === 'scheduled' && myStatus(i) === 'pending')) return false;
    if (kpiFilter === 'feedbacks_due' && !myFeedbackMissing(i)) return false;
    if (kpiFilter === 'completed' && i.status !== 'completed') return false;
    if (whenFilter) {
      const d = new Date(i.date);
      if (whenFilter === 'today' && !isToday(i)) return false;
      if (whenFilter === 'week' && (d < startOfToday || d > endOfWeek)) return false;
      if (whenFilter === 'past' && d >= startOfToday) return false;
    }
    if (q) {
      const s = q.toLowerCase();
      if (!(i.candidateName || '').toLowerCase().includes(s) && !(i.jobTitle || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'feedback_due') {
      const rank = (i: Interview) => (myFeedbackMissing(i) ? 0 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da; // newest first
  });

  const hasActiveFilters = q || whenFilter || kpiFilter !== 'all';
  const clearFilters = () => { setQ(''); setWhenFilter(''); setKpiFilter('all'); };

  const kpiCards = [
    { key: 'all', label: 'Today', value: kpis.today, icon: FiClock, tone: 'text-amber-600', ring: 'bg-amber-50', sub: upcoming.length ? `next ${upcoming[0].time || ''}` : '' },
    { key: 'awaiting_reply', label: 'Awaiting My Reply', value: kpis.awaitingMyReply, icon: FiAlertCircle, tone: 'text-blue-600', ring: 'bg-blue-50', sub: 'confirm quickly' },
    { key: 'feedbacks_due', label: 'Feedbacks Due', value: kpis.feedbacksDue, icon: FiStar, tone: 'text-violet-600', ring: 'bg-violet-50', sub: 'after interviews' },
    { key: 'completed', label: 'Completed', value: kpis.completed, icon: FiCheck, tone: 'text-green-600', ring: 'bg-green-50', sub: 'all time' },
  ];

  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 8rem)', minHeight: 560 }}>
      {/* breadcrumb + header */}
      <div className="flex items-center text-[10.5px] text-slate-400 gap-1.5">
        <span>Recruitment</span><span className="text-slate-300">/</span>
        <span className="font-semibold text-green-700">My Interviews</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold text-slate-900 tracking-tight">My Interviews</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Your panel assignments — confirm, prepare, join, and submit feedback.</p>
        </div>
      </div>

      {/* KPI cards double as filters */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map(k => (
          <button
            key={k.key}
            onClick={() => setKpiFilter(kpiFilter === k.key ? 'all' : k.key)}
            className={`rounded-xl border bg-white shadow-sm p-3 flex items-center justify-between gap-2 text-left transition
              ${kpiFilter === k.key ? 'border-green-600 bg-green-50 ring-1 ring-green-600' : 'border-slate-200 hover:border-green-300'}`}
          >
            <div className="min-w-0">
              <p className={`text-[9.5px] font-extrabold uppercase tracking-[0.5px] ${kpiFilter === k.key ? 'text-green-700' : 'text-slate-400'}`}>{k.label}</p>
              <p className="text-[20px] font-extrabold leading-none mt-1.5 text-slate-800">{k.value}</p>
              {k.sub && <p className="text-[9.5px] text-slate-400 mt-1 font-semibold truncate">{k.sub}</p>}
            </div>
            <span className={`w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0 ${k.ring}`}>
              <k.icon className={`w-[15px] h-[15px] ${k.tone}`} />
            </span>
          </button>
        ))}
      </div>

      {/* next-up hero */}
      {nextUp && (
        <div className="rounded-2xl p-4 flex flex-wrap gap-4 items-center text-white shadow-lg" style={{ background: 'linear-gradient(120deg,#064e3b 0%,#065f46 45%,#0f766e 100%)' }}>
          <span className="w-[52px] h-[52px] rounded-2xl border-[1.5px] border-white/35 bg-white/15 flex items-center justify-center text-[17px] font-extrabold shrink-0">
            {initials(nextUp.candidateName)}
          </span>
          <div className="flex-1 min-w-[220px]">
            <span className="inline-flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.8px] bg-white/15 rounded-md px-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.3)]" />
              Next up{isToday(nextUp) ? ' · today' : ''}
            </span>
            <h2 className="text-[17px] font-extrabold tracking-tight mt-1.5">
              {nextUp.candidateName || 'Candidate'} — {typeLabel(nextUp.type)}, Round {nextUp.round || 1}{Number(nextUp.planTotal || 0) > 0 ? ` of ${nextUp.planTotal}` : ''}
            </h2>
            <div className="flex flex-wrap gap-2.5 text-[11.5px] text-emerald-100 mt-1">
              <b className="text-white">{fmtWeekday(nextUp.date)}{nextUp.time ? ` · ${nextUp.time}` : ''}</b>
              <span>{nextUp.jobTitle || '—'}</span>
              <span>{nextUp.mode === 'onsite' ? 'Onsite' : nextUp.mode === 'phone' ? 'Phone' : 'Video'}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[10.5px] text-emerald-200">
              <span>Panel:</span>
              {(nextUp.panelMembers || []).slice(0, 4).map(p => (
                <span key={p.id} title={p.name} className="w-5 h-5 rounded-full bg-white/20 border-[1.5px] border-white/40 text-[8px] font-extrabold flex items-center justify-center">{initials(p.name)}</span>
              ))}
              <span>· you {myStatus(nextUp) === 'accepted' ? 'accepted ✓' : CONFIRM_META[myStatus(nextUp)]?.label.toLowerCase()}</span>
            </div>
            {(parseEvalAreas(nextUp.evaluationAreas).length > 0 || nextUp.instructions) && (
              <div className="flex flex-wrap gap-3 mt-2 text-[10.5px]">
                {nextUp.instructions && (
                  <span className="rounded-md bg-white/10 border border-white/20 px-2 py-1 max-w-full">
                    <b className="text-white">HR note:</b> <span className="text-emerald-100">{nextUp.instructions}</span>
                  </span>
                )}
                {parseEvalAreas(nextUp.evaluationAreas).map(a => (
                  <span key={a} className="rounded-md bg-white/10 border border-white/20 px-2 py-1 text-emerald-100 font-semibold">{a}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 items-end">
            {countdownLabel(nextUp.date, nextUp.time) && (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
                <FiClock className="w-3 h-3" /> {countdownLabel(nextUp.date, nextUp.time)}
              </span>
            )}
            {myStatus(nextUp) === 'pending' ? (
              <div className="flex gap-1.5">
                <button onClick={() => handleRespond(nextUp.id, 'accept')} disabled={responding === nextUp.id} className="h-[34px] px-3.5 rounded-[8px] bg-white text-emerald-800 text-[11.5px] font-extrabold hover:bg-emerald-50 transition shadow">
                  <FiCheck className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Accept
                </button>
                <button onClick={() => setReasonDraft({ interviewId: nextUp.id, action: 'decline', reason: '' })} className="h-[34px] px-3 rounded-[8px] bg-white/15 border border-white/30 text-white text-[11.5px] font-bold hover:bg-white/25 transition">
                  Decline
                </button>
              </div>
            ) : nextUp.meetingUrl ? (
              <a href={nextUp.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-[8px] bg-white text-emerald-800 text-[12.5px] font-extrabold hover:bg-emerald-50 transition shadow">
                <FiVideo className="w-4 h-4" /> Join Interview
              </a>
            ) : nextUp.location ? (
              <span className="flex items-center gap-1.5 h-[38px] px-4 rounded-[8px] bg-white/15 border border-white/30 text-[12px] font-bold">
                <FiMapPin className="w-4 h-4" /> {nextUp.location}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* filter bar */}
      <div className={`${CARD_CLS} p-2.5 flex flex-wrap items-center gap-2`}>
        <span className="hidden text-[9px] font-extrabold uppercase tracking-[0.8px] text-slate-400 sm:inline">Filter</span>
        <select value={whenFilter} onChange={e => setWhenFilter(e.target.value)} className={FILTER_CLS}>
          <option value="">Any Time</option>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="past">Past</option>
        </select>
        <div className="flex-1 min-w-[180px] relative">
          <FiSearch className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search candidate or role…"
            className="w-full h-[30px] rounded-[7px] border border-slate-300 bg-white pl-7 pr-2 text-[11.5px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15"
          />
        </div>
        <select value={sort} onChange={e => setSort(e.target.value)} className={FILTER_CLS}>
          <option value="soonest">Newest first</option>
          <option value="feedback_due">Feedback due first</option>
        </select>
        <button onClick={clearFilters} disabled={!hasActiveFilters} className="inline-flex items-center gap-1 h-[30px] px-2.5 rounded-[7px] border border-slate-300 bg-white text-slate-600 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <FiX className="w-3 h-3" /> Clear
        </button>
      </div>

      {/* table */}
      <div className={`${CARD_CLS} flex-1 min-h-0 flex flex-col overflow-hidden`}>
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr>
                <th style={{ width: 26 }}></th>
                {['Candidate', 'Role', 'Interview', 'When', 'My Reply', 'My Feedback', 'Status'].map(h => (
                  <th key={h} className="sticky top-0 z-[2] bg-slate-50 text-left text-[9.5px] font-extrabold uppercase tracking-[0.6px] text-slate-500 px-2.5 py-2 border-b border-slate-200">{h}</th>
                ))}
                <th className="sticky top-0 z-[2] bg-slate-50 text-right text-[9.5px] font-extrabold uppercase tracking-[0.6px] text-slate-500 px-2.5 py-2 border-b border-slate-200">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-14 text-center text-[12px] text-slate-400">Loading…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={9} className="py-14 text-center">
                  <FiAlertCircle className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                  <p className="text-[12.5px] font-bold text-slate-600">Nothing here yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {interviews.length === 0 ? 'No interviews assigned to you as a panel member.' : 'Try adjusting your filters.'}
                  </p>
                </td></tr>
              ) : sorted.map(interview => {
                const st = STATUS_META[interview.status] || { label: interview.status, badge: 'bg-slate-100 text-slate-600 border-slate-200' };
                const myst = myStatus(interview);
                const mine = myPanel(interview);
                const isOpen = expandedId === interview.id;
                const canRespond = interview.status === 'scheduled' && myst === 'pending';
                const canFeedback = (myst === 'accepted' || interview.status === 'completed') && !mine?.hasFeedback && myst !== 'declined';
                const overdue = myFeedbackMissing(interview) && interview.feedbackDeadline && new Date(interview.feedbackDeadline).getTime() < Date.now();
                return (
                  <Fragment key={interview.id}>
                    <tr
                      onClick={() => canFeedback ? openFeedbackForm(interview) : setExpandedId(isOpen ? null : interview.id)}
                      className={`cursor-pointer transition-colors ${isOpen ? 'bg-green-50' : 'hover:bg-green-50/60'} ${interview.status === 'cancelled' ? 'opacity-60' : ''}`}
                    >
                      <td className="px-1 py-2">
                        <FiChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : '-rotate-90'}`} />
                      </td>
                      <td className="px-2.5 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarColor(interview.candidateName || interview.id)} text-white text-[10px] font-extrabold flex items-center justify-center shrink-0`}>
                            {initials(interview.candidateName)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11.5px] font-bold text-slate-800 truncate">{interview.candidateName || 'N/A'}</p>
                            <p className="text-[10px] text-slate-400 truncate">{interview.candidateEmail || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2.5 py-2"><p className="text-[11.5px] font-semibold text-slate-700 truncate">{interview.jobTitle || '—'}</p></td>
                      <td className="px-2.5 py-2">
                        <span className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                          {typeLabel(interview.type)}{interview.round ? ` · R${interview.round}` : ''}
                        </span>
                      </td>
                      <td className="px-2.5 py-2">
                        <p className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">{fmtWeekday(interview.date)}{interview.time ? ` · ${interview.time}` : ''}</p>
                        <p className="text-[10px] text-slate-400">{interview.duration || 60} min · {interview.mode === 'onsite' ? 'Onsite' : interview.mode === 'phone' ? 'Phone' : 'Video'}</p>
                        {isToday(interview) && interview.status === 'scheduled' && (
                          <span className="inline-flex rounded border border-amber-200 bg-amber-50 px-1 py-px text-[9.5px] font-extrabold text-amber-700 mt-0.5">
                            {countdownLabel(interview.date, interview.time) || 'today'}
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[9.5px] font-extrabold ${CONFIRM_META[myst]?.cls || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {CONFIRM_META[myst]?.label || myst}
                        </span>
                      </td>
                      <td className="px-2.5 py-2">
                        {mine?.hasFeedback && mine.feedbackRating != null ? (
                          <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-extrabold ${REC_META[mine.feedbackRecommendation || '']?.cls || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            <FiStar className="w-2.5 h-2.5" />{mine.feedbackRating}/5 · {REC_META[mine.feedbackRecommendation || '']?.label || 'Submitted'}
                          </span>
                        ) : canFeedback && interview.status === 'completed' ? (
                          <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[9.5px] font-extrabold ${overdue ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {overdue ? 'Overdue' : 'Due'}
                            {interview.feedbackDeadline ? ` · ${fmtDate(interview.feedbackDeadline)}` : ''}
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-slate-300">{myst === 'pending' && interview.status === 'scheduled' ? '— after reply' : '—'}</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${st.badge}`}>{st.label}</span>
                      </td>
                      <td className="px-2.5 py-2">
                        <div className="flex gap-1.5 justify-end flex-wrap" onClick={e => e.stopPropagation()}>
                          {canRespond && (
                            <>
                              <button onClick={() => handleRespond(interview.id, 'accept')} disabled={responding === interview.id} className={BTN_SOFT_GREEN}>
                                <FiCheck className="w-3 h-3" /> Accept
                              </button>
                              <button onClick={() => setReasonDraft({ interviewId: interview.id, action: 'request_reschedule', reason: '' })} disabled={responding === interview.id} className={BTN_SOFT_BLUE}>
                                <FiRefreshCw className="w-3 h-3" /> Different time
                              </button>
                              <button onClick={() => setReasonDraft({ interviewId: interview.id, action: 'decline', reason: '' })} disabled={responding === interview.id} className={BTN_SOFT_RED}>
                                <FiX className="w-3 h-3" /> Decline
                              </button>
                            </>
                          )}
                          {interview.status === 'scheduled' && myst === 'accepted' && interview.meetingUrl && isToday(interview) && (
                            <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-[26px] px-2.5 rounded-[7px] bg-green-600 text-white text-[10.5px] font-bold hover:bg-green-700 transition">
                              <FiVideo className="w-3 h-3" /> Join
                            </a>
                          )}
                          {canFeedback && (
                            <button onClick={() => openFeedbackForm(interview)} className="inline-flex items-center gap-1 h-[26px] px-2.5 rounded-[7px] bg-green-600 text-white text-[10.5px] font-bold hover:bg-green-700 transition">
                              <FiStar className="w-3 h-3" /> Submit Feedback
                            </button>
                          )}
                          {mine?.hasFeedback && (
                            <button onClick={() => setExpandedId(isOpen ? null : interview.id)} className={BTN_SOFT_BLUE}>View my feedback</button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* inline reason picker (decline / reschedule) */}
                    {reasonDraft?.interviewId === interview.id && (
                      <tr>
                        <td colSpan={9} className="p-0 border-b border-slate-200">
                          <div className="p-3" style={{ background: 'linear-gradient(180deg,#f0fdf4,#fff)' }} onClick={e => e.stopPropagation()}>
                            <p className="text-[11px] font-bold text-slate-700 mb-2">
                              Reason for {reasonDraft.action === 'decline' ? 'declining' : 'requesting a different time'} (required — sent to HR):
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {(reasonDraft.action === 'decline' ? DECLINE_REASONS : RESCHEDULE_REASONS).map(r => (
                                <button
                                  key={r}
                                  onClick={() => setReasonDraft({ ...reasonDraft, reason: r })}
                                  className={`rounded-[7px] border px-2.5 py-1.5 text-[10.5px] font-bold transition ${reasonDraft.reason === r ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-green-400'}`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                            <input
                              value={reasonDraft.reason === 'Other' ? '' : reasonDraft.reason}
                              onChange={e => setReasonDraft({ ...reasonDraft, reason: e.target.value })}
                              placeholder="Or type a custom reason…"
                              className={INPUT_CLS + ' mt-2'}
                            />
                            <div className="flex gap-2 justify-end mt-2">
                              <button onClick={() => setReasonDraft(null)} className={BTN_GHOST}>Cancel</button>
                              <button
                                onClick={() => handleRespond(reasonDraft.interviewId, reasonDraft.action, reasonDraft.reason)}
                                disabled={responding === interview.id || !reasonDraft.reason.trim()}
                                className={BTN_PRI}
                              >
                                {responding === interview.id ? 'Sending…' : reasonDraft.action === 'decline' ? 'Decline Interview' : 'Request New Time'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* inline feedback form / my submitted feedback */}
                    {isOpen && feedbackForm?.interviewId === interview.id && (() => (
                      <tr>
                        <td colSpan={9} className="p-0 border-b border-slate-200">
                          <div className="p-3.5" style={{ background: 'linear-gradient(180deg,#f0fdf4,#fff)' }}>
                            <h4 className="text-[11px] font-extrabold uppercase tracking-[0.5px] text-slate-500 mb-3 flex items-center gap-1.5">
                              <FiStar className="w-3.5 h-3.5 text-violet-500" /> My feedback — {interview.candidateName} · {typeLabel(interview.type)} R{interview.round || 1}
                            </h4>
                            <div className="grid gap-2.5 md:grid-cols-3">
                              {/* rating */}
                              <div>
                                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Overall rating *</label>
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map(n => (
                                    <button key={n} onClick={() => setFeedbackForm({ ...feedbackForm, rating: String(n) })} className={`w-[22px] h-[22px] flex items-center justify-center transition ${Number(feedbackForm.rating) >= n ? 'text-amber-500' : 'text-slate-300 hover:text-amber-300'}`}>
                                      <FiStar className={`w-[17px] h-[17px] ${Number(feedbackForm.rating) >= n ? 'fill-current' : ''}`} />
                                    </button>
                                  ))}
                                  <span className="text-[11px] font-extrabold text-amber-600 ml-1.5">{feedbackForm.rating ? `${feedbackForm.rating}/5` : ''}</span>
                                </div>
                              </div>
                              {/* recommendation */}
                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Recommendation *</label>
                                <div className="flex gap-1.5 flex-wrap">
                                  {Object.entries(REC_META).map(([v, m]) => (
                                    <button
                                      key={v}
                                      onClick={() => setFeedbackForm({ ...feedbackForm, recommendation: v })}
                                      className={`rounded-[7px] border px-2.5 py-1.5 text-[10.5px] font-bold transition ${feedbackForm.recommendation === v ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-green-400'}`}
                                    >
                                      {m.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* six skill selects */}
                              {([
                                ['technicalSkills', 'Technical skills', SKILL_OPTIONS],
                                ['communication', 'Communication', SKILL_OPTIONS],
                                ['problemSolving', 'Problem solving', SKILL_OPTIONS],
                                ['experience', 'Experience depth', SKILL_OPTIONS],
                                ['roleSuitability', 'Role suitability', FIT_OPTIONS],
                                ['culturalFit', 'Cultural fit', SKILL_OPTIONS],
                              ] as const).map(([field, label, options]) => (
                                <div key={field}>
                                  <label className="block text-[10px] font-extrabold text-slate-500 mb-1">{label}</label>
                                  <select
                                    value={feedbackForm[field]}
                                    onChange={e => setFeedbackForm({ ...feedbackForm, [field]: e.target.value })}
                                    className={INPUT_CLS}
                                  >
                                    {options.map(o => <option key={o} value={o === '—' ? '' : o}>{o}</option>)}
                                  </select>
                                </div>
                              ))}
                              {/* strengths + concerns */}
                              <div className="md:col-span-3 grid gap-2.5 md:grid-cols-2">
                                <div>
                                  <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Strengths</label>
                                  <textarea rows={2} value={feedbackForm.strengths} onChange={e => setFeedbackForm({ ...feedbackForm, strengths: e.target.value })} placeholder="What went well…" className="w-full rounded-[7px] border border-slate-300 bg-white px-2.5 py-2 text-[11px] text-slate-800 outline-none resize-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Concerns</label>
                                  <textarea rows={2} value={feedbackForm.concerns} onChange={e => setFeedbackForm({ ...feedbackForm, concerns: e.target.value })} placeholder="Risks or gaps…" className="w-full rounded-[7px] border border-slate-300 bg-white px-2.5 py-2 text-[11px] text-slate-800 outline-none resize-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15" />
                                </div>
                              </div>
                              {/* custom fields */}
                              <div className="md:col-span-3">
                                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Custom fields</label>
                                {feedbackForm.customFields.map((cf, idx) => (
                                  <div key={idx} className="flex gap-1.5 mb-1.5">
                                    <input
                                      value={cf.name}
                                      onChange={e => setFeedbackForm({ ...feedbackForm, customFields: feedbackForm.customFields.map((x, i) => i === idx ? { ...x, name: e.target.value } : x) })}
                                      placeholder="Field name"
                                      className={INPUT_CLS}
                                      style={{ maxWidth: 180 }}
                                    />
                                    <input
                                      value={cf.value}
                                      onChange={e => setFeedbackForm({ ...feedbackForm, customFields: feedbackForm.customFields.map((x, i) => i === idx ? { ...x, value: e.target.value } : x) })}
                                      placeholder="Value"
                                      className={INPUT_CLS}
                                    />
                                    <button onClick={() => setFeedbackForm({ ...feedbackForm, customFields: feedbackForm.customFields.filter((_, i) => i !== idx) })} className="w-8 h-[32px] rounded-[7px] border border-slate-300 bg-white text-slate-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center shrink-0">
                                      <FiX className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                                <button onClick={() => setFeedbackForm({ ...feedbackForm, customFields: [...feedbackForm.customFields, { name: '', value: '' }] })} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-green-700 hover:underline">
                                  <FiPlus className="w-3 h-3" /> Add custom field
                                </button>
                              </div>
                              {/* comments */}
                              <div className="md:col-span-3">
                                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Additional notes</label>
                                <textarea rows={2} value={feedbackForm.comments} onChange={e => setFeedbackForm({ ...feedbackForm, comments: e.target.value })} placeholder="Anything else HR or the panel lead should know…" className="w-full rounded-[7px] border border-slate-300 bg-white px-2.5 py-2 text-[11px] text-slate-800 outline-none resize-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15" />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 justify-end mt-3">
                              <span className="text-[10px] text-slate-400 mr-auto">
                                Visible to HR and the panel lead — never to the candidate
                                {interview.feedbackDeadline ? ` · due ${fmtDate(interview.feedbackDeadline)}` : ''}
                              </span>
                              <button onClick={() => { setFeedbackForm(null); setExpandedId(null); }} className={BTN_GHOST}>Cancel</button>
                              <button onClick={handleSubmitFeedback} disabled={submittingFeedback} className={BTN_PRI}>
                                <FiCheck className="w-3 h-3" /> {submittingFeedback ? 'Submitting…' : 'Submit Feedback'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))()}

                    {/* view my submitted feedback */}
                    {isOpen && feedbackForm?.interviewId !== interview.id && mine?.hasFeedback && (() => (
                      <tr>
                        <td colSpan={9} className="p-0 border-b border-slate-200">
                          <div className="p-3.5" style={{ background: 'linear-gradient(180deg,#f0fdf4,#fff)' }}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-extrabold ${REC_META[mine.feedbackRecommendation || '']?.cls || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                <FiStar className="w-3 h-3" />{mine.feedbackRating || '—'}/5 · {REC_META[mine.feedbackRecommendation || '']?.label || 'Feedback'}
                              </span>
                              <span className="text-[10.5px] text-slate-400">submitted</span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Your feedback is recorded and visible to HR and the panel lead. Contact HR if something needs correcting.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ))()}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-3.5 py-1.5 border-t border-slate-200 bg-white text-[10.5px] text-slate-400 shrink-0">
          <span>Showing <b className="text-slate-600">{sorted.length}</b> of <b className="text-slate-600">{interviews.length}</b> assignments</span>
          <span>Feedback is visible to HR and the panel lead — never to the candidate</span>
        </div>
      </div>
    </div>
  );
}
