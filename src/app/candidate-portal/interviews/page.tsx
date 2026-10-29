'use client';

import { useState, useEffect } from 'react';
import { FiCalendar, FiClock, FiVideo, FiMapPin, FiCheck, FiX, FiRefreshCw, FiUser } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function CandidateInterviewsPage() {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('candidate_token') || localStorage.getItem('tb_token') : null;
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  useEffect(() => {
    fetchInterviews();
  }, []);

  const fetchInterviews = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/candidate-portal/interviews', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setInterviews(data.interviews || []);
      }
    } catch {
      toast.error('Failed to load interviews');
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (interviewId: string, action: 'confirm' | 'reschedule' | 'withdraw') => {
    let reason = '';
    if (action === 'reschedule') {
      reason = window.prompt('Please provide your preferred date/time for rescheduling:') || '';
      if (!reason.trim()) { toast.error('Please provide a preferred date/time'); return; }
    }
    if (action === 'withdraw') {
      if (!window.confirm('Are you sure you want to withdraw your application? This cannot be undone.')) return;
    }
    setResponding(interviewId);
    try {
      const res = await fetch(`/api/candidate-portal/interviews/${interviewId}/respond`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action, reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(action === 'confirm' ? 'Attendance confirmed!' : action === 'reschedule' ? 'Reschedule requested' : 'Application withdrawn');
      fetchInterviews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setResponding(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-emerald-500 rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">My Interviews</h1>
          <p className="text-sm text-slate-500 mt-1">View your interview schedule and confirm attendance</p>
        </div>

        {interviews.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 text-center">
            <FiCalendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No interviews scheduled yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {interviews.map((interview) => (
              <div key={interview.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    interview.candidateStatus === 'confirmed' ? 'bg-emerald-50 text-emerald-700' :
                    interview.candidateStatus === 'reschedule_requested' ? 'bg-blue-50 text-blue-700' :
                    interview.candidateStatus === 'withdrawn' ? 'bg-red-50 text-red-700' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {interview.candidateStatus === 'confirmed' ? 'Confirmed' :
                     interview.candidateStatus === 'reschedule_requested' ? 'Reschedule Requested' :
                     interview.candidateStatus === 'withdrawn' ? 'Withdrawn' : 'Pending Confirmation'}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                    {interview.type === 'ai' ? 'AI Interview' : interview.type === 'technical' ? 'Technical' : interview.type === 'hr' ? 'HR' : 'Panel'} Interview
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-slate-900 mb-3">{interview.jobTitle || 'Position'}</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
                  <div className="flex items-center gap-2 text-slate-600">
                    <FiCalendar className="w-4 h-4" />
                    <span>{interview.date ? new Date(interview.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBD'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <FiClock className="w-4 h-4" />
                    <span>{interview.time || 'TBD'} ({interview.duration || 60} min)</span>
                  </div>
                  {interview.location && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <FiMapPin className="w-4 h-4" />
                      <span>{interview.location}</span>
                    </div>
                  )}
                  {interview.meetingUrl && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <FiVideo className="w-4 h-4" />
                      <a href={interview.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{interview.meetingUrl}</a>
                    </div>
                  )}
                </div>

                {interview.instructions && (
                  <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm text-slate-600">
                    <strong>Instructions:</strong> {interview.instructions}
                  </div>
                )}

                {interview.candidateStatus === 'pending' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleRespond(interview.id, 'confirm')}
                      disabled={responding === interview.id}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <FiCheck className="w-4 h-4" /> Confirm Attendance
                    </button>
                    <button
                      onClick={() => handleRespond(interview.id, 'reschedule')}
                      disabled={responding === interview.id}
                      className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 text-sm font-medium hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <FiRefreshCw className="w-4 h-4" /> Request Reschedule
                    </button>
                    <button
                      onClick={() => handleRespond(interview.id, 'withdraw')}
                      disabled={responding === interview.id}
                      className="px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <FiX className="w-4 h-4" /> Withdraw
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
