'use client';

/**
 * OFFER RULES — mock-approved Offer Management screen 5 (2026-11).
 *
 * Who approves, who sends, and what happens automatically — set once,
 * applies to every offer. Backed by GET/PUT /api/offers/workflow-config:
 *   - approval chain (levels)  → shown read-only here; the chain the
 *     Create Offer wizard and Approval Queue follow
 *   - rules.salaryThreshold    → offers above this need the next approver
 *   - rules.*                  → automatic behaviour toggles
 *
 * Pipeline stages (Applied, Screening, Interview…) deliberately do NOT
 * live here — they belong to Recruitment → Workflow Configuration.
 */
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { FiInfo, FiAlertTriangle, FiCheck, FiSave, FiFileText } from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface WfLevel { tier: number; approverType: string; label: string; }
interface WfRules {
  salaryThreshold?: number;
  approvalReminderDays?: number;
  offerExpiryDays?: number;
  candidateNotification?: boolean;
  esignatureRequired?: boolean;
  autoConvertAfterAcceptance?: boolean;
  bgvRequired?: boolean;
  preboardingAfterAcceptance?: boolean;
  [k: string]: unknown;
}
interface WfConfig { approvalRequired: boolean; levels: WfLevel[]; rules: WfRules; }

const APPROVER_LABEL: Record<string, string> = {
  hr_admin: 'HR Admin', hr_manager: 'HR Manager', company_hr_admin: 'HR Manager',
  finance: 'Finance / Budget', ceo: 'CEO', director: 'Director', admin: 'Admin', tenant_admin: 'Tenant Admin',
};
const APPROVER_COLOR: Record<string, string> = {
  hr_admin: 'bg-amber-400', hr_manager: 'bg-amber-400', company_hr_admin: 'bg-amber-400',
  finance: 'bg-blue-500', ceo: 'bg-blue-600', director: 'bg-blue-600', admin: 'bg-slate-500',
};

const inputCls = 'h-[34px] px-2.5 rounded-lg border border-slate-300 text-[12.5px] bg-white focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/15 w-full';

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`w-[34px] h-[19px] rounded-full relative flex-shrink-0 transition-colors ${on ? 'bg-green-600' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-[2px] w-[15px] h-[15px] rounded-full bg-white transition-all ${on ? 'left-[17px]' : 'left-[2px]'}`} />
    </button>
  );
}

export default function OfferRulesPage() {
  const [config, setConfig] = useState<WfConfig | null>(null);
  const [rules, setRules] = useState<WfRules>({});
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [levels, setLevels] = useState<WfLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem('tb_user');
        const role = raw ? (JSON.parse(raw)?.role || '') : '';
        setIsAdmin(['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin', 'ceo'].includes(role));
      } catch { setIsAdmin(false); }
    });
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/offers/workflow-config', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to load offer rules');
      const data = await res.json();
      const cfg: WfConfig = data?.config || { approvalRequired: true, levels: [], rules: {} };
      setConfig(cfg);
      setApprovalRequired(cfg.approvalRequired !== false);
      setLevels(Array.isArray(cfg.levels) ? cfg.levels : []);
      setRules(cfg.rules || {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load offer rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setRule = (k: keyof WfRules, v: unknown) => setRules(r => ({ ...r, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/offers/workflow-config', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ approvalRequired, levels, rules }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed'); }
      toast.success('Offer rules saved — they apply to every new offer');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const threshold = Number(rules.salaryThreshold || 0);

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Offer Rules</h1>
          <p className="text-xs text-slate-500 mt-1">Who approves, who sends, and what happens automatically — set once, applies to every offer</p>
        </div>
        {isAdmin && (
          <button onClick={save} disabled={saving || loading} className="h-8 px-3 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-40 inline-flex items-center gap-1.5 shadow-sm shadow-green-600/25">
            <FiSave className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save Rules'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse">
          <div className="h-4 w-48 bg-slate-100 rounded mb-4" /><div className="h-16 w-full bg-slate-100 rounded" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.12fr_.88fr] gap-3 items-start">
          {/* Left column */}
          <div className="flex flex-col gap-3 min-w-0">
            {/* Approval chain */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-[13px] font-bold text-slate-900">Approval chain</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3">Every offer follows this path before reaching the candidate. Configure the levels in Recruitment workflow levels JSON — steps with no matching rule are skipped automatically.</p>
              <div className="flex items-center flex-wrap gap-1.5">
                <span className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                  <span className="w-[30px] h-[30px] rounded-full bg-green-600 text-white grid place-items-center text-[10.5px] font-extrabold">YOU</span>
                  <span><b className="block text-[12px] text-slate-900">Recruiter / You</b><small className="block text-[10px] text-slate-500">creates the offer</small></span>
                </span>
                {levels.map(l => (
                  <span key={l.tier} className="contents">
                    <span className="text-slate-300 font-extrabold">→</span>
                    <span className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <span className={`w-[30px] h-[30px] rounded-full text-white grid place-items-center text-[10.5px] font-extrabold ${APPROVER_COLOR[l.approverType] || 'bg-slate-400'}`}>{l.tier}</span>
                      <span><b className="block text-[12px] text-slate-900">{APPROVER_LABEL[l.approverType] || l.approverType}</b><small className="block text-[10px] text-slate-500">{l.label}</small></span>
                    </span>
                  </span>
                ))}
                <span className="text-slate-300 font-extrabold">→</span>
                <span className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="w-[30px] h-[30px] rounded-full bg-violet-500 text-white grid place-items-center text-[13px]">⚙</span>
                  <span><b className="block text-[12px] text-slate-900">System</b><small className="block text-[10px] text-slate-500">sends &amp; tracks</small></span>
                </span>
              </div>
              {levels.length === 0 && (
                <p className="text-[11.5px] text-slate-400 mt-3">No approval levels configured — offers can be approved directly from All Offers.</p>
              )}
              {threshold > 0 && (
                <div className="mt-3">
                  <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-[10.5px] font-bold rounded-lg px-2.5 py-1.5">
                    <FiAlertTriangle className="w-3 h-3" /> {`₹${threshold.toLocaleString('en-IN')}`} — offers above this need the next approver (change below)
                  </span>
                </div>
              )}
            </div>

            {/* Who can do what */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-[13px] font-bold text-slate-900">Who can do what</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-2">Role permissions for offers — separated from pipeline stages, no overlap</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {['ACTION', 'WHO', 'NOTE'].map(h => <th key={h} className="text-left py-1.5 pr-2 text-[9.5px] font-extrabold tracking-wider text-slate-400">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    <tr className="border-b border-slate-100"><td className="py-2 pr-2 font-bold">Create offer</td><td className="py-2 pr-2">Recruiter, HR, Admin</td><td className="py-2 pr-2 text-slate-500">only for candidates marked “Offered” in the pipeline</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-2 pr-2 font-bold">Approve ≤ {threshold > 0 ? `₹${threshold.toLocaleString('en-IN')}` : 'limit'}</td><td className="py-2 pr-2">{levels[0] ? APPROVER_LABEL[levels[0].approverType] || levels[0].approverType : 'HR Admin'}</td><td className="py-2 pr-2 text-slate-500">{rules.approvalReminderDays ? `SLA ${rules.approvalReminderDays} days, auto-reminder to approver` : 'SLA reminder configurable below'}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-2 pr-2 font-bold">Approve above limit</td><td className="py-2 pr-2">{levels[1] ? APPROVER_LABEL[levels[1].approverType] || levels[1].approverType : 'Senior approver'}</td><td className="py-2 pr-2 text-slate-500">after the first approval</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-2 pr-2 font-bold">Send to candidate</td><td className="py-2 pr-2">System (auto) or HR</td><td className="py-2 pr-2 text-slate-500">only after all approvals</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-2 pr-2 font-bold">Withdraw offer</td><td className="py-2 pr-2">Creator, HR Manager</td><td className="py-2 pr-2 text-slate-500">allowed until accepted</td></tr>
                    <tr><td className="py-2 pr-2 font-bold">Manage templates &amp; rules</td><td className="py-2 pr-2">Tenant Admin, HR Manager</td><td className="py-2 pr-2 text-slate-500">this screen + <Link href="/offers/templates" className="text-green-700 font-bold hover:underline">Offer Templates</Link></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-3 min-w-0">
            {/* Automatic behaviour */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-[13px] font-bold text-slate-900">Automatic behaviour</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-1">No banners, no manual chasing — the system does the remembering</p>
              <div className="divide-y divide-slate-100">
                <div className="py-3 flex items-center justify-between gap-3">
                  <div><b className="block text-[12px] text-slate-900">Require approval before sending</b><small className="block text-[10.5px] text-slate-500 mt-0.5">offers must pass the approval chain before the candidate link works</small></div>
                  <Toggle on={approvalRequired} onChange={isAdmin ? setApprovalRequired : () => {}} label="Require approval" />
                </div>
                <div className="py-3 flex items-center justify-between gap-3">
                  <div><b className="block text-[12px] text-slate-900">Notify candidates about their offer</b><small className="block text-[10.5px] text-slate-500 mt-0.5">candidate receives the letter by email the moment it is fully approved</small></div>
                  <Toggle on={rules.candidateNotification !== false} onChange={v => setRule('candidateNotification', v)} label="Notify candidates" />
                </div>
                <div className="py-3 flex items-center justify-between gap-3">
                  <div><b className="block text-[12px] text-slate-900">Require e-signature</b><small className="block text-[10.5px] text-slate-500 mt-0.5">candidate must type-sign the letter on the secure acceptance page</small></div>
                  <Toggle on={rules.esignatureRequired === true} onChange={v => setRule('esignatureRequired', v)} label="Require e-signature" />
                </div>
                <div className="py-3 flex items-center justify-between gap-3">
                  <div><b className="block text-[12px] text-slate-900">BGV required</b><small className="block text-[10.5px] text-slate-500 mt-0.5">background verification is part of the joining checklist</small></div>
                  <Toggle on={rules.bgvRequired !== false} onChange={v => setRule('bgvRequired', v)} label="BGV required" />
                </div>
                <div className="py-3 flex items-center justify-between gap-3">
                  <div><b className="block text-[12px] text-slate-900">Start preboarding after acceptance</b><small className="block text-[10.5px] text-slate-500 mt-0.5">accepted offers flow into the preboarding initiation screen</small></div>
                  <Toggle on={rules.preboardingAfterAcceptance !== false} onChange={v => setRule('preboardingAfterAcceptance', v)} label="Preboarding after acceptance" />
                </div>
                <div className="py-3 flex items-center justify-between gap-3">
                  <div><b className="block text-[12px] text-slate-900">Auto-convert to employee after acceptance</b><small className="block text-[10.5px] text-slate-500 mt-0.5">create the employee record automatically when the candidate accepts</small></div>
                  <Toggle on={rules.autoConvertAfterAcceptance === true} onChange={v => setRule('autoConvertAfterAcceptance', v)} label="Auto-convert after acceptance" />
                </div>
                <div className="py-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-bold text-slate-900 mb-1">Approval SLA (days)</label>
                    <input type="number" min="1" max="30" value={rules.approvalReminderDays ?? 2} onChange={e => setRule('approvalReminderDays', Number(e.target.value) || 0)} disabled={!isAdmin} className={inputCls} />
                    <small className="block text-[10px] text-slate-400 mt-1">auto-reminder to the approver after this many days</small>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-slate-900 mb-1">Link valid for (days)</label>
                    <input type="number" min="1" max="90" value={rules.offerExpiryDays ?? 14} onChange={e => setRule('offerExpiryDays', Number(e.target.value) || 0)} disabled={!isAdmin} className={inputCls} />
                    <small className="block text-[10px] text-slate-400 mt-1">after that the candidate link expires and you re-send</small>
                  </div>
                </div>
                <div className="py-3">
                  <label className="block text-[12px] font-bold text-slate-900 mb-1">CTC approval limit (₹ per year)</label>
                  <input type="number" min="0" step="50000" value={threshold} onChange={e => setRule('salaryThreshold', Number(e.target.value) || 0)} disabled={!isAdmin} className={inputCls} />
                  <small className="block text-[10px] text-slate-400 mt-1">offers above this need the next approver in the chain</small>
                </div>
              </div>
            </div>

            {/* Default template */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-[13px] font-bold text-slate-900">Default template for new offers</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-2">Pre-selected in step 2 of Create Offer — recruiters can still change it</p>
              <div className="flex items-center justify-between gap-3 py-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-[30px] h-[30px] rounded-lg bg-blue-50 text-blue-600 grid place-items-center flex-shrink-0"><FiFileText className="w-4 h-4" /></span>
                  <b className="text-[12px] text-slate-800 truncate">Pick an active template in step 2 — the newest active one is recommended</b>
                </div>
                <Link href="/offers/templates" className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50 flex-shrink-0 inline-flex items-center">Change</Link>
              </div>
            </div>

            {/* Pipeline stages note */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[11.5px] text-amber-900 flex items-start gap-2">
              <FiInfo className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span><b>Looking for pipeline stages (Applied, Screening, Interview…)?</b> Those belong to recruitment, not offers — they live only in <b>Recruitment → Workflow Configuration</b>, so the two screens are never confused.</span>
            </div>
            {!isAdmin && (
              <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-[11.5px] text-slate-500 flex items-start gap-2">
                <FiCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-green-600" />
                <span>You can view the rules, but only Tenant Admin / HR Manager can change them.</span>
              </div>
            )}
            {config && (
              <p className="text-[10px] text-slate-400 px-1">{config.approvalRequired ? 'Approval required: yes' : 'Approval required: no'} · {levels.length} approval level{levels.length === 1 ? '' : 's'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
