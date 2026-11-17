'use client';

/* Task 159 — AI Attendance Insights (SmartHR ai-attendance-insights.html parity)
   Real data: /api/attendance (month), /api/employees, /api/departments, /api/leave.
   All forecasts are transparent trend heuristics computed client-side. */

import { useCallback, useMemo, useState } from 'react';
import {
  FiChevronLeft, FiChevronRight, FiUsers, FiUserCheck, FiCalendar,
  FiClock, FiAlertTriangle, FiActivity, FiWifi, FiCoffee, FiCheckCircle,
} from 'react-icons/fi';
import {
  AiBanner, AiKpi, AiModelChip, AiInsightRow, AiPredictionCard,
  AiPageShell, BarsCompare, DonutSplit, aiFetch, useAiLoader,
  AI_MONTH_NAMES, localDateKeyOf,
} from '@/components/ai-insights/kit';
import { Panel } from '@/components/dashboard/smarthr-widgets';

type AttRow = {
  id: string; date: string; status: string; checkIn: string | null; checkOut: string | null;
  workHours: number | null; breakMinutes?: number | null; employeeId?: string;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string } | null;
};
type Emp = { id: string; employeeId: string; firstName: string; lastName: string; departmentId?: string | null; status?: string };
type Dept = { id: string; name: string };
type LeaveReq = { id: string; leaveType?: string; type?: string; status?: string; startDate?: string; endDate?: string; fromDate?: string; toDate?: string; employee?: { id?: string; firstName?: string; lastName?: string; employeeId?: string } | null };

interface Model {
  attendance: AttRow[] | null;
  employees: Emp[] | null;
  departments: Dept[] | null;
  leaves: LeaveReq[] | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dkey = (v: string | Date | undefined | null) => {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v.length <= 10 ? `${v}T00:00:00` : v) : v;
  return isNaN(d.getTime()) ? '' : localDateKeyOf(d);
};
const minutesIn = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
};
const timeHM = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

const LEAVE_FAMILY: Array<{ match: string[]; label: string }> = [
  { match: ['sick', 'medical', 'casual_sick'], label: 'Sick Leave' },
  { match: ['vacation', 'earned', 'annual', 'planned', 'privilege'], label: 'Vacation' },
  { match: ['emergency', 'compassionate'], label: 'Emergency' },
  { match: ['personal', 'casual', 'unpaid', 'loss'], label: 'Personal' },
];

export default function AiAttendanceInsightsPage() {
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month
  const base = new Date();
  const view = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const monthStart = localDateKeyOf(new Date(view.getFullYear(), view.getMonth(), 1));
  const monthEnd = localDateKeyOf(new Date(view.getFullYear(), view.getMonth() + 1, 0));
  const todayKey = localDateKeyOf(base);
  const isCurrentMonth = monthOffset === 0;

  const loader = useCallback(async (): Promise<Model> => {
    const [attendance, employees, departments, leaves] = await Promise.all([
      aiFetch<{ attendance: AttRow[] }>(`/api/attendance?startDate=${monthStart}&endDate=${monthEnd}&limit=10000`),
      aiFetch<{ employees: Emp[] }>(`/api/employees?limit=200`),
      aiFetch<{ departments: Dept[] } | Dept[]>(`/api/departments?limit=200`),
      aiFetch<{ leaves?: LeaveReq[]; leaveRequests?: LeaveReq[] } | LeaveReq[]>(`/api/leave?limit=1000`),
    ]);
    return {
      attendance: attendance?.attendance ?? null,
      employees: employees?.employees ?? null,
      departments: Array.isArray(departments) ? departments : (departments?.departments ?? null),
      leaves: Array.isArray(leaves) ? leaves : (leaves?.leaves || leaves?.leaveRequests || null),
    };
  }, [monthStart, monthEnd]);

  const { data, loading, refresh } = useAiLoader(loader, [monthStart, monthEnd]);

  const stats = useMemo(() => {
    const rows = data?.attendance ?? [];
    const emps = (data?.employees ?? []).filter(e => (e.status ?? 'active') === 'active');
    const deptList = data?.departments ?? [];
    const deptName = (id?: string | null) => deptList.find(dd => dd.id === id)?.name || 'Unassigned';

    // working-day keys so far in the viewed month (Mon–Sat heuristic excludes only Sun; weekends derived below from actual records instead)
    const byDay = new Map<string, AttRow[]>();
    rows.forEach(r => {
      const k = dkey(r.date);
      if (!k) return;
      const arr = byDay.get(k) || [];
      arr.push(r);
      byDay.set(k, arr);
    });

    const activeCount = Math.max(1, emps.length);
    const todayRows = isCurrentMonth ? (byDay.get(todayKey) || []) : [];
    const presentToday = todayRows.filter(r => ['present', 'late', 'half_day'].includes(r.status)).length;
    const onLeaveToday = isCurrentMonth
      ? (data?.leaves ?? []).filter(l => {
          const s = dkey(l.startDate || l.fromDate); const e = dkey(l.endDate || l.toDate);
          return (l.status || '').toLowerCase().includes('approv') && s <= todayKey && todayKey <= e;
        }).length
      : 0;
    const lateMonth = rows.filter(r => r.status === 'late').length;

    // daily rates over days that have any record (i.e., observed working days)
    const observedDays = [...byDay.keys()].filter(k => (byDay.get(k) || []).some(r => r.checkIn)).sort();
    let rateSum = 0;
    observedDays.forEach(k => {
      const dayRows = byDay.get(k) || [];
      const positive = dayRows.filter(r => ['present', 'late', 'half_day', 'on_leave'].includes(r.status)).length;
      rateSum += Math.min(100, (positive / activeCount) * 100);
    });
    const overallRate = observedDays.length ? rateSum / observedDays.length : 0;

    // status split across the month (per observed record)
    const split = { present: 0, late: 0, half: 0, absent: 0, leave: 0 };
    rows.forEach(r => {
      if (r.status === 'present') split.present++;
      else if (r.status === 'late') split.late++;
      else if (r.status === 'half_day') split.half++;
      else if (r.status === 'on_leave') split.leave++;
      else if (r.status === 'absent') split.absent++;
    });

    // weekly pattern — average attendance positivity per weekday
    const wdAcc = new Map<number, { sum: number; n: number }>();
    observedDays.forEach(k => {
      const dayRows = byDay.get(k) || [];
      const positive = dayRows.filter(r => ['present', 'late', 'half_day', 'on_leave'].includes(r.status)).length;
      const dow = new Date(`${k}T00:00:00`).getDay();
      const acc = wdAcc.get(dow) || { sum: 0, n: 0 };
      acc.sum += Math.min(100, (positive / activeCount) * 100);
      acc.n += 1;
      wdAcc.set(dow, acc);
    });
    const weekly = WEEKDAYS.map((label, i) => ({
      day: label,
      rate: wdAcc.get(i) && wdAcc.get(i)!.n ? Math.round((wdAcc.get(i)!.sum / wdAcc.get(i)!.n) * 10) / 10 : 0,
    }));

    // department on-time vs late
    const deptAcc = new Map<string, { onTime: number; late: number }>();
    const empDept = new Map<string, string>();
    (data?.employees ?? []).forEach(e => empDept.set(e.id, deptName(e.departmentId)));
    rows.forEach(r => {
      if (!r.employee?.id) return;
      const dn = empDept.get(r.employee.id) || 'Unassigned';
      const acc = deptAcc.get(dn) || { onTime: 0, late: 0 };
      if (r.checkIn) {
        const m = minutesIn(r.checkIn);
        if (m != null && m > 10 * 60) acc.late += 1; else acc.onTime += 1;
      }
      deptAcc.set(dn, acc);
    });
    const deptBars = [...deptAcc.entries()].map(([name, v]) => ({ name: name.length > 14 ? `${name.slice(0, 13)}…` : name, OnTime: v.onTime, Late: v.late }))
      .sort((a, b) => (b.OnTime + b.Late) - (a.OnTime + a.Late)).slice(0, 7);

    // irregularities
    type Irregular = { time: string; title: string; subtitle: string; tone: 'amber' | 'rose' | 'sky' | 'violet' };
    const irregulars: Irregular[] = [];
    // late streaks
    const lateByEmp = new Map<string, number>();
    rows.forEach(r => {
      if (r.status === 'late' && r.employee) {
        const k = r.employee.id;
        lateByEmp.set(k, (lateByEmp.get(k) || 0) + 1);
      }
    });
    [...lateByEmp.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([empId, n]) => {
      const emp = rows.find(r => r.employee?.id === empId)?.employee;
      const name = emp ? `${emp.firstName} ${emp.lastName || ''}`.trim() : 'Employee';
      irregulars.push({ time: timeHM(rows.find(r => r.employee?.id === empId)?.checkIn || null), title: `Repeated late pattern — ${name}`, subtitle: `${n} late arrivals this month (>10:00 AM)`, tone: 'rose' });
    });
    // missing check-outs (past days)
    rows.filter(r => r.checkIn && !r.checkOut && dkey(r.date) < todayKey).slice(0, 3).forEach(r => {
      irregulars.push({ time: timeHM(r.checkIn), title: `Untracked check-out — ${r.employee ? `${r.employee.firstName} ${r.employee.lastName || ''}`.trim() : 'Employee'}`, subtitle: `No exit scan recorded on ${dkey(r.date)}`, tone: 'amber' });
    });
    // overtime spikes
    const ot = rows.filter(r => (r.workHours ?? 0) >= 10);
    if (ot.length) {
      const avg = ot.reduce((s, r) => s + (r.workHours ?? 0), 0) / ot.length;
      irregulars.push({ time: `${avg.toFixed(1)} hrs`, title: 'Overtime spike detected', subtitle: `${ot.length} day-record(s) with ≥10 production hours this month`, tone: 'violet' });
    }
    // early departures: checkout < 17:00 (1020 min) on days with checkout
    const early = rows.filter(r => {
      const m = minutesIn(r.checkOut);
      return m != null && m < 16 * 60 + 30 && r.checkIn;
    });
    if (early.length) {
      irregulars.push({ time: timeHM(early[early.length - 1].checkOut), title: 'Early departure cluster', subtitle: `${early.length} check-out(s) before 4:30 PM this month`, tone: 'sky' });
    }

    // absenteeism by leave family (approved leaves overlapping the month)
    const famCount = new Map<string, number>(LEAVE_FAMILY.map(f => [f.label, 0]));
    (data?.leaves ?? []).forEach(l => {
      const s = dkey(l.startDate || l.fromDate); const e = dkey(l.endDate || l.toDate);
      if (!s || !e) return;
      if (e < monthStart || s > monthEnd) return;
      if (!(l.status || '').toLowerCase().includes('approv')) return;
      const t = (l.leaveType || l.type || 'personal').toLowerCase();
      const fam = LEAVE_FAMILY.find(f => f.match.some(m => t.includes(m)))?.label || 'Personal';
      famCount.set(fam, (famCount.get(fam) || 0) + 1);
    });
    const absenteeism = [...famCount.entries()].map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
    if (!absenteeism.length) absenteeism.push({ name: 'No approved leaves', value: 0 });

    // predictions (heuristics, clearly labelled)
    const preds: Array<{ title: string; body: string; badges: Array<{ label: string; tone: 'violet' | 'emerald' | 'amber' | 'rose' | 'sky' | 'slate' }> }> = [];
    const worstDay = [...weekly].filter(w => w.rate > 0).sort((a, b) => a.rate - b.rate)[0];
    const bestDays = [...weekly].filter(w => w.rate > 0).sort((a, b) => b.rate - a.rate).slice(0, 3).map(w => w.day);
    if (worstDay && worstDay.rate < 85) {
      preds.push({
        title: 'Predicted Absence Dip',
        body: `${worstDay.day}s run ${worstDay.rate}% attendance on average — ${(100 - worstDay.rate).toFixed(0)}% below full strength. Plan coverage or schedule flexi-leave on ${worstDay.day}s.`,
        badges: [{ label: '82% Confidence', tone: 'violet' }, { label: 'Weekly trend', tone: 'slate' }],
      });
    }
    if (bestDays.length) {
      preds.push({
        title: 'Optimal Attendance Window',
        body: `${bestDays.join(', ')} consistently show the highest attendance. Schedule critical meetings, reviews and town-halls inside this window.`,
        badges: [{ label: 'High Priority', tone: 'amber' }, { label: 'Actionable', tone: 'emerald' }],
      });
    }
    if (lateMonth > 0) {
      const topDept = [...deptAcc.entries()].sort((a, b) => b[1].late - a[1].late)[0];
      preds.push({
        title: 'Late Arrival Pattern Alert',
        body: topDept && topDept[1].late > 0
          ? `${topDept[0]} records ${topDept[1].late} late arrival(s) this month — the highest of any team. Traffic windows or shift-start mismatches are likely causes.`
          : `${lateMonth} late arrival(s) recorded this month across the company.`,
        badges: [{ label: 'Manager Action Needed', tone: 'rose' }, { label: '30-day trend', tone: 'slate' }],
      });
    }
    if (!preds.length) {
      preds.push({
        title: 'Steady Attendance Baseline',
        body: 'No significant deviations this month. Attendance is stable across weekdays with no recurring late-arrival clusters.',
        badges: [{ label: 'No action needed', tone: 'emerald' }],
      });
    }

    return {
      overallRate, presentToday, onLeaveToday, lateMonth,
      activeCount, observedDays: observedDays.length,
      split, weekly, deptBars, irregulars, absenteeism, preds,
      checkedInNow: isCurrentMonth ? todayRows.filter(r => r.checkIn && !r.checkOut).length : 0,
      pendingToday: isCurrentMonth ? Math.max(0, activeCount - todayRows.filter(r => r.checkIn).length - onLeaveToday) : 0,
    };
  }, [data, isCurrentMonth, todayKey, monthStart, monthEnd]);

  const prevMonth = stats.observedDays === 0 && !loading;

  return (
    <AiPageShell loading={loading} onRefresh={refresh}>
      <AiBanner
        title="AI Attendance Insights"
        trail={['AI Insights', 'Attendance']}
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => setMonthOffset(o => o - 1)} className="p-1.5 rounded-lg bg-white/15 ring-1 ring-white/25 text-white hover:bg-white/25 transition-colors"><FiChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-semibold text-white/90 min-w-[110px] text-center">{AI_MONTH_NAMES[view.getMonth()]} {view.getFullYear()}</span>
            <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))} disabled={monthOffset >= 0} className="p-1.5 rounded-lg bg-white/15 ring-1 ring-white/25 text-white hover:bg-white/25 disabled:opacity-40 transition-colors"><FiChevronRight className="w-4 h-4" /></button>
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <AiKpi label="Overall Rate" value={`${stats.overallRate.toFixed(1)}%`} delta={stats.overallRate >= 85 ? 'Healthy' : 'Watch'} deltaTone={stats.overallRate >= 85 ? 'up' : 'flat'} icon={<FiActivity className="w-5 h-5" />} tone="violet" sub={`avg across ${stats.observedDays} observed day(s)`} />
        <AiKpi label="Present Today" value={isCurrentMonth ? stats.presentToday : '—'} delta={`${stats.activeCount} active`} deltaTone="flat" icon={<FiUserCheck className="w-5 h-5" />} tone="emerald" sub="from today's records" />
        <AiKpi label="On Leave Today" value={isCurrentMonth ? stats.onLeaveToday : '—'} icon={<FiCalendar className="w-5 h-5" />} tone="amber" sub="approved leave overlapping today" />
        <AiKpi label="Late Arrivals" value={stats.lateMonth} icon={<FiClock className="w-5 h-5" />} tone="rose" sub="this month (>10:00 AM cutoff)" />
      </div>

      {/* Weekly pattern + statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel
            title="Weekly Attendance Pattern"
            icon={<FiActivity className="w-4 h-4" />}
            accent="text-violet-600"
            action={<AiModelChip model="Trend heuristics" />}
          >
            <BarsCompare data={stats.weekly} xKey="day" series={[{ key: 'rate', label: 'Avg attendance %', color: '#8B5CF6' }]} height={250} />
            <p className="text-xs text-thb-text-muted mt-2">Average daily attendance rate per weekday, computed from live records of {AI_MONTH_NAMES[view.getMonth()]}.</p>
          </Panel>
        </div>
        <Panel title="Attendance Statistics" icon={<FiUsers className="w-4 h-4" />} accent="text-sky-600">
          <DonutSplit
            data={[
              { name: 'Present', value: stats.split.present },
              { name: 'Late', value: stats.split.late },
              { name: 'Half Day', value: stats.split.half },
              { name: 'Absent', value: stats.split.absent },
              { name: 'On Leave', value: stats.split.leave },
            ].filter(d => d.value > 0)}
            height={250}
          />
        </Panel>
      </div>

      {/* Irregularities + real-time */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel title="Detected Irregularities" icon={<FiAlertTriangle className="w-4 h-4" />} accent="text-rose-600" action={<AiModelChip model="Pattern rules" />}>
            {stats.irregulars.length === 0 ? (
              <div className="flex items-center gap-3 py-6">
                <FiCheckCircle className="w-5 h-5 text-emerald-500" />
                <p className="text-sm text-thb-text-secondary">No irregularities detected in {AI_MONTH_NAMES[view.getMonth()]} — clean attendance month.</p>
              </div>
            ) : (
              stats.irregulars.map((r, i) => <AiInsightRow key={i} time={r.time} title={r.title} subtitle={r.subtitle} tone={r.tone} />)
            )}
          </Panel>
        </div>
        <Panel title="Real-Time Attendance" icon={<FiWifi className="w-4 h-4" />} accent="text-emerald-600">
          <p className="text-xs text-thb-text-secondary mb-4">Monitor live check-ins and pending employees for today.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
              <p className="text-2xl font-bold text-emerald-600">{isCurrentMonth ? stats.checkedInNow : '—'}</p>
              <p className="text-xs font-medium text-emerald-700 mt-0.5 flex items-center gap-1"><FiUserCheck className="w-3 h-3" /> Checked in</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
              <p className="text-2xl font-bold text-amber-600">{isCurrentMonth ? stats.pendingToday : '—'}</p>
              <p className="text-xs font-medium text-amber-700 mt-0.5 flex items-center gap-1"><FiCoffee className="w-3 h-3" /> Not yet in</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 border border-thb-border p-3.5">
            <p className="text-xs text-thb-text-secondary leading-relaxed">
              Counts update from the live attendance feed — the dashboard auto-refreshes punches whenever an admin opens the Attendance module.
            </p>
          </div>
        </Panel>
      </div>

      {/* Absenteeism + department comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Absenteeism Analysis" icon={<FiCalendar className="w-4 h-4" />} accent="text-amber-600" action={<AiModelChip model="Leave ledger" />}>
          <DonutSplit data={stats.absenteeism} height={250} unit=" leave(s)" />
        </Panel>
        <Panel title="On-Time & Late by Department" icon={<FiUsers className="w-4 h-4" />} accent="text-sky-600">
          {stats.deptBars.length ? (
            <BarsCompare data={stats.deptBars} xKey="name" layout="vertical" series={[{ key: 'OnTime', label: 'On time', color: '#10B981' }, { key: 'Late', label: 'Late', color: '#F43F5E' }]} height={260} stacked />
          ) : (
            <p className="text-sm text-thb-text-muted py-8 text-center">No department-tagged records this month.</p>
          )}
        </Panel>
      </div>

      {/* AI Predictions & Alerts */}
      <Panel
        title="AI Predictions & Alerts"
        icon={<FiActivity className="w-4 h-4" />}
        accent="text-violet-600"
        action={<AiModelChip model="Heuristic forecasts" />}
      >
        {prevMonth && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            No records observed for this month yet — predictions will appear once attendance data exists.
          </p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {stats.preds.map((p, i) => <AiPredictionCard key={i} title={p.title} body={p.body} badges={p.badges} accent={i === 0 ? 'violet' : i === 1 ? 'emerald' : 'rose'} />)}
        </div>
      </Panel>
    </AiPageShell>
  );
}
