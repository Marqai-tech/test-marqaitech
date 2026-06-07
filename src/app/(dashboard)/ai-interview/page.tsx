'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiCpu, FiPlay, FiEye, FiStar, FiClock, FiUser,
  FiType, FiMic, FiVideo, FiCheckSquare, FiCode,
  FiPlus, FiX, FiEdit2, FiZap, FiMessageSquare,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Interview Types ── */
const INTERVIEW_TYPES = [
  { id: 'text', label: 'Text Chat', description: 'AI conducts a text-based interview with smart follow-up questions', icon: <FiType className="w-6 h-6" />, color: 'bg-blue-50 text-blue-600', enabled: true },
  { id: 'voice', label: 'Voice Interview', description: 'AI conducts a voice-based interview with speech analysis', icon: <FiMic className="w-6 h-6" />, color: 'bg-purple-50 text-purple-600', enabled: true },
  { id: 'video', label: 'Video Interview', description: 'AI conducts a video interview with facial expression analysis', icon: <FiVideo className="w-6 h-6" />, color: 'bg-amber-50 text-amber-600', enabled: true },
  { id: 'mcq', label: 'MCQ Assessment', description: 'AI generates adaptive multiple-choice questions', icon: <FiCheckSquare className="w-6 h-6" />, color: 'bg-emerald-50 text-emerald-600', enabled: true },
  { id: 'coding', label: 'Coding Challenge', description: 'AI evaluates code submissions with test cases', icon: <FiCode className="w-6 h-6" />, color: 'bg-teal-50 text-teal-600', enabled: true },
];

/* ── Transcript Demo ── */
const TRANSCRIPT_EXCERPT = [
  { role: 'ai', text: 'Hello Alex! I\'m your AI interviewer today for the Senior Full-Stack Developer position. Let\'s start with your experience. Can you tell me about a complex system you\'ve designed recently?' },
  { role: 'candidate', text: 'I recently designed a microservices architecture for an e-commerce platform handling 10K+ requests per second. I used event-driven patterns with Kafka and implemented circuit breakers for resilience.' },
  { role: 'ai', text: 'That sounds impressive! Can you elaborate on how you handled the circuit breaker pattern and what fallback strategies you implemented?' },
  { role: 'candidate', text: 'We used the Hystrix pattern with three fallback levels: cache-first, then degraded service, and finally a graceful error response. This reduced our error rate by 95% during peak loads.' },
  { role: 'ai', text: 'Excellent explanation. Now, let\'s move to a system design question. How would you design a URL shortener service that can handle 100M URLs?' },
];

/* ── Demo Candidate Scores ── */
const DEMO_CANDIDATES = [
  { id: 'c1', name: 'Alex Johnson', title: 'Senior Full-Stack Developer', aiScore: 88, skillMatch: 85, cultureFit: 82 },
  { id: 'c2', name: 'Priya Sharma', title: 'DevOps Engineer', aiScore: 92, skillMatch: 90, cultureFit: 87 },
  { id: 'c3', name: 'Rohan Kumar', title: 'Product Designer', aiScore: 78, skillMatch: 82, cultureFit: 90 },
  { id: 'c4', name: 'Sneha Patel', title: 'Data Scientist', aiScore: 85, skillMatch: 88, cultureFit: 79 },
];

/* ── Demo Interviews ── */
const DEMO_INTERVIEWS = [
  { id: 'int-1', candidate: 'Alex Johnson', type: 'Technical', duration: 45, date: 'Jun 5, 2026', status: 'completed', score: 88 },
  { id: 'int-2', candidate: 'Priya Sharma', type: 'HR', duration: 30, date: 'Jun 4, 2026', status: 'completed', score: 92 },
  { id: 'int-3', candidate: 'Rohan Kumar', type: 'Behavioral', duration: 35, date: 'Jun 6, 2026', status: 'scheduled', score: null },
  { id: 'int-4', candidate: 'Sneha Patel', type: 'Coding', duration: 60, date: 'Jun 7, 2026', status: 'scheduled', score: null },
];

function getOverallScore(candidate: { aiScore: number; skillMatch: number; cultureFit: number }): number {
  return Math.round((candidate.aiScore + candidate.skillMatch + candidate.cultureFit) / 3);
}

function getScoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-600';
  if (score >= 75) return 'text-amber-600';
  return 'text-red-600';
}

function getInterviewStatusBadge(status: string) {
  const map: Record<string, string> = {
    completed: 'nexus-badge nexus-badge-success',
    scheduled: 'nexus-badge nexus-badge-info',
    cancelled: 'nexus-badge nexus-badge-error',
    in_progress: 'nexus-badge nexus-badge-warning',
  };
  return map[status] || 'nexus-badge nexus-badge-info';
}

export default function AIInterviewPage() {
  const [activeTab, setActiveTab] = useState<'types' | 'scores' | 'transcript' | 'schedule'>('types');
  const [selectedCandidate, setSelectedCandidate] = useState(DEMO_CANDIDATES[0]);

  // Schedule form
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    candidateName: '', type: 'technical', scheduledAt: '', duration: '60',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleScheduleSubmit = async () => {
    if (!scheduleForm.candidateName || !scheduleForm.scheduledAt) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch('/api/ai-interview', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(scheduleForm),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Interview scheduled successfully');
      setShowScheduleForm(false);
      setScheduleForm({ candidateName: '', type: 'technical', scheduledAt: '', duration: '60' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule interview');
    } finally {
      setSubmitting(false);
    }
  };

  const overallScore = selectedCandidate ? getOverallScore(selectedCandidate) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiCpu className="w-6 h-6 text-purple-500" />
            AI Interview
          </h1>
          <p className="text-nexus-text-secondary mt-1">Conduct AI-powered interviews with smart evaluation and scoring</p>
        </div>
        <button onClick={() => { setShowScheduleForm(true); setActiveTab('schedule'); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm shadow-sm shadow-purple-500/25 transition-colors">
          <FiPlay className="w-4 h-4" /> Schedule Interview
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit flex-wrap">
        <button onClick={() => setActiveTab('types')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'types' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>Interview Types</button>
        <button onClick={() => setActiveTab('scores')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'scores' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>Score Cards</button>
        <button onClick={() => setActiveTab('transcript')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'transcript' ? 'bg-white text-nexus-text-primary shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text-primary'}`}>Transcript View</button>
      </div>

      {/* Interview Types Tab */}
      {activeTab === 'types' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {INTERVIEW_TYPES.map(type => (
              <div key={type.id} className="nexus-card nexus-card-hover p-5">
                <div className={`w-12 h-12 rounded-lg ${type.color} flex items-center justify-center mb-3`}>
                  {type.icon}
                </div>
                <h3 className="font-semibold text-nexus-text-primary mb-1">{type.label}</h3>
                <p className="text-xs text-nexus-text-muted mb-4 leading-relaxed">{type.description}</p>
                <div className="flex items-center gap-2">
                  <button className="flex-1 px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-1">
                    <FiPlay className="w-3.5 h-3.5" /> Configure
                  </button>
                  <button className="px-3 py-2 border border-nexus-border text-sm font-medium rounded-lg text-nexus-text-secondary hover:bg-slate-50 transition-colors flex items-center justify-center gap-1">
                    <FiEye className="w-3.5 h-3.5" /> Preview
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Interviews */}
          <div className="nexus-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FiClock className="w-5 h-5 text-purple-500" />
              <h3 className="text-base font-semibold text-nexus-text-primary">Recent Interviews</h3>
            </div>
            <div className="space-y-2">
              {DEMO_INTERVIEWS.map(interview => (
                <div key={interview.id} className="flex items-center justify-between p-3 rounded-lg border border-nexus-border hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center">
                      <FiUser className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-nexus-text-primary">{interview.candidate}</p>
                      <p className="text-xs text-nexus-text-muted">{interview.type} · {interview.duration} min · {interview.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {interview.score !== null && (
                      <span className={`text-sm font-bold ${getScoreColor(interview.score)}`}>{interview.score}%</span>
                    )}
                    <span className={getInterviewStatusBadge(interview.status)}>{interview.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Score Cards Tab */}
      {activeTab === 'scores' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Candidate List */}
          <div className="nexus-card p-5">
            <h3 className="text-base font-semibold text-nexus-text-primary mb-3">Candidates</h3>
            <div className="space-y-2">
              {DEMO_CANDIDATES.map(candidate => {
                const score = getOverallScore(candidate);
                return (
                  <button
                    key={candidate.id}
                    onClick={() => setSelectedCandidate(candidate)}
                    className={`w-full p-3 rounded-lg border cursor-pointer transition-colors text-left ${
                      selectedCandidate?.id === candidate.id ? 'border-purple-500 bg-purple-50/50' : 'border-nexus-border hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-nexus-text-primary">{candidate.name}</p>
                        <p className="text-xs text-nexus-text-muted">{candidate.title}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <FiZap className="w-3 h-3 text-purple-500" />
                        <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Score Radar (simplified with bars) */}
          <div className="nexus-card p-5">
            <h3 className="text-base font-semibold text-nexus-text-primary mb-1">Evaluation Overview</h3>
            <p className="text-xs text-nexus-text-muted mb-4">{selectedCandidate?.name || 'Select a candidate'}</p>
            {selectedCandidate ? (
              <div className="space-y-4">
                {[
                  { label: 'AI Score', value: selectedCandidate.aiScore },
                  { label: 'Skill Match', value: selectedCandidate.skillMatch },
                  { label: 'Culture Fit', value: selectedCandidate.cultureFit },
                ].map(skill => (
                  <div key={skill.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-nexus-text-secondary">{skill.label}</span>
                      <span className={`font-medium ${getScoreColor(skill.value)}`}>{skill.value}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${
                          skill.value >= 85 ? 'bg-emerald-500' : skill.value >= 75 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${skill.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-nexus-text-muted">Select a candidate to view scores</p>
              </div>
            )}
          </div>

          {/* Score Breakdown */}
          <div className="nexus-card p-5">
            <h3 className="text-base font-semibold text-nexus-text-primary mb-1">Score Breakdown</h3>
            <p className="text-xs text-nexus-text-muted mb-4">{selectedCandidate?.name || 'No candidate selected'}</p>
            {selectedCandidate ? (
              <div className="space-y-3">
                <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-nexus-text-primary">Overall Score</span>
                    <span className={`text-lg font-bold ${getScoreColor(overallScore)}`}>
                      <FiStar className="w-4 h-4 inline mr-1" />{overallScore}/100
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div className="h-3 rounded-full bg-gradient-to-r from-purple-500 to-violet-500 transition-all duration-500" style={{ width: `${overallScore}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <p className="text-lg font-bold text-blue-600">{selectedCandidate.aiScore}%</p>
                    <p className="text-[10px] text-nexus-text-muted">AI Score</p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                    <p className="text-lg font-bold text-emerald-600">{selectedCandidate.skillMatch}%</p>
                    <p className="text-[10px] text-nexus-text-muted">Skill Match</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <p className="text-lg font-bold text-amber-600">{selectedCandidate.cultureFit}%</p>
                    <p className="text-[10px] text-nexus-text-muted">Culture Fit</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 mt-2">
                  <p className="text-xs text-nexus-text-muted font-medium mb-1">Recommendation</p>
                  <p className="text-sm text-nexus-text-primary">
                    {overallScore >= 85
                      ? 'Strong hire recommendation. Candidate exceeds expectations across all evaluation dimensions.'
                      : overallScore >= 75
                        ? 'Recommended for next round. Candidate shows good potential with minor areas for development.'
                        : 'Consider additional evaluation. Candidate may need further assessment in key areas.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-nexus-text-muted">Select a candidate to view breakdown</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transcript View Tab */}
      {activeTab === 'transcript' && (
        <div className="nexus-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FiMessageSquare className="w-5 h-5 text-purple-500" />
            <h3 className="text-base font-semibold text-nexus-text-primary">Interview Transcript</h3>
            <span className="nexus-badge nexus-badge-purple">AI</span>
          </div>
          <p className="text-xs text-nexus-text-muted mb-4">Senior Full-Stack Developer · Text Interview · 25 min</p>
          <div className="max-h-96 overflow-y-auto space-y-3">
            {TRANSCRIPT_EXCERPT.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                  msg.role === 'ai'
                    ? 'bg-slate-100 rounded-tl-none text-nexus-text-primary'
                    : 'bg-purple-600 text-white rounded-tr-none'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {msg.role === 'ai' ? (
                      <><FiCpu className="w-3.5 h-3.5" /><span className="text-[10px] font-medium">AI Interviewer</span></>
                    ) : (
                      <><FiUser className="w-3.5 h-3.5" /><span className="text-[10px] font-medium">Candidate</span></>
                    )}
                  </div>
                  <p>{msg.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule Form Tab */}
      {activeTab === 'schedule' && showScheduleForm && (
        <div id="schedule-form" className="nexus-card border-l-4 border-l-purple-500">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">Schedule Interview</h2>
              <button onClick={() => { setShowScheduleForm(false); setActiveTab('types'); }} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors"><FiX className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Candidate Name *</label>
                <input value={scheduleForm.candidateName} onChange={e => setScheduleForm(p => ({ ...p, candidateName: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" placeholder="Enter candidate name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Interview Type</label>
                <select value={scheduleForm.type} onChange={e => setScheduleForm(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                  <option value="technical">Technical</option>
                  <option value="hr">HR</option>
                  <option value="behavioral">Behavioral</option>
                  <option value="coding">Coding</option>
                  <option value="mcq">MCQ Assessment</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Scheduled Date & Time *</label>
                <input type="datetime-local" value={scheduleForm.scheduledAt} onChange={e => setScheduleForm(p => ({ ...p, scheduledAt: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Duration (minutes)</label>
                <input type="number" value={scheduleForm.duration} onChange={e => setScheduleForm(p => ({ ...p, duration: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-nexus-border">
              <button onClick={() => { setShowScheduleForm(false); setActiveTab('types'); }} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleScheduleSubmit} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 shadow-sm shadow-purple-500/25 transition-colors">
                {submitting ? 'Scheduling...' : 'Schedule Interview'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
