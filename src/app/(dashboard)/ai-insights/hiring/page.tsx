'use client';

/* Task 159 — AI Hiring Forecast (SmartHR ai-hiring-forecast.html parity)
   Real data: /api/candidates + /api/requisitions. Heuristic forecasts are
   labelled on each panel; empty pipelines render a guided baseline state. */

import { useCallback, useMemo } from 'react';
import {
  FiUsers, FiBriefcase, FiUserPlus, FiTarget, FiAward, FiTrendingUp, FiAlertTriangle,
} from 'react-icons/fi';
import {
  AiBanner, AiKpi, AiModelChip, AiPredictionCard, AiPageShell,
  BarsCompare, DonutSplit, ProgressRow, aiFetch, useAiLoader,
} from '@/components/ai-insights/kit';
import { Panel } from '@/components/dashboard/smarthr-widgets';

type Candidate = {
  id: string; firstName?: string; lastName?: string; status?: string; source?: string;
  aiScore?: number | null; skillMatch?: number | null; experience?: number | null;
  expectedSalary?: number | null; jobId?: string | null; job?: { title?: string } | null;
  createdAt?: string;
};
type Requisition = {
  id: string; title?: string; department?: { name?: string } | string | null;
  openings?: number; status?: string; urgency?: string; filled?: number;
};

const FUNNEL: Array<{ key: string; label: string }> = [
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'interviewed', label: 'Interviewed' },
  { key: 'offered', label: 'Offered' },
  { key: 'hired', label: 'Hired' },
];

export default function AiHiringForecastPage() {
  const loader = useCallback(async () => {
    const [cands, reqs] = await Promise.all([
      aiFetch<{ data?: Candidate[] } | Candidate[]>(`/api/candidates?limit=1000`),
      aiFetch<{ requisitions?: Requisition[] }>(`/api/requisitions?limit=200`),
    ]);
    return {
      candidates: Array.isArray(cands) ? cands : (cands?.data ?? null),
      requisitions: reqs?.requisitions ?? null,
    };
  }, []);
  const { data, loading, refresh } = useAiLoader(loader);

  const model = useMemo(() => {
    const cands = data?.candidates ?? [];
    const reqs = data?.requisitions ?? [];

    const statusOf = (c: Candidate) => (c.status || 'applied').toLowerCase();
    const funnel = FUNNEL.map(f => ({
      stage: f.label,
      count: f.key === 'applied' ? cands.length : cands.filter(c => statusOf(c) === f.key).length,
    }));
    const interviewed = cands.filter(c => ['interviewed', 'offered', 'hired'].includes(statusOf(c))).length;
    const offered = cands.filter(c => ['offered', 'hired'].includes(statusOf(c))).length;
    const hired = cands.filter(c => statusOf(c) === 'hired').length;
    const offerAccept = offered ? Math.round((hired / offered) * 100) : 0;
    const avgAi = cands.length ? Math.round(cands.reduce((s, c) => s + (c.aiScore ?? c.skillMatch ?? 0), 0) / cands.length) : 0;

    const openReqs = reqs.filter(r => !['closed', 'filled', 'cancelled'].includes((r.status || '').toLowerCase()));
    const openRoles = openReqs.reduce((s, r) => s + (r.openings || 1), 0) || openReqs.length;

    const sources = new Map<string, number>();
    cands.forEach(c => {
      const s = (c.source || 'other').toLowerCase();
      sources.set(s, (sources.get(s) || 0) + 1);
    });
    const sourceMix = [...sources.entries()].map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value })).sort((a, b) => b.value - a.value).slice(0, 6);

    // Role demand: group candidates by job title (job relation or jobId)
    const roleDemand = new Map<string, number>();
    cands.forEach(c => {
      const title = c.job?.title || (c.jobId ? `Requisition ${String(c.jobId).slice(-4)}` : 'Unassigned role');
      roleDemand.set(title, (roleDemand.get(title) || 0) + 1);
    });
    const demandBars = [...roleDemand.entries()].map(([name, value]) => ({ name: name.length > 16 ? `${name.slice(0, 15)}…` : name, Applicants: value }))
      .sort((a, b) => b.Applicants - a.Applicants).slice(0, 6);

    // Open role pipeline table
    const pipelineRows = openReqs.slice(0, 6).map(r => ({
      role: r.title || 'Open requisition',
      dept: typeof r.department === 'string' ? r.department : (r.department?.name || '—'),
      urgency: (r.urgency || 'Planned'),
      openings: r.openings || 1,
      applicants: cands.filter(c => c.jobId === r.id).length,
    }));

    const alerts: Array<{ title: string; body: string; badges: Array<{ label: string; tone: 'violet' | 'emerald' | 'amber' | 'rose' | 'sky' | 'slate' }> }> = [];
    if (cands.length) {
      const topSrc = sourceMix[0];
      alerts.push({
        title: 'Top Performing Source',
        body: `${topSrc?.name || 'Direct'} delivers ${topSrc?.value || 0} of ${cands.length} candidates (${cands.length ? Math.round(((topSrc?.value || 0) / cands.length) * 100) : 0}%). Consider increasing sourcing budget here.`,
        badges: [{ label: 'Sourcing mix', tone: 'sky' }, { label: 'Actionable', tone: 'emerald' }],
      });
      const stalled = cands.filter(c => statusOf(c) === 'interviewed').length;
      if (stalled >= 3) {
        alerts.push({
          title: 'Interview Bottleneck',
          body: `${stalled} candidates are sitting at the interviewed stage. Schedule debriefs and move decisions within 5 working days to protect offer-accept rates.`,
          badges: [{ label: 'Manager Action Needed', tone: 'rose' }, { label: 'Pipeline velocity', tone: 'slate' }],
        });
      }
      alerts.push({
        title: 'Demand Outlook',
        body: openRoles > 0
          ? `${openRoles} opening(s) across ${openReqs.length} active requisition(s). At the current ${interviewed ? Math.round((hired / interviewed) * 100) : 0}% interview-to-hire conversion, plan ${Math.max(1, Math.ceil(openRoles / 2))} sourcing cycle(s) to fill.`
          : 'No active requisitions — create one to activate the demand forecast.',
        badges: [{ label: 'Heuristic forecast', tone: 'violet' }],
      });
    } else {
      alerts.push({
        title: 'Pipeline Baseline',
        body: 'No candidates recorded yet. Add candidates or publish the job portal to activate hiring forecasts, source-mix analytics and bottleneck alerts.',
        badges: [{ label: 'Get started', tone: 'amber' }],
      });
    }

    return { cands: cands.length, funnel, avgAi, openRoles, openReqs: openReqs.length, offerAccept, offered, sourceMix, demandBars, pipelineRows, alerts, interviewed, hired };
  }, [data]);

  return (
    <AiPageShell loading={loading} onRefresh={refresh}>
      <AiBanner title="AI Hiring Forecast" trail={['AI Insights', 'Recruitment']} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <AiKpi label="Candidates in Pipeline" value={model.cands} icon={<FiUsers className="w-5 h-5" />} tone="violet" sub="all live records" />
        <AiKpi label="Open Roles" value={model.openRoles} delta={`${model.openReqs} requisition(s)`} deltaTone="flat" icon={<FiBriefcase className="w-5 h-5" />} tone="blue" />
        <AiKpi label="Avg AI Match Score" value={model.avgAi ? `${model.avgAi}` : '—'} icon={<FiAward className="w-5 h-5" />} tone="emerald" sub="candidate aiScore / skillMatch" />
        <AiKpi label="Offer Accept Rate" value={model.offered ? `${model.offerAccept}%` : '—'} icon={<FiTarget className="w-5 h-5" />} tone="amber" sub="hired vs offered" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel title="Hiring Pipeline Overview" icon={<FiTrendingUp className="w-4 h-4" />} accent="text-violet-600" action={<AiModelChip model="Live ATS data" />}>
            <BarsCompare data={model.funnel} xKey="stage" series={[{ key: 'count', label: 'Candidates', color: '#8B5CF6' }]} height={250} />
          </Panel>
        </div>
        <Panel title="Source Mix" icon={<FiUserPlus className="w-4 h-4" />} accent="text-sky-600">
          {model.sourceMix.length ? (
            <DonutSplit data={model.sourceMix} height={250} />
          ) : (
            <p className="text-sm text-thb-text-muted py-10 text-center">No sourcing data yet.</p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Role Demand Forecast" icon={<FiTarget className="w-4 h-4" />} accent="text-emerald-600" action={<AiModelChip model="Applicant volume" />}>
          {model.demandBars.length ? (
            <BarsCompare data={model.demandBars} xKey="name" layout="vertical" series={[{ key: 'Applicants', label: 'Applicants', color: '#009EFB' }]} height={260} />
          ) : (
            <p className="text-sm text-thb-text-muted py-10 text-center">Applicant demand appears as candidates join the pipeline.</p>
          )}
        </Panel>
        <Panel title="Open Role Pipeline" icon={<FiBriefcase className="w-4 h-4" />} accent="text-amber-600">
          {model.pipelineRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-thb-border">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-thb-text-secondary uppercase">Role</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-thb-text-secondary uppercase">Dept</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-thb-text-secondary uppercase">Urgency</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-thb-text-secondary uppercase">Openings</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-thb-text-secondary uppercase">Applicants</th>
                  </tr>
                </thead>
                <tbody>
                  {model.pipelineRows.map((r, i) => (
                    <tr key={i} className="border-b border-thb-border/60 last:border-0">
                      <td className="px-3 py-2.5 text-sm font-medium text-thb-text-primary">{r.role}</td>
                      <td className="px-3 py-2.5 text-sm text-thb-text-secondary">{r.dept}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.urgency.toLowerCase() === 'critical' ? 'bg-rose-50 text-rose-600' : r.urgency.toLowerCase() === 'high' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>{r.urgency}</span>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-thb-text-secondary">{r.openings}</td>
                      <td className="px-3 py-2.5 text-sm text-thb-text-secondary">{r.applicants}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <p className="text-sm text-thb-text-muted text-center py-4">No active requisitions — the pipeline table fills from live requisitions.</p>
              <ProgressRow label="Interview stage coverage" value={`${model.interviewed}/${model.cands}`} pct={model.cands ? (model.interviewed / model.cands) * 100 : 0} color="bg-sky-500" />
              <ProgressRow label="Hired so far" value={`${model.hired}/${model.cands}`} pct={model.cands ? (model.hired / model.cands) * 100 : 0} color="bg-emerald-500" />
            </div>
          )}
        </Panel>
      </div>

      <Panel title="AI Hiring Predictions" icon={<FiAlertTriangle className="w-4 h-4" />} accent="text-violet-600" action={<AiModelChip model="Heuristic forecasts" />}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {model.alerts.map((a, i) => <AiPredictionCard key={i} title={a.title} body={a.body} badges={a.badges} accent={i === 0 ? 'violet' : i === 1 ? 'rose' : 'emerald'} />)}
        </div>
      </Panel>
    </AiPageShell>
  );
}
