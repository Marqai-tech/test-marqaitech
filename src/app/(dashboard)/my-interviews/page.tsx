'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiCalendar, FiClock, FiVideo, FiMapPin, FiUser, FiCheck, FiStar,
  FiAlertCircle, FiBriefcase, FiX, FiThumbsUp, FiThumbsDown, FiRefreshCw,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
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
  feedback: string | null;
  score: number | null;
  candidateName: string | null;
  candidateEmail: string | null;
  jobTitle: string | null;
  panelMembers?: any[];
}

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
  pending: 'Pending Confirmation', accepted: 'Accepted', declined: 'Declined', requested_reschedule: 'Requested Reschedule',
};

export default function MyInterviewsPage() {
  const { user } = useAuthStore();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [feedbackForm, setFeedbackForm] = useState<{
    interviewId: string;
    technicalSkills: string; communication: string; experience: string; problemSolving: string;
    roleSuitability: string; culturalFit: string; strengths: string; concerns: string;
    rating: string; recommendation: string; comments: string;
  } | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/interviews?scope=mine', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.data || []);
      }
    } catch {
      toast.error('Failed to load interviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchInterviews()); }, [fetchInterviews]);

  const handleRespond = async (interviewId: string, action: 'accept' | 'decline' | 'request_reschedule') => {
    let reason = '';
    if (action !== 'accept') {
      const reasons = action === 'decline'
        ? ['Another interview', 'Meeting conflict', 'Approved leave', 'Client/project work', 'Outside working hours', 'Not the correct technical interviewer', 'Personal emergency', 'Other']
        : ['Need different date', 'Need different time', 'Conflict with another meeting', 'Other'];
      reason = window.prompt(`Reason for ${action === 'decline' ? 'declining' : 'requesting reschedule'} (required):\n${reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}`) || '';
      if (!reason.trim()) { toast.error('A reason is required'); return; }
    }
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
      fetchInterviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setResponding(null);
    }
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
        body: JSON.stringify({ ...feedbackForm, userId: user?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Feedback submitted');
      setFeedbackForm(null);
      fetchInterviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Find the current user's panel member record
  const getMyPanelStatus = (interview: Interview) => {
    const pm = interview.panelMembers?.find(p => p.userId === user?.id);
    return pm?.confirmationStatus || 'pending';
  };

  const upcoming = interviews.filter(i => i.status === 'scheduled');
  const completed = interviews.filter(i => i.status === 'completed' || i.status === 'cancelled');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-thb-text-primary">My Interviews</h1>
        <p className="text-thb-text-secondary mt-1">Interviews assigned to you as a panel member</p>
      </div>

      {/* Upcoming Interviews */}
      <div>
        <h2 className="text-lg font-semibold text-thb-text-primary mb-3 flex items-center gap-2">
          <FiCalendar className="w-5 h-5 text-amber-500" /> Upcoming ({upcoming.length})
        </h2>
        {loading ? (
          <div className="thb-card p-8 text-center text-sm text-thb-text-muted">Loading…</div>
        ) : upcoming.length === 0 ? (
          <div className="thb-card p-8 text-center">
            <FiAlertCircle className="w-8 h-8 text-thb-text-muted mx-auto mb-2" />
            <p className="text-sm text-thb-text-muted">No upcoming interviews assigned to you</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((interview) => {
              const myStatus = getMyPanelStatus(interview);
              return (
                <div key={interview.id} className="thb-card p-5 border-l-4 border-l-amber-400">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`thb-badge ${statusBadges[interview.status] || 'thb-badge-info'}`}>{interview.status}</span>
                        <span className="thb-badge thb-badge-primary">{typeLabels[interview.type] || interview.type}</span>
                        <span className={`thb-badge ${confirmBadges[myStatus] || 'thb-badge-info'}`}>{confirmLabels[myStatus] || myStatus}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2 text-thb-text-secondary"><FiUser className="w-4 h-4" /><span><strong>Candidate:</strong> {interview.candidateName || 'N/A'}</span></div>
                        <div className="flex items-center gap-2 text-thb-text-secondary"><FiBriefcase className="w-4 h-4" /><span><strong>Position:</strong> {interview.jobTitle || 'N/A'}</span></div>
                        <div className="flex items-center gap-2 text-thb-text-secondary"><FiCalendar className="w-4 h-4" /><span><strong>Date:</strong> {interview.date ? new Date(interview.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'}</span></div>
                        <div className="flex items-center gap-2 text-thb-text-secondary"><FiClock className="w-4 h-4" /><span><strong>Time:</strong> {interview.time || 'TBD'}</span></div>
                        {interview.location && <div className="flex items-center gap-2 text-thb-text-secondary"><FiMapPin className="w-4 h-4" /><span><strong>Location:</strong> {interview.location}</span></div>}
                        {interview.meetingUrl && <div className="flex items-center gap-2 text-thb-text-secondary"><FiVideo className="w-4 h-4" /><a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{interview.meetingUrl}</a></div>}
                      </div>

                      {/* Panel confirmation actions */}
                      {myStatus === 'pending' && (
                        <div className="mt-4 flex items-center gap-2">
                          <button onClick={() => handleRespond(interview.id, 'accept')} disabled={responding === interview.id} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                            <FiThumbsUp className="w-4 h-4" /> Accept
                          </button>
                          <button onClick={() => handleRespond(interview.id, 'decline')} disabled={responding === interview.id} className="px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 disabled:opacity-50 flex items-center gap-1.5">
                            <FiThumbsDown className="w-4 h-4" /> Decline
                          </button>
                          <button onClick={() => handleRespond(interview.id, 'request_reschedule')} disabled={responding === interview.id} className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 text-sm font-medium hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1.5">
                            <FiRefreshCw className="w-4 h-4" /> Request Different Time
                          </button>
                        </div>
                      )}

                      {/* Submit Feedback button (only if accepted or completed) */}
                      {(myStatus === 'accepted' || interview.status === 'completed') && (
                        <div className="mt-3">
                          <button onClick={() => setFeedbackForm({
                            interviewId: interview.id,
                            technicalSkills: '', communication: '', experience: '', problemSolving: '',
                            roleSuitability: '', culturalFit: '', strengths: '', concerns: '',
                            rating: '', recommendation: '', comments: '',
                          })} className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 flex items-center gap-1.5">
                            <FiCheck className="w-4 h-4" /> Submit Feedback
                          </button>
                        </div>
                      )}

                      {/* Feedback form */}
                      {feedbackForm?.interviewId === interview.id && (
                        <div className="mt-4 pt-4 border-t border-thb-border space-y-3">
                          <h4 className="text-sm font-semibold text-thb-text-primary">Interview Feedback Form</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Rating (1-5) *</label>
                              <select value={feedbackForm.rating} onChange={(e) => setFeedbackForm({ ...feedbackForm, rating: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm">
                                <option value="">Select rating…</option>
                                <option value="1">1 — Poor</option>
                                <option value="2">2 — Below Average</option>
                                <option value="3">3 — Average</option>
                                <option value="4">4 — Good</option>
                                <option value="5">5 — Excellent</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-thb-text-secondary mb-1">Recommendation *</label>
                              <select value={feedbackForm.recommendation} onChange={(e) => setFeedbackForm({ ...feedbackForm, recommendation: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm">
                                <option value="">Select recommendation…</option>
                                <option value="strong_hire">Strong Hire</option>
                                <option value="hire">Hire</option>
                                <option value="hold">Hold</option>
                                <option value="next_round">Next Round</option>
                                <option value="reject">Reject</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Technical Skills</label><input value={feedbackForm.technicalSkills} onChange={(e) => setFeedbackForm({ ...feedbackForm, technicalSkills: e.target.value })} placeholder="e.g. Strong in React, Node.js" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" /></div>
                            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Communication</label><input value={feedbackForm.communication} onChange={(e) => setFeedbackForm({ ...feedbackForm, communication: e.target.value })} placeholder="e.g. Clear and concise" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" /></div>
                            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Relevant Experience</label><input value={feedbackForm.experience} onChange={(e) => setFeedbackForm({ ...feedbackForm, experience: e.target.value })} placeholder="e.g. 4 years relevant" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" /></div>
                            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Problem Solving</label><input value={feedbackForm.problemSolving} onChange={(e) => setFeedbackForm({ ...feedbackForm, problemSolving: e.target.value })} placeholder="e.g. Strong analytical skills" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" /></div>
                            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Role Suitability</label><input value={feedbackForm.roleSuitability} onChange={(e) => setFeedbackForm({ ...feedbackForm, roleSuitability: e.target.value })} placeholder="e.g. Good fit for senior role" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" /></div>
                            <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Cultural Fit</label><input value={feedbackForm.culturalFit} onChange={(e) => setFeedbackForm({ ...feedbackForm, culturalFit: e.target.value })} placeholder="e.g. Aligns with company values" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" /></div>
                          </div>
                          <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Strengths</label><textarea value={feedbackForm.strengths} onChange={(e) => setFeedbackForm({ ...feedbackForm, strengths: e.target.value })} rows={2} placeholder="Key strengths observed…" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" /></div>
                          <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Concerns</label><textarea value={feedbackForm.concerns} onChange={(e) => setFeedbackForm({ ...feedbackForm, concerns: e.target.value })} rows={2} placeholder="Areas of concern…" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" /></div>
                          <div><label className="block text-xs font-medium text-thb-text-secondary mb-1">Detailed Comments</label><textarea value={feedbackForm.comments} onChange={(e) => setFeedbackForm({ ...feedbackForm, comments: e.target.value })} rows={3} placeholder="Additional comments…" className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm" /></div>
                          <div className="flex items-center gap-2">
                            <button onClick={handleSubmitFeedback} disabled={submittingFeedback} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                              {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                            </button>
                            <button onClick={() => setFeedbackForm(null)} className="px-4 py-2 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed Interviews */}
      {completed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-thb-text-primary mb-3 flex items-center gap-2">
            <FiCheck className="w-5 h-5 text-emerald-500" /> Completed ({completed.length})
          </h2>
          <div className="space-y-3">
            {completed.map((interview) => {
              const myPm = interview.panelMembers?.find(p => p.userId === user?.id);
              return (
                <div key={interview.id} className="thb-card p-4 border-l-4 border-l-emerald-400">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`thb-badge ${statusBadges[interview.status] || 'thb-badge-info'}`}>{interview.status}</span>
                    <span className="thb-badge thb-badge-primary">{typeLabels[interview.type] || interview.type}</span>
                    {myPm?.feedbackRating && <span className="thb-badge bg-violet-50 text-violet-700"><FiStar className="w-3 h-3 inline mr-1" />{myPm.feedbackRating}/5</span>}
                    {myPm?.feedbackRecommendation && <span className="thb-badge bg-slate-100 text-slate-600">{myPm.feedbackRecommendation.replace('_', ' ')}</span>}
                  </div>
                  <div className="text-sm text-thb-text-secondary">
                    <strong>{interview.candidateName || 'N/A'}</strong> — {interview.jobTitle || 'N/A'} — {interview.date ? new Date(interview.date).toLocaleDateString('en-IN') : 'TBD'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
