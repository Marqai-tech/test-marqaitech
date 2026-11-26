'use client';

/**
 * Vendor Employee Workspace — /vendor-portal/requests/[id]
 * (mock screens 11, 13, 14)
 *
 * Assigned investigator sees:
 *  - Header: candidate, case ID, status, due date, rework banner
 *  - Tabs: Shared Documents | Checks | Report Summary | History
 *      • Shared Documents — authorized preview/download per file
 *      • Checks — standard Marqaitech verification form per check:
 *        result (Clear / Discrepancy Found / Unable to Verify),
 *        verification date, findings, evidence uploads, Save Draft.
 *        Drafts persist server-side (reload-safe).
 *      • Report Summary — checks table + overall findings + optional vendor
 *        PDF + Preview Standard Report (DRAFT watermark) + Submit to HR
 *        (gated until every required check is completed).
 *      • History — submitted versions (frozen, read-only) + assignment trail.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FiShield, FiLoader, FiAlertCircle, FiCheckCircle, FiXCircle,
  FiFileText, FiUpload, FiSend, FiEye, FiDownload, FiInfo, FiClock,
  FiRefreshCw, FiAlertTriangle, FiSave, FiList, FiUser, FiCalendar, FiTrash2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import VendorPortalHeader from '../../VendorPortalHeader';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface EvidenceMeta { id: string; fileName: string; mimeType?: string; fileSize?: number; evidenceType?: string | null }
interface EvidenceRequirement { key: string; label: string; required: boolean; hint?: string }
interface StructuredFieldDef { key: string; label: string; type: 'text' | 'date' | 'select' | 'textarea'; options?: string[]; required: boolean; placeholder?: string }
interface FormDef { evidence: EvidenceRequirement[]; fields: StructuredFieldDef[] }
interface Check {
  id: string; checkType: string; checkLabel?: string; status: string;
  result?: string | null; findings?: string | null; verificationDate?: string | null;
  verificationMethod?: string | null; structuredData?: string | null;
  evidenceCount?: number; evidence?: EvidenceMeta[];
}
interface CaseData {
  id: string; candidateEmail: string; candidateName?: string; status: string;
  caseNumber?: string; vendorName?: string; instructions?: string; dueDate?: string;
  version?: number; reworkReason?: string | null; reworkChecks?: string | null; reworkDueDate?: string | null;
  assigneeName?: string; assigneeEmail?: string;
  assignedVendorUserId?: string;
  checks: Check[];
  sharedDocuments: Array<{ id: string; documentLabel: string; documentType: string }>;
  reports: Array<{ id: string; version: number; summary?: string; overallResult?: string; status: string; submittedAt: string; pdfStatus?: string; hasStandardPdf?: boolean; hasVendorPdf?: boolean; hrDecision?: string | null; hrDecisionReason?: string | null }>;
  assignments?: Array<{ assigneeName?: string; assignedAt: string; unassignedAt?: string; reason?: string }>;
}

const RESULTS = ['Clear', 'Discrepancy Found', 'Unable to Verify'] as const;
const WORKABLE = ['assigned', 'in_progress', 'rework_required'];

const STATUS_META: Record<string, { label: string; chip: string }> = {
  awaiting_assignment: { label: 'Awaiting Assignment', chip: 'bg-amber-100 text-amber-800' },
  assigned: { label: 'Assigned', chip: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'In Progress', chip: 'bg-blue-100 text-blue-800' },
  submitted_for_hr_review: { label: 'Submitted for HR Review', chip: 'bg-violet-100 text-violet-800' },
  awaiting_information: { label: 'Awaiting Information', chip: 'bg-amber-100 text-amber-800' },
  rework_required: { label: 'Rework Required', chip: 'bg-orange-100 text-orange-800' },
  approved_by_hr: { label: 'Approved by HR', chip: 'bg-emerald-100 text-emerald-800' },
  rejected_by_hr: { label: 'Rejected by HR', chip: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', chip: 'bg-slate-100 text-slate-600' },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function VendorRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.id as string;
  const [data, setData] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'documents' | 'checks' | 'report' | 'history'>('documents');
  const [myRole, setMyRole] = useState<string>('');
  const [formDefs, setFormDefs] = useState<Record<string, FormDef>>({});
  const [methods, setMethods] = useState<string[]>([]);

  /* background=true refreshes server data WITHOUT flipping the full-screen
     loading spinner — flipping it remounts the Checks form and wiped every
     unsaved field the vendor employee had typed (data-loss bug). */
  const fetchDetail = useCallback(async (background = false) => {
    if (!background) { setLoading(true); setError(null); }
    try {
      const res = await fetch('/api/vendor/requests', { headers: getAuthHeaders() });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `Failed (${res.status})`); }
      const d = await res.json();
      setMyRole(d.role || '');
      if (d.formDefs) setFormDefs(d.formDefs);
      if (Array.isArray(d.verificationMethods)) setMethods(d.verificationMethods);
      const req = (d.requests || []).find((r: any) => r.id === requestId);
      if (!req) throw new Error('Case not found or not assigned to you');
      setData(req);
    } catch (e: any) {
      if (!background) setError(e instanceof Error ? e.message : 'Failed');
    }
    finally { if (!background) setLoading(false); }
  }, [requestId]);

  useEffect(() => { queueMicrotask(() => void fetchDetail()); }, [fetchDetail]);

  const canWork = data ? WORKABLE.includes(data.status) && myRole === 'vendor_employee' : false;
  const canSubmitReport = data
    ? WORKABLE.includes(data.status) && (myRole === 'vendor_employee' || (myRole === 'vendor_admin' && !!data.assignedVendorUserId))
    : false;
  const reworkCheckIds: string[] = useMemo(() => {
    if (!data) return [];
    try { const arr = JSON.parse(data.reworkChecks || 'null'); return Array.isArray(arr) ? arr : []; } catch { return []; }
  }, [data]);

  const completedCount = data ? data.checks.filter((c) => c.status === 'completed').length : 0;
  const allCompleted = data ? data.checks.length > 0 && completedCount === data.checks.length : false;
  const reworkBlocks = data?.status === 'rework_required'
    ? (reworkCheckIds.length ? data.checks.filter((c) => reworkCheckIds.includes(c.id) && c.status !== 'completed').length : data.checks.filter((c) => c.status !== 'completed').length)
    : 0;

  if (loading) return (<div className="min-h-screen flex items-center justify-center"><FiLoader className="h-8 w-8 animate-spin text-slate-600" /></div>);
  if (error || !data) return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 text-center border">
        <FiAlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold">Cannot open this case</h2>
        <p className="text-slate-600 mt-2">{error || 'Not found'}</p>
        <button onClick={() => router.push('/vendor-portal/dashboard')} className="mt-4 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">Back to My Cases</button>
      </div>
    </div>
  );

  const meta = STATUS_META[data.status] || { label: data.status, chip: 'bg-slate-100 text-slate-700' };

  return (
    <div className="min-h-screen bg-slate-50">
      <VendorPortalHeader title="BGV Case Workspace" subtitle="Review shared documents, complete checks, and submit the verification report." isAdmin={myRole === 'vendor_admin'} backHref="/vendor-portal/dashboard" backLabel="My Cases">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold">{(data.candidateName || data.candidateEmail || '?').slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
                {data.candidateName || data.candidateEmail}
                <span className={`text-xs px-2 py-0.5 rounded-full ${meta.chip}`}>{meta.label}</span>
                {data.caseNumber && <span className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded">{data.caseNumber}</span>}
              </h1>
              <p className="text-slate-300 text-sm mt-0.5">
                Case ID: {data.caseNumber || data.id} · Due: {data.dueDate ? new Date(data.dueDate).toLocaleDateString('en-GB') : '—'} · Vendor: {data.vendorName || '—'}
              </p>
            </div>
          </div>
          {data.status === 'rework_required' && (
            <div className="mt-4 bg-orange-500/20 border border-orange-400/40 rounded-lg p-3 text-sm">
              <p className="font-medium flex items-center gap-2"><FiAlertTriangle className="text-orange-300" /> HR requested rework{data.reworkDueDate ? ` — correct by ${new Date(data.reworkDueDate).toLocaleDateString('en-GB')}` : ''} ({reworkBlocks} check{reworkBlocks === 1 ? '' : 's'} remaining)</p>
              {data.reworkReason && <p className="text-orange-100 mt-1 text-xs">HR notes: {data.reworkReason}</p>}
              <p className="text-orange-100 text-xs mt-1">Submitting creates a new version (v{(data.reports?.[0]?.version || 0) + 1}) — earlier versions are preserved.</p>
            </div>
          )}
          {data.instructions && <p className="text-slate-300 text-xs mt-3 flex items-start gap-1.5"><FiInfo className="mt-0.5 shrink-0" /> Instructions from HR: {data.instructions}</p>}
      </VendorPortalHeader>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
          {([
            ['documents', 'Shared Documents', data.sharedDocuments?.length || 0],
            ['checks', 'Checks', data.checks?.length || 0],
            ['report', 'Report Summary', null],
            ['history', 'History', data.reports?.length || 0],
          ] as const).map(([key, label, count]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {label}{count !== null && count !== undefined ? ` (${count})` : ''}
            </button>
          ))}
        </div>

        {/* All tabs stay mounted and are hidden with CSS — unmounting the
            Checks/Report tab used to destroy unsaved form state. */}
        <div className={tab === 'documents' ? '' : 'hidden'}><SharedDocsTab data={data} /></div>
        <div className={tab === 'checks' ? '' : 'hidden'}>
          <ChecksTab data={data} canWork={canWork} reworkCheckIds={reworkCheckIds} formDefs={formDefs} methods={methods} onSaved={() => fetchDetail(true)} />
        </div>
        <div className={tab === 'report' ? '' : 'hidden'}>
          <ReportTab
            data={data}
            canWork={canSubmitReport}
            canSubmitReport={canSubmitReport}
            allCompleted={allCompleted}
            reworkBlocks={reworkBlocks}
            onSubmitted={() => fetchDetail(true)}
          />
        </div>
        <div className={tab === 'history' ? '' : 'hidden'}><HistoryTab data={data} /></div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Shared Documents tab ─────────────────────────── */
function SharedDocsTab({ data }: { data: CaseData }) {
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string } | null>(null);
  const docs = data.sharedDocuments || [];

  const view = async (docId: string, label: string) => {
    try {
      const res = await fetch(`/api/bgv/shared-documents/${docId}/file`, { headers: getAuthHeaders() });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Could not load file'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreview({ url, name: label, mime: blob.type });
    } catch (e: any) { toast.error(e instanceof Error ? e.message : 'Failed to open document'); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 flex items-center gap-1.5"><FiInfo /> Only the documents HR explicitly shared for this case are listed. Files open in a protected viewer.</p>
      {docs.length === 0 ? (
        <div className="border rounded-lg p-10 text-center bg-white"><FiFileText className="h-8 w-8 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">No documents were shared for this case.</p></div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
          {docs.map((doc) => (
            <div key={doc.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3.5">
              <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><FiFileText /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{doc.documentLabel || doc.documentType}</p>
                <p className="text-xs text-slate-400">{doc.documentType || 'Document'}</p>
              </div>
              <button onClick={() => view(doc.id, doc.documentLabel || doc.documentType || 'document')} className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 text-xs font-medium border border-teal-600 text-teal-700 hover:bg-teal-600 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                <FiEye /> View
              </button>
              <button onClick={() => view(doc.id, doc.documentLabel || 'document').then(() => {
                if (!preview) return;
                const a = document.createElement('a'); a.href = preview.url; a.download = preview.name; a.click();
              })} className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg">
                <FiDownload /> Download
              </button>
            </div>
          ))}
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white">
              <p className="text-sm font-medium truncate">{preview.name}</p>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-700 text-sm">Close</button>
            </div>
            {preview.mime.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.name} className="max-h-[70vh] mx-auto" />
            ) : preview.mime.includes('pdf') ? (
              <iframe src={preview.url} title={preview.name} className="w-full h-[70vh]" />
            ) : (
              <div className="p-6 text-sm text-slate-600">Preview not available for this type — use download.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Checks tab (standard verification form) ─────────────────────────── */
interface CheckFormState { result: string; date: string; findings: string; method: string; structured: Record<string, string> }

function ChecksTab({ data, canWork, reworkCheckIds, formDefs, methods, onSaved }: {
  data: CaseData; canWork: boolean; reworkCheckIds: string[];
  formDefs: Record<string, FormDef>; methods: string[]; onSaved: () => void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null); // `${checkId}:${slotKey}`
  const [removing, setRemoving] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, CheckFormState>>({});
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  // ─── Data-loss protection ───
  // Every keystroke marks the check dirty and (debounced) auto-saves a draft
  // to the server, so switching tabs, refreshing or a dropped session never
  // wipes typed data. Refs keep the latest state reachable from the timer.
  const dataRef = useRef(data);
  const formRef = useRef(form);
  const canWorkRef = useRef(canWork);
  const dirtyRef = useRef<Set<string>>(new Set());
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { canWorkRef.current = canWork; }, [canWork]);
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); }, []);

  const defFor = (checkType: string): FormDef => formDefs[checkType] || formDefs._default || { evidence: [], fields: [] };

  const parseStructured = (c: Check): Record<string, string> => {
    try { const v = JSON.parse(c.structuredData || '{}'); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch { return {}; }
  };

  const getForm = (c: Check): CheckFormState => form[c.id] || {
    result: c.result || '',
    date: c.verificationDate ? new Date(c.verificationDate).toISOString().slice(0, 10) : '',
    findings: c.findings || '',
    method: c.verificationMethod || '',
    structured: parseStructured(c),
  };
  const markDirty = (id: string) => {
    dirtyRef.current.add(id);
    setAutoSaveState('idle');
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => { void autoSaveDraft(); }, 1200);
  };
  const setField = (id: string, patch: Partial<CheckFormState>) => {
    setForm((prev) => ({ ...prev, [id]: { ...getForm(data.checks.find((x) => x.id === id)!), ...patch } }));
    markDirty(id);
  };
  const setStructured = (id: string, key: string, value: string) => {
    setForm((prev) => {
      const cur = getForm(data.checks.find((x) => x.id === id)!);
      return { ...prev, [id]: { ...cur, structured: { ...cur.structured, [key]: value } } };
    });
    markDirty(id);
  };

  /* Silent draft save for dirty checks (debounced). Never flips a check to
     completed and never fires toasts — it just guarantees nothing typed is
     lost. Returns the list of saved check ids. */
  const autoSaveDraft = async (): Promise<string[]> => {
    const ids = Array.from(dirtyRef.current);
    dirtyRef.current = new Set();
    if (ids.length === 0 || !canWorkRef.current) return [];
    setAutoSaveState('saving');
    const saved: string[] = [];
    for (const id of ids) {
      const c = dataRef.current.checks.find((x) => x.id === id);
      const f = formRef.current[id];
      if (!c || !f) continue;
      try {
        await fetch(`/api/vendor/requests/${dataRef.current.id}/checks/${c.id}`, {
          method: 'PATCH', headers: getAuthHeaders(),
          body: JSON.stringify({
            status: c.status === 'pending' ? 'in_progress' : c.status,
            result: f.result || null,
            findings: f.findings,
            verificationDate: f.date || null,
            verificationMethod: f.method || null,
            structuredData: f.structured,
          }),
        });
        saved.push(id);
      } catch { dirtyRef.current.add(id); }
    }
    if (saved.length > 0) {
      setAutoSaveState('saved');
      setTimeout(() => setAutoSaveState(s => (s === 'saved' ? 'idle' : s)), 2500);
    } else {
      setAutoSaveState('idle');
    }
    return saved;
  };

  // Client-side mirror of the server completion gate (lib/bgv.ts).
  const gapsFor = (c: Check): string[] => {
    const f = getForm(c);
    const def = defFor(c.checkType);
    const gaps: string[] = [];
    for (const fld of def.fields) {
      if (fld.required && !String(f.structured[fld.key] || '').trim()) gaps.push(`${fld.label} is required`);
    }
    if (!f.result) gaps.push('Select a result');
    if (f.result && f.result !== 'Clear' && !f.findings.trim()) gaps.push(`"${f.result}" requires written findings`);
    if (f.result && f.result !== 'Unable to Verify') {
      const have = new Set((c.evidence || []).map((e) => String(e.evidenceType || '').toLowerCase()));
      for (const r of def.evidence) {
        if (r.required && !have.has(r.key.toLowerCase())) gaps.push(`Proof required: ${r.label}`);
      }
    }
    return gaps;
  };

  const save = async (c: Check, complete: boolean) => {
    const f = getForm(c);
    setSavingId(c.id);
    try {
      const body: Record<string, unknown> = {
        status: complete ? 'completed' : c.status === 'pending' ? 'in_progress' : c.status,
        result: f.result || null,
        findings: f.findings,
        verificationDate: f.date || null,
        verificationMethod: f.method || null,
        structuredData: f.structured,
      };
      const res = await fetch(`/api/vendor/requests/${data.id}/checks/${c.id}`, {
        method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Save failed');
      dirtyRef.current.delete(c.id);
      toast.success(complete ? 'Check completed.' : 'Draft saved — safe to leave this page.');
      onSaved();
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally { setSavingId(null); }
  };

  const uploadEvidence = async (c: Check, slotKey: string, file: File) => {
    setUploading(`${c.id}:${slotKey}`);
    try {
      /* Save the currently typed fields for THIS check before uploading —
         previously the upload only sent the file and the following refresh
         discarded any unsaved structured fields / findings on other checks. */
      try { await autoSaveDraft(); } catch { /* keep uploading anyway */ }
      const dataBase64 = await fileToBase64(file);
      const res = await fetch(`/api/vendor/requests/${data.id}/checks/${c.id}/evidence`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, dataBase64, evidenceType: slotKey }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Upload failed');
      toast.success(d.message || 'Proof uploaded.');
      onSaved();
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(null);
      const key = `${c.id}:${slotKey}`;
      if (fileInputs.current[key]) fileInputs.current[key]!.value = '';
    }
  };

  const removeEvidence = async (c: Check, evidenceId: string) => {
    if (!confirm('Remove this proof file?')) return;
    setRemoving(evidenceId);
    try {
      const res = await fetch(`/api/vendor/requests/${data.id}/checks/${c.id}/evidence?evidenceId=${encodeURIComponent(evidenceId)}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Remove failed');
      toast.success('Proof file removed.');
      onSaved();
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    } finally { setRemoving(null); }
  };

  const isReworkTarget = (c: Check) =>
    data.status === 'rework_required' && (reworkCheckIds.length === 0 || reworkCheckIds.includes(c.id));

  return (
    <div className="space-y-4">
      <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm text-teal-800 flex items-start gap-2">
        <FiInfo className="mt-0.5 shrink-0" />
        <span>
          Complete the verification form for every check: fill the <b>structured details</b>, pick the <b>result</b> and <b>how you verified</b>, and upload the <b>labeled proof documents</b> (degree certificates, PCC, relieving letters…). HR sees exactly what you record here — required proofs must be attached before a check can be marked completed, except for <b>Unable to Verify</b> where the written findings explain what you tried.
        </span>
        {autoSaveState !== 'idle' && (
          <span className={`ml-auto shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${autoSaveState === 'saving' ? 'text-blue-700' : 'text-emerald-700'}`}>
            {autoSaveState === 'saving' ? <><FiLoader className="animate-spin" /> Saving draft…</> : <><FiCheckCircle /> All changes saved</>}
          </span>
        )}
      </div>
      {data.checks.map((c) => {
        const f = getForm(c);
        const def = defFor(c.checkType);
        const flagged = isReworkTarget(c);
        const evidence = c.evidence || [];
        const gaps = canWork ? gapsFor(c) : [];
        const untyped = evidence.filter((e) => !e.evidenceType);
        return (
          <div key={c.id} className={`bg-white border rounded-xl overflow-hidden ${flagged ? 'border-orange-300' : ''}`}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/60">
              <div className="flex items-center gap-2 min-w-0">
                <FiShield className={`shrink-0 ${c.status === 'completed' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <p className="font-semibold text-slate-800 text-sm truncate">{c.checkLabel || c.checkType}</p>
                {flagged && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">REWORK</span>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${c.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : c.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                {c.status.replace('_', ' ')}{c.result ? ` · ${c.result}` : ''}
              </span>
            </div>
            <div className="p-4 space-y-4">
              {/* Result / date / method */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Check type (set by HR)</label>
                  <input readOnly value={c.checkLabel || c.checkType} className="w-full text-sm border rounded-md px-2.5 py-2 bg-slate-50 text-slate-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Result *</label>
                  <select
                    value={f.result} disabled={!canWork}
                    onChange={(e) => setField(c.id, { result: e.target.value })}
                    className="w-full text-sm border rounded-md px-2.5 py-2 bg-white disabled:bg-slate-50">
                    <option value="">Select result…</option>
                    {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Verified on *</label>
                  <input type="date" value={f.date} disabled={!canWork} max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setField(c.id, { date: e.target.value })}
                    className="w-full text-sm border rounded-md px-2.5 py-2 bg-white disabled:bg-slate-50" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">How was it verified? <span className="text-slate-400">(shown in the HR report)</span></label>
                  <select
                    value={f.method} disabled={!canWork}
                    onChange={(e) => setField(c.id, { method: e.target.value })}
                    className="w-full text-sm border rounded-md px-2.5 py-2 bg-white disabled:bg-slate-50">
                    <option value="">Select method…</option>
                    {(methods.length ? methods : ['Document Inspection', 'Online Portal / Database', 'Telephonic', 'Email Confirmation', 'Physical Visit']).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Structured verification details */}
              {def.fields.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><FiList className="text-slate-400" /> Verification details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {def.fields.map((fld) => (
                      <div key={fld.key} className={fld.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">
                          {fld.label}{fld.required && <span className="text-red-500"> *</span>}
                        </label>
                        {fld.type === 'select' ? (
                          <select value={String(f.structured[fld.key] ?? '')} disabled={!canWork}
                            onChange={(e) => setStructured(c.id, fld.key, e.target.value)}
                            className="w-full text-sm border rounded-md px-2.5 py-2 bg-white disabled:bg-slate-50">
                            <option value="">Select…</option>
                            {(fld.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : fld.type === 'textarea' ? (
                          <textarea value={String(f.structured[fld.key] ?? '')} disabled={!canWork} rows={2}
                            placeholder={fld.placeholder}
                            onChange={(e) => setStructured(c.id, fld.key, e.target.value)}
                            className="w-full text-sm border rounded-md px-2.5 py-2 bg-white disabled:bg-slate-50" />
                        ) : (
                          <input type={fld.type === 'date' ? 'date' : 'text'} value={String(f.structured[fld.key] ?? '')}
                            disabled={!canWork} placeholder={fld.placeholder}
                            onChange={(e) => setStructured(c.id, fld.key, e.target.value)}
                            className="w-full text-sm border rounded-md px-2.5 py-2 bg-white disabled:bg-slate-50" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Findings */}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  Findings {f.result && f.result !== 'Clear' ? <span className="text-red-500">* (required for {f.result})</span> : ''}
                </label>
                <textarea value={f.findings} disabled={!canWork} rows={3}
                  onChange={(e) => setField(c.id, { findings: e.target.value })}
                  placeholder="What you verified, the source/method used, and what you found…"
                  className="w-full text-sm border rounded-md px-3 py-2 bg-white disabled:bg-slate-50 min-h-[72px]" />
              </div>

              {/* Labeled proof documents */}
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <FiFileText className="text-slate-400" /> Proof documents
                  {f.result === 'Unable to Verify' && <span className="font-normal normal-case text-slate-400">— required slots waived for Unable to Verify</span>}
                </p>
                <div className="space-y-2">
                  {def.evidence.map((slot) => {
                    const files = evidence.filter((e) => String(e.evidenceType || '').toLowerCase() === slot.key.toLowerCase());
                    const inputKey = `${c.id}:${slot.key}`;
                    return (
                      <div key={slot.key} className={`rounded-lg border p-2.5 ${files.length > 0 ? 'border-teal-200 bg-teal-50/40' : slot.required ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50/40'}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-slate-700 flex-1 min-w-[160px]">
                            {slot.label}
                            {slot.required
                              ? <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">REQUIRED</span>
                              : <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">OPTIONAL</span>}
                          </span>
                          {canWork && (
                            <>
                              <input ref={(el) => { fileInputs.current[inputKey] = el; }} type="file" hidden
                                accept=".pdf,.png,.jpg,.jpeg,.webp"
                                onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadEvidence(c, slot.key, file); }} />
                              <button onClick={() => fileInputs.current[inputKey]?.click()} disabled={uploading === inputKey}
                                className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                                {uploading === inputKey ? <FiLoader className="animate-spin" /> : <FiUpload />} Upload
                              </button>
                            </>
                          )}
                        </div>
                        {slot.hint && <p className="text-[11px] text-slate-400 mt-1">{slot.hint}</p>}
                        {files.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {files.map((e) => (
                              <span key={e.id} className="inline-flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                                <FiFileText className="text-teal-600" />
                                <a href={`/api/bgv/evidence/${e.id}/file`} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline max-w-[200px] truncate">{e.fileName}</a>
                                {canWork && (
                                  <button onClick={() => removeEvidence(c, e.id)} disabled={removing === e.id}
                                    title="Remove file" className="text-slate-400 hover:text-red-600 disabled:opacity-40">
                                    {removing === e.id ? <FiLoader className="animate-spin w-3.5 h-3.5" /> : <FiTrash2 className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Legacy untyped uploads (older cases) */}
                  {untyped.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-2.5">
                      <p className="text-xs font-medium text-slate-600">Other files (uploaded before labeled proofs)</p>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {untyped.map((e) => (
                          <span key={e.id} className="inline-flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                            <FiFileText className="text-slate-400" />
                            <a href={`/api/bgv/evidence/${e.id}/file`} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline max-w-[200px] truncate">{e.fileName}</a>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {canWork && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => save(c, false)} disabled={savingId === c.id}
                      className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 px-3.5 py-2 rounded-lg">
                      {savingId === c.id ? <FiLoader className="animate-spin" /> : <FiSave />} Save Draft
                    </button>
                    <button onClick={() => save(c, true)}
                      disabled={savingId === c.id || !f.result || !f.date || gaps.length > 0}
                      title={gaps.length > 0 ? `Missing: ${gaps.slice(0, 3).join('; ')}${gaps.length > 3 ? ` +${gaps.length - 3} more` : ''}` : 'Mark completed'}
                      className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 px-3.5 py-2 rounded-lg disabled:opacity-40">
                      {savingId === c.id ? <FiLoader className="animate-spin" /> : <FiCheckCircle />} Mark Completed
                    </button>
                  </div>
                  {gaps.length > 0 && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <b>To complete this check:</b>
                      <ul className="list-disc ml-4 mt-0.5 space-y-0.5">
                        {gaps.slice(0, 5).map((g, i) => <li key={i}>{g}</li>)}
                      </ul>
                      {gaps.length > 5 && <p className="mt-0.5">+ {gaps.length - 5} more…</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Report Summary tab ─────────────────────────── */
function ReportTab({ data, canWork, canSubmitReport, allCompleted, reworkBlocks, onSubmitted }: {
  data: CaseData; canWork: boolean; canSubmitReport: boolean; allCompleted: boolean; reworkBlocks: number; onSubmitted: () => void;
}) {
  const [summary, setSummary] = useState('');
  const [vendorPdfName, setVendorPdfName] = useState<string | null>(null);
  const [vendorPdfB64, setVendorPdfB64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const completedCount = data.checks.filter((c) => c.status === 'completed').length;

  const pickPdf = async (file: File) => {
    if (file.type !== 'application/pdf') { toast.error('The vendor report must be a PDF.'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Vendor PDF is limited to 10 MB.'); return; }
    setVendorPdfName(file.name);
    setVendorPdfB64(await fileToBase64(file));
  };

  const previewDraft = async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/bgv/requests/${data.id}/report-pdf?draft=1`, { headers: getAuthHeaders() });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Preview failed'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e: any) { toast.error(e instanceof Error ? e.message : 'Preview failed'); }
    finally { setPreviewLoading(false); }
  };

  const submit = async () => {
    if (!summary.trim()) { toast.error('Overall findings are required.'); return; }
    if (!confirm('Submit this report to HR? The submitted version is frozen — you cannot edit it afterwards.')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/vendor/requests/${data.id}/submit-report`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          summary,
          vendorPdf: vendorPdfB64 ? { fileName: vendorPdfName, dataBase64: vendorPdfB64 } : null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Submission failed');
      toast.success(d.message || 'Report submitted to HR.');
      onSubmitted();
    } catch (e: any) { toast.error(e instanceof Error ? e.message : 'Submission failed'); }
    finally { setSubmitting(false); }
  };

  const submitted = data.status === 'submitted_for_hr_review';
  const latest = data.reports?.[0];

  return (
    <div className="space-y-5">
      {/* Completed checks table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
          <h2 className="text-sm font-semibold text-slate-800">Report Summary — {data.candidateName || data.candidateEmail} ({data.caseNumber || data.id})</h2>
        </div>
        <div className="overflow-x-auto"><table className="min-w-[700px] w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="text-left px-4 py-2.5 font-medium w-8">#</th><th className="text-left px-4 py-2.5 font-medium">Check</th><th className="text-left px-4 py-2.5 font-medium">Result</th><th className="text-left px-4 py-2.5 font-medium">Reason / Remarks</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.checks.map((c, i) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium text-slate-700">
                  {c.checkLabel || c.checkType}
                  {c.verificationMethod && <p className="text-[10px] text-slate-400 font-normal mt-0.5">Method: {c.verificationMethod}</p>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.result === 'Clear' ? 'bg-emerald-100 text-emerald-700'
                    : c.result === 'Discrepancy Found' ? 'bg-red-100 text-red-700'
                    : c.result === 'Unable to Verify' ? 'bg-slate-200 text-slate-700'
                    : 'bg-amber-100 text-amber-700'}`}>
                    {c.result === 'Clear' ? <FiCheckCircle className="w-3 h-3" /> : c.result === 'Discrepancy Found' ? <FiXCircle className="w-3 h-3" /> : <FiClock className="w-3 h-3" />}
                    {c.result || 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-600 text-xs max-w-[280px]">
                  {c.findings || '—'}
                  {(c.evidenceCount || 0) > 0 && <p className="text-[10px] text-teal-700 mt-1">{c.evidenceCount} proof file(s) attached</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {canWork ? (
        <div className="bg-white border rounded-xl p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Overall findings *</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4}
              placeholder="Summarise the verification outcome for HR…"
              className="w-full text-sm border rounded-lg px-3 py-2 min-h-[90px]" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" hidden accept="application/pdf"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPdf(f); }} />
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg">
              <FiUpload /> {vendorPdfName ? `Vendor PDF: ${vendorPdfName}` : 'Upload vendor company report PDF (optional)'}
            </button>
            {vendorPdfName && (
              <button onClick={() => { setVendorPdfName(null); setVendorPdfB64(null); }} className="text-xs text-red-600 hover:underline">Remove</button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
            <button onClick={previewDraft} disabled={previewLoading}
              className="inline-flex items-center gap-2 text-sm font-medium border border-teal-600 text-teal-700 hover:bg-teal-50 px-4 py-2 rounded-lg">
              {previewLoading ? <FiLoader className="animate-spin" /> : <FiEye />} Preview Standard Report
            </button>
            <button onClick={submit} disabled={submitting || !summary.trim() || !allCompleted || reworkBlocks > 0}
              title={!allCompleted || reworkBlocks > 0 ? 'Complete all required checks first (Clear / Discrepancy / Unable to Verify with reasons)' : 'Submit to HR'}
              className="inline-flex items-center gap-2 text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 px-4 py-2 rounded-lg disabled:opacity-40">
              {submitting ? <FiLoader className="animate-spin" /> : <FiSend />} Submit to HR
            </button>
            {(!allCompleted || reworkBlocks > 0) && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 self-center">
                Required checks and findings must be completed ({reworkBlocks > 0 ? `${reworkBlocks} rework check(s) outstanding` : `${data.checks.length - completedCount} pending`}).
              </span>
            )}
          </div>
        </div>
      ) : submitted && latest ? (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <p className="text-sm flex items-center gap-2"><FiCheckCircle className="text-violet-600" /> Report v{latest.version} submitted {latest.submittedAt ? new Date(latest.submittedAt).toLocaleString('en-GB') : ''} — frozen, awaiting HR decision. Submitted versions cannot be edited.</p>
          <div className="flex flex-wrap gap-2">
            {latest.hasStandardPdf !== false && (
              <a href={`/api/bgv/requests/${data.id}/report-pdf?version=${latest.version}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg">
                <FiDownload /> Download Standard PDF (v{latest.version})
              </a>
            )}
            {latest.pdfStatus === 'failed' && <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">Standard PDF generation failed — HR can retry from the review screen.</span>}
          </div>
          {latest.hrDecision && <p className="text-xs text-slate-500">HR decision: <b>{latest.hrDecision}</b>{latest.hrDecisionReason ? ` — ${latest.hrDecisionReason}` : ''}</p>}
        </div>
      ) : (
        <div className="bg-white border rounded-xl p-4 text-sm text-slate-600 flex items-center gap-2">
          <FiInfo className="text-slate-400" />
          {canSubmitReport ? 'Complete all checks, then submit from this tab.' : 'Assign this case to an investigator before uploading or submitting a report.'}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── History tab ─────────────────────────── */
function HistoryTab({ data }: { data: CaseData }) {
  return (
    <div className="space-y-4">
      {(data.reports || []).length === 0 ? (
        <div className="border rounded-lg p-8 text-center bg-white"><FiList className="h-8 w-8 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">No reports submitted yet.</p></div>
      ) : (
        <div className="bg-white border rounded-xl divide-y divide-slate-100">
          {data.reports.map((r) => (
            <div key={r.id} className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-slate-800">Version {r.version} — submitted {r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-GB') : ''}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.hrDecision === 'approved' ? 'bg-emerald-100 text-emerald-700' : r.hrDecision === 'rejected' ? 'bg-red-100 text-red-700' : r.hrDecision ? 'bg-orange-100 text-orange-700' : 'bg-violet-100 text-violet-700'}`}>
                    {r.hrDecision || 'with HR'}
                  </span>
                  {r.hasStandardPdf !== false && (
                    <a href={`/api/bgv/requests/${data.id}/report-pdf?version=${r.version}`} className="text-xs text-teal-700 hover:underline inline-flex items-center gap-1"><FiDownload /> PDF</a>
                  )}
                </div>
              </div>
              {r.summary && <p className="text-xs text-slate-600 mt-1.5 line-clamp-3">{r.summary}</p>}
              {r.hrDecisionReason && <p className="text-xs text-orange-700 mt-1">HR: {r.hrDecisionReason}</p>}
            </div>
          ))}
        </div>
      )}
      {(data.assignments || []).length > 0 && (
        <div className="bg-white border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">Assignment trail</h3>
          <div className="space-y-1.5">
            {(data.assignments || []).map((a, i) => (
              <p key={i} className="text-xs text-slate-600 flex items-center gap-2">
                <FiUser className="text-slate-400" />
                {a.assigneeName || 'Unknown'} — assigned {a.assignedAt ? new Date(a.assignedAt).toLocaleString('en-GB') : '—'}
                {a.unassignedAt ? `, moved ${new Date(a.unassignedAt).toLocaleString('en-GB')}${a.reason ? ` (${a.reason})` : ''}` : ' (current)'}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
