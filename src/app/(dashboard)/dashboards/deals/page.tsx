'use client';

/* ───────────────────────────────────────────────────────────────
   3Boxes HRMS — Deals / CRM Dashboard
   SmartHR-style deals overview with stat cards, pipeline chart,
   revenue area chart, source pie chart, recent deals table,
   top performers panel, and quick-action shortcuts.
   ─────────────────────────────────────────────────────────────── */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiBriefcase,
  FiCheckCircle,
  FiXCircle,
  FiDollarSign,
  FiTarget,
  FiTrendingUp,
  FiRefreshCw,
  FiPlus,
  FiBarChart2,
  FiCloud,
  FiUsers,
  FiFileText,
  FiPercent,
  FiChevronRight,
  FiArrowUp,
  FiArrowDown,
  FiExternalLink,
} from 'react-icons/fi';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
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

const COLORS: Record<string, string> = {
  indigo: '#6366F1',
  emerald: '#10B981',
  rose: '#F43F5E',
  amber: '#F59E0B',
  violet: '#8B5CF6',
  cyan: '#06B6D4',
};

const PIE_COLORS = [
  COLORS.indigo,
  COLORS.emerald,
  COLORS.amber,
  COLORS.rose,
  COLORS.cyan,
  COLORS.violet,
];

function formatINR(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)} L`;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatShortINR(value: number): string {
  if (value >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/* ─────────────── demo data ─────────────── */

const DEMO_STATS = [
  {
    key: 'totalDeals',
    label: 'Total Deals',
    value: 156,
    trend: 12.4,
    sub: 'vs last quarter',
    icon: FiBriefcase,
    colorKey: 'indigo' as const,
  },
  {
    key: 'wonDeals',
    label: 'Won Deals',
    value: 48,
    trend: 8.2,
    sub: 'vs last quarter',
    icon: FiCheckCircle,
    colorKey: 'emerald' as const,
  },
  {
    key: 'lostDeals',
    label: 'Lost Deals',
    value: 22,
    trend: -3.6,
    sub: 'vs last quarter',
    icon: FiXCircle,
    colorKey: 'rose' as const,
  },
  {
    key: 'pipelineValue',
    label: 'Pipeline Value ₹',
    value: 24500000,
    trend: 15.8,
    sub: 'active pipeline',
    icon: FiDollarSign,
    colorKey: 'amber' as const,
  },
  {
    key: 'winRate',
    label: 'Win Rate %',
    value: 68.6,
    trend: 4.1,
    sub: 'closing efficiency',
    icon: FiTarget,
    colorKey: 'violet' as const,
  },
  {
    key: 'avgDealSize',
    label: 'Avg Deal Size ₹',
    value: 510417,
    trend: 7.3,
    sub: 'per won deal',
    icon: FiTrendingUp,
    colorKey: 'cyan' as const,
  },
];

const DEMO_PIPELINE_DATA = [
  { stage: 'Prospecting', count: 32, fill: '#6366F1' },
  { stage: 'Qualification', count: 26, fill: '#818CF8' },
  { stage: 'Proposal', count: 18, fill: '#F59E0B' },
  { stage: 'Negotiation', count: 10, fill: '#F97316' },
  { stage: 'Closed Won', count: 48, fill: '#10B981' },
  { stage: 'Closed Lost', count: 22, fill: '#F43F5E' },
];

const DEMO_REVENUE_DATA = [
  { month: 'Oct', revenue: 3200000 },
  { month: 'Nov', revenue: 4100000 },
  { month: 'Dec', revenue: 3800000 },
  { month: 'Jan', revenue: 5200000 },
  { month: 'Feb', revenue: 4700000 },
  { month: 'Mar', revenue: 6100000 },
];

const DEMO_SOURCE_DATA = [
  { name: 'Referral', value: 35 },
  { name: 'Website', value: 25 },
  { name: 'LinkedIn', value: 18 },
  { name: 'Cold Call', value: 12 },
  { name: 'Event', value: 6 },
  { name: 'Partner', value: 4 },
];

const DEMO_RECENT_DEALS = [
  {
    name: 'Enterprise SaaS Platform',
    company: 'TechVista Solutions',
    value: 4200000,
    stage: 'Negotiation',
    probability: 85,
    owner: 'Arjun Mehta',
  },
  {
    name: 'Cloud Migration Project',
    company: 'DataCore Inc.',
    value: 2800000,
    stage: 'Proposal',
    probability: 60,
    owner: 'Sneha Iyer',
  },
  {
    name: 'HRMS Implementation',
    company: 'GreenLeaf Corp.',
    value: 1500000,
    stage: 'Closed Won',
    probability: 100,
    owner: 'Vikram Patel',
  },
  {
    name: 'Mobile App Development',
    company: 'UrbanEdge Retail',
    value: 950000,
    stage: 'Qualification',
    probability: 40,
    owner: 'Priya Sharma',
  },
  {
    name: 'Analytics Dashboard',
    company: 'FinScope Analytics',
    value: 1800000,
    stage: 'Prospecting',
    probability: 20,
    owner: 'Rahul Desai',
  },
  {
    name: 'ERP Integration',
    company: 'MaxiPro Industries',
    value: 3200000,
    stage: 'Closed Lost',
    probability: 0,
    owner: 'Arjun Mehta',
  },
];

const DEMO_TOP_PERFORMERS = [
  { name: 'Arjun Mehta', dealsWon: 14, revenue: 12400000, winRate: 78, avatar: 'AM' },
  { name: 'Sneha Iyer', dealsWon: 11, revenue: 9800000, winRate: 73, avatar: 'SI' },
  { name: 'Vikram Patel', dealsWon: 9, revenue: 7200000, winRate: 69, avatar: 'VP' },
  { name: 'Priya Sharma', dealsWon: 8, revenue: 5600000, winRate: 62, avatar: 'PS' },
];

const DEMO_QUICK_ACTIONS = [
  { label: 'Create Deal', icon: FiPlus, color: COLORS.indigo, href: '/clients' },
  { label: 'Pipeline View', icon: FiBarChart2, color: COLORS.emerald, href: '/clients' },
  { label: 'Sales Forecast', icon: FiCloud, color: COLORS.violet, href: '/reports' },
  { label: 'Import Contacts', icon: FiUsers, color: COLORS.amber, href: '/clients' },
  { label: 'Generate Proposal', icon: FiFileText, color: COLORS.cyan, href: '/offers' },
  { label: 'Commission Report', icon: FiPercent, color: COLORS.rose, href: '/reports' },
];

/* ─────────────── types ─────────────── */

interface StatItem {
  key: string;
  label: string;
  value: number;
  trend: number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  colorKey: keyof typeof COLORS;
}

interface PipelineItem {
  stage: string;
  count: number;
  fill: string;
}

interface RevenueItem {
  month: string;
  revenue: number;
}

interface SourceItem {
  name: string;
  value: number;
}

interface RecentDeal {
  name: string;
  company: string;
  value: number;
  stage: string;
  probability: number;
  owner: string;
}

interface TopPerformer {
  name: string;
  dealsWon: number;
  revenue: number;
  winRate: number;
  avatar: string;
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
      {[...Array(6)].map((_, i) => (
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

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-900 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}:{' '}
          <span className="font-bold">
            {p.name.includes('revenue') || p.name.includes('Revenue')
              ? formatINR(p.value)
              : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

/* ─────────────── stage badge ─────────────── */

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    'Prospecting': { bg: 'bg-indigo-50', text: 'text-indigo-700' },
    'Qualification': { bg: 'bg-blue-50', text: 'text-blue-700' },
    'Proposal': { bg: 'bg-amber-50', text: 'text-amber-700' },
    'Negotiation': { bg: 'bg-orange-50', text: 'text-orange-700' },
    'Closed Won': { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    'Closed Lost': { bg: 'bg-rose-50', text: 'text-rose-700' },
  };
  const cls = map[stage] || { bg: 'bg-slate-50', text: 'text-slate-600' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls.bg} ${cls.text}`}
    >
      {stage}
    </span>
  );
}

/* ─────────────── probability bar ─────────────── */

function ProbabilityBar({ value }: { value: number }) {
  const barColor =
    value >= 75
      ? 'bg-emerald-500'
      : value >= 50
        ? 'bg-amber-500'
        : value >= 25
          ? 'bg-orange-400'
          : 'bg-rose-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[11px] text-slate-500 font-medium w-8 text-right">
        {value}%
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Deals Dashboard Page Component
   ═══════════════════════════════════════════════ */

export default function DealsDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { selectedCompany } = useCompanyContextStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<StatItem[]>(DEMO_STATS);
  const [pipelineData, setPipelineData] = useState<PipelineItem[]>(DEMO_PIPELINE_DATA);
  const [revenueData, setRevenueData] = useState<RevenueItem[]>(DEMO_REVENUE_DATA);
  const [sourceData, setSourceData] = useState<SourceItem[]>(DEMO_SOURCE_DATA);
  const [recentDeals, setRecentDeals] = useState<RecentDeal[]>(DEMO_RECENT_DEALS);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>(DEMO_TOP_PERFORMERS);
  const [quickActions] = useState<QuickAction[]>(DEMO_QUICK_ACTIONS);

  const companyName = selectedCompany?.name || user?.company?.name || '3Boxes Tech';

  /* ─── fetch data ─── */
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const headers = getAuthHeaders();
      const companyId = selectedCompany?.id;

      const dashRes = await fetch(
        `/api/dashboard${companyId ? `?companyId=${companyId}` : ''}`,
        { headers },
      );
      if (dashRes.ok) {
        const dashData = await dashRes.json();
        if (dashData?.deals) {
          const d = dashData.deals;
          setStats([
            {
              key: 'totalDeals',
              label: 'Total Deals',
              value: d.totalDeals ?? 156,
              trend: d.totalDealsTrend ?? 12.4,
              sub: 'vs last quarter',
              icon: FiBriefcase,
              colorKey: 'indigo',
            },
            {
              key: 'wonDeals',
              label: 'Won Deals',
              value: d.wonDeals ?? 48,
              trend: d.wonDealsTrend ?? 8.2,
              sub: 'vs last quarter',
              icon: FiCheckCircle,
              colorKey: 'emerald',
            },
            {
              key: 'lostDeals',
              label: 'Lost Deals',
              value: d.lostDeals ?? 22,
              trend: d.lostDealsTrend ?? -3.6,
              sub: 'vs last quarter',
              icon: FiXCircle,
              colorKey: 'rose',
            },
            {
              key: 'pipelineValue',
              label: 'Pipeline Value ₹',
              value: d.pipelineValue ?? 24500000,
              trend: d.pipelineValueTrend ?? 15.8,
              sub: 'active pipeline',
              icon: FiDollarSign,
              colorKey: 'amber',
            },
            {
              key: 'winRate',
              label: 'Win Rate %',
              value: d.winRate ?? 68.6,
              trend: d.winRateTrend ?? 4.1,
              sub: 'closing efficiency',
              icon: FiTarget,
              colorKey: 'violet',
            },
            {
              key: 'avgDealSize',
              label: 'Avg Deal Size ₹',
              value: d.avgDealSize ?? 510417,
              trend: d.avgDealSizeTrend ?? 7.3,
              sub: 'per won deal',
              icon: FiTrendingUp,
              colorKey: 'cyan',
            },
          ]);
          if (d.pipeline) setPipelineData(d.pipeline);
          if (d.revenue) setRevenueData(d.revenue);
          if (d.sources) setSourceData(d.sources);
          if (d.recentDeals) setRecentDeals(d.recentDeals);
          if (d.topPerformers) setTopPerformers(d.topPerformers);
        }
      }
    } catch {
      /* keep demo data */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCompany?.id]);

  useEffect(() => {
    const t = setTimeout(() => fetchData(), 300);
    return () => clearTimeout(t);
  }, [fetchData]);

  /* ─── current quarter label ─── */
  const currentQuarter = (() => {
    const m = new Date().getMonth();
    const q = Math.floor(m / 3) + 1;
    return `Q${q} ${new Date().getFullYear()}`;
  })();

  /* ═══════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* ───── Hero Section ───── */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#0F172A] via-[#1E3A5F] to-[#312E81] px-6 py-10 sm:px-8 sm:py-12">
        {/* Decorative blur circles */}
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Deals Dashboard
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-[11px] font-semibold text-white/90 border border-white/20">
                {currentQuarter}
              </span>
            </div>
            <p className="text-sm text-white/60">
              {companyName} &middot;{' '}
              <span className="font-medium text-white/80">3Boxes HRMS</span>
            </p>
          </div>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-sm font-medium text-white transition-all disabled:opacity-50"
          >
            <FiRefreshCw
              className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ───── Stat Cards (3×2 Grid) ───── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading
            ? [...Array(6)].map((_, i) => <StatSkeleton key={i} />)
            : stats.map((s) => {
                const Icon = s.icon;
                const color = COLORS[s.colorKey];
                const isPositive = s.trend >= 0;
                return (
                  <div
                    key={s.key}
                    className="thb-card thb-card-hover p-5 group transition-all duration-200 hover:shadow-lg"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${color}15` }}
                      >
                        <Icon className="w-5 h-5" style={{ color }} />
                      </div>
                      <div
                        className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}
                      >
                        {isPositive ? (
                          <FiArrowUp className="w-3 h-3" />
                        ) : (
                          <FiArrowDown className="w-3 h-3" />
                        )}
                        {Math.abs(s.trend)}%
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-900 mb-0.5">
                      {s.key === 'pipelineValue' || s.key === 'avgDealSize'
                        ? formatINR(s.value)
                        : s.key === 'winRate'
                          ? `${s.value}%`
                          : s.value.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.label}{' '}
                      <span className="text-slate-400">&middot; {s.sub}</span>
                    </p>
                  </div>
                );
              })}
        </div>

        {/* ───── Charts Row (2 Columns) ───── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Deal Pipeline — Horizontal BarChart */}
          {loading ? (
            <ChartSkeleton />
          ) : (
            <div className="thb-card thb-card-hover p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">
                Deal Pipeline
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={pipelineData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, bottom: 0, left: 90 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="stage"
                    type="category"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={85}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar
                    dataKey="count"
                    name="Deals"
                    radius={[0, 6, 6, 0]}
                    barSize={22}
                  >
                    {pipelineData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly Revenue — AreaChart */}
          {loading ? (
            <ChartSkeleton />
          ) : (
            <div className="thb-card thb-card-hover p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">
                Monthly Revenue (Won Deals)
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={revenueData}
                  margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                >
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={COLORS.indigo}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={COLORS.indigo}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f1f5f9"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatShortINR(v)}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={COLORS.indigo}
                    strokeWidth={2.5}
                    fill="url(#revenueGrad)"
                    dot={{ r: 4, fill: COLORS.indigo, stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: COLORS.indigo, stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ───── PieChart: Deals by Source ───── */}
        {loading ? (
          <ChartSkeleton height="h-72" />
        ) : (
          <div className="thb-card thb-card-hover p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">
              Deals by Source
            </h3>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-full md:w-1/2 flex justify-center">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={sourceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {sourceData.map((_, index) => (
                        <Cell
                          key={index}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const item = payload[0];
                        const total = sourceData.reduce(
                          (s, d) => s + d.value,
                          0,
                        );
                        const pct = ((item.value as number) / total * 100).toFixed(1);
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                            <p className="font-semibold text-slate-900 mb-1">
                              {item.name}
                            </p>
                            <p style={{ color: PIE_COLORS[sourceData.findIndex(d => d.name === item.name) % PIE_COLORS.length] }}>
                              {item.value} deals ({pct}%)
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full md:w-1/2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {sourceData.map((s, i) => {
                  const total = sourceData.reduce((a, b) => a + b.value, 0);
                  const pct = ((s.value / total) * 100).toFixed(1);
                  return (
                    <div
                      key={s.name}
                      className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{
                          backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">
                          {s.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {s.value} ({pct}%)
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ───── Recent Deals Table ───── */}
        {loading ? (
          <TableSkeleton />
        ) : (
          <div className="thb-card thb-card-hover p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">
                Recent Deals
              </h3>
              <button
                onClick={() => router.push('/clients')}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                View All <FiChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Deal Name
                    </th>
                    <th className="pb-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Company / Client
                    </th>
                    <th className="pb-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Value ₹
                    </th>
                    <th className="pb-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Stage
                    </th>
                    <th className="pb-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Probability
                    </th>
                    <th className="pb-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Owner
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentDeals.map((deal, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <span className="text-sm font-medium text-slate-800">
                          {deal.name}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-sm text-slate-500">
                          {deal.company}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-sm font-semibold text-slate-700">
                          {formatINR(deal.value)}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <StageBadge stage={deal.stage} />
                      </td>
                      <td className="py-3 pr-4 w-32">
                        <ProbabilityBar value={deal.probability} />
                      </td>
                      <td className="py-3">
                        <span className="text-sm text-slate-500">
                          {deal.owner}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ───── Bottom Row: Top Performers + Quick Actions ───── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Top Performers Panel */}
          {loading ? (
            <div className="lg:col-span-3">
              <ChartSkeleton height="h-auto" />
            </div>
          ) : (
            <div className="lg:col-span-3 thb-card thb-card-hover p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-800">
                  Top Performers
                </h3>
                <span className="text-[11px] text-slate-400">
                  This Quarter
                </span>
              </div>
              <div className="space-y-3">
                {topPerformers.map((p, i) => {
                  const rankBg =
                    i === 0
                      ? 'bg-amber-100 text-amber-700'
                      : i === 1
                        ? 'bg-slate-200 text-slate-600'
                        : i === 2
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-slate-100 text-slate-500';
                  return (
                    <div
                      key={p.name}
                      className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 transition-colors"
                    >
                      {/* Rank */}
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${rankBg}`}
                      >
                        {i + 1}
                      </span>
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-xs font-bold text-white">
                        {p.avatar}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {p.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {p.dealsWon} deals won &middot; Win rate{' '}
                          {p.winRate}%
                        </p>
                      </div>
                      {/* Revenue */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-800">
                          {formatINR(p.revenue)}
                        </p>
                        <p className="text-[11px] text-emerald-600 font-medium">
                          revenue
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="lg:col-span-2 thb-card thb-card-hover p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => router.push(action.href)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 hover:border-slate-200 transition-all group"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                      style={{ backgroundColor: `${action.color}15` }}
                    >
                      <Icon
                        className="w-5 h-5"
                        style={{ color: action.color }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-700 text-center leading-tight">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ───── Footer ───── */}
        <div className="text-center py-4">
          <p className="text-[11px] text-slate-400">
            Powered by{' '}
            <span className="font-semibold text-slate-500">3Boxes HRMS</span>{' '}
            &middot; Deals & CRM Module
          </p>
        </div>
      </div>
    </div>
  );
}
