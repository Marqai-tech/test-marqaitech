'use client';

import { useState } from 'react';
import { FiShield, FiEye, FiEyeOff } from 'react-icons/fi';
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
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-slate-800">Vendor Portal Login</h2>
        <p className="text-xs text-slate-500 mt-1">BGV vendors — admin &amp; employee access</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vendor@example.com"
          className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          onKeyDown={(e) => e.key === 'Enter' && handleVendorLogin()}
        />
      </div>
      <div className="relative">
        <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
        <input
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 pr-10"
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
        className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-slate-700 to-slate-800 text-white hover:from-slate-800 hover:to-slate-900 disabled:opacity-50"
      >
        {isSubmitting ? 'Signing in…' : 'Sign In as Vendor'}
      </button>
      <p className="text-[11px] text-center text-slate-400">
        Vendor access is granted by invitation only. Contact your HR administrator if you need access.
      </p>
    </div>
  );
}
