'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FiArrowLeft, FiBriefcase, FiEye, FiEyeOff, FiLock, FiMail, FiUser } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function CandidateRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const response = await fetch('/api/candidate-portal/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not create account.');
      localStorage.setItem('tb_candidate_token', data.token);
      localStorage.setItem('tb_candidate_email', data.user.email);
      toast.success('Candidate account created successfully.');
      router.push('/candidate-portal/dashboard');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not create account.');
    } finally { setSubmitting(false); }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-8 flex items-center justify-center">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 text-white">
          <Link href="/careers" className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white"><FiArrowLeft /> Back to jobs</Link>
          <div className="mt-4 flex items-center gap-3"><span className="h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center"><FiBriefcase /></span><div><h1 className="text-2xl font-bold">Create Candidate Account</h1><p className="text-sm text-slate-300">Create your account first. You can upload a resume when applying for a job.</p></div></div>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field icon={<FiUser />} label="First name" value={form.firstName} onChange={value => setForm(current => ({ ...current, firstName: value }))} autoComplete="given-name" />
            <Field icon={<FiUser />} label="Last name" value={form.lastName} onChange={value => setForm(current => ({ ...current, lastName: value }))} autoComplete="family-name" />
          </div>
          <Field icon={<FiMail />} label="Email" type="email" value={form.email} onChange={value => setForm(current => ({ ...current, email: value }))} autoComplete="email" />
          <div className="relative"><Field icon={<FiLock />} label="Password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={value => setForm(current => ({ ...current, password: value }))} autoComplete="new-password" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-9 text-slate-400" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <FiEyeOff /> : <FiEye />}</button></div>
          <Field icon={<FiLock />} label="Confirm password" type="password" value={form.confirmPassword} onChange={value => setForm(current => ({ ...current, confirmPassword: value }))} autoComplete="new-password" />
          <p className="text-xs text-slate-500">No resume is required during account creation.</p>
          <button disabled={submitting} className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{submitting ? 'Creating account…' : 'Create Account'}</button>
          <p className="text-center text-sm text-slate-500">Already registered? <Link href="/login?mode=candidate" className="font-semibold text-emerald-700 hover:underline">Candidate login</Link></p>
        </form>
      </section>
    </main>
  );
}

function Field({ icon, label, value, onChange, type = 'text', autoComplete }: { icon: ReactNode; label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span><span className="relative block"><span className="absolute inset-y-0 left-3 flex items-center text-slate-400">{icon}</span><input required type={type} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" /></span></label>;
}
