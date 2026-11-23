'use client';

/**
 * ALL OFFERS — mock-approved Offer Management screen 3 (2026-11).
 *
 * One row per offer with its EXACT next step — nothing hides in menus:
 *   CANDIDATE · POSITION · OFFERED CTC · SENT · STATUS · NEXT STEP · ACTIONS
 *
 * Forward-only lifecycle (server-enforced, mirrored here so buttons match):
 *   draft → pending_approval → approved → sent → accepted / rejected / withdrawn
 *   - draft:            Continue Draft · Discard · Upload PDF
 *   - pending_approval: View · Withdraw
 *   - approved:         View · Download PDF · Send Offer
 *   - sent:             View Letter · Copy Link · Withdraw
 *   - accepted:         Convert · Initiate Onboarding
 *   - rejected/withdrawn: View Letter · View History
 *
 * Replaces the old list+inline-form page. Creating happens ONLY in the
 * 5-step wizard at /offers/create (never on this screen).
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FiPlus, FiFileText, FiLink, FiSend, FiUpload, FiDownload, FiX,
  FiCheck, FiClock, FiEye, FiEdit2, FiTrash2, FiSearch, FiExternalLink, FiXCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import ConvertCandidateButton from '@/components/hrms/ConvertCandidateButton';
import { OfferHistory } from '@/components/hrms/offer-history';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Offer {
  id: string; candidateName: string; candidateEmail: string; position: string; department: string | null;
  offeredSalary: number; offeredCurrency: string; offeredCTC?: number | null; joiningDate: string;
  probationPeriod: number; status: string; createdAt: string; sentAt?: string | null; updatedAt?: string;
  accessToken?: string | null; offerLetterUrl?: string | null;
}

const STATUS_ORDER = ['draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'withdrawn'];

const STATUS_BADGE: Record<string, { cls: string; icon: string; label: string }> = {
  draft: { cls: 'bg-slate-100 text-slate-600 border border-slate-200', icon: '✎', label: 'Draft' },
  pending_approval: { cls: 'bg-amber-50 text-amber-700 border border-amber-200', icon: '⏳', label: 'Pending Approval' },
  approved: { cls: 'bg-blue-50 text-blue-700 border border-blue-200', icon: '✔', label: 'Approved' },
  sent: { cls: 'bg-violet-50 text-violet-700 border border-violet-200', icon: '📨', label: 'Sent' },
  accepted: { cls: 'bg-green-50 text-green-700 border border-green-200', icon: '✓', label: 'Accepted' },
  rejected: { cls: 'bg-red-50 text-red-700 border border-red-200', icon: '✕', label: 'Declined' },
  withdrawn: { cls: 'bg-slate-100 text-slate-500 border border-slate-200', icon: '↩', label: 'Withdrawn' },
};

function Badge({ status }: { status: string }) {
  const b = STATUS_BADGE[status] || STATUS_BADGE.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-[10.5px] font-bold whitespace-nowrap ${b.cls}`}>
      <span aria-hidden>{b.icon}</span>{b.label}
    </span>
  );
}

/* The single next step for the current status — shown in its own column so
   the user never has to guess what happens next. */
function nextStep(o: Offer): string {
  switch (o.status) {
    case 'draft': return 'Finish & submit';
    case 'pending_approval': return 'Awaiting approver';
    case 'approved': return 'Send to candidate';
    case 'sent': return 'Waiting for response';
    case 'accepted': return 'Start onboarding';
    case 'rejected': return 'Candidate declined';
    case 'withdrawn': return 'Withdrawn — closed';
    default: return '—';
  }
}

function initials(name: string) {
  return (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function ctcFmt(o: Offer) {
  const v = (o.offeredCTC && o.offeredCTC > 0) ? o.offeredCTC : o.offeredSalary;
  if (!v) return '—';
  const monthly = Math.round(v / 12);
  return { main: `${o.offeredCurrency} ${v.toLocaleString('en-IN')}`, sub: `${o.offeredCurrency} ${monthly.toLocaleString('en-IN')} /mo` };
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function OffersPage() {
  const router = useRouter();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  // Dashboard KPI cards deep-link here with ?status=… — honour it once on load.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const s = new URLSearchParams(window.location.search).get('status');
    if (s && STATUS_ORDER.includes(s)) queueMicrotask(() => setStatusFilter(s));
  }, []);

  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/offers?limit=200', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to load offers');
      const data = await res.json();
      setOffers(Array.isArray(data) ? data : data.offers || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchOffers()); }, [fetchOffers]);

  // Old entry points (recruitment pipeline "Extend Offer") now land in the wizard.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('candidateName') || p.get('candidateEmail') || p.get('jobApplicationId')) {
      const next = new URLSearchParams();
      ['candidateName', 'candidateEmail', 'position', 'jobApplicationId'].forEach(k => { const v = p.get(k); if (v) next.set(k, v); });
      router.replace(`/offers/create?${next.toString()}`);
    }
  }, [router]);

  const positions = useMemo(
    () => Array.from(new Set(offers.map(o => o.position).filter(Boolean))).sort(),
    [offers],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = offers.filter(o => {
      const matchesQ = !needle ||
        o.candidateName?.toLowerCase().includes(needle) ||
        o.candidateEmail?.toLowerCase().includes(needle) ||
        o.position?.toLowerCase().includes(needle);
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchesPos = positionFilter === 'all' || o.position === positionFilter;
      return matchesQ && matchesStatus && matchesPos;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'status') return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (sortBy === 'ctc') return ((b.offeredCTC || b.offeredSalary) || 0) - ((a.offeredCTC || a.offeredSalary) || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [offers, q, statusFilter, positionFilter, sortBy]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    offers.forEach(o => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [offers]);

  const hasFilters = q !== '' || statusFilter !== 'all' || positionFilter !== 'all';

  const patch = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/offers/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Action failed (HTTP ${res.status})`);
      }
      toast.success(okMsg);
      fetchOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const sendOffer = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/offers/${id}/send`, { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Send failed');
      }
      toast.success('Offer letter sent to the candidate');
      fetchOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/offers/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Delete failed'); }
      toast.success('Draft discarded');
      setConfirmDeleteId(null);
      fetchOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  // C-21: HR-side offer-letter softcopy upload (candidate downloads it from
  // the acceptance page / candidate portal).
  const handleUpload = async (offerId: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('Offer letter must be under 10 MB'); return; }
    setUploadingId(offerId);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read the file'));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/offers/${offerId}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ offerLetterUrl: dataUrl }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Upload failed'); }
      toast.success('Offer letter uploaded');
      fetchOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingId(null);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Candidate', 'Email', 'Position', 'Department', 'CTC', 'Currency', 'Status', 'Sent', 'Created'],
      ...filtered.map(o => [o.candidateName, o.candidateEmail, o.position, o.department || '', String(o.offeredCTC || o.offeredSalary || ''), o.offeredCurrency, o.status, o.sentAt ? new Date(o.sentAt).toISOString() : '', new Date(o.createdAt).toISOString()]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `offers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const viewLetter = (o: Offer) => {
    if (o.offerLetterUrl) { window.open(o.offerLetterUrl, '_blank'); return; }
    router.push(`/offers/${o.id}/preview`);
  };

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">All Offers</h1>
          <p className="text-xs text-slate-500 mt-1">Every offer with its exact next step — nothing hides in menus</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5">
            <FiDownload className="w-3.5 h-3.5" /> Export
          </button>
          <Link href="/offers/create" className="h-8 px-3 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 inline-flex items-center gap-1.5 shadow-sm shadow-green-600/25">
            <FiPlus className="w-3.5 h-3.5" /> New Offer
          </Link>
        </div>
      </div>

      {/* Filters — one compact row */}
      <div className="bg-white border border-slate-200 rounded-xl px-2.5 py-2 flex items-center gap-2 flex-wrap">
        <span className="text-[9px] font-extrabold tracking-wider text-slate-400">FILTER</span>
        <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)} className="h-[30px] w-[160px] border border-slate-300 rounded-md bg-white text-xs text-slate-700 px-2 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15">
          <option value="all">Position: All ({positions.length})</option>
          {positions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <FiSearch className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search candidate name, email or position…" className="w-full h-[30px] pl-8 pr-2 border border-slate-300 rounded-md text-xs focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-[30px] w-[160px] border border-slate-300 rounded-md bg-white text-xs text-slate-700 px-2 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15">
          <option value="all">Status: All ({offers.length})</option>
          {STATUS_ORDER.filter(s => counts[s]).map(s => (
            <option key={s} value={s}>{STATUS_BADGE[s].label} ({counts[s]})</option>
          ))}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="h-[30px] w-[130px] border border-slate-300 rounded-md bg-white text-xs text-slate-700 px-2 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15">
          <option value="newest">Sort: Newest first</option>
          <option value="status">Sort: Status</option>
          <option value="ctc">Sort: CTC high→low</option>
        </select>
        {hasFilters && (
          <button onClick={() => { setQ(''); setStatusFilter('all'); setPositionFilter('all'); }} className="h-[30px] px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-bold text-slate-500 hover:bg-slate-50 inline-flex items-center gap-1">
            <FiX className="w-3 h-3" /> Clear
          </button>
        )}
        <span className="ml-auto text-[11px] font-semibold text-slate-400 whitespace-nowrap">{filtered.length} of {offers.length} offers</span>
      </div>

      {/* List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['CANDIDATE', 'POSITION', 'OFFERED CTC', 'SENT', 'STATUS', 'NEXT STEP', 'ACTIONS'].map((h, i) => (
                  <th key={h} className={`px-3.5 py-2.5 text-[9.5px] font-extrabold tracking-wider text-slate-400 ${i === 6 ? 'text-left' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100 animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-3.5 py-3"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>)}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <FiFileText className="w-9 h-9 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-600">{hasFilters ? 'No offers match these filters' : 'No offers yet'}</p>
                    <p className="text-xs text-slate-400 mt-1">{hasFilters ? 'Try clearing the filters above.' : 'Create your first offer from a shortlisted candidate.'}</p>
                    {!hasFilters && (
                      <Link href="/offers/create" className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700">
                        <FiPlus className="w-3.5 h-3.5" /> Create Offer
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map(o => {
                  const ctc = ctcFmt(o);
                  const terminal = o.status === 'accepted' || o.status === 'rejected' || o.status === 'withdrawn';
                  return (
                    <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
                      {confirmDeleteId === o.id ? (
                        <td colSpan={7} className="px-3.5 py-2.5 bg-red-50">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-red-700">Discard this draft? This cannot be undone.</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(o.id)} disabled={deleting} className="h-7 px-2.5 rounded-md bg-red-500 text-white text-[11px] font-bold hover:bg-red-600 disabled:opacity-50">{deleting ? 'Discarding…' : 'Confirm'}</button>
                              <button onClick={() => setConfirmDeleteId(null)} className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          {/* CANDIDATE */}
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-[30px] h-[30px] rounded-full bg-green-50 text-green-700 grid place-items-center text-[10.5px] font-extrabold flex-shrink-0">{initials(o.candidateName)}</div>
                              <div className="min-w-0">
                                <p className="text-[12.5px] font-bold text-slate-900 truncate max-w-[170px]">{o.candidateName}</p>
                                <p className="text-[10.5px] text-slate-400 truncate max-w-[170px]">{o.candidateEmail || '—'}</p>
                              </div>
                            </div>
                          </td>
                          {/* POSITION */}
                          <td className="px-3.5 py-2.5">
                            <p className="text-[11.5px] font-semibold text-slate-800 truncate max-w-[150px]">{o.position}</p>
                            <p className="text-[10.5px] text-slate-400 truncate max-w-[150px]">{o.department || '—'}</p>
                          </td>
                          {/* OFFERED CTC */}
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <p className="text-[11.5px] font-bold text-slate-700">{ctc.main}</p>
                            <p className="text-[9.5px] text-slate-400 font-semibold">{ctc.sub}</p>
                          </td>
                          {/* SENT */}
                          <td className="px-3.5 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">{fmtDate(o.sentAt)}</td>
                          {/* STATUS */}
                          <td className="px-3.5 py-2.5"><Badge status={o.status} /></td>
                          {/* NEXT STEP */}
                          <td className="px-3.5 py-2.5">
                            <span className="text-[11px] font-bold text-green-700 whitespace-nowrap">{nextStep(o)}</span>
                          </td>
                          {/* ACTIONS */}
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* draft */}
                              {o.status === 'draft' && (
                                <>
                                  <Link href={`/offers/create?edit=${o.id}`} className="h-[26px] px-2.5 rounded-md bg-green-600 text-white text-[10.5px] font-bold hover:bg-green-700 inline-flex items-center gap-1"><FiEdit2 className="w-3 h-3" /> Continue Draft</Link>
                                  <button onClick={() => setConfirmDeleteId(o.id)} className="h-[26px] px-2.5 rounded-md border border-red-200 text-red-600 text-[10.5px] font-bold hover:bg-red-50 inline-flex items-center gap-1"><FiTrash2 className="w-3 h-3" /> Discard</button>
                                  <label className={`h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer ${uploadingId === o.id ? 'opacity-50 pointer-events-none' : ''}`} title="Upload the offer letter PDF">
                                    <FiUpload className="w-3 h-3" /> {uploadingId === o.id ? 'Uploading…' : 'Upload PDF'}
                                    <input type="file" accept="application/pdf,image/*,.doc,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(o.id, f); e.target.value = ''; }} />
                                  </label>
                                </>
                              )}
                              {/* pending_approval */}
                              {o.status === 'pending_approval' && (
                                <>
                                  <button onClick={() => viewLetter(o)} className="h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1"><FiEye className="w-3 h-3" /> View</button>
                                  <button onClick={() => patch(o.id, { status: 'withdrawn' }, 'Offer withdrawn')} disabled={busyId === o.id} className="h-[26px] px-2.5 rounded-md border border-red-200 text-red-600 text-[10.5px] font-bold hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"><FiXCircle className="w-3 h-3" /> Withdraw</button>
                                </>
                              )}
                              {/* approved */}
                              {o.status === 'approved' && (
                                <>
                                  <button onClick={() => viewLetter(o)} className="h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1"><FiEye className="w-3 h-3" /> View</button>
                                  <button onClick={() => sendOffer(o.id)} disabled={busyId === o.id} className="h-[26px] px-2.5 rounded-md bg-green-600 text-white text-[10.5px] font-bold hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1" title="Send the offer letter to the candidate with the secure accept/decline link"><FiSend className="w-3 h-3" /> Send Offer</button>
                                </>
                              )}
                              {/* sent */}
                              {o.status === 'sent' && (
                                <>
                                  <button onClick={() => viewLetter(o)} className="h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1"><FiFileText className="w-3 h-3" /> View Letter</button>
                                  {o.accessToken && (
                                    <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/offer/${o.accessToken}`).then(() => toast.success('Candidate link copied')).catch(() => toast.error('Copy failed'))} className="h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1" title="Copy the secure candidate acceptance link"><FiLink className="w-3 h-3" /> Link</button>
                                  )}
                                  <button onClick={() => patch(o.id, { status: 'withdrawn' }, 'Offer withdrawn')} disabled={busyId === o.id} className="h-[26px] px-2.5 rounded-md border border-red-200 text-red-600 text-[10.5px] font-bold hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"><FiXCircle className="w-3 h-3" /> Withdraw</button>
                                </>
                              )}
                              {/* accepted */}
                              {o.status === 'accepted' && (
                                <>
                                  <button onClick={() => viewLetter(o)} className="h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1"><FiFileText className="w-3 h-3" /> View Letter</button>
                                  <ConvertCandidateButton offerId={o.id} defaultJoiningDate={o.joiningDate} defaultProbationDays={o.probationPeriod} className="h-[26px] px-2.5 rounded-md bg-teal-600 text-white text-[10.5px] font-bold hover:bg-teal-700 inline-flex items-center gap-1" label="Convert" />
                                  <button onClick={() => { window.location.href = `/preboarding/initiation?offerId=${o.id}`; }} className="h-[26px] px-2.5 rounded-md border border-teal-200 text-teal-700 text-[10.5px] font-bold hover:bg-teal-50 inline-flex items-center gap-1" title="Start the onboarding initiation"><FiExternalLink className="w-3 h-3" /> Initiate</button>
                                </>
                              )}
                              {/* rejected / withdrawn / any letter available */}
                              {(o.status === 'rejected' || o.status === 'withdrawn') && (
                                <>
                                  <button onClick={() => viewLetter(o)} className="h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1"><FiFileText className="w-3 h-3" /> View Letter</button>
                                  <button onClick={() => setHistoryId(o.id)} className="h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1"><FiClock className="w-3 h-3" /> History</button>
                                </>
                              )}
                              {/* history is available for every offer beyond a draft */}
                              {o.status !== 'draft' && o.status !== 'rejected' && o.status !== 'withdrawn' && (
                                <button onClick={() => setHistoryId(o.id)} className="h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-400 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1" title="Approval history"><FiClock className="w-3 h-3" /></button>
                              )}
                              {!terminal && o.status !== 'draft' && o.offerLetterUrl && (
                                <button onClick={() => window.open(o.offerLetterUrl || '', '_blank')} className="h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1"><FiDownload className="w-3 h-3" /> PDF</button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approval history (inline panel, no modal) */}
      {historyId && (
        <div className="relative">
          <button onClick={() => setHistoryId(null)} className="absolute right-3 top-3 z-10 h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-800 grid place-items-center" title="Close history">
            <FiX className="w-4 h-4" />
          </button>
          <OfferHistory offerId={historyId} />
        </div>
      )}
    </div>
  );
}
