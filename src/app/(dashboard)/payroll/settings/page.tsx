'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  FiDollarSign, FiEdit3, FiPlay, FiZap, FiSettings, FiCalendar,
  FiCheckCircle, FiAlertCircle, FiRefreshCw,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import ModuleSettingsPanel, { payrollSections } from '@/components/ModuleSettingsPanel';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface ProcessingSettings {
  mode: 'auto' | 'manual';
  autoProcessDay: number;
  lopEnabled: boolean;
}

interface StatutorySettings {
  pfEnabled: boolean;
  esiEnabled: boolean;
}

interface ProcessResult {
  created: number;
  skipped: number;
  failed: number;
  totalGross: number;
  totalNet: number;
  monthsCovered: string[];
  mode: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Payroll Settings page (Task 123):
 *  • General payroll configuration sections (Pay Schedule, Overtime, Tax &
 *    Compliance, Advanced) migrated from /settings in Task 56.
 *  • NEW — "Salary Processing Mode" card: the payroll head selects AUTO
 *    (monthly cron processes + backfills salary) or MANUAL (process on
 *    demand), toggles attendance-LOP integration, and can trigger an
 *    immediate "Process & Backfill Now" run for any period.
 */
export default function PayrollSettingsPage() {
  const { user } = useAuthStore();
  const effectiveCompanyId = useCompanyContextStore(s => s.effectiveCompanyId);
  const isAdmin = user?.role === 'super_admin' || (user?.role === 'tenant_admin' || user?.role === 'ceo') || user?.role === 'admin' || user?.role === 'hr_admin';

  const [processing, setProcessing] = useState<ProcessingSettings>({ mode: 'manual', autoProcessDay: 1, lopEnabled: true });
  const [statutory, setStatutory] = useState<StatutorySettings>({ pfEnabled: true, esiEnabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing_run, setProcessingRun] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [runMonth, setRunMonth] = useState<number>(new Date().getMonth() + 1);
  const [runYear, setRunYear] = useState<number>(new Date().getFullYear());
  const [backfill, setBackfill] = useState(true);
  const [force, setForce] = useState(false);
  const [autoMode, setAutoMode] = useState(false);

  const cid = effectiveCompanyId();
  const scopeQuery = cid ? `companyId=${cid}&` : '';

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/payroll/salary-settings?${scopeQuery}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.processing) {
          setProcessing({
            mode: data.data.processing.mode === 'auto' ? 'auto' : 'manual',
            autoProcessDay: data.data.processing.autoProcessDay || 1,
            lopEnabled: data.data.processing.lopEnabled !== false,
          });
        }
        setStatutory({
          pfEnabled: data.data?.pf?.enabled !== false,
          esiEnabled: data.data?.esi?.enabled !== false,
        });
        setAutoMode(data.data?.processing?.mode === 'auto');
      }
    } catch {
      toast.error('Failed to load payroll settings');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  useEffect(() => { queueMicrotask(() => fetchSettings()); }, [fetchSettings]);

  const saveProcessing = async (next?: ProcessingSettings) => {
    const payload = next || processing;
    setSaving(true);
    try {
      const res = await fetch(`/api/payroll/salary-settings?${scopeQuery}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ processing: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAutoMode(payload.mode === 'auto');
        toast.success(payload.mode === 'auto'
          ? 'Auto processing enabled — salary will be processed automatically every month'
          : 'Manual processing enabled — process salary from this page when ready');
        fetchSettings();
      } else {
        toast.error(data.error || 'Failed to save processing settings');
      }
    } catch {
      toast.error('Failed to save processing settings');
    } finally {
      setSaving(false);
    }
  };

  const saveStatutory = async (next: StatutorySettings) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/payroll/salary-settings?${scopeQuery}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ pf: { enabled: next.pfEnabled }, esi: { enabled: next.esiEnabled } }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatutory(next);
        toast.success('Statutory deductions updated — reprocess payslips to apply to already generated months');
      } else {
        toast.error(data.error || 'Failed to save statutory settings');
      }
    } catch {
      toast.error('Failed to save statutory settings');
    } finally {
      setSaving(false);
    }
  };

  const runProcessing = async () => {
    setProcessingRun(true);
    setResult(null);
    try {
      const res = await fetch(`/api/payroll/process?${scopeQuery}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          month: runMonth,
          year: runYear,
          backfill,
          force,
          mode: processing.mode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult(data.data);
        toast.success(data.message || 'Salary processed');
      } else {
        toast.error(data.error || 'Failed to process salary');
      }
    } catch {
      toast.error('Failed to process salary');
    } finally {
      setProcessingRun(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
          <FiDollarSign className="w-6 h-6 text-emerald-500" />
          Payroll Settings
        </h1>
        <p className="text-thb-text-secondary mt-1">Configure payroll processing, tax, and calculation rules</p>
      </div>

      {/* ─── Salary Processing Mode (Task 123) ─── */}
      <div className="thb-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-emerald-50 to-white border-b border-thb-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <FiZap className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-thb-text-primary">Salary Processing Mode</h2>
              <p className="text-xs text-thb-text-muted">Selected by the payroll head — controls how salary is generated every month</p>
            </div>
          </div>
          {autoMode && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
              <FiCheckCircle className="w-3.5 h-3.5" /> AUTO IS ON
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-5 animate-pulse"><div className="h-32 bg-slate-200 rounded" /></div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Mode selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => { const next = { ...processing, mode: 'auto' as const }; setProcessing(next); saveProcessing(next); }}
                disabled={!isAdmin || saving}
                className={`text-left p-4 rounded-xl border-2 transition-all ${processing.mode === 'auto' ? 'border-emerald-500 bg-emerald-50' : 'border-thb-border hover:border-emerald-300'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FiZap className={`w-4 h-4 ${processing.mode === 'auto' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="font-semibold text-sm text-thb-text-primary">Auto Processing</span>
                  {processing.mode === 'auto' && <FiCheckCircle className="w-4 h-4 text-emerald-500 ml-auto" />}
                </div>
                <p className="text-xs text-thb-text-secondary">Salary is processed automatically every month (with backfill of any missed months since joining). No manual step needed.</p>
              </button>

              <button
                onClick={() => { const next = { ...processing, mode: 'manual' as const }; setProcessing(next); saveProcessing(next); }}
                disabled={!isAdmin || saving}
                className={`text-left p-4 rounded-xl border-2 transition-all ${processing.mode === 'manual' ? 'border-sky-500 bg-sky-50' : 'border-thb-border hover:border-sky-300'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FiSettings className={`w-4 h-4 ${processing.mode === 'manual' ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span className="font-semibold text-sm text-thb-text-primary">Manual Processing</span>
                  {processing.mode === 'manual' && <FiCheckCircle className="w-4 h-4 text-sky-500 ml-auto" />}
                </div>
                <p className="text-xs text-thb-text-secondary">The payroll head processes salary on demand using the &quot;Process &amp; Backfill Now&quot; action below each month.</p>
              </button>
            </div>

            {/* Options row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-thb-border">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-thb-text-primary">Attendance LOP Integration</p>
                    <p className="text-xs text-thb-text-muted mt-0.5">Absent = 1 LOP day, Half-day = 0.5 — salary prorated by paid days</p>
                  </div>
                  <button
                    onClick={() => { const next = { ...processing, lopEnabled: !processing.lopEnabled }; setProcessing(next); saveProcessing(next); }}
                    disabled={!isAdmin || saving}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${processing.lopEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${processing.lopEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </label>
              </div>
              <div className="p-4 rounded-xl border border-thb-border">
                <label className="block text-sm font-medium text-thb-text-primary mb-1.5">
                  <span className="inline-flex items-center gap-1.5"><FiCalendar className="w-3.5 h-3.5" /> Auto-process day of month</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={1} max={28} value={processing.autoProcessDay}
                    onChange={e => setProcessing(p => ({ ...p, autoProcessDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) }))}
                    disabled={!isAdmin || processing.mode !== 'auto'}
                    className="w-24 px-3 py-2 rounded-lg border border-thb-border text-sm disabled:opacity-50"
                  />
                  {isAdmin && processing.mode === 'auto' && (
                    <button onClick={() => saveProcessing()} disabled={saving}
                      className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50">
                      Save day
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-thb-text-muted mt-1">Monthly auto run happens on/after this day (cron: 1st of the month)</p>
              </div>
            </div>

            {/* Statutory Deductions (PF / ESI) — Task 124 */}
            <div className="p-4 rounded-xl border border-thb-border">
              <p className="text-sm font-semibold text-thb-text-primary mb-0.5">Statutory Deductions — PF &amp; ESI</p>
              <p className="text-xs text-thb-text-muted mb-3">Company-level toggles. When OFF the component is not deducted from any employee&apos;s payslip (e.g. MarqAI Tech Group: both OFF). Turn on "Reprocess" below and run Process &amp; Backfill to apply to already generated payslips.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-thb-border cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-thb-text-primary">Provident Fund (EPF)</p>
                    <p className="text-[10px] text-thb-text-muted">12% of basic up to ₹15,000 wage ceiling</p>
                  </div>
                  <button
                    onClick={() => saveStatutory({ ...statutory, pfEnabled: !statutory.pfEnabled })}
                    disabled={!isAdmin || saving}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${statutory.pfEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    aria-label="Toggle Provident Fund"
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${statutory.pfEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </label>
                <label className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-thb-border cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-thb-text-primary">ESI (ESIC)</p>
                    <p className="text-[10px] text-thb-text-muted">0.75% of gross up to ₹21,000 wage ceiling</p>
                  </div>
                  <button
                    onClick={() => saveStatutory({ ...statutory, esiEnabled: !statutory.esiEnabled })}
                    disabled={!isAdmin || saving}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${statutory.esiEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    aria-label="Toggle ESI"
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${statutory.esiEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </label>
              </div>
            </div>

            {/* Process & Backfill Now */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-sky-50 to-white border border-sky-200">
              <div className="flex items-center gap-2 mb-3">
                <FiPlay className="w-4 h-4 text-sky-600" />
                <p className="text-sm font-semibold text-thb-text-primary">Process Salary Now</p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1">Month</label>
                  <select value={runMonth} onChange={e => setRunMonth(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-thb-border text-sm">
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-thb-text-secondary mb-1">Year</label>
                  <input type="number" value={runYear} min={2020} max={2100} onChange={e => setRunYear(Number(e.target.value) || new Date().getFullYear())}
                    className="w-24 px-3 py-2 rounded-lg border border-thb-border text-sm" />
                </div>
                <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={backfill} onChange={e => setBackfill(e.target.checked)} className="rounded accent-sky-600" />
                  <span className="text-xs text-thb-text-secondary">Backfill all past months since joining</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 cursor-pointer" title="Recompute payslips that already exist (applies changed settings/statutory config to past months)">
                  <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} className="rounded accent-amber-600" />
                  <span className="text-xs text-thb-text-secondary">Reprocess existing payslips (apply current settings)</span>
                </label>
                {isAdmin && (
                  <button onClick={runProcessing} disabled={processing_run}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50 shadow-sm">
                    {processing_run ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiPlay className="w-4 h-4" />}
                    {processing_run ? 'Processing…' : 'Process & Backfill Now'}
                  </button>
                )}
              </div>

              {result && (
                <div className={`mt-4 p-3 rounded-lg text-xs ${result.failed > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    {result.failed > 0 ? <FiAlertCircle className="w-4 h-4" /> : <FiCheckCircle className="w-4 h-4" />}
                    Run complete — mode: {result.mode.toUpperCase()}
                  </div>
                  <p>{result.created} payslip(s) created · {result.skipped} skipped (existing / not eligible) · {result.failed} failed</p>
                  <p className="mt-0.5">Gross ₹{result.totalGross.toLocaleString('en-IN')} · Net ₹{result.totalNet.toLocaleString('en-IN')}</p>
                  <p className="mt-0.5 text-[10px]">Months covered: {result.monthsCovered.join(', ')}</p>
                  <Link href="/payroll/payslips" className="inline-block mt-2 text-sky-700 font-semibold hover:underline">View payslips →</Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* General Payroll Settings (migrated from /settings > Payroll tab) */}
      <ModuleSettingsPanel sections={payrollSections} />

      {/* Cross-link to Salary Structure settings (separate page) */}
      <div className="thb-card p-5">
        <h2 className="text-base font-semibold text-thb-text-primary mb-3">Salary Structure Settings</h2>
        <p className="text-xs text-thb-text-muted mb-4">For salary components, earning/deduction structure, and per-employee salary type defaults — visit the Salary Settings page.</p>
        <Link href="/payroll/salary-settings" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors">
          <FiEdit3 className="w-4 h-4" />
          Open Salary Structure Settings
        </Link>
      </div>
    </div>
  );
}
