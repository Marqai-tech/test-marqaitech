'use client';

import { useState } from 'react';
import { FiShield, FiEye, FiEyeOff, FiLock, FiMail } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * VendorLoginForm — extracted into its own component file to prevent
 * Turbopack's chunk extraction from losing the closure of component-local
 * variables (isPlatformSite, showPassword, etc.) in the parent LoginPage.
 *
 * When this form was inline in LoginPage, Turbopack extracted the JSX
 * referencing `showPassword` into a shared chunk that didn't have the
 * variable in scope → "ReferenceError: showPassword is not defined" when
 * clicking the Vendor tab → the form didn't render.
 *
 * By extracting it into its own component, all state is scoped here and
 * Turbopack cannot extract it into a parent-level shared chunk.
 */
export default function VendorLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleVendorLogin = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      toast.error('Email and password are required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/vendor/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || 'Vendor login failed.';
        setError(msg);
        toast.error(msg);
        return;
      }
      if (data.token) {
        localStorage.setItem('tb_token', data.token);
        localStorage.setItem('tb_user', JSON.stringify(data.user));
      }
      toast.success('Welcome to the Vendor Portal!');
      router.push('/vendor-portal/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error during vendor login.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><FiShield /></span><span><strong className="block text-sm">Secure vendor access</strong>Use the credentials created from your vendor invitation.</span></div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Work email</label>
        <div className="relative"><FiMail className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vendor@example.com"
          className="w-full pl-10 pr-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          onKeyDown={(e) => e.key === 'Enter' && handleVendorLogin()}
        /></div>
      </div>
      <div className="relative">
        <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
        <FiLock className="absolute left-3 top-9 h-4 w-4 text-slate-400" /><input
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full pl-10 pr-10 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          onKeyDown={(e) => e.key === 'Enter' && handleVendorLogin()}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-9 text-slate-400 hover:text-slate-600"
        >
          {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end -mt-1">
        <Link href="/vendor/forgot-password" className="text-xs font-medium text-slate-600 hover:text-teal-700 hover:underline">
          Forgot password?
        </Link>
      </div>
      <button
        onClick={handleVendorLogin}
        disabled={isSubmitting}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-sm disabled:opacity-50"
      >
        {isSubmitting ? 'Signing in…' : 'Sign In to Vendor Portal'}
      </button>
      <p className="text-[11px] text-center text-slate-400">
        Vendor access is granted by invitation only. Contact your HR administrator if you need access.
      </p>
    </div>
  );
}
