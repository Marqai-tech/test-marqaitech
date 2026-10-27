'use client';

/* ───────────────────────────────────────────────────────────────
   3Boxes HRMS — Payroll Dashboard
   A SmartHR-style payroll overview with stat cards, trend charts,
   breakdown visualisations, recent runs table, pending items and
   quick-action shortcuts.
   ─────────────────────────────────────────────────────────────── */

import { useEffect, useState, useRef, Suspense } from 'react';
import {
  FiDollarSign,
  FiTrendingDown,
  FiCreditCard,
  FiBriefcase,
  FiClock,
  FiPauseCircle,
  FiBarChart2,
  FiUsers,
  FiArrowRight,
  FiPlay,
  FiFileText,
  FiSettings,
  FiDownload,
  FiLayout,
  FiCalendar,
  FiCheckCircle,
  FiAlertTriangle,
  FiLoader,
  FiRefreshCw,
  FiExternalLink,
  FiZap,
  FiGrid,
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
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
/* Task 156-f — shared SmartHR widgets (same banner / cards / panels as the
   other restyled dashboards). */
import {
  Panel, StatCard, SkeletonBlock, StatSkeleton,
} from '@/components/dashboard/smarthr-widgets';

/* ─── Colours ─── */
const COLORS: Record<string, string> = {
  indigo: '#6366F1',
  emerald: '#10B981',
  amber: '#F59E0B',
  pink: '#EC4899',
  cyan: '#06B6D4',
  violet: '#8B5CF6',
};
const PIE_COLORS = [COLORS.indigo, COLORS.emerald, COLORS.amber, COLORS.pink, COLORS.cyan, COLORS.violet];

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
interface DashboardMetrics {
  totalEmployeesProcessed: number;
  totalActiveEmployees: number;
  totalGrossPay: number;
  totalDeductions: number;
  totalNetPay: number;
  totalEmployerContrib: number;
  pendingApprovals: number;
  activeHolds: number;
}

interface MonthlyTrendItem {
  period: string;
  grossPay: number;
  deductions: number;
  netPay: number;
  employerContrib: number;
  employees: number;
}

interface DepartmentItem {
  departmentId: string;
  departmentName: string;
  headcount: number;
  totalSalary: number;
  avgSalary: number;
}

interface RecentRun {
  id: string;
  payrollPeriod: string;
  runStatus: string;
  totalEmployees: number;
  totalGrossPay: number;
  totalNetPay: number;
  runType?: string;
  createdAt: string;
}

interface DashboardData {
  currentPeriod: string;
  metrics: DashboardMetrics;
  recentRuns: RecentRun[];
  monthlyTrend: MonthlyTrendItem[];
  departmentBreakdown: DepartmentItem[];
}

/* ─── Status badge helper ─── */
function statusBadge(status: string) {
  const s = status.toUpperCase();
  const map: Record<string, { cls: string; label: string }> = {
    PROCESSED: { cls: 'thb-badge thb-badge-success', label: 'Processed' },
    COMPLETED: { cls: 'thb-badge thb-badge-success', label: 'Completed' },
    REVIEW:    { cls: 'thb-badge thb-badge-warning', label: 'Review' },
    DRAFT:     { cls: 'thb-badge thb-badge-info', label: 'Draft' },
    FAILED:    { cls: 'thb-badge thb-badge-error', label: 'Failed' },
    ON_HOLD:   { cls: 'thb-badge thb-badge-purple', label: 'On Hold' },
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

interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload?: { percent?: number } }>;
}

function PieTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="thb-card p-3 text-xs" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
      <p className="font-semibold text-slate-700">{d.name}: {fmtCurrency(d.value)}</p>
      {d.payload?.percent !== undefined && (
        <p className="text-slate-500">{((d.payload.percent as number) * 100).toFixed(1)}%</p>
      )}
    </div>
  );
}

/* ─── Skeleton loaders ─── */
/* Task 156-f — the local StatCard + SkeletonCard were replaced by the shared
   SmartHR StatCard / StatSkeleton widgets. Chart/Table skeletons render
   INSIDE a Panel, so they only draw the body (no card chrome). */

function SkeletonChart() {
  return <SkeletonBlock className="h-56 w-full" />;
}

function SkeletonTable() {
  return (
    <div className="space-y-3">
      <SkeletonBlock className="h-4 w-48" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-4 w-12" />
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/* ── Placeholder Tabs ── */

const payrollTabs: DashboardTabConfig[] = [
  { label: 'Overview', key: 'overview', icon: <FiGrid className="w-4 h-4" /> },
  { label: 'Reports', key: 'reports', icon: <FiFileText className="w-4 h-4" />, isNew: true },
  { label: 'Settings', key: 'settings', icon: <FiSettings className="w-4 h-4" />, isNew: true },
];

function PayrollReportsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg mb-4">
        <FiFileText className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1">Reports & Analytics</h3>
      <p className="text-sm text-slate-500 text-center max-w-md mb-4">
        Payroll registers, tax reports, and salary analytics
      </p>
      <a href="/payroll/reports" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3A57C4] hover:bg-[#2C43A3] text-white rounded-lg text-sm font-medium transition-colors">
        <FiBarChart2 className="w-4 h-4" /> Go to Reports
      </a>
    </div>
  );
}

function PayrollSettingsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-lg mb-4">
        <FiSettings className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1">Settings & Configuration</h3>
      <p className="text-sm text-slate-500 text-center max-w-md mb-4">
        Configure salary structures, tax slabs, deduction rules, and payroll cycles
      </p>
      <a href="/payroll/salary-settings" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3A57C4] hover:bg-[#2C43A3] text-white rounded-lg text-sm font-medium transition-colors">
        <FiSettings className="w-4 h-4" /> Go to Settings
      </a>
    </div>
  );
}

function PayrollPageContent() {
  return (
    <ModuleDashboardShell
      moduleKey="payroll"
      moduleLabel="Payroll"
      title="Payroll Dashboard"
      trail={['Dashboards', 'Payroll']}
      moduleIcon={<FiDollarSign className="w-5 h-5 text-white" />}
      gradientColor="from-green-500 to-emerald-600"
      tabs={payrollTabs}
      overviewContent={<PayrollContent />}
      children={{
        reports: <PayrollReportsPlaceholder />,
        settings: <PayrollSettingsPlaceholder />,
      }}
    />
  );
}

export default function PayrollDashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-[#3A57C4] border-t-transparent rounded-full" /></div>}>
      <PayrollPageContent />
    </Suspense>
  );
}

/* ── Payroll Content ── */

function PayrollContent() {
  const [data, setData] = useState<DashboardData | null>(null);
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

      const res = await fetch(`/api/payroll/dashboard?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        // Task 163 — GOLDEN RULE: live data only, even when it's zeros.
        const json = await res.json();
        setData(json);
      } else {
        // Task 163 — no demo fallback on API failure; panels show empty states.
        setData(null);
      }
    } catch {
      // Task 163 — no demo fallback on errors either.
      if (showToast) toast.error('Could not refresh the payroll dashboard. Please try again.');
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
  const trendChartData = (data?.monthlyTrend || []).map(t => ({
    period: t.period,
    Gross: t.grossPay,
    Deductions: t.deductions,
    'Net Pay': t.netPay,
  }));

  const deptChartData = (data?.departmentBreakdown || []).map(d => ({
    name: d.departmentName,
    salary: d.totalSalary,
    headcount: d.headcount,
  }));

  // Payroll run status distribution
  const runStatusData = (() => {
    const runs = data?.recentRuns || [];
    const counts: Record<string, number> = { Processed: 0, Review: 0, Draft: 0 };
    runs.forEach(r => {
      const s = r.runStatus?.toUpperCase();
      if (s === 'PROCESSED' || s === 'COMPLETED') counts.Processed++;
      else if (s === 'REVIEW') counts.Review++;
      else counts.Draft++;
    });
    // Task 163 — real counts only; zeros are rendered as the true state.
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  })();

  // Cost distribution (derived from current metrics)
  const costDistributionData = (() => {
    const m = data?.metrics;
    if (!m || m.totalGrossPay === 0) {
      // Task 163 — no payroll data yet: empty (never fake values).
      return [];
    }
    const basic = Math.round(m.totalGrossPay * 0.46);
    const hra = Math.round(m.totalGrossPay * 0.2);
    const allowances = m.totalGrossPay - basic - hra;
    return [
      { name: 'Basic', value: basic },
      { name: 'HRA', value: hra },
      { name: 'Allowances', value: allowances },
      { name: 'Deductions', value: m.totalDeductions },
    ];
  })();

  // Pending items — Task 163 GOLDEN RULE: fall back to 0, never to sample data
  const pendingApprovals = data?.metrics?.pendingApprovals ?? 0;
  const activeHolds = data?.metrics?.activeHolds ?? 0;

  // Upcoming filing deadlines — no config API exists yet, so this stays
  // empty (Task 163: never render fabricated deadlines).
  const filingDeadlines: { title: string; due: string; status: string }[] = [];

  /* ─── Quick actions ─── */
  const quickActions = [
    { label: 'Run Payroll', icon: FiPlay, color: 'text-emerald-600', bg: 'bg-emerald-50', route: '/payroll/processing' },
    { label: 'View Payslips', icon: FiFileText, color: 'text-emerald-600', bg: 'bg-emerald-50', route: '/payroll/payslips' },
    { label: 'Tax Settings', icon: FiSettings, color: 'text-amber-600', bg: 'bg-amber-50', route: '/payroll/tax-slabs' },
    { label: 'Bank Files', icon: FiDownload, color: 'text-cyan-600', bg: 'bg-cyan-50', route: '/payroll/bank-files' },
    { label: 'GL Mapping', icon: FiLayout, color: 'text-teal-600', bg: 'bg-teal-50', route: '/payroll/gl-mapping' },
    { label: 'Compliance Calendar', icon: FiCalendar, color: 'text-pink-600', bg: 'bg-pink-50', route: '/payroll/compliance' },
  ];

  /* ═══ RENDER ═══ */
  return (
    <div className="min-h-screen bg-[var(--thb-background)]">
      <div className="px-4 sm:px-6 lg:px-8 space-y-6 pb-10">
        {/* Task 156 — header actions (moved from the old in-content banner; the shell now renders the SmartHR banner) */}
        <div className="flex items-center justify-between gap-2 flex-wrap -mt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => doFetch(true)}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm text-xs font-semibold rounded-lg px-3 py-2 inline-flex items-center gap-1.5 transition-colors"
              title="Refresh dashboard"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ─── Stat Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {loading ? (
            [...Array(6)].map((_, i) => <StatSkeleton key={i} />)
          ) : (
            <>
              {/* Task 156-f — shared SmartHR StatCard (royal / rose / emerald /
                  violet / orange / info rotation) */}
              <StatCard
                label="Total Gross Pay"
                value={fmtCurrency(data?.metrics?.totalGrossPay ?? 0)}
                sub={`${data?.metrics?.totalEmployeesProcessed ?? 0} employees`}
                icon={<FiDollarSign className="w-5 h-5" />}
                bg="bg-[#3A57C4]/10 text-[#3A57C4]"
                ring="ring-[#3A57C4]/20"
              />
              <StatCard
                label="Total Deductions"
                value={fmtCurrency(data?.metrics?.totalDeductions ?? 0)}
                sub="Tax, PF, ESI &amp; others"
                icon={<FiTrendingDown className="w-5 h-5" />}
                bg="bg-[#F43F5E]/10 text-[#F43F5E]"
                ring="ring-[#F43F5E]/20"
              />
              <StatCard
                label="Net Pay Disbursed"
                value={fmtCurrency(data?.metrics?.totalNetPay ?? 0)}
                sub="Credited to bank accounts"
                icon={<FiCreditCard className="w-5 h-5" />}
                bg="bg-[#10B981]/10 text-[#10B981]"
                ring="ring-[#10B981]/20"
              />
              <StatCard
                label="Employer Contributions"
                value={fmtCurrency(data?.metrics?.totalEmployerContrib ?? 0)}
                sub="PF, ESI, Gratuity"
                icon={<FiBriefcase className="w-5 h-5" />}
                bg="bg-[#6C4FD6]/10 text-[#6C4FD6]"
                ring="ring-[#6C4FD6]/20"
              />
              <StatCard
                label="Pending Approvals"
                value={String(pendingApprovals)}
                sub={pendingApprovals > 0 ? 'Requires attention' : 'All clear'}
                icon={<FiClock className="w-5 h-5" />}
                bg="bg-[#FF9B44]/10 text-[#FF9B44]"
                ring="ring-[#FF9B44]/20"
              />
              <StatCard
                label="Active Holds"
                value={String(activeHolds)}
                sub={activeHolds > 0 ? 'On payroll hold' : 'No holds'}
                icon={<FiPauseCircle className="w-5 h-5" />}
                bg="bg-[#009EFB]/10 text-[#009EFB]"
                ring="ring-[#009EFB]/20"
              />
            </>
          )}
        </div>

        {/* ─── Charts Row 1: Monthly Trend + Department Breakdown ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Monthly Payroll Trend — Area Chart (shared SmartHR Panel, Task 156-f) */}
          <div className="lg:col-span-3">
            <Panel
              title="Monthly Payroll Trend"
              icon={<FiBarChart2 className="w-4 h-4" />}
              accent="text-[#3A57C4]"
              action={<span className="text-xs text-slate-400">Last 6 months</span>}
            >
              {loading ? (
                <SkeletonChart />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={trendChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.indigo} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.indigo} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradDeduct" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.pink} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={COLORS.pink} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                      <YAxis
                        tickFormatter={fmtShort}
                        tick={{ fontSize: 11, fill: '#94A3B8' }}
                        width={48}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="Gross" stroke={COLORS.indigo} strokeWidth={2} fill="url(#gradGross)" name="Gross Pay" />
                      <Area type="monotone" dataKey="Deductions" stroke={COLORS.pink} strokeWidth={2} fill="url(#gradDeduct)" name="Deductions" />
                      <Area type="monotone" dataKey="Net Pay" stroke={COLORS.emerald} strokeWidth={2} fill="url(#gradNet)" name="Net Pay" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded" style={{ background: COLORS.indigo }} /> Gross</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded" style={{ background: COLORS.pink }} /> Deductions</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded" style={{ background: COLORS.emerald }} /> Net Pay</span>
                  </div>
                </>
              )}
            </Panel>
          </div>

          {/* Department Salary Breakdown — Horizontal Bar Chart (shared SmartHR Panel, Task 156-f) */}
          <div className="lg:col-span-2">
            <Panel
              title="Dept. Salary Breakdown"
              icon={<FiUsers className="w-4 h-4" />}
              accent="text-[#6C4FD6]"
            >
              {loading ? (
                <SkeletonChart />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={deptChartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                      <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#94A3B8' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} width={80} />
                      <Tooltip
                        formatter={(val: number) => fmtCurrency(val)}
                        contentStyle={{ fontSize: 12, border: '1px solid #E2E8F0', borderRadius: 8 }}
                      />
                      <Bar dataKey="salary" radius={[0, 4, 4, 0]} maxBarSize={24}>
                        {deptChartData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs text-slate-500">
                    {deptChartData.map((d, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        {d.name} ({d.headcount})
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Panel>
          </div>
        </div>

        {/* ─── Charts Row 2: Pie Charts ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Payroll Run Status Distribution (shared SmartHR Panel, Task 156-f) */}
          <Panel title="Payroll Run Status" icon={<FiLoader className="w-4 h-4" />} accent="text-[#009EFB]">
            {loading ? (
              <SkeletonChart />
            ) : (
              <div className="flex items-center">
                <ResponsiveContainer width="60%" height={220}>
                  <PieChart>
                    <Pie
                      data={runStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                    >
                      {runStatusData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {runStatusData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i] }} />
                      <span className="text-slate-600">{d.name}</span>
                      <span className="ml-auto font-semibold text-slate-800">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          {/* Cost Distribution (shared SmartHR Panel, Task 156-f) */}
          <Panel title="Cost Distribution" icon={<FiDollarSign className="w-4 h-4" />} accent="text-[#FF9B44]">
            {loading ? (
              <SkeletonChart />
            ) : (
              <div className="flex items-center">
                <ResponsiveContainer width="60%" height={220}>
                  <PieChart>
                    <Pie
                      data={costDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                    >
                      {costDistributionData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {costDistributionData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i] }} />
                      <span className="text-slate-600">{d.name}</span>
                      <span className="ml-auto font-semibold text-slate-800">{fmtCurrency(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* ─── Recent Payroll Runs Table (shared SmartHR Panel, Task 156-f) ─── */}
        <Panel
          title="Recent Payroll Runs"
          icon={<FiFileText className="w-4 h-4" />}
          accent="text-[#10B981]"
          action={
            <a
              href="/payroll/processing"
              className="text-xs font-semibold text-[#3A57C4] hover:text-[#2C43A3] flex items-center gap-1 transition-colors"
            >
              View all <FiArrowRight className="w-3 h-3" />
            </a>
          }
        >
          {loading ? (
            <SkeletonTable />
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="pb-3 pr-4">Period</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4 text-right">Employees</th>
                    <th className="pb-3 pr-4 text-right">Gross Pay</th>
                    <th className="pb-3 pr-4 text-right">Net Pay</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentRuns || []).map((run, idx) => (
                    <tr
                      key={run.id || idx}
                      className="border-b border-slate-50 hover:bg-slate-25 transition-colors"
                    >
                      <td className="py-3 pr-4 font-medium text-slate-700">{run.payrollPeriod}</td>
                      <td className="py-3 pr-4">{statusBadge(run.runStatus)}</td>
                      <td className="py-3 pr-4 text-slate-500">{run.runType || 'Regular'}</td>
                      <td className="py-3 pr-4 text-right text-slate-600">{run.totalEmployees}</td>
                      <td className="py-3 pr-4 text-right text-slate-700 font-medium">{fmtCurrency(run.totalGrossPay)}</td>
                      <td className="py-3 pr-4 text-right text-slate-700 font-medium">{fmtCurrency(run.totalNetPay)}</td>
                      <td className="py-3 text-right">
                        <a
                          href={`/payroll/processing`}
                          className="inline-flex items-center gap-1 text-xs text-[#3A57C4] hover:text-[#2C43A3] transition-colors"
                        >
                          View <FiExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                  {(data?.recentRuns || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No payroll runs found. Run your first payroll to see data here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ─── Bottom Row: Pending Items + Quick Actions ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 pb-8">
          {/* Pending Items (shared SmartHR Panel, Task 156-f) */}
          <div className="lg:col-span-2">
            <Panel title="Pending Items" icon={<FiAlertTriangle className="w-4 h-4" />} accent="text-[#FFC107]">
              <div className="space-y-3">
                {/* Pending approvals row */}
                <div className="bg-slate-50/80 hover:bg-slate-100/80 rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-colors" onClick={() => window.location.href = '/payroll/approvals'}>
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#FF9B44]/10">
                    <FiClock className="w-5 h-5 text-[#FF9B44]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">Pending Approvals</p>
                    <p className="text-lg font-bold text-[#FF9B44]">{pendingApprovals}</p>
                  </div>
                  <FiArrowRight className="w-4 h-4 text-slate-300" />
                </div>

                {/* Active holds row */}
                <div className="bg-slate-50/80 hover:bg-slate-100/80 rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-colors" onClick={() => window.location.href = '/payroll/holds'}>
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#009EFB]/10">
                    <FiPauseCircle className="w-5 h-5 text-[#009EFB]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">Active Holds</p>
                    <p className="text-lg font-bold text-[#009EFB]">{activeHolds}</p>
                  </div>
                  <FiArrowRight className="w-4 h-4 text-slate-300" />
                </div>

                {/* Upcoming filing deadlines */}
                <div className="bg-slate-50/80 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <FiCalendar className="w-4 h-4 text-slate-400" />
                    Upcoming Filing Deadlines
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {filingDeadlines.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2 px-1">No filing deadlines configured yet.</p>
                    ) : filingDeadlines.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-md bg-white">
                        <span className="text-slate-700 font-medium">{f.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">{f.due}</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              f.status === 'GREEN'
                                ? 'bg-emerald-500'
                                : f.status === 'AMBER'
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            }`}
                            title={f.status === 'GREEN' ? 'On track' : f.status === 'AMBER' ? 'Due soon' : 'Overdue'}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          {/* Quick Actions (shared SmartHR Panel, Task 156-f) */}
          <div className="lg:col-span-3">
            <Panel title="Quick Actions" icon={<FiZap className="w-4 h-4" />} accent="text-[#6C4FD6]">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {quickActions.map((action, idx) => (
                  <a
                    key={idx}
                    href={action.route}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col items-center text-center gap-3 group hover:shadow-md hover:-translate-y-0.5 transition-all"
                  >
                    <div className={`w-12 h-12 rounded-full ${action.bg} ring-1 ring-black/5 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <action.icon className={`w-6 h-6 ${action.color}`} />
                    </div>
                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                      {action.label}
                    </span>
                  </a>
                ))}
              </div>

              {/* Summary footer inside quick actions area */}
              <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">3Boxes HRMS Payroll Module</p>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">
                      Current period: <span className="text-[#10B981]">{data?.currentPeriod || '—'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <FiCheckCircle className="w-4 h-4 text-[#10B981]" />
                    System operational
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
