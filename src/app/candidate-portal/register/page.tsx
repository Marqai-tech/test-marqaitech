'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FiArrowLeft, FiBriefcase, FiCalendar, FiCheckCircle, FiEye, FiEyeOff, FiFileText, FiLayers, FiLock, FiMail, FiMapPin, FiShield, FiUser } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function CandidateRegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const jobId = params.get('jobId');
  const [job, setJob] = useState<{ title: string; company: string; location: string; department: string; type: string } | null>(null);
  const [jobLoading, setJobLoading] = useState(!!jobId);
  const [jobError, setJobError] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!jobId) {
      return;
    }
    let cancelled = false;
    fetch(`/api/public/jobs?jobId=${encodeURIComponent(jobId)}&limit=1`)
      .then(async response => {
        if (!response.ok) throw new Error('Could not load the selected position.');
        const data = await response.json();
        const selected = data.jobs?.[0];
        if (!selected) throw new Error('This position is closed, expired, or no longer available.');
        if (!cancelled) setJob({
          title: selected.title || selected.position || 'Open Position',
          company: selected.company?.name || selected.tenant?.name || '3Boxes HRMS',
          location: selected.location || 'Not specified',
          department: selected.department?.name || 'Not specified',
          type: String(selected.type || 'Full-time').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()),
        });
      })
      .catch(error => { if (!cancelled) setJobError(error instanceof Error ? error.message : 'Could not load this position.'); })
      .finally(() => { if (!cancelled) setJobLoading(false); });
    return () => { cancelled = true; };
  }, [jobId]);

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
      router.push('/candidate-portal/home');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Email verification failed.');
    } finally { setSubmitting(false); }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f8fc] text-slate-900 lg:h-screen lg:overflow-hidden">
      <header className="relative overflow-hidden bg-[#0d3152] px-4 py-2.5 text-white sm:px-6">
        <div className="absolute -right-20 -top-24 h-48 w-96 rotate-[-20deg] bg-gradient-to-r from-cyan-400/60 to-emerald-400/60 blur-2xl" />
        <div className="relative mx-auto flex max-w-6xl items-center gap-4">
          <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-xs font-black tracking-[-0.15em] text-white">•••</span><span className="text-xl font-bold tracking-tight">3Boxes <span className="text-emerald-300">HRMS</span></span></div>
          <span className="h-6 w-px bg-white/40" /><span className="text-lg text-white/90">Careers</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-3 py-2 sm:px-5">
        <div className="mx-auto mb-2 flex max-w-2xl items-start justify-between">
          {[{ icon: FiUser, label: 'Account', active: true }, { icon: FiFileText, label: 'Apply', active: false }, { icon: FiCheckCircle, label: 'Confirmation', active: false }].map(({ icon: Icon, label, active }, index) => (
            <div key={label} className="flex min-w-0 flex-1 items-start last:flex-none"><div className="flex flex-col items-center"><span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${active ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-400 bg-white text-slate-500'}`}><Icon className="h-4 w-4" /></span><span className={`mt-0.5 text-xs font-bold ${active ? 'text-slate-900' : 'text-slate-600'}`}>{label}</span></div>{index < 2 && <span className="mx-2 mt-4 h-0.5 min-w-4 flex-1 rounded-full bg-slate-300" />}</div>
          ))}
        </div>

        <div className="grid min-w-0 items-stretch gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div
              className="relative overflow-hidden bg-cover bg-center p-4 text-white"
              style={{ backgroundImage: "linear-gradient(105deg, rgba(8,36,59,.94), rgba(13,49,82,.78)), url('/images/hr-team.png')" }}
            ><div className="absolute -right-8 top-8 h-40 w-40 rounded-full bg-emerald-400/20 blur-2xl" /><div className="relative"><FiBriefcase className="mb-2 h-6 w-6" /><h2 className="text-xl font-bold">Job Application Summary</h2><p className="mt-1 max-w-md text-sm leading-relaxed text-slate-100">You&apos;re setting up your candidate account to continue with this application.</p></div></div>
            <div className="p-4">{jobLoading ? <div className="flex h-48 items-center justify-center text-sm text-slate-500">Loading selected position…</div> : job ? <><h2 className="break-words text-xl font-bold tracking-tight">{job.title}</h2><div className="mt-2 divide-y divide-slate-200">{[[FiBriefcase, 'Company', job.company], [FiMapPin, 'Location', job.location], [FiLayers, 'Department', job.department], [FiCalendar, 'Job Type', job.type]].map(([Icon, label, value]) => <div key={label as string} className="grid min-w-0 grid-cols-[20px_82px_minmax(0,1fr)] items-center gap-2 py-2"><Icon className="h-4 w-4 shrink-0 text-slate-700" /><span className="text-sm font-semibold text-slate-600">{label as string}</span><span className="min-w-0 break-words text-sm font-medium text-slate-900">{value as string}</span></div>)}</div><div className="mt-3 flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900"><FiShield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><div><p className="font-bold">No resume is required during account creation.</p><p className="mt-0.5 leading-relaxed">You&apos;ll provide your application details and resume in the next step.</p></div></div></> : jobId ? <div className="flex h-48 flex-col items-center justify-center text-center"><p className="font-bold text-red-700">Position unavailable</p><p className="mt-2 max-w-sm text-sm text-slate-600">{jobError}</p><Link href="/careers" className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Browse Open Jobs</Link></div> : <div className="flex h-48 flex-col items-center justify-center text-center"><FiBriefcase className="h-10 w-10 text-emerald-600"/><h2 className="mt-3 text-xl font-bold">Create your candidate profile</h2><p className="mt-2 max-w-sm text-sm text-slate-600">After verification, browse open positions and upload your resume only when you apply.</p><Link href="/careers" className="mt-4 text-sm font-bold text-emerald-700">Browse jobs first</Link></div>}</div>
          </section>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {step === 'details' ? <form onSubmit={(event) => { event.preventDefault(); void requestVerification(); }} className="space-y-2">
              <div className="mb-2 flex items-start gap-2.5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><FiUser className="h-6 w-6" /></span><div className="min-w-0"><h1 className="break-words text-xl font-bold tracking-tight">Create Candidate Account</h1><p className="mt-0.5 text-xs leading-relaxed text-slate-600">Save your progress, apply for the role, and receive application updates.</p></div></div>
              <div className="grid gap-2 sm:grid-cols-2"><Field icon={<FiUser />} label="First name" value={form.firstName} onChange={value => setForm(current => ({ ...current, firstName: value }))} autoComplete="given-name" /><Field icon={<FiUser />} label="Last name" value={form.lastName} onChange={value => setForm(current => ({ ...current, lastName: value }))} autoComplete="family-name" /></div>
              <Field icon={<FiMail />} label="Email" type="email" value={form.email} onChange={value => setForm(current => ({ ...current, email: value }))} autoComplete="email" />
              <p className="text-xs text-slate-500">Use an email you check regularly for verification and application updates.</p>
              <div className="relative"><Field icon={<FiLock />} label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={value => setForm(current => ({ ...current, password: value }))} autoComplete="new-password" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-4 top-10 text-slate-500" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <FiEyeOff /> : <FiEye />}</button></div>
              <p className="text-xs text-slate-500">Use at least 8 characters, including a letter and a number.</p>
              <Field icon={<FiLock />} label="Confirm password" type="password" value={form.confirmPassword} onChange={value => setForm(current => ({ ...current, confirmPassword: value }))} autoComplete="new-password" />
              <button disabled={submitting || jobLoading || (!!jobId && !job)} className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"><FiCheckCircle />{submitting ? 'Sending code…' : 'Create Account & Verify Email'}</button>
              <p className="text-center text-sm text-slate-600">Already registered? <Link href="/login?mode=candidate" className="font-bold text-teal-700 underline underline-offset-2">Candidate login</Link></p>
            </form> : <form onSubmit={verify} className="space-y-5"><div className="text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><FiMail className="h-7 w-7" /></span><h2 className="mt-4 text-2xl font-bold text-slate-900">Verify your email</h2><p className="mt-2 text-slate-500">We sent a six-digit code to <strong className="text-slate-700">{form.email}</strong>.</p></div><label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Verification code</span><input autoFocus required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-xl border border-slate-300 px-4 py-4 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" placeholder="000000" /></label><div className="flex gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800"><FiCheckCircle className="mt-0.5 shrink-0" />Your account will be activated only after this code is verified. The code expires in 15 minutes.</div><button disabled={submitting || otp.length !== 6} className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{submitting ? 'Verifying…' : 'Verify & Open Candidate Portal'}</button><div className="flex items-center justify-between text-sm"><button type="button" onClick={() => { setStep('details'); setOtp(''); }} className="text-slate-600 hover:text-slate-900">Change email</button><button type="button" disabled={submitting || cooldown > 0} onClick={() => void requestVerification()} className="font-semibold text-emerald-700 disabled:text-slate-400">{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button></div></form>}
          </section>
        </div>
        <Link href="/careers" className="mx-auto mt-1 flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"><FiArrowLeft /> Back to jobs</Link>
      </div>
    </main>
  );
}

function Field({ icon, label, value, onChange, type = 'text', autoComplete }: { icon: ReactNode; label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string }) {
  return <label className="block min-w-0"><span className="mb-0.5 block text-xs font-bold text-slate-800">{label}</span><span className="relative block min-w-0"><span className="absolute inset-y-0 left-3 flex items-center text-slate-500">{icon}</span><input required type={type} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} className="min-w-0 w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" /></span></label>;
}

