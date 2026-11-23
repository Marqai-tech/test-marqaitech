'use client';

/**
 * OFFER DASHBOARD — mock-approved Offer Management screen 1 (2026-11).
 *
 * This is the screen the sidebar "Offer Dashboard" tab opens. It is a
 * READ-ONLY overview: KPIs, the offer pipeline, what needs attention,
 * and recent offers with one-click next steps.
 *
 * It is deliberately NOT the Create Offer form — creating happens in the
 * 5-step wizard at /offers/create, and every "New Offer" button here just
 * links there. That separation is the fix for the old confusion where
 * Offer Dashboard and Create Offer rendered the same content.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FiPlus, FiFileText, FiClock, FiSend, FiCheck, FiEye, FiDownload,
  FiEdit2, FiArrowRight, FiXCircle, FiExternalLink, FiLink,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import ConvertCandidateButton from '@/components/hrms/ConvertCandidateButton';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface Offer {
  id: string; candidateName: string; candidateEmail: string; position: string; department: string | null;
  offeredSalary: number; offeredCurrency: string; offeredCTC?: number | null; joiningDate: string;
  probationPeriod: number; status: string; createdAt: string; sentAt?: string | null; updatedAt?: string;
  approvalTiers?: string | null; accessToken?: string | null; offerLetterUrl?: string | null;
}

const STATUS_BADGE: Record<string, { cls: string; icon: string; label: string }> = {
  draft: { cls: 'bg-slate-100 text-slate-600 border border-slate-200', icon: '✎', label: 'Draft' },
  pending_approval: { cls: 'bg-amber-50 text-amber-700 border border-amber-200', icon: '⏳', label: 'Pending Approval' },
  approved: { cls: 'bg-blue-50 text-blue-700 border border-blue-200', icon: '✔', label: 'Approved' },
  sent: { cls: 'bg-violet-50 text-violet-700 border border-violet-200', icon: '📨', label: 'Sent' },
  accepted: { cls: 'bg-green-50 text-green-700 border border-green-200', icon: '✓', label: 'Accepted' },
  rejected: { cls: 'bg-red-50 text-red-700 border border-red-200', icon: '✕', label: 'Declined' },
  withdrawn: { cls: 'bg-slate-100 text-slate-500 border border-slate-200', icon: '↩', label: 'Withdrawn' },
};

function initials(name: string) {
  return (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function ctcMain(o: Offer) {
  const v = (o.offeredCTC && o.offeredCTC > 0) ? o.offeredCTC : o.offeredSalary;
  return v ? `${o.offeredCurrency} ${v.toLocaleString('en-IN')}` : '—';
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function ago(iso?: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export default function OfferDashboardPage() {
  const router = useRouter();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

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

  const stats = useMemo(() => {
    const by = (s: string) => offers.filter(o => o.status === s);
    const sent = by('sent');
    return {
      total: offers.length,
      pending: by('pending_approval'),
      awaiting: sent,
      approved: by('approved'),
      accepted: by('accepted'),
      draft: by('draft'),
      rejected: by('rejected'),
      withdrawn: by('withdrawn'),
    };
  }, [offers]);

  // Needs-attention picks: oldest pending approval, oldest approved-not-sent,
  // oldest sent-with-no-response.
  const attention = useMemo(() => {
    const oldest = (list: Offer[]) => [...list].sort((a, b) => new Date(a.updatedAt || a.createdAt).getTime() - new Date(b.updatedAt || b.createdAt).getTime())[0];
    return {
      pending: oldest(stats.pending),
      approved: oldest(stats.approved),
      sent: oldest(stats.awaiting),
    };
  }, [stats]);

  const recent = useMemo(
    () => [...offers].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 6),
    [offers],
  );

  const kpis = [
    { label: 'TOTAL OFFERS', value: stats.total, sub: `${stats.draft.length} in draft`, icon: '📄', ic: 'bg-slate-100 text-slate-600', href: '/offers' },
    { label: 'PENDING APPROVAL', value: stats.pending.length, sub: 'waiting on approvers', icon: '⏳', ic: 'bg-amber-50 text-amber-700', href: '/offers?status=pending_approval' },
    { label: 'AWAITING RESPONSE', value: stats.awaiting.length, sub: 'sent, no reply yet', icon: '📨', ic: 'bg-violet-50 text-violet-700', href: '/offers?status=sent' },
    { label: 'ACCEPTED', value: stats.accepted.length, sub: 'ready for onboarding', icon: '✅', ic: 'bg-green-50 text-green-700', href: '/offers?status=accepted' },
  ];

  const pipeline = [
    { label: 'DRAFT', count: stats.draft.length, color: 'text-slate-500' },
    { label: 'IN APPROVAL', count: stats.pending.length, color: 'text-amber-600' },
    { label: 'APPROVED', count: stats.approved.length, color: 'text-blue-600' },
    { label: 'SENT', count: stats.awaiting.length, color: 'text-violet-600' },
    { label: 'ACCEPTED', count: stats.accepted.length, color: 'text-green-700' },
  ];

  const withdraw = async (id: string) => {
    try {
      const res = await fetch(`/api/offers/${id}`, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify({ status: 'withdrawn' }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Action failed'); }
      toast.success('Offer withdrawn');
      fetchOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const sendOffer = async (id: string) => {
    try {
      const res = await fetch(`/api/offers/${id}/send`, { method: 'POST', headers: getAuthHeaders() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Send failed'); }
      toast.success('Offer letter sent to the candidate');
      fetchOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    }
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
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Offer Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1">Everything happening with your offers today — {stats.awaiting.length + stats.accepted.length} live offers across {new Set(offers.filter(o => ['sent', 'accepted', 'pending_approval', 'approved'].includes(o.status)).map(o => o.position)).size} positions</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/offers" className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5">All Offers</Link>
          <Link href="/offers/create" className="h-8 px-3 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 inline-flex items-center gap-1.5 shadow-sm shadow-green-600/25">
            <FiPlus className="w-3.5 h-3.5" /> New Offer
          </Link>
        </div>
      </div>

      {/* KPI cards — each jumps to the filtered list */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Link key={k.label} href={k.href} className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 flex items-center gap-3 hover:border-green-300 transition-colors">
            <div className={`w-[34px] h-[34px] rounded-lg grid place-items-center text-[15px] flex-shrink-0 ${k.ic}`} aria-hidden>{k.icon}</div>
            <div className="min-w-0">
              <p className="text-[9.5px] font-extrabold tracking-wider text-slate-400">{k.label}</p>
              <p className="text-[17px] font-extrabold text-slate-900 leading-tight">
                {loading ? <span className="inline-block h-4 w-8 bg-slate-100 rounded animate-pulse" /> : k.value}
                <span className="ml-2 text-[10px] font-semibold text-slate-400">{k.sub}</span>
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Pipeline stepper */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-1.5 flex-wrap">
        <span className="text-[9.5px] font-extrabold tracking-wider text-slate-400 mr-2">OFFER PIPELINE</span>
        {pipeline.map((p, i) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 flex-wrap">
            {i > 0 && <span className="text-slate-300 font-extrabold" aria-hidden>→</span>}
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50">
              <b className={`text-[15px] font-extrabold ${p.color}`}>{loading ? '–' : p.count}</b>
              <span className="text-[9px] font-extrabold tracking-wider text-slate-400">{p.label}</span>
            </span>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
          <span>✕ Declined <b className="text-slate-700">{stats.rejected.length}</b></span>
          <span>↩ Withdrawn <b className="text-slate-700">{stats.withdrawn.length}</b></span>
        </span>
      </div>

      {/* Needs attention */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Approval needed */}
        <div className="bg-white border border-slate-200 border-l-[3px] border-l-amber-400 rounded-xl px-3.5 py-3 flex flex-col gap-2">
          <span className="text-[8.5px] font-extrabold tracking-wider text-slate-400">APPROVAL NEEDED</span>
          {attention.pending ? (
            <>
              <b className="text-[12.5px] text-slate-900">{attention.pending.candidateName} · {attention.pending.position}</b>
              <small className="text-[11px] text-slate-500 leading-relaxed">Submitted {ago(attention.pending.updatedAt || attention.pending.createdAt)} — waiting for the approver defined in Offer Rules.</small>
              <Link href="/offers?status=pending_approval" className="mt-1 h-7 px-2.5 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 self-start inline-flex items-center gap-1"><FiEye className="w-3 h-3" /> Review</Link>
            </>
          ) : <p className="text-[11.5px] text-slate-400">Nothing waiting on approval right now.</p>}
        </div>
        {/* Ready to send */}
        <div className="bg-white border border-slate-200 border-l-[3px] border-l-green-500 rounded-xl px-3.5 py-3 flex flex-col gap-2">
          <span className="text-[8.5px] font-extrabold tracking-wider text-slate-400">READY TO SEND</span>
          {attention.approved ? (
            <>
              <b className="text-[12.5px] text-slate-900">{attention.approved.candidateName} · {attention.approved.position}</b>
              <small className="text-[11px] text-slate-500 leading-relaxed">Fully approved but not sent yet. The candidate link stays valid for 14 days once sent.</small>
              <button onClick={() => sendOffer(attention.approved!.id)} className="mt-1 h-7 px-2.5 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 self-start inline-flex items-center gap-1"><FiSend className="w-3 h-3" /> Send Offer</button>
            </>
          ) : <p className="text-[11.5px] text-slate-400">No approved offers waiting to be sent.</p>}
        </div>
        {/* Follow up */}
        <div className="bg-white border border-slate-200 border-l-[3px] border-l-violet-400 rounded-xl px-3.5 py-3 flex flex-col gap-2">
          <span className="text-[8.5px] font-extrabold tracking-wider text-slate-400">FOLLOW UP</span>
          {attention.sent ? (
            <>
              <b className="text-[12.5px] text-slate-900">{attention.sent.candidateName} · {attention.sent.position}</b>
              <small className="text-[11px] text-slate-500 leading-relaxed">Sent {ago(attention.sent.sentAt || attention.sent.updatedAt || attention.sent.createdAt)} — no response yet. Copy the link to nudge the candidate on your channel.</small>
              <div className="mt-1 flex items-center gap-1.5">
                {attention.sent.accessToken && (
                  <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/offer/${attention.sent!.accessToken}`).then(() => toast.success('Candidate link copied')).catch(() => toast.error('Copy failed'))} className="h-7 px-2.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50 inline-flex items-center gap-1"><FiLink className="w-3 h-3" /> Copy Link</button>
                )}
                <button onClick={() => withdraw(attention.sent!.id)} className="h-7 px-2.5 rounded-lg border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 inline-flex items-center gap-1"><FiXCircle className="w-3 h-3" /> Withdraw</button>
              </div>
            </>
          ) : <p className="text-[11.5px] text-slate-400">No sent offers waiting for a response.</p>}
        </div>
      </div>

      {/* Recent offers */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-slate-200">
          <b className="text-[12.5px] text-slate-800">Recent offers</b>
          <Link href="/offers" className="ml-auto text-[11px] font-bold text-green-700 hover:underline">View all {stats.total} →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['CANDIDATE', 'POSITION', 'OFFERED CTC', 'STATUS', 'NEXT STEP', 'ACTIONS'].map(h => (
                  <th key={h} className="px-3.5 py-2 text-[9.5px] font-extrabold tracking-wider text-slate-400 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100 animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-3.5 py-3"><div className="h-3.5 w-20 bg-slate-100 rounded" /></td>)}
                  </tr>
                ))
              ) : recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <FiFileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">No offers yet</p>
                    <Link href="/offers/create" className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700"><FiPlus className="w-3.5 h-3.5" /> Create your first offer</Link>
                  </td>
                </tr>
              ) : recent.map(o => {
                const badge = STATUS_BADGE[o.status] || STATUS_BADGE.draft;
                const next = { draft: 'Finish & submit', pending_approval: 'Awaiting approver', approved: 'Send to candidate', sent: 'Waiting for response', accepted: 'Start onboarding', rejected: 'Candidate declined', withdrawn: 'Closed' }[o.status] || '—';
                return (
                  <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-[30px] h-[30px] rounded-full bg-green-50 text-green-700 grid place-items-center text-[10.5px] font-extrabold flex-shrink-0">{initials(o.candidateName)}</div>
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-bold text-slate-900 truncate max-w-[150px]">{o.candidateName}</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{o.position} · {ago(o.updatedAt || o.createdAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-[11.5px] text-slate-700 whitespace-nowrap">{o.department || '—'}</td>
                    <td className="px-3.5 py-2.5 text-[11.5px] font-bold text-slate-700 whitespace-nowrap">{ctcMain(o)}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-[10.5px] font-bold whitespace-nowrap ${badge.cls}`}><span aria-hidden>{badge.icon}</span>{badge.label}</span>
                    </td>
                    <td className="px-3.5 py-2.5"><span className="text-[11px] font-bold text-green-700 whitespace-nowrap">{next}</span></td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {o.status === 'draft' && <Link href={`/offers/create?edit=${o.id}`} className="h-[26px] px-2.5 rounded-md bg-green-600 text-white text-[10.5px] font-bold hover:bg-green-700 inline-flex items-center gap-1"><FiEdit2 className="w-3 h-3" /> Continue Draft</Link>}
                        {o.status === 'approved' && <button onClick={() => sendOffer(o.id)} className="h-[26px] px-2.5 rounded-md bg-green-600 text-white text-[10.5px] font-bold hover:bg-green-700 inline-flex items-center gap-1"><FiSend className="w-3 h-3" /> Send Offer</button>}
                        {o.status === 'accepted' && <ConvertCandidateButton offerId={o.id} defaultJoiningDate={o.joiningDate} defaultProbationDays={o.probationPeriod} className="h-[26px] px-2.5 rounded-md bg-teal-600 text-white text-[10.5px] font-bold hover:bg-teal-700 inline-flex items-center gap-1" label="Start Onboarding" />}
                        {o.status !== 'draft' && <button onClick={() => viewLetter(o)} className="h-[26px] px-2.5 rounded-md border border-slate-200 text-slate-600 text-[10.5px] font-bold hover:bg-slate-50 inline-flex items-center gap-1"><FiEye className="w-3 h-3" /> View</button>}
                        {o.status === 'sent' && <button onClick={() => withdraw(o.id)} className="h-[26px] px-2.5 rounded-md border border-red-200 text-red-600 text-[10.5px] font-bold hover:bg-red-50 inline-flex items-center gap-1"><FiXCircle className="w-3 h-3" /> Withdraw</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
