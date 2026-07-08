'use client';

/* ───────────────────────────────────────────────────────────────
   3Boxes HRMS — Attendance Dashboard
   A SmartHR-style attendance overview with stat cards, trend
   charts, distribution visualisations, today's table, late
   arrivals panel, and quick-action shortcuts.
   ─────────────────────────────────────────────────────────────── */

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiCheckCircle,
  FiClock,
  FiCalendar,
  FiXCircle,
  FiWatch,
  FiTrendingUp,
  FiRefreshCw,
  FiArrowUpRight,
  FiArrowDownRight,
  FiUser,
  FiEdit3,
  FiFileText,
  FiMap,
  FiClipboard,
  FiNavigation,
  FiAlertTriangle,
  FiGrid, FiSettings,
} from 'react-icons/fi';
import ModuleDashboardShell, { DashboardTabConfig } from '@/components/ModuleDashboardShell';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

/* ─────────────── helpers ─────────────── */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#8B5CF6'];

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/* ─────────────── demo data ─────────────── */

const DEMO_STATS = [
  { key: 'present', label: 'Present Today', value: 214, trend: 3.2, sub: 'vs 207 yesterday', icon: FiCheckCircle, color: '#10B981' },
  { key: 'late', label: 'Late Arrivals', value: 18, trend: -5.1, sub: 'vs 19 yesterday', icon: FiClock, color: '#F59E0B' },
  { key: 'leave', label: 'On Leave', value: 22, trend: 8.3, sub: '3 more than avg', icon: FiCalendar, color: '#6366F1' },
  { key: 'absent', label: 'Absent', value: 8, trend: -12.5, sub: 'vs 9 yesterday', icon: FiXCircle, color: '#F43F5E' },
  { key: 'avgHours', label: 'Avg Work Hours', value: 8.4, trend: 1.2, sub: 'hrs per employee', icon: FiWatch, color: '#06B6D4' },
  { key: 'rate', label: 'Attendance Rate', value: 92.1, trend: 2.4, sub: '% this month', icon: FiTrendingUp, color: '#8B5CF6' },
];

const DAILY_TREND_DATA = [
  { date: 'Feb 1', Present: 198, Absent: 12 },
  { date: 'Feb 2', Present: 205, Absent: 9 },
  { date: 'Feb 3', Present: 201, Absent: 14 },
  { date: 'Feb 4', Present: 210, Absent: 8 },
  { date: 'Feb 5', Present: 195, Absent: 18 },
  { date: 'Feb 6', Present: 208, Absent: 10 },
  { date: 'Feb 7', Present: 212, Absent: 7 },
  { date: 'Feb 8', Present: 199, Absent: 13 },
  { date: 'Feb 9', Present: 206, Absent: 11 },
  { date: 'Feb 10', Present: 215, Absent: 6 },
  { date: 'Feb 11', Present: 203, Absent: 15 },
  { date: 'Feb 12', Present: 209, Absent: 9 },
  { date: 'Feb 13', Present: 211, Absent: 8 },
  { date: 'Feb 14', Present: 214, Absent: 8 },
];

const DEPARTMENT_DATA = [
  { department: 'Engineering', rate: 96 },
  { department: 'Marketing', rate: 91 },
  { department: 'Sales', rate: 88 },
  { department: 'HR', rate: 94 },
  { department: 'Finance', rate: 93 },
  { department: 'Operations', rate: 85 },
  { department: 'Design', rate: 92 },
  { department: 'Support', rate: 89 },
];

const DISTRIBUTION_DATA = [
  { name: 'Present', value: 214, color: '#10B981' },
  { name: 'Late', value: 18, color: '#F59E0B' },
  { name: 'Half-day', value: 12, color: '#6366F1' },
  { name: 'Leave', value: 22, color: '#06B6D4' },
  { name: 'Absent', value: 8, color: '#F43F5E' },
];

const TODAY_ATTENDANCE = [
  { id: 1, name: 'Aarav Sharma', department: 'Engineering', checkIn: '08:45 AM', checkOut: '05:30 PM', status: 'Present', hours: '8.75' },
  { id: 2, name: 'Priya Patel', department: 'Marketing', checkIn: '09:32 AM', checkOut: '06:15 PM', status: 'Late', hours: '8.72' },
  { id: 3, name: 'Rohan Gupta', department: 'Sales', checkIn: '—', checkOut: '—', status: 'Leave', hours: '—' },
  { id: 4, name: 'Sneha Reddy', department: 'HR', checkIn: '08:50 AM', checkOut: '05:45 PM', status: 'Present', hours: '8.92' },
  { id: 5, name: 'Vikram Singh', department: 'Finance', checkIn: '10:15 AM', checkOut: '06:30 PM', status: 'Late', hours: '8.25' },
  { id: 6, name: 'Ananya Iyer', department: 'Design', checkIn: '—', checkOut: '—', status: 'Absent', hours: '—' },
  { id: 7, name: 'Karan Mehta', department: 'Operations', checkIn: '08:30 AM', checkOut: '02:15 PM', status: 'Half-day', hours: '5.75' },
  { id: 8, name: 'Divya Nair', department: 'Support', checkIn: '08:55 AM', checkOut: '05:50 PM', status: 'Present', hours: '8.92' },
];

const LATE_ARRIVALS = [
  { name: 'Priya Patel', department: 'Marketing', arrival: '09:32 AM', expected: '09:00 AM', delay: '32 min' },
  { name: 'Vikram Singh', department: 'Finance', arrival: '10:15 AM', expected: '09:00 AM', delay: '1 hr 15 min' },
  { name: 'Rahul Joshi', department: 'Engineering', arrival: '09:22 AM', expected: '09:00 AM', delay: '22 min' },
  { name: 'Meera Das', department: 'Sales', arrival: '09:48 AM', expected: '09:00 AM', delay: '48 min' },
  { name: 'Siddharth Rao', department: 'Operations', arrival: '10:05 AM', expected: '09:00 AM', delay: '1 hr 5 min' },
];

const QUICK_ACTIONS = [
  { key: 'markAttendance', label: 'Mark Attendance', icon: FiCheckCircle, color: '#10B981', bg: 'bg-emerald-50', route: '/attendance' },
  { key: 'regularize', label: 'Regularize', icon: FiEdit3, color: '#F59E0B', bg: 'bg-amber-50', route: '/attendance/regularize' },
  { key: 'applyPermission', label: 'Apply Permission', icon: FiFileText, color: '#6366F1', bg: 'bg-indigo-50', route: '/attendance/permission' },
  { key: 'musterRoll', label: 'Muster Roll', icon: FiClipboard, color: '#EC4899', bg: 'bg-pink-50', route: '/attendance/muster-roll' },
  { key: 'overtime', label: 'Overtime', icon: FiWatch, color: '#06B6D4', bg: 'bg-cyan-50', route: '/attendance/overtime' },
  { key: 'geofence', label: 'Geofence Setup', icon: FiMap, color: '#8B5CF6', bg: 'bg-violet-50', route: '/attendance/geofence' },
];

/* ─────────────── status badge helper ─────────────── */

function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  const map: Record<string, string> = {
    present: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    late: 'bg-amber-50 text-amber-700 ring-amber-200',
    'half-day': 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    leave: 'bg-blue-50 text-blue-700 ring-blue-200',
    absent: 'bg-red-50 text-red-700 ring-red-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${map[s] || 'bg-gray-50 text-gray-700 ring-gray-200'}`}>
      {status}
    </span>
  );
}

/* ─────────────── skeleton ─────────────── */

function SkeletonCard() {
  return (
    <div className="thb-card p-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="h-6 w-16 rounded bg-gray-200" />
        </div>
      </div>
      <div className="mt-3 h-3 w-32 rounded bg-gray-200" />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="thb-card p-6 animate-pulse">
      <div className="h-4 w-40 rounded bg-gray-200 mb-4" />
      <div className="h-56 rounded bg-gray-100" />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="thb-card p-6 animate-pulse">
      <div className="h-4 w-48 rounded bg-gray-200 mb-4" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-14 rounded bg-gray-200" />
            <div className="h-4 w-10 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Placeholder Tabs ── */

const attendanceTabs: DashboardTabConfig[] = [
  { label: 'Overview', key: 'overview', icon: <FiGrid className="w-4 h-4" /> },
  { label: 'Settings', key: 'settings', icon: <FiSettings className="w-4 h-4" /> },
  { label: 'Reports', key: 'reports', icon: <FiFileText className="w-4 h-4" />, isNew: true },
];

function AttendanceSettingsPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center shadow-lg mb-4">
        <FiSettings className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Attendance Settings</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md">
        Configure work schedules, grace periods, overtime rules, and attendance policies. Coming soon.
      </p>
    </div>
  );
}

function AttendanceReportsPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center shadow-lg mb-4">
        <FiFileText className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Attendance Reports</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md">
        Attendance trends, punctuality reports, and time-tracking analytics. Coming soon.
      </p>
    </div>
  );
}

function AttendancePageContent() {
  return (
    <ModuleDashboardShell
      moduleKey="attendance"
      moduleLabel="Attendance"
      moduleIcon={<FiClock className="w-5 h-5 text-white" />}
      gradientColor="from-cyan-500 to-sky-600"
      tabs={attendanceTabs}
      overviewContent={<AttendanceContent />}
      children={{
        settings: <AttendanceSettingsPlaceholder />,
        reports: <AttendanceReportsPlaceholder />,
      }}
    />
  );
}

export default function AttendanceDashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" /></div>}>
      <AttendancePageContent />
    </Suspense>
  );
}

/* ── Attendance Content ── */

function AttendanceContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { selectedCompany } = useCompanyContextStore();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(DEMO_STATS);
  const [dailyTrend, setDailyTrend] = useState(DAILY_TREND_DATA);
  const [deptData, setDeptData] = useState(DEPARTMENT_DATA);
  const [distribution, setDistribution] = useState(DISTRIBUTION_DATA);
  const [todayRecords, setTodayRecords] = useState(TODAY_ATTENDANCE);
  const [lateArrivals, setLateArrivals] = useState(LATE_ARRIVALS);
  const [refreshing, setRefreshing] = useState(false);

  /* ─── fetch dashboard data ─── */
  const fetchDashboard = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/attendance/route', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
        if (data.dailyTrend) setDailyTrend(data.dailyTrend);
        if (data.deptData) setDeptData(data.deptData);
        if (data.distribution) setDistribution(data.distribution);
        if (data.todayRecords) setTodayRecords(data.todayRecords);
        if (data.lateArrivals) setLateArrivals(data.lateArrivals);
      }
    } catch {
      /* silent — demo data already in state */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDashboard();
    }, 600);
    return () => clearTimeout(timer);
  }, [selectedCompany]);

  /* ─── handlers ─── */
  const handleRefresh = () => {
    fetchDashboard();
  };

  const handleQuickAction = (route: string) => {
    router.push(route);
  };

  const today = formatDate(new Date());

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-gray-50/80">
      {/* ──────── HERO SECTION ──────── */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#0F172A] via-[#1E3A5F] to-[#312E81] px-6 py-10 sm:px-8">
        {/* decorative blur circles */}
        <div className="pointer-events-none absolute -top-20 -left-20 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-10 h-60 w-60 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="pointer-events-none absolute top-4 right-1/3 h-40 w-40 rounded-full bg-violet-400/10 blur-2xl" />

        <div className="relative mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-300 tracking-wide">3Boxes HRMS</p>
            <h1 className="mt-1 text-3xl sm:text-4xl font-bold text-white tracking-tight">Attendance Dashboard</h1>
            <p className="mt-2 text-sm text-gray-300">{today}</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-sm px-5 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition disabled:opacity-50"
          >
            <FiRefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 space-y-6 -mt-4">
        {/* ──────── STAT CARDS ──────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading
            ? [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
            : stats.map((s) => {
                const Icon = s.icon;
                const isUp = s.trend >= 0;
                return (
                  <div key={s.key} className="thb-card thb-card-hover p-5 flex items-start gap-4 transition-shadow">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${s.color}15` }}
                    >
                      <Icon className="h-6 w-6" style={{ color: s.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-500 truncate">{s.label}</p>
                      <p className="mt-0.5 text-2xl font-bold text-gray-900">
                        {s.key === 'rate' ? `${s.value}%` : s.key === 'avgHours' ? `${s.value}h` : s.value.toLocaleString()}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {isUp ? (
                          <FiArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <FiArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                        )}
                        <span className={`text-xs font-semibold ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>
                          {Math.abs(s.trend)}%
                        </span>
                        <span className="text-xs text-gray-400">{s.sub}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
        </section>

        {/* ──────── CHARTS ROW 1 ──────── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {loading ? (
            <>
              <SkeletonChart />
              <SkeletonChart />
            </>
          ) : (
            <>
              {/* Daily Attendance Trend */}
              <div className="thb-card p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Daily Attendance Trend</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dailyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gradPresent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradAbsent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 13 }}
                    />
                    <Area type="monotone" dataKey="Present" stroke="#10B981" strokeWidth={2.5} fill="url(#gradPresent)" dot={false} />
                    <Area type="monotone" dataKey="Absent" stroke="#F43F5E" strokeWidth={2.5} fill="url(#gradAbsent)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Department Attendance */}
              <div className="thb-card p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Department Attendance</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={deptData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} unit="%" />
                    <YAxis type="category" dataKey="department" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={90} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 13 }}
                      formatter={(value: number) => [`${value}%`, 'Rate']}
                    />
                    <Bar dataKey="rate" radius={[0, 6, 6, 0]} barSize={18}>
                      {deptData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </section>

        {/* ──────── CHARTS ROW 2 — Distribution Donut ──────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {loading ? (
            <>
              <SkeletonChart />
              <div className="lg:col-span-2"><SkeletonChart /></div>
            </>
          ) : (
            <>
              {/* Attendance Distribution */}
              <div className="thb-card p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-4">Attendance Distribution</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={distribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {distribution.map((entry, index) => (
                        <Cell key={`pie-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 13 }}
                      formatter={(value: number, name: string) => [`${value} employees`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                  {distribution.map((d) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-xs text-gray-600">{d.name}</span>
                      <span className="text-xs font-semibold text-gray-900 ml-auto">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Late Arrivals Panel */}
              <div className="thb-card p-6 lg:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <FiAlertTriangle className="h-5 w-5 text-red-500" />
                  <h3 className="text-base font-semibold text-gray-900">Late Arrivals Today</h3>
                  <span className="ml-auto inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                    {lateArrivals.length} late
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                        <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                        <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Arrived</th>
                        <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expected</th>
                        <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Delay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lateArrivals.map((l, i) => (
                        <tr key={i} className="hover:bg-gray-50/50 transition">
                          <td className="py-3 font-medium text-gray-900">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                                <FiUser className="h-4 w-4 text-amber-600" />
                              </div>
                              {l.name}
                            </div>
                          </td>
                          <td className="py-3 text-gray-600">{l.department}</td>
                          <td className="py-3 text-gray-600">{l.arrival}</td>
                          <td className="py-3 text-gray-600">{l.expected}</td>
                          <td className="py-3 text-right">
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                              <FiClock className="h-3 w-3" />
                              {l.delay}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ──────── TODAY'S ATTENDANCE TABLE ──────── */}
        <section>
          {loading ? (
            <SkeletonTable />
          ) : (
            <div className="thb-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">Today&apos;s Attendance</h3>
                <span className="text-xs text-gray-400">{todayRecords.length} records</span>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="py-3 px-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee Name</th>
                      <th className="py-3 px-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                      <th className="py-3 px-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Check-in</th>
                      <th className="py-3 px-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Check-out</th>
                      <th className="py-3 px-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="py-3 px-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Work Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {todayRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/50 transition">
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {r.name.split(' ').map((n) => n[0]).join('')}
                            </div>
                            <span className="font-medium text-gray-900">{r.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-gray-600">{r.department}</td>
                        <td className="py-3 px-2 text-gray-600 font-mono text-xs">{r.checkIn}</td>
                        <td className="py-3 px-2 text-gray-600 font-mono text-xs">{r.checkOut}</td>
                        <td className="py-3 px-2">{statusBadge(r.status)}</td>
                        <td className="py-3 px-2 text-right font-semibold text-gray-900">{r.hours}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ──────── QUICK ACTIONS ──────── */}
        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  onClick={() => handleQuickAction(action.route)}
                  className="thb-card thb-card-hover p-4 flex flex-col items-center gap-3 text-center transition-all hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
                >
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${action.bg}`}>
                    <Icon className="h-6 w-6" style={{ color: action.color }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 leading-tight">{action.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ──────── FOOTER BRANDING ──────── */}
        <footer className="text-center py-4">
          <p className="text-xs text-gray-400">
            Powered by <span className="font-semibold text-gray-500">3Boxes HRMS</span> &middot; Real-time attendance insights
          </p>
        </footer>
      </div>
    </div>
  );
}
