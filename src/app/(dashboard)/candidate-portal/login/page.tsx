'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { FiMail, FiLock, FiArrowRight } from 'react-icons/fi';

export default function CandidateLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const requestOtp = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/candidate-portal/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setStep('verify');
      if (d.devOtp) setDevOtp(d.devOtp);
      toast.success('OTP sent — check your email');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/candidate-portal/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      if (typeof window !== 'undefined') {
        localStorage.setItem('tb_candidate_token', d.token);
        localStorage.setItem('tb_candidate_email', email);
      }
      toast.success('Welcome!');
      router.push('/candidate-portal/dashboard');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-white to-sky-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-sky-500 text-white mb-3 shadow-lg">
            <FiMail className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Candidate Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Track your applications, interviews, and resume insights</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4">
          {step === 'request' ? (
            <>
              <div>
                <label className="text-xs font-medium text-slate-700 uppercase tracking-wider">Email Address</label>
                <div className="mt-1 relative">
                  <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    onKeyDown={(e) => e.key === 'Enter' && requestOtp()}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Use the same email you applied with.</p>
              </div>
              <button
                onClick={requestOtp}
                disabled={loading || !email}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? 'Sending...' : <>Send OTP <FiArrowRight className="w-4 h-4" /></>}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-slate-700 uppercase tracking-wider">Enter OTP</label>
                <div className="mt-1 relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                    onKeyDown={(e) => e.key === 'Enter' && verifyOtp()}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">A 6-digit code was sent to {email}.</p>
                {devOtp && (
                  <p className="text-[11px] text-amber-600 mt-1 bg-amber-50 px-2 py-1 rounded">
                    <strong>Dev mode:</strong> Your OTP is <code className="font-mono font-bold">{devOtp}</code>
                  </p>
                )}
              </div>
              <button
                onClick={verifyOtp}
                disabled={loading || otp.length !== 6}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? 'Verifying...' : <>Verify & Continue <FiArrowRight className="w-4 h-4" /></>}
              </button>
              <button
                onClick={() => { setStep('request'); setOtp(''); setDevOtp(null); }}
                className="w-full text-xs text-slate-500 hover:text-slate-700"
              >
                ← Use a different email
              </button>
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4">
          By signing in you agree to our <a href="/recruitment/pii-policy" className="underline">PII & Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
