'use client';

/**
 * Candidate Portal — My Offers
 *
 * Logged-in candidates view their offers, download the offer letter, e-sign by
 * typing their full name, optionally upload a signed copy, and Accept/Decline.
 *
 * Two parallel access paths exist for the candidate:
 *   1. The secure /offer/[token] PUBLIC link sent by HR (no login required) —
 *      shared in the offer-issued email.
 *   2. This page — /candidate-portal/offers — requires login. Good for
 *      candidates who already have a portal account and don't want to dig up
 *      the email link.
 *
 * Both paths call the same backend logic and enforce the same rules
 * (case-insensitive email match, status guard, concurrency-safe updateMany).
 */
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  FiCheckCircle, FiXCircle, FiFileText, FiCalendar, FiUser, FiBriefcase,
  FiAward, FiLoader, FiDownload, FiUpload, FiArrowLeft,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

interface OfferData {
  id: string;
  candidateName: string;
  position: string;
  department?: string | null;
  offeredSalary: number;
  offeredCurrency: string;
  offeredCTC?: number | null;
  joiningDate: string;
  probationPeriod: number;
  reportingTo?: string | null;
  status: string;
  generatedPdfUrl?: string | null;
  signedPdfUrl?: string | null;
  accessToken?: string | null;
  respondedAt?: string | null;
  candidateSignature?: string | null;
  candidateSignedAt?: string | null;
  responseNotes?: string | null;
  sentAt?: string | null;
  createdAt: string;
  tenantName?: string | null;
  companyName?: string | null;
}

const fmtMoney = (n: number, cur: string) => {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur || 'INR', maximumFractionDigits: 0 }).format(n); }
  catch { return `${cur} ${n}`; }
};

const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return d; } };

export default function CandidateOffersPage() {
  const [offers, setOffers] = useState<OfferData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Per-offer response UI state (one set per offer; tracked by offer id)
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [signedCopies, setSignedCopies] = useState<Record<string, string>>({});
  const [signedCopyNames, setSignedCopyNames] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, { action: 'accept' | 'decline'; message: string } | undefined>>({});

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('tb_candidate_token') || localStorage.getItem('candidate_token') || localStorage.getItem('tb_token')
      : null;
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  const fetchOffers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/candidate-portal/offers', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to load offers');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => fetchOffers()); }, [fetchOffers]);

  const handleFileUpload = (offerId: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Signed copy must be under 5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setSignedCopies((prev) => ({ ...prev, [offerId]: dataUrl }));
      setSignedCopyNames((prev) => ({ ...prev, [offerId]: file.name }));
      toast.success(`Loaded "${file.name}" — ready to submit with your e-signature`);
    };
    reader.onerror = () => toast.error('Failed to read the file');
    reader.readAsDataURL(file);
  };

  const respond = async (offerId: string, action: 'accept' | 'decline') => {
    if (action === 'accept' && !signatures[offerId]?.trim()) {
      toast.error('Please type your full name to e-sign the offer.');
      return;
    }
    if (action === 'decline' && !comments[offerId]?.trim()) {
      toast.error('Please tell us why you are declining this offer.');
      return;
    }
    if (action === 'decline' && !window.confirm('Are you sure you want to decline this offer? This cannot be undone.')) return;

    setRespondingId(offerId);
    try {
      const res = await fetch(`/api/candidate-portal/offers/${offerId}/respond`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action,
          signatureName: signatures[offerId]?.trim() || undefined,
          comments: comments[offerId]?.trim() || undefined,
          signedCopyDataUrl: action === 'accept' ? signedCopies[offerId] : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || `Offer ${action === 'accept' ? 'accepted' : 'declined'} successfully`);
      setResult((prev) => ({ ...prev, [offerId]: { action, message: data.message } }));
      fetchOffers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setRespondingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <FiLoader className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading your offers…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/candidate-portal/dashboard" className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
            <FiArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900">My Offers</h1>
            <p className="text-sm text-slate-500 mt-1">Review your offer letters, e-sign, and accept or decline</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {offers.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 text-center">
            <FiFileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No offers yet</p>
            <p className="text-sm text-slate-400 mt-1">
              When HR sends you an offer, it will appear here. You&apos;ll also receive an email with a secure link.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {offers.map((offer) => {
              const actionable = ['sent', 'approved'].includes(offer.status);
              const isAccepted = offer.status === 'accepted';
              const isRejected = offer.status === 'rejected';
              const myResult = result[offer.id];
              return (
                <div key={offer.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {/* Header band */}
                  <div className="bg-emerald-600 text-white px-6 py-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-emerald-100 uppercase tracking-wide">Offer Letter</p>
                        <h2 className="text-lg font-bold mt-0.5">{offer.position}</h2>
                        <p className="text-sm text-emerald-50">
                          {offer.companyName || offer.tenantName || 'The company'}
                          {offer.department ? ` · ${offer.department}` : ''}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        isAccepted ? 'bg-emerald-100 text-emerald-800' :
                        isRejected ? 'bg-red-100 text-red-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {isAccepted ? 'Accepted' : isRejected ? 'Declined' : 'Pending Your Response'}
                      </span>
                    </div>
                  </div>

                  {/* Body — offer details */}
                  <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-start gap-2.5"><FiUser className="w-4 h-4 text-emerald-600 mt-0.5" /><div><p className="text-[11px] text-slate-400">Candidate</p><p className="text-sm font-semibold text-slate-800">{offer.candidateName}</p></div></div>
                    <div className="flex items-start gap-2.5"><FiAward className="w-4 h-4 text-emerald-600 mt-0.5" /><div><p className="text-[11px] text-slate-400">Annual CTC</p><p className="text-sm font-semibold text-slate-800">{offer.offeredCTC ? fmtMoney(offer.offeredCTC, offer.offeredCurrency) : fmtMoney(offer.offeredSalary, offer.offeredCurrency)}</p></div></div>
                    <div className="flex items-start gap-2.5"><FiCalendar className="w-4 h-4 text-emerald-600 mt-0.5" /><div><p className="text-[11px] text-slate-400">Joining Date</p><p className="text-sm font-semibold text-slate-800">{offer.joiningDate ? fmtDate(offer.joiningDate) : '—'}</p></div></div>
                    <div className="flex items-start gap-2.5"><FiBriefcase className="w-4 h-4 text-emerald-600 mt-0.5" /><div><p className="text-[11px] text-slate-400">Probation</p><p className="text-sm font-semibold text-slate-800">{offer.probationPeriod} days</p></div></div>
                    {offer.reportingTo && (
                      <div className="flex items-start gap-2.5"><FiUser className="w-4 h-4 text-emerald-600 mt-0.5" /><div><p className="text-[11px] text-slate-400">Reporting To</p><p className="text-sm font-semibold text-slate-800">{offer.reportingTo}</p></div></div>
                    )}
                    {offer.sentAt && (
                      <div className="flex items-start gap-2.5"><FiCalendar className="w-4 h-4 text-emerald-600 mt-0.5" /><div><p className="text-[11px] text-slate-400">Sent On</p><p className="text-sm font-semibold text-slate-800">{fmtDate(offer.sentAt)}</p></div></div>
                    )}
                  </div>

                  {/* Download offer letter */}
                  {offer.generatedPdfUrl && offer.generatedPdfUrl.startsWith('data:') && (
                    <div className="px-6 pb-5 flex flex-wrap gap-2">
                      <a href={offer.generatedPdfUrl} download={`offer-letter-${offer.position.replace(/\s+/g, '-').toLowerCase()}.html`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100">
                        <FiDownload className="w-3.5 h-3.5" /> Download Offer Letter
                      </a>
                      <a href={offer.generatedPdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-50 text-slate-700 text-xs font-medium hover:bg-slate-100">
                        <FiFileText className="w-3.5 h-3.5" /> View in New Tab
                      </a>
                    </div>
                  )}

                  {/* Already-accepted/rejected state */}
                  {(isAccepted || isRejected) && (
                    <div className={`px-6 py-4 border-t border-slate-100 ${isAccepted ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <div className="flex items-start gap-3">
                        {isAccepted ? <FiCheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" /> : <FiXCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
                        <div className="flex-1">
                          <p className={`text-sm font-semibold ${isAccepted ? 'text-emerald-800' : 'text-red-800'}`}>
                            {myResult?.message || (isAccepted ? 'You have accepted this offer' : 'You declined this offer')}
                          </p>
                          {offer.respondedAt && (
                            <p className="text-xs text-slate-500 mt-1">Responded on {fmtDate(offer.respondedAt)}</p>
                          )}
                          {isAccepted && offer.candidateSignature && (
                            <p className="text-xs text-slate-500 mt-1">Signed electronically as: <strong>{offer.candidateSignature}</strong></p>
                          )}
                          {offer.responseNotes && (
                            <p className="text-xs text-slate-600 mt-2 p-2 bg-white rounded border border-slate-200">
                              <strong>Your comments:</strong> {offer.responseNotes}
                            </p>
                          )}
                          {isAccepted && offer.signedPdfUrl && offer.signedPdfUrl.startsWith('data:') && (
                            <a href={offer.signedPdfUrl} download={`signed-offer-${offer.position.replace(/\s+/g, '-').toLowerCase()}.html`} className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded bg-white border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-50">
                              <FiDownload className="w-3 h-3" /> Download Signed Copy
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action area — only when actionable */}
                  {actionable && !myResult && (
                    <div className="px-6 pb-6 pt-2 space-y-4 border-t border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-800">Record Your Response</h3>

                      {/* E-signature input */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Type your full name (e-signature) <span className="text-emerald-600">*</span>
                        </label>
                        <input
                          value={signatures[offer.id] || ''}
                          onChange={(e) => setSignatures((prev) => ({ ...prev, [offer.id]: e.target.value }))}
                          placeholder="Your full legal name"
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          Typing your full name acts as your legally binding electronic signature on this offer.
                        </p>
                      </div>

                      {/* Upload signed copy (optional) */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Upload signed copy (optional)
                        </label>
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
                            <FiUpload className="w-3.5 h-3.5" /> Choose file
                            <input
                              type="file"
                              accept="image/*,.pdf,.doc,.docx"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(offer.id, file);
                              }}
                            />
                          </label>
                          {signedCopyNames[offer.id] && (
                            <span className="text-xs text-slate-600 truncate flex-1">{signedCopyNames[offer.id]}</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          If you printed + hand-signed the offer letter, scan or photograph it and upload here. We&apos;ll keep it on file alongside your e-signature. Max 5 MB.
                        </p>
                      </div>

                      {/* Comments (optional for accept, required for decline) */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Comments <span className="text-red-600">*</span> for decline <span className="text-slate-400">(optional for accept; required for decline)</span>
                        </label>
                        <textarea
                          value={comments[offer.id] || ''}
                          onChange={(e) => setComments((prev) => ({ ...prev, [offer.id]: e.target.value }))}
                          rows={2}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                          placeholder="Any note for HR (required if declining)"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => respond(offer.id, 'accept')}
                          disabled={respondingId === offer.id}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <FiCheckCircle className="w-4 h-4" />
                          {respondingId === offer.id ? 'Submitting…' : 'Accept Offer'}
                        </button>
                        <button
                          onClick={() => respond(offer.id, 'decline')}
                          disabled={respondingId === offer.id}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                        >
                          <FiXCircle className="w-4 h-4" /> Decline
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Just-submitted confirmation */}
                  {myResult && actionable === false && (
                    <div className={`px-6 py-4 border-t border-slate-100 ${myResult.action === 'accept' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <p className={`text-sm font-semibold ${myResult.action === 'accept' ? 'text-emerald-800' : 'text-red-800'}`}>
                        {myResult.message}
                      </p>
                      {myResult.action === 'accept' && (
                        <p className="text-xs text-emerald-700 mt-2">HR has been notified and will share your onboarding details shortly.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-[10px] text-slate-400 mt-6">
          Questions about your offer? Please reply to the offer email or contact HR directly.
        </p>
      </div>
    </div>
  );
}
