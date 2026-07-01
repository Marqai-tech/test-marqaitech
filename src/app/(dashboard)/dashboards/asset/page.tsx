'use client';

/* ───────────────────────────────────────────────────────────────
   3Boxes HRMS — Asset Dashboard
   SmartHR-style asset management dashboard with stat cards,
   category & status pie charts, monthly allocation trend,
   recently assigned table, upcoming maintenance, and quick actions.
   ─────────────────────────────────────────────────────────────── */

import { useEffect, useState, useCallback } from 'react';
import {
  FiPackage,
  FiUserCheck,
  FiCheckCircle,
  FiTool,
  FiArchive,
  FiDollarSign,
  FiRefreshCw,
  FiPlus,
  FiSend,
  FiSettings,
  FiClipboard,
  FiTrendingDown,
  FiTrash2,
  FiChevronRight,
  FiMonitor,
  FiSmartphone,
  FiCpu,
} from 'react-icons/fi';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

/* ═══════════════════ Helpers ═══════════════════ */

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
  cyan: '#06B6D4',
  amber: '#F59E0B',
  rose: '#F43F5E',
  violet: '#8B5CF6',
  orange: '#F97316',
  teal: '#14B8A6',
};

/* const PIE_COLORS — not used directly, colors are embedded in data */

function formatCurrency(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatShortCurrency(value: number): string {
  if (value >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/* ═══════════════════ Types ═══════════════════ */

interface AssetStat {
  key: string;
  label: string;
  value: number;
  trend: number;
  icon: React.ElementType;
  color: string;
  suffix?: string;
}

interface CategoryItem {
  name: string;
  value: number;
  color: string;
}

interface StatusItem {
  name: string;
  value: number;
  color: string;
}

interface AllocationTrendItem {
  month: string;
  newAllocations: number;
  returns: number;
}

interface RecentAssignment {
  assetTag: string;
  assetName: string;
  category: string;
  assignedTo: string;
  date: string;
  status: string;
}

interface MaintenanceItem {
  assetTag: string;
  assetName: string;
  maintenanceType: string;
  scheduledDate: string;
  daysUntil: number;
}

interface QuickAction {
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
}

interface AssetDashboardData {
  stats: AssetStat[];
  categoryDistribution: CategoryItem[];
  statusDistribution: StatusItem[];
  allocationTrend: AllocationTrendItem[];
  recentAssignments: RecentAssignment[];
  upcomingMaintenance: MaintenanceItem[];
  quickActions: QuickAction[];
}

/* ═══════════════════ Demo Data ═══════════════════ */

const DEMO_DATA: AssetDashboardData = {
  stats: [
    { key: 'totalAssets', label: 'Total Assets', value: 1247, trend: 8.3, icon: FiPackage, color: COLORS.indigo },
    { key: 'assigned', label: 'Assigned', value: 892, trend: 5.1, icon: FiUserCheck, color: COLORS.emerald },
    { key: 'available', label: 'Available', value: 218, trend: 2.4, icon: FiCheckCircle, color: COLORS.cyan },
    { key: 'inMaintenance', label: 'In Maintenance', value: 84, trend: -1.2, icon: FiTool, color: COLORS.amber },
    { key: 'retired', label: 'Retired', value: 53, trend: 12.6, icon: FiArchive, color: COLORS.rose },
    { key: 'totalValue', label: 'Total Value ₹', value: 4_85_00_000, trend: 6.8, icon: FiDollarSign, color: COLORS.violet, suffix: '₹' },
  ],
  categoryDistribution: [
    { name: 'Laptops', value: 412, color: COLORS.indigo },
    { name: 'Desktops', value: 186, color: COLORS.emerald },
    { name: 'Monitors', value: 298, color: COLORS.cyan },
    { name: 'Phones', value: 164, color: COLORS.amber },
    { name: 'Tablets', value: 87, color: COLORS.violet },
    { name: 'Peripherals', value: 100, color: COLORS.orange },
  ],
  statusDistribution: [
    { name: 'Available', value: 218, color: COLORS.cyan },
    { name: 'Assigned', value: 892, color: COLORS.emerald },
    { name: 'Maintenance', value: 84, color: COLORS.amber },
    { name: 'Retired', value: 53, color: COLORS.rose },
  ],
  allocationTrend: [
    { month: 'Oct', newAllocations: 42, returns: 18 },
    { month: 'Nov', newAllocations: 56, returns: 24 },
    { month: 'Dec', newAllocations: 38, returns: 32 },
    { month: 'Jan', newAllocations: 64, returns: 28 },
    { month: 'Feb', newAllocations: 48, returns: 22 },
    { month: 'Mar', newAllocations: 72, returns: 30 },
  ],
  recentAssignments: [
    { assetTag: 'AST-LP-0412', assetName: 'MacBook Pro 14"', category: 'Laptops', assignedTo: 'Ananya Sharma', date: '2026-03-04', status: 'Active' },
    { assetTag: 'AST-MN-0298', assetName: 'Dell U2723QE 27"', category: 'Monitors', assignedTo: 'Rohit Mehta', date: '2026-03-03', status: 'Active' },
    { assetTag: 'AST-PH-0164', assetName: 'iPhone 15 Pro', category: 'Phones', assignedTo: 'Priya Patel', date: '2026-03-02', status: 'Active' },
    { assetTag: 'AST-DK-0186', assetName: 'HP EliteDesk 800', category: 'Desktops', assignedTo: 'Karan Singh', date: '2026-03-01', status: 'Pending Setup' },
    { assetTag: 'AST-TB-0087', assetName: 'iPad Air M2', category: 'Tablets', assignedTo: 'Meera Joshi', date: '2026-02-28', status: 'Active' },
  ],
  upcomingMaintenance: [
    { assetTag: 'AST-LP-0034', assetName: 'ThinkPad X1 Carbon', maintenanceType: 'Battery Replacement', scheduledDate: '2026-03-10', daysUntil: 5 },
    { assetTag: 'AST-DK-0112', assetName: 'Dell OptiPlex 7090', maintenanceType: 'Annual Servicing', scheduledDate: '2026-03-12', daysUntil: 7 },
    { assetTag: 'AST-MN-0156', assetName: 'LG 27UK850-W', maintenanceType: 'Firmware Update', scheduledDate: '2026-03-15', daysUntil: 10 },
    { assetTag: 'AST-PH-0078', assetName: 'Samsung Galaxy S24', maintenanceType: 'Screen Replacement', scheduledDate: '2026-03-18', daysUntil: 13 },
  ],
  quickActions: [
    { label: 'Add Asset', icon: FiPlus, color: COLORS.indigo, description: 'Register new asset into inventory' },
    { label: 'Allocate Asset', icon: FiSend, color: COLORS.emerald, description: 'Assign asset to an employee' },
    { label: 'Request Maintenance', icon: FiSettings, color: COLORS.amber, description: 'Schedule maintenance for an asset' },
    { label: 'Asset Audit', icon: FiClipboard, color: COLORS.cyan, description: 'Initiate asset audit process' },
    { label: 'Depreciation Report', icon: FiTrendingDown, color: COLORS.violet, description: 'View asset depreciation reports' },
    { label: 'Disposal Request', icon: FiTrash2, color: COLORS.rose, description: 'Request asset disposal/retirement' },
  ],
};

/* ═══════════════════ Status Badge ═══════════════════ */

function assetStatusBadge(status: string) {
  const s = status.toUpperCase();
  const map: Record<string, { cls: string; label: string }> = {
    ACTIVE: { cls: 'thb-badge thb-badge-success', label: 'Active' },
    'PENDING SETUP': { cls: 'thb-badge thb-badge-warning', label: 'Pending Setup' },
    MAINTENANCE: { cls: 'thb-badge thb-badge-info', label: 'Maintenance' },
    RETIRED: { cls: 'thb-badge thb-badge-purple', label: 'Retired' },
    AVAILABLE: { cls: 'thb-badge thb-badge-success', label: 'Available' },
    ASSIGNED: { cls: 'thb-badge thb-badge-success', label: 'Assigned' },
    OVERDUE: { cls: 'thb-badge thb-badge-error', label: 'Overdue' },
  };
  const entry = map[s] ?? { cls: 'thb-badge thb-badge-info', label: status };
  return <span className={entry.cls}>{entry.label}</span>;
}

/* ═══════════════════ Custom Tooltip ═══════════════════ */

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      {label && <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-sm">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{p.name === 'Total Value ₹' || label?.includes('₹') ? formatCurrency(p.value) : p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

/* ═══════════════════ Skeleton ═══════════════════ */

function StatCardSkeleton() {
  return (
    <div className="thb-card p-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-9 w-9 rounded-lg bg-muted" />
      </div>
      <div className="mt-3 h-7 w-20 rounded bg-muted" />
      <div className="mt-2 h-3 w-16 rounded bg-muted" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="thb-card p-6 animate-pulse">
      <div className="h-5 w-40 rounded bg-muted" />
      <div className="mt-6 flex items-end gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-1 rounded bg-muted" style={{ height: `${30 + (i * 10) % 60}%` }} />
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="thb-card p-6 animate-pulse">
      <div className="h-5 w-48 rounded bg-muted" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-4 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════ Main Component ═══════════════════ */

export default function AssetDashboardPage() {
  const [data, setData] = useState<AssetDashboardData>(DEMO_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  useAuthStore();
  const { selectedCompany } = useCompanyContextStore();

  /* ── Fetch dashboard data ── */
  const fetchDashboard = useCallback(async () => {
    try {
      const companyId = selectedCompany?.id;
      const res = await fetch(`/api/dashboard?type=asset${companyId ? `&companyId=${companyId}` : ''}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setData(json.data);
          return;
        }
      }
    } catch {
      // silently fall back to demo
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLastRefreshed(new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }));
    }
  }, [selectedCompany?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDashboard();
    }, 400);
    return () => clearTimeout(timer);
  }, [fetchDashboard]);

  /* ── Refresh handler ── */
  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  /* ── Current date string ── */
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  /* ═══════════════════ RENDER ═══════════════════ */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* ─── Hero Section ─── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#0F172A] via-[#1E3A5F] to-[#312E81]">
        {/* Decorative circles */}
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-white/5" />
        <div className="absolute right-1/3 top-1/2 h-40 w-40 rounded-full bg-white/[0.03]" />

        <div className="relative z-10 px-6 py-8 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                  <FiPackage className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Asset Dashboard
                  </h1>
                  <p className="mt-0.5 text-sm text-white/60">{today}</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-white/70">
                Comprehensive asset tracking, allocation &amp; maintenance overview
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 backdrop-blur-sm sm:flex">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-white/80">3Boxes HRMS</span>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:opacity-50"
              >
                <FiRefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Last refreshed */}
          {lastRefreshed && (
            <p className="mt-3 text-xs text-white/40">
              Last refreshed: {lastRefreshed}
            </p>
          )}
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ═══ Stat Cards ═══ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
            : data.stats.map((stat) => {
                const Icon = stat.icon;
                const isCurrency = stat.suffix === '₹';
                const displayValue = isCurrency ? formatShortCurrency(stat.value) : stat.value.toLocaleString('en-IN');
                const trendPositive = stat.trend >= 0;
                return (
                  <div key={stat.key} className="thb-card group relative overflow-hidden p-5 transition-all hover:shadow-lg">
                    {/* Accent bar */}
                    <div
                      className="absolute left-0 top-0 h-1 w-full transition-all group-hover:h-1.5"
                      style={{ backgroundColor: stat.color }}
                    />
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {stat.label}
                        </p>
                        <p className="mt-2 text-2xl font-bold tracking-tight">
                          {isCurrency && <span className="text-base font-medium text-muted-foreground mr-0.5">₹</span>}
                          {displayValue}
                        </p>
                        <div className="mt-2 flex items-center gap-1">
                          {trendPositive ? (
                            <FiUserCheck className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <FiTrendingDown className="h-3 w-3 text-rose-500" />
                          )}
                          <span className={`text-xs font-medium ${trendPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {trendPositive ? '+' : ''}{stat.trend}%
                          </span>
                          <span className="text-xs text-muted-foreground">vs last month</span>
                        </div>
                      </div>
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${stat.color}15` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: stat.color }} />
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>

        {/* ═══ Charts Row ═══ */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Asset by Category PieChart */}
          {loading ? (
            <ChartSkeleton />
          ) : (
            <div className="thb-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Asset by Category</h3>
                  <p className="text-xs text-muted-foreground">Distribution across asset types</p>
                </div>
                <FiMonitor className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.categoryDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {data.categoryDistribution.map((entry, index) => (
                        <Cell key={`cat-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {data.categoryDistribution.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-muted-foreground truncate">{item.name}</span>
                    <span className="ml-auto font-semibold">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Asset Status Distribution Donut */}
          {loading ? (
            <ChartSkeleton />
          ) : (
            <div className="thb-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Asset Status Distribution</h3>
                  <p className="text-xs text-muted-foreground">Current status of all assets</p>
                </div>
                <FiCheckCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.statusDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {data.statusDistribution.map((entry, index) => (
                        <Cell key={`status-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Center label overlay */}
              <div className="mt-3 space-y-2">
                {data.statusDistribution.map((item, i) => {
                  const total = data.statusDistribution.reduce((a, b) => a + b.value, 0);
                  const pct = ((item.value / total) * 100).toFixed(1);
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="inline-block h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="flex-1 text-muted-foreground">{item.name}</span>
                      <span className="font-semibold">{item.value}</span>
                      <span className="text-xs text-muted-foreground">({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Monthly Allocation Trend BarChart */}
          {loading ? (
            <ChartSkeleton />
          ) : (
            <div className="thb-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Monthly Allocation Trend</h3>
                  <p className="text-xs text-muted-foreground">New allocations vs returns (6 months)</p>
                </div>
                <FiSmartphone className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.allocationTrend} barGap={4} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => (
                        <span className="text-xs text-muted-foreground">{value}</span>
                      )}
                    />
                    <Bar
                      dataKey="newAllocations"
                      name="New Allocations"
                      fill={COLORS.indigo}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="returns"
                      name="Returns"
                      fill={COLORS.emerald}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* ═══ Bottom Section: Table + Maintenance + Actions ═══ */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recently Assigned Assets Table */}
          <div className="lg:col-span-2">
            {loading ? (
              <TableSkeleton />
            ) : (
              <div className="thb-card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Recently Assigned Assets</h3>
                    <p className="text-xs text-muted-foreground">Latest asset assignments across the organization</p>
                  </div>
                  <button className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors">
                    View All <FiChevronRight className="h-3 w-3" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-3 text-left font-medium text-muted-foreground">Asset Tag</th>
                        <th className="pb-3 text-left font-medium text-muted-foreground">Name</th>
                        <th className="pb-3 text-left font-medium text-muted-foreground">Category</th>
                        <th className="pb-3 text-left font-medium text-muted-foreground">Assigned To</th>
                        <th className="pb-3 text-left font-medium text-muted-foreground">Date</th>
                        <th className="pb-3 text-left font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.recentAssignments.map((row, i) => (
                        <tr key={i} className="transition-colors hover:bg-muted/50">
                          <td className="py-3">
                            <span className="font-mono text-xs font-medium text-indigo-600 dark:text-indigo-400">{row.assetTag}</span>
                          </td>
                          <td className="py-3 font-medium">{row.assetName}</td>
                          <td className="py-3 text-muted-foreground">{row.category}</td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                                  {row.assignedTo.split(' ').map(w => w[0]).join('')}
                                </span>
                              </div>
                              <span className="text-sm">{row.assignedTo}</span>
                            </div>
                          </td>
                          <td className="py-3 text-muted-foreground text-xs">
                            {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="py-3">{assetStatusBadge(row.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: Maintenance + Actions */}
          <div className="flex flex-col gap-6">
            {/* Upcoming Maintenance */}
            {loading ? (
              <div className="thb-card p-6 animate-pulse">
                <div className="h-5 w-40 rounded bg-muted" />
                <div className="mt-4 space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="h-8 w-8 rounded-lg bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-3/4 rounded bg-muted" />
                        <div className="h-3 w-1/2 rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="thb-card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Upcoming Maintenance</h3>
                    <p className="text-xs text-muted-foreground">Scheduled maintenance activities</p>
                  </div>
                  <FiTool className="h-4 w-4 text-amber-500" />
                </div>
                <div className="space-y-3">
                  {data.upcomingMaintenance.map((item, i) => {
                    const isUrgent = item.daysUntil <= 5;
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                          isUrgent
                            ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                            isUrgent ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-cyan-100 dark:bg-cyan-900/30'
                          }`}
                        >
                          <FiSettings className={`h-4 w-4 ${isUrgent ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-medium text-muted-foreground">{item.assetTag}</span>
                            {isUrgent && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                URGENT
                              </span>
                            )}
                          </div>
                          <p className="truncate text-sm font-medium">{item.assetName}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{item.maintenanceType}</span>
                            <span className="text-border">•</span>
                            <span>{new Date(item.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end">
                          <span className={`text-lg font-bold ${isUrgent ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'}`}>
                            {item.daysUntil}
                          </span>
                          <span className="text-[10px] text-muted-foreground">days</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            {loading ? (
              <div className="thb-card p-6 animate-pulse">
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-lg bg-muted" />
                  ))}
                </div>
              </div>
            ) : (
              <div className="thb-card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Quick Actions</h3>
                    <p className="text-xs text-muted-foreground">Common asset operations</p>
                  </div>
                  <FiCpu className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {data.quickActions.map((action, i) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={i}
                        className="group flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-center transition-all hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-sm dark:hover:border-indigo-700 dark:hover:bg-indigo-950/20"
                      >
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-110"
                          style={{ backgroundColor: `${action.color}15` }}
                        >
                          <Icon className="h-4 w-4" style={{ color: action.color }} />
                        </div>
                        <span className="text-xs font-medium leading-tight">{action.label}</span>
                        <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{action.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ Footer ═══ */}
        <div className="mt-8 pb-4 text-center">
          <p className="text-xs text-muted-foreground">
            3Boxes HRMS &mdash; Asset Management Dashboard &bull; Data refreshed in real-time
          </p>
        </div>
      </div>
    </div>
  );
}
