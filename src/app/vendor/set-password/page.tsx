'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function VendorSetPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) setErr('Missing invite token in the URL.');
  }, [token]);

  const submit = async () => {
    setErr(''); setMsg('');
    if (!token) { setErr('Missing invite token.'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/vendor/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data?.error || 'Failed to set password.'); return; }
      setMsg('Password set successfully! Redirecting to login…');
      setTimeout(() => router.push('/login'), 1500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Vendor Portal — Set Password</h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        Choose a password to activate your vendor account.
      </p>
      {err && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {msg && <div style={{ color: '#059669', fontSize: 13, marginBottom: 12 }}>{msg}</div>}
      <label style={{ fontSize: 12, color: '#475569', display: 'block', marginBottom: 4 }}>New Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 6, marginBottom: 12, fontSize: 14 }}
        placeholder="••••••••"
      />
      <label style={{ fontSize: 12, color: '#475569', display: 'block', marginBottom: 4 }}>Confirm Password</label>
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 6, marginBottom: 16, fontSize: 14 }}
        placeholder="••••••••"
      />
      <button
        onClick={submit}
        disabled={loading || !token}
        style={{ width: '100%', padding: '12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: loading ? 'wait' : 'pointer', opacity: loading || !token ? 0.6 : 1 }}
      >
        {loading ? 'Setting…' : 'Set Password & Activate'}
      </button>
    </div>
  );
}
