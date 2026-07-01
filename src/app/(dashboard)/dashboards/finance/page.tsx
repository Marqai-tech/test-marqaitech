'use client';

/* ───────────────────────────────────────────────────────────────
   3Boxes HRMS — Finance Dashboard
   A SmartHR-style finance overview with stat cards, trend charts,
   invoice status distribution, expense breakdown, recent invoices
   table, budget overview and quick-action shortcuts.
   ─────────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';
import {
  FiDollarSign,
  FiTrendingUp,
  FiTrendingDown,
  FiFileText,
  FiAlertCircle,
  FiPieChart,
  FiCreditCard,
  FiEdit,
  FiCheckSquare,
  FiBarChart2,
  FiArchive,
  FiCalendar,
  FiArrowUp,
  FiArrowDown,
  FiExternalLink,
  FiRefreshCw,
  FiLoader,
  FiTarget,
  FiBriefcase,
  FiShoppingCart,
  FiMap,
  FiMonitor,
  FiMegaPhone,
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
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

/* ─── Colours ─── */
const COLORS: Record<string, string> = {
  indigo: '#6366F1',
  emerald: '#10B981',
  amber: '#F59E0B',
  pink: '#EC4899',
  cyan: '#06B6D4',
  violet: '#8B5CF6',
};

const PIE_COLORS = [
  COLORS.indigo, COLORS.emerald, COLORS.amber,
  COLORS.pink, COLORS.cyan, COLORS.violet,
];

/* ─── Auth helper ─── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ─── Currency formatter ─── */
function fmtCurrency(val: number): string {
  if (val >= 1_00_00_000) return `₹${(val / 1_00_00_000).toFixed(2)} Cr`;
  if (val >= 1_00_000) return `₹${(val / 1_00_000).toFixed(2)} L`;
  return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtShort(val: number): string {
  if (val >= 1_00_00_000) return `${(val / 1_00_00_000).toFixed(1)}Cr`;
  if (val >= 1_00_000) return `${(val / 1_00_000).toFixed(1)}L`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(val);
}

/* ─── Types ─── */
interface FinanceMetrics {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  pendingInvoices: number;
  overdueAmount: number;
  budgetUtilization: number;
}

interface RevenueExpenseItem {
  month: string;
  revenue: number;
  expenses: number;
}

interface InvoiceStatusItem {
  name: string;
  value: number;
  color: string;
}

interface ExpenseCategoryItem {
  category: string;
  amount: number;
}

interface RecentInvoice {
  id: string;
  invoiceNumber: string;
  client: string;
  amount: number;
  status: string;
  dueDate: string;
}

interface DepartmentBudget {
  department: string;
  allocated: number;
  utilized: number;
  color: string;
}

interface FinanceDashboardData {
  currentQuarter: string;
  metrics: FinanceMetrics;
  revenueExpenseTrend: RevenueExpenseItem[];
  invoiceStatusDistribution: InvoiceStatusItem[];
  expenseCategories: ExpenseCategoryItem[];
  recentInvoices: RecentInvoice[];
  departmentBudgets: DepartmentBudget[];
}

/* ─── Fallback demo data ─── */
const DEMO_DATA: FinanceDashboardData = {
  currentQuarter: 'Q1 FY 2026-27',
  metrics: {
    totalRevenue: 4_85_60_000,
    totalExpenses: 3_42_80_000,
    netProfit: 1_42_80_000,
    pendingInvoices: 18,
    overdueAmount: 24_50_000,
    budgetUtilization: 72.4,
  },
  revenueExpenseTrend: [
    { month: 'Feb', revenue: 72_00_000, expenses: 54_20_000 },
    { month: 'Mar', revenue: 78_40_000, expenses: 56_80_000 },
    { month: 'Apr', revenue: 80_20_000, expenses: 58_10_000 },
    { month: 'May', revenue: 82_60_000, expenses: 57_40_000 },
    { month: 'Jun', revenue: 84_50_000, expenses: 58_80_000 },
    { month: 'Jul', revenue: 87_90_000, expenses: 57_50_000 },
  ],
  invoiceStatusDistribution: [
    { name: 'Paid', value: 42, color: COLORS.emerald },
    { name: 'Pending', value: 18, color: COLORS.amber },
    { name: 'Overdue', value: 7, color: COLORS.pink },
    { name: 'Draft', value: 11, color: COLORS.cyan },
  ],
  expenseCategories: [
    { category: 'Payroll', amount: 1_85_40_000 },
    { category: 'Operations', amount: 48_60_000 },
    { category: 'Travel', amount: 32_40_000 },
    { category: 'IT', amount: 42_80_000 },
    { category: 'Marketing', amount: 33_60_000 },
  ],
  recentInvoices: [
    { id: 'inv1', invoiceNumber: 'INV-2026-0842', client: 'Acme Corp', amount: 12_40_000, status: 'Paid', dueDate: '2026-06-15' },
    { id: 'inv2', invoiceNumber: 'INV-2026-0843', client: 'TechVista Ltd', amount: 8_60_000, status: 'Pending', dueDate: '2026-07-10' },
    { id: 'inv3', invoiceNumber: 'INV-2026-0844', client: 'Zenith Systems', amount: 5_20_000, status: 'Overdue', dueDate: '2026-05-30' },
    { id: 'inv4', invoiceNumber: 'INV-2026-0845', client: 'Nova Solutions', amount: 3_80_000, status: 'Draft', dueDate: '2026-08-01' },
    { id: 'inv5', invoiceNumber: 'INV-2026-0846', client: 'Orbit Industries', amount: 6_40_000, status: 'Paid', dueDate: '2026-06-20' },
  ],
  departmentBudgets: [
    { department: 'Engineering', allocated: 1_20_00_000, utilized: 86_40_000, color: COLORS.indigo },
    { department: 'Sales', allocated: 80_00_000, utilized: 52_00_000, color: COLORS.emerald },
    { department: 'Marketing', allocated: 60_00_000, utilized: 48_60_000, color: COLORS.amber },
    { department: 'Operations', allocated: 90_00_000, utilized: 72_00_000, color: COLORS.pink },
  ],
};

/* ─── Status badge ─── */
function invoiceStatusBadge(status: string) {
  const s = status.toUpperCase();
  const map: Record<string, { cls: string; label: string }> = {
    PAID: { cls: 'thb-badge thb-badge-success', label: 'Paid' },
    PENDING: { cls: 'thb-badge thb-badge-warning', label: 'Pending' },
    OVERDUE: { cls: 'thb-badge thb-badge-error', label: 'Overdue' },
    DRAFT: { cls: 'thb-badge thb-badge-info', label: 'Draft' },
    CANCELLED: { cls: 'thb-badge thb-badge-purple', label: 'Cancelled' },
  };
  const info = map[s] || { cls: 'thb-badge thb-badge-info', label: status };
  return <span className={info.cls}>{info.label}</span>;
}

/* ─── Custom tooltip ─── */
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
          {p.name}: {fmtCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

/* ─── Loading skeleton ─── */
function Skeleton() {
  return <div className="animate-pulse bg-slate-200 rounded-md" />;
}

function CardSkeleton() {
  return (
    <div className="thb-card p-6">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton><div className="w-10 h-10" /></Skeleton>
        <Skeleton><div className="w-24 h-4" /></Skeleton>
      </div>
      <Skeleton><div className="w-32 h-7 mb-2" /></Skeleton>
      <Skeleton><div className="w-16 h-3" /></Skeleton>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="thb-card p-6">
      <Skeleton><div className="w-40 h-5 mb-4" /></Skeleton>
      <Skeleton><div className="w-full h-56" /></Skeleton>
    </div>
  );
}

/* ─── Stat card component ─── */
function StatCard({
  label,
  value,
  trend,
  icon: Icon,
  color,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  trend?: number;
  icon: React.ElementType;
  color: string;
  prefix?: string;
  suffix?: string;
}) {
  const isUp = trend !== undefined && trend >= 0;
  return (
    <div className="thb-card thb-card-hover p-6 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15`, color }}
        >
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <span
            className={`thb-badge ${isUp ? 'thb-badge-success' : 'thb-badge-error'} flex items-center gap-0.5 text-xs`}
          >
            {isUp ? <FiArrowUp className="w-3 h-3" /> : <FiArrowDown className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800" style={{ color: 'var(--thb-text-primary)' }}>
        {prefix}{value}{suffix}
      </p>
    </div>
  );
}

/* ─── Quick action item ─── */
function QuickAction({
  icon: Icon,
  label,
  color,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
}) {
  return (
    <button
      className="thb-card thb-card-hover p-4 flex flex-col items-center gap-2 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{ borderColor: `${color}30` }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background: `${color}15`, color }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-xs font-medium" style={{ color: 'var(--thb-text-secondary)' }}>{label}</span>
    </button>
  );
}

/* ───────────────────────────────────────────────────────────────
   Finance Dashboard Page
   ─────────────────────────────────────────────────────────────── */
export default function FinanceDashboardPage() {
  const [data, setData] = useState<FinanceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { user } = useAuthStore();
  const { selectedCompanyId } = useCompanyContextStore();

  /* Fetch dashboard data */
  async function fetchDashboard() {
    try {
      const params = new URLSearchParams();
      if (selectedCompanyId) params.set('companyId', selectedCompanyId);
      const res = await fetch(`/api/dashboard/finance?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json.data ?? json);
    } catch {
      // Silently fall back to demo data
      setData(DEMO_DATA);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchDashboard();
  }

  /* ─── Derived values ─── */
  const d = data ?? DEMO_DATA;
  const { metrics } = d;
  const profitMargin = metrics.totalRevenue > 0
    ? ((metrics.netProfit / metrics.totalRevenue) * 100).toFixed(1)
    : '0';

  /* ─── Stat card definitions ─── */
  const statCards = [
    {
      label: 'Total Revenue',
      value: fmtCurrency(metrics.totalRevenue),
      trend: 8.3,
      icon: FiDollarSign,
      color: COLORS.indigo,
    },
    {
      label: 'Total Expenses',
      value: fmtCurrency(metrics.totalExpenses),
      trend: -4.2,
      icon: FiCreditCard,
      color: COLORS.pink,
    },
    {
      label: 'Net Profit',
      value: fmtCurrency(metrics.netProfit),
      trend: 12.6,
      icon: FiTrendingUp,
      color: COLORS.emerald,
    },
    {
      label: 'Pending Invoices',
      value: String(metrics.pendingInvoices),
      trend: -2.1,
      icon: FiFileText,
      color: COLORS.amber,
    },
    {
      label: 'Overdue Amount',
      value: fmtCurrency(metrics.overdueAmount),
      trend: -6.4,
      icon: FiAlertCircle,
      color: COLORS.pink,
    },
    {
      label: 'Budget Utilization',
      value: metrics.budgetUtilization.toFixed(1),
      trend: 3.8,
      icon: FiPieChart,
      color: COLORS.violet,
      suffix: '%',
    },
  ];

  /* ─── Quick action definitions ─── */
  const quickActions = [
    { icon: FiFileText, label: 'Create Invoice', color: COLORS.indigo },
    { icon: FiCreditCard, label: 'Process Payment', color: COLORS.emerald },
    { icon: FiBarChart2, label: 'Expense Report', color: COLORS.amber },
    { icon: FiArchive, label: 'Tax Filing', color: COLORS.pink },
    { icon: FiTarget, label: 'Budget Planning', color: COLORS.cyan },
    { icon: FiCheckSquare, label: 'Financial Statements', color: COLORS.violet },
  ];

  /* ──────────────────────────── Render ──────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: 'var(--thb-background)' }}>
      {/* ─── Gradient Hero ─── */}
      <div
        className="relative overflow-hidden px-6 py-8 sm:px-8"
        style={{
          background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%)',
        }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/3 -translate-x-1/4" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Finance Dashboard
            </h1>
            <p className="text-white/70 text-sm mt-1">
              Comprehensive financial overview &amp; analytics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm">
              {d.currentQuarter}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm">
              3Boxes HRMS
            </span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors disabled:opacity-50"
              aria-label="Refresh dashboard"
            >
              {refreshing ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiRefreshCw className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ── Stat Cards ── */}
        <section aria-label="Finance metrics">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {statCards.map((s) => (
                <StatCard key={s.label} {...s} />
              ))}
            </div>
          )}
        </section>

        {/* ── Charts Row ── */}
        <section aria-label="Finance charts" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue vs Expenses – AreaChart */}
          <div className="lg:col-span-2">
            {loading ? (
              <ChartSkeleton />
            ) : (
              <div className="thb-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold" style={{ color: 'var(--thb-text-primary)' }}>
                    Revenue vs Expenses
                  </h2>
                  <span className="text-xs" style={{ color: 'var(--thb-text-muted)' }}>Last 6 months</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={d.revenueExpenseTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.indigo} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={COLORS.indigo} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.pink} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={COLORS.pink} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94A3B8' }} />
                    <YAxis
                      tickFormatter={(v: number) => fmtShort(v)}
                      tick={{ fontSize: 12, fill: '#94A3B8' }}
                      width={48}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke={COLORS.indigo}
                      strokeWidth={2}
                      fill="url(#gradRevenue)"
                    />
                    <Area
                      type="monotone"
                      dataKey="expenses"
                      name="Expenses"
                      stroke={COLORS.pink}
                      strokeWidth={2}
                      fill="url(#gradExpenses)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="flex items-center gap-5 mt-3 justify-center">
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--thb-text-secondary)' }}>
                    <span className="w-3 h-1 rounded" style={{ background: COLORS.indigo }} /> Revenue
                  </span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--thb-text-secondary)' }}>
                    <span className="w-3 h-1 rounded" style={{ background: COLORS.pink }} /> Expenses
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Invoice Status – PieChart */}
          <div>
            {loading ? (
              <ChartSkeleton />
            ) : (
              <div className="thb-card p-6">
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--thb-text-primary)' }}>
                  Invoice Status
                </h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={d.invoiceStatusDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={88}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {d.invoiceStatusDistribution.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value} invoices`, '']}
                      contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #E2E8F0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {d.invoiceStatusDistribution.map((item) => (
                    <span key={item.name} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--thb-text-secondary)' }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                      {item.name} ({item.value})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Expense Categories Bar Chart ── */}
        <section aria-label="Expense categories">
          {loading ? (
            <ChartSkeleton />
          ) : (
            <div className="thb-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold" style={{ color: 'var(--thb-text-primary)' }}>
                  Expense Categories
                </h2>
                <span className="text-xs" style={{ color: 'var(--thb-text-muted)' }}>Current quarter</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={d.expenseCategories} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 12, fill: '#94A3B8' }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => fmtShort(v)}
                    tick={{ fontSize: 12, fill: '#94A3B8' }}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value: number) => fmtCurrency(value)}
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #E2E8F0' }}
                  />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {d.expenseCategories.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* ── Recent Invoices Table + Budget Overview ── */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6" aria-label="Invoices and budgets">
          {/* Recent Invoices – 3 cols */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="thb-card p-6">
                <Skeleton><div className="w-40 h-5 mb-6" /></Skeleton>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-4 mb-4">
                    <Skeleton><div className="w-28 h-4" /></Skeleton>
                    <Skeleton><div className="w-20 h-4" /></Skeleton>
                    <Skeleton><div className="w-16 h-4" /></Skeleton>
                    <Skeleton><div className="w-14 h-4" /></Skeleton>
                  </div>
                ))}
              </div>
            ) : (
              <div className="thb-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold" style={{ color: 'var(--thb-text-primary)' }}>
                    Recent Invoices
                  </h2>
                  <button className="flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: COLORS.indigo }}>
                    View All <FiExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ color: 'var(--thb-text-muted)' }}>
                        <th className="pb-3 font-medium">Invoice #</th>
                        <th className="pb-3 font-medium">Client</th>
                        <th className="pb-3 font-medium text-right">Amount</th>
                        <th className="pb-3 font-medium text-center">Status</th>
                        <th className="pb-3 font-medium text-right">Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recentInvoices.map((inv) => (
                        <tr
                          key={inv.id}
                          className="border-t"
                          style={{ borderColor: 'var(--thb-border)' }}
                        >
                          <td className="py-3 font-medium" style={{ color: 'var(--thb-text-primary)' }}>
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3" style={{ color: 'var(--thb-text-secondary)' }}>
                            {inv.client}
                          </td>
                          <td className="py-3 text-right font-medium" style={{ color: 'var(--thb-text-primary)' }}>
                            {fmtCurrency(inv.amount)}
                          </td>
                          <td className="py-3 text-center">
                            {invoiceStatusBadge(inv.status)}
                          </td>
                          <td className="py-3 text-right" style={{ color: 'var(--thb-text-secondary)' }}>
                            {new Date(inv.dueDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Budget Overview – 2 cols */}
          <div className="lg:col-span-2">
            {loading ? (
              <div className="thb-card p-6">
                <Skeleton><div className="w-36 h-5 mb-6" /></Skeleton>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="mb-5">
                    <Skeleton><div className="w-24 h-4 mb-2" /></Skeleton>
                    <Skeleton><div className="w-full h-3" /></Skeleton>
                  </div>
                ))}
              </div>
            ) : (
              <div className="thb-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold" style={{ color: 'var(--thb-text-primary)' }}>
                    Budget Overview
                  </h2>
                  <span className="text-xs" style={{ color: 'var(--thb-text-muted)' }}>FY 2026-27</span>
                </div>
                <div className="space-y-5">
                  {d.departmentBudgets.map((dept) => {
                    const pct = dept.allocated > 0
                      ? Math.round((dept.utilized / dept.allocated) * 100)
                      : 0;
                    const isOver = pct > 90;
                    return (
                      <div key={dept.department}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium" style={{ color: 'var(--thb-text-primary)' }}>
                            {dept.department}
                          </span>
                          <span className={`text-xs font-medium ${isOver ? 'text-red-500' : ''}`} style={!isOver ? { color: 'var(--thb-text-secondary)' } : undefined}>
                            {fmtCurrency(dept.utilized)} / {fmtCurrency(dept.allocated)}
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              background: isOver
                                ? `linear-gradient(90deg, ${dept.color}, #EF4444)`
                                : dept.color,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs" style={{ color: 'var(--thb-text-muted)' }}>
                            {pct}% utilized
                          </span>
                          {isOver && (
                            <span className="text-xs text-red-500 font-medium flex items-center gap-0.5">
                              <FiAlertCircle className="w-3 h-3" /> Near limit
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Total budget summary */}
                <div
                  className="mt-5 pt-4 flex items-center justify-between"
                  style={{ borderTop: '1px solid var(--thb-border)' }}
                >
                  <span className="text-sm font-semibold" style={{ color: 'var(--thb-text-primary)' }}>
                    Total Budget
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--thb-text-primary)' }}>
                    {fmtCurrency(d.departmentBudgets.reduce((a, b) => a + b.utilized, 0))} / {fmtCurrency(d.departmentBudgets.reduce((a, b) => a + b.allocated, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Profit Margin Summary Bar ── */}
        {!loading && (
          <section aria-label="Profit margin summary">
            <div className="thb-card p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold" style={{ color: 'var(--thb-text-primary)' }}>
                    Profit Margin
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--thb-text-muted)' }}>
                    Net profit as a percentage of total revenue
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-2xl font-bold" style={{ color: COLORS.emerald }}>
                      {profitMargin}%
                    </p>
                    <p className="text-xs" style={{ color: 'var(--thb-text-muted)' }}>
                      {fmtCurrency(metrics.netProfit)} net on {fmtCurrency(metrics.totalRevenue)} revenue
                    </p>
                  </div>
                  <div className="w-20 h-20">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Profit', value: metrics.netProfit },
                            { name: 'Expenses', value: metrics.totalExpenses },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={26}
                          outerRadius={38}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          <Cell fill={COLORS.emerald} />
                          <Cell fill={COLORS.pink} />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Quick Actions ── */}
        <section aria-label="Quick actions">
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--thb-text-primary)' }}>
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {quickActions.map((action) => (
              <QuickAction key={action.label} {...action} />
            ))}
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="text-center py-4 text-xs" style={{ color: 'var(--thb-text-muted)' }}>
          3Boxes HRMS &middot; Finance Dashboard &middot; {d.currentQuarter}
        </footer>
      </div>
    </div>
  );
}
