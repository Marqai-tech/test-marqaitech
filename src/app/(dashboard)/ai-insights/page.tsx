'use client';

/* Task 159 — AI Insights Hub (SmartHR "AI Center" landing page)
   Overview of every AI insight surface + how-it-works strip. */

import { useCallback, useMemo } from 'react';
import {
  FiClock, FiDollarSign, FiUserPlus, FiTarget, FiCalendar, FiFolder, FiSettings, FiCpu,
} from 'react-icons/fi';
import { AiBanner, AiKpi, AiHubCard, AiPageShell, aiFetch, useAiLoader } from '@/components/ai-insights/kit';
import { Panel } from '@/components/dashboard/smarthr-widgets';

type AttRow = { id: string; date: string; status: string };

export default function AiInsightsHubPage() {
  const loader = useCallback(async () => {
    const now = new Date();
    const start = localKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = localKey(now);
    const [att, projects, goals] = await Promise.all([
      aiFetch<{ attendance?: AttRow[] }>(`/api/attendance?startDate=${start}&endDate=${end}&limit=1000`),
      aiFetch<{ projects?: unknown[] } | unknown[]>(`/api/projects?limit=50`),
      aiFetch<{ goals?: unknown[] }>(`/api/goals?limit=50`),
    ]);
    const rows = att?.attendance ?? [];
    return {
      presentMonth: rows.filter(r => ['present', 'late', 'half_day'].includes(r.status)).length,
      lateMonth: rows.filter(r => r.status === 'late').length,
      projects: Array.isArray(projects) ? projects.length : (projects?.projects?.length ?? 0),
      goals: goals?.goals?.length ?? 0,
    };
  }, []);
  const { data, loading, refresh } = useAiLoader(loader);

  const cleanliness = useMemo(() => {
    if (!data) return '—';
    const total = Math.max(1, data.presentMonth + data.lateMonth);
    return `${Math.max(0, Math.round((1 - data.lateMonth / total) * 100))}%`;
  }, [data]);

  return (
    <AiPageShell loading={loading} onRefresh={refresh}>
      <AiBanner title="AI Insights" trail={['AI Insights', 'Overview']} />

      {/* Hero strip */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] p-6 sm:p-7 text-white shadow-lg shadow-violet-500/25">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-[-4rem] left-1/3 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white/15 ring-1 ring-white/30 flex items-center justify-center flex-shrink-0">
            <FiCpu className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">Your AI-powered HR command center</h2>
            <p className="text-sm text-white/85 mt-1.5 leading-relaxed">
              Forecasts, anomalies and recommendations across attendance, payroll, hiring, performance, leave and projects —
              computed from your live HRMS data with transparent, labelled heuristics.
            </p>
          </div>
        </div>
      </div>

      {/* Live summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <AiKpi label="Attendance Cleanliness" value={cleanliness} icon={<FiClock className="w-5 h-5" />} tone="violet" sub="share of non-late records this month" />
        <AiKpi label="Late Arrivals (month)" value={data?.lateMonth ?? '—'} icon={<FiClock className="w-5 h-5" />} tone="amber" />
        <AiKpi label="Active Projects" value={data?.projects ?? '—'} icon={<FiFolder className="w-5 h-5" />} tone="blue" />
        <AiKpi label="Tracked Goals" value={data?.goals ?? '—'} icon={<FiTarget className="w-5 h-5" />} tone="emerald" />
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AiHubCard href="/ai-insights/attendance" accent="cyan" icon={<FiClock className="w-5 h-5" />} title="AI Attendance Insights" description="Weekly patterns, irregularity detection, real-time check-ins and absence-spike predictions from live punches." stat="Irregularities + realtime" statLabel="pattern engine" />
        <AiHubCard href="/ai-insights/payroll" accent="emerald" icon={<FiDollarSign className="w-5 h-5" />} title="AI Payroll Forecast" description="Payroll trend projection with confidence bands, budget alerts, variance analysis and overtime estimates." stat="3-month horizon" statLabel="trend projection" />
        <AiHubCard href="/ai-insights/hiring" accent="blue" icon={<FiUserPlus className="w-5 h-5" />} title="AI Hiring Forecast" description="Pipeline funnel, source-mix analytics, role demand forecast and bottleneck alerts from live ATS data." stat="Funnel + demand" statLabel="recruitment AI" />
        <AiHubCard href="/ai-insights/performance" accent="amber" icon={<FiTarget className="w-5 h-5" />} title="AI Performance Insights" description="Goal achievement prediction, productivity and quality metrics plus coaching focus areas before appraisals." stat="Trajectory model" statLabel="performance AI" />
        <AiHubCard href="/ai-insights/leave" accent="rose" icon={<FiCalendar className="w-5 h-5" />} title="AI Leave Insights" description="Leave-type mix, start-day clustering, burnout signals and team-availability forecasts from the leave ledger." stat="Coverage outlook" statLabel="leave AI" />
        <AiHubCard href="/ai-insights/projects" accent="violet" icon={<FiFolder className="w-5 h-5" />} title="AI Project Insights" description="Portfolio health, delivery-risk detection, allocation overruns and capacity outlook across projects." stat="Risk + capacity" statLabel="delivery AI" />
      </div>

      {/* How it works + settings link */}
      <Panel title="How AI Insights work" icon={<FiCpu className="w-4 h-4" />} accent="text-violet-600">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { n: '1', t: 'Live data in', d: 'Each panel reads your real HRMS records — attendance, payroll runs, candidates, goals, leaves and projects.' },
            { n: '2', t: 'Transparent models', d: 'Trend projections and pattern rules compute client-side; every panel labels the model that produced it.' },
            { n: '3', t: 'Actionable out', d: 'Predictions arrive with confidence badges and manager actions so teams can act the same day.' },
          ].map(s => (
            <div key={s.n} className="rounded-xl border border-thb-border p-4">
              <span className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 font-bold flex items-center justify-center text-sm">{s.n}</span>
              <h4 className="text-sm font-semibold text-thb-text-primary mt-3">{s.t}</h4>
              <p className="text-xs text-thb-text-secondary mt-1 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-thb-border flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-thb-text-secondary">Tune which AI features are active for your organization.</p>
          <a href="/ai-insights/settings" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 text-sm font-medium transition-colors">
            <FiSettings className="w-4 h-4" /> Open AI Settings
          </a>
        </div>
      </Panel>
    </AiPageShell>
  );
}

function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
