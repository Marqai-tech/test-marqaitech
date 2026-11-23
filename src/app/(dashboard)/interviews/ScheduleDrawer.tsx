'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Schedule Interview — slide-over drawer (replaces the old center modal).

   Why a drawer: scheduling needs four decisions (candidate → panel → time →
   details); a right-side drawer keeps the interviews list visible behind it
   and fits everything with a single internal scroll. On mobile it becomes a
   full-screen sheet.

   Endpoints (unchanged from the old modal):
     GET  /api/recruitment?limit=200              applicants (via job postings)
     GET  /api/departments?limit=200&noDedupe=1   departments for panel picker
     GET  /api/interviews/panel-availability      availability + conflicts
     POST /api/interviews                         schedule (round auto-computed)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';
import { FiCalendar, FiClock, FiSearch, FiX, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface InterviewLite {
  id: string;
  jobApplicationId: string;
  status: string;
  round?: number | null;
  type: string;
  date: string;
  time: string | null;
}

interface Applicant {
  id: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  jobPostingId: string;
  jobPosting?: {
    id: string;
    title: string;
    interviewPlan?: string | null;
    department?: { id: string; name: string } | null;
  } | null;
}

interface PanelEmployee {
  id: string;
  userId: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  role: string;
  availability: string;
  reason: string;
  conflictTime: string;
}

const TYPE_LABELS: Record<string, string> = {
  technical: 'Technical', hr: 'HR', managerial: 'Managerial', cultural: 'Cultural',
  final: 'Final', offline_panel: 'Panel', ai: 'AI', portfolio: 'Portfolio Review',
};

const FILTER_CLS = 'h-[30px] rounded-[7px] border border-slate-300 bg-white px-2 text-[11.5px] text-slate-800 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/15';
const INPUT_CLS = 'h-[32px] w-full rounded-[7px] border border-slate-300 bg-white px-2.5 text-[11.5px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15';
const BTN_PRI = 'inline-flex items-center justify-center gap-1.5 h-[32px] px-3.5 rounded-[8px] bg-green-600 text-white text-[11.5px] font-bold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
const BTN_GHOST = 'inline-flex items-center justify-center gap-1.5 h-[32px] px-3 rounded-[8px] bg-white border border-slate-300 text-slate-600 text-[11.5px] font-bold hover:bg-slate-50 transition shrink-0';

/** Parse a job posting's interviewPlan JSON into round labels. */
function parsePlan(plan?: string | null): string[] {
  if (!plan) return [];
  try {
    const v = JSON.parse(plan);
    if (!Array.isArray(v)) return [];
    return v.map((entry: unknown, i: number) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        const o = entry as Record<string, unknown>;
        const t = (o.type as string) || (o.title as string) || (o.name as string);
        if (t) return TYPE_LABELS[t] || t;
      }
      return `Round ${i + 1}`;
    });
  } catch { return []; }
}

const AVAIL_CLS: Record<string, string> = {
  Available: 'bg-green-50 text-green-700 border-green-200',
  Busy: 'bg-amber-50 text-amber-700 border-amber-200',
  'On Leave': 'bg-red-50 text-red-600 border-red-200',
};

export default function ScheduleDrawer({
  open, onClose, interviews, onScheduled,
}: {
  open: boolean;
  onClose: () => void;
  /** Current interview list — used for the plan rail (completed rounds) and the same-slot conflict check. */
  interviews: InterviewLite[];
  onScheduled: () => void;
}) {
  /* ── data ── */
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [panelMembers, setPanelMembers] = useState<PanelEmployee[]>([]);

  /* ── selection / form ── */
  const [applicantSearch, setApplicantSearch] = useState('');
  const [showApplicantDropdown, setShowApplicantDropdown] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [selectedAppDept, setSelectedAppDept] = useState('');
  const [panelSearch, setPanelSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([]);
  const [panelLeadId, setPanelLeadId] = useState('');
  const [evalAreaText, setEvalAreaText] = useState('');
  const [form, setForm] = useState({
    type: 'technical', date: '', time: '10:00', duration: 60, mode: 'online',
    location: '', meetingUrl: '', confirmationDeadline: '', feedbackDeadline: '',
    instructions: '', evaluationAreas: [] as string[], roundOverride: '',
  });
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const selectedApp = applicants.find(a => a.id === selectedAppId) || null;
  const plan = parsePlan(selectedApp?.jobPosting?.interviewPlan);
  const planTotal = plan.length;

  /* Completed rounds for the selected candidate (for the plan rail). */
  const candidateInterviews = selectedAppId
    ? interviews.filter(i => i.jobApplicationId === selectedAppId)
    : [];
  const doneRounds = candidateInterviews
    .filter(i => i.status === 'completed')
    .map(i => Number(i.round || 0));
  const activeInterview = candidateInterviews.find(i => i.status === 'scheduled');
  const autoRound = Math.max(0, ...doneRounds) + 1;

  /* ── fetchers (same endpoints as the old modal) ── */
  const fetchApplicants = useCallback(async () => {
    try {
      const res = await fetch('/api/recruitment?limit=200', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const jobs = data.jobPostings || [];
        const allApps: Applicant[] = [];
        for (const job of jobs) {
          for (const app of job.applications || []) {
            allApps.push({
              ...app,
              jobPosting: { id: job.id, title: job.title, interviewPlan: job.interviewPlan, department: job.department },
              jobPostingId: job.id,
            });
          }
        }
        setApplicants(allApps);
      }
    } catch { /* dropdown just stays empty */ }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments?limit=200&noDedupe=1', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const rawDepts = data.data || data.departments || (Array.isArray(data) ? data : []);
        setDepartments(rawDepts.map((d: Record<string, unknown>) => ({ id: d.id as string, name: d.name as string })));
      }
    } catch { /* non-fatal */ }
  }, []);

  const fetchPanelAvailability = useCallback(async () => {
    if (!selectedAppDept) { setPanelMembers([]); return; }
    setLoadingPanel(true);
    try {
      const params = new URLSearchParams({
        departmentId: selectedAppDept,
        duration: String(form.duration || 60),
        interviewType: form.type,
      });
      if (form.date) {
        params.set('date', form.date);
        if (form.time) params.set('time', form.time);
      }
      const res = await fetch(`/api/interviews/panel-availability?${params}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPanelMembers(data.employees || []);
      }
    } catch { /* non-fatal */ }
    finally { setLoadingPanel(false); }
  }, [selectedAppDept, form.date, form.time, form.duration, form.type]);

  useEffect(() => {
    if (!open) return;
    if (applicants.length === 0) queueMicrotask(() => fetchApplicants());
    if (departments.length === 0) queueMicrotask(() => fetchDepartments());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && selectedAppDept) queueMicrotask(() => fetchPanelAvailability());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppDept, form.date, form.time, form.duration, form.type]);

  /* Reset every time the drawer opens. */
  useEffect(() => {
    if (open) {
      setSelectedAppId(''); setSelectedAppDept(''); setSelectedPanelIds([]);
      setPanelLeadId(''); setApplicantSearch(''); setPanelSearch(''); setDeptFilter('');
      setShowApplicantDropdown(false);
      setForm({ type: 'technical', date: '', time: '10:00', duration: 60, mode: 'online', location: '', meetingUrl: '', confirmationDeadline: '', feedbackDeadline: '', instructions: '', evaluationAreas: [], roundOverride: '' });
    }
  }, [open]);

  const handleSelectApplicant = (appId: string) => {
    setSelectedAppId(appId);
    setShowApplicantDropdown(false);
    setApplicantSearch('');
    setSelectedPanelIds([]);
    setPanelLeadId('');
    const app = applicants.find(a => a.id === appId);
    if (app?.jobPosting?.department?.id) setSelectedAppDept(app.jobPosting.department.id);
    // Default the type to the job's plan next round when available.
    const nextIdx = Math.max(0, ...interviews.filter(i => i.jobApplicationId === appId && i.status === 'completed').map(i => Number(i.round || 0)));
    const planLabels = parsePlan(app?.jobPosting?.interviewPlan);
    if (planLabels[nextIdx]) {
      const match = Object.entries(TYPE_LABELS).find(([, lab]) => lab === planLabels[nextIdx]);
      if (match) setForm(f => ({ ...f, type: match[0] }));
    }
  };

  /* ── live validation (mirrors the API's post-submit guards, shown pre-submit) ── */
  const selectedDate = form.date ? new Date(form.date) : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const pastDate = selectedDate ? selectedDate < today : false;
  const sameSlotConflict = selectedApp && form.date
    ? interviews.some(i => i.jobApplicationId === selectedApp.id && i.status === 'scheduled'
        && new Date(i.date).toDateString() === new Date(form.date).toDateString())
    : false;
  const unavailableSelected = selectedPanelIds.filter(uid => {
    const m = panelMembers.find(p => p.userId === uid);
    return m && (m.availability === 'Busy' || m.availability === 'On Leave');
  });

  /* ── submit ── */
  const handleSchedule = async () => {
    if (!selectedAppId) { toast.error('Please select a candidate'); return; }
    if (!form.date) { toast.error('Date is required'); return; }
    if (pastDate) { toast.error('Interview date cannot be in the past'); return; }
    if (!selectedAppDept) { toast.error('This candidate\'s job has no department — panel availability cannot be checked'); return; }
    if (selectedPanelIds.length === 0) { toast.error('Select at least one panel member'); return; }
    if (unavailableSelected.length > 0) {
      const names = unavailableSelected.map(uid => panelMembers.find(p => p.userId === uid)?.name).join(', ');
      toast.error(`Cannot select unavailable members: ${names}`);
      return;
    }
    setScheduling(true);
    try {
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          jobApplicationId: selectedAppId,
          type: form.type,
          date: form.date,
          time: form.time,
          duration: Number(form.duration) || 60,
          mode: form.mode,
          location: form.location || undefined,
          meetingUrl: form.meetingUrl || undefined,
          panelMemberIds: selectedPanelIds,
          panelLeadId: panelLeadId || undefined,
          confirmationDeadline: form.confirmationDeadline || undefined,
          feedbackDeadline: form.feedbackDeadline || undefined,
          instructions: form.instructions || undefined,
          evaluationAreas: form.evaluationAreas.length > 0 ? JSON.stringify(form.evaluationAreas) : undefined,
          ...(form.roundOverride ? { round: Number(form.roundOverride) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to schedule interview');
      toast.success(`Interview scheduled — ${selectedPanelIds.length} panel member(s) notified. Round ${data.round || autoRound}.`);
      onScheduled();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule interview');
    } finally {
      setScheduling(false);
    }
  };

  if (!open) return null;

  const filteredPanel = panelMembers.filter(m =>
    (!panelSearch || m.name.toLowerCase().includes(panelSearch.toLowerCase()) || m.email.toLowerCase().includes(panelSearch.toLowerCase())) &&
    (!deptFilter || m.department === deptFilter)
  );

  const stepDone = {
    candidate: !!selectedAppId,
    panel: selectedPanelIds.length > 0,
    schedule: !!form.date && !pastDate,
  };

  return (
    <>
      {/* scrim */}
      <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={onClose} />
      {/* drawer */}
      <aside className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[500px] bg-white shadow-2xl flex flex-col">
        {/* header */}
        <div className="py-3.5 border-b border-slate-200 flex items-start justify-between gap-2.5 shrink-0" style={{ padding: '14px 18px' }}>
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-900 tracking-tight">Schedule Interview</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Auto-fills the round, panel availability, and conflicts as you go.</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 shrink-0">
            <FiX className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* step rail */}
        <div className="flex gap-1.5 pt-3 shrink-0" style={{ padding: '12px 18px 0' }}>
          {[
            { key: 'candidate', label: '1 · Candidate' },
            { key: 'panel', label: '2 · Panel' },
            { key: 'schedule', label: '3 · Schedule' },
            { key: 'details', label: '4 · Details' },
          ].map(s => {
            const done = stepDone[s.key as keyof typeof stepDone];
            return (
              <div key={s.key} className="flex-1">
                <div className={`h-1 rounded-full ${done ? 'bg-green-500' : s.key === 'details' ? 'bg-slate-200' : 'bg-green-300'}`} />
                <span className={`block mt-1.5 text-[9.5px] font-extrabold tracking-wide ${done ? 'text-green-700' : 'text-slate-400'}`}>{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* body */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '4px 18px 14px' }}>
          {/* ── 1 · candidate ── */}
          <section style={{ padding: '14px 0', borderBottom: '1px dashed #e2e8f0' }}>
            <h3 className="text-[12.5px] font-extrabold text-slate-800 flex items-center gap-2">
              <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-extrabold ${stepDone.candidate ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {stepDone.candidate ? <FiCheck className="w-2.5 h-2.5" /> : '1'}
              </span>
              Candidate
            </h3>
            <p className="text-[10.5px] text-slate-400 mt-0.5 mb-2.5 ml-[26px]">Picked from active pipelines — rounds and plan come from the job.</p>

            {selectedApp ? (
              <div className="flex items-center gap-2.5 rounded-[10px] border border-green-200 bg-green-50 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <b className="block text-[12.5px] font-extrabold text-slate-800 truncate">{selectedApp.candidateName}</b>
                  <span className="block text-[10.5px] text-slate-500 truncate mt-px">
                    {selectedApp.jobPosting?.title || '—'} · {selectedApp.status ? selectedApp.status.replace(/_/g, ' ') : ''}
                    {activeInterview ? ' · has an active interview' : ''}
                  </span>
                </div>
                <button
                  onClick={() => { setSelectedAppId(''); setSelectedAppDept(''); setSelectedPanelIds([]); setPanelLeadId(''); setShowApplicantDropdown(true); }}
                  className="shrink-0 h-[28px] px-2.5 rounded-[7px] border border-slate-300 bg-white text-[10.5px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  value={applicantSearch}
                  onChange={e => { setApplicantSearch(e.target.value); setShowApplicantDropdown(true); }}
                  onFocus={() => setShowApplicantDropdown(true)}
                  placeholder="Search candidate by name or email…"
                  className={INPUT_CLS + ' pl-8'}
                />
                {showApplicantDropdown && (
                  <div className="absolute z-10 left-0 right-0 mt-1 max-h-52 overflow-auto rounded-[9px] border border-slate-200 bg-white shadow-lg">
                    {applicants
                      .filter(a => {
                        const s = applicantSearch.toLowerCase();
                        return !s || (a.candidateName || '').toLowerCase().includes(s) || (a.candidateEmail || '').toLowerCase().includes(s);
                      })
                      .slice(0, 30)
                      .map(a => (
                        <button
                          key={a.id}
                          onClick={() => handleSelectApplicant(a.id)}
                          className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-slate-100 last:border-0"
                        >
                          <p className="text-[11.5px] font-bold text-slate-800">{a.candidateName}</p>
                          <p className="text-[10px] text-slate-400">{a.candidateEmail} · {a.jobPosting?.title || '—'}</p>
                        </button>
                      ))}
                    {applicants.length === 0 && <p className="px-3 py-3 text-[11px] text-slate-400">Loading candidates…</p>}
                  </div>
                )}
              </div>
            )}

            {/* plan rail */}
            {selectedApp && planTotal > 0 && (
              <div className="flex gap-1.5 mt-2.5">
                {plan.map((label, idx) => {
                  const r = idx + 1;
                  const done = doneRounds.includes(r);
                  const next = r === autoRound;
                  return (
                    <div
                      key={idx}
                      className={`relative flex-1 rounded-[9px] border px-2 py-1.5 bg-white
                        ${done ? 'border-green-200 bg-green-50' : ''}
                        ${next ? 'border-2 border-green-500 ring-2 ring-green-500/15' : !done ? 'border-slate-200' : ''}`}
                    >
                      {done && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center text-[9px] font-extrabold">✓</span>}
                      <p className={`text-[10px] font-extrabold ${done || next ? 'text-green-700' : 'text-slate-500'}`}>R{r} · {label}</p>
                      <p className="text-[9.5px] text-slate-400 mt-0.5">{done ? 'cleared' : next ? 'next round' : 'pending'}</p>
                      {next && <span className="inline-block mt-1 text-[8.5px] font-extrabold bg-green-600 text-white rounded px-1 py-px tracking-wide">AUTO</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {selectedApp && planTotal === 0 && (
              <p className="text-[10px] text-slate-400 mt-2 ml-[26px]">This job has no interview plan — the round number will be computed automatically.</p>
            )}
          </section>

          {/* ── 2 · panel ── */}
          <section style={{ padding: '14px 0', borderBottom: '1px dashed #e2e8f0' }}>
            <h3 className="text-[12.5px] font-extrabold text-slate-800 flex items-center gap-2">
              <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-extrabold ${stepDone.panel ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {stepDone.panel ? <FiCheck className="w-2.5 h-2.5" /> : '2'}
              </span>
              Panel
              <span className="ml-auto text-[10px] font-bold text-green-700">
                {selectedPanelIds.length} selected · {panelMembers.length > 0 ? `${panelMembers.filter(m => m.availability === 'Available').length}/${panelMembers.length} available` : '—'}
              </span>
            </h3>
            <p className="text-[10.5px] text-slate-400 mt-0.5 mb-2.5 ml-[26px]">Availability checked against their interview calendar — conflicts flagged before you schedule.</p>

            {!selectedApp && <p className="text-[11px] text-slate-400 ml-[26px]">Pick a candidate first — the panel list comes from the job&apos;s department.</p>}
            {selectedApp && (
              <>
                <div className="flex gap-1.5 mb-2">
                  <div className="flex-1 relative">
                    <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <input value={panelSearch} onChange={e => setPanelSearch(e.target.value)} placeholder="Search employees…" className={FILTER_CLS + ' w-full pl-8'} />
                  </div>
                  <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className={FILTER_CLS}>
                    <option value="">All Departments</option>
                    {Array.from(new Set(panelMembers.map(m => m.department).filter(Boolean))).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                {loadingPanel && <p className="text-[11px] text-slate-400 py-2 text-center">Checking availability…</p>}
                {!loadingPanel && filteredPanel.length === 0 && (
                  <p className="text-[11px] text-slate-400 py-2 text-center">No employees found for this department.</p>
                )}
                {filteredPanel.slice(0, 12).map(m => {
                  const busy = m.availability === 'Busy' || m.availability === 'On Leave';
                  const checked = selectedPanelIds.includes(m.userId);
                  return (
                    <button
                      key={m.userId}
                      onClick={() => {
                        setSelectedPanelIds(checked ? selectedPanelIds.filter(id => id !== m.userId) : [...selectedPanelIds, m.userId]);
                        if (checked && panelLeadId === m.userId) setPanelLeadId('');
                      }}
                      className={`w-full flex items-center gap-2.5 rounded-[9px] border px-2.5 py-2 mb-1.5 text-left transition
                        ${busy ? 'border-amber-200 bg-amber-50' : checked ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white hover:border-green-300'}`}
                    >
                      <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 ${checked ? 'bg-green-600 border-green-600 text-white' : 'border-slate-300'}`}>
                        {checked && <FiCheck className="w-2.5 h-2.5" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <b className="block text-[11.5px] font-bold text-slate-800 truncate">{m.name}</b>
                        <span className="block text-[10px] text-slate-400 truncate">{m.designation} · {m.email}</span>
                      </div>
                      <span className={`inline-flex rounded-[5px] border px-1.5 py-0.5 text-[9.5px] font-extrabold shrink-0 ${AVAIL_CLS[m.availability] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {m.availability}{busy && m.conflictTime ? ` · ${m.conflictTime}` : ''}
                      </span>
                    </button>
                  );
                })}
                {filteredPanel.length > 12 && <p className="text-[10px] text-slate-400 text-center">+ {filteredPanel.length - 12} more — refine the search to see them.</p>}
              </>
            )}
          </section>

          {/* ── 3 · schedule ── */}
          <section style={{ padding: '14px 0', borderBottom: '1px dashed #e2e8f0' }}>
            <h3 className="text-[12.5px] font-extrabold text-slate-800 flex items-center gap-2">
              <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-extrabold ${stepDone.schedule ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {stepDone.schedule ? <FiCheck className="w-2.5 h-2.5" /> : '3'}
              </span>
              Schedule
            </h3>
            <p className="text-[10.5px] text-slate-400 mt-0.5 mb-2.5 ml-[26px]">
              {sameSlotConflict
                ? '⚠ This candidate already has a scheduled interview on this date — the API will reject a same-slot duplicate.'
                : 'Candidate has no other scheduled interview on this day.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Date <span className="text-red-500">*</span></label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={INPUT_CLS + (pastDate ? ' border-red-400' : '')} />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Time <span className="text-red-500">*</span></label>
                <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Duration</label>
                <select value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} className={INPUT_CLS}>
                  {[30, 45, 60, 90].map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Mode</label>
                <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} className={INPUT_CLS}>
                  <option value="online">Video</option>
                  <option value="onsite">Onsite</option>
                  <option value="phone">Phone</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">{form.mode === 'onsite' ? 'Location' : 'Meeting link'}</label>
                <input
                  value={form.mode === 'onsite' ? form.location : form.meetingUrl}
                  onChange={e => setForm(form.mode === 'onsite' ? { ...form, location: e.target.value } : { ...form, meetingUrl: e.target.value })}
                  placeholder={form.mode === 'onsite' ? 'e.g. Bengaluru HQ, Floor 4' : 'https://meet.google.com/…'}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Panel confirm by</label>
                <input type="datetime-local" value={form.confirmationDeadline} onChange={e => setForm({ ...form, confirmationDeadline: e.target.value })} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Feedback due by</label>
                <input type="datetime-local" value={form.feedbackDeadline} onChange={e => setForm({ ...form, feedbackDeadline: e.target.value })} className={INPUT_CLS} />
              </div>
            </div>
          </section>

          {/* ── 4 · details ── */}
          <section style={{ padding: '14px 0 4px' }}>
            <h3 className="text-[12.5px] font-extrabold text-slate-800 flex items-center gap-2">
              <span className="w-[18px] h-[18px] rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-extrabold">4</span>
              Details for the panel
            </h3>
            <p className="text-[10.5px] text-slate-400 mt-0.5 mb-2.5 ml-[26px]">Shown to panel members in My Interviews — instructions and what to evaluate.</p>

            <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Instructions from HR</label>
            <textarea
              rows={2}
              value={form.instructions}
              onChange={e => setForm({ ...form, instructions: e.target.value })}
              placeholder="Anything specific the panel should probe…"
              className="w-full rounded-[7px] border border-slate-300 bg-white px-2.5 py-2 text-[11.5px] text-slate-800 outline-none resize-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15"
            />

            <label className="block text-[10px] font-extrabold text-slate-500 mb-1 mt-2.5">Evaluation areas</label>
            <div className="flex flex-wrap gap-1.5">
              {form.evaluationAreas.map(a => (
                <span key={a} className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10.5px] font-bold text-violet-700">
                  {a}
                  <button onClick={() => setForm({ ...form, evaluationAreas: form.evaluationAreas.filter(x => x !== a) })} className="text-violet-400 hover:text-red-500">
                    <FiX className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <span className="inline-flex items-center">
                <input
                  value={evalAreaText}
                  onChange={e => setEvalAreaText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && evalAreaText.trim()) {
                      e.preventDefault();
                      if (!form.evaluationAreas.includes(evalAreaText.trim())) setForm({ ...form, evaluationAreas: [...form.evaluationAreas, evalAreaText.trim()] });
                      setEvalAreaText('');
                    }
                  }}
                  placeholder="Add area + Enter…"
                  className="h-[26px] rounded-[7px] border border-dashed border-slate-300 bg-white px-2 text-[10.5px] text-slate-600 outline-none w-[140px] focus:border-green-500"
                />
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Round</label>
                <select value={form.roundOverride} onChange={e => setForm({ ...form, roundOverride: e.target.value })} className={INPUT_CLS}>
                  <option value="">Auto — Round {autoRound}{planTotal > 0 ? ` (from plan)` : ''}</option>
                  {Array.from({ length: Math.max(planTotal, 5) }, (_, i) => i + 1).map(r => <option key={r} value={r}>Round {r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 mb-1">Panel lead</label>
                <select value={panelLeadId} onChange={e => setPanelLeadId(e.target.value)} className={INPUT_CLS} disabled={selectedPanelIds.length === 0}>
                  <option value="">None</option>
                  {panelMembers.filter(m => selectedPanelIds.includes(m.userId)).map(m => (
                    <option key={m.userId} value={m.userId}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        </div>

        {/* live validation footer */}
        <div className="border-t border-slate-200 py-2.5 flex flex-col gap-2 bg-white shrink-0" style={{ padding: '11px 18px' }}>
          {pastDate ? (
            <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-red-600">
              <FiClock className="w-3.5 h-3.5 shrink-0" /> Date is in the past — pick a future date.
            </p>
          ) : !selectedAppId ? (
            <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-slate-500">
              <FiCalendar className="w-3.5 h-3.5 shrink-0" /> Pick a candidate to begin.
            </p>
          ) : sameSlotConflict ? (
            <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-700">
              <FiClock className="w-3.5 h-3.5 shrink-0" /> Candidate already has an interview on this date — complete or cancel it first.
            </p>
          ) : (
            <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-green-700">
              <FiCheck className="w-3.5 h-3.5 shrink-0" />
              No conflicts — candidate is free{panelMembers.length > 0 && `, ${panelMembers.filter(m => selectedPanelIds.includes(m.userId) && m.availability === 'Available').length} of ${selectedPanelIds.length} selected panel available`}.
              {unavailableSelected.length > 0 && <span className="text-amber-700">Remove busy members before scheduling.</span>}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className={BTN_GHOST}>Cancel</button>
            <button onClick={handleSchedule} disabled={scheduling} className={BTN_PRI}>
              <FiCalendar className="w-3.5 h-3.5" /> {scheduling ? 'Scheduling…' : 'Schedule Interview'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
