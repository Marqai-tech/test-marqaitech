'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiCalendar, FiClock, FiVideo, FiMapPin, FiUser, FiStar, FiCheck, FiX,
  FiAlertCircle, FiBriefcase, FiXCircle,
  FiFilter, FiEye, FiCheckCircle,
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
}

/* ── Constants ── */
const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'];

const typeLabels: Record<string, string> = {
  ai: 'AI Interview', technical: 'Technical Interview', hr: 'HR Interview', offline_panel: 'Panel Interview',
};

const statusBadges: Record<string, string> = {
  scheduled: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
  rescheduled: 'bg-blue-50 text-blue-700',
};

const confirmBadges: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-red-50 text-red-700',
  requested_reschedule: 'bg-blue-50 text-blue-700',
};

const confirmLabels: Record<string, string> = {
  pending: 'Pending', accepted: 'Accepted', declined: 'Declined', requested_reschedule: 'Reschedule Requested',
};

const recommendationLabels: Record<string, string> = {
  strong_hire: 'Strong Hire', hire: 'Hire', hold: 'Hold', next_round: 'Next Round', reject: 'Reject',
};

const recommendationColors: Record<string, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-800',
  hire: 'bg-emerald-50 text-emerald-700',
  hold: 'bg-amber-50 text-amber-700',
  next_round: 'bg-blue-50 text-blue-700',
  reject: 'bg-red-50 text-red-700',
};

const decisionLabels: Record<string, string> = {
  next_round: 'Next Round', shortlist: 'Shortlist', hold: 'Hold',
  reject: 'Reject', offer: 'Offer', schedule_another: 'Schedule Another',
};

/* ── Component ── */
export default function InterviewsPage() {
  const { user } = useAuthStore();
  const isAdmin = HR_ROLES.includes(user?.role || '');

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [feedbackList, setFeedbackList] = useState<FeedbackDetail[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [decisionModal, setDecisionModal] = useState<{
    interviewId: string;
    decision: string;
    reason: string;
    // For next_round + schedule_another: the new schedule details
    nextDate: string;
    nextTime: string;
    nextDuration: number;
    nextType: string;
    nextLocation: string;
    nextMeetingUrl: string;
    nextPanelMemberIds: string[];
    // For hold: whether to send the candidate a "decision pending" email
    sendHoldEmail: boolean;
  } | null>(null);
  const [attendanceModal, setAttendanceModal] = useState<{ interviewId: string; candidateAttendance: string; panelAttendance: Record<string, string> } | null>(null);

  // For next_round / schedule_another: candidate panel members to choose from
  const [panelCandidates, setPanelCandidates] = useState<Array<{ id: string; name: string; email: string; designation: string }>>([]);

  // Helper to construct a fresh decision-modal state — used by every button
  // Fetch candidate panel members (all users in the tenant — HR can pick any).
  // We use a lightweight endpoint that's already authenticated.
  // NOTE: /api/employees returns e.designation as an OBJECT {id, title} (Prisma
  // `select: { id: true, title: true }`). The previous implementation treated
  // it as a string and React crashed with error #31 ("object with keys {id,
  // title}") when rendering {cand.designation}. We now read .title safely.
  // We also use Employee.userId (the User FK) — NOT Employee.id — because
  // InterviewPanelMember.userId references the User.id, and panel member
  // notifications go to the User account. We filter out employees with no
  // linked User account (e.userId null) since they can't be assigned.
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
            const firstName = (e.firstName as string) || '';
            const lastName = (e.lastName as string) || '';
            const name = `${firstName} ${lastName}`.trim() || (e.name as string) || (e.email as string) || '';
            const email = (e.email as string) || '';
            // designation is an object {id, title} from the employees API
            const desigObj = e.designation as { id?: string; title?: string } | string | null | undefined;
            let designation = '—';
            if (typeof desigObj === 'string') {
              designation = desigObj;
            } else if (desigObj && typeof desigObj === 'object' && desigObj.title) {
              designation = desigObj.title;
            }
            return { id: userId, name, email, designation };
          })
          .filter((u) => u.id && u.email);
        if (list.length > 0) setPanelCandidates(list);
      }
    } catch { /* non-fatal */ }
  }, [panelCandidates.length]);

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
    if (isAdmin) {
      // Defer to a microtask so the setState calls inside fetchInterviews
      // don't run synchronously inside the effect body (React 19 lint rule).
      queueMicrotask(() => fetchInterviews());
    }
  }, [isAdmin, fetchInterviews]);

  // When the decision modal opens, pre-fetch the candidate panel member list
  // (only fetches once per page mount via the cache guard inside).
  useEffect(() => {
    if (decisionModal) {
      // Defer to a microtask so the setState call inside fetchPanelCandidates
      // doesn't run synchronously inside the effect body (React 19 lint rule).
      queueMicrotask(() => fetchPanelCandidates());
    }
  }, [decisionModal, fetchPanelCandidates]);

  const fetchFeedback = async (interviewId: string) => {
    setLoadingFeedback(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/feedback`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFeedbackList(data.feedback || []);
      } else {
        toast.error('Failed to load feedback');
      }
    } catch {
      toast.error('Failed to load feedback');
    } finally {
      setLoadingFeedback(false);
    }
  };

  const handleOpenDetails = (interview: Interview) => {
    setSelectedInterview(interview);
    fetchFeedback(interview.id);
  };

  const handleMarkCompleted = async (interviewId: string, withAttendance = false) => {
    if (!withAttendance) {
      // Quick mark completed without attendance
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
        if (selectedInterview?.id === interviewId) {
          setSelectedInterview(null);
          setFeedbackList([]);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed');
      } finally {
        setActionLoading(null);
      }
    } else {
      // Open attendance modal first, then mark completed
      const interview = interviews.find((i) => i.id === interviewId);
      const initialPanelAttendance: Record<string, string> = {};
      (interview?.panelMembers || []).forEach((pm) => {
        if (pm.confirmationStatus === 'accepted') initialPanelAttendance[pm.userId] = 'present';
      });
      setAttendanceModal({
        interviewId,
        candidateAttendance: 'attended',
        panelAttendance: initialPanelAttendance,
      });
    }
  };

  const handleSubmitAttendance = async () => {
    if (!attendanceModal) return;
    setActionLoading(attendanceModal.interviewId + '-complete');
    try {
      const panelArray = Object.entries(attendanceModal.panelAttendance).map(([userId, attendance]) => ({
        userId,
        attendance,
      }));
      const res = await fetch('/api/interviews', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: attendanceModal.interviewId,
          action: 'mark_completed',
          candidateAttendance: attendanceModal.candidateAttendance,
          panelAttendance: panelArray,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Interview marked as completed with attendance recorded.');
      setAttendanceModal(null);
      fetchInterviews();
      if (selectedInterview?.id === attendanceModal.interviewId) {
        setSelectedInterview(null);
        setFeedbackList([]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleHrDecision = async () => {
    if (!decisionModal) return;
    if (!decisionModal.decision) { toast.error('Please select a decision'); return; }

    // Validate next_round / schedule_another require a date.
    if ((decisionModal.decision === 'next_round' || decisionModal.decision === 'schedule_another') && !decisionModal.nextDate) {
      toast.error('Please pick a date for the next interview round');
      return;
    }

    setActionLoading(decisionModal.interviewId + '-decision');
    try {
      const payload: Record<string, unknown> = {
        id: decisionModal.interviewId,
        action: 'hr_decision',
        decision: decisionModal.decision,
        reason: decisionModal.reason || undefined,
      };
      if (decisionModal.decision === 'next_round' || decisionModal.decision === 'schedule_another') {
        payload.nextRound = {
          date: decisionModal.nextDate,
          time: decisionModal.nextTime || undefined,
          duration: decisionModal.nextDuration || 60,
          type: decisionModal.nextType,
          location: decisionModal.nextLocation || undefined,
          meetingUrl: decisionModal.nextMeetingUrl || undefined,
          panelMemberIds: decisionModal.nextPanelMemberIds,
        };
      }
      if (decisionModal.decision === 'hold') {
        payload.sendHoldEmail = decisionModal.sendHoldEmail;
      }

      const res = await fetch('/api/interviews', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      // Surface the full result so HR knows if the email was actually sent
      // (per spec: don't show success if the email failed).
      const label = decisionLabels[decisionModal.decision as keyof typeof decisionLabels] || decisionModal.decision;
      let msg = `HR decision recorded: ${label}. App status: ${data.newAppStatus || '-'}.`;
      if (data.newInterviewId) msg += ` New interview ${data.newInterviewId}.`;
      if (data.newOfferId) msg += ` Draft offer ${data.newOfferId} created.`;
      if (data.emailSent === false) {
        msg += ` ⚠️ Candidate email was NOT sent${data.emailError ? ` — ${data.emailError}` : ''}.`;
        toast.error(msg);
      } else {
        msg += ` ✅ Candidate email sent.`;
        toast.success(msg);
      }
      console.log('[Interviews /interviews] hr_decision result:', data);

      setDecisionModal(null);
      fetchInterviews();
      if (selectedInterview?.id === decisionModal.interviewId) {
        setSelectedInterview(null);
        setFeedbackList([]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(null);
    }
  };

  /* ── Access gate ── */
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <FiAlertCircle className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-thb-text-primary mb-2">Access restricted</h2>
        <p className="text-sm text-thb-text-secondary">
          The Interview Management page is only available to HR / Admin roles.
          If you are a panel member, please use{' '}
          <a href="/my-interviews" className="text-teal-600 hover:underline">My Interviews</a>.
        </p>
      </div>
    );
  }

  /* ── Stats + filtering ── */
  const filtered = interviews.filter((i) => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !(i.candidateName || '').toLowerCase().includes(s) &&
        !(i.jobTitle || '').toLowerCase().includes(s) &&
        !(i.candidateEmail || '').toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });

  const stats = {
    total: interviews.length,
    scheduled: interviews.filter((i) => i.status === 'scheduled').length,
    completed: interviews.filter((i) => i.status === 'completed').length,
    cancelled: interviews.filter((i) => i.status === 'cancelled').length,
    feedbackSubmitted: interviews.reduce(
      (n, i) => n + (i.panelMembers || []).filter((pm) => pm.hasFeedback).length,
      0,
    ),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-thb-text-primary">Interview Management</h1>
        <p className="text-thb-text-secondary mt-1">
          All interviews across the tenant — view panel status, mark completed, see feedback, make final decisions.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: FiCalendar, color: 'text-slate-700', bg: 'bg-slate-50' },
          { label: 'Scheduled', value: stats.scheduled, icon: FiClock, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Completed', value: stats.completed, icon: FiCheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Cancelled', value: stats.cancelled, icon: FiXCircle, color: 'text-red-700', bg: 'bg-red-50' },
          { label: 'Feedbacks', value: stats.feedbackSubmitted, icon: FiStar, color: 'text-teal-700', bg: 'bg-teal-50' },
        ].map((s) => (
          <div key={s.label} className={`thb-card p-4 ${s.bg}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-thb-text-secondary uppercase tracking-wide">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </div>
              <s.icon className={`w-6 h-6 ${s.color}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div className="thb-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 text-thb-text-secondary text-sm">
          <FiFilter className="w-4 h-4" /> Filters:
        </div>
        <div className="flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by candidate name, email, or job title…"
            className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border border-thb-border text-sm bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="rescheduled">Rescheduled</option>
        </select>
      </div>

      {/* Interviews list */}
      {loading ? (
        <div className="thb-card p-12 text-center text-sm text-thb-text-muted">Loading interviews…</div>
      ) : filtered.length === 0 ? (
        <div className="thb-card p-12 text-center">
          <FiCalendar className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
          <p className="text-sm text-thb-text-secondary font-medium">No interviews found</p>
          <p className="text-xs text-thb-text-muted mt-1">
            {interviews.length === 0
              ? 'No interviews have been scheduled yet. Schedule one from the Recruitment page.'
              : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((interview) => {
            const panel = interview.panelMembers || [];
            const acceptedCount = panel.filter((p) => p.confirmationStatus === 'accepted').length;
            const declinedCount = panel.filter((p) => p.confirmationStatus === 'declined').length;
            const pendingCount = panel.filter((p) => p.confirmationStatus === 'pending').length;
            const feedbackCount = panel.filter((p) => p.hasFeedback).length;
            return (
              <div key={interview.id} className={`thb-card p-5 border-l-4 ${
                interview.status === 'scheduled' ? 'border-l-amber-400' :
                interview.status === 'completed' ? 'border-l-emerald-500' :
                interview.status === 'cancelled' ? 'border-l-red-400' :
                'border-l-blue-400'
              }`}>
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`thb-badge ${statusBadges[interview.status] || 'thb-badge-info'}`}>
                        {interview.status}
                      </span>
                      <span className="thb-badge thb-badge-primary">
                        {typeLabels[interview.type] || interview.type}
                      </span>
                      {interview.round && interview.round > 1 && (
                        <span className="thb-badge bg-purple-50 text-purple-700">
                          Round {interview.round}
                        </span>
                      )}
                      {interview.hrDecision && (
                        <span className="thb-badge bg-indigo-50 text-indigo-700">
                          Decision: {decisionLabels[interview.hrDecision] || interview.hrDecision}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2 text-thb-text-secondary">
                        <FiUser className="w-4 h-4 flex-shrink-0" />
                        <span><strong>Candidate:</strong> {interview.candidateName || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-thb-text-secondary">
                        <FiBriefcase className="w-4 h-4 flex-shrink-0" />
                        <span><strong>Position:</strong> {interview.jobTitle || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-thb-text-secondary">
                        <FiCalendar className="w-4 h-4 flex-shrink-0" />
                        <span><strong>Date:</strong> {interview.date ? new Date(interview.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-thb-text-secondary">
                        <FiClock className="w-4 h-4 flex-shrink-0" />
                        <span><strong>Time:</strong> {interview.time || 'TBD'} ({interview.duration || 60} min)</span>
                      </div>
                      {interview.location && (
                        <div className="flex items-center gap-2 text-thb-text-secondary">
                          <FiMapPin className="w-4 h-4 flex-shrink-0" />
                          <span><strong>Location:</strong> {interview.location}</span>
                        </div>
                      )}
                      {interview.meetingUrl && (
                        <div className="flex items-center gap-2 text-thb-text-secondary">
                          <FiVideo className="w-4 h-4 flex-shrink-0" />
                          <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                            {interview.meetingUrl}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Panel summary */}
                <div className="mt-3 pt-3 border-t border-thb-border">
                  <div className="flex items-center gap-3 text-xs flex-wrap mb-3">
                    <span className="font-medium text-thb-text-secondary">Panel:</span>
                    <span className="text-emerald-700">{acceptedCount} accepted</span>
                    <span className="text-amber-700">{pendingCount} pending</span>
                    <span className="text-red-700">{declinedCount} declined</span>
                    <span className="text-teal-700">{feedbackCount} feedback submitted</span>
                    <span className="text-thb-text-muted">/ {panel.length} total</span>
                  </div>

                  {/* Panel member chips */}
                  {panel.length > 0 && (
                    <div className="space-y-1.5">
                      {panel.map((pm) => (
                        <div key={pm.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-thb-text-primary truncate">{pm.name}</p>
                            <p className="text-xs text-thb-text-muted truncate">{pm.designation} · {pm.email}</p>
                          </div>
                          <span className={`thb-badge ${confirmBadges[pm.confirmationStatus] || 'thb-badge-info'}`}>
                            {confirmLabels[pm.confirmationStatus] || pm.confirmationStatus}
                          </span>
                          {pm.hasFeedback && (
                            <span className={`thb-badge ${recommendationColors[pm.feedbackRecommendation || ''] || 'bg-slate-100 text-slate-700'}`}>
                              <FiStar className="w-3 h-3 inline mr-1" />
                              {pm.feedbackRating ? `${pm.feedbackRating}/5 · ` : ''}
                              {recommendationLabels[pm.feedbackRecommendation || ''] || 'Feedback'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions row */}
                <div className="mt-4 pt-3 border-t border-thb-border flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleOpenDetails(interview)}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 flex items-center gap-1.5"
                  >
                    <FiEye className="w-3.5 h-3.5" /> View Feedback
                  </button>
                  {interview.status === 'scheduled' && (
                    <>
                      <button
                        onClick={() => handleMarkCompleted(interview.id, false)}
                        disabled={actionLoading === interview.id + '-complete'}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <FiCheckCircle className="w-3.5 h-3.5" />
                        {actionLoading === interview.id + '-complete' ? 'Marking…' : 'Mark Completed'}
                      </button>
                      <button
                        onClick={() => handleMarkCompleted(interview.id, true)}
                        disabled={actionLoading === interview.id + '-complete'}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <FiCheck className="w-3.5 h-3.5" /> Mark Completed + Attendance
                      </button>
                    </>
                  )}
                  {interview.status === 'completed' && !interview.hrDecision && (
                    <span className="text-xs text-thb-text-muted px-2 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                      Change the candidate&apos;s hiring stage on the Recruitment page →
                    </span>
                  )}
                  {interview.hrDecision && (
                    <span className="text-xs text-thb-text-muted ml-auto">
                      HR decision: <strong>{decisionLabels[interview.hrDecision] || interview.hrDecision}</strong>
                      {interview.hrDecisionReason && ` — ${interview.hrDecisionReason}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── View Feedback modal ─── */}
      {selectedInterview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-thb-border sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-thb-text-primary">Interview Feedback</h2>
                <p className="text-sm text-thb-text-secondary mt-0.5">
                  {selectedInterview.candidateName} · {selectedInterview.jobTitle}
                </p>
              </div>
              <button
                onClick={() => { setSelectedInterview(null); setFeedbackList([]); }}
                className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {loadingFeedback ? (
                <div className="py-8 text-center text-sm text-thb-text-muted">Loading feedback…</div>
              ) : feedbackList.length === 0 ? (
                <div className="py-8 text-center">
                  <FiAlertCircle className="w-8 h-8 text-thb-text-muted mx-auto mb-2" />
                  <p className="text-sm text-thb-text-secondary">No feedback submitted yet.</p>
                  <p className="text-xs text-thb-text-muted mt-1">
                    {selectedInterview.status === 'completed'
                      ? 'The interview is marked completed but no panel member has submitted feedback yet.'
                      : 'Mark the interview as completed to remind panel members to submit their feedback.'}
                  </p>
                </div>
              ) : (
                feedbackList.map((fb) => (
                  <div key={fb.id} className="border border-thb-border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-thb-text-primary">{fb.memberName || fb.memberEmail || 'Panel Member'}</p>
                        <p className="text-xs text-thb-text-muted">
                          Submitted {new Date(fb.submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-amber-600">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <FiStar key={i} className={`w-4 h-4 ${i < (fb.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                          ))}
                          <span className="text-sm font-semibold ml-1">{fb.rating}/5</span>
                        </span>
                        <span className={`thb-badge ${recommendationColors[fb.recommendation] || 'bg-slate-100 text-slate-700'}`}>
                          {recommendationLabels[fb.recommendation] || fb.recommendation}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {fb.technicalSkills && <div><strong>Technical Skills:</strong> {fb.technicalSkills}</div>}
                      {fb.communication && <div><strong>Communication:</strong> {fb.communication}</div>}
                      {fb.experience && <div><strong>Experience:</strong> {fb.experience}</div>}
                      {fb.problemSolving && <div><strong>Problem Solving:</strong> {fb.problemSolving}</div>}
                      {fb.roleSuitability && <div><strong>Role Suitability:</strong> {fb.roleSuitability}</div>}
                      {fb.culturalFit && <div><strong>Cultural Fit:</strong> {fb.culturalFit}</div>}
                    </div>
                    {fb.strengths && (
                      <div className="bg-emerald-50 rounded-lg p-3 text-sm">
                        <p className="text-xs font-semibold text-emerald-800 mb-1">Strengths</p>
                        <p className="text-thb-text-secondary">{fb.strengths}</p>
                      </div>
                    )}
                    {fb.concerns && (
                      <div className="bg-red-50 rounded-lg p-3 text-sm">
                        <p className="text-xs font-semibold text-red-800 mb-1">Concerns</p>
                        <p className="text-thb-text-secondary">{fb.concerns}</p>
                      </div>
                    )}
                    {fb.comments && (
                      <div className="bg-slate-50 rounded-lg p-3 text-sm">
                        <p className="text-xs font-semibold text-thb-text-muted mb-1">Comments</p>
                        <p className="text-thb-text-secondary">{fb.comments}</p>
                      </div>
                    )}
                    {/* C-22: dynamic custom fields */}
                    {fb.customFields && fb.customFields.length > 0 && (
                      <div className="bg-indigo-50 rounded-lg p-3 text-sm">
                        <p className="text-xs font-semibold text-indigo-800 mb-2">Custom Evaluation Fields</p>
                        <div className="space-y-1.5">
                          {fb.customFields.map((cf, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="text-xs font-medium text-indigo-700 min-w-[120px]">{cf.name}:</span>
                              <span className="text-xs text-thb-text-secondary flex-1">{cf.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-thb-border">
              <button
                onClick={() => { setSelectedInterview(null); setFeedbackList([]); }}
                className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50"
              >
                Close
              </button>
              {selectedInterview.status === 'completed' && !selectedInterview.hrDecision && (
                <span className="text-xs text-thb-text-muted px-3 py-2.5">
                  Change hiring stage on Recruitment page →
                </span>
              )}
              {selectedInterview.status === 'scheduled' && (
                <button
                  onClick={() => handleMarkCompleted(selectedInterview.id, false)}
                  disabled={actionLoading === selectedInterview.id + '-complete'}
                  className="px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionLoading === selectedInterview.id + '-complete' ? 'Marking…' : 'Mark Completed'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── HR Decision modal ─── */}
      {decisionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-thb-border">
              <h2 className="text-lg font-bold text-thb-text-primary">HR Final Decision</h2>
              <button
                onClick={() => setDecisionModal(null)}
                className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Decision *</label>
                <select
                  value={decisionModal.decision}
                  onChange={(e) => setDecisionModal({ ...decisionModal, decision: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm bg-white"
                >
                  <option value="">Select decision…</option>
                  <option value="next_round">Next Round — schedule another interview round</option>
                  <option value="schedule_another">Schedule Another — reschedule to a new slot</option>
                  <option value="hold">Hold — keep in interview status pending more info</option>
                  <option value="reject">Reject — reject the candidate, send rejection email</option>
                  <option value="offer">Offer — move to offered status, create draft Offer</option>
                </select>
                <p className="text-xs text-thb-text-muted mt-1">
                  Note: to shortlist a candidate (overall hiring stage), use the <strong>Shortlist</strong> option
                  in the Candidate Status dropdown on the Recruitment page.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                  Reason (optional — shown in audit log; included in reject/offer email body if present)
                </label>
                <textarea
                  value={decisionModal.reason}
                  onChange={(e) => setDecisionModal({ ...decisionModal, reason: e.target.value })}
                  rows={2}
                  placeholder="e.g. Strong technical skills, good cultural fit."
                  className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm"
                />
              </div>

              {/* ─── Next Round / Schedule Another: schedule sub-form ─── */}
              {(decisionModal.decision === 'next_round' || decisionModal.decision === 'schedule_another') && (
                <div className="border border-thb-border rounded-lg p-3 space-y-3 bg-slate-50">
                  <p className="text-xs font-semibold text-thb-text-secondary">
                    {decisionModal.decision === 'next_round'
                      ? '📅 New round schedule (a new Interview row will be created)'
                      : '🔄 New schedule (the same interview will be rescheduled)'}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Date *</label>
                      <input
                        type="date"
                        value={decisionModal.nextDate}
                        onChange={(e) => setDecisionModal({ ...decisionModal, nextDate: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Time</label>
                      <input
                        type="time"
                        value={decisionModal.nextTime}
                        onChange={(e) => setDecisionModal({ ...decisionModal, nextTime: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Duration (min)</label>
                      <input
                        type="number"
                        value={decisionModal.nextDuration}
                        onChange={(e) => setDecisionModal({ ...decisionModal, nextDuration: Number(e.target.value) || 60 })}
                        className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Type</label>
                      <select
                        value={decisionModal.nextType}
                        onChange={(e) => setDecisionModal({ ...decisionModal, nextType: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm bg-white"
                      >
                        <option value="technical">Technical</option>
                        <option value="hr">HR</option>
                        <option value="ai">AI</option>
                        <option value="offline_panel">Panel (Offline)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Location</label>
                      <input
                        value={decisionModal.nextLocation}
                        onChange={(e) => setDecisionModal({ ...decisionModal, nextLocation: e.target.value })}
                        placeholder="e.g. Conference Room A"
                        className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Meeting Link</label>
                      <input
                        value={decisionModal.nextMeetingUrl}
                        onChange={(e) => setDecisionModal({ ...decisionModal, nextMeetingUrl: e.target.value })}
                        placeholder="https://meet.google.com/..."
                        className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                      Panel Members (optional — these users will get an interview-scheduled notification)
                    </label>
                    <div className="space-y-1 max-h-32 overflow-y-auto border border-thb-border rounded-lg p-2 bg-white">
                      {panelCandidates.length === 0 ? (
                        <p className="text-xs text-thb-text-muted py-2 text-center">Loading tenant users…</p>
                      ) : (
                        panelCandidates.map((cand) => {
                          const isSelected = decisionModal.nextPanelMemberIds.includes(cand.id);
                          return (
                            <label
                              key={cand.id}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${isSelected ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...decisionModal.nextPanelMemberIds, cand.id]
                                    : decisionModal.nextPanelMemberIds.filter((uid) => uid !== cand.id);
                                  setDecisionModal({ ...decisionModal, nextPanelMemberIds: next });
                                }}
                                className="w-4 h-4 rounded text-teal-600"
                              />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm text-thb-text-primary truncate">{cand.name}</span>
                                <span className="block text-xs text-thb-text-muted truncate">{cand.designation} · {cand.email}</span>
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Hold: send-email toggle ─── */}
              {decisionModal.decision === 'hold' && (
                <div className="border border-thb-border rounded-lg p-3 bg-amber-50">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={decisionModal.sendHoldEmail}
                      onChange={(e) => setDecisionModal({ ...decisionModal, sendHoldEmail: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <span>Send the candidate a &ldquo;decision pending / on hold&rdquo; email (default: off)</span>
                  </label>
                  <p className="text-xs text-thb-text-muted mt-1">
                    An HR follow-up reminder is always created regardless of this setting.
                  </p>
                </div>
              )}

              {(decisionModal.decision === 'reject' || decisionModal.decision === 'offer') && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <strong>Note:</strong> This decision will send an automated email to the candidate
                  ({decisionModal.decision === 'reject'
                    ? 'notifying them of rejection (the email body contains the reason only if you entered one)'
                    : 'notifying them of selection — a real draft Offer is also created and linked to this application; HR advances it through approval → sent; the secure offer link is sent later by the offer-sent flow'}).
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-thb-border sticky bottom-0 bg-white">
              <button
                onClick={() => setDecisionModal(null)}
                className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleHrDecision}
                disabled={!decisionModal.decision || actionLoading === decisionModal.interviewId + '-decision'}
                className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading === decisionModal.interviewId + '-decision' ? 'Recording…' : 'Record Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Attendance modal ─── */}
      {attendanceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-thb-border">
              <h2 className="text-lg font-bold text-thb-text-primary">Record Attendance & Mark Completed</h2>
              <button
                onClick={() => setAttendanceModal(null)}
                className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Candidate Attendance</label>
                <select
                  value={attendanceModal.candidateAttendance}
                  onChange={(e) => setAttendanceModal({ ...attendanceModal, candidateAttendance: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm bg-white"
                >
                  <option value="attended">Attended</option>
                  <option value="late">Late</option>
                  <option value="no_show">No Show</option>
                  <option value="reschedule_required">Reschedule Required</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-thb-text-secondary mb-1">Panel Member Attendance</label>
                <div className="space-y-2">
                  {Object.entries(attendanceModal.panelAttendance).length === 0 ? (
                    <p className="text-xs text-thb-text-muted py-3">No accepted panel members to record attendance for.</p>
                  ) : (
                    Object.entries(attendanceModal.panelAttendance).map(([userId, attendance]) => {
                      const interview = interviews.find((i) => i.id === attendanceModal.interviewId);
                      const pm = interview?.panelMembers?.find((p) => p.userId === userId);
                      return (
                        <div key={userId} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-thb-text-primary truncate">{pm?.name || userId}</p>
                            <p className="text-xs text-thb-text-muted truncate">{pm?.designation}</p>
                          </div>
                          <select
                            value={attendance}
                            onChange={(e) =>
                              setAttendanceModal({
                                ...attendanceModal,
                                panelAttendance: { ...attendanceModal.panelAttendance, [userId]: e.target.value },
                              })
                            }
                            className="px-2 py-1.5 rounded-lg border border-thb-border text-xs bg-white"
                          >
                            <option value="present">Present</option>
                            <option value="late">Late</option>
                            <option value="absent">Absent</option>
                            <option value="replacement_joined">Replacement Joined</option>
                          </select>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-thb-border">
              <button
                onClick={() => setAttendanceModal(null)}
                className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAttendance}
                disabled={actionLoading === attendanceModal.interviewId + '-complete'}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {actionLoading === attendanceModal.interviewId + '-complete' ? 'Saving…' : 'Save & Mark Completed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
