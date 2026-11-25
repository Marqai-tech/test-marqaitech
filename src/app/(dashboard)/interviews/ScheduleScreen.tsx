'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Schedule Interview — FULL-PAGE sub-tab (replaces the old right-side drawer).

   Why a page: scheduling needs four decisions (candidate → panel → time →
   details) plus a panel list with full conflict info. A dedicated sub-tab
   inside the Scheduled Interviews screen gives all of that room — no cramped
   side drawer, no modal.

   Department is AUTO-SELECTED from the candidate's job posting and shown
   read-only; the panel list is the employees of that department (their
   availability — including WHICH interview blocks them — is checked live).

   Removed per HR request: Evaluation areas, Round override, Panel lead.
   The round stays fully automatic (from the job's interview plan).

   Endpoints (unchanged):
     GET  /api/recruitment?limit=200              applicants (via job postings)
     GET  /api/interviews/panel-availability      availability + conflicts
     POST /api/interviews                         schedule (round auto-computed)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState, useCallback } from 'react';
import { FiCalendar, FiClock, FiSearch, FiCheck, FiArrowLeft, FiVideo, FiMapPin } from 'react-icons/fi';
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

const INPUT_CLS = 'h-[36px] w-full rounded-[8px] border border-slate-300 bg-white px-3 text-[12.5px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/15';
const LABEL_CLS = 'block text-[10.5px] font-extrabold uppercase tracking-[0.5px] text-slate-500 mb-1';
const BTN_PRI = 'inline-flex items-center justify-center gap-1.5 h-[36px] px-4 rounded-[9px] bg-green-600 text-white text-[12.5px] font-bold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
const BTN_GHOST = 'inline-flex items-center justify-center gap-1.5 h-[36px] px-3.5 rounded-[9px] bg-white border border-slate-300 text-slate-600 text-[12.5px] font-bold hover:bg-slate-50 transition shrink-0';
const AVAIL_CLS: Record<string, string> = {
  Available: 'bg-green-50 text-green-700 border-green-200',
  Busy: 'bg-amber-50 text-amber-700 border-amber-200',
  'On Leave': 'bg-red-50 text-red-600 border-red-200',
  Tentative: 'bg-blue-50 text-blue-700 border-blue-200',
  'No Date Set': 'bg-slate-100 text-slate-500 border-slate-200',
};

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

export default function ScheduleScreen({
  interviews, onScheduled, onBack,
}: {
  /** Current interview list — used for the plan rail (completed rounds) and the same-slot conflict check. */
  interviews: InterviewLite[];
  onScheduled: () => void;
  onBack: () => void;
}) {
  /* ── data ── */
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [panelMembers, setPanelMembers] = useState<PanelEmployee[]>([]);

  /* ── selection / form ── */
  const [applicantSearch, setApplicantSearch] = useState('');
  const [showApplicantDropdown, setShowApplicantDropdown] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [panelSearch, setPanelSearch] = useState('');
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    type: 'technical', date: '', time: '10:00', duration: 60, mode: 'online',
    location: '', meetingUrl: '', confirmationDeadline: '', feedbackDeadline: '',
    instructions: '',
  });
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const selectedApp = applicants.find(a => a.id === selectedAppId) || null;
  const plan = parsePlan(selectedApp?.jobPosting?.interviewPlan);
  const planTotal = plan.length;

  /* ── DEPARTMENT: auto-selected from the job, read-only ── */
  const selectedAppDept = selectedApp?.jobPosting?.department?.id || '';
  const selectedAppDeptName = selectedApp?.jobPosting?.department?.name || '';

  /* Completed rounds for the selected candidate (for the plan rail). */
  const candidateInterviews = selectedAppId
    ? interviews.filter(i => i.jobApplicationId === selectedAppId)
    : [];
  const doneRounds = candidateInterviews
    .filter(i => i.status === 'completed')
    .map(i => Number(i.round || 0));
  const activeInterview = candidateInterviews.find(i => i.status === 'scheduled');
  const autoRound = Math.max(0, ...doneRounds) + 1;

  /* ── fetchers ── */
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
    queueMicrotask(() => fetchApplicants());
  }, [fetchApplicants]);

  useEffect(() => {
    if (selectedAppDept) queueMicrotask(() => fetchPanelAvailability());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppDept, form.date, form.time, form.duration, form.type]);

  const handleSelectApplicant = (appId: string) => {
    setSelectedAppId(appId);
    setShowApplicantDropdown(false);
    setApplicantSearch('');
    setSelectedPanelIds([]);
    const app = applicants.find(a => a.id === appId);
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
          confirmationDeadline: form.confirmationDeadline || undefined,
          feedbackDeadline: form.feedbackDeadline || undefined,
          instructions: form.instructions || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to schedule interview');
      toast.success(`Interview scheduled — Round ${data.round || autoRound}. Panel notified; the candidate is emailed once every interviewer accepts.`);
      onScheduled();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule interview');
    } finally {
      setScheduling(false);
    }
  };

  const filteredPanel = panelMembers.filter(m =>
    !panelSearch || m.name.toLowerCase().includes(panelSearch.toLowerCase()) || m.email.toLowerCase().includes(panelSearch.toLowerCase())
  );

  const stepDone = {
    candidate: !!selectedAppId,
    panel: selectedPanelIds.length > 0,
    schedule: !!form.date && !pastDate,
  };

  return (
    <div className="flex flex-col gap-3" style={{ minHeight: 'calc(100vh - 8rem)' }}>
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-green-700 transition mb-1">
            <FiArrowLeft className="w-3.5 h-3.5" /> Back to Scheduled Interviews
          </button>
          <h1 className="text-[19px] font-bold text-slate-900 tracking-tight">Schedule Interview</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Department and round are automatic. Panel availability and conflicts are checked live — full conflict details are shown before you book.
          </p>
        </div>
      </div>

      {/* step rail */}
      <div className="flex gap-2 pt-1">
        {[
          { key: 'candidate', label: '1 · Candidate' },
          { key: 'panel', label: '2 · Panel (from job department)' },
          { key: 'schedule', label: '3 · Schedule' },
          { key: 'details', label: '4 · Details' },
        ].map(s => {
          const done = stepDone[s.key as keyof typeof stepDone];
          return (
            <div key={s.key} className="flex-1">
              <div className={`h-1.5 rounded-full ${done ? 'bg-green-500' : 'bg-slate-200'}`} />
              <span className={`block mt-1.5 text-[10px] font-extrabold tracking-wide ${done ? 'text-green-700' : 'text-slate-400'}`}>{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* body — wide two-column layout */}
      <div className="grid gap-3 lg:grid-cols-2 flex-1">
        {/* ── LEFT column: candidate + panel ── */}
        <div className="flex flex-col gap-3">
          {/* 1 · candidate */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <h3 className="text-[13px] font-extrabold text-slate-800 flex items-center gap-2 mb-1">
              <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-extrabold ${stepDone.candidate ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {stepDone.candidate ? <FiCheck className="w-3 h-3" /> : '1'}
              </span>
              Candidate
            </h3>
            <p className="text-[11px] text-slate-400 mb-3 ml-[30px]">Picked from active pipelines — department, round, and plan come from the job automatically.</p>

            {selectedApp ? (
              <div className="flex items-center gap-3 rounded-[10px] border border-green-200 bg-green-50 px-3.5 py-3">
                <div className="flex-1 min-w-0">
                  <b className="block text-[13.5px] font-extrabold text-slate-800 truncate">{selectedApp.candidateName}</b>
                  <span className="block text-[11px] text-slate-500 truncate mt-0.5">
                    {selectedApp.candidateEmail} · {selectedApp.jobPosting?.title || '—'} · {selectedApp.status ? selectedApp.status.replace(/_/g, ' ') : ''}
                    {activeInterview ? ' · has an active interview' : ''}
                  </span>
                </div>
                <button
                  onClick={() => { setSelectedAppId(''); setSelectedPanelIds([]); setShowApplicantDropdown(true); }}
                  className="shrink-0 h-[30px] px-3 rounded-[8px] border border-slate-300 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  value={applicantSearch}
                  onChange={e => { setApplicantSearch(e.target.value); setShowApplicantDropdown(true); }}
                  onFocus={() => setShowApplicantDropdown(true)}
                  placeholder="Search candidate by name or email…"
                  className={INPUT_CLS + ' pl-9'}
                />
                {showApplicantDropdown && (
                  <div className="absolute z-10 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-[10px] border border-slate-200 bg-white shadow-lg">
                    {applicants
                      .filter(a => {
                        const s = applicantSearch.toLowerCase();
                        return !s || (a.candidateName || '').toLowerCase().includes(s) || (a.candidateEmail || '').toLowerCase().includes(s);
                      })
                      .slice(0, 40)
                      .map(a => (
                        <button
                          key={a.id}
                          onClick={() => handleSelectApplicant(a.id)}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-green-50 border-b border-slate-100 last:border-0"
                        >
                          <p className="text-[12.5px] font-bold text-slate-800">{a.candidateName}</p>
                          <p className="text-[10.5px] text-slate-400">{a.candidateEmail} · {a.jobPosting?.title || '—'}</p>
                        </button>
                      ))}
                    {applicants.length === 0 && <p className="px-3.5 py-4 text-[12px] text-slate-400">Loading candidates…</p>}
                  </div>
                )}
              </div>
            )}

            {/* AUTO-SELECTED DEPARTMENT — read-only, straight from the job */}
            <div className={`mt-3 rounded-[10px] border px-3.5 py-2.5 flex items-center gap-2.5 ${selectedAppDept ? 'border-teal-200 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}>
              <span className={`w-[22px] h-[22px] rounded-[7px] flex items-center justify-center text-[10px] font-extrabold shrink-0 ${selectedAppDept ? 'bg-teal-600 text-white' : 'bg-slate-300 text-white'}`}>
                <FiMapPin className="w-3 h-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[9.5px] font-extrabold uppercase tracking-[0.6px] text-teal-700">Department — auto-selected from the job</p>
                <p className={`text-[12.5px] font-bold truncate ${selectedAppDept ? 'text-slate-800' : 'text-slate-400'}`}>
                  {selectedAppDept ? selectedAppDeptName || 'Selected' : 'No department on this job'}
                </p>
              </div>
              {selectedAppDept && <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-teal-300 bg-white px-1.5 py-0.5 text-[9.5px] font-extrabold text-teal-700"><FiCheck className="w-2.5 h-2.5" /> AUTO</span>}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Panel members below come from this department — no dropdown needed.</p>

            {/* plan rail */}
            {selectedApp && planTotal > 0 && (
              <div className="flex gap-1.5 mt-3">
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
              <p className="text-[10.5px] text-slate-400 mt-2">This job has no interview plan — the round number will be computed automatically.</p>
            )}
          </section>

          {/* 2 · panel */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <h3 className="text-[13px] font-extrabold text-slate-800 flex items-center gap-2 mb-1">
              <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-extrabold ${stepDone.panel ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {stepDone.panel ? <FiCheck className="w-3 h-3" /> : '2'}
              </span>
              Panel — {selectedAppDeptName || 'job department'} employees
              <span className="ml-auto text-[11px] font-bold text-green-700">
                {selectedPanelIds.length} selected · {panelMembers.length > 0 ? `${panelMembers.filter(m => m.availability === 'Available').length}/${panelMembers.length} available` : '—'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mb-3 ml-[30px]">
              Availability is checked against their interview calendar — if someone is busy, you see exactly which interview blocks them (candidate, date, time).
            </p>

            {!selectedApp && <p className="text-[12px] text-slate-400">Pick a candidate first — the panel list comes from the job&apos;s department automatically.</p>}
            {selectedApp && (
              <>
                <div className="relative mb-2.5">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input value={panelSearch} onChange={e => setPanelSearch(e.target.value)} placeholder="Search employees…" className={INPUT_CLS + ' pl-9'} />
                </div>
                {loadingPanel && <p className="text-[12px] text-slate-400 py-3 text-center">Checking availability…</p>}
                {!loadingPanel && filteredPanel.length === 0 && (
                  <p className="text-[12px] text-slate-400 py-3 text-center">
                    No employees found in <b>{selectedAppDeptName || 'this department'}</b>. Add employees to this department and they will appear here automatically.
                  </p>
                )}
                <div className="max-h-[420px] overflow-y-auto pr-0.5">
                  {filteredPanel.map(m => {
                    const busy = m.availability === 'Busy' || m.availability === 'On Leave';
                    const checked = selectedPanelIds.includes(m.userId);
                    return (
                      <div key={m.userId} className={`rounded-[10px] border px-3 py-2.5 mb-2 transition ${busy ? 'border-amber-200 bg-amber-50' : checked ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white hover:border-green-300'}`}>
                        <button
                          onClick={() => {
                            if (busy) { toast.error(`${m.name} is ${m.availability} — ${m.reason || 'unavailable at this slot'}`); return; }
                            setSelectedPanelIds(checked ? selectedPanelIds.filter(id => id !== m.userId) : [...selectedPanelIds, m.userId]);
                          }}
                          className="w-full flex items-center gap-3 text-left"
                        >
                          <span className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 ${checked ? 'bg-green-600 border-green-600 text-white' : 'border-slate-300 bg-white'}`}>
                            {checked && <FiCheck className="w-3 h-3" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <b className="block text-[12.5px] font-bold text-slate-800 truncate">{m.name}</b>
                            <span className="block text-[10.5px] text-slate-400 truncate">{m.designation} · {m.email}</span>
                          </div>
                          <span className={`inline-flex rounded-[6px] border px-2 py-0.5 text-[10px] font-extrabold shrink-0 ${AVAIL_CLS[m.availability] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {m.availability}{m.availability === 'Busy' && m.conflictTime ? ` · ${m.conflictTime}` : ''}
                          </span>
                        </button>
                        {/* FULL conflict info — HR sees exactly which interview blocks this employee */}
                        {busy && m.reason && (
                          <div className="mt-2 ml-[30px] rounded-[8px] border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-[10.5px] text-amber-800 leading-relaxed">
                            <b>Already booked{m.conflictTime ? ` (${m.conflictTime})` : ''}:</b> {m.reason} — pick another time or another panel member; HR cannot double-book.
                          </div>
                        )}
                        {!busy && m.availability === 'No Date Set' && (
                          <div className="mt-2 ml-[30px] text-[10px] text-slate-400">Pick a date to check live availability.</div>
                        )}
                        {!busy && m.availability === 'Tentative' && m.reason && (
                          <div className="mt-2 ml-[30px] text-[10.5px] text-blue-700">{m.reason}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>

        {/* ── RIGHT column: schedule + details ── */}
        <div className="flex flex-col gap-3">
          {/* 3 · schedule */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <h3 className="text-[13px] font-extrabold text-slate-800 flex items-center gap-2 mb-1">
              <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-extrabold ${stepDone.schedule ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {stepDone.schedule ? <FiCheck className="w-3 h-3" /> : '3'}
              </span>
              Schedule
              <span className="ml-auto text-[11px] font-bold text-slate-400">Round {autoRound}{planTotal > 0 ? ` of ${planTotal}` : ''} — automatic</span>
            </h3>
            <p className={`text-[11px] mb-3 ml-[30px] ${sameSlotConflict ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
              {sameSlotConflict
                ? 'This candidate already has a scheduled interview on this date — the API will reject a same-slot duplicate.'
                : 'Candidate has no other scheduled interview on this day.'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Date <span className="text-red-500">*</span></label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={INPUT_CLS + (pastDate ? ' border-red-400' : '')} />
              </div>
              <div>
                <label className={LABEL_CLS}>Time <span className="text-red-500">*</span></label>
                <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Duration</label>
                <select value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} className={INPUT_CLS}>
                  {[30, 45, 60, 90].map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Mode</label>
                <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} className={INPUT_CLS}>
                  <option value="online">Video</option>
                  <option value="onsite">Onsite</option>
                  <option value="phone">Phone</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className={LABEL_CLS}>{form.mode === 'onsite' ? 'Location' : 'Meeting link'}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {form.mode === 'onsite' ? <FiMapPin className="w-3.5 h-3.5" /> : <FiVideo className="w-3.5 h-3.5" />}
                  </span>
                  <input
                    value={form.mode === 'onsite' ? form.location : form.meetingUrl}
                    onChange={e => setForm(form.mode === 'onsite' ? { ...form, location: e.target.value } : { ...form, meetingUrl: e.target.value })}
                    placeholder={form.mode === 'onsite' ? 'e.g. Bengaluru HQ, Floor 4' : 'https://meet.google.com/…'}
                    className={INPUT_CLS + ' pl-8'}
                  />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Panel confirm by</label>
                <input type="datetime-local" value={form.confirmationDeadline} onChange={e => setForm({ ...form, confirmationDeadline: e.target.value })} className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Feedback due by</label>
                <input type="datetime-local" value={form.feedbackDeadline} onChange={e => setForm({ ...form, feedbackDeadline: e.target.value })} className={INPUT_CLS} />
              </div>
            </div>
          </section>

          {/* 4 · details */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
            <h3 className="text-[13px] font-extrabold text-slate-800 flex items-center gap-2 mb-1">
              <span className="w-[22px] h-[22px] rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[11px] font-extrabold">4</span>
              Details for the panel
            </h3>
            <p className="text-[11px] text-slate-400 mb-3 ml-[30px]">Shown to panel members in My Interviews — what this round should cover.</p>
            <label className={LABEL_CLS}>Instructions from HR</label>
            <textarea
              rows={4}
              value={form.instructions}
              onChange={e => setForm({ ...form, instructions: e.target.value })}
              placeholder="Anything specific the panel should probe…"
              className="w-full rounded-[8px] border border-slate-300 bg-white px-3 py-2 text-[12.5px] text-slate-800 outline-none resize-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15"
            />
            <div className="mt-3 rounded-[10px] border border-blue-200 bg-blue-50 px-3 py-2.5 text-[11px] text-blue-800 leading-relaxed">
              <b>What happens after you schedule:</b> every selected panel member is invited to accept. The candidate is emailed only after <b>all</b> interviewers accept — until then the interview shows &quot;Panel acceptance pending X of Y&quot; on the Scheduled Interviews screen.
            </div>
          </section>

          {/* live validation + submit */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-col gap-2.5">
            {pastDate ? (
              <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] font-semibold text-red-600">
                <FiClock className="w-4 h-4 shrink-0" /> Date is in the past — pick a future date.
              </p>
            ) : !selectedAppId ? (
              <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11.5px] font-semibold text-slate-500">
                <FiCalendar className="w-4 h-4 shrink-0" /> Pick a candidate to begin.
              </p>
            ) : sameSlotConflict ? (
              <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-700">
                <FiClock className="w-4 h-4 shrink-0" /> Candidate already has an interview on this date — complete or cancel it first.
              </p>
            ) : (
              <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-[11.5px] font-semibold text-green-700">
                <FiCheck className="w-4 h-4 shrink-0" />
                No conflicts — candidate is free{panelMembers.length > 0 && `, ${panelMembers.filter(m => selectedPanelIds.includes(m.userId) && m.availability === 'Available').length} of ${selectedPanelIds.length} selected panel available`}.
                {unavailableSelected.length > 0 && <span className="text-amber-700">Remove busy members before scheduling.</span>}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={onBack} className={BTN_GHOST}>Cancel</button>
              <button onClick={handleSchedule} disabled={scheduling} className={BTN_PRI}>
                <FiCalendar className="w-4 h-4" /> {scheduling ? 'Scheduling…' : 'Schedule Interview'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
