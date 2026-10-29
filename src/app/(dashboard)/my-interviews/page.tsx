'use client';

import { useEffect, useState, useCallback } from 'react';
import { FiCalendar, FiClock, FiVideo, FiMapPin, FiUser, FiCheck, FiStar, FiAlertCircle, FiBriefcase } from 'react-icons/fi';
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
  interviewer: string | null;
  status: string;
  feedback: string | null;
  score: number | null;
  candidateName: string | null;
  candidateEmail: string | null;
  jobTitle: string | null;
}

const typeLabels: Record<string, string> = {
  ai: 'AI Interview',
  technical: 'Technical Interview',
  hr: 'HR Interview',
  offline_panel: 'Panel Interview',
};

const statusBadges: Record<string, string> = {
  scheduled: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
  rescheduled: 'bg-blue-50 text-blue-700',
};

export default function MyInterviewsPage() {
  const { user } = useAuthStore();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [feedbackForm, setFeedbackForm] = useState<{ id: string; feedback: string; score: string } | null>(null);

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

  const handleSubmitFeedback = async (interviewId: string) => {
    if (!feedbackForm || feedbackForm.id !== interviewId) return;
    if (!feedbackForm.feedback.trim()) { toast.error('Please enter your feedback'); return; }
    setSubmittingId(interviewId);
    try {
      const res = await fetch('/api/interviews', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          id: interviewId,
          status: 'completed',
          feedback: feedbackForm.feedback,
          score: feedbackForm.score ? parseInt(feedbackForm.score) : null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Feedback submitted');
      setFeedbackForm(null);
      fetchInterviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmittingId(null);
    }
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
            {upcoming.map((interview) => (
              <div key={interview.id} className="thb-card p-5 border-l-4 border-l-amber-400">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`thb-badge ${statusBadges[interview.status] || 'thb-badge-info'}`}>{interview.status}</span>
                      <span className="thb-badge thb-badge-primary">{typeLabels[interview.type] || interview.type}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2 text-thb-text-secondary">
                        <FiUser className="w-4 h-4" />
                        <span><strong>Candidate:</strong> {interview.candidateName || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-thb-text-secondary">
                        <FiBriefcase className="w-4 h-4" />
                        <span><strong>Position:</strong> {interview.jobTitle || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-thb-text-secondary">
                        <FiCalendar className="w-4 h-4" />
                        <span><strong>Date:</strong> {interview.date ? new Date(interview.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-thb-text-secondary">
                        <FiClock className="w-4 h-4" />
                        <span><strong>Time:</strong> {interview.time || 'TBD'}</span>
                      </div>
                      {interview.location && (
                        <div className="flex items-center gap-2 text-thb-text-secondary">
                          <FiMapPin className="w-4 h-4" />
                          <span><strong>Location:</strong> {interview.location}</span>
                        </div>
                      )}
                      {interview.meetingUrl && (
                        <div className="flex items-center gap-2 text-thb-text-secondary">
                          <FiVideo className="w-4 h-4" />
                          <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{interview.meetingUrl}</a>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setFeedbackForm({ id: interview.id, feedback: '', score: '' })}
                    className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors whitespace-nowrap"
                  >
                    Submit Feedback
                  </button>
                </div>
                {feedbackForm?.id === interview.id && (
                  <div className="mt-4 pt-4 border-t border-thb-border space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Rating (1-5)</label>
                      <select
                        value={feedbackForm.score}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, score: e.target.value })}
                        className="w-full sm:w-32 px-3 py-2 rounded-lg border border-thb-border text-sm"
                      >
                        <option value="">No rating</option>
                        <option value="1">1 - Poor</option>
                        <option value="2">2 - Below Average</option>
                        <option value="3">3 - Average</option>
                        <option value="4">4 - Good</option>
                        <option value="5">5 - Excellent</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Feedback</label>
                      <textarea
                        value={feedbackForm.feedback}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })}
                        rows={4}
                        placeholder="Share your assessment of the candidate's skills, strengths, and areas for improvement..."
                        className="w-full px-3 py-2 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSubmitFeedback(interview.id)}
                        disabled={submittingId === interview.id}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {submittingId === interview.id ? 'Submitting...' : 'Submit Feedback'}
                      </button>
                      <button
                        onClick={() => setFeedbackForm(null)}
                        className="px-4 py-2 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
            {completed.map((interview) => (
              <div key={interview.id} className="thb-card p-4 border-l-4 border-l-emerald-400">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`thb-badge ${statusBadges[interview.status] || 'thb-badge-info'}`}>{interview.status}</span>
                  <span className="thb-badge thb-badge-primary">{typeLabels[interview.type] || interview.type}</span>
                  {interview.score && (
                    <span className="thb-badge bg-violet-50 text-violet-700">
                      <FiStar className="w-3 h-3 inline mr-1" />{interview.score}/5
                    </span>
                  )}
                </div>
                <div className="text-sm text-thb-text-secondary">
                  <strong>{interview.candidateName || 'N/A'}</strong> — {interview.jobTitle || 'N/A'} — {interview.date ? new Date(interview.date).toLocaleDateString('en-IN') : 'TBD'}
                </div>
                {interview.feedback && (
                  <p className="text-sm text-thb-text-muted mt-2 p-3 bg-slate-50 rounded-lg">{interview.feedback}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
