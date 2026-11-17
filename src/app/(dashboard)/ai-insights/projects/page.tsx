'use client';

/* Task 159 — AI Project Insights (SmartHR-style AI Center page)
   Real data: /api/projects (with tasks, allocations, milestones). */

import { useCallback, useMemo } from 'react';
import {
  FiFolder, FiTarget, FiActivity, FiTrendingUp, FiAlertTriangle, FiUsers,
} from 'react-icons/fi';
import {
  AiBanner, AiKpi, AiModelChip, AiPredictionCard, AiPageShell, AiInsightRow,
  BarsCompare, DonutSplit, ProgressRow, aiFetch, useAiLoader,
} from '@/components/ai-insights/kit';
import { Panel } from '@/components/dashboard/smarthr-widgets';

type Task = { id: string; status?: string; priority?: string };
type Allocation = { id: string; allocationPct?: number | null; status?: string; employee?: { id?: string; firstName?: string; lastName?: string } | null };
type Project = {
  id: string; name?: string; status?: string; priority?: string;
  startDate?: string | null; endDate?: string | null; budget?: number | null; progress?: number | null;
  client?: { name?: string } | null; department?: { name?: string } | null;
  _count?: { tasks?: number; allocations?: number; milestones?: number };
  tasks?: Task[]; allocations?: Allocation[];
};

const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'inprogress', 'open', 'review', 'testing'];

export default function AiProjectInsightsPage() {
  const loader = useCallback(async () => {
    const res = await aiFetch<{ projects?: Project[] } | Project[]>(`/api/projects?limit=200`);
    return { projects: Array.isArray(res) ? res : (res?.projects ?? []) };
  }, []);
  const { data, loading, refresh } = useAiLoader(loader);

  const model = useMemo(() => {
    const projects = data?.projects ?? [];
    const statusOf = (p: Project) => (p.status || 'active').toLowerCase();

    const active = projects.filter(p => ['active', 'in_progress', 'inprogress', 'ongoing'].includes(statusOf(p)));
    const completed = projects.filter(p => ['completed', 'done', 'closed'].includes(statusOf(p)));
    const atRisk = active.filter(p => {
      const tasks = p.tasks || [];
      if (!tasks.length) return false;
      const open = tasks.filter(t => OPEN_TASK_STATUSES.includes((t.status || '').toLowerCase())).length;
      return open / tasks.length > 0.7 || (p.endDate ? new Date(p.endDate) < new Date() : false);
    });

    const taskMix = [
      { name: 'Open', value: projects.reduce((s, p) => s + (p.tasks || []).filter(t => OPEN_TASK_STATUSES.includes((t.status || '').toLowerCase())).length, 0) },
      { name: 'Completed', value: projects.reduce((s, p) => s + (p.tasks || []).filter(t => ['completed', 'done', 'closed'].includes((t.status || '').toLowerCase())).length, 0) },
    ].filter(d => d.value > 0);

    // department / client distribution
    const orgMix = new Map<string, number>();
    projects.forEach(p => {
      const k = p.department?.name || p.client?.name || 'Unassigned';
      orgMix.set(k, (orgMix.get(k) || 0) + 1);
    });
    const orgBars = [...orgMix.entries()].map(([name, value]) => ({ name: name.length > 14 ? `${name.slice(0, 13)}…` : name, Projects: value })).sort((a, b) => b.Projects - a.Projects).slice(0, 6);

    // utilization from allocations
    const utilByEmp = new Map<string, number>();
    projects.forEach(p => (p.allocations || []).forEach(a => {
      if (!a.employee?.id) return;
      utilByEmp.set(a.employee.id, Math.min(150, (utilByEmp.get(a.employee.id) || 0) + (a.allocationPct || 0)));
    }));
    const utils = [...utilByEmp.values()].sort((a, b) => b - a);
    const overallocated = utils.filter(u => u > 100).length;
    const avgUtil = utils.length ? Math.round(utils.reduce((a, b) => a + b, 0) / utils.length) : 0;
    const topLoaded = [...utilByEmp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const insights: Array<{ time: string; title: string; subtitle: string; tone: 'amber' | 'rose' | 'sky' | 'violet' | 'emerald' }> = [];
    atRisk.slice(0, 3).forEach(p => {
      insights.push({ time: p.endDate ? String(p.endDate).slice(0, 10) : 'Ongoing', title: `Delivery risk — ${p.name || 'Project'}`, subtitle: 'Mostly open tasks or past the target end date', tone: 'rose' });
    });
    if (overallocated) {
      insights.push({ time: `${overallocated} people`, title: 'Allocation overrun detected', subtitle: `${overallocated} team member(s) allocated above 100% across projects`, tone: 'amber' });
    }
    if (!insights.length && projects.length) {
      insights.push({ time: 'Healthy', title: 'No delivery risks detected', subtitle: 'Task burn-down and allocations look balanced across active projects.', tone: 'emerald' });
    }
    if (!projects.length) {
      insights.push({ time: 'Get started', title: 'No projects yet', subtitle: 'Create projects and allocate teams to activate insights.', tone: 'sky' });
    }

    const capacityForecast = Math.max(0, 100 - Math.max(0, avgUtil - 85) * 2);

    const predictions: Array<{ title: string; body: string; badges: Array<{ label: string; tone: 'violet' | 'emerald' | 'amber' | 'rose' | 'sky' | 'slate' }> }> = projects.length
      ? [
          { title: 'Portfolio Health', body: `${active.length} active project(s) with ${atRisk.length} needing attention. Task completion across the portfolio stands at ${taskMix.length && taskMix.reduce((s, d) => s + d.value, 0) ? Math.round((taskMix.find(d => d.name === 'Completed')?.value || 0) / taskMix.reduce((s, d) => s + d.value, 0) * 100) : 0}%.`, badges: [{ label: 'Heuristic score', tone: 'violet' }, { label: 'Portfolio', tone: 'slate' }] },
          { title: 'Capacity Outlook', body: `Average allocation is ${avgUtil}%${overallocated ? ` with ${overallocated} over-allocated member(s)` : ''}. Rebalance before the next sprint to protect delivery dates.`, badges: [{ label: capacityForecast >= 80 ? 'Sustainable' : 'Tight', tone: capacityForecast >= 80 ? 'emerald' : 'amber' }] },
          { title: 'Hiring/Reallocation Signal', body: avgUtil > 95 ? 'Sustained over-allocation — consider hiring or descoping to avoid burnout-driven attrition.' : 'Capacity is manageable — hold hiring and protect focus time for at-risk projects.', badges: [{ label: avgUtil > 95 ? 'Action Needed' : 'Stable', tone: avgUtil > 95 ? 'rose' : 'emerald' }] },
        ]
      : [
          { title: 'Portfolio Baseline', body: 'Insights activate once projects exist. Create a project, add tasks and allocate employees to see health, capacity and risk forecasts.', badges: [{ label: 'Get started', tone: 'amber' }] },
        ];

    return {
      total: projects.length, active: active.length, completed: completed.length, atRisk: atRisk.length,
      taskMix, orgBars, avgUtil, overallocated, insights, predictions, topLoaded, utilCount: utils.length,
    };
  }, [data]);

  return (
    <AiPageShell loading={loading} onRefresh={refresh}>
      <AiBanner title="AI Project Insights" trail={['AI Insights', 'Projects']} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <AiKpi label="Total Projects" value={model.total} icon={<FiFolder className="w-5 h-5" />} tone="violet" />
        <AiKpi label="Active" value={model.active} icon={<FiActivity className="w-5 h-5" />} tone="blue" />
        <AiKpi label="At Risk" value={model.atRisk} icon={<FiAlertTriangle className="w-5 h-5" />} tone="rose" sub="open-task ratio or overdue" />
        <AiKpi label="Avg Allocation" value={model.utilCount ? `${model.avgUtil}%` : '—'} icon={<FiUsers className="w-5 h-5" />} tone={model.avgUtil > 95 ? 'amber' : 'emerald'} sub={`${model.overallocated} over-allocated`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel title="Projects by Team" icon={<FiFolder className="w-4 h-4" />} accent="text-violet-600" action={<AiModelChip model="Live registry" />}>
            {model.orgBars.length ? (
              <BarsCompare data={model.orgBars} xKey="name" series={[{ key: 'Projects', label: 'Projects', color: '#8B5CF6' }]} height={260} />
            ) : (
              <p className="text-sm text-thb-text-muted py-10 text-center">No projects yet.</p>
            )}
          </Panel>
        </div>
        <Panel title="Task Mix" icon={<FiTarget className="w-4 h-4" />} accent="text-emerald-600">
          {model.taskMix.length ? (
            <DonutSplit data={model.taskMix} height={250} unit=" task(s)" />
          ) : (
            <p className="text-sm text-thb-text-muted py-10 text-center">Tasks appear as projects are staffed.</p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Signals & Anomalies" icon={<FiAlertTriangle className="w-4 h-4" />} accent="text-rose-600" action={<AiModelChip model="Risk rules" />}>
          {model.insights.map((s, i) => <AiInsightRow key={i} time={s.time} title={s.title} subtitle={s.subtitle} tone={s.tone} />)}
        </Panel>
        <Panel title="Top Team Load" icon={<FiUsers className="w-4 h-4" />} accent="text-sky-600">
          {model.topLoaded.length ? (
            <div className="space-y-4 py-1">
              {model.topLoaded.map(([empId, pct]) => (
                <ProgressRow key={empId} label={`Member ${empId.slice(-4)}`} value={`${pct}%`} pct={pct} color={pct > 100 ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-thb-text-muted py-10 text-center">Allocations appear once projects are staffed.</p>
          )}
          <p className="text-xs text-thb-text-muted mt-3">Allocation % summed across projects; above 100% signals over-commitment.</p>
        </Panel>
      </div>

      <Panel title="AI Predictions & Alerts" icon={<FiTrendingUp className="w-4 h-4" />} accent="text-violet-600" action={<AiModelChip model="Heuristic forecasts" />}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {model.predictions.map((p, i) => <AiPredictionCard key={i} title={p.title} body={p.body} badges={p.badges} accent={i === 0 ? 'violet' : i === 1 ? 'emerald' : 'amber'} />)}
        </div>
      </Panel>
    </AiPageShell>
  );
}
