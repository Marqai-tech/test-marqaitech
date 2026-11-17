'use client';

/* ─────────────────────────────────────────────────────────────────────────────
 * Employee Creation / Convert Candidate to Employee (BRD Section 6 — the bridge)
 * Sections A–E, BRD 6.3 validation rules, validate → create flow.
 * APIs: GET/POST /api/preboarding/brd/employee-creation, /api/preboarding/brd/pipeline
 * ──────────────────────────────────────────────────────────────────────────── */

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  FiCheckCircle,
  FiXCircle,
  FiRefreshCw,
  FiSave,
  FiShield,
  FiFlag,
  FiAlertTriangle,
  FiLock,
  FiClock,
  FiUser,
  FiFolder,
  FiCreditCard,
  FiKey,
  FiFileText,
  FiArrowLeft,
  FiGrid,
  FiUserCheck,
} from 'react-icons/fi';

/* ── Auth helper ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface PipelineCandidate {
  id: string;
  preboardingId: string | null;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string | null;
  department: string | null;
  joiningDate: string | null;
  stage: string;
  stageLabel: string;
  joiningConfirmed: boolean | null;
  employeeId: string | null;
}

interface EcValidation {
  rule: string;
  ok: boolean;
  detail: string;
}

interface EcData {
  sectionA: {
    preboardingId: string | null;
    candidateId: string | null;
    fullName: string;
    personalEmail: string;
    mobileNumber: string | null;
    dateOfBirth: string | null;
    currentAddress: string | null;
    permanentAddress: string | null;
    emergencyContact: string | null;
  };
  sectionB: {
    departmentId: string | null;
    designationId: string | null;
    reportingManagerId: string | null;
    employmentType: string;
    dateOfJoining: string | null;
    workLocation: string | null;
    workMode: string;
    employeeStatus: string;
    confirmationDueDate: string | null;
    options: {
      departments: { id: string; name: string }[];
      designations: { id: string; title: string }[];
      managers: { id: string; name: string; employeeId: string | null }[];
    };
  };
  sectionC: {
    annualCtc: number | string | null;
    currency: string;
    bankDetails: {
      accountHolderName: string | null;
      bankName: string | null;
      accountNumber: string | null;
      ifscCode: string | null;
      panNumber: string | null;
    } | null;
  };
  sectionD: {
    companyEmail: string | null;
    loginActivation: string;
  };
  sectionE: {
    documents: { type: string; label: string; status: string }[];
  };
  validations: EcValidation[];
  employeeExists: boolean;
  linkedEmployeeId?: string | null;
  joiningConfirmed: boolean;
}

interface EcDraft {
  departmentId: string;
  designationId: string;
  reportingManagerId: string;
  employmentType: string;
  dateOfJoining: string;
  workLocation: string;
  workMode: string;
  confirmationDueDate: string;
}

interface CreateSuccess {
  message: string;
  employeeRowId: string;
  provisionalEmployeeId: string;
  preboardingId: string | null;
}

interface ValidateResult {
  type: 'ok' | 'errors';
  message: string;
  errors: string[];
}

/* ── Constants ── */
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'intern', 'contract'];
const WORK_MODES = ['office', 'remote', 'hybrid'];

const EMPTY_FORM: EcDraft = {
  departmentId: '',
  designationId: '',
  reportingManagerId: '',
  employmentType: 'full_time',
  dateOfJoining: '',
  workLocation: '',
  workMode: 'office',
  confirmationDueDate: '',
};

/* ── Helpers ── */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const ini = parts.map((p) => p[0]?.toUpperCase() || '').join('');
  return ini || '?';
}

function fmtDay(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCtc(ctc: number | string | null, currency: string): string {
  if (ctc === null || ctc === undefined || ctc === '') return '—';
  const n = typeof ctc === 'string' ? Number(ctc) : ctc;
  if (Number.isNaN(n)) return String(ctc);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

function initForm(d: EcData): EcDraft {
  return {
    departmentId: d.sectionB.departmentId || '',
    designationId: d.sectionB.designationId || '',
    reportingManagerId: d.sectionB.reportingManagerId || '',
    employmentType: d.sectionB.employmentType || 'full_time',
    dateOfJoining: (d.sectionB.dateOfJoining || '').slice(0, 10),
    workLocation: d.sectionB.workLocation || '',
    workMode: d.sectionB.workMode || 'office',
    confirmationDueDate: d.sectionB.confirmationDueDate ? String(d.sectionB.confirmationDueDate).slice(0, 10) : '',
  };
}

function docChipCls(status: string): { cls: string; icon: ReactNode } {
  const s = (status || '').toLowerCase();
  if (s === 'approved') return { cls: 'bg-emerald-50 text-emerald-700', icon: <FiCheckCircle className="h-3.5 w-3.5" /> };
  if (s === 'rejected') return { cls: 'bg-red-50 text-red-700', icon: <FiXCircle className="h-3.5 w-3.5" /> };
  if (s === 'uploaded') return { cls: 'bg-teal-50 text-teal-700', icon: <FiClock className="h-3.5 w-3.5" /> };
  return { cls: 'bg-amber-50 text-amber-700', icon: <FiClock className="h-3.5 w-3.5" /> };
}

/* ════════════════════════════════════════════════════════════════════════════
 * Inner component (uses useSearchParams → needs Suspense boundary)
 * ══════════════════════════════════════════════════════════════════════════ */
function EmployeeCreationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const candidateIdParam = searchParams.get('candidateId');

  /* ── State ── */
  const [candidates, setCandidates] = useState<PipelineCandidate[]>([]);
  const [pickedId, setPickedId] = useState<string>('');
  const [data, setData] = useState<EcData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EcDraft>(EMPTY_FORM);
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErrors, setCreateErrors] = useState<string[] | null>(null);
  const [success, setSuccess] = useState<CreateSuccess | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const activeId = candidateIdParam || (pickedId || null);
  const draftKey = activeId ? `preboarding-ec-draft-${activeId}` : null;

  /* ── Candidate selector list (when no deep-link) ── */
  useEffect(() => {
    if (candidateIdParam) return;
    (async () => {
      try {
        const res = await fetch('/api/preboarding/brd/pipeline', { headers: getAuthHeaders() });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load candidates');
        setCandidates(Array.isArray(json.candidates) ? (json.candidates as PipelineCandidate[]) : []);
      } catch {
        setCandidates([]);
      }
    })();
  }, [candidateIdParam]);

  const preferredCandidates = useMemo(
    () => candidates.filter((c) => c.stage === 'ready_to_join' || c.joiningConfirmed),
    [candidates],
  );

  /* ── Load employee-creation data for the active candidate ── */
  const load = useCallback(async (cid: string | null) => {
    if (!cid) { setData(null); setForm(EMPTY_FORM); return; }
    setLoading(true);
    setError(null);
    setValidateResult(null);
    setCreateErrors(null);
    setSuccess(null);
    setDraftRestored(false);
    try {
      const res = await fetch(`/api/preboarding/brd/employee-creation?candidateId=${encodeURIComponent(cid)}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load candidate data');
      const d = json as EcData;
      setData(d);

      /* start from server values, then apply locally saved draft (if any) */
      let next = initForm(d);
      try {
        const raw = localStorage.getItem(`preboarding-ec-draft-${cid}`);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<EcDraft>;
          next = { ...next, ...saved };
          setDraftRestored(true);
        }
      } catch { /* ignore malformed drafts */ }
      setForm(next);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Failed to load candidate data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load data for the active candidate
    load(activeId);
  }, [activeId, load]);

  /* ── Action bar handlers ── */
  const saveDraft = () => {
    if (!draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(form));
      toast.success('Draft saved locally (Section B edits)');
      setDraftRestored(false);
    } catch {
      toast.error('Could not save draft locally');
    }
  };

  const employmentPayload = () => ({
    departmentId: form.departmentId || undefined,
    designationId: form.designationId || undefined,
    reportingManagerId: form.reportingManagerId || undefined,
    dateOfJoining: form.dateOfJoining || undefined,
    employmentType: form.employmentType || undefined,
    workMode: form.workMode || undefined,
  });

  const runValidate = async (silent = false): Promise<{ canCreate: boolean; errors: string[] }> => {
    if (!activeId) return { canCreate: false, errors: ['No candidate selected'] };
    if (!silent) setValidating(true);
    try {
      const res = await fetch('/api/preboarding/brd/employee-creation', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ candidateId: activeId, employment: employmentPayload(), action: 'validate' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Validation request failed');
      if (json.canCreate) {
        if (!silent) {
          setValidateResult({ type: 'ok', message: json.message || 'All BRD 6.3 validations passed.', errors: [] });
          toast.success('All BRD 6.3 validations passed.');
        }
        return { canCreate: true, errors: [] };
      }
      const errs: string[] = Array.isArray(json.errors) ? json.errors : ['Validation failed'];
      if (!silent) setValidateResult({ type: 'errors', message: json.error || 'Validation failed (BRD 6.3)', errors: errs });
      return { canCreate: false, errors: errs };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Validation request failed';
      if (!silent) setValidateResult({ type: 'errors', message: msg, errors: [msg] });
      return { canCreate: false, errors: [msg] };
    } finally {
      if (!silent) setValidating(false);
    }
  };

  const handleCreate = async () => {
    if (!activeId || !data) return;
    if (data.employeeExists) {
      toast.error('Employee record already exists for this candidate.');
      return;
    }
    setCreating(true);
    setCreateErrors(null);
    try {
      /* silent validation first (BRD 6.1 flow) */
      const v = await runValidate(true);
      if (!v.canCreate) {
        setValidateResult({ type: 'errors', message: 'Validation failed (BRD 6.3)', errors: v.errors });
        toast.error('Validation issues must be resolved before employee creation.');
        return;
      }
      const res = await fetch('/api/preboarding/brd/employee-creation', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ candidateId: activeId, employment: employmentPayload(), action: 'create' }),
      });
      const json = await res.json();
      if (res.status === 201) {
        setSuccess({
          message: json.message || 'Employee created successfully (provisional).',
          employeeRowId: json.employeeRowId,
          provisionalEmployeeId: json.provisionalEmployeeId,
          preboardingId: json.preboardingId,
        });
        toast.success('Employee created — candidate converted.');
        await load(activeId);
      } else {
        const errs: string[] = Array.isArray(json.errors) ? json.errors : [json.error || 'Employee creation failed'];
        setCreateErrors(errs);
        toast.error(json.error || 'Employee creation failed');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Employee creation failed';
      setCreateErrors([msg]);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const submitForApproval = () => {
    /* Simulated approval request + audit note (visual only) */
    toast('Approval request submitted to HR Admin. Audit note: EMPLOYEE_CREATION_APPROVAL_REQUESTED.', { duration: 4500 });
  };

  const failedValidations = data?.validations.filter((v) => !v.ok) ?? [];

  /* ── Small render helpers ── */
  const renderReadOnly = (label: string, value: string | null | undefined, full = false) => (
    <div className={full ? 'sm:col-span-2' : ''}>
      <p className="text-xs uppercase tracking-wide text-slate-400 font-medium">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5 break-words">{value || '—'}</p>
    </div>
  );

  const secIcon = (icon: ReactNode, color: string) => (
    <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>{icon}</span>
  );

  /* ── Candidate picker (no ?candidateId= deep-link) ── */
  if (!candidateIdParam && !pickedId) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Employee Creation</h1>
          <p className="text-sm text-slate-500 mt-0.5">Convert Candidate to Employee — the bridge between Preboarding and Onboarding</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
          <label htmlFor="ec-candidate-select" className="block text-sm font-medium text-slate-700 mb-2">
            Select Candidate to Convert
          </label>
          <select
            id="ec-candidate-select"
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          >
            <option value="">— Select a candidate —</option>
            {preferredCandidates.length > 0 && (
              <optgroup label="Ready to Join / Awaiting Confirmation">
                {preferredCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.candidateName}{c.preboardingId ? ` (${c.preboardingId})` : ''}{c.jobTitle ? ` — ${c.jobTitle}` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {candidates.length > 0 && (
              <optgroup label="All Preboarding Candidates">
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.candidateName}{c.preboardingId ? ` (${c.preboardingId})` : ''}{c.jobTitle ? ` — ${c.jobTitle}` : ''} [{c.stageLabel}]
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {candidates.length === 0 && (
            <p className="mt-3 text-sm text-slate-500">No preboarding candidates found. Candidates appear here after offer acceptance.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-4" aria-hidden>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-slate-100 animate-pulse" />
              <div className="space-y-2">
                <div className="h-5 w-56 bg-slate-100 rounded animate-pulse" />
                <div className="h-3 w-72 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
              <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
              <div className="h-24 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* ── Error state ── */}
      {!loading && error && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <FiAlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-700">Failed to load candidate data</h3>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
          <button
            onClick={() => activeId && load(activeId)}
            className="mt-4 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2"
          >
            <FiRefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── Header + identity strip ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <span className="h-14 w-14 rounded-full bg-teal-50 text-teal-700 text-lg font-bold flex items-center justify-center shrink-0" aria-hidden>
                {initialsOf(data.sectionA.fullName || '?')}
              </span>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">{data.sectionA.fullName || '—'}</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Convert Candidate to Employee — the bridge between Preboarding and Onboarding
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {data.sectionA.preboardingId && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{data.sectionA.preboardingId}</span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{data.sectionA.personalEmail || '—'}</span>
                  {data.joiningConfirmed && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Joining confirmed</span>
                  )}
                </div>
              </div>
              <div className="sm:ml-auto">
                <h2 className="text-base font-semibold text-slate-800">Employee Creation</h2>
                <p className="text-xs text-slate-400">Section 6 of the Preboarding BRD</p>
              </div>
            </div>
          </div>

          {/* ── Success card (after 201 create) ── */}
          {success && (
            <div className="bg-white rounded-xl border-2 border-emerald-300 shadow-sm p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <span className="h-14 w-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <FiCheckCircle className="h-8 w-8" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900">Employee created successfully</h2>
                  <p className="text-sm text-slate-600 mt-1">{success.message}</p>
                  <div className="mt-4 grid sm:grid-cols-3 gap-3">
                    <div className="bg-emerald-50 rounded-lg px-3 py-2.5">
                      <p className="text-xs uppercase tracking-wide text-emerald-600 font-semibold">Provisional Employee ID</p>
                      <p className="text-sm font-bold text-emerald-800 mt-0.5">{success.provisionalEmployeeId}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
                      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Employee Row</p>
                      <p className="text-sm text-slate-700 mt-0.5 break-all">{success.employeeRowId}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
                      <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Preboarding ID</p>
                      <p className="text-sm text-slate-700 mt-0.5">{success.preboardingId || '—'}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-3">
                    Formal Employee ID (MarqNNN) is issued after BGV clearance. Assigned policies, templates and training are handled by the Onboarding module from here.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      onClick={() => router.push('/preboarding')}
                      className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
                    >
                      <FiUser className="h-4 w-4" /> View Candidate Profile
                    </button>
                    <button
                      onClick={() => router.push('/dashboard')}
                      className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
                    >
                      <FiGrid className="h-4 w-4" /> Back to Dashboard
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── employeeExists amber banner ── */}
          {data.employeeExists && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <FiAlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                Employee record already exists
                {data.linkedEmployeeId ? <> — linked employee ID <span className="font-semibold">{data.linkedEmployeeId}</span></> : ''}.
                {' '}Creation is disabled to prevent duplication (BRD 6.3 rule 6).
              </p>
            </div>
          )}

          {/* ── BRD 6.3 validation banner ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <FiShield className="h-4 w-4 text-teal-600" /> Validation Rules (BRD 6.3)
              </h3>
              {validateResult && validateResult.type === 'ok' && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5">
                  <FiCheckCircle className="h-3.5 w-3.5" /> Server validation passed
                </span>
              )}
            </div>
            {failedValidations.length > 0 && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-center gap-2">
                <FiAlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <p className="text-sm text-red-700 font-medium">Validation issues must be resolved before employee creation.</p>
              </div>
            )}
            <ul className="space-y-2">
              {data.validations.map((v) => (
                <li key={v.rule} className="flex items-start gap-3 text-sm">
                  {v.ok
                    ? <FiCheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    : <FiXCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                  <span>
                    <span className={v.ok ? 'text-slate-700 font-medium' : 'text-red-700 font-medium'}>{v.rule}</span>
                    <span className="text-slate-500"> — {v.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {validateResult && validateResult.type === 'errors' && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">{validateResult.message}</p>
                <ul className="space-y-1">
                  {validateResult.errors.map((er, i) => (
                    <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                      <FiXCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {er}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── Section A: Candidate Information (read-only) ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <h3 className="font-semibold text-slate-900 flex items-center gap-3 mb-4">
              {secIcon(<FiUser className="h-4 w-4 text-teal-600" />, 'bg-teal-50')}
              <span>Section A — Candidate Information <span className="text-xs font-normal text-slate-400">(auto-populated, read-only)</span></span>
            </h3>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {renderReadOnly('Preboarding ID', data.sectionA.preboardingId)}
              {renderReadOnly('Candidate ID', data.sectionA.candidateId)}
              {renderReadOnly('Full Name', data.sectionA.fullName)}
              {renderReadOnly('Personal Email', data.sectionA.personalEmail)}
              {renderReadOnly('Mobile Number', data.sectionA.mobileNumber)}
              {renderReadOnly('Date of Birth', data.sectionA.dateOfBirth ? fmtDay(data.sectionA.dateOfBirth) : null)}
              {renderReadOnly('Current Address', data.sectionA.currentAddress, true)}
              {renderReadOnly('Permanent Address', data.sectionA.permanentAddress, true)}
              {renderReadOnly('Emergency Contact', data.sectionA.emergencyContact, true)}
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 font-medium">Profile Photo</p>
                <div className="mt-1 h-16 w-16 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-300">
                  <FiUser className="h-6 w-6" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section B: Employment Information (editable) ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <h3 className="font-semibold text-slate-900 flex items-center gap-3 mb-4">
              {secIcon(<FiFolder className="h-4 w-4 text-violet-600" />, 'bg-violet-50')}
              <span>Section B — Employment Information</span>
            </h3>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <label htmlFor="ec-dept" className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                <select
                  id="ec-dept"
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                >
                  <option value="">— Select department —</option>
                  {data.sectionB.options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ec-desig" className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                <select
                  id="ec-desig"
                  value={form.designationId}
                  onChange={(e) => setForm({ ...form, designationId: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                >
                  <option value="">— Select designation —</option>
                  {data.sectionB.options.designations.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ec-mgr" className="block text-sm font-medium text-slate-700 mb-1">Reporting Manager</label>
                <select
                  id="ec-mgr"
                  value={form.reportingManagerId}
                  onChange={(e) => setForm({ ...form, reportingManagerId: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                >
                  <option value="">— Select reporting manager —</option>
                  {data.sectionB.options.managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}{m.employeeId ? ` (${m.employeeId})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ec-etype" className="block text-sm font-medium text-slate-700 mb-1">Employment Type</label>
                <select
                  id="ec-etype"
                  value={form.employmentType}
                  onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                >
                  {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ec-doj" className="block text-sm font-medium text-slate-700 mb-1">Date of Joining</label>
                <input
                  id="ec-doj"
                  type="date"
                  value={form.dateOfJoining}
                  onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                />
              </div>
              <div>
                <label htmlFor="ec-wloc" className="block text-sm font-medium text-slate-700 mb-1">Work Location</label>
                <input
                  id="ec-wloc"
                  type="text"
                  value={form.workLocation}
                  onChange={(e) => setForm({ ...form, workLocation: e.target.value })}
                  placeholder="e.g. Marqai HQ — Whitefield, BLR"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                />
              </div>
              <div>
                <label htmlFor="ec-wmode" className="block text-sm font-medium text-slate-700 mb-1">Work Mode</label>
                <select
                  id="ec-wmode"
                  value={form.workMode}
                  onChange={(e) => setForm({ ...form, workMode: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                >
                  {WORK_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <p className="block text-sm font-medium text-slate-700 mb-1">Employee Status</p>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                  <FiClock className="h-3.5 w-3.5" /> probation (fixed until confirmation)
                </span>
              </div>
              <div>
                <label htmlFor="ec-conf-due" className="block text-sm font-medium text-slate-700 mb-1">Confirmation Due Date <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  id="ec-conf-due"
                  type="date"
                  value={form.confirmationDueDate}
                  onChange={(e) => setForm({ ...form, confirmationDueDate: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                />
              </div>
              <div>
                <p className="block text-sm font-medium text-slate-700 mb-1">Employee ID</p>
                <p className="text-xs text-slate-400 italic pt-2">
                  Auto-generated on creation (PROV-XXXXXXXX provisional → MarqNNN after BGV)
                </p>
              </div>
            </div>
          </div>

          {/* ── Section C: Payroll Information (read-only) ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <h3 className="font-semibold text-slate-900 flex items-center gap-3 mb-4">
              {secIcon(<FiCreditCard className="h-4 w-4 text-emerald-600" />, 'bg-emerald-50')}
              <span>Section C — Payroll Information <span className="text-xs font-normal text-slate-400">(read-only)</span></span>
            </h3>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {renderReadOnly('Annual CTC', data.sectionC.annualCtc != null ? `${fmtCtc(data.sectionC.annualCtc, data.sectionC.currency)} (${data.sectionC.currency})` : null)}
              {data.sectionC.bankDetails ? (
                <>
                  {renderReadOnly('Account Holder', data.sectionC.bankDetails.accountHolderName)}
                  {renderReadOnly('Bank', data.sectionC.bankDetails.bankName)}
                  {renderReadOnly('Account Number (masked)', data.sectionC.bankDetails.accountNumber)}
                  {renderReadOnly('IFSC Code', data.sectionC.bankDetails.ifscCode)}
                  {renderReadOnly('PAN Number', data.sectionC.bankDetails.panNumber)}
                </>
              ) : (
                <div className="sm:col-span-2 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5">
                  Bank details not submitted yet — verified by Payroll per BRD 5.7.
                </div>
              )}
            </div>
            <p className="mt-4 text-xs text-slate-400 flex items-center gap-1.5">
              <FiLock className="h-3.5 w-3.5" /> Verified by Payroll per BRD 5.7. Account numbers are masked in the HR view.
            </p>
          </div>

          {/* ── Section D: Access & Permissions (read-only) ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <h3 className="font-semibold text-slate-900 flex items-center gap-3 mb-4">
              {secIcon(<FiKey className="h-4 w-4 text-slate-600" />, 'bg-slate-100')}
              <span>Section D — Access &amp; Permissions <span className="text-xs font-normal text-slate-400">(read-only)</span></span>
            </h3>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {renderReadOnly('Company Email', data.sectionD.companyEmail)}
              {renderReadOnly('Login Activation', data.sectionD.loginActivation)}
            </div>
          </div>

          {/* ── Section E: Joining Checklist Mapping (read-only) ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <h3 className="font-semibold text-slate-900 flex items-center gap-3 mb-4">
              {secIcon(<FiFileText className="h-4 w-4 text-teal-600" />, 'bg-teal-50')}
              <span>Section E — Joining Checklist Mapping <span className="text-xs font-normal text-slate-400">(read-only)</span></span>
            </h3>
            {data.sectionE.documents.length === 0 ? (
              <p className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5">No documents uploaded against this preboarding record.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.sectionE.documents.map((doc, i) => {
                  const chip = docChipCls(doc.status);
                  return (
                    <span key={`${doc.type}-${i}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${chip.cls}`}>
                      {chip.icon}
                      {doc.label || doc.type}
                      <span className="opacity-70">({doc.status})</span>
                    </span>
                  );
                })}
              </div>
            )}
            <p className="mt-4 text-xs text-slate-400 flex items-center gap-1.5">
              <FiUserCheck className="h-3.5 w-3.5" /> Assigned policies, templates and training come from the Onboarding module after employee creation.
            </p>
          </div>

          {/* ── Action bar (BRD 6.1) ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 sticky bottom-4">
            {createErrors && createErrors.length > 0 && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Employee creation blocked (409)</p>
                <ul className="space-y-1">
                  {createErrors.map((er, i) => (
                    <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                      <FiXCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {er}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {draftRestored && (
              <p className="mb-3 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
                <FiCheckCircle className="h-3.5 w-3.5" /> Saved draft restored from your last session.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={saveDraft}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
              >
                <FiSave className="h-4 w-4" /> Save Draft
              </button>
              <button
                onClick={() => runValidate(false)}
                disabled={validating}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
              >
                <FiShield className="h-4 w-4" /> {validating ? 'Validating…' : 'Validate Details'}
              </button>
              <button
                onClick={submitForApproval}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
              >
                <FiFlag className="h-4 w-4" /> Submit for HR Approval
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || data.employeeExists}
                className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <FiCheckCircle className="h-4 w-4" /> {creating ? 'Creating…' : 'Approve and Create Employee'}
              </button>
              <button
                onClick={() => router.back()}
                className="border border-red-300 text-red-700 hover:bg-red-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium"
              >
                <FiArrowLeft className="h-4 w-4" /> Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Page (Suspense boundary required for useSearchParams)
 * ══════════════════════════════════════════════════════════════════════════ */
export default function EmployeeCreationPage() {
  return (
    <Suspense
      fallback={(
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-4" aria-busy="true">
          <div className="h-8 w-56 bg-slate-100 rounded animate-pulse" />
          <div className="h-24 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse" />
        </div>
      )}
    >
      <EmployeeCreationInner />
    </Suspense>
  );
}
