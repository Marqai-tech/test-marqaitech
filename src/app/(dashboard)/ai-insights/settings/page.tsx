'use client';

/* Task 159 — AI Settings (part of the AI Insights section)
   Persists tenant-wide preferences via /api/ai-insights/settings
   (Setting rows, category 'ai-insights'). */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FiClock, FiDollarSign, FiUserPlus, FiTarget, FiCalendar, FiFolder,
  FiSettings, FiSave, FiCpu, FiDatabase, FiBell, FiShield,
} from 'react-icons/fi';
import { AiBanner, AiPageShell, aiAuthHeaders, aiFetch, useAiLoader } from '@/components/ai-insights/kit';
import { Panel } from '@/components/dashboard/smarthr-widgets';

type Prefs = {
  attendance: boolean; payroll: boolean; hiring: boolean;
  performance: boolean; leave: boolean; projects: boolean;
  showModelChips: boolean; confidenceThreshold: number;
  alertLateStreak: number; alertOvertimeHours: number;
  notifyEmail: boolean; notifyInApp: boolean;
};

const DEFAULTS: Prefs = {
  attendance: true, payroll: true, hiring: true,
  performance: true, leave: true, projects: true,
  showModelChips: true, confidenceThreshold: 80,
  alertLateStreak: 3, alertOvertimeHours: 10,
  notifyEmail: false, notifyInApp: true,
};

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-violet-600' : 'bg-slate-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
    </button>
  );
}

export default function AiSettingsPage() {
  const { data, loading, refresh } = useAiLoader(async () => {
    const res = await aiFetch<{ value?: string }>(`/api/ai-insights/settings`);
    try {
      return res?.value ? { ...DEFAULTS, ...JSON.parse(res.value) as Partial<Prefs> } as Prefs : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setPrefs(data); }, [data]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/ai-insights/settings', {
        method: 'PUT',
        headers: aiAuthHeaders(),
        body: JSON.stringify(prefs),
      });
      if (!r.ok) throw new Error('Save failed');
      toast.success('AI settings saved');
      refresh();
    } catch {
      toast.error('Could not save AI settings');
    } finally {
      setSaving(false);
    }
  }, [prefs, refresh]);

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs(p => ({ ...p, [k]: v }));

  const featureRows: Array<{ key: keyof Prefs; icon: React.ReactNode; title: string; desc: string }> = [
    { key: 'attendance', icon: <FiClock className="w-[18px] h-[18px]" />, title: 'AI Attendance Insights', desc: 'Weekly patterns, irregularity detection and absence predictions on the attendance dashboard data.' },
    { key: 'payroll', icon: <FiDollarSign className="w-[18px] h-[18px]" />, title: 'AI Payroll Forecast', desc: 'Payroll trend projection, budget alerts and variance analysis from processed payroll runs.' },
    { key: 'hiring', icon: <FiUserPlus className="w-[18px] h-[18px]" />, title: 'AI Hiring Forecast', desc: 'Pipeline funnel analytics, source-mix insights and bottleneck alerts from candidate data.' },
    { key: 'performance', icon: <FiTarget className="w-[18px] h-[18px]" />, title: 'AI Performance Insights', desc: 'Goal achievement trajectory, productivity metrics and review focus areas.' },
    { key: 'leave', icon: <FiCalendar className="w-[18px] h-[18px]" />, title: 'AI Leave Insights', desc: 'Leave clustering, burnout signals and team-availability forecasts.' },
    { key: 'projects', icon: <FiFolder className="w-[18px] h-[18px]" />, title: 'AI Project Insights', desc: 'Portfolio health, delivery-risk detection and allocation overruns.' },
  ];

  return (
    <AiPageShell loading={loading} onRefresh={refresh}>
      <AiBanner title="AI Settings" trail={['AI Insights', 'Settings']} />

      <Panel
        title="AI Features"
        icon={<FiCpu className="w-4 h-4" />}
        accent="text-violet-600"
        action={<span className="text-xs text-thb-text-muted">Applies to every user of this tenant</span>}
      >
        <div className="divide-y divide-thb-border/70">
          {featureRows.map(row => (
            <div key={row.key} className="flex items-start gap-4 py-3.5 first:pt-0 last:pb-0">
              <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">{row.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-thb-text-primary">{row.title}</p>
                <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">{row.desc}</p>
              </div>
              <Toggle checked={Boolean(prefs[row.key])} onChange={v => set(row.key, v as Prefs[typeof row.key])} />
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Analytics Preferences" icon={<FiDatabase className="w-4 h-4" />} accent="text-sky-600">
          <div className="space-y-5 py-1">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Show model provenance chips</p>
                <p className="text-xs text-thb-text-secondary mt-0.5">Display which model produced each panel (transparency labels).</p>
              </div>
              <Toggle checked={prefs.showModelChips} onChange={v => set('showModelChips', v)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-medium text-thb-text-primary">Minimum confidence to surface predictions</p>
                <span className="text-sm font-bold text-violet-600">{prefs.confidenceThreshold}%</span>
              </div>
              <input type="range" min={50} max={99} value={prefs.confidenceThreshold} onChange={e => set('confidenceThreshold', Number(e.target.value))} className="w-full accent-violet-600" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-thb-text-primary block mb-1.5">Late-streak alert (days)</label>
                <input type="number" min={2} max={10} value={prefs.alertLateStreak} onChange={e => set('alertLateStreak', Math.max(2, Math.min(10, Number(e.target.value) || 3)))} className="w-full px-3 py-2 text-sm border border-thb-border rounded-lg" />
              </div>
              <div>
                <label className="text-sm font-medium text-thb-text-primary block mb-1.5">Overtime spike threshold (hrs)</label>
                <input type="number" min={8} max={16} value={prefs.alertOvertimeHours} onChange={e => set('alertOvertimeHours', Math.max(8, Math.min(16, Number(e.target.value) || 10)))} className="w-full px-3 py-2 text-sm border border-thb-border rounded-lg" />
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Notifications & Governance" icon={<FiBell className="w-4 h-4" />} accent="text-amber-600">
          <div className="space-y-5 py-1">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">In-app AI alerts</p>
                <p className="text-xs text-thb-text-secondary mt-0.5">Surface prediction cards and anomaly alerts in the notification center.</p>
              </div>
              <Toggle checked={prefs.notifyInApp} onChange={v => set('notifyInApp', v)} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-thb-text-primary">Email digests</p>
                <p className="text-xs text-thb-text-secondary mt-0.5">Send a weekly AI insights digest to admins (requires SMTP configured).</p>
              </div>
              <Toggle checked={prefs.notifyEmail} onChange={v => set('notifyEmail', v)} />
            </div>
            <div className="rounded-xl bg-slate-50 border border-thb-border p-4 flex items-start gap-3">
              <FiShield className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-thb-text-secondary leading-relaxed">
                All analytics are computed inside your tenant. No employee PII leaves your workspace, and heuristic
                models never auto-change payroll or attendance records — they only inform people.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      {/* Save bar */}
      <div className="thb-card p-4 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-thb-text-secondary">
          {saving ? 'Saving…' : 'Preferences apply immediately across all AI Insights pages for this tenant.'}
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 text-sm font-semibold transition-colors"
        >
          <FiSave className={`w-4 h-4 ${saving ? 'animate-pulse' : ''}`} />
          Save AI Settings
        </button>
      </div>
    </AiPageShell>
  );
}
