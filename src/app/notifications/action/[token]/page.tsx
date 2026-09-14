'use client';

/**
 * Public Actionable Notification page (Task 36)
 *
 * Landing page for Approve / Reject links delivered via email, Slack or
 * Microsoft Teams. No login required — the single-use token in the URL is
 * the credential. Tenant is resolved from ?tenant= (middleware priority 1).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';

interface ActionContext {
  subject?: string;
  module?: string;
  eventKey?: string;
  recipientName?: string | null;
  entityType?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
  context?: {
    employeeName?: string;
    fields?: [string, string][];
  };
}

export default function NotificationActionPage() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const token = params?.token as string;
  const tenant = search.get('tenant') || '';

  const [data, setData] = useState<ActionContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [presetAction, setPresetAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/notifications/action/${encodeURIComponent(token)}${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''}`;
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'This action link is invalid.');
      } else {
        setData(body);
      }
    } catch {
      setError('Unable to load this action. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token, tenant]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const a = search.get('action');
    if (a === 'approve' || a === 'reject') setPresetAction(a);
  }, [search]);

  const act = async (action: 'approve' | 'reject') => {
    setBusy(action);
    setError(null);
    try {
      const url = `/api/notifications/action/${encodeURIComponent(token)}${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment: comment || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, message: body.error || 'Action failed' });
      } else {
        setResult({ ok: true, message: body.message || `Request ${action === 'approve' ? 'approved' : 'rejected'}` });
        setPresetAction(null);
      }
    } catch {
      setResult({ ok: false, message: 'Network error — please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const moduleLabel = (m?: string) =>
    ({ recruitment: 'Recruitment', onboarding: 'Onboarding', core_hr: 'Core HR', leave: 'Leave', attendance: 'Attendance', performance: 'Performance', learning: 'Learning', payroll: 'Payroll', exit: 'Exit' } as Record<string, string>)[m || ''] || m;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #f0fdf4 0%, #f1f5f9 55%, #e2e8f0 100%)' }}>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)' }}>
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 border-2 border-white/60 flex items-center justify-center text-white font-extrabold">3B</div>
          <div>
            <div className="text-white font-bold leading-tight">3Boxes HRMS</div>
            <div className="text-emerald-100 text-xs">people · process · technology</div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-8">
        <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="p-10 flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm">Loading your request…</p>
            </div>
          ) : result ? (
            <div className="p-10 flex flex-col items-center gap-4 text-center">
              {result.ok ? <CheckCircle2 className="w-14 h-14 text-emerald-500" /> : <XCircle className="w-14 h-14 text-red-500" />}
              <h1 className="text-xl font-bold text-slate-800">{result.ok ? 'Done!' : 'Action failed'}</h1>
              <p className="text-sm text-slate-500 max-w-sm">{result.message}</p>
              <p className="text-xs text-slate-400 mt-2">You can close this window and return to your email or chat.</p>
            </div>
          ) : error ? (
            <div className="p-10 flex flex-col items-center gap-4 text-center">
              <AlertTriangle className="w-14 h-14 text-amber-500" />
              <h1 className="text-xl font-bold text-slate-800">Link unavailable</h1>
              <p className="text-sm text-slate-500 max-w-sm">{error}</p>
            </div>
          ) : data ? (
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
                <ShieldCheck className="w-4 h-4" />
                {moduleLabel(data.module) || 'HRMS'} · Action required
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">{data.subject}</h1>
              {data.createdAt && (
                <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Raised {new Date(data.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {data.expiresAt ? ` · acts until ${new Date(data.expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
              )}

              {data.context?.employeeName && (
                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Requester</div>
                  <div className="text-sm font-semibold text-slate-800">{data.context.employeeName}</div>
                </div>
              )}

              {!!data.context?.fields?.length && (
                <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                  {data.context.fields.map(([label, value]) => (
                    <div key={label} className="flex gap-3 px-4 py-2.5 bg-white">
                      <dt className="w-36 shrink-0 text-xs font-semibold text-slate-500 uppercase tracking-wide pt-0.5">{label}</dt>
                      <dd className="text-sm text-slate-800 break-words">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="mt-5">
                <label htmlFor="action-comment" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Comments (optional)</label>
                <textarea
                  id="action-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="Add a note for the requester…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => act('approve')}
                  disabled={busy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                >
                  {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Approve
                </button>
                <button
                  onClick={() => act('reject')}
                  disabled={busy !== null}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                >
                  {busy === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Reject
                </button>
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
                This is a secure, single-use action link from 3Boxes HRMS. Acting here is equivalent to
                approving inside the HRMS platform and is recorded in the audit trail.
              </p>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="text-center text-[11px] text-slate-400 pb-6 px-4">
        3Boxes HRMS · People · Process · Technology — A Proud Product of Marq AI Tech Pvt Ltd
      </footer>
    </div>
  );
}
