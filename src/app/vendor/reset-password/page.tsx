'use client';

/**
 * Vendor password recovery step 2 — /vendor/reset-password?token=...
 *
 * Validates the single-use token via /api/vendor/auth/reset-info (shows a
 * masked work email first), then sets the new password through
 * /api/vendor/auth/reset-password. Invalid / expired / disabled states get
 * distinct, helpful screens and the raw token is never displayed.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FiKey, FiInfo, FiCheckCircle, FiAlertTriangle, FiLoader } from 'react-icons/fi';

interface ResetInfo {
  valid: boolean;
  emailMasked?: string;
  companyName?: string | null;
  error?: string;
  code?: string;
}

const ERROR_TITLES: Record<string, string> = {
  INVALID_TOKEN: 'This reset link is not valid',
  EXPIRED_TOKEN: 'Reset link expired',
  PENDING_INVITE: 'Account not activated yet',
  ACCOUNT_DISABLED: 'Account disabled',
};

export default function VendorResetPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [info, setInfo] = useState<ResetInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const loadInfo = useCallback(async () => {
    if (!token) { setInfo({ valid: false, error: 'Missing reset token in the URL. Use the link from your email.', code: 'INVALID_TOKEN' }); setInfoLoading(false); return; }
    setInfoLoading(true);
    try {
      const res = await fetch(`/api/vendor/auth/reset-info?token=${encodeURIComponent(token)}`);
      const d = await res.json().catch(() => ({ valid: false, error: 'Could not validate this reset link.' }));
      setInfo(d);
    } catch {
      setInfo({ valid: false, error: 'Network error while validating the reset link. Please try again.' });
    } finally { setInfoLoading(false); }
  }, [token]);

  useEffect(() => { queueMicrotask(() => void loadInfo()); }, [loadInfo]);

  const policyOk = password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);

  const submit = async () => {
    setErr(''); setMsg('');
    if (!policyOk) { setErr('Password must be at least 8 characters and include letters and numbers.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/vendor/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data?.error || 'Failed to update the password.'); return; }
      setMsg('Password updated! Redirecting you to the Vendor login…');
      setTimeout(() => router.push('/login'), 1800);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Network error.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full max-w-md p-7">
        <div className="flex items-center gap-3 mb-1.5">
          <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center"><FiKey className="w-5 h-5" /></span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Set a new password</h1>
            <p className="text-xs text-slate-500">Vendor BGV Portal — password recovery.</p>
          </div>
        </div>

        {infoLoading ? (
          <div className="py-12 flex flex-col items-center gap-2 text-slate-500">
            <FiLoader className="h-6 w-6 animate-spin text-teal-600" />
            <p className="text-sm">Validating your reset link…</p>
          </div>
        ) : !info?.valid ? (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <FiAlertTriangle className="h-7 w-7 text-amber-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-800">{ERROR_TITLES[info?.code || ''] || 'Reset link problem'}</p>
            <p className="text-xs text-slate-600 mt-1">{info?.error || 'This link cannot be used.'}</p>
            <button onClick={() => router.push('/vendor/forgot-password')} className="mt-4 text-xs font-medium text-teal-700 hover:text-teal-800 underline">Request a new reset link</button>
            <p className="text-[11px] text-slate-400 mt-3">Reset links are single-use and expire after 60 minutes.</p>
          </div>
        ) : (
          <>
            <div className="mt-5 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
              {info.companyName && <div className="flex justify-between gap-3"><span className="text-slate-500">Company</span><span className="font-medium text-slate-800 text-right">{info.companyName}</span></div>}
              <div className="flex justify-between gap-3"><span className="text-slate-500">Work email</span><span className="font-medium text-slate-800">{info.emailMasked}</span></div>
            </div>
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-800 flex items-start gap-2">
              <FiInfo className="mt-0.5 shrink-0" /> Secure single-use recovery link — it stops working once the password is changed.
            </div>

            <div className="mt-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">New password *</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 pr-10" placeholder="••••••••" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPw(!showPw)} aria-label="Toggle password visibility"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600">{showPw ? 'Hide' : 'Show'}</button>
                </div>
                <div className="mt-1.5 space-y-0.5">
                  <Policy ok={password.length >= 8} label="At least 8 characters" />
                  <Policy ok={/[A-Za-z]/.test(password) && /[0-9]/.test(password)} label="Includes letters and numbers" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Confirm new password *</label>
                <input type={showPw ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5" placeholder="••••••••" autoComplete="new-password" />
              </div>
            </div>

            {err && <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{err}</div>}
            {msg && <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700 flex items-center gap-2"><FiCheckCircle /> {msg}</div>}

            <button onClick={submit} disabled={loading || !policyOk || password !== confirm}
              className="mt-5 w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {loading ? <><FiLoader className="animate-spin" /> Updating…</> : <><FiCheckCircle /> Update password</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Policy({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className={`text-[11px] flex items-center gap-1.5 ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} /> {label}
    </p>
  );
}
