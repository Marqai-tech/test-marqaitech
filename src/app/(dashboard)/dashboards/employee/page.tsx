'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiCalendar, FiClock, FiFileText, FiHeadphones,
  FiDollarSign, FiCheckCircle, FiAlertCircle, FiChevronRight,
  FiActivity, FiTarget, FiClock as FiTimeEntry,
  FiArrowRight, FiEdit3,
  FiBarChart2, FiBell, FiUsers, FiGrid, FiSettings,
} from 'react-icons/fi';
import ModuleDashboardShell, { DashboardTabConfig } from '@/components/ModuleDashboardShell';
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
/* Task 156-f — shared SmartHR widgets: the same gradient banner, white cards
   and panels the restyled /employees/dashboard uses. */
import {
  Panel, StatCard, SkeletonBlock, StatSkeleton,
} from '@/components/dashboard/smarthr-widgets';

/* ─────────────────── helpers ─────────────────── */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const COLORS: Record<string, string> = {
  indigo: '#6366F1',
  emerald: '#10B981',
  amber: '#F59E0B',
  pink: '#EC4899',
  cyan: '#06B6D4',
  violet: '#8B5CF6',
};
const CHART_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#8B5CF6'];

function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  const map: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    processed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    draft: 'bg-slate-100 text-slate-700 ring-slate-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  };
  const cls = map[s] || 'bg-slate-100 text-slate-700 ring-slate-200';
  const label = s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${cls}`}>
      {label}
    </span>
  );
}

/* ─────────────────── skeleton ─────────────────── */

/* Task 156-f — SkeletonBlock / StatSkeleton now come from the shared
   smarthr-widgets. These two page-local skeletons render INSIDE a Panel,
   so they only draw the body (no card chrome of their own). */

function ChartSkeleton() {
  return <SkeletonBlock className="h-52 w-full" />;
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonBlock className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-1">
            <SkeletonBlock className="h-3 w-3/4" />
            <SkeletonBlock className="h-2 w-1/2" />
          </div>
          <SkeletonBlock className="h-5 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/* ─────────────────── types ─────────────────── */

/* Task 156-f — renamed to StatItem so the shared StatCard widget can be
   imported; bg/ring carry the SmartHR pastel icon-chip classes. */
interface StatItem {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  bg: string;
  ring: string;
  trend?: string;
}

interface ScheduleItem {
  id: string;
  title: string;
  time: string;
  type: 'meeting' | 'event' | 'deadline';
  duration?: string;
}

interface PayslipRow {
  id: string;
  month: string;
  netPay: number;
  status: string;
  currency: string;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  date: string;
  priority: 'high' | 'medium' | 'low';
}

interface QuickLink {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  href: string;
}

/* ─────────────────── live data types + zero-state (Task 163) ─────────────────── */

/* GOLDEN RULE (Task 163): NO demo/sample data anywhere. Every stat starts at
   zero/empty and is filled exclusively from live APIs. Empty panels render
   their own empty state instead of fake rows. */

interface AttendanceTrendRow {
  month: string;
  present: number;
  absent: number;
  late: number;
}

interface LeaveUsageItem {
  name: string;
  value: number;
  color: string;
}

function initialStats(): StatItem[] {
  return [
    {
      label: 'Attendance Rate',
      value: '—',
      sub: 'This month',
      icon: <FiCheckCircle className="w-5 h-5" />,
      bg: 'bg-[#10B981]/10 text-[#10B981]',
      ring: 'ring-[#10B981]/20',
    },
    {
      label: 'Leave Balance',
      value: '0',
      sub: 'Days remaining this year',
      icon: <FiCalendar className="w-5 h-5" />,
      bg: 'bg-[#3A57C4]/10 text-[#3A57C4]',
      ring: 'ring-[#3A57C4]/20',
    },
    {
      label: 'Pending Tasks',
      value: '0',
      sub: 'Leave + attendance requests',
      icon: <FiTarget className="w-5 h-5" />,
      bg: 'bg-[#FF9B44]/10 text-[#FF9B44]',
      ring: 'ring-[#FF9B44]/20',
    },
    {
      label: 'Upcoming Events',
      value: '0',
      sub: 'Next 7 days',
      icon: <FiActivity className="w-5 h-5" />,
      bg: 'bg-[#F43F5E]/10 text-[#F43F5E]',
      ring: 'ring-[#F43F5E]/20',
    },
  ];
}

/* Shared empty-state row used by the schedule / payslips / announcements panels */
function EmptyHint({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
        <FiAlertCircle className="w-5 h-5" />
      </div>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

/* ─────────────────── placeholder tabs ─────────────────── */

const employeeTabs: DashboardTabConfig[] = [
  { label: 'Overview', key: 'overview', icon: <FiGrid className="w-4 h-4" /> },
  { label: 'Reports', key: 'reports', icon: <FiFileText className="w-4 h-4" />, isNew: true },
  { label: 'Settings', key: 'settings', icon: <FiSettings className="w-4 h-4" />, isNew: true },
];

function EmployeeReportsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg mb-4">
        <FiFileText className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1">Reports & Analytics</h3>
      <p className="text-sm text-slate-500 text-center max-w-md mb-4">
        Reports and analytics for employee data
      </p>
      <a href="/employees/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3A57C4] hover:bg-[#2C43A3] text-white rounded-lg text-sm font-medium transition-colors">
        <FiBarChart2 className="w-4 h-4" /> Go to Reports
      </a>
    </div>
  );
}

function EmployeeSettingsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-lg mb-4">
        <FiSettings className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1">Settings & Configuration</h3>
      <p className="text-sm text-slate-500 text-center max-w-md mb-4">
        Configure employee module settings and preferences
      </p>
      <a href="/settings" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3A57C4] hover:bg-[#2C43A3] text-white rounded-lg text-sm font-medium transition-colors">
        <FiSettings className="w-4 h-4" /> Go to Settings
      </a>
    </div>
  );
}

function EmployeePageContent() {
  return (
    <ModuleDashboardShell
      moduleKey="employee"
      moduleLabel="Employee"
      title="Personal Dashboard"
      trail={['Dashboards', 'Personal']}
      moduleIcon={<FiUsers className="w-5 h-5 text-white" />}
      gradientColor="from-green-500 to-emerald-600"
      tabs={employeeTabs}
      overviewContent={<EmployeeContent />}
      children={{
        reports: <EmployeeReportsPlaceholder />,
        settings: <EmployeeSettingsPlaceholder />,
      }}
    />
  );
}

export default function EmployeeDashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" /></div>}>
      <EmployeePageContent />
    </Suspense>
  );
}

/* ─────────────────── component ─────────────────── */

function EmployeeContent() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  // Task 163 — live data only: everything starts zero/empty and fills from APIs.
  const [stats, setStats] = useState<StatItem[]>(initialStats);
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceTrendRow[]>([]);
  const [leaveUsage, setLeaveUsage] = useState<LeaveUsageItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  /* ── fetch dashboard data ── */

  const fetchDashboard = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const safe = async (url: string) => {
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      };

      const [summaryData, leaveBalData, leavePendingData, regData, attData, trainingData, leaveApprovedData, payData, annData] = await Promise.all([
        safe('/api/attendance/my-summary'),
        safe('/api/leave/balance'),
        safe('/api/leave?status=pending&limit=50'),
        safe('/api/attendance/regularize?limit=50'),
        safe('/api/attendance?limit=500'),
        safe('/api/training?limit=20'),
        safe('/api/leave?status=approved&limit=50'),
        safe('/api/payroll/payslips?limit=5'),
        safe('/api/notifications?limit=3&type=announcement'),
      ]);

      /* stat — attendance rate (same endpoint as /home + /dashboard so all
         three surfaces always agree) */
      if (summaryData) {
        const rate = typeof summaryData?.attendanceRate === 'number' ? String(summaryData.attendanceRate) : null;
        const wd = typeof summaryData?.workingDays === 'number' ? summaryData.workingDays : 0;
        const absent = typeof summaryData?.absent === 'number' ? summaryData.absent : 0;
        setStats(prev => prev.map(s => s.label === 'Attendance Rate'
          ? { ...s, value: rate !== null ? `${rate}%` : '—', sub: rate !== null ? `This month • ${wd} day${wd === 1 ? '' : 's'} · ${absent} absent` : (wd === 0 ? 'No working days yet' : 'This month') }
          : s));
      }

      /* stat — leave balance + leave usage pie (real balances) */
      if (leaveBalData) {
        const balances = leaveBalData?.balances || leaveBalData?.data?.balances || leaveBalData?.data || [];
        if (Array.isArray(balances) && balances.length > 0) {
          const totalRem = balances.reduce((acc: number, lb: { remaining?: number }) => acc + (lb.remaining || 0), 0);
          const usedArr: LeaveUsageItem[] = balances.map((lb: { leaveType?: { name?: string }; used?: number }, i: number) => ({
            name: lb.leaveType?.name || 'Leave',
            value: lb.used || 0,
            color: CHART_COLORS[i % CHART_COLORS.length],
          }));
          usedArr.push({ name: 'Remaining', value: totalRem, color: CHART_COLORS[4] });
          setStats(prev => prev.map(s => s.label === 'Leave Balance' ? { ...s, value: `${totalRem}`, sub: 'Days remaining this year' } : s));
          setLeaveUsage(usedArr);
        }
      }

      /* stat — pending tasks = pending leave requests + pending regularizations */
      const pendingLeaveRows = leavePendingData?.leaveRequests || leavePendingData?.leaves || leavePendingData?.data || [];
      const pendingLeaveCount: number = leavePendingData?.pagination?.total ?? (Array.isArray(pendingLeaveRows) ? pendingLeaveRows.length : 0);
      const regRows = regData?.regularizations || regData?.data || [];
      const pendingRegCount: number = regData?.pagination?.total
        ?? (Array.isArray(regRows) ? regRows.filter((r: { status?: string }) => (r.status || '').toLowerCase() === 'pending').length : 0);
      setStats(prev => prev.map(s => s.label === 'Pending Tasks'
        ? { ...s, value: `${pendingLeaveCount + pendingRegCount}`, sub: `${pendingLeaveCount} leave · ${pendingRegCount} attendance` }
        : s));

      /* chart — monthly attendance trend (last 6 months, real rows) */
      const attRows: { date: string; status: string }[] = attData?.attendance || attData?.records || [];
      if (Array.isArray(attRows) && attRows.length > 0) {
        const nowD = new Date();
        const months = Array.from({ length: 6 }).map((_, i) => {
          const d = new Date(nowD.getFullYear(), nowD.getMonth() - (5 - i), 1);
          return {
            key: `${d.getFullYear()}-${d.getMonth()}`,
            label: d.toLocaleDateString('en-US', { month: 'short' }),
          };
        });
        const trend: AttendanceTrendRow[] = months.map((m) => {
          const rows = attRows.filter((a) => {
            const d = new Date(a.date);
            return `${d.getFullYear()}-${d.getMonth()}` === m.key;
          });
          return {
            month: m.label,
            present: rows.filter((a) => ['present', 'half_day'].includes((a.status || '').toLowerCase())).length,
            late: rows.filter((a) => (a.status || '').toLowerCase() === 'late').length,
            absent: rows.filter((a) => (a.status || '').toLowerCase() === 'absent').length,
          };
        });
        setAttendanceTrend(trend);
      }

      /* schedule — upcoming trainings + approved upcoming time off (next 14 days) */
      const now = Date.now();
      const horizon = now + 14 * 86400000;
      type UpcomingFeedItem = ScheduleItem & { ts: number };
      const upcomingFeed: UpcomingFeedItem[] = [];
      const trainings = trainingData?.trainings || trainingData?.data || [];
      trainings.forEach((t: { id?: string; title?: string; startDate?: string | null; status?: string }) => {
        if (!t.startDate) return;
        if (!['upcoming', 'ongoing'].includes((t.status || '').toLowerCase())) return;
        const ts = new Date(t.startDate).getTime();
        if (Number.isNaN(ts) || ts > horizon) return;
        upcomingFeed.push({
          id: `tr-${t.id || ts}`,
          title: t.title || 'Training session',
          time: new Date(t.startDate).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          type: 'event',
          ts,
        });
      });
      const approvedLeaves = leaveApprovedData?.leaveRequests || leaveApprovedData?.leaves || leaveApprovedData?.data || [];
      approvedLeaves.forEach((l: { id?: string; leaveType?: { name?: string }; startDate?: string }) => {
        if (!l.startDate) return;
        const ts = new Date(l.startDate).getTime();
        if (Number.isNaN(ts) || ts > horizon) return;
        upcomingFeed.push({
          id: `lv-${l.id || ts}`,
          title: `${l.leaveType?.name || 'Approved'} leave`,
          time: new Date(l.startDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          type: 'deadline',
          ts,
        });
      });
      upcomingFeed.sort((a, b) => a.ts - b.ts);
      setSchedule(upcomingFeed.slice(0, 6).map(({ ts: _ts, ...rest }) => rest));

      /* stat — upcoming events (next 7 days from the same real feed) */
      const weekHorizon = now + 7 * 86400000;
      const upcoming7 = upcomingFeed.filter((f) => f.ts <= weekHorizon).length;
      setStats(prev => prev.map(s => s.label === 'Upcoming Events'
        ? { ...s, value: `${upcoming7}`, sub: 'Next 7 days' }
        : s));

      /* panel — recent payslips */
      if (payData) {
        const rows = payData?.data || payData?.payslips || [];
        if (Array.isArray(rows) && rows.length > 0) {
          setPayslips(rows.map((p: { id?: string; month?: number; year?: number; netSalary?: number; status?: string }) => ({
            id: p.id || `ps-${p.month}-${p.year}`,
            month: p.month && p.year ? new Date(p.year, p.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A',
            netPay: p.netSalary || 0,
            status: p.status || 'draft',
            currency: '₹',
          })));
        }
      }

      /* panel — announcements */
      if (annData) {
        const rows = annData?.data || annData?.notifications || [];
        if (Array.isArray(rows) && rows.length > 0) {
          setAnnouncements(rows.map((a: { id?: string; title?: string; message?: string; body?: string; createdAt?: string; priority?: string }, i: number) => ({
            id: a.id || `ann-${i}`,
            title: a.title || 'Announcement',
            body: a.message || a.body || '',
            date: a.createdAt ? a.createdAt.split('T')[0] : '',
            priority: (['high', 'medium', 'low'].includes(a.priority || '') ? a.priority : 'medium') as Announcement['priority'],
          })));
        }
      }
    } catch {
      // Task 163: no demo fallback — panels simply render their empty states.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDashboard();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchDashboard]);

  /* ── quick links config ── */

  const quickLinks: QuickLink[] = useMemo(() => [
    { label: 'Apply Leave', icon: <FiCalendar className="w-5 h-5" />, color: COLORS.indigo, bg: 'bg-emerald-50', href: '/leave' },
    { label: 'Submit Expense', icon: <FiDollarSign className="w-5 h-5" />, color: COLORS.emerald, bg: 'bg-emerald-50', href: '/expenses' },
    { label: 'View Payslip', icon: <FiFileText className="w-5 h-5" />, color: COLORS.amber, bg: 'bg-amber-50', href: '/payroll/payslips' },
    { label: 'Update Profile', icon: <FiEdit3 className="w-5 h-5" />, color: COLORS.pink, bg: 'bg-pink-50', href: '/my-profile' },
    { label: 'Time Entry', icon: <FiTimeEntry className="w-5 h-5" />, color: COLORS.cyan, bg: 'bg-cyan-50', href: '/timesheets' },
    { label: 'Helpdesk', icon: <FiHeadphones className="w-5 h-5" />, color: COLORS.violet, bg: 'bg-teal-50', href: '/helpdesk' },
  ], []);

  /* ── schedule icon helper ── */

  function scheduleIcon(type: string) {
    switch (type) {
      case 'meeting': return <FiUsers className="w-4 h-4" />;
      case 'event': return <FiBell className="w-4 h-4" />;
      case 'deadline': return <FiAlertCircle className="w-4 h-4" />;
      default: return <FiClock className="w-4 h-4" />;
    }
  }

  function scheduleColor(type: string) {
    switch (type) {
      case 'meeting': return 'bg-emerald-100 text-emerald-600';
      case 'event': return 'bg-pink-100 text-pink-600';
      case 'deadline': return 'bg-amber-100 text-amber-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  function priorityDot(p: string) {
    switch (p) {
      case 'high': return 'bg-rose-500';
      case 'medium': return 'bg-amber-500';
      default: return 'bg-slate-400';
    }
  }

  /* ── render ── */

  return (
    <div className="min-h-screen bg-slate-50/60">
      <div className="px-4 sm:px-6 lg:px-8 space-y-6 pb-10">
        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
            : stats.map((s, i) => (
                /* Task 156-f — shared SmartHR StatCard (trend folded into sub) */
                <StatCard
                  key={i}
                  label={s.label}
                  value={s.value}
                  sub={s.trend ? `${s.trend} · ${s.sub}` : s.sub}
                  icon={s.icon}
                  bg={s.bg}
                  ring={s.ring}
                />
              ))}
        </div>

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Attendance Trend - Bar Chart (shared SmartHR Panel, Task 156-f) */}
          <div className="lg:col-span-3">
            <Panel
              title="Monthly Attendance Trend"
              icon={<FiBarChart2 className="w-4 h-4" />}
              accent="text-[#3A57C4]"
              action={<span className="text-[11px] text-slate-400">Last 6 months</span>}
            >
              {loading ? (
                <ChartSkeleton />
              ) : attendanceTrend.length === 0 ? (
                <EmptyHint label="No attendance records yet — your monthly trend will appear here" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={attendanceTrend} barGap={4} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="present" fill={COLORS.indigo} radius={[4, 4, 0, 0]} name="Present" />
                    <Bar dataKey="late" fill={COLORS.amber} radius={[4, 4, 0, 0]} name="Late" />
                    <Bar dataKey="absent" fill={COLORS.pink} radius={[4, 4, 0, 0]} name="Absent" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          {/* Leave Usage - Pie Chart (shared SmartHR Panel, Task 156-f) */}
          <div className="lg:col-span-2">
            <Panel
              title="Leave Usage"
              icon={<FiCalendar className="w-4 h-4" />}
              accent="text-[#10B981]"
            >
              {loading ? (
                <ChartSkeleton />
              ) : leaveUsage.length === 0 ? (
                <EmptyHint label="No leave usage yet — your balance breakdown will appear here" />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={leaveUsage}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {leaveUsage.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                          fontSize: '12px',
                        }}
                        formatter={(value: number, name: string) => [`${value} days`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {leaveUsage.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] text-slate-600 truncate">{item.name}</span>
                        <span className="text-[11px] font-semibold text-slate-800 ml-auto">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Panel>
          </div>
        </div>

        {/* ── Schedule + Payslips Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* My Schedule (shared SmartHR Panel, Task 156-f) */}
          <Panel
            title="My Upcoming Schedule"
            icon={<FiClock className="w-4 h-4" />}
            accent="text-[#009EFB]"
            action={<span className="text-[11px] text-slate-400">{schedule.length} items</span>}
          >
            {loading ? (
              <ListSkeleton rows={5} />
            ) : schedule.length === 0 ? (
              <EmptyHint label="No upcoming sessions or time off in the next 14 days" />
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
                {schedule.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 transition-colors group cursor-pointer"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${scheduleColor(item.type)}`}>
                      {scheduleIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.time}
                        {item.duration && <span className="ml-1">• {item.duration}</span>}
                      </p>
                    </div>
                    <FiChevronRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Recent Payslips (shared SmartHR Panel, Task 156-f) */}
          <Panel
            title="Recent Payslips"
            icon={<FiFileText className="w-4 h-4" />}
            accent="text-[#FF9B44]"
            action={
              <button
                onClick={() => router.push('/payroll/payslips')}
                className="text-xs font-semibold text-[#3A57C4] hover:text-[#2C43A3] flex items-center gap-1 transition-colors"
              >
                View All <FiArrowRight className="w-3 h-3" />
              </button>
            }
          >
            {loading ? (
              <ListSkeleton rows={5} />
            ) : payslips.length === 0 ? (
              <EmptyHint label="No payslips issued yet" />
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
                {payslips.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                        <FiFileText className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{p.month}</p>
                        <p className="text-[11px] text-slate-500">Net Pay</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-800">
                        {p.currency}{p.netPay.toLocaleString('en-IN')}
                      </span>
                      {statusBadge(p.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ── Quick Links (shared SmartHR Panel, Task 156-f) ── */}
        <Panel title="Quick Links" icon={<FiGrid className="w-4 h-4" />} accent="text-[#6C4FD6]">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {quickLinks.map((link, i) => (
              <button
                key={i}
                onClick={() => router.push(link.href)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group"
              >
                <div
                  className={`w-11 h-11 rounded-full ${link.bg} ring-1 ring-black/5 flex items-center justify-center transition-transform group-hover:scale-110`}
                  style={{ color: link.color }}
                >
                  {link.icon}
                </div>
                <span className="text-xs font-medium text-slate-700 text-center">{link.label}</span>
              </button>
            ))}
          </div>
        </Panel>

        {/* ── Announcements (shared SmartHR Panel, Task 156-f) ── */}
        <Panel
          title="Announcements"
          icon={<FiBell className="w-4 h-4" />}
          accent="text-[#FFC107]"
          action={<span className="text-[11px] text-slate-400">{announcements.length} new</span>}
        >
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-50/80 space-y-2">
                  <SkeletonBlock className="h-4 w-3/4" />
                  <SkeletonBlock className="h-3 w-full" />
                  <SkeletonBlock className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <EmptyHint label="No announcements yet" />
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
              {announcements.map(a => (
                <div
                  key={a.id}
                  className="p-4 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 transition-colors group cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${priorityDot(a.priority)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-slate-800 truncate">{a.title}</h4>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {a.date ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                        </span>
                      </div>
                      <p className="text-[12px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{a.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ── Footer branding ── */}
        <div className="text-center pt-2 pb-4">
          <p className="text-[11px] text-slate-400">
            Powered by <span className="font-semibold text-[#3A57C4]">3Boxes HRMS</span> — Your all-in-one HR companion
          </p>
        </div>
      </div>
    </div>
  );
}
