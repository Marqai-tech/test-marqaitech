'use client';

/**
 * Task 162 — ESS "Edit Profile" modal (own-profile self-service editing).
 *
 * The server-side self-edit flow already existed (PATCH /api/users/profile:
 * low-risk fields applied directly, high-risk routed to the update-request
 * approval workflow, identity fields locked) but after the Task-154 My-Profile
 * unification NO UI element invoked it for employees — the Edit button on the
 * shared employee detail page is gated to HR/admin roles only. This modal
 * restores the missing entry point for employees on /my-profile.
 *
 * Scope: the low-risk contact block (applied directly on save). Everything
 * HR-managed (names, bank, KYC, employment) stays with the existing
 * Employees → Update Requests channel.
 */
import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiX, FiSave, FiLoader } from 'react-icons/fi';
import { getToken } from '@/lib/token-storage';

function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export type SelfEditEmployeeValues = {
  id: string;
  phone?: string | null;
  personalEmail?: string | null;
  currentAddress?: string | null;
  currentCity?: string | null;
  currentState?: string | null;
  currentZipCode?: string | null;
  currentCountry?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
};

type FieldDef = { key: keyof SelfEditEmployeeValues; label: string; type?: 'text' | 'email' | 'tel'; placeholder?: string; full?: boolean };

const FIELDS: FieldDef[] = [
  { key: 'phone', label: 'Phone Number', type: 'tel', placeholder: '+91 98765 43210' },
  { key: 'personalEmail', label: 'Personal Email', type: 'email', placeholder: 'you@example.com' },
  { key: 'currentAddress', label: 'Current Address', full: true, placeholder: 'House / street / area' },
  { key: 'currentCity', label: 'City' },
  { key: 'currentState', label: 'State' },
  { key: 'currentZipCode', label: 'ZIP Code' },
  { key: 'currentCountry', label: 'Country' },
  { key: 'emergencyContactName', label: 'Emergency Contact Name' },
  { key: 'emergencyContactPhone', label: 'Emergency Contact Phone', type: 'tel' },
  { key: 'emergencyContactRelation', label: 'Emergency Contact Relation', placeholder: 'e.g. Spouse / Parent' },
];

export default function SelfEditProfileModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: SelfEditEmployeeValues;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const initial = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const f of FIELDS) out[f.key as string] = String((employee as Record<string, unknown>)?.[f.key as string] ?? '');
    return out;
  }, [employee]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);

  const changed = FIELDS.filter((f) => (values[f.key as string] ?? '') !== (initial[f.key as string] ?? ''));

  const handleSave = async () => {
    if (!changed.length) {
      toast.error('Nothing to update — edit at least one field.');
      return;
    }
    const emailField = changed.find((f) => f.key === 'personalEmail' && String(values.personalEmail || '').trim());
    if (emailField && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.personalEmail).trim())) {
      toast.error('Personal Email is not valid.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const f of changed) payload[f.key as string] = String(values[f.key as string] ?? '').trim();
      const res = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Update failed (HTTP ${res.status})`);
      }
      const applied: string[] = data?.appliedFields || [];
      const pending: string[] = data?.pendingFields || [];
      const skipped: string[] = data?.skippedFields || [];
      if (applied.length) toast.success(`Updated: ${applied.join(', ')}`);
      if (pending.length) toast.success(`Sent for HR approval: ${pending.join(', ')}`);
      if (skipped.length) toast.error(`Not editable here: ${skipped.join(', ')}`);
      if (!applied.length && !pending.length && !skipped.length) toast.success('Profile saved');
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Edit Profile</h3>
            <p className="text-xs text-slate-500 mt-0.5">Contact details save instantly; HR-managed fields go through Update Requests.</p>
          </div>
          <button onClick={onClose} disabled={saving} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50" aria-label="Close">
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <div key={f.key as string} className={f.full ? 'sm:col-span-2' : ''}>
                <label className="block text-xs font-medium text-slate-600 mb-1.5" htmlFor={`self-edit-${f.key as string}`}>{f.label}</label>
                <input
                  id={`self-edit-${f.key as string}`}
                  type={f.type || 'text'}
                  value={values[f.key as string] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key as string]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition"
                />
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            Name, date of birth, bank & KYC details are managed by HR — raise them from
            <span className="font-medium text-slate-700"> Employees → Update Requests</span>. Your profile photo can be changed from the header avatar menu.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || changed.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-teal-600 via-fuchsia-500 to-cyan-500 hover:from-teal-700 hover:via-fuchsia-600 hover:to-cyan-600 shadow-md shadow-fuchsia-200/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
            {saving ? 'Saving…' : `Save ${changed.length ? `(${changed.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
