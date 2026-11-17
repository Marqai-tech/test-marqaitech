'use client';

/**
 * Vendor password recovery step 1 — /vendor/forgot-password
 * (mock screen 04 — "password recovery" on the Vendor login tab)
 *
 * Asks for the work email and posts it to /api/vendor/auth/forgot-password.
 * The response is deliberately neutral: whether or not the email exists,
 * the user sees the same guidance (no account-existence leak). Delivery
 * failures are reported honestly.
 */
import { useState } from 'react';
import Link from 'next/link';
import { FiLock, FiMail, FiCheckCircle, FiLoader, FiAlertTriangle, FiArrowLeft } from 'react-icons/fi';

export default function VendorForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const valid = /.+@.+\..+/.test(email.trim());

  const submit = async () => {
    setErr(''); setWarn(null);
    if (!valid) { setErr('Enter a valid work email address.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/vendor/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data?.error || 'Could not process the request. Please try again.'); return; }
      if (data?.delivered === false) {
        setWarn(data?.message || 'The email could not be sent right now. Please try again shortly.');
      } else {
        setDone(data?.message || 'If this email belongs to an active vendor account, a password reset link has been sent.');
      }
    } catch {
      setErr('Network error. Please check your connection and try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full max-w-md p-7">
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center"><FiLock className="w-5 h-5" /></span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Reset your password</h1>
            <p className="text-xs text-slate-500">Vendor BGV Portal — password recovery.</p>
          </div>
        </div>

        {done ? (
          <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <FiCheckCircle className="h-7 w-7 text-emerald-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-800">Check your inbox</p>
            <p className="text-xs text-slate-600 mt-1">{done}</p>
            <Link href="/login" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800 underline">
              <FiArrowLeft className="w-3 h-3" /> Back to login
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-600">Enter the work email you use for the Vendor BGV Portal and we will email you a single-use reset link.</p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5"><FiMail className="w-3.5 h-3.5" /> Work email *</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5" placeholder="you@company.com" autoComplete="email" autoFocus />
              </label>
            </div>

            {warn && <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2"><FiAlertTriangle className="mt-0.5 shrink-0" /> {warn}</div>}
            {err && <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{err}</div>}

            <button onClick={submit} disabled={loading || !valid}
              className="mt-5 w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {loading ? <><FiLoader className="animate-spin" /> Sending…</> : <>Email me a reset link</>}
            </button>
            <p className="mt-4 text-center">
              <Link href="/login" className="text-xs font-medium text-slate-500 hover:text-teal-700 underline">Back to login</Link>
            </p>
            <p className="mt-2 text-[11px] text-slate-400 text-center">Invitation pending or expired? Ask your vendor admin to resend the invitation.</p>
          </>
        )}
      </div>
    </div>
  );
}
