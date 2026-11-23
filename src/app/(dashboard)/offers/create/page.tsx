'use client';

/**
 * CREATE OFFER — mock-approved Offer Management screen 2 (2026-11).
 *
 * Five short steps — nothing is sent until you review everything in step 5:
 *   1 Select Candidate  (only pipeline candidates marked "Offered" + manual option)
 *   2 Pick Template     (active templates + blank)
 *   3 Compensation      (CTC, fixed / variable / bonus)
 *   4 Terms             (joining date, probation, reporting manager)
 *   5 Review & Send     (summary + approval chain → Save Draft / Send for Approval)
 *
 * Forward-only: you can go Back within the wizard, but once submitted the
 * offer follows the approval chain — there is no return to draft.
 *
 * URL entry points:
 *   /offers/create                          fresh wizard
 *   /offers/create?candidateName=…&email=…  pre-filled from recruitment pipeline
 *   /offers/create?edit=<offerId>           continue a draft (PATCH on save)
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FiPlus, FiCheck, FiInfo, FiArrowRight, FiArrowLeft, FiAlertTriangle,
  FiUser, FiFileText, FiSearch, FiClock, FiSend, FiSave, FiCheckCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface PipelineCandidate {
  id: string; name: string; email: string; position: string; department: string;
}
interface TemplateRow {
  id: string; name: string; country: string; language: string; isActive: boolean;
}
interface WfLevel { tier: number; approverType: string; label: string; }
interface WfRules { salaryThreshold?: number; approvalReminderDays?: number; offerExpiryDays?: number; }
interface OfferRow {
  id: string; candidateName: string; candidateEmail: string; position: string; department?: string | null;
  offeredSalary: number; offeredCurrency?: string; offeredCTC?: number | null; salaryBreakdown?: string | null;
  joiningDate: string; probationPeriod?: number; reportingTo?: string | null; jobApplicationId?: string | null;
  templateId?: string | null;
}

interface Picked {
  name: string; email: string; position: string; department: string;
  jobApplicationId: string | null; manual: boolean;
}

const STEPS = [
  { n: 1, t: 'Select Candidate', s: 'From your pipeline' },
  { n: 2, t: 'Pick Template', s: 'Or start blank' },
  { n: 3, t: 'Compensation', s: 'CTC & breakdown' },
  { n: 4, t: 'Terms', s: 'Joining & probation' },
  { n: 5, t: 'Review & Send', s: 'Approvals & dispatch' },
];

const APPRover_ROLE_LABEL: Record<string, string> = {
  hr_admin: 'HR Admin', hr_manager: 'HR Manager', company_hr_admin: 'HR Manager',
  finance: 'Finance / Budget', ceo: 'CEO', director: 'Director', admin: 'Admin', tenant_admin: 'Tenant Admin',
};

function initials(name: string) {
  return (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const inputCls = 'w-full h-[34px] px-2.5 rounded-lg border border-slate-300 text-[12.5px] bg-white focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15';
const labelCls = 'block text-[10.5px] font-bold text-slate-600 mb-1 tracking-wide';

export default function CreateOfferPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // step 1
  const [candidates, setCandidates] = useState<PipelineCandidate[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [candSearch, setCandSearch] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: '', email: '', position: '', department: '' });

  // step 2
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState<string>('blank');

  // step 3
  const [ctc, setCtc] = useState('');
  const [fixedPay, setFixedPay] = useState('');
  const [variablePay, setVariablePay] = useState('');
  const [bonus, setBonus] = useState('');
  const [currency, setCurrency] = useState('INR');

  // step 4
  const [joiningDate, setJoiningDate] = useState('');
  const [probation, setProbation] = useState('90');
  const [reportingTo, setReportingTo] = useState('');

  // step 5
  const [wfLevels, setWfLevels] = useState<WfLevel[]>([]);
  const [wfRules, setWfRules] = useState<WfRules>({});

  const loadAll = useCallback(async () => {
    // Candidates: applications already marked 'offered' in the pipeline.
    try {
      setLoadingCandidates(true);
      const [appsRes, offersRes] = await Promise.all([
        fetch('/api/recruitment?limit=100', { headers: getAuthHeaders() }),
        fetch('/api/offers?limit=200', { headers: getAuthHeaders() }),
      ]);
      const jobs = appsRes.ok ? await appsRes.json() : {};
      const postings: Array<{ title?: string; department?: { name?: string }; applications?: Array<{ id: string; candidateName: string; candidateEmail: string; status: string }> }> =
        Array.isArray(jobs) ? jobs : (jobs.jobPostings || jobs.jobs || []);
      const list: PipelineCandidate[] = [];
      for (const job of postings) {
        for (const app of (job.applications || [])) {
          if (app.status === 'offered') {
            list.push({
              id: app.id,
              name: app.candidateName || '',
              email: app.candidateEmail || '',
              position: job.title || '',
              department: job.department?.name || '—',
            });
          }
        }
      }
      setCandidates(list);
      // Hide candidates that already have an offer (no accidental duplicates).
      const offers = offersRes.ok ? await offersRes.json() : {};
      const rows: OfferRow[] = offers?.offers || [];
      setExcludedIds(new Set(rows.map(r => r.jobApplicationId).filter(Boolean) as string[]));
    } catch {
      toast.error('Could not load pipeline candidates — use manual entry below');
    } finally {
      setLoadingCandidates(false);
    }
    // Templates
    try {
      const res = await fetch('/api/offers/templates', { headers: getAuthHeaders() });
      const data = res.ok ? await res.json() : { templates: [] };
      setTemplates((data.templates || []).filter((t: TemplateRow) => t.isActive));
    } catch { /* templates optional — blank is always available */ }
    // Approval chain for step 5
    try {
      const res = await fetch('/api/offers/workflow-config', { headers: getAuthHeaders() });
      const data = res.ok ? await res.json() : null;
      if (data?.config) {
        setWfLevels(data.config.levels || []);
        setWfRules(data.config.rules || {});
      }
    } catch { /* defaults shown instead */ }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Entry points: ?edit=<offerId> (continue draft) or ?candidateName=… (from pipeline)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    queueMicrotask(() => {
      const p = new URLSearchParams(window.location.search);
      const edit = p.get('edit');
      if (edit) {
        setEditId(edit);
        (async () => {
          try {
            const res = await fetch(`/api/offers/${edit}`, { headers: getAuthHeaders() });
            if (!res.ok) throw new Error('Offer not found');
            const data = await res.json();
            const o: OfferRow = data.offer || data;
            setPicked({
              name: o.candidateName || '', email: o.candidateEmail || '',
              position: o.position || '', department: o.department || '',
              jobApplicationId: o.jobApplicationId || null, manual: !o.jobApplicationId,
            });
            if (o.offeredCTC) setCtc(String(o.offeredCTC)); else if (o.offeredSalary) setCtc(String(o.offeredSalary));
            if (o.offeredCurrency) setCurrency(o.offeredCurrency);
            try {
              const bd = o.salaryBreakdown ? JSON.parse(o.salaryBreakdown) : {};
              if (bd.fixedPay) setFixedPay(String(bd.fixedPay));
              if (bd.variablePay) setVariablePay(String(bd.variablePay));
              if (bd.bonus) setBonus(String(bd.bonus));
            } catch { /* free-text breakdown — ignore */ }
            if (o.joiningDate) setJoiningDate(new Date(o.joiningDate).toISOString().slice(0, 10));
            if (o.probationPeriod != null) setProbation(String(o.probationPeriod));
            if (o.reportingTo) setReportingTo(o.reportingTo);
            if (o.templateId) setTemplateId(o.templateId);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not load the draft');
            router.replace('/offers');
          }
        })();
        return;
      }
      const name = p.get('candidateName');
      const email = p.get('candidateEmail');
      const pos = p.get('position');
      const appId = p.get('jobApplicationId');
      if (name || email || appId) {
        setPicked({ name: name || '', email: email || '', position: pos || '', department: '', jobApplicationId: appId, manual: !appId });
      }
    });
  }, [router]);

  const filteredCandidates = useMemo(() => {
    const q = candSearch.trim().toLowerCase();
    return candidates
      .filter(c => !excludedIds.has(c.id))
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.position.toLowerCase().includes(q));
  }, [candidates, candSearch, excludedIds]);

  const numeric = (s: string) => (s === '' ? 0 : Number(s));
  const ctcNum = numeric(ctc);
  const aboveThreshold = wfRules.salaryThreshold ? ctcNum > wfRules.salaryThreshold : false;

  /* step gating — every Continue validates its own step */
  const canContinue = (s: number): boolean => {
    if (s === 1) return !!picked && picked.name.trim() !== '' && picked.position.trim() !== '' && picked.email.trim() !== '';
    if (s === 2) return templateId !== '';
    if (s === 3) return ctcNum > 0;
    if (s === 4) return joiningDate !== '';
    return true;
  };
  const go = (n: number) => {
    if (n > step && !canContinue(step)) { toast.error('Complete this step first'); return; }
    setStep(n);
    document.querySelector('.wbody')?.scrollTo({ top: 0 });
  };

  const buildPayload = (freshId: string) => {
    const breakdown: Record<string, unknown> = {};
    if (numeric(fixedPay) > 0) breakdown.fixedPay = numeric(fixedPay);
    if (numeric(variablePay) > 0) breakdown.variablePay = numeric(variablePay);
    if (numeric(bonus) > 0) breakdown.joiningBonus = numeric(bonus);
    return {
      candidateId: picked?.jobApplicationId || freshId,
      jobApplicationId: picked?.jobApplicationId || undefined,
      candidateName: picked?.name || '',
      candidateEmail: picked?.email || '',
      position: picked?.position || '',
      department: picked?.department || '',
      offeredSalary: ctcNum,
      offeredCurrency: currency,
      offeredCTC: ctcNum,
      salaryBreakdown: Object.keys(breakdown).length ? JSON.stringify(breakdown) : '',
      joiningDate: joiningDate ? new Date(joiningDate).toISOString() : '',
      probationPeriod: numeric(probation),
      reportingTo: reportingTo || '',
      templateId: templateId !== 'blank' ? templateId : undefined,
    };
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const payload = buildPayload(`candidate-${Date.now()}`);
      if (editId) {
        const res = await fetch(`/api/offers/${editId}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(payload) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed'); }
        toast.success('Draft saved');
      } else {
        const res = await fetch('/api/offers', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed'); }
        toast.success('Offer saved as draft — find it under All Offers');
      }
      router.push('/offers');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const sendForApproval = async () => {
    setSaving(true);
    try {
      let offerId = editId;
      const payload = buildPayload(`candidate-${Date.now()}`);
      if (editId) {
        const res = await fetch(`/api/offers/${editId}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(payload) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed'); }
      } else {
        const res = await fetch('/api/offers', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Create failed'); }
        const d = await res.json();
        offerId = d.offer?.id || d.id || null;
      }
      if (!offerId) throw new Error('Could not determine the created offer');
      const res = await fetch(`/api/offers/${offerId}/submit-approval`, { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Submit for approval failed — the offer was saved, submit it from All Offers');
      }
      toast.success('Offer submitted for approval');
      router.push('/offers');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmManual = () => {
    if (!manual.name.trim() || !manual.position.trim() || !manual.email.trim()) {
      toast.error('Name, email and position are required'); return;
    }
    setPicked({ ...manual, jobApplicationId: null, manual: true });
    setManualOpen(false);
    toast.success('Candidate added');
  };

  const selectedTemplate = templates.find(t => t.id === templateId);
  const approverLabel = (t: string) => APPRover_ROLE_LABEL[t] || t.replace(/_/g, ' ');

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{editId ? 'Continue Draft' : 'Create Offer'}</h1>
          <p className="text-xs text-slate-500 mt-1">Five short steps — nothing is sent until you review everything in step 5</p>
        </div>
        <Link href="/offers/dashboard" className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5">✕ Cancel</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-3 items-start">
        {/* Rail */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex lg:flex-col flex-row lg:overflow-x-visible overflow-x-auto gap-1.5">
          <p className="hidden lg:block text-[9.5px] font-extrabold tracking-wider text-slate-400 px-2 pb-2">CREATE OFFER</p>
          {STEPS.map((s, i) => (
            <div key={s.n} className="contents">
              <button
                onClick={() => go(s.n)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left flex-shrink-0 lg:w-full transition-colors ${step === s.n ? 'bg-green-50' : 'hover:bg-slate-50'}`}
              >
                <span className={`w-[26px] h-[26px] rounded-full border-2 grid place-items-center text-[11px] font-extrabold flex-shrink-0 ${step === s.n ? 'border-green-600 bg-green-600 text-white' : step > s.n ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-200 text-slate-400'}`}>
                  {step > s.n ? <FiCheck className="w-3.5 h-3.5" /> : s.n}
                </span>
                <span className="min-w-0">
                  <b className={`block text-[12px] leading-tight ${step === s.n ? 'text-green-800' : 'text-slate-700'}`}>{s.t}</b>
                  <small className="block text-[9.5px] text-slate-400 font-semibold leading-tight">{s.s}</small>
                </span>
              </button>
              {i < STEPS.length - 1 && <div className="hidden lg:block w-0.5 h-3 bg-slate-200 ml-[23px]" />}
            </div>
          ))}
        </div>

        {/* Panes */}
        <div className="flex flex-col gap-3 min-w-0">
          {/* STEP 1 — candidate */}
          {step === 1 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2.5 flex-wrap">
                <b className="text-[13.5px] text-slate-900">Who are you offering to?</b>
                <small className="text-[11px] text-slate-400">candidates marked “Offered” in your pipeline</small>
                <span className="ml-auto text-[10px] font-extrabold tracking-wider text-slate-400">STEP 1 / 5</span>
              </div>
              <div className="p-4 flex flex-col gap-3 overflow-y-auto">
                {/* URL-prefilled or manual pick summary */}
                {picked && picked.manual && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 flex items-center gap-2.5">
                    <div className="w-[34px] h-[34px] rounded-full bg-green-600 text-white grid place-items-center text-[11px] font-extrabold flex-shrink-0">{initials(picked.name)}</div>
                    <div className="min-w-0 flex-1">
                      <b className="block text-[12.5px] text-slate-900">{picked.name}</b>
                      <small className="block text-[10.5px] text-slate-500">{picked.position} · {picked.email}</small>
                    </div>
                    <button onClick={() => setPicked(null)} className="text-[11px] font-bold text-slate-500 hover:text-slate-800">Change</button>
                  </div>
                )}
                <div className="relative">
                  <FiSearch className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input value={candSearch} onChange={e => setCandSearch(e.target.value)} placeholder="Search pipeline candidates by name or position…" className={`${inputCls} pl-8`} />
                </div>
                {loadingCandidates ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[64px] rounded-xl border border-slate-200 animate-pulse bg-slate-50" />)}
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
                    <FiUser className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">No Offer-ready candidates</p>
                    <p className="text-[11.5px] text-slate-400 mt-1">Only candidates your team marked “Offered” in interviews appear here — no accidental offers. Or add someone manually.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {filteredCandidates.map(c => {
                      const sel = picked && !picked.manual && picked.jobApplicationId === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setPicked({ name: c.name, email: c.email, position: c.position, department: c.department, jobApplicationId: c.id, manual: false })}
                          className={`relative border-[1.5px] rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors ${sel ? 'border-green-600 bg-green-50 shadow-[0_0_0_2px_rgba(22,163,74,.12)]' : 'border-slate-200 hover:border-green-300'}`}
                        >
                          <div className="w-[34px] h-[34px] rounded-full bg-green-50 text-green-700 grid place-items-center text-[11px] font-extrabold flex-shrink-0">{initials(c.name)}</div>
                          <div className="min-w-0 flex-1">
                            <b className="block text-[12.5px] text-slate-900 truncate">{c.name}</b>
                            <small className="block text-[10.5px] text-slate-500 truncate">{c.position} · {c.department}</small>
                          </div>
                          <span className={`w-[18px] h-[18px] rounded-full border-[1.5px] grid place-items-center text-white text-[10px] font-extrabold flex-shrink-0 ${sel ? 'bg-green-600 border-green-600' : 'border-slate-300'}`}>{sel && <FiCheck className="w-3 h-3" />}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Manual entry */}
                {!picked && (
                  manualOpen ? (
                    <div className="rounded-xl border border-slate-200 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div><label className={labelCls}>Full name <i className="text-red-500 not-italic">*</i></label><input value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} className={inputCls} placeholder="Candidate full name" /></div>
                      <div><label className={labelCls}>Email <i className="text-red-500 not-italic">*</i></label><input type="email" value={manual.email} onChange={e => setManual({ ...manual, email: e.target.value })} className={inputCls} placeholder="candidate@mail.com" /></div>
                      <div><label className={labelCls}>Position <i className="text-red-500 not-italic">*</i></label><input value={manual.position} onChange={e => setManual({ ...manual, position: e.target.value })} className={inputCls} placeholder="Role title" /></div>
                      <div><label className={labelCls}>Department</label><input value={manual.department} onChange={e => setManual({ ...manual, department: e.target.value })} className={inputCls} placeholder="Department" /></div>
                      <div className="sm:col-span-2 flex items-center justify-end gap-2">
                        <button onClick={() => setManualOpen(false)} className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                        <button onClick={confirmManual} className="h-8 px-3 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700">Use this candidate</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setManualOpen(true)} className="self-start text-[11.5px] font-bold text-green-700 hover:underline inline-flex items-center gap-1"><FiPlus className="w-3.5 h-3.5" /> Candidate not in the list? Add manually</button>
                  )
                )}
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><FiInfo className="w-3.5 h-3.5 flex-shrink-0" /> Only candidates who cleared your interview pipeline appear here — no accidental offers.</p>
                <button onClick={() => go(2)} disabled={!canContinue(1)} className="h-8 px-3.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-40 inline-flex items-center gap-1.5">Continue <FiArrowRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          {/* STEP 2 — template */}
          {step === 2 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2.5 flex-wrap">
                <b className="text-[13.5px] text-slate-900">Choose the offer letter template</b>
                <small className="text-[11px] text-slate-400">you can still edit content later in Offer Templates</small>
                <span className="ml-auto text-[10px] font-extrabold tracking-wider text-slate-400">STEP 2 / 5</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5 overflow-y-auto">
                {templates.length === 0 && (
                  <div className="md:col-span-2 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-[12px] text-slate-500">
                    No active templates yet — pick <b>Blank</b>, or create one in <Link href="/offers/templates" className="text-green-700 font-bold hover:underline">Offer Templates</Link> first.
                  </div>
                )}
                {templates.map(t => {
                  const sel = templateId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTemplateId(t.id)}
                      className={`relative border-[1.5px] rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors ${sel ? 'border-green-600 bg-green-50 shadow-[0_0_0_2px_rgba(22,163,74,.12)]' : 'border-slate-200 hover:border-green-300'}`}
                    >
                      <div className="w-[34px] h-[34px] rounded-lg bg-blue-50 text-blue-600 grid place-items-center flex-shrink-0"><FiFileText className="w-4 h-4" /></div>
                      <div className="min-w-0 flex-1">
                        <b className="block text-[12.5px] text-slate-900 truncate">{t.name}</b>
                        <small className="block text-[10.5px] text-slate-500">{t.language?.toUpperCase()} · {t.country === '*' ? 'All countries' : t.country}</small>
                      </div>
                      <span className={`w-[18px] h-[18px] rounded-full border-[1.5px] grid place-items-center text-white text-[10px] font-extrabold flex-shrink-0 ${sel ? 'bg-green-600 border-green-600' : 'border-slate-300'}`}>{sel && <FiCheck className="w-3 h-3" />}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setTemplateId('blank')}
                  className={`relative border-[1.5px] rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors ${templateId === 'blank' ? 'border-green-600 bg-green-50 shadow-[0_0_0_2px_rgba(22,163,74,.12)]' : 'border-slate-200 hover:border-green-300'}`}
                >
                  <div className="w-[34px] h-[34px] rounded-lg bg-slate-100 text-slate-500 grid place-items-center flex-shrink-0"><FiFileText className="w-4 h-4" /></div>
                  <div className="min-w-0 flex-1">
                    <b className="block text-[12.5px] text-slate-900">Blank template</b>
                    <small className="block text-[10.5px] text-slate-500">Start from scratch — recommended only for special cases</small>
                  </div>
                  <span className={`w-[18px] h-[18px] rounded-full border-[1.5px] grid place-items-center text-white text-[10px] font-extrabold flex-shrink-0 ${templateId === 'blank' ? 'bg-green-600 border-green-600' : 'border-slate-300'}`}>{templateId === 'blank' && <FiCheck className="w-3 h-3" />}</span>
                </button>
                <div className="md:col-span-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-[11.5px] text-green-900 flex items-start gap-2">
                  <FiCheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>The candidate’s name, position, CTC and joining date are filled <b>automatically</b> into the letter from steps 1, 3 and 4 — you never retype candidate details.</span>
                </div>
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-2">
                <button onClick={() => go(1)} className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><FiArrowLeft className="w-3.5 h-3.5" /> Back</button>
                <button onClick={() => go(3)} className="h-8 px-3.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 inline-flex items-center gap-1.5">Continue <FiArrowRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          {/* STEP 3 — compensation */}
          {step === 3 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2.5 flex-wrap">
                <b className="text-[13.5px] text-slate-900">Compensation for {picked?.name || 'the candidate'}</b>
                <small className="text-[11px] text-slate-400">{picked?.position}{picked?.department ? ` · ${picked.department}` : ''}</small>
                <span className="ml-auto text-[10px] font-extrabold tracking-wider text-slate-400">STEP 3 / 5</span>
              </div>
              <div className="p-4 flex flex-col gap-3 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className={labelCls}>Offered CTC (per year) <i className="text-red-500 not-italic">*</i></label>
                    <div className="flex">
                      <select value={currency} onChange={e => setCurrency(e.target.value)} className="h-[34px] rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-2 text-[12.5px] font-bold text-slate-600 focus:outline-none">
                        <option value="INR">INR</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="AED">AED</option>
                      </select>
                      <input type="number" min="0" value={ctc} onChange={e => setCtc(e.target.value)} className={`${inputCls} rounded-l-none`} placeholder="e.g. 1800000" />
                    </div>
                  </div>
                  <div><label className={labelCls}>Fixed pay (per year)</label><input type="number" min="0" value={fixedPay} onChange={e => setFixedPay(e.target.value)} className={inputCls} placeholder="optional" /></div>
                  <div><label className={labelCls}>Variable pay (per year)</label><input type="number" min="0" value={variablePay} onChange={e => setVariablePay(e.target.value)} className={inputCls} placeholder="optional" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className={labelCls}>Joining bonus</label><input type="number" min="0" value={bonus} onChange={e => setBonus(e.target.value)} className={inputCls} placeholder="0" /></div>
                  <div>
                    <label className={labelCls}>Monthly (calculated)</label>
                    <div className="h-[34px] px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[12.5px] font-bold text-slate-700 flex items-center">
                      {ctcNum > 0 ? `${currency} ${Math.round(ctcNum / 12).toLocaleString('en-IN')} /mo` : '—'}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Fixed + Variable check</label>
                    <div className="h-[34px] px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[12px] font-semibold flex items-center">
                      {numeric(fixedPay) + numeric(variablePay) > 0
                        ? (numeric(fixedPay) + numeric(variablePay) === ctcNum
                          ? <span className="text-green-700 font-bold">✓ adds up to CTC</span>
                          : <span className="text-amber-700">{currency} {(numeric(fixedPay) + numeric(variablePay)).toLocaleString('en-IN')} — differs from CTC</span>)
                        : '—'}
                    </div>
                  </div>
                </div>
                {aboveThreshold && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-900 flex items-start gap-2">
                    <FiAlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span><b>{currency} {ctcNum.toLocaleString('en-IN')} is above your {currency} {(wfRules.salaryThreshold || 0).toLocaleString('en-IN')} limit</b> — this offer will automatically route to {wfLevels.length > 1 ? approverLabel(wfLevels[1]?.approverType || '') : 'the next approver'} for approval in step 5.</span>
                  </div>
                )}
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-2">
                <button onClick={() => go(2)} className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><FiArrowLeft className="w-3.5 h-3.5" /> Back</button>
                <button onClick={() => go(4)} disabled={!canContinue(3)} className="h-8 px-3.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-40 inline-flex items-center gap-1.5">Continue <FiArrowRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          {/* STEP 4 — terms */}
          {step === 4 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2.5 flex-wrap">
                <b className="text-[13.5px] text-slate-900">Terms &amp; conditions</b>
                <small className="text-[11px] text-slate-400">these go straight into the letter</small>
                <span className="ml-auto text-[10px] font-extrabold tracking-wider text-slate-400">STEP 4 / 5</span>
              </div>
              <div className="p-4 flex flex-col gap-3 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className={labelCls}>Proposed joining date <i className="text-red-500 not-italic">*</i></label><input type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} className={inputCls} /></div>
                  <div>
                    <label className={labelCls}>Probation period</label>
                    <select value={probation} onChange={e => setProbation(e.target.value)} className={inputCls}>
                      <option value="90">3 months (90 days)</option>
                      <option value="180">6 months (180 days)</option>
                      <option value="30">1 month (30 days)</option>
                      <option value="0">No probation</option>
                    </select>
                  </div>
                  <div><label className={labelCls}>Reporting to</label><input value={reportingTo} onChange={e => setReportingTo(e.target.value)} className={inputCls} placeholder="Manager name" /></div>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-[11.5px] text-green-900 flex items-start gap-2">
                  <FiCheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>Probation confirmation criteria and notice rules come from your company policy — HR verifies them automatically, nothing for you to configure here.</span>
                </div>
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-2">
                <button onClick={() => go(3)} className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5"><FiArrowLeft className="w-3.5 h-3.5" /> Back</button>
                <button onClick={() => go(5)} disabled={!canContinue(4)} className="h-8 px-3.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-40 inline-flex items-center gap-1.5">Continue <FiArrowRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          {/* STEP 5 — review & send */}
          {step === 5 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2.5 flex-wrap">
                <b className="text-[13.5px] text-slate-900">Review everything, then send</b>
                <small className="text-[11px] text-slate-400">nothing reaches the candidate until approvals finish</small>
                <span className="ml-auto text-[10px] font-extrabold tracking-wider text-slate-400">STEP 5 / 5</span>
              </div>
              <div className="p-4 flex flex-col gap-3 overflow-y-auto">
                <div className="border border-slate-200 rounded-xl overflow-hidden grid grid-cols-[150px_1fr]">
                  {[
                    ['CANDIDATE', `${picked?.name || '—'} · ${picked?.email || '—'}`],
                    ['POSITION', `${picked?.position || '—'}${picked?.department ? ` · ${picked.department}` : ''}`],
                    ['TEMPLATE', templateId === 'blank' ? 'Blank (write letter before sending)' : selectedTemplate?.name || '—'],
                    ['CTC', `${currency} ${ctcNum.toLocaleString('en-IN')} /yr${numeric(fixedPay) > 0 ? ` · Fixed ${currency} ${numeric(fixedPay).toLocaleString('en-IN')}` : ''}${numeric(variablePay) > 0 ? ` · Variable ${currency} ${numeric(variablePay).toLocaleString('en-IN')}` : ''}`],
                    ['JOINING', `${joiningDate || '—'} · Probation ${numeric(probation) === 0 ? 'none' : `${probation} days`}`],
                    ['REPORTS TO', reportingTo || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 text-[10px] font-extrabold tracking-wider text-slate-500">{k}</div>
                      <div className="px-3 py-2 border-b border-slate-100 text-[12px] font-semibold text-slate-800 truncate">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-[11.5px] text-green-900 flex items-start gap-2">
                  <FiCheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>Auto-checks: <b>candidate selected ✓</b> · <b>{selectedTemplate ? 'template ✓' : 'blank template — add letter content before sending'}</b> · <b>joining date ✓</b></span>
                </div>
                <p className="text-[10px] font-extrabold tracking-wider text-slate-400 mt-1">WHAT HAPPENS AFTER YOU SEND FOR APPROVAL</p>
                <div className="flex items-center flex-wrap gap-1.5">
                  <span className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <span className="w-7 h-7 rounded-full bg-green-600 text-white grid place-items-center text-[10px] font-extrabold">YOU</span>
                    <span><b className="block text-[11.5px] text-slate-900">You</b><small className="block text-[9.5px] text-slate-500">create &amp; submit</small></span>
                  </span>
                  {wfLevels.map(l => (
                    <span key={l.tier} className="contents">
                      <span className="text-slate-300 font-extrabold">→</span>
                      <span className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <span className="w-7 h-7 rounded-full bg-amber-400 text-white grid place-items-center text-[10px] font-extrabold">{l.tier}</span>
                        <span><b className="block text-[11.5px] text-slate-900">{approverLabel(l.approverType)}</b><small className="block text-[9.5px] text-slate-500">{l.label}{wfRules.approvalReminderDays ? ` · SLA ${wfRules.approvalReminderDays} days` : ''}</small></span>
                      </span>
                    </span>
                  ))}
                  <span className="text-slate-300 font-extrabold">→</span>
                  <span className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <span className="w-7 h-7 rounded-full bg-violet-500 text-white grid place-items-center"><FiClock className="w-3.5 h-3.5" /></span>
                    <span><b className="block text-[11.5px] text-slate-900">System</b><small className="block text-[9.5px] text-slate-500">send letter &amp; track response</small></span>
                  </span>
                </div>
                {wfLevels.length === 0 && (
                  <p className="text-[11px] text-slate-400">No approval levels configured — the offer can be approved directly from All Offers. Configure in <Link href="/offers/rules" className="text-green-700 font-bold hover:underline">Offer Rules</Link>.</p>
                )}
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                <button onClick={saveDraft} disabled={saving} className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1.5"><FiSave className="w-3.5 h-3.5" /> Save as Draft</button>
                <button onClick={sendForApproval} disabled={saving} className="h-8 px-3.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-40 inline-flex items-center gap-1.5"><FiSend className="w-3.5 h-3.5" /> {saving ? 'Working…' : 'Send for Approval'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
