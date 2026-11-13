'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiCalendar, FiClock, FiVideo, FiMapPin, FiUser, FiStar, FiCheck, FiX,
  FiAlertCircle, FiBriefcase, FiXCircle,
  FiFilter, FiEye, FiCheckCircle, FiSearch, FiUsers, FiChevronDown,
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
const HR_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin', 'recruiter', 'recruiter_admin'];

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

  // ── Schedule Interview Modal state ──
  // Lets HR schedule a new interview directly from the Interview Management
  // page (without navigating to Find Candidates first).
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [applicants, setApplicants] = useState<Array<{ id: string; candidateName: string; candidateEmail: string; jobPosting?: { id: string; title: string; department?: { id: string; name: string } | null } | null; jobPostingId: string; status: string }>>([]);
  const [applicantSearch, setApplicantSearch] = useState('');
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [selectedAppDept, setSelectedAppDept] = useState<string>('');
  const [modalDepartments, setModalDepartments] = useState<Array<{ id: string; name: string; companyName?: string }>>([]);
  const [interviewForm, setInterviewForm] = useState({ type: 'technical', date: '', time: '10:00', duration: 60, location: '', meetingUrl: '' });
  const [panelMembers, setPanelMembers] = useState<Array<{ id: string; userId: string; name: string; email: string; designation: string; department: string; role: string; availability: string; reason: string; conflictTime: string }>>([]);
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showApplicantDropdown, setShowApplicantDropdown] = useState(false);

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

  // ── Schedule Interview Modal: fetch all job applicants for the dropdown ──
  const fetchApplicants = useCallback(async () => {
    try {
      const res = await fetch('/api/recruitment?limit=200', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const jobs = data.jobPostings || [];
        const allApps: Array<{ id: string; candidateName: string; candidateEmail: string; jobPosting?: { id: string; title: string; department?: { id: string; name: string } | null } | null; jobPostingId: string; status: string }> = [];
        for (const job of jobs) {
          const apps = job.applications || [];
          for (const app of apps) {
            allApps.push({
              ...app,
              jobPosting: { id: job.id, title: job.title, department: job.department },
              jobPostingId: job.id,
            });
          }
        }
        setApplicants(allApps);
      }
    } catch {
      // non-fatal — dropdown will just be empty
    }
  }, []);

  // ── Schedule Interview Modal: fetch departments for the panel-member picker ──
  const fetchModalDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments?limit=200&noDedupe=1', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        // API returns { data: [...], pagination: {...} } — extract the data array.
        // Also handle fallback shapes (departments: [...] or bare array) for safety.
        const rawDepts = data.data || data.departments || (Array.isArray(data) ? data : []);
        const depts = rawDepts.map((d: any) => ({
          id: d.id,
          name: d.name,
          companyName: d.company?.name || d.companyName,
        }));
        setModalDepartments(depts);
      }
    } catch {
      // non-fatal
    }
  }, []);

  // ── Schedule Interview Modal: fetch panel members with availability ──
  const fetchPanelAvailability = useCallback(async () => {
    if (!selectedAppDept) { setPanelMembers([]); return; }
    setLoadingPanel(true);
    try {
      const params = new URLSearchParams({
        departmentId: selectedAppDept,
        duration: String(interviewForm.duration || 60),
        interviewType: interviewForm.type,
      });
      if (interviewForm.date) {
        params.set('date', interviewForm.date);
        if (interviewForm.time) params.set('time', interviewForm.time);
      }
      const res = await fetch(`/api/interviews/panel-availability?${params}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPanelMembers(data.employees || []);
      }
    } catch { /* non-fatal */ }
    finally { setLoadingPanel(false); }
  }, [selectedAppDept, interviewForm.date, interviewForm.time, interviewForm.duration, interviewForm.type]);

  // Refresh panel members when department or date/time/duration/type changes
  useEffect(() => {
    if (selectedAppDept) {
      queueMicrotask(() => fetchPanelAvailability());
    } else {
      setPanelMembers([]);
    }
  }, [selectedAppDept, interviewForm.date, interviewForm.time, interviewForm.duration, interviewForm.type, fetchPanelAvailability]);

  // ── Open the Schedule Interview Modal ──
  const handleOpenScheduleModal = () => {
    setShowScheduleModal(true);
    setInterviewForm({ type: 'technical', date: '', time: '10:00', duration: 60, location: '', meetingUrl: '' });
    setSelectedAppId('');
    setSelectedAppDept('');
    setSelectedPanelIds([]);
    setPanelMembers([]);
    setApplicantSearch('');
    // Fetch applicants + departments if not already loaded
    if (applicants.length === 0) queueMicrotask(() => fetchApplicants());
    if (modalDepartments.length === 0) queueMicrotask(() => fetchModalDepartments());
  };

  // ── When a candidate is selected from the dropdown, auto-set their department ──
  const handleSelectApplicant = (appId: string) => {
    setSelectedAppId(appId);
    setShowApplicantDropdown(false);
    setApplicantSearch('');
    setSelectedPanelIds([]);
    // Auto-set the department from the candidate's job posting
    const app = applicants.find(a => a.id === appId);
    if (app?.jobPosting?.department?.id) {
      setSelectedAppDept(app.jobPosting.department.id);
    }
  };

  // ── Submit: schedule the interview via POST /api/interviews ──
  const handleScheduleInterview = async () => {
    if (!selectedAppId) { toast.error('Please select a candidate'); return; }
    if (!interviewForm.date) { toast.error('Date is required'); return; }
    // Validate date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(interviewForm.date);
    if (selectedDate < today) { toast.error('Interview date cannot be in the past'); return; }
    if (!selectedAppDept) { toast.error('Please select a department'); return; }
    if (selectedPanelIds.length === 0) { toast.error('Select at least one panel member'); return; }
    // Block Busy/On Leave members
    const unavailableMembers = selectedPanelIds.filter(uid => {
      const m = panelMembers.find(p => p.userId === uid);
      return m && (m.availability === 'Busy' || m.availability === 'On Leave');
    });
    if (unavailableMembers.length > 0) {
      const names = unavailableMembers.map(uid => panelMembers.find(p => p.userId === uid)?.name).join(', ');
      toast.error(`Cannot select unavailable members: ${names}. Please remove them and try again.`);
      return;
    }
    setScheduling(true);
    try {
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          jobApplicationId: selectedAppId,
          type: interviewForm.type,
          date: interviewForm.date,
          time: interviewForm.time,
          duration: Number(interviewForm.duration) || 60,
          location: interviewForm.location || undefined,
          meetingUrl: interviewForm.meetingUrl || undefined,
          panelMemberIds: selectedPanelIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to schedule interview');
      toast.success(`Interview scheduled — ${selectedPanelIds.length} panel member(s) notified. Round ${data.round || '?'}.`);
      setShowScheduleModal(false);
      // Reset form
      setInterviewForm({ type: 'technical', date: '', time: '10:00', duration: 60, location: '', meetingUrl: '' });
      setSelectedAppId('');
      setSelectedAppDept('');
      setSelectedPanelIds([]);
      setPanelMembers([]);
      // Refresh the interviews list
      fetchInterviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule interview');
    } finally {
      setScheduling(false);
    }
  };

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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary">Interview Management</h1>
          <p className="text-thb-text-secondary mt-1">
            All interviews across the tenant — view panel status, mark completed, see feedback, make final decisions.
          </p>
        </div>
        {/* Schedule New Interview — opens the schedule modal directly on this page.
            No more navigating away to Find Candidates. */}
        <button
          onClick={handleOpenScheduleModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm shrink-0"
        >
          <FiCalendar className="w-4 h-4" />
          Schedule New Interview
        </button>
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

      {/* ═══ Schedule Interview Modal ═══ */}
      {/* Opens when HR clicks "Schedule New Interview" — lets them pick a
          candidate from a dropdown, fill in interview details, and select
          panel members. Submits to POST /api/interviews. */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-thb-border sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-thb-text-primary flex items-center gap-2">
                <FiCalendar className="w-5 h-5 text-teal-600" />
                Schedule New Interview
              </h2>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Step 1: Select Candidate */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary mb-1.5 uppercase tracking-wide">
                  <FiUser className="w-3 h-3 inline mr-1" />
                  Select Candidate *
                </label>
                {/* Selected candidate display or search dropdown */}
                {selectedAppId ? (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-teal-300 bg-teal-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-sm font-bold">
                        {(applicants.find(a => a.id === selectedAppId)?.candidateName || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-thb-text-primary">
                          {applicants.find(a => a.id === selectedAppId)?.candidateName || 'Unknown'}
                        </p>
                        <p className="text-xs text-thb-text-secondary">
                          {applicants.find(a => a.id === selectedAppId)?.candidateEmail}
                        </p>
                        <p className="text-xs text-thb-text-muted">
                          Applied for: {applicants.find(a => a.id === selectedAppId)?.jobPosting?.title || '—'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedAppId(''); setSelectedAppDept(''); setSelectedPanelIds([]); setPanelMembers([]); }}
                      className="p-1.5 rounded-lg text-thb-text-muted hover:text-red-500 hover:bg-red-50"
                      title="Change candidate"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
                      <input
                        type="text"
                        value={applicantSearch}
                        onChange={(e) => { setApplicantSearch(e.target.value); setShowApplicantDropdown(true); }}
                        onFocus={() => setShowApplicantDropdown(true)}
                        placeholder="Search by candidate name or email..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                      />
                      <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
                    </div>
                    {showApplicantDropdown && (
                      <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-thb-border rounded-lg shadow-lg">
                        {applicants.length === 0 ? (
                          <div className="p-4 text-center text-sm text-thb-text-muted">Loading candidates...</div>
                        ) : (
                          (() => {
                            const filtered = applicants.filter(a => {
                              if (!applicantSearch) return true;
                              const q = applicantSearch.toLowerCase();
                              return (a.candidateName || '').toLowerCase().includes(q) ||
                                     (a.candidateEmail || '').toLowerCase().includes(q) ||
                                     (a.jobPosting?.title || '').toLowerCase().includes(q);
                            });
                            if (filtered.length === 0) {
                              return <div className="p-4 text-center text-sm text-thb-text-muted">No candidates match your search</div>;
                            }
                            return filtered.slice(0, 50).map(app => (
                              <button
                                key={app.id}
                                onClick={() => handleSelectApplicant(app.id)}
                                className="w-full text-left p-3 hover:bg-teal-50 border-b border-thb-border/50 last:border-0 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                    {(app.candidateName || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-thb-text-primary truncate">{app.candidateName || 'Unknown'}</p>
                                    <p className="text-xs text-thb-text-muted truncate">{app.candidateEmail}</p>
                                    <p className="text-xs text-thb-text-secondary truncate">
                                      {app.jobPosting?.title || '—'} · <span className="capitalize">{app.status}</span>
                                    </p>
                                  </div>
                                </div>
                              </button>
                            ));
                          })()
                        )}
                      </div>
                    )}
                  </div>
                )}
                {applicants.length > 0 && (
                  <p className="text-[10px] text-thb-text-muted mt-1">{applicants.length} candidates available</p>
                )}
              </div>

              {/* Step 2: Interview Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary mb-1">Interview Type *</label>
                  <select
                    value={interviewForm.type}
                    onChange={(e) => setInterviewForm({ ...interviewForm, type: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm bg-white"
                  >
                    <option value="technical">Technical Interview</option>
                    <option value="hr">HR Interview</option>
                    <option value="ai">AI Interview</option>
                    <option value="offline_panel">Panel Interview (Offline)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary mb-1">Duration (mins)</label>
                  <input
                    type="number"
                    value={interviewForm.duration}
                    onChange={(e) => setInterviewForm({ ...interviewForm, duration: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary mb-1">Date *</label>
                  <input
                    type="date"
                    value={interviewForm.date}
                    onChange={(e) => setInterviewForm(prev => ({ ...prev, date: e.target.value }))}
                    onInput={(e) => setInterviewForm(prev => ({ ...prev, date: (e.target as HTMLInputElement).value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary mb-1">Time</label>
                  <input
                    type="time"
                    value={interviewForm.time}
                    onChange={(e) => setInterviewForm({ ...interviewForm, time: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary mb-1">
                    <FiMapPin className="w-3 h-3 inline mr-1" />Location
                  </label>
                  <input
                    value={interviewForm.location}
                    onChange={(e) => setInterviewForm({ ...interviewForm, location: e.target.value })}
                    placeholder="e.g. Conference Room A"
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-thb-text-secondary mb-1">
                    <FiVideo className="w-3 h-3 inline mr-1" />Meeting Link (optional)
                  </label>
                  <input
                    value={interviewForm.meetingUrl}
                    onChange={(e) => setInterviewForm({ ...interviewForm, meetingUrl: e.target.value })}
                    placeholder="https://meet.google.com/..."
                    className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm"
                  />
                </div>
              </div>

              {/* Step 3: Department (for panel members) */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary mb-1">
                  Department (panel members will be drawn from this department) *
                </label>
                <select
                  value={selectedAppDept}
                  onChange={(e) => { setSelectedAppDept(e.target.value); setSelectedPanelIds([]); }}
                  className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm bg-white"
                >
                  <option value="">Select a department…</option>
                  {modalDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}{d.companyName ? ` — ${d.companyName}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-thb-text-muted mt-1">
                  💡 Auto-filled from the candidate's job posting. Change if you want panel members from a different department.
                </p>
              </div>

              {/* Step 4: Panel Members */}
              <div>
                <label className="block text-xs font-semibold text-thb-text-secondary mb-1">
                  <FiUsers className="w-3 h-3 inline mr-1" />
                  Select Panel Members *
                </label>
                <p className="text-xs text-thb-text-muted mb-2">
                  Employees from the selected department are listed below.
                  {!interviewForm.date && ' Pick a date above to see availability badges.'}
                </p>
                {loadingPanel ? (
                  <div className="py-4 text-center text-sm text-thb-text-muted">Loading panel members…</div>
                ) : !selectedAppDept ? (
                  <div className="py-4 text-center text-sm text-thb-text-muted">Select a department to load available panel members</div>
                ) : panelMembers.length === 0 ? (
                  <div className="py-4 text-center text-sm text-thb-text-muted">No employees found in this department</div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-thb-border rounded-lg p-2">
                    {panelMembers.map((m) => {
                      const isSelected = selectedPanelIds.includes(m.userId);
                      const isBlocked = m.availability === 'Busy' || m.availability === 'On Leave';
                      const availBadge: Record<string, string> = {
                        Available: 'bg-emerald-50 text-emerald-700',
                        Busy: 'bg-red-50 text-red-700',
                        'On Leave': 'bg-amber-50 text-amber-700',
                        Tentative: 'bg-blue-50 text-blue-700',
                        'No Date Set': 'bg-slate-50 text-slate-500',
                      };
                      return (
                        <label
                          key={m.id}
                          className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${isBlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'bg-teal-50 ring-1 ring-teal-200' : 'hover:bg-slate-50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isBlocked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedPanelIds([...selectedPanelIds, m.userId]);
                              else setSelectedPanelIds(selectedPanelIds.filter(uid => uid !== m.userId));
                            }}
                            className="w-4 h-4 rounded text-teal-600"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-thb-text-primary truncate">{m.name}</p>
                            <p className="text-xs text-thb-text-muted truncate">{m.designation} · {m.email}</p>
                            {m.availability === 'Available' && (
                              <p className="text-[10px] text-slate-400">Workload: {m.reason || 'No conflicts'}</p>
                            )}
                            {m.availability === 'No Date Set' && (
                              <p className="text-[10px] text-slate-400">{m.reason}</p>
                            )}
                          </div>
                          <span className={`text-xs whitespace-nowrap px-2 py-0.5 rounded-full font-medium ${availBadge[m.availability] || 'bg-slate-50 text-slate-600'}`} title={m.reason}>
                            {m.availability}{m.conflictTime ? ` (${m.conflictTime})` : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {selectedPanelIds.length > 0 && (
                  <p className="text-xs text-teal-600 mt-1 font-medium">{selectedPanelIds.length} member(s) selected</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-thb-border sticky bottom-0 bg-white">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleInterview}
                disabled={scheduling}
                className="px-6 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 shadow-sm transition-colors flex items-center gap-2"
              >
                {scheduling ? (
                  <>
                    <FiClock className="w-4 h-4 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <FiCalendar className="w-4 h-4" />
                    Schedule Interview
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
