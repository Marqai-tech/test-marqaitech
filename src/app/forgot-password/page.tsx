'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FiMail, FiArrowLeft, FiSend, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { validateEmail } from '@/lib/validators';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (emailError) setEmailError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // BUG_004 fix: client-side email format validation. Rejects "abc", "abc@",
    // "abc@.com", "@gmail.com" before the request is sent.
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      setEmailError(emailCheck.error || 'Invalid email format');
      toast.error(emailCheck.error || 'Invalid email format');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
        toast.success('Reset link sent (if the email exists in our system)');
      } else {
        // BUG_004 fix: surface server-side format errors clearly
        setEmailError(data.error || 'Invalid email format');
        toast.error(data.error || 'Failed to send reset link');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset link');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-green-50/30 to-emerald-50/40 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white mb-4 shadow-lg">
              <FiMail className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Forgot password?</h1>
            <p className="text-sm text-slate-500 mt-2">
              {submitted
                ? 'Check your inbox for the reset link (it expires in 30 minutes).'
                : 'Enter your official email address and we\'ll send you a reset link.'}
            </p>
          </div>

          {submitted ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
                <div className="flex items-start gap-2">
                  <FiCheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium mb-1">Reset link sent</p>
                    <p className="text-xs">If an account with <strong>{email}</strong> exists, you&apos;ll receive an email with a password reset link. The link is valid for 30 minutes.</p>
                    <p className="text-xs mt-2 text-emerald-700">Didn&apos;t get the email? Check your spam folder, then <button type="button" onClick={() => setSubmitted(false)} className="underline font-medium">try again</button>.</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => router.push('/login')}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <FiArrowLeft className="w-4 h-4" /> Back to login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <FiMail className="h-[18px] w-[18px] text-slate-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => handleEmailChange(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoFocus
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'email-error' : undefined}
                    className={`w-full pl-11 pr-4 py-3 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 ${
                      emailError ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    }`}
                  />
                </div>
                {emailError && (
                  <p id="email-error" className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                    <span aria-hidden>⚠</span> {emailError}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-500/25"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Sending...
                  </>
                ) : (
                  <>
                    <FiSend className="w-4 h-4" /> Send Reset Link
                  </>
                )}
              </button>
              <Link href="/login" className="block text-center text-xs text-slate-500 hover:text-emerald-600 mt-3">
                <FiArrowLeft className="inline w-3 h-3 mr-1" /> Back to login
              </Link>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">
          3Boxes HRMS · People · Process · Technology
        </p>
      </div>
    </div>
  );
}
