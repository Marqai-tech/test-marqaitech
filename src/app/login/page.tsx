'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight,
  FiChevronDown, FiChevronUp, FiSmartphone, FiDownload,
  FiMonitor, FiX, FiCheck, FiWifi,
  FiRefreshCw, FiShield, FiZap, FiGlobe,
  FiUsers, FiSettings, FiCpu, FiStar,
  FiPlay, FiArrowLeft, FiBriefcase, FiExternalLink,
  FiTarget, FiTrendingUp, FiGrid, FiUserCheck, FiCreditCard,
} from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import '@/lib/token-storage';
import { isClientLiveMode } from '@/lib/site-mode';
import { NATIVE_APP_RELEASE, SHELL_APP_RELEASE } from '@/lib/app-version';
import { validateEmail, validatePasswordRequired } from '@/lib/validators';
import { homeHrefForRole } from '@/lib/roleAccess';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [tenantInfo, setTenantInfo] = useState<{ name: string; slug: string; logo?: string | null } | null>(null);
  const [loginMode, setLoginMode] = useState<'user' | 'candidate'>('user');
  // Candidate login state
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePassword, setCandidatePassword] = useState('');
  const [candidateShowPassword, setCandidateShowPassword] = useState(false);
  const [candidateError, setCandidateError] = useState('');
  const [candidateOtp, setCandidateOtp] = useState('');
  const [candidateTab, setCandidateTab] = useState<'password' | 'otp'>('password');
  const [candidateStep, setCandidateStep] = useState<'request' | 'verify'>('request');
  const [candidateDevOtp, setCandidateDevOtp] = useState<string | null>(null);
  const [showDemoLogins, setShowDemoLogins] = useState(false);
  const [isDemoSite, setIsDemoSite] = useState(false);
  const [isPlatformSite, setIsPlatformSite] = useState(false);
  const [demoCredentials, setDemoCredentials] = useState<any>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  // Detect tenant from subdomain (e.g., marqaitechgroup.3boxeshrms.com)
  useEffect(() => {
    const detectTenant = async () => {
      try {
        const hostname = window.location.hostname;
        const parts = hostname.split('.');
        if (parts.length >= 3) {
          const sub = parts[0].toLowerCase();
          if (!['www', 'api', 'app', 'admin', 'mail', 'ftp', 'localhost', 'test', 'staging', 'dev'].includes(sub)) {
            const res = await fetch(`/api/public/tenant-info?slug=${encodeURIComponent(sub)}`);
            if (res.ok) {
              const data = await res.json();
              if (data.tenant) {
                setTenantInfo(data.tenant);
              }
            }
          }
        }
      } catch {
        // Silently ignore - tenant detection is best-effort
      }
    };
    detectTenant();
  }, []);

  // Detect site type and load appropriate credentials
  // Four site types:
  // 1. Demo site (nexus-hrms-mu.vercel.app / nexus-hrms-demo.vercel.app test link) — sample data with demo credentials
  // 2. Platform/main site (3boxeshrms.com) — super admin login for tenant management
  // 3. Tenant/client sites (*.3boxeshrms.com) — actual client data, branded login
  // 4. Unknown — generic login form
  useEffect(() => {
    const hostname = window.location.hostname;
    setIsDemoSite(
      hostname === 'nexus-hrms-mu.vercel.app' ||
      hostname === 'nexus-hrms-demo.vercel.app' ||
      hostname === '3boxes-hrms-mu.vercel.app' ||
      hostname === 'test.3boxeshrms.com'
    );
    setIsPlatformSite(
      hostname === '3boxeshrms.com' ||
      hostname === 'www.3boxeshrms.com' ||
      false
    );
  }, []);

  // Fetch demo credentials from API
  const fetchDemoCredentials = async () => {
    if (demoCredentials || demoLoading) return;
    setDemoLoading(true);
    try {
      const res = await fetch('/api/public/demo-credentials');
      if (res.ok) {
        const data = await res.json();
        setDemoCredentials(data);
      }
    } catch (e) {
      console.error('Failed to fetch demo credentials:', e);
    } finally {
      setDemoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Task 70 FIX: the old code called validateEmail() on every login
    // attempt, which REJECTED employee IDs (no '@') with "Invalid email
    // format". Now we only validate as email if the input looks like an
    // email (contains '@'). If it doesn't, we skip email validation and
    // let the server handle the employee-ID-based lookup.
    const looksLikeEmail = email.includes('@');
    if (looksLikeEmail) {
      const emailResult = validateEmail(email);
      if (!emailResult.valid) {
        setError(emailResult.error!);
        toast.error(emailResult.error!);
        return;
      }
    } else {
      // Input is an employee ID (no '@'). Basic validation: non-empty + min length.
      if (!email.trim() || email.trim().length < 2) {
        setError('Employee ID is too short (minimum 2 characters).');
        toast.error('Employee ID is too short (minimum 2 characters).');
        return;
      }
    }

    const passwordResult = validatePasswordRequired(password);
    if (!passwordResult.valid) {
      setError(passwordResult.error!);
      toast.error(passwordResult.error!);
      return;
    }

    setIsSubmitting(true);

    try {
      const success = await login(email, password, rememberMe);
      if (success) {
        toast.success('Welcome back! Redirecting...');
        // Redirect based on role:
        // Super admins land on the platform management dashboard in every environment.
        // Admin roles → /home (Admin Dashboard) · everyone else (employees,
        // managers, self-service) → /dashboard (Employee Dashboard) directly.
        const { user } = useAuthStore.getState();
        if (user?.role === 'super_admin') {
          router.push('/super-admin');
        } else {
          router.push(homeHrefForRole(user?.role));
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Candidate login handlers ───
  const handleCandidateLoginPassword = async () => {
    const emailResult = validateEmail(candidateEmail);
    if (!emailResult.valid) {
      setCandidateError(emailResult.error!);
      return;
    }
    if (!candidatePassword.trim()) {
      setCandidateError('Password is required');
      return;
    }
    setIsSubmitting(true);
    setCandidateError('');
    try {
      const r = await fetch('/api/candidate-portal/auth/login-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: candidateEmail, password: candidatePassword }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.code === 'USE_EMPLOYEE_LOGIN') {
          setEmail(candidateEmail);
          setPassword(candidatePassword);
          setLoginMode('user');
          setError(d.error || 'Use Employee / HR to sign in.');
          toast.error(d.error || 'Use Employee / HR to sign in.');
          return;
        }
        if (d.needsPasswordSetup) {
          setCandidateError('Please set up a password first via OTP.');
          setCandidateTab('otp');
        } else {
          throw new Error(d.error || 'Login failed');
        }
        return;
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('tb_candidate_token', d.token);
        localStorage.setItem('tb_candidate_email', candidateEmail);
      }
      toast.success('Welcome back! Redirecting to candidate portal...');
      router.push('/candidate-portal/dashboard');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setCandidateError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCandidateRequestOtp = async () => {
    const emailResult = validateEmail(candidateEmail);
    if (!emailResult.valid) {
      setCandidateError(emailResult.error!);
      return;
    }
    setIsSubmitting(true);
    setCandidateError('');
    try {
      const r = await fetch('/api/candidate-portal/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: candidateEmail }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setCandidateStep('verify');
      if (d.devOtp) setCandidateDevOtp(d.devOtp);
      toast.success('OTP sent — check your email');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send OTP';
      setCandidateError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCandidateVerifyOtp = async () => {
    if (candidateOtp.length !== 6) {
      setCandidateError('Please enter the 6-digit OTP');
      return;
    }
    setIsSubmitting(true);
    setCandidateError('');
    try {
      const r = await fetch('/api/candidate-portal/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: candidateEmail, otp: candidateOtp }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Verification failed');
      if (typeof window !== 'undefined') {
        localStorage.setItem('tb_candidate_token', d.token);
        localStorage.setItem('tb_candidate_email', candidateEmail);
      }
      if (d.needsPasswordSetup) {
        toast.success('OTP verified! Please set up a password.');
        router.push(`/candidate-portal/set-password?token=${encodeURIComponent(d.token)}&email=${encodeURIComponent(candidateEmail)}`);
      } else {
        toast.success('Welcome! Redirecting to candidate portal...');
        router.push('/candidate-portal/dashboard');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Verification failed';
      setCandidateError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const ThreeBoxesLogo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
    const dims = { sm: 'w-6 h-6', md: 'w-9 h-9', lg: 'w-12 h-12', xl: 'w-16 h-16' };
    const boxSize = { sm: 8, md: 11, lg: 15, xl: 19 };
    const gap = { sm: 1.5, md: 2, lg: 2.5, xl: 3 };
    const rx = { sm: 2, md: 2.5, lg: 3, xl: 4 };
    const s = boxSize[size];
    const g = gap[size];
    const r = rx[size];
    const totalW = (s * 3) + (g * 2);
    const totalH = s;

    return (
      <svg viewBox={`0 0 ${totalW} ${totalH}`} className={dims[size]} fill="none">
        <rect x="0" y="0" width={s} height={s} rx={r} fill="#059669" />
        <rect x={s + g} y="0" width={s} height={s} rx={r} fill="#10B981" />
        <rect x={(s + g) * 2} y="0" width={s} height={s} rx={r} fill="#22C55E" />
      </svg>
    );
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* ════════════════ LEFT — LOGIN FORM (Atconic split layout) ════════════════ */}
      <div className="w-full lg:w-[44%] xl:w-[42%] flex flex-col justify-center px-6 sm:px-10 xl:px-14 py-8 lg:py-10">
        <div className="w-full max-w-md mx-auto">
          {/* Brand row */}
          <div className="flex items-center gap-2.5 mb-8">
            {tenantInfo?.logo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tenantInfo.logo} alt={tenantInfo.name} className="w-10 h-10 rounded-xl object-contain ring-1 ring-slate-200" />
                <span className="text-xl font-extrabold text-[#16254E] tracking-tight truncate">{tenantInfo.name}</span>
              </>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/logo-3boxes-hrms.png" alt="3Boxes HRMS" className="w-10 h-10 rounded-xl object-contain ring-1 ring-slate-200" />
                <span className="text-xl font-extrabold text-[#16254E] tracking-tight">
                  3Boxes <span className="text-emerald-500">HRMS</span>
                </span>
              </>
            )}
          </div>

          {/* Mode Toggle: HR/Admin vs Candidate — HIDDEN on platform site */}
          {!isPlatformSite && (
          <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
            <button
              onClick={() => setLoginMode('user')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                loginMode === 'user' ? 'bg-white text-[#16254E] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <FiGrid className="w-4 h-4" /> Employee / HR
              </span>
            </button>
            <button
              onClick={() => setLoginMode('candidate')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                loginMode === 'candidate' ? 'bg-white text-[#16254E] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <FiBriefcase className="w-4 h-4" /> Job candidate
              </span>
            </button>
          </div>
          )}

          {/* Tenant / Super Admin banners */}
          {isPlatformSite && !tenantInfo && (
            <div className="mb-5 p-3 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#16254E] to-[#2A3B6E] flex items-center justify-center text-white">
                  <FiShield className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">3Boxes HRMS Super Admin</p>
                  <p className="text-[10px] text-slate-400">Platform Control Center</p>
                </div>
              </div>
            </div>
          )}
          {tenantInfo && !isPlatformSite && (
            <div className="mb-5 p-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100">
              <div className="flex items-center gap-2.5">
                {tenantInfo.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tenantInfo.logo} alt={tenantInfo.name} className="w-9 h-9 rounded-lg object-contain bg-white p-1" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm">
                    {tenantInfo.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-slate-800">{tenantInfo.name}</p>
                  <p className="text-[10px] text-slate-400">Organization Portal</p>
                </div>
              </div>
            </div>
          )}

          {/* Headline — reference image 1 */}
          <h1 className="text-[28px] sm:text-[32px] font-extrabold text-[#16254E] tracking-tight leading-tight mb-2">
            {isPlatformSite && !tenantInfo ? 'Welcome Back, Super Admin' : loginMode === 'user' ? 'Welcome Back' : 'Candidate Login'}
          </h1>
          <p className="text-[13px] sm:text-sm text-slate-500 leading-relaxed mb-4">
            {isPlatformSite && !tenantInfo
              ? 'Manage all tenants, approve trials, and control subscriptions.'
              : loginMode === 'user'
                ? "Today is a new day. It's your day. You shape it. Sign in to start managing your projects."
                : 'Track your applications, optimize your resume, and find matching jobs.'}
          </p>
          {isPlatformSite && (
            <div className="mb-5 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-semibold text-emerald-700">LIVE PRODUCTION</span>
              <span className="text-[9px] text-emerald-600">— Real data only</span>
            </div>
          )}

          {/* Error messages */}
          {error && loginMode === 'user' && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200/80 animate-slide-in-down">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}
          {candidateError && loginMode === 'candidate' && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200/80 animate-slide-in-down">
              <p className="text-sm text-red-700 font-medium">{candidateError}</p>
            </div>
          )}

          {/* ─── CANDIDATE LOGIN FORM ─── */}
          {loginMode === 'candidate' && !isPlatformSite && (
            <div className="space-y-5">
              <div>
                <label htmlFor="candidate-email" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <FiMail className="h-[18px] w-[18px] text-slate-400" />
                  </div>
                  <input
                    id="candidate-email"
                    type="email"
                    value={candidateEmail}
                    onChange={(e) => {
                      setCandidateEmail(e.target.value);
                      if (candidateError) setCandidateError('');
                    }}
                    placeholder="Example@email.com"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F6FED]/15 focus:border-[#2F6FED] transition-all text-sm"
                    autoComplete="email"
                    disabled={isSubmitting}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Use the email you applied with.</p>
              </div>

              <div className="flex rounded-lg bg-slate-100 p-1">
                <button
                  onClick={() => setCandidateTab('password')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    candidateTab === 'password' ? 'bg-white text-[#16254E] shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Password
                </button>
                <button
                  onClick={() => setCandidateTab('otp')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    candidateTab === 'otp' ? 'bg-white text-[#16254E] shadow-sm' : 'text-slate-500'
                  }`}
                >
                  OTP
                </button>
              </div>

              {candidateTab === 'password' ? (
                <>
                  <div>
                    <label htmlFor="candidate-password" className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <FiLock className="h-[18px] w-[18px] text-slate-400" />
                      </div>
                      <input
                        id="candidate-password"
                        type={candidateShowPassword ? 'text' : 'password'}
                        value={candidatePassword}
                        onChange={(e) => {
                          setCandidatePassword(e.target.value);
                          if (candidateError) setCandidateError('');
                        }}
                        placeholder="At least 8 characters"
                        className="w-full pl-11 pr-12 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F6FED]/15 focus:border-[#2F6FED] transition-all text-sm"
                        autoComplete="current-password"
                        disabled={isSubmitting}
                        onKeyDown={(e) => e.key === 'Enter' && handleCandidateLoginPassword()}
                      />
                      <button
                        type="button"
                        onClick={() => setCandidateShowPassword(!candidateShowPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                      >
                        {candidateShowPassword ? <FiEyeOff className="h-[18px] w-[18px]" /> : <FiEye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCandidateLoginPassword}
                    disabled={isSubmitting || !candidateEmail || !candidatePassword}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#16254E] text-white font-semibold text-sm shadow-lg shadow-[#16254E]/20 hover:bg-[#1F3268] focus:outline-none focus:ring-2 focus:ring-[#2F6FED]/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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
                      <>Sign In <FiArrowRight className="h-4 w-4" /></>
                    )}
                  </button>
                  <div className="text-center">
                    <Link href="/candidate-portal/forgot-password" className="text-xs font-semibold text-slate-600 hover:text-[#2F6FED] hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  {candidateStep === 'request' ? (
                    <button
                      type="button"
                      onClick={handleCandidateRequestOtp}
                      disabled={isSubmitting || !candidateEmail}
                      className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#16254E] text-white font-semibold text-sm shadow-lg shadow-[#16254E]/20 hover:bg-[#1F3268] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                    >
                      {isSubmitting ? (
                        <>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Sending OTP...
                        </>
                      ) : (
                        <>Send OTP <FiArrowRight className="h-4 w-4" /></>
                      )}
                    </button>
                  ) : (
                    <>
                      <div>
                        <label htmlFor="candidate-otp" className="block text-sm font-semibold text-slate-700 mb-1.5">
                          Enter OTP
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <FiLock className="h-[18px] w-[18px] text-slate-400" />
                          </div>
                          <input
                            id="candidate-otp"
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={candidateOtp}
                            onChange={(e) => setCandidateOtp(e.target.value.replace(/\D/g, ''))}
                            placeholder="123456"
                            className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F6FED]/15 focus:border-[#2F6FED] tracking-[0.5em] font-mono text-sm"
                            onKeyDown={(e) => e.key === 'Enter' && handleCandidateVerifyOtp()}
                            disabled={isSubmitting}
                          />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5">A 6-digit code was sent to {candidateEmail}.</p>
                        {candidateDevOtp && (
                          <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                            <p className="text-[11px] text-amber-700 leading-relaxed">
                              <strong>Demo mode:</strong> Your OTP is{' '}
                              <button
                                onClick={() => setCandidateOtp(candidateDevOtp)}
                                className="font-mono font-bold text-amber-900 underline hover:text-amber-950"
                              >
                                {candidateDevOtp}
                              </button>
                              <span className="text-amber-600"> (click to auto-fill)</span>
                            </p>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleCandidateVerifyOtp}
                        disabled={isSubmitting || candidateOtp.length !== 6}
                        className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#16254E] text-white font-semibold text-sm shadow-lg hover:bg-[#1F3268] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                      >
                        {isSubmitting ? 'Verifying...' : <>Verify & Continue <FiArrowRight className="h-4 w-4" /></>}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCandidateStep('request'); setCandidateOtp(''); setCandidateDevOtp(null); }}
                        className="w-full text-xs text-slate-500 hover:text-slate-700"
                      >
                        ← Use a different email
                      </button>
                    </>
                  )}
                </>
              )}

              {/* Candidate Portal features */}
              <div className="pt-4 border-t border-slate-100 mt-4">
                <p className="text-[11px] text-slate-500 font-semibold mb-2 uppercase tracking-wider">What you get:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: FiZap, text: 'AI Resume Builder' },
                    { icon: FiTarget, text: 'Job Matching' },
                    { icon: FiTrendingUp, text: 'Application Tracking' },
                    { icon: FiGlobe, text: 'External Job Search' },
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <f.icon className="w-3.5 h-3.5 text-emerald-500" />
                      {f.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── HR/ADMIN LOGIN FORM ─── */}
          {(loginMode === 'user' || isPlatformSite) && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Email{!isPlatformSite ? ' or Employee ID' : ''} <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <FiMail className="h-[18px] w-[18px] text-slate-400" />
                </div>
                <input
                  id="email"
                  type="text"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Example@email.com"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F6FED]/15 focus:border-[#2F6FED] transition-all text-sm"
                  autoComplete="email"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Password + Forgot password (right-aligned, per reference image) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                  Password <span className="text-red-500 font-bold">*</span>
                </label>
                <Link href="/forgot-password" className="text-xs font-semibold text-slate-600 hover:text-[#2F6FED] transition-colors hover:underline">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <FiLock className="h-[18px] w-[18px] text-slate-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="At least 8 characters"
                  className="w-full pl-11 pr-12 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2F6FED]/15 focus:border-[#2F6FED] transition-all text-sm"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? (
                    <FiEyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <FiEye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember me — hidden on platform site */}
            {!isPlatformSite && (
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#2F6FED] focus:ring-[#2F6FED]/20"
              />
              <label htmlFor="remember" className="text-sm text-slate-500">
                Keep me signed in for 30 days
              </label>
            </div>
            )}

            {/* Sign In — deep-ink button per reference image */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#16254E] text-white font-semibold text-sm shadow-lg shadow-[#16254E]/20 hover:bg-[#1F3268] focus:outline-none focus:ring-2 focus:ring-[#2F6FED]/40 focus:ring-offset-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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
                  {isPlatformSite ? 'Sign In as Super Admin' : 'Sign In'}
                  <FiArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {/* Demo Login Credentials — demo site ONLY */}
            {isDemoSite && !tenantInfo && (
            <div className="mt-4 w-full rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50/50 to-orange-50/50 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  const newState = !showDemoLogins;
                  setShowDemoLogins(newState);
                  if (newState && !demoCredentials) fetchDemoCredentials();
                }}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-50/80 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white flex-shrink-0">
                    <FiUsers className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-slate-800">Login Credentials</span>
                </div>
                {showDemoLogins ? (
                  <FiChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <FiChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>
              {showDemoLogins && (
                <div className="px-4 pb-3 space-y-2">
                  <p className="text-[10px] text-slate-500 mb-2">Click any role to auto-fill credentials.</p>
                  {demoLoading && (
                    <div className="flex items-center gap-2 py-2">
                      <FiRefreshCw className="w-3 h-3 animate-spin text-amber-500" />
                      <span className="text-[10px] text-slate-400">Loading credentials...</span>
                    </div>
                  )}
                  {demoCredentials?.site === 'demo' && (
                    <>
                      <p className="text-[10px] font-semibold text-slate-600 mt-1 px-1">Super Admins</p>
                      {demoCredentials.superAdmins?.map((u: any) => (
                        <button
                          key={u.email}
                          type="button"
                          onClick={() => {
                            setEmail(u.email);
                            setPassword('MarqAI@2026');
                            setLoginMode('user');
                            toast.success(`Filled: ${u.functionalRole}`, { duration: 2000 });
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-slate-100 hover:border-amber-200 transition-all text-left group"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-slate-700 group-hover:text-amber-700 transition-colors">{u.functionalRole}</p>
                            <p className="text-[9px] text-slate-400 truncate">{u.email}</p>
                          </div>
                          <span className="text-[8px] font-medium bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Super Admin</span>
                        </button>
                      ))}
                      <p className="text-[10px] font-semibold text-slate-600 mt-2 px-1">Tenant Admins</p>
                      {demoCredentials.tenantAdmins?.map((u: any) => (
                        <button
                          key={u.email}
                          type="button"
                          onClick={() => {
                            setEmail(u.email);
                            setPassword('MarqAI@2026');
                            setLoginMode('user');
                            toast.success(`Filled: ${u.tenant} Admin`, { duration: 2000 });
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-slate-100 hover:border-amber-200 transition-all text-left group"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-slate-700 group-hover:text-amber-700 transition-colors">{u.tenant}</p>
                            <p className="text-[9px] text-slate-400 truncate">{u.email}</p>
                          </div>
                          <span className="text-[8px] font-medium bg-green-100 text-green-600 px-1.5 py-0.5 rounded">Tenant Admin</span>
                        </button>
                      ))}
                      {demoCredentials.employees?.length > 0 && (
                        <>
                          <p className="text-[10px] font-semibold text-slate-600 mt-2 px-1">Employees (Self-Service)</p>
                          {demoCredentials.employees.map((u: any) => (
                            <button
                              key={u.email}
                              type="button"
                              onClick={() => {
                                setEmail(u.email);
                                setPassword('MarqAI@2026');
                                setLoginMode('user');
                                toast.success('Filled: Employee Self-Service', { duration: 2000 });
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-slate-100 hover:border-amber-200 transition-all text-left group"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-semibold text-slate-700 group-hover:text-amber-700 transition-colors">{u.name}</p>
                                <p className="text-[9px] text-slate-400 truncate">{u.email}{u.department ? ` · ${u.department}` : ''}</p>
                              </div>
                              <span className="text-[8px] font-medium bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Employee</span>
                            </button>
                          ))}
                        </>
                      )}
                    </>
                  )}
                  {!demoCredentials && !demoLoading && (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEmail('superadmin@3boxeshrms.com');
                          setPassword('MarqAI@2026');
                          setLoginMode('user');
                          toast.success('Filled: Super Admin', { duration: 2000 });
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-slate-100 hover:border-amber-200 transition-all text-left group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-slate-700 group-hover:text-amber-700">Super Admin</p>
                          <p className="text-[9px] text-slate-400 truncate">superadmin@3boxeshrms.com</p>
                        </div>
                        <span className="text-[8px] font-medium bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Super Admin</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail('admin@marqaitechgroup.com');
                          setPassword('MarqAI@2026');
                          setLoginMode('user');
                          toast.success('Filled: Tenant Admin', { duration: 2000 });
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/70 hover:bg-white border border-slate-100 hover:border-amber-200 transition-all text-left group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-slate-700 group-hover:text-amber-700">Tenant Admin</p>
                          <p className="text-[9px] text-slate-400 truncate">admin@marqaitechgroup.com</p>
                        </div>
                        <span className="text-[8px] font-medium bg-green-100 text-green-600 px-1.5 py-0.5 rounded">Tenant Admin</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Super Admin capabilities — platform site ONLY */}
            {isPlatformSite && !tenantInfo && (
            <div className="mt-4 w-full rounded-xl border border-emerald-200/60 bg-gradient-to-r from-emerald-50/80 to-green-50/50 overflow-hidden">
              <div className="px-4 py-2 bg-emerald-600/10 border-b border-emerald-200/40 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-700 tracking-wide uppercase">Live Production Environment</span>
                <span className="text-[9px] text-emerald-600/70 ml-auto">Real data only — No demo/dummy data</span>
              </div>
              <div className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { icon: <FiUsers className="w-3 h-3" />, label: 'Tenant Management' },
                    { icon: <FiUserCheck className="w-3 h-3" />, label: 'Trial Approvals' },
                    { icon: <FiCreditCard className="w-3 h-3" />, label: 'Subscriptions' },
                    { icon: <FiSettings className="w-3 h-3" />, label: 'Platform Config' },
                  ].map((item) => (
                    <span key={item.label} className="inline-flex items-center gap-1 text-[9px] text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded">
                      {item.icon}{item.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            )}
          </form>
          )}

          {/* Or divider + Sign up + Social logins (per reference image) */}
          {!isPlatformSite && (
          <div className="mt-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">Or</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <p className="text-center text-sm text-slate-500 mb-4">
              Don&apos;t you have an account?{' '}
              {tenantInfo ? (
                <button
                  type="button"
                  onClick={() => toast('Please contact your HR administrator to get an account.', { icon: 'ℹ️' })}
                  className="font-bold text-[#16254E] hover:underline"
                >
                  Sign up
                </button>
              ) : (
                <Link href="/register" className="font-bold text-[#16254E] hover:underline">
                  Sign up
                </Link>
              )}
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => toast('Google sign-in is coming soon — use your email and password for now.', { icon: '🔒' })}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
              >
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.96 10.96 0 001 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </button>
              <button
                type="button"
                onClick={() => toast('Facebook sign-in is coming soon — use your email and password for now.', { icon: '🔒' })}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
              >
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="11" fill="#1877F2" />
                  <path d="M15.54 12.7h-2.28v7.3h-3.02v-7.3H8.5v-2.56h1.74V8.55c0-1.99 1.2-3.09 3.0-3.09.86 0 1.76.15 1.76.15v1.94h-.99c-.98 0-1.28.6-1.28 1.23v1.36h2.17l-.36 2.56z" fill="white"/>
                </svg>
                Sign in with Facebook
              </button>
            </div>
          </div>
          )}

          {/* Quick options (mobile app · careers · trial · job portals) — MOBILE ONLY here below the form; desktop shows them inside the right-hand pane */}
          {!isPlatformSite && (
            <div className="lg:hidden mt-7">
              <LoginQuickOptions loginMode={loginMode} />
            </div>
          )}

          {/* Footer */}
          <div className="mt-7 pt-5 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <HiShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Enterprise-grade security
              </div>
              <p className="text-[11px] text-slate-400">
                &copy; {new Date().getFullYear()} 3Boxes HRMS · A Proud Product of Marq AI Tech Group
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════ RIGHT — "Smarter HR Starts Here" illustration card ════════════════ */}
      <div className="hidden lg:flex lg:w-[56%] xl:w-[58%] items-stretch p-5 xl:p-8">
        <div className="relative w-full rounded-[32px] bg-gradient-to-br from-[#D8E9FA] via-[#E7F1FC] to-[#CBE2F6] overflow-hidden flex flex-col p-8 xl:p-10">
          {/* Product logo badge — 3Boxes HRMS mark on the right-hand pane (Task 157) */}
          <div className="absolute top-6 right-6 xl:top-8 xl:right-8 z-20">
            <div className="flex items-center gap-2.5 pl-2.5 pr-4 py-2 rounded-2xl bg-white/85 backdrop-blur shadow-lg shadow-[#16254E]/10 ring-1 ring-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo-3boxes-hrms.png" alt="3Boxes HRMS" className="w-9 h-9 rounded-lg object-contain" />
              <div className="leading-tight">
                <p className="text-[13px] font-extrabold text-[#16254E]">3Boxes <span className="text-emerald-500">HRMS</span></p>
                <p className="text-[9px] font-medium text-slate-500">Manage People. Empower Growth.</p>
              </div>
            </div>
          </div>
          {/* Decorative blobs */}
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/40 blur-2xl" />
          <div className="absolute top-1/3 -left-20 w-64 h-64 rounded-full bg-[#A9CBF0]/40 blur-2xl" />
          <div className="absolute bottom-[-6rem] right-[10%] w-72 h-72 rounded-full bg-white/30 blur-2xl" />

          <div className="relative z-10">
            <h2 className="text-3xl xl:text-[40px] font-extrabold text-[#16254E] tracking-tight leading-tight">
              Smarter HR<br />Starts Here
            </h2>
            <p className="mt-4 text-sm xl:text-[15px] text-slate-600 max-w-md leading-relaxed">
              Monitor employee performance, manage HR processes, and get a centralized HR dashboard — people, payroll, attendance and projects in one place.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {[
                { label: 'Employee Performance', icon: FiTrendingUp },
                { label: 'HR Processes', icon: FiSettings },
                { label: 'Central Dashboard', icon: FiGrid },
              ].map((chip) => (
                <span key={chip.label} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/80 backdrop-blur text-xs font-semibold text-[#16254E] shadow-sm ring-1 ring-white">
                  <chip.icon className="w-3.5 h-3.5 text-[#2F6FED]" />
                  {chip.label}
                </span>
              ))}
            </div>
          </div>

          {/* Flat illustration — three colleagues around a desk with laptop */}
          <div className="relative z-10 flex-1 flex items-end justify-center pt-6">
            <svg viewBox="0 0 560 330" className="w-full max-w-[480px] h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="280" cy="312" rx="250" ry="14" fill="#16254E" opacity="0.07" />
              {/* floating stat card left */}
              <g>
                <rect x="34" y="52" width="128" height="82" rx="14" fill="white" stroke="#D7E6F6" />
                <circle cx="60" cy="78" r="11" fill="#7FAEF3" />
                <rect x="80" y="70" width="64" height="8" rx="4" fill="#C9DCF2" />
                <rect x="80" y="84" width="42" height="6" rx="3" fill="#E4EFFB" />
                <rect x="52" y="104" width="92" height="7" rx="3.5" fill="#E4EFFB" />
                <rect x="52" y="117" width="60" height="6" rx="3" fill="#EEF5FD" />
              </g>
              {/* floating card right */}
              <g>
                <rect x="404" y="40" width="118" height="76" rx="14" fill="white" stroke="#D7E6F6" />
                <rect x="422" y="58" width="50" height="9" rx="4.5" fill="#2F6FED" />
                <rect x="422" y="74" width="82" height="6" rx="3" fill="#E4EFFB" />
                <rect x="422" y="86" width="58" height="6" rx="3" fill="#EEF5FD" />
                <circle cx="502" cy="62" r="9" fill="#9CCBf5" />
              </g>
              {/* plant */}
              <g>
                <rect x="492" y="238" width="34" height="40" rx="8" fill="#2F6FED" opacity="0.85" />
                <path d="M509 238c0-18-10-26-18-30 2 14 6 22 18 30z" fill="#3E8E5A" />
                <path d="M509 238c0-20 8-30 18-34-2 16-6 26-18 34z" fill="#57B379" />
              </g>
              {/* desk */}
              <rect x="70" y="238" width="420" height="12" rx="6" fill="#2F6FED" />
              <rect x="96" y="250" width="12" height="56" rx="5" fill="#275ECE" />
              <rect x="452" y="250" width="12" height="56" rx="5" fill="#275ECE" />
              {/* laptop */}
              <g>
                <rect x="238" y="176" width="88" height="56" rx="7" fill="#16254E" />
                <rect x="245" y="183" width="74" height="42" rx="4" fill="#3B82F6" opacity="0.9" />
                {/* 3Boxes HRMS mini logo on the laptop screen (Task 157) */}
                <g transform="translate(265, 191) scale(1.1)">
                  <rect x="0" y="0" width="9" height="9" rx="2" fill="#059669" />
                  <rect x="11" y="0" width="9" height="9" rx="2" fill="#10B981" />
                  <rect x="22" y="0" width="9" height="9" rx="2" fill="#22C55E" />
                </g>
                <rect x="252" y="205" width="10" height="14" rx="2" fill="white" opacity="0.85" />
                <rect x="268" y="196" width="10" height="23" rx="2" fill="white" opacity="0.65" />
                <rect x="284" y="190" width="10" height="29" rx="2" fill="white" opacity="0.85" />
                <rect x="300" y="200" width="10" height="19" rx="2" fill="white" opacity="0.55" />
                <rect x="226" y="230" width="112" height="9" rx="4.5" fill="#16254E" />
              </g>
              {/* coffee cup */}
              <g>
                <rect x="352" y="216" width="20" height="22" rx="4" fill="white" stroke="#C9DCF2" strokeWidth="2" />
                <path d="M372 221h6a5 5 0 010 10h-6" stroke="#C9DCF2" strokeWidth="2.5" fill="none" />
              </g>
              {/* person left */}
              <g>
                <circle cx="140" cy="128" r="24" fill="#F2B48C" />
                <path d="M116 124c0-16 11-26 24-26s24 10 24 26c-6-8-14-11-24-11s-18 3-24 11z" fill="#16254E" />
                <path d="M104 238v-52c0-20 16-34 36-34s36 14 36 34v52h-16v-34h-40v34h-16z" fill="#2F6FED" />
                <rect x="120" y="196" width="40" height="10" rx="5" fill="#1F56C6" />
              </g>
              {/* person center-right (behind laptop) */}
              <g>
                <circle cx="330" cy="108" r="26" fill="#E9A97C" />
                <path d="M304 104c0-17 12-28 26-28s26 11 26 28c-7-9-15-12-26-12s-19 3-26 12z" fill="#3A2B22" />
                <path d="M292 238v-58c0-21 17-36 38-36s38 15 38 36v58h-17v-36h-42v36h-17z" fill="#7FAEF3" />
              </g>
              {/* person right */}
              <g>
                <circle cx="446" cy="132" r="23" fill="#F2B48C" />
                <path d="M424 130c2-15 11-24 22-24s21 9 22 24c-6-7-13-10-22-10s-16 3-22 10z" fill="#6B4A32" />
                <circle cx="446" cy="112" r="3.5" fill="#F6C261" />
                <path d="M412 238v-48c0-19 15-32 34-32s34 13 34 32v48h-15v-32h-38v32h-15z" fill="#16254E" />
              </g>
              {/* papers on desk */}
              <rect x="160" y="228" width="52" height="8" rx="4" fill="white" stroke="#D7E6F6" />
              <rect x="398" y="228" width="44" height="8" rx="4" fill="white" stroke="#D7E6F6" />
            </svg>
          </div>

          {/* 3-step infographic strip */}
          <div className="relative z-10 mt-5 grid grid-cols-3 gap-2.5">
            {[
              { title: 'Sign in', sub: 'One secure workspace', icon: FiMail },
              { title: 'Add your people', sub: 'Invite in one click', icon: FiUsers },
              { title: 'Go live', sub: 'HR running in minutes', icon: FiZap },
            ].map((step, i) => (
              <div key={step.title} className="relative bg-white/75 backdrop-blur rounded-2xl ring-1 ring-white p-3 text-center shadow-sm">
                <span className="absolute top-2 right-2.5 text-[10px] font-extrabold text-[#2F6FED]/40">0{i + 1}</span>
                <div className="w-9 h-9 mx-auto rounded-xl bg-gradient-to-br from-[#2F6FED] to-[#6C9BF5] flex items-center justify-center shadow-md shadow-[#2F6FED]/25">
                  <step.icon className="w-4 h-4 text-white" />
                </div>
                <p className="text-[11px] font-bold text-[#16254E] mt-2 leading-tight">{step.title}</p>
                <p className="text-[9.5px] text-slate-500 mt-0.5 leading-tight">{step.sub}</p>
              </div>
            ))}
          </div>

          {/* Quick options — app download · careers · trial · job portals (moved from the left column) */}
          {!isPlatformSite && (
            <div className="relative z-10 mt-4">
              <LoginQuickOptions loginMode={loginMode} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LoginQuickOptions — compact infographic option cards (mobile app download,
   careers, free trial, job portals). Rendered INSIDE the right-hand
   illustration pane on desktop and below the form on mobile (lg:hidden), so
   the left login column stays short and matches the reference format.
   ═══════════════════════════════════════════════════════════════════════════ */
function LoginQuickOptions({ loginMode }: { loginMode: 'user' | 'candidate' }) {
  const [showAppInfo, setShowAppInfo] = useState(false);

  return (
    <div className="w-full space-y-3">
      {/* Row 1 — Get the app · Browse openings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Mobile app — direct NATIVE APK download (recommended edition) */}
        <a
          href={NATIVE_APP_RELEASE.apkUrl}
          download
          className="group relative w-full flex items-center gap-3 p-4 rounded-2xl bg-white/90 backdrop-blur ring-1 ring-white shadow-[0_12px_32px_-14px_rgba(22,37,78,0.25)] hover:shadow-[0_16px_40px_-14px_rgba(16,122,87,0.4)] hover:-translate-y-0.5 transition-all overflow-hidden"
        >
          <div className="absolute -right-7 -top-9 w-24 h-24 rounded-full bg-emerald-100/60 group-hover:scale-125 transition-transform duration-300" />
          <div className="absolute right-3 top-3 flex items-end gap-0.5 opacity-70">
            <span className="w-1.5 h-2 rounded-sm bg-emerald-300" />
            <span className="w-1.5 h-3.5 rounded-sm bg-emerald-400" />
            <span className="w-1.5 h-5 rounded-sm bg-emerald-500" />
          </div>
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M17.523 15.341a.641.641 0 01-.64.641.641.641 0 01-.64-.64c0-.354.287-.641.64-.641.354 0 .64.287.64.64zm-10.246 0a.641.641 0 01-.64.641.641.641 0 01-.64-.64c0-.354.287-.641.64-.641.354 0 .64.287.64.64z" fill="white"/>
              <path d="M7.414 14.166l-2.548 1.506a.64.64 0 01-.876-.228.64.64 0 01.228-.876l2.548-1.506a.64.64 0 01.876.228.64.64 0 01-.228.876zm9.172 0a.64.64 0 01.228-.876l2.548-1.506a.64.64 0 01.876.228.64.64 0 01-.228.876l-2.548 1.506a.64.64 0 01-.876-.228z" fill="white"/>
              <path d="M7.988 10.348l-2.66-4.56a.64.64 0 01.228-.876.64.64 0 01.876.228l2.66 4.56a.64.64 0 01-.228.876.64.64 0 01-.876-.228zm8.024 0a.64.64 0 01-.876.228.64.64 0 01-.228-.876l2.66-4.56a.64.64 0 01.876-.228.64.64 0 01-.228.876z" fill="white"/>
              <path d="M12 2.5c-.354 0-.64.287-.64.64v5.12c0 .354.287.64.64.64s.64-.287.64-.64V3.14c0-.354-.287-.64-.64-.64z" fill="white"/>
              <rect x="6.64" y="9.38" width="10.72" height="6.82" rx="1.5" fill="white" opacity="0.3"/>
            </svg>
          </div>
          <div className="relative flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">Get the Mobile App</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Native Android · v{NATIVE_APP_RELEASE.versionName} · AI Assistant dock</p>
          </div>
          <FiDownload className="relative w-4 h-4 text-emerald-500 shrink-0 group-hover:translate-y-0.5 transition-transform" />
        </a>

        {/* Careers */}
        <Link
          href="/careers"
          className="group relative w-full flex items-center gap-3 p-4 rounded-2xl bg-white/90 backdrop-blur ring-1 ring-white shadow-[0_12px_32px_-14px_rgba(22,37,78,0.25)] hover:shadow-[0_16px_40px_-14px_rgba(13,128,110,0.4)] hover:-translate-y-0.5 transition-all overflow-hidden"
        >
          <div className="absolute -right-7 -top-9 w-24 h-24 rounded-full bg-teal-100/60 group-hover:scale-125 transition-transform duration-300" />
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/30 shrink-0">
            <FiBriefcase className="w-5 h-5 text-white" />
          </div>
          <div className="relative flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition-colors">Browse Openings</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Apply with resume — no account needed</p>
          </div>
          <FiArrowRight className="relative w-4 h-4 text-teal-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* Row 2 — Lite WebView edition (SEPARATE download option) + Free trial */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Lite WebView-shell app — separate download so users can pick their edition */}
        <a
          href={SHELL_APP_RELEASE.apkUrl}
          download
          className="group relative w-full flex items-center gap-3 p-4 rounded-2xl bg-white/90 backdrop-blur ring-1 ring-white shadow-[0_12px_32px_-14px_rgba(22,37,78,0.25)] hover:shadow-[0_16px_40px_-14px_rgba(2,132,199,0.4)] hover:-translate-y-0.5 transition-all overflow-hidden"
        >
          <div className="absolute -right-7 -top-9 w-24 h-24 rounded-full bg-sky-100/60 group-hover:scale-125 transition-transform duration-300" />
          <div className="absolute right-3 top-3 flex items-end gap-0.5 opacity-70">
            <span className="w-1.5 h-2 rounded-sm bg-sky-300" />
            <span className="w-1.5 h-3.5 rounded-sm bg-sky-400" />
            <span className="w-1.5 h-5 rounded-sm bg-sky-500" />
          </div>
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30 shrink-0">
            <FiGlobe className="w-5 h-5 text-white" />
          </div>
          <div className="relative flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 group-hover:text-sky-700 transition-colors">Lite App (WebView)</p>
            <p className="text-[11px] text-slate-500 mt-0.5">v{SHELL_APP_RELEASE.versionName} · renders the live web workspace</p>
          </div>
          <FiDownload className="relative w-4 h-4 text-sky-500 shrink-0 group-hover:translate-y-0.5 transition-transform" />
        </a>

        {/* Free trial */}
        <Link
          href="/register"
          className="group relative w-full flex items-center gap-3 p-4 rounded-2xl bg-white/90 backdrop-blur ring-1 ring-white shadow-[0_12px_32px_-14px_rgba(22,37,78,0.25)] hover:shadow-[0_16px_40px_-14px_rgba(109,40,217,0.35)] hover:-translate-y-0.5 transition-all overflow-hidden"
        >
          <div className="absolute -right-7 -top-9 w-24 h-24 rounded-full bg-violet-100/60 group-hover:scale-125 transition-transform duration-300" />
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0">
            <FiZap className="w-5 h-5 text-white" />
          </div>
          <div className="relative flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 group-hover:text-violet-700 transition-colors">New Company? Start Free Trial</p>
            <p className="text-[11px] text-slate-500 mt-0.5">15-day trial — no credit card required</p>
          </div>
          <FiArrowRight className="relative w-4 h-4 text-violet-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* App details & install guide — collapsible so the pane stays compact */}
      <button
        type="button"
        onClick={() => setShowAppInfo(!showAppInfo)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/60 hover:bg-white/85 ring-1 ring-white transition-all text-left"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-[#16254E]">
          <FiSmartphone className="w-3.5 h-3.5 text-[#2F6FED]" />
          App details &amp; install guide
        </span>
        {showAppInfo ? <FiChevronUp className="w-4 h-4 text-slate-400" /> : <FiChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {showAppInfo && (
        <div className="space-y-3 animate-slide-in-down">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <a
              href={NATIVE_APP_RELEASE.apkUrl}
              download
              className="flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-green-700 transition-all"
            >
              <FiDownload className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold">Native App APK</p>
                <p className="text-[10px] text-white/80">v{NATIVE_APP_RELEASE.versionName} ({NATIVE_APP_RELEASE.versionCode})</p>
              </div>
            </a>
            <a
              href={SHELL_APP_RELEASE.apkUrl}
              download
              className="flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20 hover:from-sky-600 hover:to-blue-700 transition-all"
            >
              <FiDownload className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold">Lite App APK</p>
                <p className="text-[10px] text-white/80">v{SHELL_APP_RELEASE.versionName} ({SHELL_APP_RELEASE.versionCode})</p>
              </div>
            </a>
            <a
              href="/downloads/"
              className="flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 text-white hover:from-slate-600 hover:to-slate-700 transition-all"
            >
              <FiSmartphone className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold">iOS App</p>
                <p className="text-[10px] text-white/70">Download center</p>
              </div>
            </a>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: FiZap, label: 'Native Performance', tone: 'bg-indigo-50/80 text-indigo-500' },
              { icon: FiWifi, label: 'Offline Mode', tone: 'bg-emerald-50/80 text-emerald-500' },
              { icon: FiRefreshCw, label: 'Auto Updates', tone: 'bg-violet-50/80 text-violet-500' },
              { icon: FiShield, label: 'Secure & Encrypted', tone: 'bg-amber-50/80 text-amber-500' },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 p-2 rounded-lg bg-white/80 ring-1 ring-white">
                <f.icon className={`w-3.5 h-3.5 shrink-0 ${f.tone.split(' ')[1]}`} />
                <p className="text-[10px] font-medium text-slate-700">{f.label}</p>
              </div>
            ))}
          </div>
          <div className="p-3 rounded-xl bg-white/80 ring-1 ring-white">
            <p className="text-[11px] font-semibold text-slate-600 mb-1.5">How to install (Android)</p>
            <ol className="text-[10px] text-slate-500 space-y-1 list-decimal list-inside">
              <li>Pick an edition — <strong>Native App</strong> (full experience + AI dock) or <strong>Lite App</strong> (renders the live web)</li>
              <li>Tap its <strong>APK</strong> button above to download</li>
              <li>Open the downloaded file (e.g. <em>…-v{NATIVE_APP_RELEASE.versionName}.apk</em>)</li>
              <li>Allow installation from unknown sources if prompted</li>
              <li>Tap <strong>&quot;Install&quot;</strong> — both editions share the same app signature, so either installs right over the other and you can switch any time</li>
              <li>Sign in — the app auto-detects your company workspace</li>
            </ol>
          </div>
        </div>
      )}

      {/* Job portals — candidate mode only */}
      {loginMode === 'candidate' && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            <FiGlobe className="w-3.5 h-3.5" /> Explore Opportunities
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: 'https://www.linkedin.com/jobs', badge: 'in', name: 'LinkedIn', sub: 'Professional network', bg: 'bg-[#0A66C2]' },
              { href: 'https://www.naukri.com', badge: 'N', name: 'Naukri', sub: "India's #1 job site", bg: 'bg-[#4A90D9]' },
              { href: 'https://www.indeed.com', badge: 'IN', name: 'Indeed', sub: 'Global job search', bg: 'bg-[#2557A7]' },
              { href: 'https://www.glassdoor.com', badge: 'G', name: 'Glassdoor', sub: 'Reviews & jobs', bg: 'bg-[#0CAA41]' },
            ].map((p) => (
              <a key={p.name} href={p.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/90 ring-1 ring-white hover:ring-emerald-200 hover:bg-white transition-all group">
                <div className={`w-8 h-8 rounded-lg ${p.bg} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>{p.badge}</div>
                <div className="min-w-0"><p className="text-xs font-semibold text-slate-700 truncate">{p.name}</p><p className="text-[10px] text-slate-400 truncate">{p.sub}</p></div>
                <FiExternalLink className="w-3 h-3 text-slate-300 group-hover:text-emerald-500 ml-auto shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
