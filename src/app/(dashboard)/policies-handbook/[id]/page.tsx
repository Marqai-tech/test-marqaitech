'use client';

/**
 * Policy viewer — employee reads the policy document and acknowledges.
 *
 * Left: the policy document (PDF in an embedded viewer, image, or inline text
 * fallback) with a download link. Right: the Acknowledge Policy panel —
 * mandatory read-confirmation checkbox, Accept & Acknowledge, or Reject with a
 * mandatory reason (max 500 chars). A rejected policy stays pending until the
 * employee accepts; an accepted policy shows a confirmation state.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  FiFileText, FiCheckCircle, FiClock, FiXCircle, FiDownload, FiHome,
  FiChevronRight, FiArrowLeft, FiSettings, FiAlertTriangle, FiCheckSquare, FiSquare,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface PolicyDetail {
  id: string;
  title: string;
  category: string;
  description: string;
  content: string | null;
  version: string;
  effectiveDate: string | null;
  expiryDate: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;
  my: {
    status: 'pending' | 'acknowledged';
    rejected: boolean;
    action: string | null;
    rejectionReason: string | null;
    rejectedAt: string | null;
    acknowledgedAt: string | null;
  };
}

const REASON_MAX = 500;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

export default function PolicyViewerPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [policy, setPolicy] = useState<PolicyDetail | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/policies/handbook?id=${id}`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Policy not found');
      setPolicy(data.policy);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load policy');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  const submit = async (action: 'accepted' | 'rejected') => {
    if (action === 'rejected' && !reason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/policies/acknowledgments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeaders || {}) },
        body: JSON.stringify({ policyId: id, action, comments: action === 'rejected' ? reason.trim() : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record acknowledgment');
      toast.success(data.message || (action === 'rejected' ? 'Rejection recorded' : 'Policy acknowledged'));
      setShowReject(false);
      setReason('');
      setConfirmed(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record acknowledgment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24"><FiSettings className="w-8 h-8 animate-spin text-teal-400" /></div>
    );
  }

  if (!policy) {
    return (
      <div className="space-y-6">
        <div className="thb-card p-12 text-center">
          <FiFileText className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
          <p className="text-thb-text-secondary font-medium">Policy not found</p>
          <Link href="/policies-handbook" className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-teal-500 text-white text-sm font-medium hover:bg-teal-600">
            <FiArrowLeft className="w-4 h-4" /> Back to Policies &amp; Handbook
          </Link>
        </div>
      </div>
    );
  }

  const isPdf = policy.fileUrl && (policy.fileMimeType?.includes('pdf') || policy.fileName?.toLowerCase().endsWith('.pdf'));
  const isImage = policy.fileUrl && (policy.fileMimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(policy.fileName || ''));
  const hasInlineText = !!(policy.content || policy.description);
  const pending = policy.my.status === 'pending';

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-thb-text-muted flex-wrap">
        <Link href="/home" className="flex items-center gap-1 hover:text-teal-600 transition-colors"><FiHome className="w-3.5 h-3.5" /> Home</Link>
        <FiChevronRight className="w-3.5 h-3.5" />
        <Link href="/policies-handbook" className="hover:text-teal-600 transition-colors">Policies &amp; Handbook</Link>
        <FiChevronRight className="w-3.5 h-3.5" />
        <span className="text-thb-text-primary font-medium truncate max-w-[240px]">{policy.title}</span>
      </nav>

      {/* Header */}
      <div className="thb-card">
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-teal-600 flex items-center justify-center flex-shrink-0 ring-1 ring-emerald-100">
              <FiFileText className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-thb-text-primary truncate">{policy.title} – Version {policy.version}</h1>
              <p className="text-sm text-thb-text-secondary mt-0.5">
                Effective From: {fmtDate(policy.effectiveDate)} <span className="mx-2 text-thb-border">|</span> Applicable to: All Employees
              </p>
            </div>
          </div>
          {pending ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-xs font-semibold self-start sm:self-auto shrink-0">
              <FiClock className="w-3.5 h-3.5" /> Pending Acknowledgement
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-xs font-semibold self-start sm:self-auto shrink-0">
              <FiCheckCircle className="w-3.5 h-3.5" /> Acknowledged
            </span>
          )}
        </div>
        {policy.my.rejected && policy.my.rejectionReason && (
          <div className="px-6 py-3 border-t border-thb-border/50 bg-rose-50/60 flex items-start gap-2">
            <FiAlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-700">
              <span className="font-semibold">You rejected this version{policy.my.rejectedAt ? ` on ${fmtDate(policy.my.rejectedAt)}` : ''}.</span> Your reason: {policy.my.rejectionReason}
              <span className="text-rose-500"> — the policy remains pending until you accept it.</span>
            </p>
          </div>
        )}
      </div>

      {/* Document + acknowledgment panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Document viewer */}
        <div className="lg:col-span-2 space-y-3">
          {policy.fileUrl && isPdf ? (
            <div className="thb-card overflow-hidden">
              <iframe
                src={policy.fileUrl}
                title={`${policy.title} v${policy.version}`}
                className="w-full h-[75vh] bg-slate-100"
              />
            </div>
          ) : policy.fileUrl && isImage ? (
            <div className="thb-card p-4 flex items-center justify-center bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={policy.fileUrl} alt={policy.title} className="max-w-full max-h-[75vh] object-contain" />
            </div>
          ) : hasInlineText ? (
            <div className="thb-card p-6 sm:p-8">
              <div className="border-b border-thb-border pb-4 mb-4">
                <h2 className="text-xl font-bold text-thb-text-primary">{policy.title}</h2>
                <p className="text-sm text-thb-text-muted mt-1">Version {policy.version} · Effective from {fmtDate(policy.effectiveDate)}</p>
              </div>
              <div className="text-sm text-thb-text-secondary whitespace-pre-wrap leading-relaxed max-h-[65vh] overflow-y-auto">
                {policy.content || policy.description}
              </div>
            </div>
          ) : (
            <div className="thb-card p-12 text-center">
              <FiFileText className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
              <p className="text-sm text-thb-text-secondary font-medium">No document preview available</p>
              <p className="text-xs text-thb-text-muted mt-1">Download the attached file to read this policy.</p>
            </div>
          )}

          {policy.fileUrl && !isPdf && !isImage && (
            <div className="thb-card px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-thb-text-muted">Policy Document</p>
                <p className="text-sm font-medium text-thb-text-primary truncate">{policy.fileName || 'Attached document'}</p>
              </div>
              <a
                href={policy.fileUrl}
                {...(policy.fileUrl.startsWith('data:') ? { download: policy.fileName || policy.title } : { target: '_blank', rel: 'noopener noreferrer' })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors shrink-0"
              >
                <FiDownload className="w-3.5 h-3.5" /> Download
              </a>
            </div>
          )}
        </div>

        {/* Acknowledge panel */}
        <div>
          <div className="thb-card p-5 space-y-4 lg:sticky lg:top-4">
            <h2 className="text-base font-semibold text-thb-text-primary flex items-center gap-2">
              <FiFileText className="w-4 h-4 text-teal-500" /> Acknowledge Policy
            </h2>

            {policy.my.status === 'acknowledged' ? (
              <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-100 p-4 text-center">
                <FiCheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-emerald-800">Policy acknowledged</p>
                <p className="text-xs text-emerald-600 mt-1">
                  You accepted version {policy.version} on {policy.my.acknowledgedAt ? fmtDate(policy.my.acknowledgedAt) : '—'}. No further action needed.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2 text-xs text-thb-text-secondary">
                  <FiCheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <p>Please read the policy document carefully before acknowledging.</p>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg hover:bg-slate-50 p-1 -m-1 transition-colors">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={confirmed}
                    onClick={() => setConfirmed((v) => !v)}
                    className="mt-0.5 text-teal-500 hover:text-teal-600 transition-colors"
                  >
                    {confirmed ? <FiCheckSquare className="w-5 h-5" /> : <FiSquare className="w-5 h-5" />}
                  </button>
                  <span className="text-sm text-thb-text-primary font-medium" onClick={() => setConfirmed((v) => !v)}>
                    I have read and understood this policy.
                  </span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!confirmed || submitting}
                    onClick={() => submit('accepted')}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-teal-500 text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-teal-500/25 transition-colors"
                  >
                    {submitting ? 'Saving...' : 'Accept & Acknowledge'}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => { setShowReject((v) => !v); if (!showReject) setConfirmed(false); }}
                    className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-semibold text-thb-text-secondary hover:bg-slate-50 transition-colors"
                  >
                    Reject
                  </button>
                </div>

                {showReject && (
                  <div className="border-t border-thb-border pt-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <FiXCircle className="w-4 h-4 text-rose-500" />
                      <h3 className="text-sm font-semibold text-thb-text-primary">Reject Policy</h3>
                    </div>
                    <p className="text-xs text-thb-text-secondary">
                      If you do not agree with this policy, please provide a reason for rejection. HR will be able to see your reason in the acknowledgment tracker.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                        Reason for rejection <span className="text-red-500 font-bold">*</span>
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
                        rows={4}
                        placeholder="Enter your reason here..."
                        className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 resize-none"
                      />
                      <p className="text-[10px] text-thb-text-muted text-right mt-0.5">{reason.length}/{REASON_MAX}</p>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowReject(false); setReason(''); }}
                        className="px-4 py-2 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!reason.trim() || submitting}
                        onClick={() => submit('rejected')}
                        className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {submitting ? 'Submitting...' : 'Submit Rejection'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
