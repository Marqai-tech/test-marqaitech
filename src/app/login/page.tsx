'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);

  const demoAccounts = [
    { role: 'Super Admin', email: 'admin@nexushrms.com', password: 'admin123', color: 'bg-amber-500' },
    { role: 'HR Admin', email: 'hr@nexushrms.com', password: 'hr123', color: 'bg-blue-500' },
    { role: 'Manager', email: 'manager@nexushrms.com', password: 'manager123', color: 'bg-violet-500' },
    { role: 'Employee', email: 'employee@nexushrms.com', password: 'employee123', color: 'bg-emerald-500' },
  ];

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError('');
    setIsSubmitting(true);

    try {
      const success = await login(demoEmail, demoPassword);
      if (success) {
        toast.success('Welcome back! Redirecting...');
        router.push('/home');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      toast.error('Please enter your email address');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password');
      toast.error('Please enter your password');
      return;
    }

    setIsSubmitting(true);

    try {
      const success = await login(email, password);
      if (success) {
        toast.success('Welcome back! Redirecting...');
        router.push('/home');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-violet-950" />

      {/* Animated Background Orbs */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-pulse-subtle" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl animate-pulse-subtle" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-3xl" />

      {/* Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="nexus-card p-8 shadow-2xl border-white/10 bg-white/[0.97]">
          {/* Brand Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 mb-4 shadow-lg shadow-blue-500/25">
              <HiShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-bold gradient-text tracking-tight">
              NEXUS HRMS
            </h1>
            <p className="text-nexus-text-secondary mt-2 text-sm font-medium">
              SaaS-Based AI HRMS Platform
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 animate-slide-in-down">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-nexus-text-primary mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <FiMail className="h-[18px] w-[18px] text-nexus-text-muted" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="you@company.com"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-nexus-border bg-slate-50/50 text-nexus-text-primary placeholder:text-nexus-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all text-sm"
                  autoComplete="email"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-nexus-text-primary mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <FiLock className="h-[18px] w-[18px] text-nexus-text-muted" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Enter your password"
                  className="w-full pl-11 pr-12 py-3 rounded-xl border border-nexus-border bg-slate-50/50 text-nexus-text-primary placeholder:text-nexus-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all text-sm"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-nexus-text-muted hover:text-nexus-text-secondary transition-colors"
                >
                  {showPassword ? (
                    <FiEyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <FiEye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:from-blue-600 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-lg"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <FiArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {/* Demo Accounts */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowDemoAccounts(!showDemoAccounts)}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-nexus-text-muted hover:text-nexus-text-secondary transition-colors py-1"
              >
                {showDemoAccounts ? <FiChevronUp className="w-3.5 h-3.5" /> : <FiChevronDown className="w-3.5 h-3.5" />}
                Demo Accounts
              </button>
              {showDemoAccounts && (
                <div className="mt-3 space-y-2 animate-slide-in-down">
                  <p className="text-[11px] text-nexus-text-muted text-center font-medium">Quick Access Demo Accounts</p>
                  <div className="grid grid-cols-2 gap-2">
                    {demoAccounts.map((account) => (
                      <button
                        key={account.role}
                        type="button"
                        onClick={() => handleDemoLogin(account.email, account.password)}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-nexus-border bg-slate-50/50 hover:bg-slate-100 hover:border-slate-300 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${account.color} shrink-0`} />
                        <span className="text-xs font-semibold text-nexus-text-primary truncate">{account.role}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-nexus-border text-center">
            <p className="text-xs text-nexus-text-muted">
              Protected by enterprise-grade security
            </p>
          </div>
        </div>

        {/* Bottom attribution */}
        <p className="text-center mt-6 text-xs text-slate-400">
          &copy; {new Date().getFullYear()} NEXUS HRMS. All rights reserved.
        </p>
      </div>
    </div>
  );
}
