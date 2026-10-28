'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FiLock, FiArrowLeft, FiCheckCircle, FiEye, FiEyeOff, FiX, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { validatePasswordStrength } from '@/lib/validators';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const emailFromUrl = searchParams.get('email') || '';
  const tokenFromUrl = searchParams.get('token') || '';

  const [email, setEmail] = useState(emailFromUrl);
  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  // BUG_005/006/007: surface specific token failure reasons from the API
  const [tokenError, setTokenError] = useState<{ message: string; code?: string } | null>(null);
  // BUG_009: live mismatch indicator
  const [mismatchError, setMismatchError] = useState('');

  useEffect(() => {
    if (!emailFromUrl || !tokenFromUrl) {
      toast.error('Invalid reset link. Please request a new password reset link.');
      router.replace('/forgot-password');
    }
  }, [emailFromUrl, tokenFromUrl, router]);

  // BUG_008: live password policy feedback as the user types
  const pwStrength = validatePasswordStrength(newPassword);

  // BUG_009: live mismatch feedback (only after the user starts typing confirm)
  useEffect(() => {
    if (confirmPassword && newPassword !== confirmPassword) {
      setMismatchError('Passwords do not match');
    } else {
      setMismatchError('');
    }
  }, [newPassword, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // BUG_008: enforce password policy client-side too (defence in depth with
    // the API). Rejects "123456" with a clear policy message.
    if (!pwStrength.valid) {
      toast.error(pwStrength.error || 'Password does not meet policy requirements');
      return;
    }
    // BUG_009: explicit mismatch validation
    if (newPassword !== confirmPassword) {
      setMismatchError('Passwords do not match');
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        toast.success('Password reset successfully!');
      } else {
        // BUG_005/006/007: capture the specific token failure reason so we can
        // show the right message + a "request new link" CTA.
        setTokenError({ message: data.error || 'Failed to reset password', code: data.code });
        toast.error(data.error || 'Failed to reset password');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
          <div className="flex items-start gap-2">
            <FiCheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">Password reset successfully!</p>
              <p className="text-xs">You can now log in with your new password.</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => router.push('/login')}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <FiArrowLeft className="w-4 h-4" /> Go to Login
        </button>
      </div>
    );
  }

  // BUG_005/006/007: token failure screen with a "request a new link" CTA
  if (tokenError) {
    const isTokenFailure = ['TOKEN_EXPIRED', 'TOKEN_ALREADY_USED', 'TOKEN_SUPERSEDED', 'TOKEN_INVALID'].includes(tokenError.code || '');
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <FiX className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">
                {tokenError.code === 'TOKEN_EXPIRED' && 'Reset link expired'}
                {tokenError.code === 'TOKEN_ALREADY_USED' && 'Link already used'}
                {tokenError.code === 'TOKEN_SUPERSEDED' && 'Link superseded'}
                {(!tokenError.code || tokenError.code === 'TOKEN_INVALID') && 'Invalid reset link'}
                {tokenError.code === 'WEAK_PASSWORD' && 'Password too weak'}
              </p>
              <p className="text-xs">{tokenError.message}</p>
            </div>
          </div>
        </div>
        {isTokenFailure ? (
          <button
            onClick={() => router.push('/forgot-password')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <FiArrowLeft className="w-4 h-4" /> Request a new reset link
          </button>
        ) : (
          <button
            onClick={() => setTokenError(null)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            Try again
          </button>
        )}
        <Link href="/login" className="block text-center text-xs text-slate-500 hover:text-emerald-600 mt-3">
          <FiArrowLeft className="inline w-3 h-3 mr-1" /> Back to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          readOnly={!!emailFromUrl}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 read-only:bg-slate-50"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">New Password <span className="text-red-500">*</span></label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <FiLock className="h-[18px] w-[18px] text-slate-400" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            autoFocus
            placeholder="Minimum 8 characters"
            aria-invalid={!pwStrength.valid && newPassword.length > 0}
            className={`w-full pl-11 pr-10 py-2.5 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
              newPassword.length > 0 && !pwStrength.valid
                ? 'border-amber-300 focus:border-amber-400'
                : newPassword.length > 0 && pwStrength.valid
                  ? 'border-emerald-300 focus:border-emerald-400'
                  : 'border-slate-200 focus:border-emerald-400'
            }`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
          </button>
        </div>
        {/* BUG_008 fix: live password policy checklist */}
        {newPassword.length > 0 && (
          <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Password must contain:</p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <PolicyCheck ok={pwStrength.checks.minLength} label="At least 8 characters" />
              <PolicyCheck ok={pwStrength.checks.uppercase} label="One uppercase letter (A-Z)" />
              <PolicyCheck ok={pwStrength.checks.lowercase} label="One lowercase letter (a-z)" />
              <PolicyCheck ok={pwStrength.checks.digit} label="One digit (0-9)" />
              <PolicyCheck ok={pwStrength.checks.special} label="One special character (!@#$…)" />
              <PolicyCheck ok={pwStrength.score >= 4} label={`Strength: ${pwStrength.label}`} />
            </ul>
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm Password <span className="text-red-500">*</span></label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <FiLock className="h-[18px] w-[18px] text-slate-400" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            placeholder="Re-enter your new password"
            aria-invalid={!!mismatchError}
            className={`w-full pl-11 pr-10 py-2.5 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
              mismatchError
                ? 'border-red-400 focus:border-red-400'
                : confirmPassword && !mismatchError
                  ? 'border-emerald-300 focus:border-emerald-400'
                  : 'border-slate-200 focus:border-emerald-400'
            }`}
          />
        </div>
        {/* BUG_009 fix: live mismatch validation message */}
        {mismatchError && (
          <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
            <FiX className="w-3 h-3" /> {mismatchError}
          </p>
        )}
        {confirmPassword && !mismatchError && (
          <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
            <FiCheck className="w-3 h-3" /> Passwords match
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={submitting || !pwStrength.valid || !!mismatchError || !confirmPassword}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-500/25"
      >
        {submitting ? (
          <>
            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            Resetting...
          </>
        ) : (
          'Reset Password'
        )}
      </button>
      <Link href="/login" className="block text-center text-xs text-slate-500 hover:text-emerald-600 mt-3">
        <FiArrowLeft className="inline w-3 h-3 mr-1" /> Back to login
      </Link>
    </form>
  );
}

function PolicyCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? 'text-emerald-700' : 'text-slate-500'}`}>
      {ok ? <FiCheck className="w-3 h-3 flex-shrink-0" /> : <FiX className="w-3 h-3 flex-shrink-0" />}
      <span>{label}</span>
    </li>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-green-50/30 to-emerald-50/40 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white mb-4 shadow-lg">
              <FiLock className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
            <p className="text-sm text-slate-500 mt-2">Enter your new password below.</p>
          </div>
          <Suspense fallback={<div className="text-center text-sm text-slate-400">Loading...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">
          3Boxes HRMS · People · Process · Technology
        </p>
      </div>
    </div>
  );
}
