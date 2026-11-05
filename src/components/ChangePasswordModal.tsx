'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiEye, FiEyeOff, FiLock, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { getToken } from '@/lib/token-storage';

/**
 * Task 134 — Change Password modal.
 * Opened from the header avatar dropdown ("Change Password", every role)
 * and from the My Profile page. Posts { currentPassword, newPassword } to
 * POST /api/auth/change-password; the server verifies the current password,
 * enforces the length policy and mirror-syncs the new hash into every DB
 * copy of the identity (tenant DB + platform mirror) so all login paths
 * (tenant host, apex, mobile ladder) accept the new password immediately.
 */

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

const MIN_LENGTH = 8;

export default function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  // Escape closes while the modal is open (and not mid-submit).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  const validate = (): string | null => {
    if (!currentPassword) return 'Please enter your current password.';
    if (!newPassword) return 'Please enter a new password.';
    if (newPassword.length < MIN_LENGTH) return `New password must be at least ${MIN_LENGTH} characters.`;
    if (newPassword === currentPassword) return 'New password must be different from the current password.';
    if (newPassword !== confirmPassword) return 'New password and confirmation do not match.';
    return null;
  };

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const token = getToken() || useAuthStore.getState().token;
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Password changed successfully');
        onClose();
      } else {
        setError(data?.error || 'Failed to change password. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, currentPassword, newPassword, confirmPassword, onClose]);

  if (!open) return null;

  const passwordFields: Array<{
    label: string;
    value: string;
    setValue: (v: string) => void;
    visible: boolean;
    toggle: () => void;
    placeholder: string;
    hint?: string;
  }> = [
    {
      label: 'Current Password',
      value: currentPassword,
      setValue: setCurrentPassword,
      visible: showCurrent,
      toggle: () => setShowCurrent((s) => !s),
      placeholder: 'Enter your current password',
    },
    {
      label: 'New Password',
      value: newPassword,
      setValue: setNewPassword,
      visible: showNew,
      toggle: () => setShowNew((s) => !s),
      placeholder: `At least ${MIN_LENGTH} characters`,
      hint: `Use at least ${MIN_LENGTH} characters.`,
    },
    {
      label: 'Confirm New Password',
      value: confirmPassword,
      setValue: setConfirmPassword,
      visible: showConfirm,
      toggle: () => setShowConfirm((s) => !s),
      placeholder: 'Re-enter the new password',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Change Password"
    >
      <div className="w-full max-w-md thb-card shadow-2xl animate-slide-in-down overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-thb-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
              <FiLock className="w-4.5 h-4.5 text-green-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-thb-text-primary leading-tight">Change Password</h3>
              <p className="text-xs text-thb-text-muted">Update your account password anytime</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {passwordFields.map((f) => (
            <div key={f.label}>
              <label className="block text-xs font-semibold text-thb-text-secondary mb-1.5">{f.label}</label>
              <div className="relative">
                <input
                  type={f.visible ? 'text' : 'password'}
                  value={f.value}
                  onChange={(e) => {
                    f.setValue(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder={f.placeholder}
                  autoComplete={f.label === 'Current Password' ? 'current-password' : 'new-password'}
                  disabled={submitting}
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-thb-border bg-white text-sm text-thb-text-primary placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400 transition-all disabled:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={f.toggle}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                  aria-label={f.visible ? 'Hide password' : 'Show password'}
                >
                  {f.visible ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                </button>
              </div>
              {f.hint && <p className="mt-1 text-[11px] text-thb-text-muted">{f.hint}</p>}
            </div>
          ))}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-3.5 py-2.5 text-xs text-red-600 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-thb-border bg-slate-50/60">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 shadow-sm shadow-green-600/20 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {submitting && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {submitting ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
