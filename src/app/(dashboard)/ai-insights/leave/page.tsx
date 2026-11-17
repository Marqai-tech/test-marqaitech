'use client';

/* Task 159 — AI Leave Insights (SmartHR-style AI Center page)
   Real data: /api/leave (month requests) + /api/employees. Heuristic
   predictions are labelled per panel. */

import { useCallback, useMemo, useState } from 'react';
import {
  FiChevronLeft, FiChevronRight, FiCalendar, FiUsers, FiActivity,
  FiTrendingUp, FiAlertTriangle, FiCheckCircle,
} from 'react-icons/fi';
import {
  AiBanner, AiKpi, AiModelChip, AiInsightRow, AiPredictionCard, AiPageShell,
  BarsCompare, DonutSplit, ProgressRow, aiFetch, useAiLoader, AI_MONTH_NAMES, localDateKeyOf,
} from '@/components/ai-insights/kit';
import { Panel } from '@/components/dashboard/smarthr-widgets';

type LeaveReq = {
  id: string; leaveType?: string; type?: string; status?: string;
  startDate?: string; endDate?: string; fromDate?: string; toDate?: string;
  days?: number | null; totalDays?: number | null;
  employee?: { id?: string; firstName?: string; lastName?: string; employeeId?: string } | null;
  createdAt?: string;
};
type Emp = { id: string; employeeId: string; firstName: string; lastName: string; status?: string };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dkey = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  return isNaN(d.getTime()) ? '' : localDateKeyOf(d);
};

const LEAVE_FAMILIES: Array<{ match: string[]; label: string }> = [
  { match: ['sick', 'medical'], label: 'Sick Leave' },
  { match: ['vacation', 'earned', 'annual', 'planned', 'privilege'], label: 'Vacation' },
  { match: ['emergency', 'compassionate'], label: 'Emergency' },
  { match: ['casual'], label: 'Casual' },
  { match: ['unpaid', 'loss'], label: 'Unpaid' },
  { match: ['maternity', 'paternity'], label: 'Parental' },
];

export default function AiLeaveInsightsPage() {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  const view = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const monthStart = localDateKeyOf(new Date(view.getFullYear(), view.getMonth(), 1));
  const monthEnd = localDateKeyOf(new Date(view.getFullYear(), view.getMonth() + 1, 0));
  const todayKey = localDateKeyOf(base);

  const loader = useCallback(async () => {
    const [leaves, employees] = await Promise.all([
      aiFetch<{ leaves?: LeaveReq[]; data?: LeaveReq[]; leaveRequests?: LeaveReq[] } | LeaveReq[]>(`/api/leave?limit=2000`),
      aiFetch<{ employees: Emp[] }>(`/api/employees?limit=200`),
    ]);
    return {
      leaves: Array.isArray(leaves) ? leaves : (leaves?.leaves || leaves?.data || leaves?.leaveRequests || []),
      employees: employees?.employees ?? [],
    };
  }, []);

  const { data, loading, refresh } = useAiLoader(loader, [monthStart, monthEnd]);

  const model = useMemo(() => {
    const all = data?.leaves ?? [];
    const emps = (data?.employees ?? []).filter(e => (e.status ?? 'active') === 'active');
    const inMonth = all.filter(l => {
      const s = dkey(l.startDate || l.fromDate);
      const e = dkey(l.endDate || l.toDate);
      if (!s && !e) return false;
      return (!s || s <= monthEnd) && (!e || e >= monthStart);
    });
    const approved = inMonth.filter(l => (l.status || '').toLowerCase().includes('approv'));
    const pending = inMonth.filter(l => (l.status || '').toLowerCase().includes('pend'));
    const rejected = inMonth.filter(l => (l.status || '').toLowerCase().includes('reject'));

    const todayApproved = approved.filter(l => {
      const s = dkey(l.startDate || l.fromDate); const e = dkey(l.endDate || l.toDate);
      return s <= todayKey && todayKey <= e;
    });

    // family split
    const fam = new Map<string, number>();
    approved.forEach(l => {
      const t = (l.leaveType || l.type || 'casual').toLowerCase();
      const label = LEAVE_FAMILIES.find(f => f.match.some(m => t.includes(m)))?.label || 'Casual';
      fam.set(label, (fam.get(label) || 0) + 1);
    });
    const familyMix = fam.size ? [...fam.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value) : [{ name: 'No approved leaves', value: 0 }];

    // weekday pattern of leave START dates
    const wd = new Map<number, number>();
    approved.forEach(l => {
      const s = dkey(l.startDate || l.fromDate);
      if (!s) return;
      const dow = new Date(`${s}T00:00:00`).getDay();
      wd.set(dow, (wd.get(dow) || 0) + 1);
    });
    const weekly = WEEKDAYS.map((day, i) => ({ day, Leaves: wd.get(i) || 0 }));

    // monthly volume trend (last 6 months incl. viewed)
    const months: Array<{ label: string; Approved: number; Requests: number }> = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(view.getFullYear(), view.getMonth() - k, 1);
      const ms = localDateKeyOf(new Date(d.getFullYear(), d.getMonth(), 1));
      const me = localDateKeyOf(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      const bucket = all.filter(l => {
        const s = dkey(l.startDate || l.fromDate);
        return s && s >= ms && s <= me;
      });
      months.push({
        label: `${AI_MONTH_NAMES[d.getMonth()].slice(0, 3)}`,
        Approved: bucket.filter(l => (l.status || '').toLowerCase().includes('approv')).length,
        Requests: bucket.length,
      });
    }

    // insights
    const insights: Array<{ time: string; title: string; subtitle: string; tone: 'amber' | 'rose' | 'sky' | 'violet' | 'emerald' }> = [];
    pending.slice(0, 3).forEach(l => {
      insights.push({
        time: dkey(l.startDate || l.fromDate) || 'Pending',
        title: `Pending approval — ${l.employee ? `${l.employee.firstName} ${l.employee.lastName || ''}`.trim() : 'Employee'}`,
        subtitle: `${l.leaveType || l.type || 'Leave'} awaiting workflow decision`,
        tone: 'amber',
      });
    });
    // burnout signal: employees with many leaves in the window
    const perEmp = new Map<string, number>();
    approved.forEach(l => { if (l.employee?.id) perEmp.set(l.employee.id, (perEmp.get(l.employee.id) || 0) + 1); });
    [...perEmp.entries()].filter(([, n]) => n >= 3).slice(0, 2).forEach(([empId, n]) => {
      const emp = all.find(l => l.employee?.id === empId)?.employee;
      insights.push({
        time: `${n} leaves`,
        title: `High leave frequency — ${emp ? `${emp.firstName} ${emp.lastName || ''}`.trim() : 'Employee'}`,
        subtitle: `${n} approved leave(s) this month — consider a well-being check-in`,
        tone: 'violet',
      });
    });
    if (!insights.length) {
      insights.push({ time: 'Clean', title: 'No leave signals this month', subtitle: 'No pending approvals or unusual leave clustering detected.', tone: 'emerald' });
    }

    // team availability forecast for the rest of the month
    const futureApproved = approved.filter(l => (dkey(l.endDate || l.toDate) || '') >= todayKey);
    const availabilityPct = emps.length ? Math.max(0, Math.round((1 - futureApproved.length / emps.length) * 100)) : 0;

    const predictions: Array<{ title: string; body: string; badges: Array<{ label: string; tone: 'violet' | 'emerald' | 'amber' | 'rose' | 'sky' | 'slate' }> }> = [];
    const topFam = familyMix[0];
    if (approved.length) {
      predictions.push({
        title: 'Dominant Leave Type',
        body: `${topFam.name} accounts for ${topFam.value} of ${approved.length} approved leave(s) this month. ${topFam.name === 'Sick Leave' ? 'A seasonal health trend may be forming — review hygiene and workload.' : 'Plan coverage buffers around this leave type.'}`,
        badges: [{ label: 'Pattern detected', tone: 'violet' }, { label: 'Month view', tone: 'slate' }],
      });
      const busiestDay = [...weekly].sort((a, b) => b.Leaves - a.Leaves)[0];
      if (busiestDay && busiestDay.Leaves > 0) {
        predictions.push({
          title: 'Leave Start Clustering',
          body: `${busiestDay.day} is the most common leave start day (${busiestDay.Leaves} this month). Avoid scheduling deadlines and client demos on ${busiestDay.day}s.`,
          badges: [{ label: 'Actionable', tone: 'emerald' }, { label: 'Weekly trend', tone: 'slate' }],
        });
      }
      predictions.push({
        title: 'Coverage Outlook',
        body: `${futureApproved.length} approved leave(s) overlap the remainder of this month — team availability holds at ~${availabilityPct}%.`,
        badges: [{ label: availabilityPct >= 85 ? 'Healthy coverage' : 'Tight coverage', tone: availabilityPct >= 85 ? 'emerald' : 'amber' }],
      });
    } else {
      predictions.push({
        title: 'Baseline Month',
        body: 'No approved leaves recorded for this month yet. Predictions activate as requests flow through the approval workflow.',
        badges: [{ label: 'Get started', tone: 'amber' }],
      });
    }

    return {
      inMonth: inMonth.length, approved: approved.length, pending: pending.length, rejected: rejected.length,
      onLeaveToday: todayApproved.length, familyMix, weekly, months, insights, predictions,
      availabilityPct, activeEmployees: emps.length,
    };
  }, [data, monthStart, monthEnd, todayKey]);

  return (
    <AiPageShell loading={loading} onRefresh={refresh}>
      <AiBanner
        title="AI Leave Insights"
        trail={['AI Insights', 'Leave']}
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => setMonthOffset(o => o - 1)} className="p-1.5 rounded-lg bg-white/15 ring-1 ring-white/25 text-white hover:bg-white/25 transition-colors"><FiChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-semibold text-white/90 min-w-[110px] text-center">{AI_MONTH_NAMES[view.getMonth()]} {view.getFullYear()}</span>
            <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))} disabled={monthOffset >= 0} className="p-1.5 rounded-lg bg-white/15 ring-1 ring-white/25 text-white hover:bg-white/25 disabled:opacity-40 transition-colors"><FiChevronRight className="w-4 h-4" /></button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <AiKpi label="On Leave Today" value={model.onLeaveToday} sub={`${model.activeEmployees} active employees`} icon={<FiCalendar className="w-5 h-5" />} tone="amber" />
        <AiKpi label="Approved (month)" value={model.approved} icon={<FiCheckCircle className="w-5 h-5" />} tone="emerald" />
        <AiKpi label="Pending Approvals" value={model.pending} icon={<FiAlertTriangle className="w-5 h-5" />} tone="rose" sub="need workflow action" />
        <AiKpi label="Availability Forecast" value={`${model.availabilityPct}%`} icon={<FiActivity className="w-5 h-5" />} tone="violet" sub="rest of month, after approved leaves" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel title="Leave Volume Trend" icon={<FiTrendingUp className="w-4 h-4" />} accent="text-violet-600" action={<AiModelChip model="Live leave ledger" />}>
            <BarsCompare data={model.months} xKey="label" series={[{ key: 'Requests', label: 'All requests', color: '#009EFB' }, { key: 'Approved', label: 'Approved', color: '#10B981' }]} height={260} />
          </Panel>
        </div>
        <Panel title="Leave Type Split" icon={<FiCalendar className="w-4 h-4" />} accent="text-emerald-600">
          <DonutSplit data={model.familyMix} height={250} unit=" leave(s)" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Weekly Start-Day Pattern" icon={<FiActivity className="w-4 h-4" />} accent="text-sky-600">
          <BarsCompare data={model.weekly} xKey="day" series={[{ key: 'Leaves', label: 'Leaves starting', color: '#8B5CF6' }]} height={250} />
        </Panel>
        <Panel title="Signals & Anomalies" icon={<FiAlertTriangle className="w-4 h-4" />} accent="text-amber-600" action={<AiModelChip model="Pattern rules" />}>
          {model.insights.map((s, i) => <AiInsightRow key={i} time={s.time} title={s.title} subtitle={s.subtitle} tone={s.tone} />)}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
          {model.predictions.map((p, i) => <AiPredictionCard key={i} title={p.title} body={p.body} badges={p.badges} accent={i === 0 ? 'violet' : i === 1 ? 'emerald' : 'amber'} />)}
        </div>
        <Panel title="Pipeline Health" icon={<FiUsers className="w-4 h-4" />} accent="text-violet-600">
          <div className="space-y-4 py-1">
            <ProgressRow label="Approved" value={`${model.approved}`} pct={model.inMonth ? (model.approved / model.inMonth) * 100 : 0} color="bg-emerald-500" />
            <ProgressRow label="Pending" value={`${model.pending}`} pct={model.inMonth ? (model.pending / model.inMonth) * 100 : 0} color="bg-amber-500" />
            <ProgressRow label="Rejected" value={`${model.rejected}`} pct={model.inMonth ? (model.rejected / model.inMonth) * 100 : 0} color="bg-rose-500" />
          </div>
          <p className="text-xs text-thb-text-muted mt-3">Approval pipeline for leave overlapping {AI_MONTH_NAMES[view.getMonth()]}.</p>
        </Panel>
      </div>
    </AiPageShell>
  );
}
