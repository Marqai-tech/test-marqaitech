'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FiArrowLeft, FiBriefcase, FiCalendar, FiCheckCircle, FiEye, FiEyeOff, FiFileText, FiLayers, FiLock, FiMail, FiMapPin, FiShield, FiUser } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function CandidateRegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const job = {
    title: params.get('title') || 'Software Engineer',
    company: params.get('company') || 'Pioneer Tech Solutions',
    location: params.get('location') || 'Remote (US)',
    department: params.get('department') || 'Engineering',
    type: params.get('type') || 'Full-time',
  };
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const requestVerification = async () => {
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const response = await fetch('/api/candidate-portal/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not create account.');
      setStep('verify'); setCooldown(Number(data.resendAfter || 60));
      toast.success('Verification code sent to your email.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not send verification code.');
    } finally { setSubmitting(false); }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) { toast.error('Enter the six-digit verification code.'); return; }
    setSubmitting(true);
    try {
      const response = await fetch('/api/candidate-portal/auth/register/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.email, otp }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Email verification failed.');
      localStorage.setItem('tb_candidate_token', data.token);
      localStorage.setItem('tb_candidate_email', data.user.email);
      toast.success('Email verified. Your candidate account is ready.');
      router.push('/candidate-portal/dashboard');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Email verification failed.');
    } finally { setSubmitting(false); }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f8fc] text-slate-900">
      <header className="relative overflow-hidden bg-[#0d3152] px-4 py-3.5 text-white sm:px-6">
        <div className="absolute -right-20 -top-24 h-48 w-96 rotate-[-20deg] bg-gradient-to-r from-cyan-400/60 to-emerald-400/60 blur-2xl" />
        <div className="relative mx-auto flex max-w-6xl items-center gap-4">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-sm font-black tracking-[-0.15em] text-white">•••</span><span className="text-2xl font-bold tracking-tight">3Boxes <span className="text-emerald-300">HRMS</span></span></div>
          <span className="h-8 w-px bg-white/40" /><span className="text-xl text-white/90">Careers</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-5">
        <div className="mx-auto mb-4 flex max-w-2xl items-start justify-between">
          {[{ icon: FiUser, label: 'Account', active: true }, { icon: FiFileText, label: 'Apply', active: false }, { icon: FiCheckCircle, label: 'Confirmation', active: false }].map(({ icon: Icon, label, active }, index) => (
            <div key={label} className="flex min-w-0 flex-1 items-start last:flex-none"><div className="flex flex-col items-center"><span className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${active ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-400 bg-white text-slate-500'}`}><Icon className="h-5 w-5" /></span><span className={`mt-1 text-xs font-bold sm:text-sm ${active ? 'text-slate-900' : 'text-slate-600'}`}>{label}</span></div>{index < 2 && <span className="mx-2 mt-5 h-0.5 min-w-4 flex-1 rounded-full bg-slate-300" />}</div>
          ))}
        </div>

        <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#123b56] via-[#0d2940] to-[#08243b] p-6 text-white"><div className="absolute -right-8 top-8 h-40 w-40 rounded-full bg-emerald-400/30 blur-2xl" /><div className="relative"><FiBriefcase className="mb-3 h-7 w-7" /><h2 className="text-2xl font-bold">Job Application Summary</h2><p className="mt-2 max-w-md text-base leading-relaxed text-slate-100">You&apos;re setting up your candidate account to continue with this application.</p></div></div>
            <div className="p-5 sm:p-6"><h2 className="break-words text-2xl font-bold tracking-tight">{job.title}</h2><div className="mt-4 divide-y divide-slate-200">{[[FiBriefcase, 'Company', job.company], [FiMapPin, 'Location', job.location], [FiLayers, 'Department', job.department], [FiCalendar, 'Job Type', job.type]].map(([Icon, label, value]) => <div key={label as string} className="grid min-w-0 grid-cols-[24px_90px_minmax(0,1fr)] items-center gap-3 py-3"><Icon className="h-5 w-5 shrink-0 text-slate-700" /><span className="font-semibold text-slate-600">{label as string}</span><span className="min-w-0 break-words font-medium text-slate-900">{value as string}</span></div>)}</div><div className="mt-5 flex gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><FiShield className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><p className="font-bold">No resume is required during account creation.</p><p className="mt-1 leading-relaxed">You&apos;ll provide your application details and resume in the next step.</p></div></div></div>
          </section>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            {step === 'details' ? <form onSubmit={(event) => { event.preventDefault(); void requestVerification(); }} className="space-y-3.5">
              <div className="mb-4 flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><FiUser className="h-7 w-7" /></span><div className="min-w-0"><h1 className="break-words text-2xl font-bold tracking-tight">Create Candidate Account</h1><p className="mt-1 text-sm leading-relaxed text-slate-600">Save your progress, apply for the role, and receive application updates.</p></div></div>
              <div className="grid gap-3 sm:grid-cols-2"><Field icon={<FiUser />} label="First name" value={form.firstName} onChange={value => setForm(current => ({ ...current, firstName: value }))} autoComplete="given-name" /><Field icon={<FiUser />} label="Last name" value={form.lastName} onChange={value => setForm(current => ({ ...current, lastName: value }))} autoComplete="family-name" /></div>
              <Field icon={<FiMail />} label="Email" type="email" value={form.email} onChange={value => setForm(current => ({ ...current, email: value }))} autoComplete="email" />
              <p className="-mt-2 text-sm text-slate-500">Use an email you check regularly so we can send your verification link and application updates.</p>
              <div className="relative"><Field icon={<FiLock />} label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={value => setForm(current => ({ ...current, password: value }))} autoComplete="new-password" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-4 top-10 text-slate-500" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <FiEyeOff /> : <FiEye />}</button></div>
              <p className="-mt-2 text-sm text-slate-500">Use at least 8 characters, including a letter and a number, for a secure account.</p>
              <Field icon={<FiLock />} label="Confirm password" type="password" value={form.confirmPassword} onChange={value => setForm(current => ({ ...current, confirmPassword: value }))} autoComplete="new-password" />
              <button disabled={submitting} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-base font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"><FiCheckCircle />{submitting ? 'Sending code…' : 'Create Account & Verify Email'}</button>
              <p className="text-center text-base text-slate-600">Already registered? <Link href="/login?mode=candidate" className="font-bold text-teal-700 underline underline-offset-2">Candidate login</Link></p>
            </form> : <form onSubmit={verify} className="space-y-5"><div className="text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><FiMail className="h-7 w-7" /></span><h2 className="mt-4 text-2xl font-bold text-slate-900">Verify your email</h2><p className="mt-2 text-slate-500">We sent a six-digit code to <strong className="text-slate-700">{form.email}</strong>.</p></div><label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Verification code</span><input autoFocus required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-xl border border-slate-300 px-4 py-4 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" placeholder="000000" /></label><div className="flex gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800"><FiCheckCircle className="mt-0.5 shrink-0" />Your account will be activated only after this code is verified. The code expires in 15 minutes.</div><button disabled={submitting || otp.length !== 6} className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{submitting ? 'Verifying…' : 'Verify & Open Candidate Portal'}</button><div className="flex items-center justify-between text-sm"><button type="button" onClick={() => { setStep('details'); setOtp(''); }} className="text-slate-600 hover:text-slate-900">Change email</button><button type="button" disabled={submitting || cooldown > 0} onClick={() => void requestVerification()} className="font-semibold text-emerald-700 disabled:text-slate-400">{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button></div></form>}
          </section>
        </div>
        <Link href="/careers" className="mx-auto mt-3 flex w-fit items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><FiArrowLeft /> Back to jobs</Link>
      </div>
    </main>
  );
}

function Field({ icon, label, value, onChange, type = 'text', autoComplete }: { icon: ReactNode; label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string }) {
  return <label className="block min-w-0"><span className="mb-1 block text-sm font-bold text-slate-800">{label}</span><span className="relative block min-w-0"><span className="absolute inset-y-0 left-3 flex items-center text-slate-500">{icon}</span><input required type={type} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} className="min-w-0 w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" /></span></label>;
}

