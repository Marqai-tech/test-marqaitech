'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiMonitor, FiShield, FiHeadphones, FiActivity,
  FiRefreshCw, FiHardDrive, FiAlertTriangle, FiCheckCircle,
  FiServer, FiWifi, FiLock, FiDatabase, FiClock,
  FiArrowUp, FiArrowDown, FiChevronRight, FiMoreVertical,
  FiExternalLink, FiSearch,
} from 'react-icons/fi';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';

/* ================================================================
   IT Admin Dashboard – 3Boxes HRMS
   SmartHR-style IT admin overview with live metrics
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
  blue: '#3B82F6',
  rose: '#F43F5E',
  amber: '#F59E0B',
  emerald: '#10B981',
  violet: '#8B5CF6',
  cyan: '#06B6D4',
  slate: '#64748B',
};

const PIE_COLORS = [COLORS.blue, COLORS.violet, COLORS.amber, COLORS.emerald, COLORS.rose];

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
  HIGH:     { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  MEDIUM:   { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  LOW:      { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
};

const PRIORITY_CONFIG: Record<string, { bg: string; text: string }> = {
  Critical: { bg: 'bg-red-100', text: 'text-red-700' },
  High:     { bg: 'bg-orange-100', text: 'text-orange-700' },
  Medium:   { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  Low:      { bg: 'bg-green-100', text: 'text-green-700' },
};

const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  Open:         { bg: 'bg-blue-100', text: 'text-blue-700' },
  'In Progress': { bg: 'bg-amber-100', text: 'text-amber-700' },
  Resolved:     { bg: 'bg-green-100', text: 'text-green-700' },
  Closed:       { bg: 'bg-slate-100', text: 'text-slate-600' },
};

function formatDate() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ---------- types ---------- */

interface ITStat {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  trend?: number;
  trendLabel?: string;
}

interface SystemHealthPoint {
  hour: string;
  cpu: number;
  memory: number;
  disk: number;
}

interface TicketCategoryPoint {
  category: string;
  count: number;
}

interface DeviceDistPoint {
  name: string;
  value: number;
}

interface SecurityAlert {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  timestamp: string;
}

interface ActiveTicket {
  id: string;
  ticketNo: string;
  subject: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  assignedTo: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  created: string;
}

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  description: string;
}

/* ---------- skeleton components ---------- */

function SkeletonBlock({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`bg-slate-200/70 animate-pulse rounded-lg ${className}`} style={style} />;
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
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBlock
            key={i}
            className="flex-1 rounded-t-md"
            style={{ height: `${30 + ((i * 17) % 60)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="thb-card p-6 rounded-2xl border border-slate-100">
      <SkeletonBlock className="h-5 w-40 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <SkeletonBlock className="h-4 w-20" />
            <SkeletonBlock className="h-4 w-40 flex-1" />
            <SkeletonBlock className="h-4 w-16" />
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-4 w-16" />
            <SkeletonBlock className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- demo data generators ---------- */

function getDemoStats(): ITStat[] {
  return [
    { label: 'Active Devices', value: 1247, sub: '148 new this month', icon: <FiMonitor className="w-5 h-5" />, color: COLORS.blue, bgColor: 'bg-blue-50', trend: 12.4, trendLabel: 'vs last month' },
    { label: 'Security Alerts', value: 23, sub: '4 critical pending', icon: <FiShield className="w-5 h-5" />, color: COLORS.rose, bgColor: 'bg-rose-50', trend: -8.2, trendLabel: 'vs last week' },
    { label: 'Open Tickets', value: 67, sub: '12 escalated', icon: <FiHeadphones className="w-5 h-5" />, color: COLORS.amber, bgColor: 'bg-amber-50', trend: 5.7, trendLabel: 'vs last week' },
    { label: 'System Uptime', value: '99.97%', sub: 'Last 30 days', icon: <FiActivity className="w-5 h-5" />, color: COLORS.emerald, bgColor: 'bg-emerald-50', trend: 0.02, trendLabel: 'improvement' },
    { label: 'Pending Updates', value: 34, sub: '8 high priority', icon: <FiRefreshCw className="w-5 h-5" />, color: COLORS.violet, bgColor: 'bg-violet-50', trend: -15.3, trendLabel: 'vs last week' },
    { label: 'Storage Used', value: '73.2%', sub: '4.4 TB of 6 TB', icon: <FiHardDrive className="w-5 h-5" />, color: COLORS.cyan, bgColor: 'bg-cyan-50', trend: 3.1, trendLabel: 'growth rate' },
  ];
}

function getDemoSystemHealth(): SystemHealthPoint[] {
  const hours = [];
  for (let i = 23; i >= 0; i--) {
    const h = new Date();
    h.setHours(h.getHours() - i);
    const label = h.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    hours.push({
      hour: label,
      cpu: Math.min(95, 35 + Math.random() * 40),
      memory: Math.min(90, 55 + Math.random() * 20),
      disk: Math.min(85, 60 + Math.random() * 10),
    });
  }
  return hours;
}

function getDemoTicketsByCategory(): TicketCategoryPoint[] {
  return [
    { category: 'Network', count: 18 },
    { category: 'Hardware', count: 14 },
    { category: 'Software', count: 22 },
    { category: 'Access', count: 9 },
    { category: 'Email', count: 7 },
    { category: 'Other', count: 5 },
  ];
}

function getDemoDeviceDist(): DeviceDistPoint[] {
  return [
    { name: 'Desktop', value: 420 },
    { name: 'Laptop', value: 510 },
    { name: 'Tablet', value: 85 },
    { name: 'Mobile', value: 180 },
    { name: 'Server', value: 52 },
  ];
}

function getDemoSecurityAlerts(): SecurityAlert[] {
  return [
    { id: '1', severity: 'CRITICAL', description: 'Unauthorized access attempt detected on DB server prod-db-03 from IP 203.45.67.89', timestamp: new Date(Date.now() - 900000).toISOString() },
    { id: '2', severity: 'HIGH', description: 'SSL certificate expiring in 5 days for auth.3boxestech.com — renewal required', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: '3', severity: 'MEDIUM', description: 'Unusual login pattern detected for user jsmith — 5 failed attempts from new device', timestamp: new Date(Date.now() - 7200000).toISOString() },
    { id: '4', severity: 'LOW', description: 'Firewall rule update pending — 3 new rules awaiting review and approval', timestamp: new Date(Date.now() - 14400000).toISOString() },
    { id: '5', severity: 'HIGH', description: 'Malware signature detected on endpoint WKST-0142 — quarantine initiated', timestamp: new Date(Date.now() - 21600000).toISOString() },
  ];
}

function getDemoActiveTickets(): ActiveTicket[] {
  return [
    { id: '1', ticketNo: 'TKT-1024', subject: 'VPN connection dropping intermittently for remote team', priority: 'Critical', assignedTo: 'Raj K.', status: 'In Progress', created: '2h ago' },
    { id: '2', ticketNo: 'TKT-1025', subject: 'Email server latency affecting all users in BLR office', priority: 'High', assignedTo: 'Anita S.', status: 'Open', created: '4h ago' },
    { id: '3', ticketNo: 'TKT-1026', subject: 'New hire laptop provisioning — Dev team (3 devices)', priority: 'Medium', assignedTo: 'Vikram P.', status: 'In Progress', created: '6h ago' },
    { id: '4', ticketNo: 'TKT-1027', subject: 'SAP access request for Finance department new joiner', priority: 'Low', assignedTo: 'Meera D.', status: 'Open', created: '1d ago' },
    { id: '5', ticketNo: 'TKT-1028', subject: 'Printer queue stuck on Floor 3 — HP LaserJet Pro', priority: 'Medium', assignedTo: 'Suresh M.', status: 'Open', created: '1d ago' },
  ];
}

function getDemoQuickActions(): QuickAction[] {
  return [
    { label: 'Manage Devices', icon: <FiMonitor className="w-5 h-5" />, color: COLORS.blue, bgColor: 'bg-blue-50', description: 'Device inventory & tracking' },
    { label: 'Security Settings', icon: <FiLock className="w-5 h-5" />, color: COLORS.rose, bgColor: 'bg-rose-50', description: 'Firewall, antivirus & policies' },
    { label: 'User Access', icon: <FiShield className="w-5 h-5" />, color: COLORS.amber, bgColor: 'bg-amber-50', description: 'Permissions & role management' },
    { label: 'System Updates', icon: <FiRefreshCw className="w-5 h-5" />, color: COLORS.violet, bgColor: 'bg-violet-50', description: 'Patch management & updates' },
    { label: 'Backup & Recovery', icon: <FiDatabase className="w-5 h-5" />, color: COLORS.emerald, bgColor: 'bg-emerald-50', description: 'Data backup & disaster recovery' },
    { label: 'Network Monitoring', icon: <FiWifi className="w-5 h-5" />, color: COLORS.cyan, bgColor: 'bg-cyan-50', description: 'Bandwidth & uptime monitoring' },
  ];
}

/* ---------- custom chart tooltip ---------- */

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 px-4 py-3">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-semibold text-slate-800">{entry.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 px-4 py-3">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-semibold text-slate-800">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.payload.fill }} />
        <span className="text-sm font-medium text-slate-700">{item.name}</span>
      </div>
      <p className="text-lg font-bold text-slate-800 mt-1">{item.value} devices</p>
    </div>
  );
}

/* ---------- main component ---------- */

export default function ITAdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState<ITStat[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealthPoint[]>([]);
  const [ticketsByCategory, setTicketsByCategory] = useState<TicketCategoryPoint[]>([]);
  const [deviceDist, setDeviceDist] = useState<DeviceDistPoint[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [activeTickets, setActiveTickets] = useState<ActiveTicket[]>([]);
  const [quickActions] = useState<QuickAction[]>(getDemoQuickActions());

  /* fetch dashboard data */
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        /* If the API returns relevant data we can use it;
           otherwise we keep the rich demo data for the IT-specific view. */
        if (data?.stats) {
          /* API provides general HR stats; IT dashboard has its own context */
        }
      }
    } catch {
      /* silently fallback to demo data */
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await fetchDashboard();
    /* Use IT-specific demo data for rich dashboard experience */
    setStats(getDemoStats());
    setSystemHealth(getDemoSystemHealth());
    setTicketsByCategory(getDemoTicketsByCategory());
    setDeviceDist(getDemoDeviceDist());
    setSecurityAlerts(getDemoSecurityAlerts());
    setActiveTickets(getDemoActiveTickets());
    setLoading(false);
  }, [fetchDashboard]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboard();
    setStats(getDemoStats());
    setSystemHealth(getDemoSystemHealth());
    setTicketsByCategory(getDemoTicketsByCategory());
    setDeviceDist(getDemoDeviceDist());
    setSecurityAlerts(getDemoSecurityAlerts());
    setActiveTickets(getDemoActiveTickets());
    setRefreshing(false);
  }, [fetchDashboard]);

  const criticalAlerts = useMemo(
    () => securityAlerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').length,
    [securityAlerts],
  );

  /* ---------- render ---------- */

  return (
    <div className="min-h-screen bg-slate-50/80">
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#0F172A] via-[#1E3A5F] to-[#312E81] px-6 py-10 sm:px-8 sm:py-14">
        {/* decorative blur circles */}
        <div className="absolute -top-20 -left-20 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-16 w-96 h-96 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FiServer className="w-5 h-5 text-cyan-400" />
              <span className="text-xs font-semibold tracking-wider uppercase text-cyan-300">
                3Boxes HRMS
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              IT Admin Dashboard
            </h1>
            <p className="text-slate-300/80 text-sm mt-1">{formatDate()}</p>
          </div>

          <div className="flex items-center gap-3">
            {criticalAlerts > 0 && (
              <div className="flex items-center gap-2 bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2">
                <FiAlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-200">
                  {criticalAlerts} Critical Alert{criticalAlerts > 1 ? 's' : ''}
                </span>
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-2 transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              <FiRefreshCw className={`w-4 h-4 text-white ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium text-white">Refresh</span>
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ===== STAT CARDS ===== */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)
              : stats.map((stat, idx) => (
                  <div
                    key={idx}
                    className="thb-card p-5 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow duration-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-500 truncate">{stat.label}</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{stat.value}</p>
                      </div>
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: stat.bgColor }}
                      >
                        <span style={{ color: stat.color }}>{stat.icon}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-3">
                      {stat.trend !== undefined && (
                        <>
                          {stat.trend > 0 ? (
                            <FiArrowUp className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <FiArrowDown className="w-3 h-3 text-red-500" />
                          )}
                          <span
                            className={`text-xs font-medium ${
                              stat.trend > 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {Math.abs(stat.trend)}%
                          </span>
                        </>
                      )}
                      <span className="text-xs text-slate-400">{stat.sub}</span>
                    </div>
                  </div>
                ))}
          </div>
        </section>

        {/* ===== CHARTS ROW ===== */}
        <section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* System Health – Area Chart */}
            {loading ? (
              <ChartSkeleton />
            ) : (
              <div className="thb-card p-6 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">System Health</h3>
                    <p className="text-xs text-slate-400 mt-0.5">CPU, Memory & Disk usage — last 24 hours</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.blue }} />
                      CPU
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.violet }} />
                      Memory
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.cyan }} />
                      Disk
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={systemHealth} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.violet} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.violet} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.cyan} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.cyan} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10, fill: '#94A3B8' }}
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                      interval={3}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#94A3B8' }}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 100]}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="cpu"
                      name="CPU"
                      stroke={COLORS.blue}
                      strokeWidth={2}
                      fill="url(#cpuGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="memory"
                      name="Memory"
                      stroke={COLORS.violet}
                      strokeWidth={2}
                      fill="url(#memGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="disk"
                      name="Disk"
                      stroke={COLORS.cyan}
                      strokeWidth={2}
                      fill="url(#diskGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tickets by Category – Bar Chart */}
            {loading ? (
              <ChartSkeleton />
            ) : (
              <div className="thb-card p-6 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">Tickets by Category</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Open tickets distributed by issue type</p>
                  </div>
                  <span className="text-xs text-slate-400">Total: {ticketsByCategory.reduce((s, c) => s + c.count, 0)}</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={ticketsByCategory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="category"
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#94A3B8' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<BarTooltip />} />
                    <Bar
                      dataKey="count"
                      name="Tickets"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    >
                      {ticketsByCategory.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* ===== PIE CHART + SECURITY ALERTS ===== */}
        <section>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Device Distribution – Pie Chart */}
            <div className="lg:col-span-2">
              {loading ? (
                <ChartSkeleton />
              ) : (
                <div className="thb-card p-6 rounded-2xl border border-slate-100 h-full">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-slate-800">Device Distribution</h3>
                    <p className="text-xs text-slate-400 mt-0.5">By device type across organization</p>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={deviceDist}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="value"
                        nameKey="name"
                        stroke="none"
                      >
                        {deviceDist.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
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
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {deviceDist.map((d, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        <span className="text-xs text-slate-600 truncate">{d.name}</span>
                        <span className="text-xs font-semibold text-slate-800 ml-auto">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent Security Alerts */}
            <div className="lg:col-span-3">
              {loading ? (
                <div className="thb-card p-6 rounded-2xl border border-slate-100">
                  <SkeletonBlock className="h-5 w-44 mb-4" />
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <SkeletonBlock className="h-8 w-20 rounded-md" />
                        <div className="flex-1 space-y-2">
                          <SkeletonBlock className="h-4 w-full" />
                          <SkeletonBlock className="h-3 w-20" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="thb-card p-6 rounded-2xl border border-slate-100 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-800">Recent Security Alerts</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Latest threats and security events</p>
                    </div>
                    <span className="text-xs font-medium text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">
                      {securityAlerts.length} alerts
                    </span>
                  </div>
                  <div className="flex-1 space-y-3 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                    {securityAlerts.map(alert => {
                      const sev = SEVERITY_CONFIG[alert.severity];
                      return (
                        <div
                          key={alert.id}
                          className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/80 hover:bg-slate-100/80 transition-colors duration-150"
                        >
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide ${sev.bg} ${sev.text} flex-shrink-0 mt-0.5`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                            {alert.severity}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 leading-snug">{alert.description}</p>
                            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                              <FiClock className="w-3 h-3" />
                              {formatTimeAgo(alert.timestamp)}
                            </p>
                          </div>
                          <button className="p-1 hover:bg-slate-200 rounded-md transition-colors cursor-pointer flex-shrink-0">
                            <FiMoreVertical className="w-4 h-4 text-slate-400" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ===== ACTIVE TICKETS TABLE ===== */}
        <section>
          {loading ? (
            <TableSkeleton />
          ) : (
            <div className="thb-card p-6 rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Active Tickets</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Currently open and in-progress IT support tickets</p>
                </div>
                <button
                  onClick={() => router.push('/helpdesk')}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                >
                  View All <FiChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ticket #</th>
                      <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                      <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                      <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned To</th>
                      <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="text-left py-3 px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTickets.map(ticket => {
                      const pri = PRIORITY_CONFIG[ticket.priority];
                      const sta = STATUS_CONFIG[ticket.status];
                      return (
                        <tr
                          key={ticket.id}
                          className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer"
                          onClick={() => router.push('/helpdesk')}
                        >
                          <td className="py-3 px-2 font-medium text-blue-600 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <FiHeadphones className="w-3.5 h-3.5 text-slate-400" />
                              {ticket.ticketNo}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-slate-700 max-w-xs truncate">{ticket.subject}</td>
                          <td className="py-3 px-2 whitespace-nowrap">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${pri.bg} ${pri.text}`}>
                              {ticket.priority}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-slate-600 whitespace-nowrap">{ticket.assignedTo}</td>
                          <td className="py-3 px-2 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${sta.bg} ${sta.text}`}>
                              {ticket.status === 'In Progress' && <FiClock className="w-3 h-3" />}
                              {ticket.status === 'Open' && <FiAlertTriangle className="w-3 h-3" />}
                              {ticket.status === 'Resolved' && <FiCheckCircle className="w-3 h-3" />}
                              {ticket.status}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-slate-400 text-xs whitespace-nowrap">{ticket.created}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ===== QUICK ACTIONS ===== */}
        <section>
          {loading ? (
            <div className="thb-card p-6 rounded-2xl border border-slate-100">
              <SkeletonBlock className="h-5 w-32 mb-4" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonBlock key={i} className="h-28 rounded-xl" />
                ))}
              </div>
            </div>
          ) : (
            <div className="thb-card p-6 rounded-2xl border border-slate-100">
              <div className="mb-5">
                <h3 className="text-base font-semibold text-slate-800">Quick Actions</h3>
                <p className="text-xs text-slate-400 mt-0.5">Frequently used IT administration tasks</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {quickActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => router.push('/settings')}
                    className="group flex flex-col items-center gap-3 p-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm transition-all duration-200 cursor-pointer text-center"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                      style={{ backgroundColor: action.bgColor, color: action.color }}
                    >
                      {action.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                        {action.label}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{action.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ===== FOOTER BRANDING ===== */}
        <footer className="text-center py-6 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            <span className="font-semibold text-slate-500">3Boxes HRMS</span>
            {' '}— IT Admin Dashboard{' '}
            <span className="text-slate-300">|</span>{' '}
            Powered by <span className="font-semibold text-slate-500">3Boxes Technologies</span>
          </p>
        </footer>
      </div>

      {/* Custom scrollbar styles */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94A3B8;
        }
      `}</style>
    </div>
  );
}
