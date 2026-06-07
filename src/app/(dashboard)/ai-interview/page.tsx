'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  FiCpu, FiPlay, FiEye, FiClock, FiUser,
  FiType, FiMic, FiVideo, FiCheckSquare, FiCode,
  FiPlus, FiX, FiZap, FiMessageSquare,
  FiSend, FiCheck, FiChevronRight, FiRefreshCw,
  FiSettings, FiBarChart2, FiArrowLeft, FiSearch,
  FiMail, FiLink, FiAlertTriangle, FiShield, FiTarget,
  FiAward, FiTrendingUp, FiUsers, FiCopy, FiTrash2,
  FiSave, FiGlobe, FiLayers, FiFileText, FiActivity,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface InterviewSetType {
  id: string; title: string; roleTitle: string; jobDescription?: string | null;
  tenantId: string; interviewMode: string; language: string; timeLimit: number;
  cvProbeDuration: number; enablePreScreening: boolean; enableProctoring: boolean;
  enableDynamicFollowUp: boolean; status: string; preScreenFilters?: Record<string, unknown> | null;
  evaluationConfig?: Record<string, unknown> | null; createdBy: string;
  questions: InterviewSetQuestionType[];
  _count?: { sessions: number; invitations: number };
  createdAt: string; updatedAt: string;
}

interface InterviewSetQuestionType {
  id?: string; order: number; category: string; question: string;
  expectedPoints?: string | null; followUpPrompts?: string | null;
  duration?: number | null; isMandatory: boolean; difficulty: string;
}

interface SessionType {
  id: string; setId: string; candidateName: string; candidateEmail: string;
  candidatePhone?: string | null; status: string; language: string;
  overallScore?: number | null; communicationScore?: number | null;
  grammarScore?: number | null; fluencyScore?: number | null;
  comprehensionScore?: number | null; vocabularyScore?: number | null;
  cognitiveScore?: number | null; skillMatchScore?: number | null;
  aiSummary?: string | null; aiRecommendation?: string | null;
  durationSeconds?: number | null; startedAt?: string | null; completedAt?: string | null;
  set: { id: string; title: string; roleTitle: string; interviewMode: string;
    questions?: InterviewSetQuestionType[]; jobDescription?: string | null; timeLimit: number; };
  responses: ResponseType[];
  proctoringLogs?: ProctoringLogType[];
  _count?: { responses: number; proctoringLogs: number };
  createdAt: string;
}

interface ResponseType {
  id: string; sessionId: string; questionId?: string | null; order: number;
  question?: string | null; responseText?: string | null;
  responseDuration?: number | null; aiScore?: number | null; aiFeedback?: string | null;
  isFollowUp: boolean; isCvBased: boolean;
}

interface ProctoringLogType {
  id: string; sessionId: string; eventType: string; severity: string;
  details?: string | null; timestamp: string; screenshotUrl?: string | null;
}

interface InvitationType {
  id: string; setId: string; candidateEmail: string; candidateName: string;
  invitationToken: string; invitationUrl?: string | null; status: string;
  sentAt?: string | null; expiresAt?: string | null;
  set: { id: string; title: string; roleTitle: string; interviewMode: string };
  createdAt: string;
}

/* ── Helper functions ── */
const MODES = [
  { id: 'text', label: 'Text Chat', icon: <FiType className="w-4 h-4" /> },
  { id: 'voice', label: 'Voice', icon: <FiMic className="w-4 h-4" /> },
  { id: 'video', label: 'Video', icon: <FiVideo className="w-4 h-4" /> },
  { id: 'mcq', label: 'MCQ', icon: <FiCheckSquare className="w-4 h-4" /> },
  { id: 'coding', label: 'Coding', icon: <FiCode className="w-4 h-4" /> },
];

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700', active: 'bg-emerald-100 text-emerald-700',
    archived: 'bg-slate-100 text-slate-500', invited: 'bg-blue-100 text-blue-700',
    pre_screen: 'bg-amber-100 text-amber-700', in_progress: 'bg-purple-100 text-purple-700',
    completed: 'bg-emerald-100 text-emerald-800', expired: 'bg-red-100 text-red-700',
    disqualified: 'bg-red-100 text-red-800', pending: 'bg-slate-100 text-slate-600',
    sent: 'bg-blue-100 text-blue-700', opened: 'bg-purple-100 text-purple-700',
    started: 'bg-amber-100 text-amber-700', bounced: 'bg-red-100 text-red-600',
  };
  return map[status] || 'bg-slate-100 text-slate-600';
}

function getRecommendationBadge(rec: string | null) {
  const map: Record<string, string> = {
    strong_hire: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    hire: 'bg-green-100 text-green-800 border-green-200',
    no_hire: 'bg-red-100 text-red-800 border-red-200',
    not_enough_evidence: 'bg-amber-100 text-amber-800 border-amber-200',
  };
  return map[rec || ''] || 'bg-slate-100 text-slate-600';
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/* ══════════════════════════════════════════════════ */
/* ═══  MAIN DASHBOARD COMPONENT                  ════ */
/* ══════════════════════════════════════════════════ */
export default function AIInterviewPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'sets' | 'sessions' | 'review' | 'invitations'>('overview');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Data states
  const [sets, setSets] = useState<InterviewSetType[]>([]);
  const [sessions, setSessions] = useState<SessionType[]>([]);
  const [invitations, setInvitations] = useState<InvitationType[]>([]);
  const [viewingSession, setViewingSession] = useState<SessionType | null>(null);

  // Sets CRUD
  const [showSetForm, setShowSetForm] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingSet, setEditingSet] = useState<InterviewSetType | null>(null);
  const [setForm, setSetForm] = useState({
    title: '', roleTitle: '', jobDescription: '', interviewMode: 'text',
    language: 'en', timeLimit: 30, cvProbeDuration: 10,
    enablePreScreening: true, enableProctoring: true, enableDynamicFollowUp: true,
    preScreenFilters: { minSalary: '', maxSalary: '', requiresVisa: false, requiresWorkPermit: false, location: '' },
  });
  const [wizardQuestions, setWizardQuestions] = useState<InterviewSetQuestionType[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sessions filters
  const [sessionFilter, setSessionFilter] = useState({ status: '', setId: '' });

  // Chat state for live interview
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'ai' | 'candidate'; content: string; timestamp: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Invitation form
  const [invitationForm, setInvitationForm] = useState({ setId: '', candidateName: '', candidateEmail: '' });
  const [bulkInvitations, setBulkInvitations] = useState('');

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [setsRes, sessionsRes, invRes] = await Promise.all([
        fetch('/api/ai-interview/sets', { headers: getAuthHeaders() }),
        fetch('/api/ai-interview/sessions', { headers: getAuthHeaders() }),
        fetch('/api/ai-interview/invitations', { headers: getAuthHeaders() }),
      ]);
      if (setsRes.ok) { const d = await setsRes.json(); setSets(d.data || []); }
      if (sessionsRes.ok) { const d = await sessionsRes.json(); setSessions(d.data || []); }
      if (invRes.ok) { const d = await invRes.json(); setInvitations(d.data || []); }
    } catch { /* silently handle */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  /* ── Sets CRUD ── */
  const resetSetForm = () => {
    setSetForm({ title: '', roleTitle: '', jobDescription: '', interviewMode: 'text', language: 'en', timeLimit: 30, cvProbeDuration: 10, enablePreScreening: true, enableProctoring: true, enableDynamicFollowUp: true, preScreenFilters: { minSalary: '', maxSalary: '', requiresVisa: false, requiresWorkPermit: false, location: '' } });
    setWizardQuestions([]);
    setWizardStep(1);
    setEditingSet(null);
    setShowSetForm(false);
  };

  const handleAutoGenerate = async () => {
    if (!setForm.roleTitle) { toast.error('Enter a role title first'); return; }
    setGenerating(true);
    try {
      const res = await fetch('/api/ai-interview/sets', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          ...setForm, tenantId: 'default', createdBy: 'current',
          questions: [], autoGenerate: true,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const q = d.data?.questions || [];
        setWizardQuestions(q.map((qu: InterviewSetQuestionType, i: number) => ({ ...qu, order: i + 1 })));
        toast.success(`Generated ${q.length} questions`);
      } else { toast.error('Failed to generate questions'); }
    } catch { toast.error('AI generation failed'); }
    setGenerating(false);
  };

  const addManualQuestion = () => {
    setWizardQuestions(prev => [...prev, {
      order: prev.length + 1, category: 'technical', question: '',
      expectedPoints: '', duration: 120, isMandatory: true, difficulty: 'medium',
    }]);
  };

  const handleSaveSet = async () => {
    if (!setForm.title || !setForm.roleTitle) { toast.error('Title and Role are required'); return; }
    setSaving(true);
    try {
      if (editingSet) {
        await fetch(`/api/ai-interview/sets/${editingSet.id}`, {
          method: 'PUT', headers: getAuthHeaders(),
          body: JSON.stringify(setForm),
        });
        toast.success('Interview set updated');
      } else {
        await fetch('/api/ai-interview/sets', {
          method: 'POST', headers: getAuthHeaders(),
          body: JSON.stringify({
            ...setForm, tenantId: 'default', createdBy: 'current',
            questions: wizardQuestions, autoGenerate: false,
          }),
        });
        toast.success('Interview set created');
      }
      resetSetForm();
      fetchData();
    } catch { toast.error('Failed to save'); }
    setSaving(false);
  };

  const handleActivateSet = async (id: string) => {
    try {
      await fetch(`/api/ai-interview/sets/${id}`, {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'active' }),
      });
      toast.success('Set activated');
      fetchData();
    } catch { toast.error('Failed to activate'); }
  };

  const handleArchiveSet = async (id: string) => {
    try {
      await fetch(`/api/ai-interview/sets/${id}`, {
        method: 'DELETE', headers: getAuthHeaders() },
      );
      toast.success('Set archived');
      fetchData();
    } catch { toast.error('Failed to archive'); }
  };

  /* ── View session for review ── */
  const handleViewSession = async (id: string) => {
    try {
      const res = await fetch(`/api/ai-interview/sessions/${id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setViewingSession(d.data);
        setViewingId(id);
        setActiveTab('review');
      }
    } catch { toast.error('Failed to load session'); }
  };

  const handleEvaluate = async (id: string) => {
    try {
      toast.loading('Evaluating...');
      const res = await fetch('/api/ai-interview/evaluate', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ sessionId: id }),
      });
      toast.dismiss();
      if (res.ok) {
        toast.success('Evaluation complete');
        if (viewingId === id) handleViewSession(id);
        fetchData();
      } else { toast.error('Evaluation failed'); }
    } catch { toast.error('Evaluation failed'); }
  };

  /* ── Chat interview ── */
  const startLiveInterview = async (sessionId: string) => {
    setLiveSessionId(sessionId);
    setLiveMode(true);
    setChatMessages([]);
    setChatInput('');
    try {
      const res = await fetch('/api/ai-interview/chat', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ message: "I'm ready to begin the interview.", interviewType: 'text', jobTitle: 'the position', history: [] }),
      });
      if (res.ok) {
        const d = await res.json();
        setChatMessages([{ role: 'ai', content: d.response, timestamp: d.timestamp }]);
      }
    } catch { toast.error('Failed to start interview'); }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatSending) return;
    const userMsg = { role: 'candidate' as const, content: chatInput.trim(), timestamp: new Date().toISOString() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatSending(true);
    try {
      const res = await fetch('/api/ai-interview/chat', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ message: chatInput.trim(), interviewType: 'text', jobTitle: 'the position', history: chatMessages }),
      });
      if (res.ok) {
        const d = await res.json();
        setChatMessages(prev => [...prev, { role: 'ai', content: d.response, timestamp: d.timestamp }]);
      }
    } catch { toast.error('Failed to send'); }
    setChatSending(false);
  };

  const endLiveInterview = async () => {
    if (!liveSessionId) return;
    try {
      const transcript = chatMessages.map(m => `${m.role === 'ai' ? 'AI' : 'Candidate'}: ${m.content}`).join('\n');
      await fetch(`/api/ai-interview/sessions/${liveSessionId}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ fullTranscript: transcript, durationSeconds: 1800 }),
      });
      toast.success('Interview completed');
    } catch { /* non-critical */ }
    setLiveMode(false);
    setLiveSessionId(null);
    setChatMessages([]);
    fetchData();
  };

  /* ── Invitation create ── */
  const handleCreateInvitation = async () => {
    if (!invitationForm.setId || !invitationForm.candidateEmail || !invitationForm.candidateName) {
      toast.error('Fill all fields'); return;
    }
    try {
      await fetch('/api/ai-interview/invitations', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ setId: invitationForm.setId, candidateEmail: invitationForm.candidateEmail, candidateName: invitationForm.candidateName }),
      });
      toast.success('Invitation created');
      setInvitationForm({ setId: '', candidateName: '', candidateEmail: '' });
      fetchData();
    } catch { toast.error('Failed to create invitation'); }
  };

  const handleBulkInvitations = async () => {
    if (!invitationForm.setId || !bulkInvitations.trim()) { toast.error('Select a set and enter candidates'); return; }
    const lines = bulkInvitations.trim().split('\n').filter(l => l.trim());
    const candidates = lines.map(l => {
      const parts = l.split(',').map(p => p.trim());
      return { email: parts[0] || '', name: parts[1] || parts[0] };
    }).filter(c => c.email);
    try {
      await fetch('/api/ai-interview/invitations', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ setId: invitationForm.setId, candidates }),
      });
      toast.success(`${candidates.length} invitations created`);
      setBulkInvitations('');
      fetchData();
    } catch { toast.error('Bulk creation failed'); }
  };

  const copyInvitationLink = (token: string) => {
    const url = `${window.location.origin}/interview/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied!');
  };

  /* ══════════════════════════════════════════════════ */
  /* ═══  LIVE INTERVIEW MODE                       ════ */
  /* ══════════════════════════════════════════════════ */
  if (liveMode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={endLiveInterview} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100">
              <FiArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center">
              <FiCpu className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-nexus-text-primary">Live AI Interview</h2>
              <p className="text-xs text-nexus-text-muted">{chatMessages.filter(m => m.role === 'candidate').length} exchanges</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold flex items-center gap-1">
              <FiCpu className="w-3 h-3" /> AI Active
            </span>
            <button onClick={endLiveInterview} className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600">End Interview</button>
          </div>
        </div>
        <div className="nexus-card overflow-hidden">
          <div className="h-[calc(100vh-320px)] min-h-[400px] overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] p-4 rounded-xl text-sm leading-relaxed ${msg.role === 'ai' ? 'bg-white border border-nexus-border rounded-tl-none shadow-sm text-nexus-text-primary' : 'bg-purple-600 text-white rounded-tr-none shadow-sm'}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {msg.role === 'ai' ? <><FiCpu className="w-3.5 h-3.5 text-purple-500" /><span className="text-[10px] font-semibold text-purple-500">AI Interviewer</span></>
                      : <><FiUser className="w-3.5 h-3.5" /><span className="text-[10px] font-semibold">You</span></>}
                  </div>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {chatSending && (
              <div className="flex justify-start"><div className="max-w-[80%] p-4 rounded-xl rounded-tl-none bg-white border border-nexus-border shadow-sm">
                <div className="flex items-center gap-2"><div className="flex gap-1">{[0, 150, 300].map((d, i) => <div key={i} className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}<span className="text-xs text-nexus-text-muted">AI is thinking...</span></div></div>
              </div></div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 border-t border-nexus-border bg-white">
            <div className="flex items-end gap-3">
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                placeholder="Type your response..." className="flex-1 px-4 py-3 rounded-xl border border-nexus-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 min-h-[48px] max-h-[120px]" rows={1} disabled={chatSending} />
              <button onClick={sendChatMessage} disabled={!chatInput.trim() || chatSending}
                className="flex-shrink-0 w-12 h-12 rounded-xl bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 disabled:opacity-50 shadow-sm shadow-purple-500/25">
                <FiSend className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════ */
  /* ═══  TABS + MAIN VIEWS                        ════ */
  /* ══════════════════════════════════════════════════ */
  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: <FiBarChart2 className="w-4 h-4" /> },
    { id: 'sets' as const, label: 'Interview Sets', icon: <FiLayers className="w-4 h-4" /> },
    { id: 'sessions' as const, label: 'Sessions', icon: <FiUsers className="w-4 h-4" /> },
    { id: 'review' as const, label: 'Review Suite', icon: <FiEye className="w-4 h-4" /> },
    { id: 'invitations' as const, label: 'Invitations', icon: <FiMail className="w-4 h-4" /> },
  ];

  const activeSets = sets.filter(s => s.status === 'active');
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const inProgressSessions = sessions.filter(s => s.status === 'in_progress');
  const avgScore = completedSessions.length > 0 ? Math.round(completedSessions.reduce((s, x) => s + (x.overallScore || 0), 0) / completedSessions.length) : 0;
  const completionRate = sessions.length > 0 ? Math.round((completedSessions.length / sessions.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiCpu className="w-6 h-6 text-purple-500" /> AI Interview Platform
          </h1>
          <p className="text-nexus-text-secondary mt-1">Conduct AI-powered interviews with smart evaluation and scoring</p>
        </div>
        <button onClick={() => { resetSetForm(); setShowSetForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm shadow-sm shadow-purple-500/25 transition-colors">
          <FiPlus className="w-4 h-4" /> Create Interview Set
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-purple-700 shadow-sm' : 'text-nexus-text-muted hover:text-nexus-text-primary hover:bg-white/50'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ──────────── OVERVIEW TAB ──────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Active Sets', value: activeSets.length, icon: <FiLayers className="w-5 h-5" />, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Active Sessions', value: inProgressSessions.length, icon: <FiActivity className="w-5 h-5" />, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Completion Rate', value: `${completionRate}%`, icon: <FiTrendingUp className="w-5 h-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Avg Score', value: avgScore || '—', icon: <FiAward className="w-5 h-5" />, color: 'text-blue-600', bg: 'bg-blue-50' },
            ].map(stat => (
              <div key={stat.label} className="nexus-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center ${stat.color}`}>{stat.icon}</div>
                </div>
                <p className="text-2xl font-bold text-nexus-text-primary">{stat.value}</p>
                <p className="text-xs text-nexus-text-muted mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Sessions */}
            <div className="nexus-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-nexus-text-primary flex items-center gap-2"><FiClock className="w-4 h-4 text-purple-500" /> Recent Sessions</h3>
                <button onClick={fetchData} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
              </div>
              {sessions.length === 0 ? (
                <div className="py-8 text-center"><FiUsers className="w-10 h-10 text-nexus-text-muted mx-auto mb-2" /><p className="text-nexus-text-secondary font-medium">No sessions yet</p><p className="text-xs text-nexus-text-muted mt-1">Create an interview set and invite candidates</p></div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {sessions.slice(0, 10).map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-nexus-border hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center"><FiUser className="w-4 h-4 text-purple-600" /></div>
                        <div>
                          <p className="text-sm font-medium text-nexus-text-primary">{s.candidateName}</p>
                          <p className="text-xs text-nexus-text-muted">{s.set?.roleTitle || 'N/A'} · {s.set?.interviewMode || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.overallScore !== null && s.overallScore !== undefined && <span className={`text-sm font-bold ${getScoreColor(s.overallScore)}`}>{s.overallScore}%</span>}
                        {s.status === 'completed' && <button onClick={() => handleViewSession(s.id)} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-purple-600 hover:bg-purple-50" title="Review"><FiEye className="w-4 h-4" /></button>}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadge(s.status)}`}>{s.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Sets */}
            <div className="nexus-card p-5">
              <h3 className="text-base font-semibold text-nexus-text-primary flex items-center gap-2 mb-4"><FiLayers className="w-4 h-4 text-purple-500" /> Active Interview Sets</h3>
              {activeSets.length === 0 ? (
                <div className="py-8 text-center"><FiCpu className="w-10 h-10 text-nexus-text-muted mx-auto mb-2" /><p className="text-nexus-text-secondary font-medium">No active sets</p><p className="text-xs text-nexus-text-muted mt-1">Create and activate an interview set to get started</p></div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {activeSets.map(s => (
                    <div key={s.id} className="p-3 rounded-lg border border-nexus-border hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-nexus-text-primary">{s.title}</p>
                          <p className="text-xs text-nexus-text-muted">{s.roleTitle} · {s.interviewMode} · {s.questions?.length || 0} questions</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-nexus-text-muted">{s._count?.sessions || 0} sessions</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────── SETS TAB ──────────── */}
      {activeTab === 'sets' && (
        <div className="space-y-6">
          {showSetForm ? (
            /* ── Create/Edit Wizard ── */
            <div className="nexus-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-nexus-text-primary">{editingSet ? 'Edit Interview Set' : 'Create Interview Set'}</h2>
                  <p className="text-sm text-nexus-text-muted">Step {wizardStep} of 3</p>
                </div>
                <button onClick={resetSetForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiX className="w-5 h-5" /></button>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-2 mb-6">
                {[1, 2, 3].map(step => (
                  <div key={step} className="flex items-center gap-2 flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${wizardStep >= step ? 'bg-purple-600 text-white' : 'bg-slate-100 text-nexus-text-muted'}`}>{step}</div>
                    {step < 3 && <div className={`flex-1 h-1 rounded ${wizardStep > step ? 'bg-purple-600' : 'bg-slate-200'}`} />}
                  </div>
                ))}
              </div>

              {/* Step 1: Role & Questions */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Set Title *</label>
                      <input value={setForm.title} onChange={e => setSetForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" placeholder="e.g., Senior Frontend Developer Assessment" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Role Title *</label>
                      <input value={setForm.roleTitle} onChange={e => setSetForm(p => ({ ...p, roleTitle: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" placeholder="e.g., Senior Frontend Developer" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Job Description</label>
                    <textarea value={setForm.jobDescription} onChange={e => setSetForm(p => ({ ...p, jobDescription: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 min-h-[100px]" placeholder="Paste the JD here for AI-tailored questions..." />
                  </div>

                  <div className="flex items-center gap-3 mb-2">
                    <button onClick={handleAutoGenerate} disabled={generating || !setForm.roleTitle}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50 shadow-sm shadow-purple-500/25">
                      {generating ? <><FiRefreshCw className="w-4 h-4 animate-spin" /> Generating...</> : <><FiZap className="w-4 h-4" /> Auto-Generate Questions</>}
                    </button>
                    <button onClick={addManualQuestion} className="inline-flex items-center gap-2 px-4 py-2 border border-nexus-border rounded-lg text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">
                      <FiPlus className="w-4 h-4" /> Add Manual
                    </button>
                  </div>

                  {/* Questions list */}
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {wizardQuestions.map((q, i) => (
                      <div key={i} className="p-3 rounded-lg border border-nexus-border space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-600">Q{i + 1}</span>
                          <div className="flex items-center gap-2">
                            <select value={q.category} onChange={e => { const updated = [...wizardQuestions]; updated[i] = { ...updated[i], category: e.target.value }; setWizardQuestions(updated); }}
                              className="px-2 py-1 rounded border border-nexus-border text-xs">
                              {['technical', 'behavioral', 'situational', 'cv_based', 'cognitive'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <select value={q.difficulty} onChange={e => { const updated = [...wizardQuestions]; updated[i] = { ...updated[i], difficulty: e.target.value }; setWizardQuestions(updated); }}
                              className="px-2 py-1 rounded border border-nexus-border text-xs">
                              {['easy', 'medium', 'hard'].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <button onClick={() => setWizardQuestions(prev => prev.filter((_, j) => j !== i))} className="p-1 text-red-400 hover:text-red-600"><FiX className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                        <input value={q.question} onChange={e => { const updated = [...wizardQuestions]; updated[i] = { ...updated[i], question: e.target.value }; setWizardQuestions(updated); }}
                          className="w-full px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" placeholder="Enter question..." />
                      </div>
                    ))}
                    {wizardQuestions.length === 0 && <div className="py-8 text-center"><FiMessageSquare className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" /><p className="text-sm text-nexus-text-muted">No questions yet. Auto-generate or add manually.</p></div>}
                  </div>
                </div>
              )}

              {/* Step 2: Configuration */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Interview Mode</label>
                      <select value={setForm.interviewMode} onChange={e => setSetForm(p => ({ ...p, interviewMode: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400">
                        {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Language</label>
                      <select value={setForm.language} onChange={e => setSetForm(p => ({ ...p, language: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400">
                        {['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja', 'ko', 'ar', 'hi', 'it', 'nl', 'ru', 'tr'].map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Time Limit (min)</label>
                      <input type="number" value={setForm.timeLimit} onChange={e => setSetForm(p => ({ ...p, timeLimit: parseInt(e.target.value) || 30 }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">CV Probe Duration (min)</label>
                      <input type="number" value={setForm.cvProbeDuration} onChange={e => setSetForm(p => ({ ...p, cvProbeDuration: parseInt(e.target.value) || 10 }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-nexus-text-secondary">Features</label>
                    {[
                      { key: 'enablePreScreening', label: 'Pre-screening Filters', desc: 'Knock-out criteria before interview starts' },
                      { key: 'enableProctoring', label: 'Anti-Cheat Proctoring', desc: 'Tab switches, face detection, copy-paste monitoring' },
                      { key: 'enableDynamicFollowUp', label: 'Dynamic Follow-ups', desc: 'AI generates follow-up questions based on responses' },
                    ].map(f => (
                      <label key={f.key} className="flex items-start gap-3 p-3 rounded-lg border border-nexus-border cursor-pointer hover:bg-slate-50/50">
                        <input type="checkbox" checked={setForm[f.key as keyof typeof setForm] as boolean}
                          onChange={e => setSetForm(p => ({ ...p, [f.key]: e.target.checked }))}
                          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
                        <div><p className="text-sm font-medium text-nexus-text-primary">{f.label}</p><p className="text-xs text-nexus-text-muted">{f.desc}</p></div>
                      </label>
                    ))}
                  </div>

                  {setForm.enablePreScreening && (
                    <div className="p-4 rounded-lg bg-slate-50 border border-nexus-border space-y-3">
                      <label className="block text-xs font-medium text-nexus-text-secondary">Pre-Screening Filters</label>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-[10px] text-nexus-text-muted mb-1">Min Salary</label><input value={setForm.preScreenFilters.minSalary} onChange={e => setSetForm(p => ({ ...p, preScreenFilters: { ...p.preScreenFilters, minSalary: e.target.value } }))} className="w-full px-2 py-1.5 rounded border border-nexus-border text-xs" placeholder="$" /></div>
                        <div><label className="block text-[10px] text-nexus-text-muted mb-1">Max Salary</label><input value={setForm.preScreenFilters.maxSalary} onChange={e => setSetForm(p => ({ ...p, preScreenFilters: { ...p.preScreenFilters, maxSalary: e.target.value } }))} className="w-full px-2 py-1.5 rounded border border-nexus-border text-xs" placeholder="$" /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={setForm.preScreenFilters.requiresVisa} onChange={e => setSetForm(p => ({ ...p, preScreenFilters: { ...p.preScreenFilters, requiresVisa: e.target.checked } }))} className="w-3.5 h-3.5 rounded" /> Requires Visa Sponsorship</label>
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={setForm.preScreenFilters.requiresWorkPermit} onChange={e => setSetForm(p => ({ ...p, preScreenFilters: { ...p.preScreenFilters, requiresWorkPermit: e.target.checked } }))} className="w-3.5 h-3.5 rounded" /> Requires Work Permit</label>
                      </div>
                      <div><label className="block text-[10px] text-nexus-text-muted mb-1">Location Requirement</label><input value={setForm.preScreenFilters.location} onChange={e => setSetForm(p => ({ ...p, preScreenFilters: { ...p.preScreenFilters, location: e.target.value } }))} className="w-full px-2 py-1.5 rounded border border-nexus-border text-xs" placeholder="e.g., Remote, NYC, London" /></div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Review & Save */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-nexus-border bg-slate-50/50">
                    <h3 className="text-sm font-bold text-nexus-text-primary mb-3">Review Configuration</h3>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                      <div><span className="text-nexus-text-muted">Title:</span> <span className="font-medium text-nexus-text-primary">{setForm.title || '—'}</span></div>
                      <div><span className="text-nexus-text-muted">Role:</span> <span className="font-medium text-nexus-text-primary">{setForm.roleTitle || '—'}</span></div>
                      <div><span className="text-nexus-text-muted">Mode:</span> <span className="font-medium text-nexus-text-primary">{setForm.interviewMode}</span></div>
                      <div><span className="text-nexus-text-muted">Language:</span> <span className="font-medium text-nexus-text-primary">{setForm.language.toUpperCase()}</span></div>
                      <div><span className="text-nexus-text-muted">Time Limit:</span> <span className="font-medium text-nexus-text-primary">{setForm.timeLimit} min</span></div>
                      <div><span className="text-nexus-text-muted">Questions:</span> <span className="font-medium text-nexus-text-primary">{wizardQuestions.length}</span></div>
                      <div><span className="text-nexus-text-muted">Pre-screening:</span> <span className="font-medium text-nexus-text-primary">{setForm.enablePreScreening ? 'Yes' : 'No'}</span></div>
                      <div><span className="text-nexus-text-muted">Proctoring:</span> <span className="font-medium text-nexus-text-primary">{setForm.enableProctoring ? 'Yes' : 'No'}</span></div>
                    </div>
                  </div>
                  {wizardQuestions.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-nexus-text-primary">Questions ({wizardQuestions.length})</h3>
                      {wizardQuestions.map((q, i) => (
                        <div key={i} className="p-3 rounded-lg border border-nexus-border flex items-start gap-3">
                          <span className="text-xs font-bold text-purple-600 mt-0.5">Q{i + 1}</span>
                          <div className="flex-1">
                            <p className="text-sm text-nexus-text-primary">{q.question || '(empty)'}</p>
                            <div className="flex gap-2 mt-1">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-nexus-text-muted">{q.category}</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-nexus-text-muted">{q.difficulty}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Wizard Navigation */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-nexus-border">
                <button onClick={() => wizardStep > 1 ? setWizardStep(wizardStep - 1) : resetSetForm()}
                  className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50">
                  {wizardStep === 1 ? 'Cancel' : 'Back'}
                </button>
                {wizardStep < 3 ? (
                  <button onClick={() => setWizardStep(wizardStep + 1)}
                    className="px-6 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 shadow-sm shadow-purple-500/25">
                    Next <FiChevronRight className="w-4 h-4 inline" />
                  </button>
                ) : (
                  <button onClick={handleSaveSet} disabled={saving}
                    className="px-6 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 shadow-sm shadow-purple-500/25">
                    {saving ? 'Saving...' : <><FiSave className="w-4 h-4 inline" /> Save Set</>}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ── Sets List ── */
            <div className="nexus-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-nexus-text-primary">Interview Sets</h3>
                <button onClick={fetchData} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100"><FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
              </div>
              {sets.length === 0 ? (
                <div className="py-12 text-center"><FiLayers className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" /><p className="text-nexus-text-secondary font-medium">No interview sets yet</p><p className="text-xs text-nexus-text-muted mt-1">Click &quot;Create Interview Set&quot; to get started</p></div>
              ) : (
                <div className="space-y-3">
                  {sets.map(s => (
                    <div key={s.id} className="p-4 rounded-lg border border-nexus-border hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-semibold text-nexus-text-primary">{s.title}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadge(s.status)}`}>{s.status}</span>
                          </div>
                          <p className="text-xs text-nexus-text-muted">{s.roleTitle} · {MODES.find(m => m.id === s.interviewMode)?.label || s.interviewMode} · {s.questions?.length || 0} questions · {s.timeLimit} min</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-nexus-text-muted">
                            <span className="flex items-center gap-1"><FiUsers className="w-3 h-3" /> {s._count?.sessions || 0} sessions</span>
                            <span className="flex items-center gap-1"><FiMail className="w-3 h-3" /> {s._count?.invitations || 0} invites</span>
                            <span className="flex items-center gap-1"><FiGlobe className="w-3 h-3" /> {s.language.toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {s.status === 'draft' && <button onClick={() => handleActivateSet(s.id)} className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50" title="Activate"><FiCheck className="w-4 h-4" /></button>}
                          {s.status === 'active' && <button onClick={() => handleArchiveSet(s.id)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="Archive"><FiTrash2 className="w-4 h-4" /></button>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ──────────── SESSIONS TAB ──────────── */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="nexus-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <FiSearch className="w-4 h-4 text-nexus-text-muted" />
                <select value={sessionFilter.status} onChange={e => setSessionFilter(p => ({ ...p, status: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                  <option value="">All Statuses</option>
                  {['invited', 'pre_screen', 'in_progress', 'completed', 'expired', 'disqualified'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <select value={sessionFilter.setId} onChange={e => setSessionFilter(p => ({ ...p, setId: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                <option value="">All Sets</option>
                {sets.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <button onClick={() => {
                let url = '/api/ai-interview/sessions?';
                if (sessionFilter.status) url += `status=${sessionFilter.status}&`;
                if (sessionFilter.setId) url += `setId=${sessionFilter.setId}`;
                fetch(url, { headers: getAuthHeaders() }).then(r => r.json()).then(d => setSessions(d.data || [])).catch(() => {});
              }} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm">
                Apply Filters
              </button>
            </div>
          </div>

          {/* Sessions Table */}
          <div className="nexus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-nexus-border bg-slate-50/50">
                  {['Candidate', 'Role', 'Mode', 'Status', 'Score', 'Duration', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-nexus-text-secondary">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-nexus-text-muted"><FiUsers className="w-8 h-8 mx-auto mb-2" />No sessions found</td></tr>
                  ) : sessions.map(s => (
                    <tr key={s.id} className="border-b border-nexus-border hover:bg-slate-50/50">
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center"><FiUser className="w-3.5 h-3.5 text-purple-600" /></div><div><p className="text-sm font-medium text-nexus-text-primary">{s.candidateName}</p><p className="text-xs text-nexus-text-muted">{s.candidateEmail}</p></div></div></td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{s.set?.roleTitle || '—'}</td>
                      <td className="px-4 py-3"><span className="flex items-center gap-1.5 text-sm text-nexus-text-secondary">{MODES.find(m => m.id === s.set?.interviewMode)?.icon} {s.set?.interviewMode || '—'}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadge(s.status)}`}>{s.status}</span></td>
                      <td className="px-4 py-3">{s.overallScore !== null && s.overallScore !== undefined ? <span className={`text-sm font-bold ${getScoreColor(s.overallScore)}`}>{s.overallScore}%</span> : <span className="text-nexus-text-muted text-sm">—</span>}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-muted">{formatDuration(s.durationSeconds)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {s.status === 'completed' && <button onClick={() => handleViewSession(s.id)} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-purple-600 hover:bg-purple-50" title="Review"><FiEye className="w-4 h-4" /></button>}
                          {s.status === 'invited' && <button onClick={() => startLiveInterview(s.id)} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-emerald-600 hover:bg-emerald-50" title="Start"><FiPlay className="w-4 h-4" /></button>}
                          {s.status === 'completed' && !s.aiSummary && <button onClick={() => handleEvaluate(s.id)} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-amber-600 hover:bg-amber-50" title="Evaluate"><FiZap className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────── REVIEW SUITE TAB ──────────── */}
      {activeTab === 'review' && (
        <div className="space-y-6">
          {!viewingSession ? (
            <div className="nexus-card p-12 text-center">
              <FiEye className="w-12 h-12 text-nexus-text-muted mx-auto mb-3" />
              <p className="text-nexus-text-secondary font-medium">Select a completed session to review</p>
              <p className="text-xs text-nexus-text-muted mt-1">Click the eye icon on any completed session in the Sessions tab</p>
              {completedSessions.length > 0 && (
                <div className="mt-6 space-y-2 max-w-md mx-auto">
                  {completedSessions.slice(0, 5).map(s => (
                    <button key={s.id} onClick={() => handleViewSession(s.id)}
                      className="w-full p-3 rounded-lg border border-nexus-border text-left hover:bg-slate-50/50 transition-colors flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center"><FiUser className="w-3.5 h-3.5 text-purple-600" /></div>
                        <div><p className="text-sm font-medium text-nexus-text-primary">{s.candidateName}</p><p className="text-xs text-nexus-text-muted">{s.set?.roleTitle}</p></div>
                      </div>
                      {s.overallScore !== null && s.overallScore !== undefined && <span className={`text-sm font-bold ${getScoreColor(s.overallScore)}`}>{s.overallScore}%</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Back button */}
              <button onClick={() => { setViewingSession(null); setViewingId(null); }}
                className="inline-flex items-center gap-2 text-sm text-nexus-text-secondary hover:text-nexus-text-primary transition-colors">
                <FiArrowLeft className="w-4 h-4" /> Back to Review Suite
              </button>

              {/* Header */}
              <div className="nexus-card p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center"><FiUser className="w-6 h-6 text-purple-600" /></div>
                    <div>
                      <h2 className="text-lg font-bold text-nexus-text-primary">{viewingSession.candidateName}</h2>
                      <p className="text-sm text-nexus-text-muted">{viewingSession.candidateEmail} · {viewingSession.set?.roleTitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {viewingSession.overallScore !== null && viewingSession.overallScore !== undefined && (
                      <div className={`text-3xl font-bold ${getScoreColor(viewingSession.overallScore)}`}>{viewingSession.overallScore}%</div>
                    )}
                    {viewingSession.aiRecommendation && (
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getRecommendationBadge(viewingSession.aiRecommendation)}`}>
                        {viewingSession.aiRecommendation.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    )}
                    {!viewingSession.aiSummary && (
                      <button onClick={() => handleEvaluate(viewingSession.id)} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm flex items-center gap-2">
                        <FiZap className="w-4 h-4" /> Evaluate
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Score Radar (simplified as metric cards) */}
                <div className="nexus-card p-5">
                  <h3 className="text-sm font-semibold text-nexus-text-primary flex items-center gap-2 mb-4"><FiTarget className="w-4 h-4 text-purple-500" /> Communication Metrics</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Communication', score: viewingSession.communicationScore },
                      { label: 'Grammar', score: viewingSession.grammarScore },
                      { label: 'Fluency', score: viewingSession.fluencyScore },
                      { label: 'Comprehension', score: viewingSession.comprehensionScore },
                      { label: 'Vocabulary', score: viewingSession.vocabularyScore },
                    ].map(m => (
                      <div key={m.label} className="flex items-center gap-3">
                        <span className="text-xs text-nexus-text-muted w-24">{m.label}</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${m.score !== null && m.score !== undefined ? (m.score >= 80 ? 'bg-emerald-500' : m.score >= 60 ? 'bg-amber-500' : 'bg-red-500') : 'bg-slate-200'}`}
                            style={{ width: `${m.score ?? 0}%` }} />
                        </div>
                        <span className={`text-sm font-semibold w-12 text-right ${m.score !== null && m.score !== undefined ? getScoreColor(m.score) : 'text-nexus-text-muted'}`}>{m.score ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-nexus-border">
                    <h4 className="text-xs font-semibold text-nexus-text-secondary mb-3">Other Scores</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-slate-50 text-center">
                        <p className="text-lg font-bold text-nexus-text-primary">{viewingSession.cognitiveScore ?? '—'}</p>
                        <p className="text-[10px] text-nexus-text-muted">Cognitive</p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 text-center">
                        <p className="text-lg font-bold text-nexus-text-primary">{viewingSession.skillMatchScore ?? '—'}</p>
                        <p className="text-[10px] text-nexus-text-muted">Skill Match</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Summary */}
                <div className="nexus-card p-5">
                  <h3 className="text-sm font-semibold text-nexus-text-primary flex items-center gap-2 mb-4"><FiCpu className="w-4 h-4 text-purple-500" /> AI Evaluation</h3>
                  {viewingSession.aiSummary ? (
                    <div className="prose prose-sm max-w-none">
                      <p className="text-sm text-nexus-text-primary leading-relaxed whitespace-pre-wrap">{viewingSession.aiSummary}</p>
                    </div>
                  ) : (
                    <div className="py-8 text-center"><FiCpu className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" /><p className="text-sm text-nexus-text-muted">No evaluation yet. Click Evaluate to generate.</p></div>
                  )}

                  {/* Proctoring alerts */}
                  {viewingSession.proctoringLogs && viewingSession.proctoringLogs.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-nexus-border">
                      <h4 className="text-xs font-semibold text-nexus-text-secondary flex items-center gap-2 mb-3"><FiShield className="w-3.5 h-3.5 text-amber-500" /> Proctoring Alerts ({viewingSession.proctoringLogs.length})</h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {viewingSession.proctoringLogs.map(log => (
                          <div key={log.id} className={`p-2 rounded-lg text-xs flex items-center gap-2 ${log.severity === 'critical' ? 'bg-red-50 text-red-700' : log.severity === 'high' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-nexus-text-secondary'}`}>
                            <FiAlertTriangle className="w-3 h-3 flex-shrink-0" />
                            <span className="font-medium">{log.eventType.replace(/_/g, ' ')}</span>
                            {log.details && <span>— {log.details}</span>}
                            <span className="ml-auto text-[10px] opacity-70">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Transcript */}
              <div className="nexus-card p-5">
                <h3 className="text-sm font-semibold text-nexus-text-primary flex items-center gap-2 mb-4"><FiFileText className="w-4 h-4 text-purple-500" /> Transcript & Responses</h3>
                {viewingSession.responses && viewingSession.responses.length > 0 ? (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {viewingSession.responses.map((r, i) => (
                      <div key={r.id} className="p-4 rounded-lg border border-nexus-border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-purple-600">Q{r.order}</span>
                            {r.isFollowUp && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">Follow-up</span>}
                            {r.isCvBased && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">CV-Based</span>}
                          </div>
                          {r.aiScore !== null && r.aiScore !== undefined && <span className={`text-xs font-bold ${getScoreColor(r.aiScore)}`}>{r.aiScore}%</span>}
                        </div>
                        <p className="text-sm font-medium text-nexus-text-primary mb-2">{r.question || 'Question not recorded'}</p>
                        <div className="p-3 rounded-lg bg-slate-50">
                          <p className="text-sm text-nexus-text-secondary">{r.responseText || '(No response recorded)'}</p>
                        </div>
                        {r.aiFeedback && <p className="text-xs text-nexus-text-muted mt-2 italic">AI Feedback: {r.aiFeedback}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center"><FiMessageSquare className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" /><p className="text-sm text-nexus-text-muted">No responses recorded</p></div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────── INVITATIONS TAB ──────────── */}
      {activeTab === 'invitations' && (
        <div className="space-y-6">
          {/* Create invitation form */}
          <div className="nexus-card p-5">
            <h3 className="text-sm font-semibold text-nexus-text-primary flex items-center gap-2 mb-4"><FiMail className="w-4 h-4 text-purple-500" /> Create Invitation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select value={invitationForm.setId} onChange={e => setInvitationForm(p => ({ ...p, setId: e.target.value }))}
                className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                <option value="">Select Interview Set</option>
                {sets.filter(s => s.status === 'active').map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <input value={invitationForm.candidateName} onChange={e => setInvitationForm(p => ({ ...p, candidateName: e.target.value }))}
                className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20" placeholder="Candidate Name" />
              <input value={invitationForm.candidateEmail} onChange={e => setInvitationForm(p => ({ ...p, candidateEmail: e.target.value }))}
                className="px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20" placeholder="Candidate Email" />
              <button onClick={handleCreateInvitation} className="px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm shadow-purple-500/25">Send Invite</button>
            </div>

            <div className="mt-4 pt-4 border-t border-nexus-border">
              <h4 className="text-xs font-semibold text-nexus-text-secondary mb-2">Bulk Invite (one per line: email, name)</h4>
              <div className="flex gap-3">
                <textarea value={bulkInvitations} onChange={e => setBulkInvitations(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 min-h-[60px]" placeholder="john@example.com, John Smith&#10;jane@example.com, Jane Doe" />
                <button onClick={handleBulkInvitations} className="px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 self-end shadow-sm shadow-purple-500/25">Bulk Create</button>
              </div>
            </div>
          </div>

          {/* Invitations list */}
          <div className="nexus-card p-5">
            <h3 className="text-base font-semibold text-nexus-text-primary flex items-center gap-2 mb-4"><FiMail className="w-5 h-5 text-purple-500" /> Invitations ({invitations.length})</h3>
            {invitations.length === 0 ? (
              <div className="py-8 text-center"><FiMail className="w-10 h-10 text-nexus-text-muted mx-auto mb-2" /><p className="text-nexus-text-secondary font-medium">No invitations yet</p></div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {invitations.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border border-nexus-border hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center"><FiMail className="w-4 h-4 text-purple-600" /></div>
                      <div>
                        <p className="text-sm font-medium text-nexus-text-primary">{inv.candidateName}</p>
                        <p className="text-xs text-nexus-text-muted">{inv.candidateEmail} · {inv.set?.title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => copyInvitationLink(inv.invitationToken)} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-purple-600 hover:bg-purple-50" title="Copy link">
                        <FiLink className="w-4 h-4" />
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(inv.invitationToken); toast.success('Token copied'); }} className="p-1.5 rounded-lg text-nexus-text-muted hover:text-purple-600 hover:bg-purple-50" title="Copy token">
                        <FiCopy className="w-4 h-4" />
                      </button>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadge(inv.status)}`}>{inv.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
