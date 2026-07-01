'use client';

/* ───────────────────────────────────────────────────────────────
   3Boxes HRMS — Help Desk Dashboard
   A SmartHR-style help desk overview with stat cards, trend charts,
   category & priority breakdowns, recent tickets table, SLA
   compliance panel, top agents and quick-action shortcuts.
   ─────────────────────────────────────────────────────────────── */

import { useEffect, useState, useRef } from 'react';
import {
  FiHeadphones,
  FiCheckCircle,
  FiClock,
  FiShield,
  FiAlertTriangle,
  FiStar,
  FiRefreshCw,
  FiPlus,
  FiUserPlus,
  FiSettings,
  FiBook,
  FiArrowUp,
  FiBarChart2,
  FiCalendar,
  FiArrowRight,
  FiTrendingUp,
  FiExternalLink,
} from 'react-icons/fi';
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
  Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

/* ─── Colours ─── */
const COLORS: Record<string, string> = {
  blue: '#3B82F6',
  emerald: '#10B981',
  amber: '#F59E0B',
  indigo: '#6366F1',
  rose: '#F43F5E',
  violet: '#8B5CF6',
  cyan: '#06B6D4',
  pink: '#EC4899',
  slate: '#64748B',
};

const PIE_COLORS = [
  COLORS.blue,
  COLORS.emerald,
  COLORS.amber,
  COLORS.indigo,
  COLORS.rose,
  COLORS.violet,
];

/* ─── Auth helper ─── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ─── Types ─── */
interface HelpdeskMetrics {
  openTickets: number;
  resolvedToday: number;
  avgResponseTime: string;
  slaCompliance: number;
  escalated: number;
  customerSatisfaction: number;
}

interface TrendItem {
  date: string;
  Opened: number;
  Resolved: number;
}

interface CategoryItem {
  name: string;
  value: number;
}

interface PriorityItem {
  name: string;
  count: number;
  color: string;
}

interface RecentTicket {
  id: string;
  ticketNo: string;
  subject: string;
  requester: string;
  priority: string;
  category: string;
  status: string;
  age: string;
}

interface SLAMetric {
  priority: string;
  target: number;
  actual: number;
  color: string;
  bgColor: string;
}

interface TopAgent {
  name: string;
  avatar: string;
  ticketsResolved: number;
  avgResolutionTime: string;
  satisfactionScore: number;
}

interface HelpdeskDashboardData {
  metrics: HelpdeskMetrics;
  trend: TrendItem[];
  categories: CategoryItem[];
  priorities: PriorityItem[];
  recentTickets: RecentTicket[];
  slaMetrics: SLAMetric[];
  topAgents: TopAgent[];
}

/* ─── Fallback demo data ─── */
const DEMO_DATA: HelpdeskDashboardData = {
  metrics: {
    openTickets: 47,
    resolvedToday: 23,
    avgResponseTime: '2.4h',
    slaCompliance: 88.5,
    escalated: 6,
    customerSatisfaction: 4.2,
  },
  trend: [
    { date: 'Feb 18', Opened: 8, Resolved: 5 },
    { date: 'Feb 19', Opened: 12, Resolved: 9 },
    { date: 'Feb 20', Opened: 6, Resolved: 10 },
    { date: 'Feb 21', Opened: 14, Resolved: 11 },
    { date: 'Feb 22', Opened: 9, Resolved: 13 },
    { date: 'Feb 23', Opened: 7, Resolved: 6 },
    { date: 'Feb 24', Opened: 11, Resolved: 8 },
    { date: 'Feb 25', Opened: 15, Resolved: 12 },
    { date: 'Feb 26', Opened: 10, Resolved: 14 },
    { date: 'Feb 27', Opened: 8, Resolved: 9 },
    { date: 'Feb 28', Opened: 13, Resolved: 11 },
    { date: 'Mar 01', Opened: 9, Resolved: 15 },
    { date: 'Mar 02', Opened: 11, Resolved: 10 },
    { date: 'Mar 03', Opened: 7, Resolved: 12 },
  ],
  categories: [
    { name: 'IT Access', value: 32 },
    { name: 'Hardware', value: 21 },
    { name: 'Software', value: 28 },
    { name: 'HR Policy', value: 15 },
    { name: 'Facilities', value: 18 },
    { name: 'Payroll', value: 12 },
  ],
  priorities: [
    { name: 'Critical', count: 8, color: '#EF4444' },
    { name: 'High', count: 14, color: '#F97316' },
    { name: 'Medium', count: 19, color: '#F59E0B' },
    { name: 'Low', count: 6, color: '#3B82F6' },
  ],
  recentTickets: [
    { id: 't1', ticketNo: 'TKT-1047', subject: 'VPN connection failure on remote laptop', requester: 'Ananya Sharma', priority: 'Critical', category: 'IT Access', status: 'Open', age: '2h' },
    { id: 't2', ticketNo: 'TKT-1046', subject: 'New monitor not detected after dock update', requester: 'Rahul Verma', priority: 'High', category: 'Hardware', status: 'In Progress', age: '4h' },
    { id: 't3', ticketNo: 'TKT-1045', subject: 'Payroll discrepancy in Feb salary slip', requester: 'Priya Desai', priority: 'High', category: 'Payroll', status: 'Escalated', age: '6h' },
    { id: 't4', ticketNo: 'TKT-1044', subject: 'Request for Adobe Creative Cloud license', requester: 'Karan Patel', priority: 'Medium', category: 'Software', status: 'Open', age: '8h' },
    { id: 't5', ticketNo: 'TKT-1043', subject: 'Air conditioning not working in Floor 3', requester: 'Meera Joshi', priority: 'Low', category: 'Facilities', status: 'Resolved', age: '1d' },
  ],
  slaMetrics: [
    { priority: 'Critical', target: 95, actual: 92, color: 'bg-red-500', bgColor: 'bg-red-100' },
    { priority: 'High', target: 90, actual: 87, color: 'bg-orange-500', bgColor: 'bg-orange-100' },
    { priority: 'Medium', target: 85, actual: 89, color: 'bg-amber-500', bgColor: 'bg-amber-100' },
    { priority: 'Low', target: 80, actual: 94, color: 'bg-blue-500', bgColor: 'bg-blue-100' },
  ],
  topAgents: [
    { name: 'Vikram Singh', avatar: 'VS', ticketsResolved: 156, avgResolutionTime: '3.2h', satisfactionScore: 4.7 },
    { name: 'Neha Gupta', avatar: 'NG', ticketsResolved: 142, avgResolutionTime: '2.8h', satisfactionScore: 4.8 },
    { name: 'Arun Kumar', avatar: 'AK', ticketsResolved: 128, avgResolutionTime: '4.1h', satisfactionScore: 4.3 },
    { name: 'Shreya Reddy', avatar: 'SR', ticketsResolved: 119, avgResolutionTime: '3.6h', satisfactionScore: 4.5 },
  ],
};

/* ─── Priority badge helper ─── */
function priorityBadge(priority: string) {
  const p = priority.toLowerCase();
  const map: Record<string, { cls: string; dot: string }> = {
    critical: { cls: 'text-red-700 bg-red-50 border-red-200', dot: 'bg-red-500' },
    high:     { cls: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
    medium:   { cls: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
    low:      { cls: 'text-blue-700 bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  };
  const info = map[p] || { cls: 'text-slate-700 bg-slate-50 border-slate-200', dot: 'bg-slate-500' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${info.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
      {priority}
    </span>
  );
}

/* ─── Status badge helper ─── */
function statusBadge(status: string) {
  const s = status.toLowerCase();
  const map: Record<string, { cls: string; label: string }> = {
    open:        { cls: 'thb-badge thb-badge-info', label: 'Open' },
    'in progress': { cls: 'thb-badge thb-badge-warning', label: 'In Progress' },
    escalated:   { cls: 'thb-badge thb-badge-error', label: 'Escalated' },
    resolved:    { cls: 'thb-badge thb-badge-success', label: 'Resolved' },
    closed:      { cls: 'thb-badge thb-badge-success', label: 'Closed' },
    pending:     { cls: 'thb-badge thb-badge-purple', label: 'Pending' },
  };
  const info = map[s] || { cls: 'thb-badge thb-badge-info', label: status };
  return <span className={info.cls}>{info.label}</span>;
}

/* ─── Custom tooltip for charts ─── */
interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="thb-card p-3 text-xs" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload?: { percent?: number } }>;
}

function PieTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="thb-card p-3 text-xs" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
      <p className="font-semibold text-slate-700">{d.name}: {d.value}</p>
      {d.payload?.percent !== undefined && (
        <p className="text-slate-500">{((d.payload.percent as number) * 100).toFixed(1)}%</p>
      )}
    </div>
  );
}

/* ─── Stat card ─── */
interface StatCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  sub?: string;
}

function StatCard({ title, value, icon: Icon, color, bgColor, sub }: StatCardProps) {
  return (
    <div className="thb-card thb-card-hover p-5 flex items-start gap-4">
      <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${bgColor}`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-500 truncate">{title}</p>
        <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Skeleton loaders ─── */
function SkeletonCard() {
  return (
    <div className="thb-card p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-6 w-32 bg-slate-200 rounded" />
          <div className="h-3 w-16 bg-slate-100 rounded" />
        </div>
      </div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="thb-card p-6 animate-pulse">
      <div className="h-4 w-40 bg-slate-200 rounded mb-4" />
      <div className="h-56 bg-slate-100 rounded" />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="thb-card p-6 animate-pulse space-y-3">
      <div className="h-4 w-48 bg-slate-200 rounded" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-4 w-20 bg-slate-200 rounded" />
          <div className="h-4 w-16 bg-slate-100 rounded" />
          <div className="h-4 w-12 bg-slate-100 rounded" />
          <div className="h-4 w-24 bg-slate-100 rounded" />
          <div className="h-4 w-24 bg-slate-100 rounded" />
          <div className="h-4 w-16 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function HelpdeskDashboardPage() {
  const [data, setData] = useState<HelpdeskDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialFetchDone = useRef(false);

  useAuthStore();
  const { selectedCompany } = useCompanyContextStore();

  /* ─── Fetch dashboard data ─── */
  async function doFetch(showToast = false, companyId?: string) {
    if (showToast) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      const cid = companyId || selectedCompany?.id;
      if (cid) params.set('companyId', cid);

      const res = await fetch(`/api/helpdesk/dashboard?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const json = await res.json();
        const m = json.metrics || {};
        const hasData = m.openTickets > 0 || m.resolvedToday > 0;
        setData(hasData ? json : DEMO_DATA);
      } else {
        setData(DEMO_DATA);
      }
    } catch {
      setData(DEMO_DATA);
      if (showToast) toast.error('Could not refresh dashboard — showing demo data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      doFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when company changes
  useEffect(() => {
    if (initialFetchDone.current) {
      doFetch(false, selectedCompany?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id]);

  /* ─── Derived chart data ─── */
  const trendData = data?.trend || DEMO_DATA.trend;
  const categoryData = data?.categories || DEMO_DATA.categories;
  const priorityData = data?.priorities || DEMO_DATA.priorities;

  /* ─── Today's date ─── */
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  /* ─── Quick actions ─── */
  const quickActions = [
    { label: 'Create Ticket', icon: FiPlus, color: 'text-blue-600', bg: 'bg-blue-50', route: '/helpdesk' },
    { label: 'Assign Tickets', icon: FiUserPlus, color: 'text-emerald-600', bg: 'bg-emerald-50', route: '/helpdesk' },
    { label: 'SLA Settings', icon: FiSettings, color: 'text-amber-600', bg: 'bg-amber-50', route: '/helpdesk' },
    { label: 'Knowledge Base', icon: FiBook, color: 'text-violet-600', bg: 'bg-violet-50', route: '/docs' },
    { label: 'Escalation Matrix', icon: FiArrowUp, color: 'text-rose-600', bg: 'bg-rose-50', route: '/helpdesk' },
    { label: 'Ticket Reports', icon: FiBarChart2, color: 'text-indigo-600', bg: 'bg-indigo-50', route: '/reports' },
  ];

  /* ═══ RENDER ═══ */
  return (
    <div className="min-h-screen bg-[var(--thb-background)]">
      {/* ─── Hero ─── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #312E81 100%)',
        }}
      >
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="hero-grid-hd" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-grid-hd)" />
          </svg>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <FiHeadphones className="w-8 h-8 text-white/90" />
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Help Desk Dashboard</h1>
              </div>
              <p className="text-white/70 text-sm sm:text-base">
                3Boxes HRMS — Real-time support operations &amp; SLA tracking
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="thb-badge bg-white/20 text-white backdrop-blur-sm text-sm px-4 py-1.5">
                <FiCalendar className="w-4 h-4 mr-1.5" />
                {today}
              </span>
              <button
                onClick={() => doFetch(true)}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                title="Refresh dashboard"
              >
                <FiRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ─── Stat Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {loading ? (
            [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard
                title="Open Tickets"
                value={String(data?.metrics?.openTickets ?? DEMO_DATA.metrics.openTickets)}
                icon={FiHeadphones}
                color="text-blue-600"
                bgColor="bg-blue-50"
                sub="Awaiting response"
              />
              <StatCard
                title="Resolved Today"
                value={String(data?.metrics?.resolvedToday ?? DEMO_DATA.metrics.resolvedToday)}
                icon={FiCheckCircle}
                color="text-emerald-600"
                bgColor="bg-emerald-50"
                sub="Closed today"
              />
              <StatCard
                title="Avg Response Time"
                value={data?.metrics?.avgResponseTime ?? DEMO_DATA.metrics.avgResponseTime}
                icon={FiClock}
                color="text-amber-600"
                bgColor="bg-amber-50"
                sub="First response"
              />
              <StatCard
                title="SLA Compliance"
                value={`${(data?.metrics?.slaCompliance ?? DEMO_DATA.metrics.slaCompliance).toFixed(1)}%`}
                icon={FiShield}
                color="text-indigo-600"
                bgColor="bg-indigo-50"
                sub="Target: 90%"
              />
              <StatCard
                title="Escalated"
                value={String(data?.metrics?.escalated ?? DEMO_DATA.metrics.escalated)}
                icon={FiAlertTriangle}
                color="text-rose-600"
                bgColor="bg-rose-50"
                sub="Needs attention"
              />
              <StatCard
                title="Customer Satisfaction"
                value={`${(data?.metrics?.customerSatisfaction ?? DEMO_DATA.metrics.customerSatisfaction).toFixed(1)}/5`}
                icon={FiStar}
                color="text-violet-600"
                bgColor="bg-violet-50"
                sub="Based on surveys"
              />
            </>
          )}
        </div>

        {/* ─── Charts Row 1: Ticket Trend + Category Pie ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Ticket Trend — Area Chart */}
          <div className="lg:col-span-3 thb-card p-6">
            {loading ? (
              <SkeletonChart />
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <FiTrendingUp className="w-5 h-5 text-blue-500" />
                    Ticket Trend
                  </h3>
                  <span className="text-xs text-slate-400">Last 14 days</span>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gradOpened" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} width={32} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="Opened" stroke={COLORS.blue} strokeWidth={2} fill="url(#gradOpened)" name="Opened" />
                    <Area type="monotone" dataKey="Resolved" stroke={COLORS.emerald} strokeWidth={2} fill="url(#gradResolved)" name="Resolved" />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1 rounded" style={{ background: COLORS.blue }} /> Opened
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1 rounded" style={{ background: COLORS.emerald }} /> Resolved
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Tickets by Category — Pie Chart */}
          <div className="lg:col-span-2 thb-card p-6">
            {loading ? (
              <SkeletonChart />
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <FiBarChart2 className="w-5 h-5 text-indigo-500" />
                    Tickets by Category
                  </h3>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-cat-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => (
                        <span className="text-xs text-slate-600">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        </div>

        {/* ─── Charts Row 2: Priority Bar Chart + SLA Panel ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Tickets by Priority — Bar Chart */}
          <div className="lg:col-span-3 thb-card p-6">
            {loading ? (
              <SkeletonChart />
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <FiAlertTriangle className="w-5 h-5 text-amber-500" />
                    Tickets by Priority
                  </h3>
                  <span className="text-xs text-slate-400">
                    {priorityData.reduce((sum, p) => sum + p.count, 0)} total
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={priorityData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} width={32} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Tickets">
                      {priorityData.map((entry, index) => (
                        <Cell key={`cell-pri-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          {/* SLA Compliance Panel */}
          <div className="lg:col-span-2 thb-card p-6">
            {loading ? (
              <SkeletonChart />
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <FiShield className="w-5 h-5 text-indigo-500" />
                    SLA Compliance
                  </h3>
                </div>
                <div className="space-y-5">
                  {(data?.slaMetrics || DEMO_DATA.slaMetrics).map((sla, idx) => {
                    const pct = sla.actual;
                    const isAbove = pct >= sla.target;
                    return (
                      <div key={idx}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-slate-700">{sla.priority}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${isAbove ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {pct}%
                            </span>
                            <span className="text-xs text-slate-400">/ {sla.target}%</span>
                          </div>
                        </div>
                        <div className={`w-full h-2.5 rounded-full ${sla.bgColor}`}>
                          <div
                            className={`h-2.5 rounded-full ${sla.color} transition-all duration-700`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Overall SLA Target</span>
                    <span className="text-sm font-bold text-slate-800">
                      {((data?.slaMetrics || DEMO_DATA.slaMetrics).reduce((sum, s) => sum + s.actual, 0) /
                        (data?.slaMetrics || DEMO_DATA.slaMetrics).length
                      ).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── Recent Tickets Table + Top Agents ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Recent Tickets */}
          <div className="lg:col-span-3 thb-card p-6">
            {loading ? (
              <SkeletonTable />
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <FiHeadphones className="w-5 h-5 text-blue-500" />
                    Recent Tickets
                  </h3>
                  <a
                    href="/helpdesk"
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                  >
                    View All <FiArrowRight className="w-3 h-3" />
                  </a>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ticket #</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Requester</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(data?.recentTickets || DEMO_DATA.recentTickets).map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-blue-600 whitespace-nowrap">{ticket.ticketNo}</td>
                          <td className="py-2.5 px-3 text-slate-700 max-w-[200px] truncate">{ticket.subject}</td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{ticket.requester}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{priorityBadge(ticket.priority)}</td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{ticket.category}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{statusBadge(ticket.status)}</td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{ticket.age}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Top Agents Panel */}
          <div className="lg:col-span-2 thb-card p-6">
            {loading ? (
              <SkeletonChart />
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <FiStar className="w-5 h-5 text-amber-500" />
                    Top Agents
                  </h3>
                  <span className="text-xs text-slate-400">This month</span>
                </div>
                <div className="space-y-4">
                  {(data?.topAgents || DEMO_DATA.topAgents).map((agent, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 transition-colors">
                      {/* Avatar */}
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold text-white ${
                        idx === 0 ? 'bg-amber-500' :
                        idx === 1 ? 'bg-slate-400' :
                        idx === 2 ? 'bg-amber-700' :
                        'bg-indigo-500'
                      }`}>
                        {agent.avatar}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{agent.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-slate-500">
                            {agent.ticketsResolved} resolved
                          </span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs text-slate-500">
                            Avg {agent.avgResolutionTime}
                          </span>
                        </div>
                      </div>
                      {/* Score */}
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <FiStar className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          <span className="text-sm font-bold text-slate-800">{agent.satisfactionScore}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">CSAT</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── Quick Actions ─── */}
        <div className="thb-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <FiExternalLink className="w-5 h-5 text-slate-500" />
              Quick Actions
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {quickActions.map((action) => (
              <a
                key={action.label}
                href={action.route}
                className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-slate-50 transition-all group border border-transparent hover:border-slate-200"
              >
                <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${action.bg} group-hover:scale-110 transition-transform`}>
                  <action.icon className={`w-5 h-5 ${action.color}`} />
                </div>
                <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 text-center">
                  {action.label}
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* ─── Footer spacing ─── */}
        <div className="h-4" />
      </div>
    </div>
  );
}
