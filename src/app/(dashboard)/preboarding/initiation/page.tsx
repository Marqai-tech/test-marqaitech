'use client';

/**
 * BRD 5.3 — Preboarding Initiation (dedicated screen).
 *
 * Level 1: eligible ACCEPTED offers (server-checked), saved drafts and recent
 *          invitations.
 * Level 2: the initiation form — Offer Details (read-only) / HR Details /
 *          Checklist & Required Documents / Communication — with
 *          Save as Draft, Send Candidate Invitation and Cancel Initiation.
 *
 * Sending the invitation STARTS PREBOARDING (creates the PreboardingCandidate,
 * seeds the selected documents and notifies the candidate). It does NOT confirm
 * joining and does NOT create an employee (BRD §2.1, Section 6).
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  FiRefreshCw, FiChevronLeft, FiUserPlus, FiSave, FiSend, FiXCircle,
  FiLoader, FiAlertCircle, FiCheckCircle, FiFileText, FiPlus, FiTrash2,
  FiMail, FiBell, FiInfo,
} from 'react-icons/fi';

interface EligibleOffer {
  id: string;
  candidateName: string;
  candidateEmail: string;
  position: string | null;
  department: string | null;
  offeredSalary: number | null;
  offeredCurrency: string | null;
  offeredCTC: number | null;
  joiningDate: string | null;
  probationPeriod: number | null;
  respondedAt: string | null;
}

interface InitiationDraft {
  id: string;
  offerId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string | null;
  hrDetails: Record<string, unknown> | null;
  checklist: Record<string, unknown> | null;
  communication: Record<string, unknown> | null;
  remarks: string | null;
  status: string;
  invitedAt: string | null;
  position?: string | null;
  preboardingCandidateId?: string | null;
}

interface OfferDetail {
  id: string;
  candidateName: string;
  candidateEmail: string;
  position: string | null;
  department: string | null;
  offeredSalary: number | null;
  offeredCurrency: string | null;
  offeredCTC: number | null;
  joiningDate: string | null;
  probationPeriod: number | null;
  reportingTo: string | null;
  status: string;
  respondedAt: string | null;
}

interface ChecklistDoc { type: string; label: string; required: boolean }

const DEFAULT_DOCS: ChecklistDoc[] = [
  { type: 'aadhaar', label: 'Aadhaar Card', required: true },
  { type: 'pan', label: 'PAN Card', required: true },
  { type: 'education_cert', label: 'Educational Certificate', required: true },
  { type: 'experience_letter', label: 'Previous Employment Experience Letter', required: false },
  { type: 'bank_proof', label: 'Bank Account Proof', required: true },
  { type: 'address_proof', label: 'Address Proof', required: false },
];

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMoney(v: number | null | undefined, cur: string | null | undefined) {
  if (v == null) return '—';
  return `${cur || 'INR'} ${(v as number).toLocaleString('en-IN')}`;
}

export default function InitiationPage() {
  return (
    <Suspense fallback={<div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6"><div className="h-10 w-80 rounded-lg bg-slate-200 animate-pulse" /></div>}>
      <InitiationContent />
    </Suspense>
  );
}

function InitiationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepOfferId = searchParams.get('offerId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eligible, setEligible] = useState<EligibleOffer[]>([]);
  const [drafts, setDrafts] = useState<InitiationDraft[]>([]);
  const [invited, setInvited] = useState<InitiationDraft[]>([]);

  // Level-2 state
  const [activeOffer, setActiveOffer] = useState<OfferDetail | null>(null);
  const [activeInitiation, setActiveInitiation] = useState<InitiationDraft | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [designations, setDesignations] = useState<Array<{ id: string; title: string }>>([]);
  const [managers, setManagers] = useState<Array<{ id: string; name: string }>>([]);

  const [hr, setHr] = useState({
    joiningDate: '',
    departmentId: '',
    designationId: '',
    reportingManagerId: '',
    employmentType: 'full-time',
    ctc: '',
    workLocation: '',
    companyEmail: '',
    hrContactName: '',
  });
  const [docs, setDocs] = useState<ChecklistDoc[]>(DEFAULT_DOCS.map(d => ({ ...d })));
  const [extraItems, setExtraItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendInApp, setSendInApp] = useState(true);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/preboarding/brd/initiation', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setEligible(data.eligible || []);
      setDrafts(data.drafts || []);
      setInvited(data.invited || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openOffer = async (offerId: string) => {
    setFormLoading(true);
    try {
      const res = await fetch(`/api/preboarding/brd/initiation?offerId=${encodeURIComponent(offerId)}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load offer');
      if (data.offer.status !== 'accepted') {
        toast.error(`Offer is not accepted (status: ${data.offer.status}) — preboarding cannot be initiated.`);
        return;
      }
      if (data.initiation?.status === 'invited') {
        toast.error('An invitation has already been sent for this offer.');
        return;
      }
      const offer = data.offer as OfferDetail;
      setActiveOffer(offer);

      // Prefill from the offer + existing draft.
      const d = (data.initiation?.status === 'draft' ? data.initiation : null) as InitiationDraft | null;
      setActiveInitiation(d);
      const savedHr: Record<string, unknown> = d?.hrDetails || {};
      // Coerce stored JSONB values to strings for the form inputs.
      const sv = (k: string, fallback = '') => (savedHr[k] != null && savedHr[k] !== '' ? String(savedHr[k]) : fallback);
      const offerJoin = offer.joiningDate ? new Date(offer.joiningDate).toISOString().slice(0, 10) : '';
      setHr({
        joiningDate: sv('joiningDate', offerJoin).slice(0, 10),
        departmentId: sv('departmentId'),
        designationId: sv('designationId'),
        reportingManagerId: sv('reportingManagerId'),
        employmentType: sv('employmentType', 'full-time'),
        ctc: sv('ctc', (offer.offeredCTC || offer.offeredSalary || '').toString()),
        workLocation: sv('workLocation'),
        companyEmail: sv('companyEmail', `${offer.candidateName.split(' ')[0].toLowerCase()}@marqaitech.com`),
        hrContactName: sv('hrContactName'),
      });
      const savedDocs = d?.checklist?.documents;
      setDocs(Array.isArray(savedDocs) && savedDocs.length ? savedDocs : DEFAULT_DOCS.map(x => ({ ...x })));
      setExtraItems(Array.isArray(d?.checklist?.items) ? d.checklist.items : []);
      const comms = d?.communication || {};
      setSendEmail(comms.sendEmail !== false);
      setSendInApp(comms.sendInApp !== false);
      setRemarks(d?.remarks || '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load offer');
    } finally {
      setFormLoading(false);
    }
  };

  // Deep link /offers → /preboarding/initiation?offerId=…
  useEffect(() => {
    if (deepOfferId && !activeOffer && !loading) openOffer(deepOfferId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepOfferId, loading]);

  // Reference data for the HR Details form.
  useEffect(() => {
    if (!activeOffer) return;
    fetch('/api/departments', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { departments: [] })
      .then(d => setDepartments(d.departments || d.data || d || []))
      .catch(() => {});
    fetch('/api/designations', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { designations: [] })
      .then(d => setDesignations(d.designations || d.data || d || []))
      .catch(() => {});
    fetch('/api/employees?limit=50', { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { employees: [] })
      .then(d => {
        const emps = (d.employees || d.data || d || []) as Array<{ id: string; firstName?: string; lastName?: string; employeeId?: string }>;
        setManagers(emps.map(e => ({ id: e.id, name: `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.employeeId || e.id })));
      })
      .catch(() => {});
  }, [activeOffer]);

  const payload = () => ({
    offerId: activeOffer?.id,
    hrDetails: hr,
    checklist: { documents: docs, items: extraItems.filter(Boolean) },
    communication: { sendEmail, sendInApp },
    remarks: remarks || null,
  });

  const saveDraft = async () => {
    if (!activeOffer) return;
    setSaving(true);
    try {
      const res = await fetch('/api/preboarding/brd/initiation', {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'save-draft', ...payload() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save draft');
      toast.success('Initiation draft saved');
      await fetchList();
      // Refresh the draft binding so re-saves update the same row.
      const r2 = await fetch(`/api/preboarding/brd/initiation?offerId=${activeOffer.id}`, { headers: getAuthHeaders() });
      const d2 = await r2.json();
      if (d2.initiation?.status === 'draft') setActiveInitiation(d2.initiation);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const sendInvitation = async () => {
    if (!activeOffer) return;
    if (!hr.joiningDate || !hr.departmentId || !hr.ctc) {
      toast.error('Joining date, department and CTC are required before sending the invitation');
      return;
    }
    if (!window.confirm(`Send the preboarding invitation to ${activeOffer.candidateName}? This starts preboarding — it does NOT confirm joining or create an employee.`)) return;
    setSending(true);
    try {
      const res = await fetch('/api/preboarding/brd/initiation', {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'send-invitation', ...payload() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invitation');
      toast.success(`Invitation sent — preboarding ${data.preboardingId} created${data.emailSent ? ' and email delivered' : ' (email could not be sent — in-app notification sent)'}.`, { duration: 8000 });
      setActiveOffer(null);
      setActiveInitiation(null);
      await fetchList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send invitation', { duration: 6000 });
    } finally {
      setSending(false);
    }
  };

  const cancelDraft = async () => {
    if (!activeOffer) return;
    const reason = window.prompt('Cancellation reason (required):');
    if (!reason) return;
    setSaving(true);
    try {
      const res = await fetch('/api/preboarding/brd/initiation', {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ action: 'cancel', offerId: activeOffer.id, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      toast.success('Initiation cancelled');
      setActiveOffer(null);
      setActiveInitiation(null);
      await fetchList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to cancel');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white';
  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

  // ─────────────────────────────────────────────
  // Level 2 — the initiation form
  // ─────────────────────────────────────────────
  if (activeOffer) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => { setActiveOffer(null); setActiveInitiation(null); if (deepOfferId) router.replace('/preboarding/initiation'); }}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
            <FiChevronLeft className="w-4 h-4" /> Back to initiation list
          </button>
        </div>

        <div>
          <h1 className="text-xl font-bold text-slate-900">Initiate Preboarding — {activeOffer.candidateName}</h1>
          <p className="text-sm text-slate-500 mt-1">
            BRD 5.3 initiation. Sending the invitation starts preboarding; it does <strong>not</strong> confirm joining and does <strong>not</strong> create an employee.
          </p>
        </div>

        {formLoading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-center gap-3 text-sm text-slate-500">
            <FiLoader className="w-4 h-4 animate-spin" /> Loading offer…
          </div>
        ) : (
          <>
            {/* Section 1 — Offer Details (read-only) */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" aria-label="Offer details">
              <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2"><FiFileText className="text-teal-600" /> Offer Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-xs text-slate-500">Candidate</p><p className="font-medium text-slate-900">{activeOffer.candidateName}</p><p className="text-xs text-slate-500">{activeOffer.candidateEmail}</p></div>
                <div><p className="text-xs text-slate-500">Position</p><p className="font-medium text-slate-900">{activeOffer.position || '—'}</p><p className="text-xs text-slate-500">{activeOffer.department || ''}</p></div>
                <div><p className="text-xs text-slate-500">Offered CTC</p><p className="font-medium text-slate-900">{fmtMoney(activeOffer.offeredCTC ?? activeOffer.offeredSalary, activeOffer.offeredCurrency)}</p></div>
                <div><p className="text-xs text-slate-500">Offer joining date</p><p className="font-medium text-slate-900">{fmtDate(activeOffer.joiningDate)}</p><p className="text-xs text-slate-500">Probation {activeOffer.probationPeriod ?? '—'} days</p></div>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                <FiCheckCircle className="w-3.5 h-3.5" /> Offer accepted {activeOffer.respondedAt ? `on ${fmtDate(activeOffer.respondedAt)}` : ''}
              </div>
            </section>

            {/* Section 2 — HR Details */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" aria-label="HR details">
              <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2"><FiUserPlus className="text-teal-600" /> HR Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Expected Joining Date <span className="text-red-500">*</span></label>
                  <input type="date" value={hr.joiningDate} onChange={e => setHr({ ...hr, joiningDate: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Department <span className="text-red-500">*</span></label>
                  <select value={hr.departmentId} onChange={e => setHr({ ...hr, departmentId: e.target.value })} className={inputCls}>
                    <option value="">Select department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Designation</label>
                  <select value={hr.designationId} onChange={e => setHr({ ...hr, designationId: e.target.value })} className={inputCls}>
                    <option value="">Select designation</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Reporting Manager</label>
                  <select value={hr.reportingManagerId} onChange={e => setHr({ ...hr, reportingManagerId: e.target.value })} className={inputCls}>
                    <option value="">Select manager</option>
                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Employment Type</label>
                  <select value={hr.employmentType} onChange={e => setHr({ ...hr, employmentType: e.target.value })} className={inputCls}>
                    <option value="full-time">Full-time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Intern</option>
                    <option value="part-time">Part-time</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Annual CTC (INR) <span className="text-red-500">*</span></label>
                  <input type="number" value={hr.ctc} onChange={e => setHr({ ...hr, ctc: e.target.value })} placeholder="1200000" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Work Location</label>
                  <input type="text" value={hr.workLocation} onChange={e => setHr({ ...hr, workLocation: e.target.value })} placeholder="Hyderabad" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Company Email (HRMS login)</label>
                  <input type="email" value={hr.companyEmail} onChange={e => setHr({ ...hr, companyEmail: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>HR Contact (name shown to candidate)</label>
                  <input type="text" value={hr.hrContactName} onChange={e => setHr({ ...hr, hrContactName: e.target.value })} placeholder="e.g. Madhuri N (HR)" className={inputCls} />
                </div>
              </div>
            </section>

            {/* Section 3 — Checklist & Required Documents */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" aria-label="Checklist and required documents">
              <h2 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2"><FiFileText className="text-teal-600" /> Checklist &amp; Required Documents</h2>
              <p className="text-xs text-slate-500 mb-3">These documents are seeded for the candidate&apos;s Document Upload step. Toggle whether each is required or optional.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {docs.map((d, i) => (
                  <div key={d.type} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                    <label className="flex items-center gap-2 text-sm text-slate-800 flex-1">
                      <input type="checkbox" checked={d.required}
                        onChange={e => setDocs(docs.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                      {d.label}
                    </label>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${d.required ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                      {d.required ? 'Required' : 'Optional'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <p className="text-xs font-medium text-slate-600 mb-2">Additional checklist items (task reminders for HR)</p>
                <ul className="space-y-1.5 mb-2">
                  {extraItems.map((it, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-1.5">
                      <FiCheckCircle className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span className="flex-1">{it}</span>
                      <button onClick={() => setExtraItems(extraItems.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500" aria-label="Remove item"><FiTrash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="e.g. Arrange laptop and ID badge before joining"
                    className={inputCls} onKeyDown={e => { if (e.key === 'Enter' && newItem.trim()) { setExtraItems([...extraItems, newItem.trim()]); setNewItem(''); } }} />
                  <button onClick={() => { if (newItem.trim()) { setExtraItems([...extraItems, newItem.trim()]); setNewItem(''); } }}
                    className="shrink-0 inline-flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm px-3 rounded-lg bg-white">
                    <FiPlus className="w-4 h-4" /> Add
                  </button>
                </div>
              </div>
            </section>

            {/* Section 4 — Communication & Remarks */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" aria-label="Communication">
              <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2"><FiMail className="text-teal-600" /> Communication &amp; Remarks</h2>
              <div className="flex flex-wrap gap-4 mb-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  <FiMail className="w-4 h-4 text-slate-400" /> Send email invitation to candidate
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={sendInApp} onChange={e => setSendInApp(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  <FiBell className="w-4 h-4 text-slate-400" /> Send in-app notification
                </label>
              </div>
              <label className={labelCls}>Remarks (included in the invitation)</label>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
                placeholder="e.g. Please complete your joining information before the expected joining date."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400" />
            </section>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
              <button onClick={sendInvitation} disabled={sending || saving}
                className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
                {sending ? <><FiLoader className="w-4 h-4 animate-spin" /> Sending…</> : <><FiSend className="w-4 h-4" /> Send Candidate Invitation</>}
              </button>
              <button onClick={saveDraft} disabled={saving || sending}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-2 bg-white disabled:opacity-50">
                {saving ? <><FiLoader className="w-4 h-4 animate-spin" /> Saving…</> : <><FiSave className="w-4 h-4" /> Save as Draft</>}
              </button>
              {activeInitiation?.status === 'draft' && (
                <button onClick={cancelDraft} disabled={saving || sending}
                  className="border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-2 bg-white disabled:opacity-50">
                  <FiXCircle className="w-4 h-4" /> Cancel Initiation
                </button>
              )}
              {activeInitiation?.status === 'draft' && (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 inline-flex items-center gap-1.5">
                  <FiInfo className="w-3.5 h-3.5" /> Draft saved — invitation not sent yet
                </span>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Level 1 — list
  // ─────────────────────────────────────────────
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Preboarding Initiation</h1>
          <p className="text-sm text-slate-500 mt-1">
            Start preboarding for candidates with an <strong>accepted</strong> offer. Sending the invitation does not confirm joining and does not create an employee.
          </p>
        </div>
        <button onClick={fetchList} className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3.5 py-2 rounded-lg inline-flex items-center gap-2 bg-white">
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-5 flex items-start gap-3">
          <FiAlertCircle className="text-red-500 text-lg mt-0.5 shrink-0" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-red-700">Failed to load</h2>
            <p className="text-sm text-slate-500 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Eligible accepted offers */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-label="Eligible offers">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Accepted Offers — Ready to Initiate ({eligible.length})</h2>
        </div>
        {eligible.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">
            No accepted offers are waiting for initiation. Offers appear here after the candidate accepts them.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Candidate</th>
                  <th className="px-5 py-3 font-medium">Position</th>
                  <th className="px-5 py-3 font-medium">Offered CTC</th>
                  <th className="px-5 py-3 font-medium">Accepted</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {eligible.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{o.candidateName}</p>
                      <p className="text-xs text-slate-500">{o.candidateEmail}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{o.position || '—'}</td>
                    <td className="px-5 py-3 text-slate-700">{fmtMoney(o.offeredCTC ?? o.offeredSalary, o.offeredCurrency)}</td>
                    <td className="px-5 py-3 text-slate-700">{fmtDate(o.respondedAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => openOffer(o.id)}
                        className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                        <FiUserPlus className="w-3.5 h-3.5" /> Initiate Preboarding
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Saved drafts */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-label="Saved drafts">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Saved Drafts ({drafts.length})</h2>
          <p className="text-xs text-slate-500 mt-0.5">Invitation not sent yet — the candidate cannot see preboarding until you send it.</p>
        </div>
        {drafts.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-slate-500">No saved drafts.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {drafts.map(d => (
              <li key={d.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-900">{d.candidateName} <span className="text-xs text-slate-500">({d.candidateEmail})</span></p>
                  <p className="text-xs text-slate-500">{d.position || d.jobTitle || '—'} · draft updated {fmtDate(d.hrDetails?.joiningDate ? String(d.hrDetails.joiningDate) : null)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openOffer(d.offerId)} className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium px-3 py-1.5 rounded-lg bg-white">
                    Resume Draft
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recently invited */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" aria-label="Recently invited">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Recently Invited ({invited.length})</h2>
          <p className="text-xs text-slate-500 mt-0.5">Preboarding started — the candidate can now complete joining information in their portal.</p>
        </div>
        {invited.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-slate-500">No invitations sent yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invited.map(d => (
              <li key={d.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-900">{d.candidateName} <span className="text-xs text-slate-500">({d.candidateEmail})</span></p>
                  <p className="text-xs text-slate-500">{d.position || d.jobTitle || '—'} · invited {fmtDate(d.invitedAt)}</p>
                </div>
                {d.preboardingCandidateId && (
                  <button onClick={() => router.push(`/preboarding/candidates?id=${d.preboardingCandidateId}`)}
                    className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium px-3 py-1.5 rounded-lg bg-white">
                    View Candidate
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
