'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FiLock, FiArrowLeft, FiCheckCircle, FiEye, FiEyeOff, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

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
  // TC_030/TC_031: preflight token validation state
  const [tokenCheck, setTokenCheck] = useState<'loading' | 'valid' | 'expired' | 'used' | 'invalid' | 'error'>('loading');
  const [tokenMessage, setTokenMessage] = useState('');
  // TC_034/TC_035: inline validation errors
  const [pwError, setPwError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  useEffect(() => {
    if (!emailFromUrl || !tokenFromUrl) {
      toast.error('Invalid reset link. Please request a new password reset link.');
      router.replace('/forgot-password');
      return;
    }
    // TC_030/TC_031: Preflight — check token validity before showing the form
    (async () => {
      try {
        const res = await fetch(`/api/auth/reset-password?email=${encodeURIComponent(emailFromUrl)}&token=${encodeURIComponent(tokenFromUrl)}`);
        const data = await res.json();
        if (data.valid === true) {
          setTokenCheck('valid');
        } else if (data.reason === 'expired') {
          setTokenCheck('expired');
          setTokenMessage(data.message || 'This password reset link has expired. Please request a new link.');
        } else if (data.reason === 'used') {
          setTokenCheck('used');
          setTokenMessage(data.message || 'This password reset link has already been used or is no longer valid.');
        } else {
          setTokenCheck('invalid');
          setTokenMessage(data.message || 'This password reset link is invalid. Please request a new link.');
        }
      } catch {
        setTokenCheck('error');
        setTokenMessage('Unable to validate the reset link. Please try again or request a new link.');
      }
    })();
  }, [emailFromUrl, tokenFromUrl, router]);

  // TC_034: inline password length validation
  const handlePwChange = (val: string) => {
    setNewPassword(val);
    if (val && val.length < 8) {
      setPwError('Password must be at least 8 characters.');
    } else if (val && val.length > 128) {
      setPwError('Password must not exceed 128 characters.');
    } else {
      setPwError('');
    }
    // TC_035: re-check match when password changes
    if (confirmPassword && val !== confirmPassword) {
      setConfirmError('Passwords do not match.');
    } else {
      setConfirmError('');
    }
  };

  // TC_035: inline password match validation
  const handleConfirmChange = (val: string) => {
    setConfirmPassword(val);
    if (val && val !== newPassword) {
      setConfirmError('Passwords do not match.');
    } else {
      setConfirmError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TC_034: validate password length before submission
    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters.');
      return;
    }
    // TC_035: validate password match before submission
    if (newPassword !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        toast.success('Password reset successfully!');
      } else {
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

  // TC_030/TC_031: Show expired/used/invalid message instead of the form
  if (tokenCheck === 'loading') {
    return (
      <div className="text-center py-8">
        <div className="animate-spin inline-block h-8 w-8 border-4 border-slate-200 border-t-emerald-500 rounded-full mb-3" />
        <p className="text-sm text-slate-500">Validating reset link...</p>
      </div>
    );
  }

  if (tokenCheck !== 'valid') {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <FiAlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">
                {tokenCheck === 'expired' ? 'Link Expired' : tokenCheck === 'used' ? 'Link Already Used' : 'Invalid Link'}
              </p>
              <p className="text-xs">{tokenMessage}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => router.push('/forgot-password')}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <FiArrowLeft className="w-4 h-4" /> Request New Link
        </button>
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
            onChange={e => handlePwChange(e.target.value)}
            required
            autoFocus
            placeholder="Minimum 8 characters"
            className={`w-full pl-11 pr-10 py-2.5 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${pwError ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-emerald-400'}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
          </button>
        </div>
        {/* TC_034: inline password validation message */}
        {pwError && <p className="text-xs text-red-600 mt-1">{pwError}</p>}
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
            onChange={e => handleConfirmChange(e.target.value)}
            required
            placeholder="Re-enter your new password"
            className={`w-full pl-11 pr-10 py-2.5 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${confirmError ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-emerald-400'}`}
          />
        </div>
        {/* TC_035: inline password match validation message */}
        {confirmError && <p className="text-xs text-red-600 mt-1">{confirmError}</p>}
      </div>
      <button
        type="submit"
        disabled={submitting || !!pwError || !!confirmError}
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
