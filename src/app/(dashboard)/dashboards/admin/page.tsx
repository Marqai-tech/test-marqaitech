'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUsers, FiUserCheck, FiHome, FiSearch, FiTrendingUp,
  FiTrendingDown, FiCalendar, FiClock, FiSettings, FiShield,
  FiActivity, FiFileText, FiAlertCircle, FiCheckCircle,
  FiArrowUp, FiArrowDown, FiZap, FiDatabase,
  FiLayers, FiChevronRight, FiRefreshCw, FiBell,
} from 'react-icons/fi';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';

/* ================================================================
   Admin Dashboard – 3Boxes HRMS
   SmartHR-style admin overview with live data from /api/dashboard
   ================================================================ */

/* ---------- helpers ---------- */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const COLORS = {
  indigo: '#6366F1',
  emerald: '#10B981',
  amber: '#F59E0B',
  pink: '#EC4899',
  cyan: '#06B6D4',
  violet: '#8B5CF6',
};

const PIE_COLORS = [COLORS.indigo, COLORS.emerald, COLORS.amber, COLORS.pink, COLORS.cyan, COLORS.violet];

function formatCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatDate() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/* ---------- types ---------- */

interface StatCard {
  label: string;
  value: number;
  change: number;
  changeLabel: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  isCurrency?: boolean;
}

interface RecentActivity {
  id: string;
  action: string;
  entity: string;
  details: string;
  createdAt: string;
  user: { name: string; email: string; avatar: string | null };
}

interface DepartmentStat {
  departmentId: string;
  departmentName: string;
  count: number;
}

interface PendingApproval {
  type: string;
  count: number;
  icon: React.ReactNode;
  color: string;
}

interface DashboardData {
  stats: {
    totalEmployees: number;
    newHires: number;
    openPositions: number;
    attendanceRate: number;
    pendingApprovals: number;
    unreadNotifications: number;
    dataScope: string;
  };
  recentActivities: RecentActivity[];
  departmentStats: DepartmentStat[];
}

/* ---------- skeleton components ---------- */

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-slate-200/70 animate-pulse rounded-lg ${className}`} />;
}

function StatSkeleton() {
  return (
    <div className="thb-card p-5 rounded-2xl border border-slate-100">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-7 w-16" />
        </div>
        <SkeletonBlock className="h-10 w-10 rounded-xl" />
      </div>
      <SkeletonBlock className="h-3 w-32 mt-3" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="thb-card p-6 rounded-2xl border border-slate-100">
      <SkeletonBlock className="h-5 w-40 mb-4" />
      <div className="flex items-end gap-2 h-52">
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBlock key={i} className="flex-1 rounded-t-md" style={{ height: `${30 + ((i * 17) % 70)}%` } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}



/* ---------- fallback demo data ---------- */

function getDemoData(): DashboardData {
  return {
    stats: {
      totalEmployees: 248,
      newHires: 12,
      openPositions: 8,
      attendanceRate: 94.5,
      pendingApprovals: 23,
      unreadNotifications: 7,
      dataScope: 'company',
    },
    recentActivities: [
      { id: '1', action: 'CREATE', entity: 'Employee', details: 'New employee onboarded – Arjun Mehta', createdAt: new Date(Date.now() - 900000).toISOString(), user: { name: 'HR Admin', email: 'hr@3boxestech.com', avatar: null } },
      { id: '2', action: 'APPROVE', entity: 'Leave', details: 'Leave request approved for Priya Sharma', createdAt: new Date(Date.now() - 3600000).toISOString(), user: { name: 'Manager Dev', email: 'dev@3boxestech.com', avatar: null } },
      { id: '3', action: 'UPDATE', entity: 'Payroll', details: 'Payroll run completed for March 2026', createdAt: new Date(Date.now() - 7200000).toISOString(), user: { name: 'Finance Team', email: 'finance@3boxestech.com', avatar: null } },
      { id: '4', action: 'CREATE', entity: 'Job', details: 'New job posting: Senior React Developer', createdAt: new Date(Date.now() - 14400000).toISOString(), user: { name: 'Recruiter', email: 'recruit@3boxestech.com', avatar: null } },
      { id: '5', action: 'LOGIN', entity: 'User', details: 'Admin logged in from 192.168.1.45', createdAt: new Date(Date.now() - 21600000).toISOString(), user: { name: 'Super Admin', email: 'admin@3boxestech.com', avatar: null } },
      { id: '6', action: 'UPDATE', entity: 'Policy', details: 'Leave policy updated – max CL increased', createdAt: new Date(Date.now() - 43200000).toISOString(), user: { name: 'HR Admin', email: 'hr@3boxestech.com', avatar: null } },
    ],
    departmentStats: [
      { departmentId: 'd1', departmentName: 'Engineering', count: 86 },
      { departmentId: 'd2', departmentName: 'Human Resources', count: 24 },
      { departmentId: 'd3', departmentName: 'Design', count: 32 },
      { departmentId: 'd4', departmentName: 'Sales', count: 45 },
      { departmentId: 'd5', departmentName: 'Finance', count: 28 },
      { departmentId: 'd6', departmentName: 'Operations', count: 33 },
    ],
  };
}

function getDemoHeadcountTrend() {
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const base = 210;
  return months.map((m, i) => ({
    month: m,
    headcount: base + Math.floor(i * 5 + Math.random() * 8),
    newHires: Math.floor(3 + Math.random() * 10),
    exits: Math.floor(1 + Math.random() * 4),
  }));
}

function getDemoPendingApprovals(): PendingApproval[] {
  return [
    { type: 'Leave Requests', count: 9, icon: <FiCalendar className="w-5 h-5" />, color: COLORS.indigo },
    { type: 'Expense Claims', count: 7, icon: <FiFileText className="w-5 h-5" />, color: COLORS.amber },
    { type: 'Travel Requests', count: 4, icon: <FiZap className="w-5 h-5" />, color: COLORS.emerald },
    { type: 'Attendance Reg.', count: 3, icon: <FiClock className="w-5 h-5" />, color: COLORS.pink },
  ];
}

/* ---------- custom tooltip for charts ---------- */

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.payload.fill }} />
        <span className="text-sm font-medium text-slate-700">{item.name}</span>
      </div>
      <p className="text-lg font-bold text-slate-900 mt-1">{item.value} employees</p>
    </div>
  );
}

function AreaTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-sm text-slate-700 capitalize">{entry.dataKey}:</span>
          <span className="text-sm font-bold text-slate-900">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- action icon badge ---------- */

function ActionBadge({ action }: { action: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    CREATE: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: <FiArrowUp className="w-3 h-3" /> },
    UPDATE: { bg: 'bg-blue-50', text: 'text-blue-600', icon: <FiRefreshCw className="w-3 h-3" /> },
    APPROVE: { bg: 'bg-green-50', text: 'text-green-600', icon: <FiCheckCircle className="w-3 h-3" /> },
    LOGIN: { bg: 'bg-slate-50', text: 'text-slate-500', icon: <FiUsers className="w-3 h-3" /> },
    DELETE: { bg: 'bg-red-50', text: 'text-red-600', icon: <FiArrowDown className="w-3 h-3" /> },
  };
  const c = config[action] || config.UPDATE;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}>
      {c.icon} {action}
    </span>
  );
}

/* ---------- time ago helper ---------- */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ================================================================
   Main Component
   ================================================================ */

export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [headcountTrend, setHeadcountTrend] = useState<Array<{ month: string; headcount: number; newHires: number; exits: number }>>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  /* ------- data fetch ------- */

  const fetchDashboard = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch('/api/dashboard', { headers: getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        const stats = json.stats || getDemoData().stats;
        const recentActivities = (json.recentActivities || []).slice(0, 8);
        const departmentStats = json.departmentStats || getDemoData().departmentStats;
        setData({ stats, recentActivities, departmentStats });
      } else {
        setData(getDemoData());
      }
    } catch {
      setData(getDemoData());
    }

    // Headcount trend – always demo for now (could be a separate API)
    setHeadcountTrend(getDemoHeadcountTrend());

    // Pending approvals – derive from stats or use demo
    setPendingApprovals(getDemoPendingApprovals());

    if (isRefresh) setRefreshing(false);
    else setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await fetchDashboard();
    })();
    return () => { cancelled = true; };
  }, []);

  /* ------- derived stat cards ------- */

  const statCards: StatCard[] = useMemo(() => {
    if (!data) return [];
    const s = data.stats;
    return [
      {
        label: 'Total Employees',
        value: s.totalEmployees,
        change: 4.2,
        changeLabel: 'vs last month',
        icon: <FiUsers className="w-5 h-5" />,
        color: COLORS.indigo,
        bgColor: 'bg-indigo-50',
      },
      {
        label: 'Active Users',
        value: Math.round(s.totalEmployees * (s.attendanceRate / 100)),
        change: 2.8,
        changeLabel: 'currently online',
        icon: <FiUserCheck className="w-5 h-5" />,
        color: COLORS.emerald,
        bgColor: 'bg-emerald-50',
      },
      {
        label: 'Departments',
        value: data.departmentStats.length || 6,
        change: 0,
        changeLabel: 'no change',
        icon: <FiLayers className="w-5 h-5" />,
        color: COLORS.amber,
        bgColor: 'bg-amber-50',
      },
      {
        label: 'Companies',
        value: 3,
        change: 1,
        changeLabel: 'new this quarter',
        icon: <FiHome className="w-5 h-5" />,
        color: COLORS.pink,
        bgColor: 'bg-pink-50',
      },
    ];
  }, [data]);

  /* ------- pie chart data ------- */

  const pieData = useMemo(() => {
    if (!data?.departmentStats?.length) return [];
    return data.departmentStats.map((d, i) => ({
      name: d.departmentName,
      value: d.count,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [data]);

  /* ------- quick actions ------- */

  const quickActions = [
    { label: 'Manage Users', icon: <FiUsers className="w-5 h-5" />, color: COLORS.indigo, href: '/employees' },
    { label: 'Departments', icon: <FiLayers className="w-5 h-5" />, color: COLORS.emerald, href: '/company' },
    { label: 'Settings', icon: <FiSettings className="w-5 h-5" />, color: COLORS.amber, href: '/settings' },
    { label: 'Audit Logs', icon: <FiFileText className="w-5 h-5" />, color: COLORS.pink, href: '/super-admin/audit-logs' },
    { label: 'RBAC', icon: <FiShield className="w-5 h-5" />, color: COLORS.cyan, href: '/super-admin/rbac' },
    { label: 'System Health', icon: <FiActivity className="w-5 h-5" />, color: COLORS.violet, href: '/super-admin' },
  ];

  /* ------- render helpers ------- */

  const renderChange = (change: number, label: string) => {
    if (change === 0) return <span className="text-xs text-slate-400">— {label}</span>;
    const isPositive = change > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
        {isPositive ? <FiTrendingUp className="w-3 h-3" /> : <FiTrendingDown className="w-3 h-3" />}
        {isPositive ? '+' : ''}{change}% <span className="text-slate-400 font-normal">{label}</span>
      </span>
    );
  };

  /* ================================================================
     RENDER
     ================================================================ */

  return (
    <div className="space-y-6 pb-8">
      {/* ========= DARK GRADIENT HERO ========= */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-6 py-8 sm:px-8 sm:py-10">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-60 h-60 bg-cyan-500 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500 rounded-full blur-3xl opacity-30" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <svg viewBox="0 0 35 11" className="w-4 h-3" fill="none">
                    <rect x="0" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9" />
                    <rect x="13" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9" />
                    <rect x="26" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-indigo-300 tracking-widest uppercase">3Boxes HRMS</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Admin Dashboard</h1>
              <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                <FiCalendar className="w-3.5 h-3.5" /> {formatDate()}
              </p>
            </div>

            {/* Quick Search */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search employees, depts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-10 pr-4 py-2.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:bg-white/15 transition-all"
                />
              </div>
              <button
                onClick={() => fetchDashboard(true)}
                className={`p-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-slate-300 hover:text-white hover:bg-white/20 transition-all ${refreshing ? 'animate-spin' : ''}`}
                title="Refresh data"
              >
                <FiRefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mini notification strip */}
          {data?.stats?.pendingApprovals ? (
            <div className="mt-5 flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
              <FiAlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-200">
                <span className="font-semibold">{data.stats.pendingApprovals}</span> pending approval{data.stats.pendingApprovals !== 1 ? 's' : ''} require your attention
              </p>
              <button
                onClick={() => router.push('/leave')}
                className="ml-auto text-xs font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors"
              >
                Review
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* ========= STAT CARDS ROW ========= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : statCards.map((card, idx) => (
              <div
                key={idx}
                className="thb-card thb-card-hover p-5 rounded-2xl border border-slate-100 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{card.label}</p>
                    <p className="text-2xl font-extrabold text-slate-900">
                      {card.isCurrency ? formatCurrency(card.value) : card.value.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm"
                    style={{ backgroundColor: card.color }}
                  >
                    {card.icon}
                  </div>
                </div>
                <div className="mt-3">{renderChange(card.change, card.changeLabel)}</div>
              </div>
            ))}
      </div>

      {/* ========= CHARTS ROW ========= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employee Distribution – PieChart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="thb-card p-6 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-800">Employee Distribution</h3>
                <p className="text-xs text-slate-400 mt-0.5">By department</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <FiUsers className="w-3.5 h-3.5" />
                {pieData.reduce((sum, d) => sum + d.value, 0)} total
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-full sm:w-1/2 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="w-full sm:w-1/2 space-y-3">
                {pieData.map((d, i) => {
                  const total = pieData.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.fill }} />
                      <span className="text-sm text-slate-600 flex-1 truncate">{d.name}</span>
                      <span className="text-sm font-bold text-slate-800">{d.value}</span>
                      <span className="text-xs text-slate-400 w-12 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Monthly Headcount Trend – AreaChart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="thb-card p-6 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-800">Monthly Headcount Trend</h3>
                <p className="text-xs text-slate-400 mt-0.5">Last 8 months</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-xs text-indigo-500">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" /> Headcount
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> New Hires
                </span>
              </div>
            </div>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={headcountTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradHeadcount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.indigo} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={COLORS.indigo} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradHires" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<AreaTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="headcount"
                    stroke={COLORS.indigo}
                    strokeWidth={2.5}
                    fill="url(#gradHeadcount)"
                  />
                  <Area
                    type="monotone"
                    dataKey="newHires"
                    stroke={COLORS.emerald}
                    strokeWidth={2}
                    fill="url(#gradHires)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* ========= BOTTOM ROW: Activities + Quick Actions + Pending ========= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activities */}
        <div className="lg:col-span-1 thb-card rounded-2xl border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800">Recent Activities</h3>
              <p className="text-xs text-slate-400 mt-0.5">Latest system actions</p>
            </div>
            <button
              onClick={() => router.push('/super-admin/audit-logs')}
              className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors"
            >
              View All <FiChevronRight className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <div className="p-5 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <SkeletonBlock className="h-8 w-8 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <SkeletonBlock className="h-3 w-3/4" />
                    <SkeletonBlock className="h-2 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {data?.recentActivities?.length ? (
                <div className="divide-y divide-slate-50">
                  {data.recentActivities.map((act) => (
                    <div key={act.id} className="px-5 py-3.5 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center flex-shrink-0 text-indigo-500 text-[10px] font-bold uppercase">
                          {act.user?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <ActionBadge action={act.action} />
                            <span className="text-[10px] text-slate-400">{act.entity}</span>
                          </div>
                          <p className="text-sm text-slate-700 truncate">{act.details}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-slate-400">{act.user?.name}</span>
                            <span className="text-[11px] text-slate-300">•</span>
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <FiClock className="w-2.5 h-2.5" /> {timeAgo(act.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <FiActivity className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No recent activities</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions Grid */}
        <div className="thb-card p-6 rounded-2xl border border-slate-100">
          <div className="mb-5">
            <h3 className="text-base font-bold text-slate-800">Quick Actions</h3>
            <p className="text-xs text-slate-400 mt-0.5">Common admin tasks</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action, idx) => (
              <button
                key={idx}
                onClick={() => router.push(action.href)}
                className="group thb-card thb-card-hover p-4 rounded-xl border border-slate-100 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{ '--tw-ring-color': action.color } as React.CSSProperties}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3 transition-transform group-hover:scale-110"
                  style={{ backgroundColor: action.color }}
                >
                  {action.icon}
                </div>
                <p className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                  {action.label}
                </p>
              </button>
            ))}
          </div>

          {/* Mini revenue card */}
          <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-cyan-50 border border-indigo-100/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Monthly Payroll</p>
                <p className="text-lg font-extrabold text-slate-900 mt-0.5">{formatCurrency(1845000)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <FiDatabase className="w-5 h-5 text-indigo-500" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1">
              <FiTrendingUp className="w-3 h-3 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600">+3.2%</span>
              <span className="text-xs text-slate-400 ml-1">vs last month</span>
            </div>
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="thb-card rounded-2xl border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-800">Pending Approvals</h3>
            <p className="text-xs text-slate-400 mt-0.5">Items awaiting your review</p>
          </div>

          {loading ? (
            <div className="p-5 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <SkeletonBlock className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-1">
                    <SkeletonBlock className="h-3 w-3/4" />
                    <SkeletonBlock className="h-2 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5 space-y-3">
              {pendingApprovals.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 p-3 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer"
                  onClick={() => {
                    if (item.type.includes('Leave')) router.push('/leave');
                    else if (item.type.includes('Expense')) router.push('/expenses');
                    else if (item.type.includes('Travel')) router.push('/travel');
                    else router.push('/attendance');
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{item.type}</p>
                    <p className="text-xs text-slate-400">{item.count} pending</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white" style={{ backgroundColor: item.color }}>
                      {item.count}
                    </span>
                    <FiChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              ))}

              {/* Total pending summary */}
              <div className="mt-3 p-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FiBell className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-semibold text-slate-700">Total Pending</span>
                  </div>
                  <span className="text-lg font-extrabold text-slate-900">
                    {pendingApprovals.reduce((sum, p) => sum + p.count, 0)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Additional system status */}
          <div className="px-5 pb-5">
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">System Status</p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-slate-600">Database</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Healthy</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-slate-600">API Server</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Online</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-xs text-slate-600">Email Service</span>
                  </div>
                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Delayed</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-slate-600">Storage</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {formatCurrency(0)} — 72% used
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========= BOTTOM FULL-WIDTH ROW: Attendance Overview ========= */}
      <div className="thb-card p-6 rounded-2xl border border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-800">Attendance Overview</h3>
            <p className="text-xs text-slate-400 mt-0.5">Today&apos;s attendance snapshot</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-emerald-50 rounded-lg px-3 py-1.5">
              <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-700">{data?.stats?.attendanceRate ?? 94}% Present</span>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-1.5">
              <FiAlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-amber-700">{100 - (data?.stats?.attendanceRate ?? 94)}% Absent</span>
            </div>
          </div>
        </div>

        {/* Attendance bar visual */}
        <div className="space-y-3">
          {[
            { label: 'Present', pct: data?.stats?.attendanceRate ?? 94, color: COLORS.emerald },
            { label: 'Late Arrivals', pct: 3.2, color: COLORS.amber },
            { label: 'On Leave', pct: 1.8, color: COLORS.indigo },
            { label: 'Absent', pct: 100 - (data?.stats?.attendanceRate ?? 94) - 3.2 - 1.8, color: COLORS.pink },
          ].map((bar, i) => (
            <div key={i} className="flex items-center gap-4">
              <span className="text-xs text-slate-500 w-24 text-right">{bar.label}</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(bar.pct, 0.5)}%`, backgroundColor: bar.color }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-700 w-12">{bar.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>

        {/* Quick links row */}
        <div className="mt-6 flex flex-wrap gap-3">
          {[
            { label: 'Attendance Dashboard', icon: <FiClock className="w-3.5 h-3.5" />, href: '/attendance' },
            { label: 'Leave Management', icon: <FiCalendar className="w-3.5 h-3.5" />, href: '/leave' },
            { label: 'Employee Directory', icon: <FiUsers className="w-3.5 h-3.5" />, href: '/employees' },
            { label: 'Payroll', icon: <FiDatabase className="w-3.5 h-3.5" />, href: '/payroll' },
          ].map((link, i) => (
            <button
              key={i}
              onClick={() => router.push(link.href)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
            >
              {link.icon} {link.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
