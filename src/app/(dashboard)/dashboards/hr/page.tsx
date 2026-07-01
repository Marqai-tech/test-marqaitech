'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUsers, FiUserPlus, FiBriefcase, FiTrendingUp,
  FiClock, FiHeart, FiCheckCircle, FiAlertCircle,
  FiCalendar, FiChevronRight, FiZap, FiDollarSign,
  FiSend, FiShield, FiBarChart2, FiSearch, FiRefreshCw,
  FiTarget, FiAward,
} from 'react-icons/fi';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
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

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#8B5CF6', '#F97316', '#14B8A6'];

const PIE_COLORS = COLORS;

function formatCurrency(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

/* ─────────────── demo data ─────────────── */

const DEMO_STATS = [
  { key: 'totalEmployees', label: 'Total Employees', value: 248, trend: 5.2, icon: FiUsers, color: COLORS[0] },
  { key: 'newHires', label: 'New Hires This Month', value: 12, trend: 18.4, icon: FiUserPlus, color: COLORS[1] },
  { key: 'openPositions', label: 'Open Positions', value: 8, trend: -3.1, icon: FiBriefcase, color: COLORS[2] },
  { key: 'attritionRate', label: 'Attrition Rate', value: 4.2, trend: -1.8, suffix: '%', icon: FiTrendingUp, color: COLORS[3] },
  { key: 'avgTenure', label: 'Avg Tenure', value: 3.6, trend: 0.4, suffix: ' yrs', icon: FiClock, color: COLORS[4] },
  { key: 'engagementScore', label: 'Engagement Score', value: 82, trend: 3.5, suffix: '/100', icon: FiHeart, color: COLORS[5] },
];

const DEMO_DEPT_DATA = [
  { name: 'Engineering', count: 86 },
  { name: 'Sales', count: 42 },
  { name: 'Marketing', count: 28 },
  { name: 'HR', count: 18 },
  { name: 'Finance', count: 24 },
  { name: 'Operations', count: 32 },
  { name: 'Design', count: 18 },
];

const DEMO_HEADCOUNT_DATA = [
  { month: 'Oct', headcount: 215 },
  { month: 'Nov', headcount: 222 },
  { month: 'Dec', headcount: 228 },
  { month: 'Jan', headcount: 232 },
  { month: 'Feb', headcount: 240 },
  { month: 'Mar', headcount: 248 },
];

const DEMO_FUNNEL_DATA = [
  { stage: 'Applied', count: 580 },
  { stage: 'Screened', count: 340 },
  { stage: 'Interviewed', count: 150 },
  { stage: 'Offered', count: 42 },
  { stage: 'Hired', count: 28 },
];

const DEMO_LEAVE_DATA = [
  { name: 'Casual Leave', value: 35 },
  { name: 'Sick Leave', value: 22 },
  { name: 'Earned Leave', value: 18 },
  { name: 'Maternity', value: 5 },
  { name: 'Comp Off', value: 12 },
  { name: 'Loss of Pay', value: 8 },
];

const DEMO_RECENT_HIRES = [
  { name: 'Ananya Sharma', department: 'Engineering', date: '2026-03-01', status: 'Onboarding', salary: formatCurrency(1200000) },
  { name: 'Rohit Mehta', department: 'Sales', date: '2026-02-28', status: 'Active', salary: formatCurrency(950000) },
  { name: 'Priya Patel', department: 'Design', date: '2026-02-25', status: 'Active', salary: formatCurrency(880000) },
  { name: 'Karan Singh', department: 'Marketing', date: '2026-02-20', status: 'Probation', salary: formatCurrency(720000) },
  { name: 'Meera Joshi', department: 'Finance', date: '2026-02-18', status: 'Active', salary: formatCurrency(1050000) },
];

const DEMO_PENDING_ACTIONS = [
  { category: 'Onboarding Tasks', items: ['Complete IT setup for Ananya S.', 'Assign buddy for Rohit M.', 'Schedule orientation — 3 new hires'], count: 3, icon: FiCheckCircle, color: COLORS[1] },
  { category: 'Leave Approvals', items: ['Sick leave — Vikram R. (2 days)', 'Casual leave — Neha K. (1 day)', 'Comp off — Amit P. (1 day)'], count: 5, icon: FiCalendar, color: COLORS[2] },
  { category: 'Probation Ending', items: ['Suresh Kumar — ends Mar 15', 'Deepa Nair — ends Mar 22'], count: 2, icon: FiAlertCircle, color: COLORS[3] },
];

const DEMO_QUICK_ACTIONS = [
  { label: 'Add Employee', icon: FiUserPlus, color: COLORS[0], href: '/employees' },
  { label: 'Run Payroll', icon: FiDollarSign, color: COLORS[1], href: '/payroll' },
  { label: 'Post Job', icon: FiBriefcase, color: COLORS[2], href: '/recruitment' },
  { label: 'View Reports', icon: FiBarChart2, color: COLORS[4], href: '/reports' },
  { label: 'Manage Policies', icon: FiShield, color: COLORS[5], href: '/settings' },
  { label: 'Send Announcement', icon: FiSend, color: COLORS[6], href: '/email' },
];

/* ─────────────── types ─────────────── */

interface StatCard {
  key: string;
  label: string;
  value: number;
  trend: number;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface RecentHire {
  name: string;
  department: string;
  date: string;
  status: string;
  salary: string;
}

interface PendingAction {
  category: string;
  items: string[];
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface QuickAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href: string;
}

/* ─────────────── skeleton components ─────────────── */

function StatSkeleton() {
  return (
    <div className="thb-card thb-card-hover p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-slate-200" />
        <div className="w-12 h-4 rounded bg-slate-100" />
      </div>
      <div className="w-20 h-7 rounded bg-slate-200 mb-1" />
      <div className="w-28 h-3 rounded bg-slate-100" />
    </div>
  );
}

function ChartSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className={`thb-card thb-card-hover p-5 animate-pulse ${height}`}>
      <div className="w-32 h-5 rounded bg-slate-200 mb-4" />
      <div className="flex-1 rounded bg-slate-50" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="thb-card thb-card-hover p-5 animate-pulse">
      <div className="w-36 h-5 rounded bg-slate-200 mb-4" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 mb-3">
          <div className="w-32 h-4 rounded bg-slate-100" />
          <div className="w-24 h-4 rounded bg-slate-50" />
          <div className="w-20 h-4 rounded bg-slate-50" />
          <div className="w-16 h-5 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

/* ─────────────── custom tooltip ─────────────── */

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-900 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/* ─────────────── status badge ─────────────── */

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    Active: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Onboarding: { bg: 'bg-blue-50', text: 'text-blue-700' },
    Probation: { bg: 'bg-amber-50', text: 'text-amber-700' },
    Pending: { bg: 'bg-slate-50', text: 'text-slate-600' },
    Inactive: { bg: 'bg-red-50', text: 'text-red-600' },
  };
  const cls = map[status] || map.Pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls.bg} ${cls.text}`}>
      {status}
    </span>
  );
}

/* ═══════════════════════════════════════════════
   HR Dashboard Page Component
   ═══════════════════════════════════════════════ */

export default function HRDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { selectedCompany } = useCompanyContextStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<StatCard[]>(DEMO_STATS);
  const [deptData, setDeptData] = useState(DEMO_DEPT_DATA);
  const [headcountData] = useState(DEMO_HEADCOUNT_DATA);
  const [funnelData, setFunnelData] = useState(DEMO_FUNNEL_DATA);
  const [leaveData] = useState(DEMO_LEAVE_DATA);
  const [recentHires, setRecentHires] = useState<RecentHire[]>(DEMO_RECENT_HIRES);
  const [pendingActions] = useState<PendingAction[]>(DEMO_PENDING_ACTIONS);
  const [quickActions] = useState<QuickAction[]>(DEMO_QUICK_ACTIONS);

  const companyName = selectedCompany?.name || user?.company?.name || '3Boxes Tech';

  /* ─── fetch data ─── */
  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const headers = getAuthHeaders();
      const companyId = selectedCompany?.id;

      // Fetch dashboard stats
      const dashRes = await fetch(`/api/dashboard${companyId ? `?companyId=${companyId}` : ''}`, { headers });
      if (dashRes.ok) {
        const dashJson = await dashRes.json();
        const s = dashJson.stats || {};
        setStats(prev => prev.map(card => {
          switch (card.key) {
            case 'totalEmployees': return { ...card, value: s.totalEmployees ?? card.value };
            case 'newHires': return { ...card, value: s.newHires ?? card.value };
            case 'openPositions': return { ...card, value: s.openPositions ?? card.value };
            case 'attritionRate': return { ...card, value: s.attritionRate ?? card.value };
            case 'engagementScore': return { ...card, value: s.attendanceRate ?? card.value };
            default: return card;
          }
        }));

        // Department distribution from dashboard
        if (dashJson.departmentStats?.length) {
          setDeptData(dashJson.departmentStats.map((d: { departmentName: string; count: number }) => ({
            name: d.departmentName,
            count: d.count,
          })));
        }
      }

      // Fetch employees for recent hires
      const empRes = await fetch(`/api/employees?limit=5&sort=joiningDate&order=desc${companyId ? `&companyId=${companyId}` : ''}`, { headers });
      if (empRes.ok) {
        const empJson = await empRes.json();
        if (empJson.data?.length) {
          setRecentHires(empJson.data.slice(0, 5).map((e: {
            firstName: string; lastName: string;
            department: { name: string }; joiningDate: string; status: string;
            ctc?: number;
          }) => ({
            name: `${e.firstName} ${e.lastName}`,
            department: e.department?.name || '—',
            date: e.joiningDate?.split('T')[0] || '—',
            status: e.status === 'active' ? 'Active' : e.status === 'onboarding' ? 'Onboarding' : e.status === 'probation' ? 'Probation' : 'Pending',
            salary: e.ctc ? formatCurrency(e.ctc) : '—',
          })));
        }
      }

      // Fetch recruitment data for funnel
      const recRes = await fetch(`/api/recruitment${companyId ? `?companyId=${companyId}` : ''}`, { headers });
      if (recRes.ok) {
        const recJson = await recRes.json();
        if (recJson.funnelData) {
          setFunnelData(recJson.funnelData);
        }
      }
    } catch {
      // Silently use demo data fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!cancelled) fetchData();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id, user?.company?.id]);

  /* ─── formatted date ─── */
  const today = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, []);

  /* ─── trend indicator ─── */
  const TrendIndicator = ({ trend, isInverse }: { trend: number; isInverse?: boolean }) => {
    const isPositive = isInverse ? trend < 0 : trend >= 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
        isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
      }`}>
        {isPositive ? (
          <FiTrendingUp className="w-3 h-3" />
        ) : (
          <FiTrendingUp className="w-3 h-3 rotate-180" />
        )}
        {Math.abs(trend)}%
      </span>
    );
  };

  /* ─── render ─── */
  return (
    <div className="space-y-6 pb-8">

      {/* ═══════ Gradient Hero ═══════ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#6366F1] via-[#8B5CF6] to-[#EC4899] p-6 md:p-8 text-white">
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white/5 blur-xl" />
        <div className="absolute top-1/2 right-1/3 w-20 h-20 rounded-full bg-white/5 blur-lg" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">HR Dashboard</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-semibold tracking-wide">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {companyName}
              </span>
            </div>
            <p className="text-white/70 text-sm md:text-base">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur text-sm">
              <FiCalendar className="w-4 h-4" />
              <span>FY 2025-26</span>
            </div>
            <div className="px-4 py-2 rounded-xl bg-white/15 backdrop-blur text-sm font-medium">
              3Boxes HRMS
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 backdrop-blur hover:bg-white/30 transition-colors text-sm font-medium disabled:opacity-60"
              aria-label="Refresh dashboard data"
            >
              <FiRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ═══════ Stat Cards — 3x2 Grid ═══════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading
          ? [...Array(6)].map((_, i) => <StatSkeleton key={i} />)
          : stats.map((card) => {
              const Icon = card.icon;
              const isInverse = card.key === 'attritionRate';
              return (
                <div key={card.key} className="thb-card thb-card-hover p-5 group">
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${card.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: card.color }} />
                    </div>
                    <TrendIndicator trend={card.trend} isInverse={isInverse} />
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {card.key === 'attritionRate' || card.key === 'engagementScore'
                      ? card.value
                      : card.value.toLocaleString()}
                    {card.suffix && <span className="text-sm font-semibold text-slate-500 ml-0.5">{card.suffix}</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
                </div>
              );
            })}
      </div>

      {/* ═══════ Charts Row 1 ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Distribution — Horizontal Bar */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="thb-card thb-card-hover p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Department Distribution</h3>
              <span className="text-[11px] text-slate-400 font-medium">Headcount by Dept</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptData} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                  {deptData.map((_, index) => (
                    <Cell key={`dept-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Headcount Trend — Area Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="thb-card thb-card-hover p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Headcount Trend</h3>
              <span className="text-[11px] text-slate-400 font-medium">Last 6 Months</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={headcountData} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="headcountGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="headcount"
                  stroke={COLORS[0]}
                  strokeWidth={2.5}
                  fill="url(#headcountGrad)"
                  dot={{ r: 4, fill: COLORS[0], stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: COLORS[0], stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ═══════ Charts Row 2 ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recruitment Funnel — Bar Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="thb-card thb-card-hover p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Recruitment Funnel</h3>
              <span className="text-[11px] text-slate-400 font-medium">Current Quarter</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnelData} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={40}>
                  {funnelData.map((_, index) => {
                    const funnelColors = [COLORS[0], COLORS[4], COLORS[2], COLORS[6], COLORS[1]];
                    return <Cell key={`funnel-${index}`} fill={funnelColors[index % funnelColors.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Leave Type Distribution — Pie Chart Donut */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="thb-card thb-card-hover p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Leave Type Distribution</h3>
              <span className="text-[11px] text-slate-400 font-medium">This Month</span>
            </div>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={leaveData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {leaveData.map((_, index) => (
                      <Cell key={`leave-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value} days`, name]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="hidden md:flex flex-col gap-1.5 min-w-[120px]">
                {leaveData.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                    <span className="text-slate-500 truncate">{item.name}</span>
                    <span className="text-slate-900 font-semibold ml-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════ Recent Hires Table + Pending HR Actions ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Hires — 2 cols */}
        <div className="lg:col-span-2">
          {loading ? (
            <TableSkeleton />
          ) : (
            <div className="thb-card thb-card-hover p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Recent Hires</h3>
                <button
                  onClick={() => router.push('/employees')}
                  className="text-xs text-[#6366F1] font-semibold hover:underline flex items-center gap-1"
                >
                  View All <FiChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Department</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">CTC</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentHires.map((hire, i) => (
                      <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-3 font-medium text-slate-900">{hire.name}</td>
                        <td className="py-3 px-3 text-slate-500">{hire.department}</td>
                        <td className="py-3 px-3 text-slate-500">
                          {new Date(hire.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="py-3 px-3 text-slate-700 font-medium">{hire.salary}</td>
                        <td className="py-3 px-3"><StatusBadge status={hire.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pending HR Actions — 1 col */}
        <div>
          {loading ? (
            <ChartSkeleton height="h-auto" />
          ) : (
            <div className="thb-card thb-card-hover p-5 h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Pending HR Actions</h3>
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">
                  {pendingActions.reduce((a, p) => a + p.count, 0)}
                </span>
              </div>
              <div className="space-y-4 max-h-[320px] overflow-y-auto pr-1">
                {pendingActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <div key={action.category} className="rounded-xl border border-slate-100 p-3 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${action.color}12` }}>
                          <Icon className="w-4 h-4" style={{ color: action.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-900">{action.category}</p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${action.color}12`, color: action.color }}>
                          {action.count}
                        </span>
                      </div>
                      <ul className="space-y-1 ml-10">
                        {action.items.map((item, j) => (
                          <li key={j} className="text-[11px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
                            <span className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ Quick Actions ═══════ */}
      <div className="thb-card thb-card-hover p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Quick Actions</h3>
          <FiZap className="w-4 h-4 text-[#F59E0B]" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => router.push(action.href)}
                className="group flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all bg-white text-center focus:outline-none focus:ring-2 focus:ring-[#6366F1]/30"
                aria-label={action.label}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${action.color}12` }}
                >
                  <Icon className="w-5 h-5" style={{ color: action.color }} />
                </div>
                <span className="text-xs font-semibold text-slate-900 leading-tight">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════ Footer ═══════ */}
      <div className="text-center text-[11px] text-slate-400 pt-2">
        Powered by <span className="font-bold text-slate-500">3Boxes HRMS</span>
      </div>
    </div>
  );
}
