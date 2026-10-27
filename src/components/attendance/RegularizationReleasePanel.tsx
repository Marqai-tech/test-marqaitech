'use client';

/**
 * Regularization Release panel (Task 161)
 *
 * Admin/HR control that "releases" the attendance regularization feature for
 * ALL employees for the current payroll cycle. Releasing enables employee
 * self-service regularization until the payroll cut-off date and dispatches
 * an email + in-app/mobile notification to every active employee inviting
 * them to apply. The window auto-closes after the cut-off; it can also be
 * closed manually. Rendered on /attendance/approval-workflows above the
 * workflow builder.
 */

import { useCallback, useEffect, useState } from 'react';
import { FiUnlock, FiLock, FiRefreshCw, FiSend, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface WindowState {
  open: boolean;
  legacy: boolean;
  reason: string | null;
  cutoffDate: string | null;
  daysLeft: number | null;
  release: { releasedByName?: string; releasedAt?: string; note?: string; payrollCutoffDay?: number | null } | null;
  payrollCutoffDay: number | null;
  payrollCutoffDayDefault: number | null;
  canManage?: boolean;
}

export default function RegularizationReleasePanel() {
  const { user } = useAuthStore();
  const canManage = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(user?.role || '');

  const [state, setState] = useState<WindowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'release' | 'close' | null>(null);
  const [cutoffDay, setCutoffDay] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const applyWindowState = useCallback((w: WindowState) => {
    setState(w);
    // Prefill the controls with the effective cut-off day + last note.
    const effectiveDay = w.payrollCutoffDay ?? w.payrollCutoffDayDefault;
    setCutoffDay((prev) => prev || (effectiveDay != null ? String(effectiveDay) : ''));
    setNote((prev) => prev || w.release?.note || '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/attendance/regularization-release', { headers: getAuthHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to load the regularization window');
      applyWindowState(d as WindowState);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load the regularization window');
    } finally {
      setLoading(false);
    }
  }, [applyWindowState]);

  useEffect(() => {
    if (!canManage) return;
    let alive = true;
    // Mount fetch (async callbacks only — no synchronous setState in effect)
    fetch('/api/attendance/regularization-release', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (alive && d && typeof d.open === 'boolean') applyWindowState(d as WindowState); })
      .catch(() => { /* window state is optional */ });
    return () => { alive = false; };
  }, [canManage, applyWindowState]);

  const act = async (action: 'release' | 'close') => {
    if (action === 'release' && !confirm('Release the regularization window for ALL employees? Every active employee will receive an email + in-app notification inviting them to apply before the payroll cut-off.')) return;
    if (action === 'close' && !confirm('Close the regularization window now? Employees will no longer be able to self-apply until you release it again.')) return;
    setBusy(action);
    try {
      const payload: Record<string, unknown> = { action };
      const day = Number(cutoffDay);
      if (Number.isFinite(day) && day >= 1 && day <= 31) payload.payrollCutoffDay = day;
      if (note.trim()) payload.note = note.trim();
      const r = await fetch('/api/attendance/regularization-release', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Failed to ${action} the window`);
      if (action === 'release') {
        toast.success(d.message || `Regularization released — notifying ${d.notified ?? 0} employee(s) by email + in-app`, { duration: 6000 });
      } else {
        toast.success('Regularization window closed');
      }
      setState((prev) => ({ ...(d as WindowState), payrollCutoffDayDefault: d.payrollCutoffDayDefault ?? prev?.payrollCutoffDayDefault ?? null }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  if (!canManage) return null;

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null);
  const cutoffLabel = fmt(state?.cutoffDate ?? null);

  return (
    <div className="thb-card p-5 border-l-4 border-l-violet-500">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center flex-shrink-0">
          {state && !state.legacy && !state.open ? <FiLock className="w-5 h-5" /> : <FiUnlock className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-thb-text-primary">Regularization Window</h3>
            <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50">
              <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          <p className="text-sm text-thb-text-secondary mt-1">
            Release attendance regularization for ALL employees for this payroll cycle — they receive an email and in-app
            (mobile) notification inviting them to apply. The window closes automatically after the payroll cut-off date.
          </p>

          {/* Status */}
          <div className="mt-3 rounded-xl border border-thb-border p-3.5 bg-slate-50/60">
            {loading ? (
              <p className="text-sm text-slate-500">Loading window state…</p>
            ) : !state || state.legacy ? (
              <p className="text-sm text-slate-600 inline-flex items-start gap-2">
                <FiAlertCircle className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                No release control used yet — regularization is currently always available to employees. Release it below
                to run it as a per-cycle window with notifications.
              </p>
            ) : state.open ? (
              <p className="text-sm text-emerald-700 font-medium inline-flex items-start gap-2">
                <FiCheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                OPEN{cutoffLabel ? ` — employees can apply until ${cutoffLabel}` : ''}
                {state.daysLeft != null && state.daysLeft > 0 ? ` (${state.daysLeft} day(s) left)` : ' (cut-off is today)'}
                {state.release?.releasedByName ? ` · released by ${state.release.releasedByName}` : ''}
              </p>
            ) : (
              <p className="text-sm text-amber-700 font-medium inline-flex items-start gap-2">
                <FiLock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                CLOSED — {state.reason === 'past_payroll_cutoff'
                  ? `the payroll cut-off${cutoffLabel ? ` (${cutoffLabel})` : ''} has passed. Release again for the next cycle.`
                  : 'employees cannot self-apply until you release the window.'}
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-thb-text-secondary">Payroll cut-off day (1–31)</span>
              <input
                type="number" min={1} max={31}
                value={cutoffDay}
                onChange={(e) => setCutoffDay(e.target.value)}
                placeholder={String(state?.payrollCutoffDayDefault ?? 25)}
                className="mt-1 w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-thb-text-secondary">Note to employees (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Regularize all missed punches for this month before the cut-off."
                className="mt-1 w-full px-3 py-2 border border-thb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => act('release')}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-semibold shadow-sm hover:shadow-md disabled:opacity-60 transition-all"
            >
              <FiSend className={`w-4 h-4 ${busy === 'release' ? 'animate-pulse' : ''}`} />
              {busy === 'release' ? 'Releasing & notifying…' : 'Release for All Employees'}
            </button>
            <button
              onClick={() => act('close')}
              disabled={busy !== null || !state || state.legacy || !state.open}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <FiLock className="w-4 h-4" />
              {busy === 'close' ? 'Closing…' : 'Close Window'}
            </button>
            <p className="text-[11px] text-thb-text-muted">
              Release sends email + in-app notifications to every active employee.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
