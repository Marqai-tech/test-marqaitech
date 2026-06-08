'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight,
  FiChevronDown, FiChevronUp, FiSmartphone, FiDownload,
  FiMonitor, FiTablet, FiX, FiCheck, FiWifi,
  FiRefreshCw, FiShield, FiZap, FiGlobe
} from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);
  const [showMobileApp, setShowMobileApp] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const demoAccounts = [
    { role: 'Super Admin', email: 'admin@nexushrms.com', password: 'admin123', color: 'bg-amber-500', desc: 'Full system access' },
    { role: 'HR Admin', email: 'hr@nexushrms.com', password: 'hr123', color: 'bg-blue-500', desc: 'HR management' },
    { role: 'Manager', email: 'manager@nexushrms.com', password: 'manager123', color: 'bg-violet-500', desc: 'Team management' },
    { role: 'Employee', email: 'employee@nexushrms.com', password: 'employee123', color: 'bg-emerald-500', desc: 'Self-service portal' },
    { role: 'Recruiter', email: 'recruiter@nexushrms.com', password: 'recruiter123', color: 'bg-pink-500', desc: 'Recruitment & AI interviews' },
    { role: 'Candidate', email: 'candidate@nexushrms.com', password: 'candidate123', color: 'bg-cyan-500', desc: 'Interview & application' },
  ];

  // Detect platform and PWA install capability
  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream);
    setIsAndroid(/Android/.test(ua));

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handlePWAInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        toast.success('NEXUS HRMS app installed successfully!');
        setDeferredPrompt(null);
      }
    } catch (err) {
      console.error('Install error:', err);
    }
  }, [deferredPrompt]);

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

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-5xl mx-4 flex flex-col lg:flex-row gap-6 items-stretch">

        {/* Left: Login Card */}
        <div className="w-full lg:w-[420px] shrink-0">
          <div className="nexus-card p-8 shadow-2xl border-white/10 bg-white/[0.97]">
            {/* Brand Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 mb-4 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/20">
                <svg viewBox="0 0 30 30" className="w-9 h-9" fill="none">
                  <path d="M15 2L3 8V16C3 24 8.1 31.2 15 33C21.9 31.2 27 24 27 16V8L15 2Z" fill="rgba(255,255,255,0.2)" stroke="white" strokeWidth="0.5"/>
                  <path d="M9 23V11H12.5L20 20V11H23V23H19.5L12 14V23H9Z" fill="white"/>
                </svg>
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="gradient-text">NEXUS</span>
                <span className="text-blue-500 ml-1 text-xl font-extrabold">HRMS</span>
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
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
              <div className="mt-2">
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
                          className="flex items-center gap-2 p-2.5 rounded-lg border border-nexus-border bg-slate-50/50 hover:bg-slate-100 hover:border-slate-300 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${account.color} shrink-0`} />
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-nexus-text-primary block truncate">{account.role}</span>
                            <span className="text-[10px] text-nexus-text-muted block truncate">{account.desc}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </form>

            {/* Footer */}
            <div className="mt-6 pt-5 border-t border-nexus-border text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-nexus-text-muted">
                <HiShieldCheck className="w-3.5 h-3.5 text-green-500" />
                Protected by enterprise-grade security
              </div>
            </div>
          </div>

          {/* Bottom attribution */}
          <p className="text-center mt-4 text-xs text-slate-400">
            &copy; {new Date().getFullYear()} NEXUS HRMS. All rights reserved.
          </p>
        </div>

        {/* Right: Mobile App Download Section */}
        <div className="flex-1 min-w-0">
          <div className="nexus-card p-8 shadow-2xl border-white/10 bg-white/[0.97] h-full flex flex-col">
            {/* Section Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-100 mb-4">
                <FiSmartphone className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-blue-600">Mobile App Available</span>
              </div>
              <h2 className="text-2xl font-bold text-nexus-text-primary">
                Get NEXUS HRMS on Your Device
              </h2>
              <p className="text-sm text-nexus-text-secondary mt-2 max-w-md mx-auto">
                Install the app for instant access, offline support, and native-like experience. 
                Updates are automatic — always stay in sync with the latest features.
              </p>
            </div>

            {/* Install Button / Platform-specific instructions */}
            <div className="flex-1 flex flex-col justify-center">
              {/* Direct Install (Android/Chrome with beforeinstallprompt) */}
              {deferredPrompt && !isStandalone && (
                <div className="mb-6">
                  <button
                    onClick={handlePWAInstall}
                    className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 text-white font-bold text-base shadow-lg shadow-blue-500/25 hover:shadow-xl hover:from-blue-600 hover:to-violet-700 transition-all"
                  >
                    <FiDownload className="w-5 h-5" />
                    Install NEXUS HRMS App
                  </button>
                  <p className="text-xs text-center text-nexus-text-muted mt-3">
                    One-tap install for Android &amp; Chrome
                  </p>
                </div>
              )}

              {/* Platform Instructions */}
              <div className="space-y-4">
                {/* Android Instructions */}
                <div className={`p-4 rounded-xl border ${isAndroid ? 'border-green-200 bg-green-50/50' : 'border-nexus-border bg-slate-50/50'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <path d="M17.523 15.341a.641.641 0 01-.64.641.641.641 0 01-.64-.64c0-.354.287-.641.64-.641.354 0 .64.287.64.64zm-10.246 0a.641.641 0 01-.64.641.641.641 0 01-.64-.64c0-.354.287-.641.64-.641.354 0 .64.287.64.64z" fill="#3DDC84"/>
                        <path d="M6.978 13.277V8.36l5.022 2.922-5.022 2.995zm10.044-4.917v4.917l-5.022-2.995 5.022-2.922z" fill="#3DDC84"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-nexus-text-primary">Android</h3>
                      <p className="text-[11px] text-nexus-text-secondary">Chrome browser required</p>
                    </div>
                    {isAndroid && (
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">YOUR DEVICE</span>
                    )}
                  </div>
                  <ol className="space-y-1.5 text-xs text-nexus-text-secondary">
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                      Open this page in <span className="font-medium text-nexus-text-primary">Chrome browser</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">2</span>
                      Tap the <span className="font-medium text-nexus-text-primary">three-dot menu</span> in the top right
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">3</span>
                      Select <span className="font-medium text-nexus-text-primary">&quot;Install app&quot;</span> or &quot;Add to Home Screen&quot;
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">4</span>
                      Tap <span className="font-medium text-nexus-text-primary">&quot;Install&quot;</span> to confirm
                    </li>
                  </ol>
                </div>

                {/* iOS Instructions */}
                <div className={`p-4 rounded-xl border ${isIOS ? 'border-slate-300 bg-slate-50/50' : 'border-nexus-border bg-slate-50/50'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83" fill="#333"/>
                        <path d="M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill="#333"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-nexus-text-primary">iPhone / iPad</h3>
                      <p className="text-[11px] text-nexus-text-secondary">Safari browser required</p>
                    </div>
                    {isIOS && (
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">YOUR DEVICE</span>
                    )}
                  </div>
                  <ol className="space-y-1.5 text-xs text-nexus-text-secondary">
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                      Open this page in <span className="font-medium text-nexus-text-primary">Safari browser</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">2</span>
                      Tap the <span className="font-medium text-nexus-text-primary">Share button</span> at the bottom
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">3</span>
                      Scroll down and tap <span className="font-medium text-nexus-text-primary">&quot;Add to Home Screen&quot;</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">4</span>
                      Tap <span className="font-medium text-nexus-text-primary">&quot;Add&quot;</span> to confirm
                    </li>
                  </ol>
                </div>

                {/* Desktop Instructions */}
                <div className={`p-4 rounded-xl border border-nexus-border bg-slate-50/50 ${!isIOS && !isAndroid ? 'ring-2 ring-blue-200' : ''}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <FiMonitor className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-nexus-text-primary">Desktop / Laptop</h3>
                      <p className="text-[11px] text-nexus-text-secondary">Chrome or Edge browser</p>
                    </div>
                    {!isIOS && !isAndroid && (
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">YOUR DEVICE</span>
                    )}
                  </div>
                  <ol className="space-y-1.5 text-xs text-nexus-text-secondary">
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                      Look for the <span className="font-medium text-nexus-text-primary">install icon</span> in the address bar
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">2</span>
                      Or click <span className="font-medium text-nexus-text-primary">three-dot menu → Install NEXUS HRMS</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 text-[10px] font-bold">3</span>
                      Click <span className="font-medium text-nexus-text-primary">&quot;Install&quot;</span> to open as a desktop app
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Auto-update Feature Highlight */}
            <div className="mt-6 pt-5 border-t border-nexus-border">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mx-auto mb-1.5">
                    <FiRefreshCw className="w-4 h-4 text-blue-500" />
                  </div>
                  <p className="text-[10px] font-semibold text-nexus-text-primary">Auto Updates</p>
                  <p className="text-[9px] text-nexus-text-muted mt-0.5">Always latest version</p>
                </div>
                <div className="text-center p-2">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center mx-auto mb-1.5">
                    <FiWifi className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-[10px] font-semibold text-nexus-text-primary">Works Offline</p>
                  <p className="text-[9px] text-nexus-text-muted mt-0.5">Access without internet</p>
                </div>
                <div className="text-center p-2">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center mx-auto mb-1.5">
                    <FiShield className="w-4 h-4 text-violet-500" />
                  </div>
                  <p className="text-[10px] font-semibold text-nexus-text-primary">Secure</p>
                  <p className="text-[9px] text-nexus-text-muted mt-0.5">Enterprise encryption</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile App Toggle for Small Screens */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 z-50">
        <button
          onClick={() => setShowMobileApp(!showMobileApp)}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold text-sm shadow-lg shadow-blue-500/25"
        >
          <FiSmartphone className="w-4 h-4" />
          {showMobileApp ? 'Back to Login' : 'Get Mobile App'}
          <FiDownload className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
