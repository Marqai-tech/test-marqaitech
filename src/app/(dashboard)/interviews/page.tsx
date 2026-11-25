'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Interview Management — redesigned in the Find-Candidates design language
   (one-screen dense table + KPI filter cards + inline expand, no modals
   except the Schedule Interview slide-over drawer, see ScheduleDrawer.tsx).

   Rows are GROUPED by candidate (job application): one row per candidate with
   a rounds progress pill (R1 ✓ R2 ✓ R3 ●); expanding stacks every round with
   its full detail — schedule, panel, feedback, and HR decision per round.

   Data flow is unchanged — same endpoints as before:
     GET  /api/interviews?limit=100          list (with panel members)
     GET  /api/interviews/[id]/feedback      full feedback detail
     PATCH /api/interviews                   mark_completed / hr_decision
     POST  /api/interviews/[id]/replace-panel
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback, Fragment } from 'react';
import {
  FiCalendar, FiClock, FiVideo, FiMapPin, FiUser, FiStar, FiCheck, FiX,
  FiAlertCircle, FiSearch, FiChevronDown,
  FiCheckCircle, FiExternalLink, FiRefreshCw, FiUserPlus,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ScheduleScreen from './ScheduleScreen';

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
  respondedAt?: string | null;
  hasFeedback?: boolean;
  feedbackRating?: number | null;
  feedbackRecommendation?: string | null;
}

interface FeedbackDetail {
  id: string;
  userId: string;
  memberName?: string;
  memberEmail?: string;
  technicalSkills?: string | null;
  communication?: string | null;
  experience?: string | null;
  problemSolving?: string | null;
  roleSuitability?: string | null;
  culturalFit?: string | null;
  strengths?: string | null;
  concerns?: string | null;
  rating: number;
  recommendation: string;
  comments?: string | null;
  customFields?: Array<{ name: string; value: string }> | null;
  submittedAt: string;
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
  panelMembers?: PanelMember[];
  hrDecision?: string | null;
  hrDecisionReason?: string | null;
  round?: number | null;
  planTotal?: number | null;
  mode?: string | null;
  instructions?: string | null;
  evaluationAreas?: string | null; // JSON-encoded string array
  panelLeadId?: string | null;
  confirmationDeadline?: string | null;
  feedbackDeadline?: string | null;
  cancelReason?: string | null;
  createdAt?: string | null;
}

/* ── Access ── */
const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin', 'recruiter', 'recruiter_admin'];

/* ── Design tokens (Find-Candidates style) ── */
const FILTER_CLS = 'h-[30px] rounded-[7px] border border-slate-300 bg-white px-2 text-[11.5px] text-slate-800 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/15';
const INPUT_CLS = 'h-[32px] w-full rounded-[7px] border border-slate-300 bg-white px-2.5 text-[11.5px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15 disabled:bg-slate-50 disabled:text-slate-400';
const CARD_CLS = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const BTN_PRI = 'inline-flex items-center justify-center gap-1.5 h-[30px] px-3 rounded-[8px] bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
const BTN_GHOST = 'inline-flex items-center justify-center gap-1.5 h-[30px] px-3 rounded-[8px] bg-white border border-slate-300 text-slate-600 text-[11px] font-bold hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
const BTN_SOFT_RED = 'inline-flex items-center justify-center gap-1.5 h-[30px] px-3 rounded-[8px] bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-100 transition disabled:opacity-50 shrink-0';
const SECTION_TITLE = 'text-[9.5px] font-extrabold uppercase tracking-[0.6px] text-slate-400 mb-2 flex items-center gap-1.5';

/* ── Display metadata ── */
const STATUS_META: Record<string, { label: string; badge: string; border: string }> = {
  scheduled: { label: 'Scheduled', badge: 'bg-amber-50 text-amber-700 border-amber-200', border: 'border-l-amber-400' },
  completed: { label: 'Completed', badge: 'bg-green-50 text-green-700 border-green-200', border: 'border-l-green-500' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-50 text-red-700 border-red-200', border: 'border-l-red-400' },
  rescheduled: { label: 'Rescheduled', badge: 'bg-blue-50 text-blue-700 border-blue-200', border: 'border-l-blue-400' },
};

const TYPE_LABELS: Record<string, string> = {
  technical: 'Technical', hr: 'HR', managerial: 'Managerial', cultural: 'Cultural',
  final: 'Final', offline_panel: 'Panel', ai: 'AI', portfolio: 'Portfolio Review',
};

const MODE_LABELS: Record<string, string> = { online: 'Video', onsite: 'Onsite', phone: 'Phone' };

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

const DECISION_LABELS: Record<string, string> = {
  next_round: 'Next Round', schedule_another: 'Schedule Another', shortlist: 'Shortlist',
  hold: 'Hold', reject: 'Reject', offer: 'Offer',
};

/* ── Helpers ── */
const AVATAR_COLORS = [
  'from-violet-500 to-indigo-600', 'from-cyan-500 to-teal-600', 'from-amber-500 to-orange-600',
  'from-green-500 to-emerald-600', 'from-rose-500 to-red-600', 'from-sky-500 to-blue-600',
  'from-teal-500 to-emerald-600', 'from-indigo-500 to-purple-600',
];
function initials(name?: string | null): string {
  return (name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}
function avatarColor(seed?: string | null): string {
  // Null-safe by design: panel-member names can be null/undefined when the
  // backing User row has no name AND no email (orphaned account) — a null seed
  // here used to crash the whole page with "Cannot read properties of null".
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
/** Human "when" chip: Today / Tomorrow / in Nd / Nd ago. */
function whenChip(iso?: string | null, time?: string | null): { label: string; cls: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  if (time) { const [h, m] = time.split(':').map(Number); if (!isNaN(h)) d.setHours(h, m || 0, 0, 0); }
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diffDays === 0) return { label: 'today', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (diffDays === 1) return { label: 'in 1 day', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (diffDays > 1 && diffDays <= 7) return { label: `in ${diffDays}d`, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  if (diffDays === -1) return { label: 'yesterday', cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  if (diffDays < -1) return { label: `${-diffDays}d ago`, cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  return null;
}
function parseEvalAreas(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : [];
  } catch { return []; }
}
function typeLabel(t: string): string { return TYPE_LABELS[t] || (t ? t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Interview'); }

/* ── Candidate grouping: one row per candidate-application, every round inside ──
   The table groups interviews by jobApplicationId (a candidate's pipeline for one
   job), so "where is this candidate?" is answered by one row + one click. */
interface CandidateGroup {
  key: string;                     // jobApplicationId (falls back to interview id)
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  ivs: Interview[];                // rounds — round asc, then date asc
  totalRounds: number;             // max(planTotal, highest round seen)
  doneCount: number;               // completed rounds
  scheduledCount: number;
  next: Interview | null;          // earliest upcoming scheduled interview
  lastActivity: number;            // max createdAt/date — drives 'newest' sort
  pendingDecisions: number;        // completed rounds without an HR decision
  latestDecision: string | null;   // most recent round that has a decision
}

/** Interview date+time as a sortable timestamp (0 when undatable). */
function ivTime(iv: Interview): number {
  const d = new Date(iv.date || 0);
  if (isNaN(d.getTime())) return 0;
  if (iv.time) { const [h, m] = iv.time.split(':').map(Number); if (!isNaN(h)) d.setHours(h, m || 0, 0, 0); }
  return d.getTime();
}

function buildGroups(list: Interview[]): CandidateGroup[] {
  const map = new Map<string, CandidateGroup>();
  for (const iv of list) {
    const key = iv.jobApplicationId || iv.id;
    let g = map.get(key);
    if (!g) {
      g = {
        key, candidateName: iv.candidateName || 'Unknown candidate', candidateEmail: iv.candidateEmail || '',
        jobTitle: iv.jobTitle || '—', ivs: [], totalRounds: 1, doneCount: 0, scheduledCount: 0,
        next: null, lastActivity: 0, pendingDecisions: 0, latestDecision: null,
      };
      map.set(key, g);
    }
    g.ivs.push(iv);
  }
  for (const g of map.values()) {
    // null/absent rounds sort last; within a round, earliest date first
    g.ivs.sort((a, b) => (Number(a.round || 999) - Number(b.round || 999)) || (ivTime(a) - ivTime(b)));
    g.totalRounds = Math.max(g.ivs.reduce((m, iv) => Math.max(m, Number(iv.planTotal || 0), Number(iv.round || 0)), 0), 1);
    g.doneCount = g.ivs.filter(iv => iv.status === 'completed').length;
    g.scheduledCount = g.ivs.filter(iv => iv.status === 'scheduled').length;
    g.lastActivity = g.ivs.reduce((m, iv) => Math.max(m, new Date(iv.createdAt || iv.date || 0).getTime() || 0), 0);
    const upcoming = g.ivs
      .filter(iv => iv.status === 'scheduled' && iv.date && !isNaN(new Date(iv.date).getTime()))
      .sort((a, b) => ivTime(a) - ivTime(b));
    g.next = upcoming[0] || null;
    g.pendingDecisions = g.ivs.filter(iv => iv.status === 'completed' && !iv.hrDecision).length;
    const withDecision = g.ivs.filter(iv => iv.hrDecision);
    g.latestDecision = withDecision.length ? withDecision[withDecision.length - 1].hrDecision! : null;
  }
  return Array.from(map.values());
}

/** Round-cell state for the progress pill: done > active > cancelled > todo. */
function roundState(g: CandidateGroup, r: number): 'done' | 'active' | 'cancelled' | 'todo' {
  const at = g.ivs.filter(iv => Number(iv.round || 0) === r);
  if (at.length === 0) return 'todo';
  if (at.some(iv => iv.status === 'completed')) return 'done';
  if (at.some(iv => iv.status === 'scheduled')) return 'active';
  if (at.every(iv => iv.status === 'cancelled')) return 'cancelled';
  return 'todo'; // rescheduled / unknown → treated as not-yet
}

/* ═══════════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function InterviewsPage() {
  const { user } = useAuthStore();
  const isAdmin = HR_ROLES.includes(user?.role || '');

  /* ── data ── */
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── filters ── */
  const [kpiFilter, setKpiFilter] = useState('all');
  const [q, setQ] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [roundFilter, setRoundFilter] = useState('');
  const [panelFilter, setPanelFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [sort, setSort] = useState('soonest');

  /* ── inline expand (replaces the feedback modal) — one candidate group at a time ── */
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [feedbackByInterview, setFeedbackByInterview] = useState<Record<string, FeedbackDetail[]>>({});
  const [loadingFeedbackId, setLoadingFeedbackId] = useState<string | null>(null);

  /* ── inline decision composer (replaces the decision modal) ── */
  const [decisionDraft, setDecisionDraft] = useState<{
    interviewId: string; decision: string; reason: string;
    nextDate: string; nextTime: string; nextDuration: number; nextType: string;
    nextLocation: string; nextMeetingUrl: string; nextPanelMemberIds: string[];
    sendHoldEmail: boolean;
  } | null>(null);

  /* ── inline attendance (replaces the attendance modal) ── */
  const [attendanceDraft, setAttendanceDraft] = useState<{
    interviewId: string; candidateAttendance: string; panelAttendance: Record<string, string>;
  } | null>(null);

  /* ── inline replace-panel (uses the existing replace-panel endpoint) ── */
  const [replaceDraft, setReplaceDraft] = useState<{ interviewId: string; oldUserId: string; oldName: string; newUserId: string; reason: string } | null>(null);
  const [panelCandidates, setPanelCandidates] = useState<Array<{ id: string; name: string; email: string; designation: string }>>([]);

  /* ── NEW LOCKED-3: HR final feedback composer (goes to the candidate) ── */
  const [finalFeedbackDraft, setFinalFeedbackDraft] = useState<{ interviewId: string; decision: string; feedback: string } | null>(null);

  /* ── schedule sub-tab: the Schedule Interview screen is a SUB-TAB of this
     page (a full-width page with room for panel conflict details), not a
     right-side drawer/modal. ── */
  const [pageTab, setPageTab] = useState<'list' | 'schedule'>('list');

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /* ═══════════ data loading ═══════════ */

  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/interviews?limit=100', { headers: getAuthHeaders() });
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

  useEffect(() => {
    if (isAdmin) queueMicrotask(() => fetchInterviews());
  }, [isAdmin, fetchInterviews]);

  /* Panel-replacement candidate list (all tenant employees with a User account). */
  const fetchPanelCandidates = useCallback(async () => {
    if (panelCandidates.length > 0) return;
    try {
      const res = await fetch('/api/employees?limit=200', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const rawList: Array<Record<string, unknown>> = (data.employees || data.data || []) as Array<Record<string, unknown>>;
        const list = rawList
          .map((e) => {
            const userId = (e.userId as string) || '';
            const name = `${(e.firstName as string) || ''} ${(e.lastName as string) || ''}`.trim() || (e.name as string) || (e.email as string) || '';
            const desigObj = e.designation as { id?: string; title?: string } | string | null | undefined;
            let designation = '—';
            if (typeof desigObj === 'string') designation = desigObj;
            else if (desigObj && typeof desigObj === 'object' && desigObj.title) designation = desigObj.title;
            return { id: userId, name, email: (e.email as string) || '', designation };
          })
          .filter((u) => u.id && u.email);
        if (list.length > 0) setPanelCandidates(list);
      }
    } catch { /* non-fatal */ }
  }, [panelCandidates.length]);

  /* Fetch the full feedback detail when a row is expanded. */
  const fetchFeedback = useCallback(async (interviewId: string) => {
    if (feedbackByInterview[interviewId]) return;
    setLoadingFeedbackId(interviewId);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/feedback`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFeedbackByInterview(prev => ({ ...prev, [interviewId]: data.feedback || [] }));
      }
    } catch { /* non-fatal — chips still render from panel member summary */ }
    finally { setLoadingFeedbackId(null); }
  }, [feedbackByInterview]);

  const toggleGroup = (g: CandidateGroup) => {
    if (expandedGroupId === g.key) {
      setExpandedGroupId(null);
    } else {
      setExpandedGroupId(g.key);
      setDecisionDraft(null);
      setAttendanceDraft(null);
      setReplaceDraft(null);
      // pull full feedback detail for every round of this candidate
      g.ivs.forEach(iv => queueMicrotask(() => fetchFeedback(iv.id)));
    }
  };

  /* ═══════════ actions ═══════════ */

  /* Quick complete (no attendance). */
  const handleMarkCompleted = async (interviewId: string, withAttendance = false) => {
    if (!withAttendance) {
      if (!confirm('Mark this interview as completed? Panel members will be notified to submit feedback.')) return;
      setActionLoading(interviewId + '-complete');
      try {
        const res = await fetch('/api/interviews', {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ id: interviewId, action: 'mark_completed' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        toast.success('Interview marked as completed. Panel members notified.');
        fetchInterviews();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed');
      } finally { setActionLoading(null); }
      return;
    }
    // With attendance — open the inline attendance panel instead of a modal.
    const interview = interviews.find((i) => i.id === interviewId);
    const initialPanelAttendance: Record<string, string> = {};
    (interview?.panelMembers || []).forEach((pm) => {
      if (pm.confirmationStatus === 'accepted') initialPanelAttendance[pm.userId] = 'present';
    });
    setAttendanceDraft({ interviewId, candidateAttendance: 'attended', panelAttendance: initialPanelAttendance });
  };

  /* NEW LOCKED-2: nudge panel member(s) who haven't submitted feedback yet. */
  const handleSendFeedbackReminder = async (interviewId: string, userId?: string) => {
    setActionLoading(interviewId + '-remind');
    try {
      const res = await fetch('/api/interviews', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: interviewId, action: 'send_feedback_reminder', ...(userId ? { userId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || 'Reminder sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally { setActionLoading(null); }
  };

  /* NEW LOCKED-3: HR writes the consolidated final feedback + decision.
     It is stored on the interview and delivered to the candidate (portal + email). */
  const handleSendFinalFeedback = async () => {
    if (!finalFeedbackDraft) return;
    if (!finalFeedbackDraft.feedback.trim()) { toast.error('Write the final feedback first'); return; }
    setActionLoading(finalFeedbackDraft.interviewId + '-final');
    try {
      const res = await fetch('/api/interviews', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: finalFeedbackDraft.interviewId, action: 'final_feedback', finalFeedback: finalFeedbackDraft.feedback, finalDecision: finalFeedbackDraft.decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Final feedback sent to the candidate (portal + email)');
      setFinalFeedbackDraft(null);
      fetchInterviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally { setActionLoading(null); }
  };

  /* NEW LOCKED-4: reschedule is two explicit steps — CANCEL first, then
     schedule the fresh slot (drawer opens right after the cancel). */
  const handleCancelForReschedule = async (interviewId: string) => {
    const reason = prompt('Reschedule: first CANCEL the current interview, then schedule the new slot.\nCancellation reason (visible to panel + candidate):', 'Rescheduled by HR');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('A cancellation reason is required'); return; }
    if (!confirm('Cancel this interview now? The candidate and panel will be informed. The schedule drawer opens next so you can book the new slot.')) return;
    setActionLoading(interviewId + '-cancel');
    try {
      const res = await fetch('/api/interviews', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: interviewId, action: 'cancel', cancelReason: reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Interview cancelled. Now schedule the new slot.');
      fetchInterviews();
      setPageTab('schedule');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally { setActionLoading(null); }
  };

  const handleSubmitAttendance = async () => {
    if (!attendanceDraft) return;
    setActionLoading(attendanceDraft.interviewId + '-complete');
    try {
      const panelArray = Object.entries(attendanceDraft.panelAttendance).map(([userId, attendance]) => ({ userId, attendance }));
      const res = await fetch('/api/interviews', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: attendanceDraft.interviewId,
          action: 'mark_completed',
          candidateAttendance: attendanceDraft.candidateAttendance,
          panelAttendance: panelArray,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Interview marked as completed with attendance recorded.');
      setAttendanceDraft(null);
      fetchInterviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally { setActionLoading(null); }
  };

  /* HR final decision — inline composer. */
  const openDecisionDraft = (interview: Interview, decision: string) => {
    setDecisionDraft({
      interviewId: interview.id, decision, reason: '',
      nextDate: '', nextTime: '10:00', nextDuration: 60, nextType: 'technical',
      nextLocation: '', nextMeetingUrl: '', nextPanelMemberIds: [], sendHoldEmail: true,
    });
  };

  const handleHrDecision = async () => {
    if (!decisionDraft) return;
    if ((decisionDraft.decision === 'next_round' || decisionDraft.decision === 'schedule_another') && !decisionDraft.nextDate) {
      toast.error('Please pick a date for the next interview round');
      return;
    }
    setActionLoading(decisionDraft.interviewId + '-decision');
    try {
      const payload: Record<string, unknown> = {
        id: decisionDraft.interviewId,
        action: 'hr_decision',
        decision: decisionDraft.decision,
        reason: decisionDraft.reason || undefined,
      };
      if (decisionDraft.decision === 'next_round' || decisionDraft.decision === 'schedule_another') {
        payload.nextRound = {
          date: decisionDraft.nextDate,
          time: decisionDraft.nextTime || undefined,
          duration: decisionDraft.nextDuration || 60,
          type: decisionDraft.nextType,
          location: decisionDraft.nextLocation || undefined,
          meetingUrl: decisionDraft.nextMeetingUrl || undefined,
          panelMemberIds: decisionDraft.nextPanelMemberIds,
        };
      }
      if (decisionDraft.decision === 'hold') payload.sendHoldEmail = decisionDraft.sendHoldEmail;

      const res = await fetch('/api/interviews', { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      // Surface the full result so HR knows if the email actually went out.
      const label = DECISION_LABELS[decisionDraft.decision] || decisionDraft.decision;
      let msg = `Decision recorded: ${label}. Candidate stage: ${data.newAppStatus || '-'}.`;
      if (data.newInterviewId) msg += ' New interview created.';
      if (data.newOfferId) msg += ' Draft offer created.';
      if (data.emailSent === false) {
        msg += ` Candidate email NOT sent${data.emailError ? ` — ${data.emailError}` : ''}.`;
        toast.error(msg);
      } else {
        msg += ' Candidate email sent.';
        toast.success(msg);
      }
      setDecisionDraft(null);
      fetchInterviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally { setActionLoading(null); }
  };

  /* Replace a declined panel member — existing endpoint. */
  const handleReplacePanel = async () => {
    if (!replaceDraft) return;
    if (!replaceDraft.newUserId) { toast.error('Pick a replacement panel member'); return; }
    if (!replaceDraft.reason.trim()) { toast.error('A reason is required'); return; }
    setActionLoading(replaceDraft.interviewId + '-replace');
    try {
      const res = await fetch(`/api/interviews/${replaceDraft.interviewId}/replace-panel`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'replace',
          oldUserId: replaceDraft.oldUserId,
          newUserId: replaceDraft.newUserId,
          reason: replaceDraft.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(`${replaceDraft.oldName} replaced. The new panel member has been notified.`);
      setReplaceDraft(null);
      fetchInterviews();
      setFeedbackByInterview({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally { setActionLoading(null); }
  };

  /* ═══════════ RENDER ═══════════ */

  /* ── Schedule Interview sub-tab ── */
  if (pageTab === 'schedule') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center text-[10.5px] text-slate-400 gap-1.5">
          <span>Recruitment</span><span className="text-slate-300">/</span>
          <button onClick={() => setPageTab('list')} className="font-semibold hover:text-green-700 transition">Scheduled Interviews</button>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-green-700">Schedule Interview</span>
        </div>
        <ScheduleScreen
          interviews={interviews}
          onScheduled={() => { fetchInterviews(); setPageTab('list'); }}
          onBack={() => setPageTab('list')}
        />
      </div>
    );
  }

  /* ── Access gate ── */
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <FiAlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Access restricted</h2>
        <p className="text-sm text-slate-500">
          The Interview Management page is only available to HR / Admin roles.
          If you are a panel member, please use{' '}
          <a href="/my-interviews" className="text-green-700 font-semibold hover:underline">My Interviews</a>.
        </p>
      </div>
    );
  }

  /* ── Derived: KPIs ── */
  const panel = (i: Interview) => i.panelMembers || [];
  const hasPendingPanel = (i: Interview) => panel(i).some(p => p.confirmationStatus === 'pending');
  const hasMissingFeedback = (i: Interview) => i.status === 'completed' && panel(i).some(p => p.confirmationStatus === 'accepted' && !p.hasFeedback);

  const kpis = {
    total: interviews.length,
    scheduled: interviews.filter(i => i.status === 'scheduled').length,
    awaitingPanel: interviews.filter(i => i.status === 'scheduled' && hasPendingPanel(i)).length,
    feedbacksDue: interviews.filter(hasMissingFeedback).length,
    decisionsPending: interviews.filter(i => i.status === 'completed' && !i.hrDecision).length,
  };

  const kpiCards = [
    { key: 'all', label: 'Total', value: kpis.total, icon: FiCalendar, tone: 'text-slate-600', ring: 'bg-slate-100' },
    { key: 'scheduled', label: 'Scheduled', value: kpis.scheduled, icon: FiClock, tone: 'text-amber-600', ring: 'bg-amber-50' },
    { key: 'awaiting_panel', label: 'Awaiting Panel', value: kpis.awaitingPanel, icon: FiUserPlus, tone: 'text-blue-600', ring: 'bg-blue-50' },
    { key: 'feedbacks_due', label: 'Feedbacks Due', value: kpis.feedbacksDue, icon: FiStar, tone: 'text-violet-600', ring: 'bg-violet-50' },
    { key: 'decisions_pending', label: 'Decisions Pending', value: kpis.decisionsPending, icon: FiCheckCircle, tone: 'text-teal-600', ring: 'bg-teal-50' },
  ];

  /* ── Derived: filter list ── */
  const jobOptions = Array.from(new Set(interviews.map(i => i.jobTitle).filter(Boolean))) as string[];
  const typeOptions = Array.from(new Set(interviews.map(i => i.type).filter(Boolean)));
  const roundOptions = Array.from(new Set(interviews.map(i => String(i.round || 1)))).sort((a, b) => Number(a) - Number(b));

  /* ── Derived: filtered rows ── */
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfToday); endOfWeek.setDate(endOfWeek.getDate() + 7);
  const endOfNextWeek = new Date(startOfToday); endOfNextWeek.setDate(endOfNextWeek.getDate() + 14);

  /* Interview-level predicate shared by KPI cards, filters, and search. */
  const matches = (i: Interview): boolean => {
    if (kpiFilter === 'scheduled' && i.status !== 'scheduled') return false;
    if (kpiFilter === 'awaiting_panel' && !(i.status === 'scheduled' && hasPendingPanel(i))) return false;
    if (kpiFilter === 'feedbacks_due' && !hasMissingFeedback(i)) return false;
    if (kpiFilter === 'decisions_pending' && !(i.status === 'completed' && !i.hrDecision)) return false;

    if (jobFilter && i.jobTitle !== jobFilter) return false;
    if (typeFilter && i.type !== typeFilter) return false;
    if (roundFilter && String(i.round || 1) !== roundFilter) return false;
    if (panelFilter === 'awaiting' && !hasPendingPanel(i)) return false;
    if (panelFilter === 'all_accepted' && (panel(i).length === 0 || !panel(i).every(p => p.confirmationStatus === 'accepted'))) return false;
    if (panelFilter === 'declined' && !panel(i).some(p => p.confirmationStatus === 'declined')) return false;

    if (dateFilter) {
      const d = new Date(i.date);
      if (dateFilter === 'today' && d < startOfToday) return false;
      if (dateFilter === 'this_week' && (d < startOfToday || d > endOfWeek)) return false;
      if (dateFilter === 'next_week' && (d < endOfWeek || d > endOfNextWeek)) return false;
      if (dateFilter === 'past' && d >= startOfToday) return false;
    }

    if (q) {
      const s = q.toLowerCase();
      const inPanel = panel(i).some(p => (p.name || '').toLowerCase().includes(s));
      if (
        !(i.candidateName || '').toLowerCase().includes(s) &&
        !(i.candidateEmail || '').toLowerCase().includes(s) &&
        !(i.jobTitle || '').toLowerCase().includes(s) &&
        !inPanel
      ) return false;
    }
    return true;
  };

  /* ── Candidate groups: a group is shown when ANY of its rounds matches the
     filters, and expanding it always shows ALL of its rounds (full context —
     the user asked for "everything about this candidate in one place"). ── */
  const allGroups = buildGroups(interviews);
  const visibleGroups = allGroups.filter(g => g.ivs.some(matches));
  const filteredInterviews = interviews.filter(matches);

  const nextTs = (g: CandidateGroup) => (g.next ? ivTime(g.next) : Infinity);
  const feedbackRank = (g: CandidateGroup) => (g.ivs.some(hasMissingFeedback) ? 0 : 1);
  const sortedGroups = [...visibleGroups].sort((a, b) => {
    if (sort === 'newest') return b.lastActivity - a.lastActivity;
    if (sort === 'feedback_due') {
      const ra = feedbackRank(a), rb = feedbackRank(b);
      if (ra !== rb) return ra - rb;
      return nextTs(a) - nextTs(b);
    }
    // soonest — next upcoming interview first, ties by most recent activity
    if (nextTs(a) !== nextTs(b)) return nextTs(a) - nextTs(b);
    return b.lastActivity - a.lastActivity;
  });

  const hasActiveFilters = q || jobFilter || typeFilter || roundFilter || panelFilter || dateFilter || kpiFilter !== 'all';
  const clearFilters = () => {
    setQ(''); setJobFilter(''); setTypeFilter(''); setRoundFilter('');
    setPanelFilter(''); setDateFilter(''); setKpiFilter('all'); setSort('soonest');
  };

  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 8rem)', minHeight: 560 }}>
      {/* breadcrumb + header */}
      <div className="flex items-center text-[10.5px] text-slate-400 gap-1.5">
        <span>Recruitment</span><span className="text-slate-300">/</span>
        <span className="font-semibold text-green-700">Scheduled Interviews</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold text-slate-900 tracking-tight">Scheduled Interviews</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Panel acceptance, feedback, and final decisions — everything inline, nothing buried in modals.</p>
        </div>
        {/* sub-tab switch: list | schedule */}
        <div className="inline-flex rounded-[9px] border border-slate-300 bg-white p-0.5 shrink-0">
          <button
            onClick={() => setPageTab('list')}
            className={`h-[28px] px-3 rounded-[7px] text-[11.5px] font-bold transition ${pageTab === 'list' ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            All Interviews
          </button>
          <button
            onClick={() => setPageTab('schedule')}
            className={`h-[28px] px-3 rounded-[7px] text-[11.5px] font-bold inline-flex items-center gap-1.5 transition ${pageTab === 'schedule' ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <FiCalendar className="w-3 h-3" /> Schedule Interview
          </button>
        </div>
      </div>

      {/* KPI cards double as filters */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpiCards.map(k => (
          <button
            key={k.key}
            onClick={() => setKpiFilter(k.key)}
            title={`Filter by ${k.label.toLowerCase()}`}
            className={`rounded-xl border bg-white shadow-sm p-3 flex items-center justify-between gap-2 text-left transition
              ${kpiFilter === k.key ? 'border-green-600 bg-green-50 ring-1 ring-green-600' : 'border-slate-200 hover:border-green-300'}`}
          >
            <div className="min-w-0">
              <p className={`text-[9.5px] font-extrabold uppercase tracking-[0.5px] ${kpiFilter === k.key ? 'text-green-700' : 'text-slate-400'}`}>{k.label}</p>
              <p className="text-[20px] font-extrabold leading-none mt-1.5 text-slate-800">{k.value}</p>
            </div>
            <span className={`w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0 ${k.ring}`}>
              <k.icon className={`w-[15px] h-[15px] ${k.tone}`} />
            </span>
          </button>
        ))}
      </div>

      {/* compact filter bar */}
      <div className={`${CARD_CLS} p-2.5 flex flex-wrap items-center gap-2`}>
        <span className="hidden text-[9px] font-extrabold uppercase tracking-[0.8px] text-slate-400 sm:inline">Filter</span>
        <select value={jobFilter} onChange={e => setJobFilter(e.target.value)} className={FILTER_CLS} style={{ maxWidth: 170 }}>
          <option value="">All Jobs</option>
          {jobOptions.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={FILTER_CLS}>
          <option value="">All Types</option>
          {typeOptions.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
        <select value={roundFilter} onChange={e => setRoundFilter(e.target.value)} className={FILTER_CLS}>
          <option value="">All Rounds</option>
          {roundOptions.map(r => <option key={r} value={r}>Round {r}</option>)}
        </select>
        <select value={panelFilter} onChange={e => setPanelFilter(e.target.value)} className={FILTER_CLS}>
          <option value="">Any Panel Reply</option>
          <option value="awaiting">Awaiting someone</option>
          <option value="all_accepted">All accepted</option>
          <option value="declined">Someone declined</option>
        </select>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className={FILTER_CLS}>
          <option value="">All Dates</option>
          <option value="today">Today onwards</option>
          <option value="this_week">This week</option>
          <option value="next_week">Next week</option>
          <option value="past">Past</option>
        </select>
        <div className="flex-1 min-w-[180px] relative">
          <FiSearch className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search candidate, email, panel member, or job…"
            className="w-full h-[30px] rounded-[7px] border border-slate-300 bg-white pl-7 pr-2 text-[11.5px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15"
          />
        </div>
        <select value={sort} onChange={e => setSort(e.target.value)} className={FILTER_CLS}>
          <option value="soonest">Soonest first</option>
          <option value="newest">Newest first</option>
          <option value="feedback_due">Feedback due</option>
        </select>
        <button onClick={clearFilters} disabled={!hasActiveFilters} className="inline-flex items-center gap-1 h-[30px] px-2.5 rounded-[7px] border border-slate-300 bg-white text-slate-600 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <FiX className="w-3 h-3" /> Clear
        </button>
      </div>

      {/* table */}
      <div className={`${CARD_CLS} flex-1 min-h-0 flex flex-col overflow-hidden`}>
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse min-w-[980px]">
            <thead>
              <tr>
                <th style={{ width: 26 }}></th>
                {['Candidate', 'Position', 'Rounds', 'Next Interview', 'Feedback', 'Status'].map(h => (
                  <th key={h} className="sticky top-0 z-[2] bg-slate-50 text-left text-[9.5px] font-extrabold uppercase tracking-[0.6px] text-slate-500 px-2.5 py-2 border-b border-slate-200">{h}</th>
                ))}
                <th className="sticky top-0 z-[2] bg-slate-50 text-right text-[9.5px] font-extrabold uppercase tracking-[0.6px] text-slate-500 px-2.5 py-2 border-b border-slate-200">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-14 text-center text-[12px] text-slate-400">Loading interviews…</td></tr>
              ) : sortedGroups.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center">
                  <FiCalendar className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                  <p className="text-[12.5px] font-bold text-slate-600">No candidates match these filters</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {interviews.length === 0 ? 'No interviews scheduled yet — use Schedule Interview to create the first one.' : 'Try widening the search or clearing a filter or two.'}
                  </p>
                </td></tr>
              ) : sortedGroups.map(g => {
                const pmAll = g.ivs.flatMap(iv => panel(iv));
                const fbAll = pmAll.filter(p => p.hasFeedback).length;
                const nextChip = g.next ? whenChip(g.next.date, g.next.time) : null;
                const isOpen = expandedGroupId === g.key;
                // pipeline state for the whole group: upcoming > completed > cancelled
                const stateChip = g.next
                  ? STATUS_META.scheduled
                  : g.doneCount > 0 ? STATUS_META.completed : STATUS_META.cancelled;
                return (
                  <Fragment key={g.key}>
                    <tr
                      onClick={() => toggleGroup(g)}
                      className={`cursor-pointer transition-colors border-l-4 ${g.next ? 'border-l-amber-400' : g.pendingDecisions > 0 ? 'border-l-green-500' : 'border-l-slate-300'} ${isOpen ? 'bg-green-50' : 'hover:bg-green-50/60'}`}
                    >
                      <td className="px-1 py-2 align-middle">
                        <FiChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : '-rotate-90'}`} />
                      </td>
                      {/* candidate */}
                      <td className="px-2.5 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarColor(g.candidateName || g.key)} text-white text-[10px] font-extrabold flex items-center justify-center shrink-0`}>
                            {initials(g.candidateName)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11.5px] font-bold text-slate-800 truncate">{g.candidateName}</p>
                            <p className="text-[10px] text-slate-400 truncate">{g.candidateEmail || ''}</p>
                          </div>
                        </div>
                      </td>
                      {/* position */}
                      <td className="px-2.5 py-2">
                        <p className="text-[11.5px] font-semibold text-slate-700 truncate">{g.jobTitle}</p>
                        <p className="text-[10px] text-slate-400">{g.ivs.length} interview{g.ivs.length !== 1 ? 's' : ''}</p>
                      </td>
                      {/* rounds progress — the candidate's whole pipeline at a glance */}
                      <td className="px-2.5 py-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {Array.from({ length: g.totalRounds }, (_, idx) => {
                            const r = idx + 1;
                            const state = roundState(g, r);
                            return (
                              <span
                                key={r}
                                title={`Round ${r} — ${state === 'done' ? 'cleared' : state === 'active' ? 'scheduled' : state === 'cancelled' ? 'cancelled' : 'not scheduled yet'}`}
                                className={`w-[24px] h-[22px] rounded-[6px] border flex items-center justify-center text-[9.5px] font-extrabold transition
                                  ${state === 'done' ? 'bg-green-600 border-green-600 text-white'
                                    : state === 'active' ? 'bg-amber-50 border-amber-400 text-amber-700 ring-1 ring-amber-300/60'
                                    : state === 'cancelled' ? 'bg-red-50 border-red-200 text-red-400'
                                    : 'bg-white border-slate-200 text-slate-400'}`}
                              >
                                {state === 'done' ? <FiCheck className="w-3 h-3" /> : state === 'cancelled' ? <FiX className="w-2.5 h-2.5" /> : r}
                              </span>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">
                          {g.doneCount}/{g.totalRounds} cleared{g.scheduledCount > 0 ? ` · ${g.scheduledCount} scheduled` : ''}
                        </p>
                      </td>
                      {/* next interview */}
                      <td className="px-2.5 py-2">
                        {g.next ? (
                          <>
                            <p className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">{fmtWeekday(g.next.date)}{g.next.time ? ` · ${g.next.time}` : ''}</p>
                            <p className="text-[10px] text-slate-400 whitespace-nowrap">R{g.next.round || 1} · {typeLabel(g.next.type)} · {g.next.duration || 60} min</p>
                            {nextChip && (
                              <span className={`inline-flex items-center rounded border px-1 py-px text-[9.5px] font-extrabold mt-0.5 ${nextChip.cls}`}>{nextChip.label}</span>
                            )}
                          </>
                        ) : g.doneCount > 0 ? (
                          <>
                            <p className="text-[11px] font-semibold text-slate-500">No upcoming</p>
                            <p className="text-[10px] text-slate-400">{g.pendingDecisions > 0 ? 'awaiting decision' : 'all rounds completed'}</p>
                          </>
                        ) : (
                          <span className="text-[10.5px] text-slate-300">—</span>
                        )}
                      </td>
                      {/* feedback across all rounds */}
                      <td className="px-2.5 py-2">
                        {pmAll.length > 0 ? (
                          <>
                            <p className={`text-[10.5px] font-bold ${fbAll === pmAll.length ? 'text-green-700' : 'text-slate-600'}`}>{fbAll}/{pmAll.length}</p>
                            <div className="w-[52px] h-[5px] rounded-full bg-slate-200 overflow-hidden mt-1">
                              <span className="block h-full bg-green-500 rounded-full" style={{ width: `${(fbAll / pmAll.length) * 100}%` }} />
                            </div>
                          </>
                        ) : <span className="text-[10.5px] text-slate-300">—</span>}
                      </td>
                      {/* status */}
                      <td className="px-2.5 py-2">
                        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${stateChip.badge}`}>{stateChip.label}</span>
                        {/* dynamic panel-acceptance for the next upcoming round */}
                        {g.next && panel(g.next).length > 0 && (() => {
                          const acc = panel(g.next).filter(p => p.confirmationStatus === 'accepted').length;
                          const tot = panel(g.next).length;
                          const all = acc === tot;
                          return (
                            <span
                              title={`Panel acceptance for Round ${g.next.round || 1}: ${acc} of ${tot} interviewers accepted. The candidate is emailed only once all accept.`}
                              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold mt-1 ${all ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                            >
                              {all ? `Acceptance ${acc}/${tot}` : `Pending ${acc}/${tot} accepted`}
                            </span>
                          );
                        })()}
                        {g.pendingDecisions > 0 && (
                          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 mt-1">Decision pending</span>
                        )}
                        {g.latestDecision && (
                          <span className="inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 mt-1">
                            {DECISION_LABELS[g.latestDecision] || g.latestDecision}
                          </span>
                        )}
                      </td>
                      {/* actions */}
                      <td className="px-2.5 py-2">
                        <div className="flex gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                          <a
                            href="/recruitment?tab=candidates"
                            title="Open Find Candidates"
                            className="w-[26px] h-[26px] rounded-[7px] border border-slate-300 bg-white flex items-center justify-center text-slate-500 hover:border-green-500 hover:text-green-700 hover:bg-green-50 transition"
                          >
                            <FiExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                    <tr>
                      <td colSpan={8} className="p-0 border-b border-slate-200">
                        <div className="p-3 space-y-2.5" style={{ background: 'linear-gradient(180deg,#f0fdf4,#ffffff)' }}>
                        {/* candidate summary strip */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] border border-green-200 bg-green-50/60 px-3 py-2">
                          <b className="text-[12.5px] text-slate-800">{g.candidateName}</b>
                          <span className="text-[11px] text-slate-500 truncate">{g.jobTitle} · {g.candidateEmail || 'no email'}</span>
                          <span className="text-[10.5px] font-bold text-green-700 whitespace-nowrap">{g.doneCount} of {g.totalRounds} rounds cleared</span>
                          {g.scheduledCount > 0 && <span className="text-[10.5px] font-bold text-amber-700 whitespace-nowrap">{g.scheduledCount} scheduled</span>}
                          {g.pendingDecisions > 0 && <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 whitespace-nowrap">{g.pendingDecisions} decision{g.pendingDecisions > 1 ? 's' : ''} pending</span>}
                          {g.latestDecision && (
                            <span className="inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 whitespace-nowrap">
                              {DECISION_LABELS[g.latestDecision] || g.latestDecision}
                            </span>
                          )}
                        </div>
                        {/* one block per round — everything about this candidate, stacked */}
                        {g.ivs.map(interview => {
                          const pm = panel(interview);
                          const feedbackList = feedbackByInterview[interview.id] || [];
                          const planTotal = Number(interview.planTotal || 0);
                          const curRound = Number(interview.round || 1);
                          const lead = pm.find(p => p.userId === interview.panelLeadId);
                          const evalAreas = parseEvalAreas(interview.evaluationAreas);
                          const myDraft = decisionDraft?.interviewId === interview.id ? decisionDraft : null;
                          const myAttendance = attendanceDraft?.interviewId === interview.id ? attendanceDraft : null;
                          const st = STATUS_META[interview.status] || { label: interview.status, badge: 'bg-slate-100 text-slate-600 border-slate-200', border: 'border-l-slate-300' };
                          const wchip = whenChip(interview.date, interview.time);
                          const canComplete = interview.status === 'scheduled';
                          // Dynamic panel-acceptance state (pending X of Y ↔ completed)
                          const accCount = pm.filter(p => p.confirmationStatus === 'accepted').length;
                          const decCount = pm.filter(p => p.confirmationStatus === 'declined').length;
                          const pendCount = pm.length - accCount - decCount;
                          const acceptanceDone = pm.length > 0 && accCount === pm.length;
                          // Feedback gate: HR can send the consolidated feedback to the
                          // candidate only after EVERY panel member has submitted.
                          const fbReceived = pm.filter(p => p.hasFeedback).length;
                          const feedbackAllIn = pm.length === 0 || fbReceived === pm.length;
                          const roundsLeft = planTotal > 0 ? Math.max(planTotal - curRound, 0) : null;
                          return (
                          <div key={interview.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                          {/* round header — instant scannability */}
                          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50/80 border-b border-slate-200">
                            <span className="w-[24px] h-[24px] rounded-[7px] bg-green-600 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">R{curRound}</span>
                            <b className="text-[12px] text-slate-800">{typeLabel(interview.type)}</b>
                            <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${st.badge}`}>{st.label}</span>
                            {/* dynamic panel acceptance — pending x/y or completed */}
                            {pm.length > 0 && (interview.status === 'scheduled' || interview.status === 'rescheduled') && (
                              <span
                                title={`Panel acceptance: ${accCount} of ${pm.length} interviewers accepted${decCount ? `, ${decCount} declined` : ''}${pendCount ? `, ${pendCount} pending` : ''}. The candidate is emailed only once every interviewer accepts.`}
                                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${acceptanceDone ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                              >
                                <FiUser className="w-2.5 h-2.5" />
                                {acceptanceDone ? `Acceptance completed ${accCount}/${pm.length}` : `Acceptance pending ${accCount}/${pm.length}`}
                              </span>
                            )}
                            <span className="text-[10.5px] text-slate-500 whitespace-nowrap">{fmtWeekday(interview.date)}{interview.time ? ` · ${interview.time}` : ''}</span>
                            {wchip && (
                              <span className={`inline-flex items-center rounded border px-1 py-px text-[9.5px] font-extrabold ${wchip.cls}`}>{wchip.label}</span>
                            )}
                            {interview.hrDecision && (
                              <span className="inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">{DECISION_LABELS[interview.hrDecision] || interview.hrDecision}</span>
                            )}
                            <div className="ml-auto flex items-center gap-1.5">
                              {canComplete && (
                                <button
                                  onClick={() => handleMarkCompleted(interview.id)}
                                  disabled={actionLoading === interview.id + '-complete'}
                                  title="Mark this round completed"
                                  className="h-[26px] px-2.5 rounded-[7px] border border-slate-300 bg-white inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-600 hover:border-green-500 hover:text-green-700 hover:bg-green-50 transition disabled:opacity-40"
                                >
                                  <FiCheckCircle className="w-3 h-3" /> {actionLoading === interview.id + '-complete' ? 'Marking…' : 'Complete'}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-3 p-3 lg:grid-cols-3">
                              {/* ── card 1: interview & plan ── */}
                              <div className={`${CARD_CLS} p-3`}>
                                <h4 className={SECTION_TITLE}><FiCalendar className="w-3 h-3 text-green-600" /> Interview &amp; Plan</h4>
                                {planTotal > 0 && (
                                  <div className="flex items-center gap-2 mb-2.5">
                                    <span className="text-[10px] font-extrabold text-green-700">R{curRound} of {planTotal}</span>
                                    <div className="flex-1 h-[6px] rounded-full bg-slate-200 overflow-hidden">
                                      <span className="block h-full bg-green-500 rounded-full" style={{ width: `${(curRound / planTotal) * 100}%` }} />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400">{Math.max(planTotal - curRound, 0)} left</span>
                                  </div>
                                )}
                                <div className="space-y-1.5 text-[11px]">
                                  <p className="text-slate-600"><b className="text-slate-800 inline-block min-w-[68px]">Round</b> {typeLabel(interview.type)} — Round {curRound}</p>
                                  <p className="text-slate-600"><b className="text-slate-800 inline-block min-w-[68px]">Schedule</b> {fmtDate(interview.date)}{interview.time ? ` · ${interview.time}` : ''} ({interview.duration || 60} min)</p>
                                  <p className="text-slate-600 flex items-start gap-1">
                                    <b className="text-slate-800 inline-block min-w-[68px] shrink-0">Mode</b>
                                    <span className="min-w-0 break-words">
                                      {MODE_LABELS[interview.mode || 'online'] || interview.mode}
                                      {interview.location ? ` · ${interview.location}` : ''}
                                      {interview.meetingUrl && (
                                        <>
                                          {' · '}
                                          <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 font-semibold hover:underline break-all">{interview.meetingUrl}</a>
                                        </>
                                      )}
                                    </span>
                                  </p>
                                  {lead && <p className="text-slate-600"><b className="text-slate-800 inline-block min-w-[68px]">Panel lead</b> {lead.name}</p>}
                                  {(interview.confirmationDeadline || interview.feedbackDeadline) && (
                                    <p className="text-slate-600"><b className="text-slate-800 inline-block min-w-[68px]">Deadlines</b>
                                      {interview.confirmationDeadline && <>confirm by {fmtDate(interview.confirmationDeadline)} </>}
                                      {interview.feedbackDeadline && <>· feedback by {fmtDate(interview.feedbackDeadline)}</>}
                                    </p>
                                  )}
                                  {evalAreas.length > 0 && (
                                    <div>
                                      <p className="text-slate-800 font-bold text-[10px] uppercase tracking-wide mt-1 mb-1">Evaluate</p>
                                      <div className="flex flex-wrap gap-1">
                                        {evalAreas.map(a => <span key={a} className="rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">{a}</span>)}
                                      </div>
                                    </div>
                                  )}
                                  {interview.instructions && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10.5px] text-amber-800 leading-relaxed mt-1.5">
                                      <b>HR note:</b> {interview.instructions}
                                    </div>
                                  )}
                                  {interview.cancelReason && (
                                    <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[10.5px] text-red-700 leading-relaxed mt-1.5">
                                      <b>Cancelled:</b> {interview.cancelReason}
                                    </div>
                                  )}
                                </div>
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-3">
                                  <a href="/recruitment?tab=candidates" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-green-700 hover:underline">
                                    <FiExternalLink className="w-3 h-3" /> Candidate profile
                                  </a>
                                </div>
                              </div>

                              {/* ── card 2: panel & feedback ── */}
                              <div className={`${CARD_CLS} p-3`}>
                                <h4 className={SECTION_TITLE}>
                                  <FiUser className="w-3 h-3 text-green-600" />
                                  Panel &amp; Feedback — {pm.filter(p => p.hasFeedback).length} of {pm.length} submitted
                                  {loadingFeedbackId === interview.id && <span className="text-slate-400 font-bold normal-case tracking-normal">loading…</span>}
                                  <span className="ml-auto inline-flex items-center gap-1.5 normal-case tracking-normal">
                                    <span className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-1.5 py-0.5 text-[9.5px] font-extrabold text-green-700"><FiCheck className="w-2.5 h-2.5" />{pm.filter(p => p.hasFeedback).length} Received</span>
                                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-extrabold text-amber-700"><FiClock className="w-2.5 h-2.5" />{pm.filter(p => !p.hasFeedback).length} Pending</span>
                                    <button
                                      onClick={e => { e.stopPropagation(); handleSendFeedbackReminder(interview.id); }}
                                      disabled={actionLoading === interview.id + '-remind' || pm.every(p => p.hasFeedback)}
                                      className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[9.5px] font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                                      title="Nudge every panel member who has not submitted feedback"
                                    >
                                      {actionLoading === interview.id + '-remind' ? 'Sending…' : 'Send Reminder'}
                                    </button>
                                  </span>
                                </h4>
                                {pm.length === 0 && <p className="text-[11.5px] text-slate-400">No panel members assigned.</p>}
                                {pm.map(p => {
                                  const fb = feedbackList.find(f => f.userId === p.userId);
                                  const replaceUi = replaceDraft?.interviewId === interview.id && replaceDraft.oldUserId === p.userId;
                                  return (
                                    <div key={p.id}>
                                      <div className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 mb-1.5 ${p.confirmationStatus === 'declined' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                                        <span className={`w-[22px] h-[22px] rounded-full bg-gradient-to-br ${avatarColor(p.name)} text-white text-[8.5px] font-extrabold flex items-center justify-center shrink-0`}>{initials(p.name)}</span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[11px] font-bold text-slate-800 truncate">
                                            {p.name}
                                            {interview.panelLeadId === p.userId && <span className="ml-1.5 text-[9px] font-extrabold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1 py-px">LEAD</span>}
                                          </p>
                                          <p className="text-[10px] text-slate-400 truncate">{p.designation} · {p.email}</p>
                                        </div>
                                        <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[9.5px] font-extrabold shrink-0 ${CONFIRM_META[p.confirmationStatus]?.cls || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                          {CONFIRM_META[p.confirmationStatus]?.label || p.confirmationStatus}
                                        </span>
                                        {p.hasFeedback && p.feedbackRating != null && (
                                          <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-extrabold shrink-0 ${REC_META[p.feedbackRecommendation || '']?.cls || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                            <FiStar className="w-2.5 h-2.5" />{p.feedbackRating}/5 · {REC_META[p.feedbackRecommendation || '']?.label || 'Feedback'}
                                          </span>
                                        )}
                                        {!p.hasFeedback && (
                                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-extrabold text-amber-700 shrink-0">
                                            <FiClock className="w-2.5 h-2.5" />Feedback Pending
                                          </span>
                                        )}
                                        {!p.hasFeedback && (
                                          <button
                                            onClick={e => { e.stopPropagation(); handleSendFeedbackReminder(interview.id, p.userId); }}
                                            disabled={actionLoading === interview.id + '-remind'}
                                            className="text-[10px] font-bold text-amber-600 hover:underline shrink-0"
                                            title={`Send a feedback reminder to ${p.name}`}
                                          >
                                            Remind
                                          </button>
                                        )}
                                        {p.confirmationStatus === 'declined' && !replaceUi && (
                                          <button
                                            onClick={e => { e.stopPropagation(); queueMicrotask(() => fetchPanelCandidates()); setReplaceDraft({ interviewId: interview.id, oldUserId: p.userId, oldName: p.name, newUserId: '', reason: p.reason || '' }); }}
                                            className="text-[10px] font-bold text-blue-600 hover:underline shrink-0"
                                          >
                                            Replace panel →
                                          </button>
                                        )}
                                      </div>

                                      {/* replace-panel inline composer */}
                                      {replaceUi && (
                                        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 mb-1.5" onClick={e => e.stopPropagation()}>
                                          <p className="text-[10.5px] font-bold text-slate-700 mb-1.5">Replace {replaceDraft.oldName} with:</p>
                                          <select
                                            value={replaceDraft.newUserId}
                                            onChange={e => setReplaceDraft({ ...replaceDraft, newUserId: e.target.value })}
                                            className={INPUT_CLS}
                                          >
                                            <option value="">Select a replacement…</option>
                                            {panelCandidates.filter(c => c.id !== replaceDraft.oldUserId && !pm.some(m => m.userId === c.id)).map(c => (
                                              <option key={c.id} value={c.id}>{c.name} — {c.designation}</option>
                                            ))}
                                          </select>
                                          <input
                                            value={replaceDraft.reason}
                                            onChange={e => setReplaceDraft({ ...replaceDraft, reason: e.target.value })}
                                            placeholder="Reason (required, sent with the notification)…"
                                            className={INPUT_CLS + ' mt-1.5'}
                                          />
                                          <div className="flex gap-2 mt-2 justify-end">
                                            <button onClick={() => setReplaceDraft(null)} className={BTN_GHOST}>Cancel</button>
                                            <button
                                              onClick={handleReplacePanel}
                                              disabled={actionLoading === interview.id + '-replace' || !replaceDraft.newUserId || !replaceDraft.reason.trim()}
                                              className={BTN_PRI}
                                            >
                                              <FiRefreshCw className="w-3 h-3" /> Replace &amp; Notify
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      {/* full feedback detail (fetched on expand) */}
                                      {p.hasFeedback && fb && (
                                        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 mb-1.5 text-[10.5px] leading-relaxed" onClick={e => e.stopPropagation()}>
                                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                            {[['Technical', fb.technicalSkills], ['Communication', fb.communication], ['Experience', fb.experience], ['Problem solving', fb.problemSolving], ['Role suitability', fb.roleSuitability], ['Cultural fit', fb.culturalFit]].map(([lab, v]) => v ? (
                                              <p key={lab as string} className="text-slate-500"><b className="text-slate-700">{lab}:</b> {String(v)}</p>
                                            ) : null)}
                                          </div>
                                          {fb.strengths && <p className="text-slate-500 mt-1"><b className="text-green-700">Strengths:</b> {fb.strengths}</p>}
                                          {fb.concerns && <p className="text-slate-500"><b className="text-red-600">Concerns:</b> {fb.concerns}</p>}
                                          {fb.comments && <p className="text-slate-500"><b className="text-slate-700">Notes:</b> {fb.comments}</p>}
                                          {(fb.customFields || []).map((cf, i) => (
                                            <p key={i} className="text-slate-500"><b className="text-slate-700">{cf.name}:</b> {cf.value}</p>
                                          ))}
                                          <p className="text-[9.5px] text-slate-400 mt-1">Submitted {fmtDate(fb.submittedAt)}</p>
                                        </div>
                                      )}
                                      {p.confirmationStatus === 'requested_reschedule' && p.reason && (
                                        <p className="text-[10px] text-blue-700 -mt-1 mb-1.5 px-2"><b>Wants a different time:</b> {p.reason}</p>
                                      )}
                                      {p.confirmationStatus === 'declined' && p.reason && (
                                        <p className="text-[10px] text-red-600 -mt-1 mb-1.5 px-2"><b>Declined:</b> {p.reason}</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* ── card 3: actions & decision ── */}
                              <div className={`${CARD_CLS} p-3`} onClick={e => e.stopPropagation()}>
                                <h4 className={SECTION_TITLE}><FiCheckCircle className="w-3 h-3 text-green-600" /> Actions &amp; Decision</h4>

                                {interview.status === 'scheduled' && (
                                  <>
                                    <button
                                      onClick={() => handleMarkCompleted(interview.id)}
                                      disabled={actionLoading === interview.id + '-complete'}
                                      className={BTN_PRI + ' w-full mb-1.5'}
                                    >
                                      <FiCheckCircle className="w-3 h-3" /> {actionLoading === interview.id + '-complete' ? 'Marking…' : 'Mark Completed'}
                                    </button>
                                    <button
                                      onClick={() => handleMarkCompleted(interview.id, true)}
                                      className={BTN_GHOST + ' w-full mb-1.5'}
                                    >
                                      <FiCalendar className="w-3 h-3" /> Complete + Attendance
                                    </button>
                                  </>
                                )}

                                {/* NEW LOCKED-4: Reschedule = CANCEL first, then schedule fresh.
                                    Nothing changes silently: cancel informs panel + candidate,
                                    then the schedule drawer opens for the new slot. */}
                                {(interview.status === 'scheduled' || interview.status === 'rescheduled') && (
                                  <button
                                    onClick={() => handleCancelForReschedule(interview.id)}
                                    disabled={actionLoading === interview.id + '-cancel'}
                                    className={BTN_GHOST + ' w-full mb-2 border-amber-300 text-amber-700 hover:bg-amber-50'}
                                    title="Two steps: cancel this interview, then schedule the new slot"
                                  >
                                    <FiRefreshCw className="w-3 h-3" /> {actionLoading === interview.id + '-cancel' ? 'Cancelling…' : 'Reschedule (Cancel → New Slot)'}
                                  </button>
                                )}

                                {/* NEW LOCKED-3: HR final feedback — written by HR, delivered to the
                                    candidate in the portal and by email. Individual interviewer
                                    feedbacks stay internal. GATED: unlocks only when every panel
                                    member has submitted their feedback. */}
                                {(interview.status === 'completed' || interview.status === 'scheduled' || interview.status === 'rescheduled') && (
                                  <div className="rounded-lg border border-teal-200 bg-teal-50/50 px-2.5 py-2 mb-2">
                                    <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-teal-800 mb-1">Final Feedback to Candidate</p>
                                    <p className="text-[10px] text-teal-700 mb-1.5">
                                      Round {curRound}{planTotal > 0 ? ` of ${planTotal}` : ''}{roundsLeft !== null ? ` — ${roundsLeft === 0 ? 'final round' : `${roundsLeft} round${roundsLeft === 1 ? '' : 's'} left after this`}` : ''}
                                      {' · '}Panel feedback {fbReceived}/{pm.length || 0} received
                                    </p>
                                    {(interview as any).finalFeedback ? (
                                      <div className="text-[10.5px] leading-relaxed text-slate-600">
                                        <p><b className="text-teal-700">Decision:</b> {{ cleared: 'Cleared', rejected: 'Rejected', next_round: 'Cleared for Next Round', on_hold: 'On Hold' }[(interview as any).finalDecision] || (interview as any).finalDecision}</p>
                                        <p className="whitespace-pre-wrap mt-0.5">{(interview as any).finalFeedback}</p>
                                        <p className="text-[9.5px] text-slate-400 mt-1">Sent to the candidate (portal + email)</p>
                                      </div>
                                    ) : !feedbackAllIn ? (
                                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10.5px] text-amber-800 leading-relaxed">
                                        <b>Locked — panel feedback pending:</b> {fbReceived} of {pm.length} interviewers have submitted. The candidate hears nothing until all feedbacks are in. Use <b>Send Reminder</b> to nudge the pending interviewer{pm.length - fbReceived > 1 ? 's' : ''}, then send the consolidated feedback.
                                      </div>
                                    ) : finalFeedbackDraft?.interviewId === interview.id ? (
                                      <div onClick={e => e.stopPropagation()}>
                                        <select value={finalFeedbackDraft.decision} onChange={e => setFinalFeedbackDraft({ ...finalFeedbackDraft, decision: e.target.value })} className={INPUT_CLS + ' mb-1.5'}>
                                          <option value="cleared">Cleared</option>
                                          <option value="next_round">Cleared for Next Round</option>
                                          <option value="rejected">Rejected</option>
                                          <option value="on_hold">On Hold</option>
                                        </select>
                                        <textarea
                                          value={finalFeedbackDraft.feedback}
                                          onChange={e => setFinalFeedbackDraft({ ...finalFeedbackDraft, feedback: e.target.value })}
                                          placeholder="Write the final feedback for the candidate (based on the panel feedbacks above)…"
                                          rows={4}
                                          className={INPUT_CLS + ' mb-1.5'}
                                        />
                                        <div className="flex gap-2 justify-end">
                                          <button onClick={() => setFinalFeedbackDraft(null)} className={BTN_GHOST}>Cancel</button>
                                          <button onClick={handleSendFinalFeedback} disabled={actionLoading === interview.id + '-final' || !finalFeedbackDraft.feedback.trim()} className={BTN_PRI}>
                                            <FiCheck className="w-3 h-3" /> {actionLoading === interview.id + '-final' ? 'Sending…' : 'Send to Candidate'}
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={e => { e.stopPropagation(); setFinalFeedbackDraft({ interviewId: interview.id, decision: 'cleared', feedback: '' }); }}
                                        className={BTN_GHOST + ' w-full'}
                                      >
                                        <FiUser className="w-3 h-3" /> Write &amp; Send Final Feedback
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* inline attendance panel */}
                                {myAttendance && (
                                  <div className="rounded-lg border border-green-200 bg-green-50/60 p-2.5 mb-2">
                                    <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-slate-600 mb-1.5">Attendance</p>
                                    <label className="block text-[10.5px] font-bold text-slate-600 mb-1">Candidate</label>
                                    <div className="flex gap-1.5 mb-2">
                                      {[['attended', 'Attended'], ['late', 'Late'], ['no_show', 'No-show'], ['reschedule_required', 'Needs reschedule']].map(([v, lab]) => (
                                        <button
                                          key={v}
                                          onClick={() => setAttendanceDraft({ ...myAttendance, candidateAttendance: v })}
                                          className={`flex-1 rounded-[7px] border px-1 py-1 text-[10px] font-bold transition ${myAttendance.candidateAttendance === v ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-green-400'}`}
                                        >
                                          {lab}
                                        </button>
                                      ))}
                                    </div>
                                    <label className="block text-[10.5px] font-bold text-slate-600 mb-1">Panel</label>
                                    {pm.filter(p => p.confirmationStatus === 'accepted').map(p => (
                                      <div key={p.id} className="flex items-center gap-2 mb-1.5">
                                        <span className="text-[10.5px] text-slate-600 flex-1 truncate">{p.name}</span>
                                        <select
                                          value={myAttendance.panelAttendance[p.userId] || 'present'}
                                          onChange={e => setAttendanceDraft({ ...myAttendance, panelAttendance: { ...myAttendance.panelAttendance, [p.userId]: e.target.value } })}
                                          className={FILTER_CLS}
                                        >
                                          <option value="present">Present</option>
                                          <option value="late">Late</option>
                                          <option value="absent">Absent</option>
                                          <option value="replacement_joined">Replacement</option>
                                        </select>
                                      </div>
                                    ))}
                                    <div className="flex gap-2 justify-end mt-2">
                                      <button onClick={() => setAttendanceDraft(null)} className={BTN_GHOST}>Cancel</button>
                                      <button onClick={handleSubmitAttendance} disabled={actionLoading === interview.id + '-complete'} className={BTN_PRI}>
                                        <FiCheck className="w-3 h-3" /> Save + Complete
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* existing decision */}
                                {interview.hrDecision ? (
                                  <div className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-2">
                                    <p className="text-[11px] text-teal-800">
                                      <b>HR decision: {DECISION_LABELS[interview.hrDecision] || interview.hrDecision}</b>
                                      {interview.hrDecisionReason && <span className="block text-[10.5px] mt-0.5 text-teal-700">{interview.hrDecisionReason}</span>}
                                    </p>
                                  </div>
                                ) : interview.status === 'completed' ? (
                                  <>
                                    <p className="text-[10px] font-extrabold uppercase tracking-[0.5px] text-slate-400 mb-1.5">Final decision</p>
                                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                                      {[['offer', 'Offer'], ['next_round', 'Next Round'], ['hold', 'Hold'], ['reject', 'Reject']].map(([v, lab]) => (
                                        <button
                                          key={v}
                                          onClick={() => { if (v === 'next_round') queueMicrotask(() => fetchPanelCandidates()); openDecisionDraft(interview, v); }}
                                          className={`rounded-[7px] border px-2 py-1.5 text-[10.5px] font-bold transition ${myDraft?.decision === v ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-green-400'}`}
                                        >
                                          {lab}
                                        </button>
                                      ))}
                                    </div>

                                    {/* inline decision composer */}
                                    {myDraft && (
                                      <div className="rounded-lg border border-green-200 bg-green-50/50 p-2.5">
                                        {(myDraft.decision === 'next_round' || myDraft.decision === 'schedule_another') && (
                                          <div className="space-y-1.5 mb-2">
                                            <div className="grid grid-cols-2 gap-1.5">
                                              <div>
                                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Next date *</label>
                                                <input type="date" value={myDraft.nextDate} onChange={e => setDecisionDraft({ ...myDraft, nextDate: e.target.value })} className={INPUT_CLS} />
                                              </div>
                                              <div>
                                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Time</label>
                                                <input type="time" value={myDraft.nextTime} onChange={e => setDecisionDraft({ ...myDraft, nextTime: e.target.value })} className={INPUT_CLS} />
                                              </div>
                                              <div>
                                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Duration</label>
                                                <select value={myDraft.nextDuration} onChange={e => setDecisionDraft({ ...myDraft, nextDuration: Number(e.target.value) })} className={INPUT_CLS}>
                                                  {[30, 45, 60, 90].map(d => <option key={d} value={d}>{d} min</option>)}
                                                </select>
                                              </div>
                                              <div>
                                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Type</label>
                                                <select value={myDraft.nextType} onChange={e => setDecisionDraft({ ...myDraft, nextType: e.target.value })} className={INPUT_CLS}>
                                                  {Object.entries(TYPE_LABELS).map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
                                                </select>
                                              </div>
                                            </div>
                                            <div>
                                              <label className="block text-[10px] font-bold text-slate-500 mb-1">Panel for the next round</label>
                                              <div className="max-h-28 overflow-auto rounded-lg border border-slate-200 bg-white p-1.5 space-y-1">
                                                {(panelCandidates.length > 0 ? panelCandidates : pm.map(p => ({ id: p.userId, name: p.name, email: p.email, designation: p.designation }))).map(c => (
                                                  <label key={c.id} className="flex items-center gap-2 text-[10.5px] text-slate-600 cursor-pointer">
                                                    <input
                                                      type="checkbox"
                                                      className="accent-green-600"
                                                      checked={myDraft.nextPanelMemberIds.includes(c.id)}
                                                      onChange={e => setDecisionDraft({
                                                        ...myDraft,
                                                        nextPanelMemberIds: e.target.checked
                                                          ? [...myDraft.nextPanelMemberIds, c.id]
                                                          : myDraft.nextPanelMemberIds.filter(id => id !== c.id),
                                                      })}
                                                    />
                                                    <span className="truncate">{c.name} <span className="text-slate-400">· {c.designation}</span></span>
                                                  </label>
                                                ))}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                        {myDraft.decision === 'hold' && (
                                          <label className="flex items-center gap-2 text-[10.5px] font-semibold text-slate-600 mb-2 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              className="accent-green-600"
                                              checked={myDraft.sendHoldEmail}
                                              onChange={e => setDecisionDraft({ ...myDraft, sendHoldEmail: e.target.checked })}
                                            />
                                            Email the candidate that their decision is pending
                                          </label>
                                        )}
                                        <textarea
                                          rows={2}
                                          value={myDraft.reason}
                                          onChange={e => setDecisionDraft({ ...myDraft, reason: e.target.value })}
                                          placeholder="Decision reason (kept on the candidate's activity timeline)…"
                                          className="w-full rounded-[7px] border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] text-slate-800 outline-none resize-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15"
                                        />
                                        <div className="flex gap-2 justify-end mt-2">
                                          <button onClick={() => setDecisionDraft(null)} className={BTN_GHOST}>Cancel</button>
                                          <button onClick={handleHrDecision} disabled={actionLoading === interview.id + '-decision'} className={BTN_PRI}>
                                            <FiCheckCircle className="w-3 h-3" /> Record Decision
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {!myDraft && (
                                      <p className="text-[10px] text-slate-400 leading-relaxed">
                                        Recording a decision also advances the candidate&apos;s stage on the Recruitment board and emails them the outcome.
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                                    The final decision unlocks once the interview is completed.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                        })}
                        </div>
                      </td>
                    </tr>
                    )}

                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-3.5 py-1.5 border-t border-slate-200 bg-white text-[10.5px] text-slate-400 shrink-0">
          <span>Showing <b className="text-slate-600">{sortedGroups.length}</b> of <b className="text-slate-600">{allGroups.length}</b> candidates · <b className="text-slate-600">{filteredInterviews.length}</b> interviews{hasActiveFilters ? ' · filtered' : ''}</span>
          <span>One row per candidate — click to open every round: panel, feedback, and decisions</span>
        </div>
      </div>

    </div>
  );
}
