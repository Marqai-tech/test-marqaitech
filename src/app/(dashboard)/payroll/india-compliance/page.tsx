'use client';

/**
 * India Compliance Center — one-stop console for the Indian statutory stack:
 *  • Statutory configuration (PT/LWF state, EPF ceiling policy, ESI, TDS regime, windows)
 *  • Statutory filing generators: EPF ECR, Form 5, Form 10, ESI return, PT return,
 *    LWF return, Form 24Q, Form 16 (Part A + B)
 *  • Variance governance (default 5% threshold → Finance Head approval)
 *  • Declaration & proof verification windows (April → January → Feb–Mar true-up)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  FiShield, FiSettings, FiDownload, FiFileText, FiCalendar, FiCheckCircle,
  FiAlertTriangle, FiRefreshCw, FiPercent, FiSave, FiInfo,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useCompanyContextStore } from '@/store/companyContextStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface StatutoryConfig {
  id?: string;
  companyId: string;
  ptState?: string | null;
  lwfState?: string | null;
  pfOnActualBasic: boolean;
  pfWageCeiling: number;
  pfAdminCharges: boolean;
  esiEnabled: boolean;
  esiWageLimit: number;
  tdsRegimeDefault: string;
  declarationWindowMonth: number;
  proofWindowMonth: number;
  proofDeadlineMonth: number;
  tdsAdjustFromMonth: number;
  varianceThresholdPct: number;
  notes?: string | null;
}

const PT_STATES = ['MH', 'KA', 'TN', 'TG', 'AP', 'GJ', 'WB', 'MP', 'KL', 'DL', 'UP'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FILING_FORMATS: Array<{ key: string; label: string; desc: string; authority: string; due: string }> = [
  { key: 'ECR', label: 'EPF ECR', desc: 'Electronic Challan-cum-Return (UAN-wise, EPS/EPF split)', authority: 'EPFO', due: '15th of following month' },
  { key: 'FORM5', label: 'EPF Form 5', desc: 'New members joined during the month', authority: 'EPFO', due: 'With monthly ECR' },
  { key: 'FORM10', label: 'EPF Form 10', desc: 'Members leaving service during the month', authority: 'EPFO', due: 'With monthly ECR' },
  { key: 'ESI', label: 'ESI Monthly Return', desc: 'IP-wise gross, EE 0.75% + ER 3.25%', authority: 'ESIC', due: '15th of following month' },
  { key: 'PT', label: 'PT Return', desc: 'State-wise Professional Tax summary', authority: 'State PT Dept', due: 'Varies by state' },
  { key: 'LWF', label: 'LWF Return', desc: 'State-wise Labour Welfare Fund contributions', authority: 'State LWF Board', due: 'Jun/Dec (half-yearly states)' },
  { key: '24Q', label: 'Form 24Q', desc: 'Quarterly e-TDS return for salaries (RPU-ready JSON)', authority: 'Income Tax Dept', due: 'Jul 31 / Oct 31 / Jan 31 / May 31' },
  { key: 'FORM16', label: 'Form 16', desc: 'Annual TDS certificate — Part A working sheet + Part B annexure', authority: 'Income Tax Dept', due: '15 June after FY end' },
];

export default function IndiaCompliancePage() {
  // Subscribe to the whole store so company-switcher changes re-render this page
  const { companies, effectiveCompanyId } = useCompanyContextStore();
  // effectiveCompanyId may be a selector function or a plain value depending on store version
  const resolvedCompanyId = typeof effectiveCompanyId === 'function' ? effectiveCompanyId() : effectiveCompanyId;
  const companyId = resolvedCompanyId || companies?.[0]?.id || '';

  const [config, setConfig] = useState<StatutoryConfig | null>(null);
  const [refInfo, setRefInfo] = useState<{ ptStates: string[]; notes: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [preview, setPreview] = useState<{ format: string; summary: Record<string, unknown>; preview: string; fileName: string } | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/statutory-config?companyId=${companyId}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (res.ok) {
        setConfig(json.data);
        setRefInfo(json.reference || null);
      } else {
        toast.error(json.error || 'Failed to load statutory config');
      }
    } catch {
      toast.error('Failed to load statutory config');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('/api/payroll/statutory-config', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...config, companyId }),
      });
      const json = await res.json();
      if (res.ok) { toast.success('India statutory configuration saved'); setConfig(json.data); }
      else toast.error(json.error || 'Failed to save');
    } catch { toast.error('Failed to save configuration'); }
    finally { setSaving(false); }
  };

  const generateFiling = async (format: string, download: boolean) => {
    try {
      const res = await fetch(`/api/payroll/reports/india-formats?format=${format}&month=${month}&year=${year}&companyId=${companyId}${download ? '&download=1' : ''}`, { headers: getAuthHeaders() });
      if (download && res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || `${format}_${year}-${String(month).padStart(2, '0')}`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success(`${format} file downloaded`);
        return;
      }
      const json = await res.json();
      if (res.ok) setPreview({ format, summary: json.summary || {}, preview: json.preview || '', fileName: json.fileName || format });
      else toast.error(json.error || 'Failed to generate');
    } catch { toast.error('Failed to generate filing'); }
  };

  const registerFiling = async (format: string) => {
    setRegistering(format);
    try {
      const res = await fetch('/api/payroll/reports/india-formats', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ format, month, year, companyId }),
      });
      const json = await res.json();
      if (res.ok) toast.success(json.message || 'Filing registered');
      else toast.error(json.error || 'Failed to register filing');
    } catch { toast.error('Failed to register filing'); }
    finally { setRegistering(null); }
  };

  const upd = (patch: Partial<StatutoryConfig>) => setConfig(c => (c ? { ...c, ...patch } : c));
  const monthName = (m?: number) => MONTHS[(m || 1) - 1];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiShield className="w-6 h-6 text-emerald-500" />
            India Compliance Center
          </h1>
          <p className="text-thb-text-secondary mt-1">
            Indian statutory stack: EPF · ESIC · Professional Tax · LWF · TDS (Old/New Regime) — configuration, filings and governance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="text-sm border border-thb-border rounded-lg px-3 py-2 bg-white">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || year)} className="text-sm border border-thb-border rounded-lg px-3 py-2 w-24 bg-white" />
          <button onClick={loadConfig} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-thb-border hover:bg-slate-50">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* ─── Statutory Configuration ─── */}
      <div className="thb-card p-5">
        <h2 className="font-semibold text-thb-text-primary flex items-center gap-2 mb-1">
          <FiSettings className="w-4 h-4 text-emerald-500" /> Statutory Configuration
          <span className="text-xs font-normal text-thb-text-muted">(applies to every payroll run for this company)</span>
        </h2>
        {config ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <label className="text-sm">
              <span className="block text-thb-text-secondary mb-1">Professional Tax State</span>
              <select value={config.ptState || ''} onChange={(e) => upd({ ptState: e.target.value || null })} className="w-full border border-thb-border rounded-lg px-3 py-2 bg-white">
                <option value="">— Auto (employee/company state) —</option>
                {PT_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-thb-text-secondary mb-1">LWF State</span>
              <select value={config.lwfState || ''} onChange={(e) => upd({ lwfState: e.target.value || null })} className="w-full border border-thb-border rounded-lg px-3 py-2 bg-white">
                <option value="">— Auto (employee/company state) —</option>
                {PT_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-thb-text-secondary mb-1">EPF Wage Ceiling (₹/month)</span>
              <div className="flex items-center gap-2">
                <input type="number" value={config.pfWageCeiling} onChange={(e) => upd({ pfWageCeiling: Number(e.target.value) })} className="w-full border border-thb-border rounded-lg px-3 py-2 bg-white" />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input type="checkbox" checked={config.pfOnActualBasic} onChange={(e) => upd({ pfOnActualBasic: e.target.checked })} />
                  On actual Basic
                </label>
              </div>
            </label>
            <label className="text-sm">
              <span className="block text-thb-text-secondary mb-1">ESIC Wage Limit (₹/month)</span>
              <div className="flex items-center gap-2">
                <input type="number" value={config.esiWageLimit} onChange={(e) => upd({ esiWageLimit: Number(e.target.value) })} className="w-full border border-thb-border rounded-lg px-3 py-2 bg-white" />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input type="checkbox" checked={config.esiEnabled} onChange={(e) => upd({ esiEnabled: e.target.checked })} />
                  Enabled
                </label>
              </div>
            </label>
            <label className="text-sm">
              <span className="block text-thb-text-secondary mb-1">Default TDS Regime</span>
              <select value={config.tdsRegimeDefault} onChange={(e) => upd({ tdsRegimeDefault: e.target.value })} className="w-full border border-thb-border rounded-lg px-3 py-2 bg-white">
                <option value="NEW">New Regime (default, FY 2025-26 slabs)</option>
                <option value="OLD">Old Regime (deductions & exemptions)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-thb-text-secondary mb-1">Declaration Window Opens (month)</span>
              <select value={config.declarationWindowMonth} onChange={(e) => upd({ declarationWindowMonth: Number(e.target.value) })} className="w-full border border-thb-border rounded-lg px-3 py-2 bg-white">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-thb-text-secondary mb-1">Proof Window / Deadline (month)</span>
              <div className="flex items-center gap-2">
                <select value={config.proofWindowMonth} onChange={(e) => upd({ proofWindowMonth: Number(e.target.value) })} className="w-full border border-thb-border rounded-lg px-3 py-2 bg-white">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <span className="text-thb-text-muted text-xs">true-up from</span>
                <select value={config.tdsAdjustFromMonth} onChange={(e) => upd({ tdsAdjustFromMonth: Number(e.target.value) })} className="w-full border border-thb-border rounded-lg px-3 py-2 bg-white">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </label>
            <label className="text-sm">
              <span className="block text-thb-text-secondary mb-1 flex items-center gap-1">
                <FiPercent className="w-3.5 h-3.5" /> Variance Approval Threshold (%)
              </span>
              <input type="number" value={config.varianceThresholdPct} onChange={(e) => upd({ varianceThresholdPct: Number(e.target.value) })} className="w-full border border-thb-border rounded-lg px-3 py-2 bg-white" />
            </label>
            <div className="lg:col-span-4 flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-thb-text-muted flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <FiInfo className="w-3.5 h-3.5" />
                  EPF admin 0.5% (min ₹500) & EDLI 0.5%:
                  <input type="checkbox" checked={config.pfAdminCharges} onChange={(e) => upd({ pfAdminCharges: e.target.checked })} className="ml-1" />
                </span>
                {refInfo && <span>PT states configured: {refInfo.ptStates.join(', ')}</span>}
              </p>
              <button onClick={saveConfig} disabled={saving} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                <FiSave className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Configuration'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-thb-text-muted mt-4">{loading ? 'Loading configuration…' : 'Select a company to configure.'}</p>
        )}
      </div>

      {/* ─── Statutory Filing Generators ─── */}
      <div className="thb-card p-5">
        <h2 className="font-semibold text-thb-text-primary flex items-center gap-2 mb-1">
          <FiFileText className="w-4 h-4 text-teal-500" /> Statutory Reports & Filings — {MONTHS[month - 1]} {year}
        </h2>
        <p className="text-xs text-thb-text-muted mb-4">Generate filing-ready files from payroll data, then register the submission for the compliance audit trail.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FILING_FORMATS.map(f => (
            <div key={f.key} className="border border-thb-border rounded-xl p-4 hover:border-emerald-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm text-thb-text-primary">{f.label}</p>
                  <p className="text-xs text-thb-text-secondary mt-0.5">{f.desc}</p>
                  <p className="text-[11px] text-thb-text-muted mt-1">{f.authority} · Due: {f.due}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => generateFiling(f.key, false)} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-thb-border hover:bg-slate-50">
                    <FiFileText className="w-3.5 h-3.5" /> Preview
                  </button>
                  <button onClick={() => generateFiling(f.key, true)} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
                    <FiDownload className="w-3.5 h-3.5" /> Download
                  </button>
                  <button onClick={() => registerFiling(f.key)} disabled={registering === f.key} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 disabled:opacity-50">
                    <FiCheckCircle className="w-3.5 h-3.5" /> {registering === f.key ? '…' : 'Mark Filed'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Preview panel */}
        {preview && (
          <div className="mt-4 border border-thb-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-thb-border">
              <p className="text-xs font-medium text-thb-text-primary">{preview.format} — {preview.fileName}</p>
              <button onClick={() => setPreview(null)} className="text-xs text-thb-text-muted hover:text-thb-text-primary">Close</button>
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-3 text-xs bg-emerald-50/40 border-b border-thb-border">
              {Object.entries(preview.summary).map(([k, v]) => (
                <span key={k} className="text-thb-text-secondary"><b className="text-thb-text-primary">{k}:</b> {String(v)}</span>
              ))}
            </div>
            <pre className="text-[11px] leading-relaxed p-4 overflow-auto max-h-72 whitespace-pre-wrap text-thb-text-secondary">{preview.preview}{preview.preview.length >= 2000 ? '\n… (truncated preview — download for the full file)' : ''}</pre>
          </div>
        )}
      </div>

      {/* ─── Workflow summary cards ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="thb-card p-5 border-l-4 border-l-amber-500">
          <h3 className="font-medium text-sm flex items-center gap-2 text-thb-text-primary"><FiCalendar className="w-4 h-4 text-amber-500" /> Declaration & Proof Cycle</h3>
          <ul className="text-xs text-thb-text-secondary mt-3 space-y-1.5 list-disc list-inside">
            <li><b>{monthName(config?.declarationWindowMonth || 4)}</b> — declaration window opens; employees elect Old/New regime + declare 80C/80D/24(b)/HRA.</li>
            <li>Apr–Dec — provisional TDS on declared figures.</li>
            <li><b>{monthName(config?.proofWindowMonth || 1)}</b> — employees upload proofs; HR/Finance verify per section.</li>
            <li><b>{monthName(config?.tdsAdjustFromMonth || 2)}–Mar</b> — verified deductions drive the TDS true-up; regime locked after verification.</li>
          </ul>
        </div>
        <div className="thb-card p-5 border-l-4 border-l-rose-500">
          <h3 className="font-medium text-sm flex items-center gap-2 text-thb-text-primary"><FiAlertTriangle className="w-4 h-4 text-rose-500" /> Variance Governance</h3>
          <ul className="text-xs text-thb-text-secondary mt-3 space-y-1.5 list-disc list-inside">
            <li>Threshold: <b>{config?.varianceThresholdPct ?? 5}%</b> net-pay variance vs previous month.</li>
            <li>Payroll Processing → run Variance Report (Reports tab) → flagged employees create review anomalies.</li>
            <li>Payroll specialist review → <b>Finance Head approval</b> (Payroll Approvals, SoD enforced) before bank file release.</li>
          </ul>
        </div>
        <div className="thb-card p-5 border-l-4 border-l-emerald-500">
          <h3 className="font-medium text-sm flex items-center gap-2 text-thb-text-primary"><FiCheckCircle className="w-4 h-4 text-emerald-500" /> Engine Reference (auto-applied)</h3>
          <ul className="text-xs text-thb-text-secondary mt-3 space-y-1.5 list-disc list-inside">
            <li><b>EPF</b>: 12% EE + 12% ER {config?.pfOnActualBasic ? 'on actual Basic+DA' : 'on Basic+DA capped at ₹15,000'} · EPS 8.33%{config?.pfAdminCharges ? ' · admin 0.5% (min ₹500) + EDLI 0.5%' : ''}.</li>
            <li><b>ESIC</b>: {config?.esiEnabled === false ? 'disabled for this company' : `0.75% EE + 3.25% ER ≤ ₹${(config?.esiWageLimit ?? 21000).toLocaleString('en-IN')}`}.</li>
            <li><b>PT</b>: {config?.ptState || 'state auto-detected'} slabs · <b>LWF</b>: {config?.lwfState || 'state auto-detected'} rates.</li>
            <li><b>TDS</b>: {config?.tdsRegimeDefault === 'OLD' ? 'Old' : 'New'} regime default · FY 2024-25 & 2025-26 slabs · 87A rebate · surcharge w/ marginal relief · 4% cess.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
