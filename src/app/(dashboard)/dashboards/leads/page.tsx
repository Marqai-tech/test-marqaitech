'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  FiUsers, FiZap, FiPhone, FiCheckCircle, FiTarget,
  FiTrendingUp, FiArrowUp, FiArrowDown, FiPlus,
  FiUpload, FiBarChart2, FiMail, FiUserPlus, FiActivity,
  FiRefreshCw, FiChevronRight, FiMessageSquare,
  FiCalendar, FiPhoneCall,
} from 'react-icons/fi';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

/* ═══════════════ helpers ═══════════════ */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const COLORS = {
  indigo: '#6366F1',
  rose: '#F43F5E',
  amber: '#F59E0B',
  emerald: '#10B981',
  violet: '#8B5CF6',
  cyan: '#06B6D4',
};

const PIE_COLORS = [
  COLORS.indigo, COLORS.cyan, COLORS.emerald,
  COLORS.amber, COLORS.rose, COLORS.violet,
];

/* ═══════════════ demo data ═══════════════ */

const DEMO_STATS = [
  { key: 'totalLeads', label: 'Total Leads', value: 1842, trend: 14.3, icon: FiUsers, color: COLORS.indigo },
  { key: 'hotLeads', label: 'Hot Leads', value: 284, trend: 22.1, icon: FiZap, color: COLORS.rose },
  { key: 'contacted', label: 'Contacted', value: 658, trend: 8.7, icon: FiPhone, color: COLORS.amber },
  { key: 'qualified', label: 'Qualified', value: 412, trend: 16.5, icon: FiCheckCircle, color: COLORS.emerald },
  { key: 'converted', label: 'Converted', value: 186, trend: 31.2, icon: FiTarget, color: COLORS.violet },
  { key: 'conversionRate', label: 'Conversion Rate', value: 10.1, trend: 2.4, suffix: '%', icon: FiTrendingUp, color: COLORS.cyan },
];

const DEMO_SOURCE_DATA = [
  { name: 'Website', value: 520 },
  { name: 'LinkedIn', value: 410 },
  { name: 'Referral', value: 340 },
  { name: 'Event', value: 230 },
  { name: 'Cold Call', value: 190 },
  { name: 'Advertisement', value: 152 },
];

const DEMO_TREND_DATA = [
  { month: 'Oct', newLeads: 245, converted: 18 },
  { month: 'Nov', newLeads: 312, converted: 24 },
  { month: 'Dec', newLeads: 288, converted: 21 },
  { month: 'Jan', newLeads: 395, converted: 32 },
  { month: 'Feb', newLeads: 460, converted: 38 },
  { month: 'Mar', newLeads: 547, converted: 53 },
];

const DEMO_STATUS_DATA = [
  { status: 'New', count: 420 },
  { status: 'Contacted', count: 312 },
  { status: 'Qualified', count: 245 },
  { status: 'Proposal', count: 186 },
  { status: 'Negotiation', count: 134 },
  { status: 'Converted', count: 186 },
  { status: 'Lost', count: 359 },
];

const DEMO_RECENT_LEADS = [
  { id: '1', name: 'Arjun Mehta', company: 'TechVision Inc.', source: 'Website', status: 'New', score: 78, assignedTo: 'Sneha Iyer', date: '2026-03-04' },
  { id: '2', name: 'Priya Sharma', company: 'CloudSync Labs', source: 'LinkedIn', status: 'Contacted', score: 85, assignedTo: 'Raj Malhotra', date: '2026-03-03' },
  { id: '3', name: 'Vikram Patel', company: 'DataForge Solutions', source: 'Referral', status: 'Qualified', score: 92, assignedTo: 'Amit Verma', date: '2026-03-02' },
  { id: '4', name: 'Neha Gupta', company: 'InnovateTech', source: 'Event', status: 'Proposal', score: 88, assignedTo: 'Kavita Sharma', date: '2026-03-01' },
  { id: '5', name: 'Rohit Deshmukh', company: 'Pinnacle Systems', source: 'Cold Call', status: 'Negotiation', score: 94, assignedTo: 'Prakash Nair', date: '2026-02-28' },
  { id: '6', name: 'Ananya Reddy', company: 'NextWave Digital', source: 'Advertisement', status: 'Converted', score: 97, assignedTo: 'Sneha Iyer', date: '2026-02-27' },
];

const DEMO_HOT_LEADS = [
  { id: '1', name: 'Rohit Deshmukh', company: 'Pinnacle Systems', score: 94, source: 'Cold Call', lastContact: '2026-03-03' },
  { id: '2', name: 'Ananya Reddy', company: 'NextWave Digital', score: 97, source: 'Advertisement', lastContact: '2026-03-02' },
  { id: '3', name: 'Vikram Patel', company: 'DataForge Solutions', score: 92, source: 'Referral', lastContact: '2026-03-01' },
  { id: '4', name: 'Neha Gupta', company: 'InnovateTech', score: 88, source: 'Event', lastContact: '2026-02-28' },
  { id: '5', name: 'Priya Sharma', company: 'CloudSync Labs', score: 85, source: 'LinkedIn', lastContact: '2026-02-27' },
];

const DEMO_QUICK_ACTIONS = [
  { label: 'Add Lead', icon: FiPlus, color: COLORS.indigo, href: '/recruitment' },
  { label: 'Import Leads', icon: FiUpload, color: COLORS.rose, href: '/recruitment' },
  { label: 'Lead Scoring', icon: FiBarChart2, color: COLORS.amber, href: '/analytics/candidate-flow' },
  { label: 'Email Campaign', icon: FiMail, color: COLORS.emerald, href: '/email' },
  { label: 'Lead Assignment', icon: FiUserPlus, color: COLORS.violet, href: '/recruitment' },
  { label: 'Analytics', icon: FiActivity, color: COLORS.cyan, href: '/recruitment/analytics' },
];

/* ═══════════════ types ═══════════════ */

interface StatCard {
  key: string;
  label: string;
  value: number;
  trend: number;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface RecentLead {
  id: string;
  name: string;
  company: string;
  source: string;
  status: string;
  score: number;
  assignedTo: string;
  date: string;
}

interface HotLead {
  id: string;
  name: string;
  company: string;
  score: number;
  source: string;
  lastContact: string;
}

interface QuickAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href: string;
}

/* ═══════════════ skeleton components ═══════════════ */

function StatSkeleton() {
  return (
    <div className="thb-card p-5 animate-pulse">
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
    <div className={`thb-card p-5 animate-pulse ${height}`}>
      <div className="w-36 h-5 rounded bg-slate-200 mb-4" />
      <div className="flex-1 rounded bg-slate-50" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="thb-card p-5 animate-pulse">
      <div className="w-40 h-5 rounded bg-slate-200 mb-4" />
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex gap-4 mb-3">
          <div className="w-28 h-4 rounded bg-slate-100" />
          <div className="w-24 h-4 rounded bg-slate-50" />
          <div className="w-16 h-5 rounded-full bg-slate-100" />
          <div className="w-20 h-4 rounded bg-slate-50" />
          <div className="w-16 h-4 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="thb-card p-5 animate-pulse">
      <div className="w-40 h-5 rounded bg-slate-200 mb-4" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-3 mb-4 items-center">
          <div className="w-8 h-8 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="w-28 h-3 rounded bg-slate-100" />
            <div className="w-20 h-3 rounded bg-slate-50" />
          </div>
          <div className="w-16 h-5 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════ custom tooltip ═══════════════ */

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-800 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-slate-600" style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

/* ═══════════════ source badge ═══════════════ */

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    Website:       { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
    LinkedIn:      { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
    Referral:      { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    Event:         { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    'Cold Call':   { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
    Advertisement: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  };
  const cls = map[source] || { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls.bg} ${cls.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cls.dot}`} />
      {source}
    </span>
  );
}

/* ═══════════════ lead status badge ═══════════════ */

function LeadStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    New:          { bg: 'bg-slate-50', text: 'text-slate-600' },
    Contacted:    { bg: 'bg-blue-50', text: 'text-blue-700' },
    Qualified:    { bg: 'bg-cyan-50', text: 'text-cyan-700' },
    Proposal:     { bg: 'bg-amber-50', text: 'text-amber-700' },
    Negotiation:  { bg: 'bg-orange-50', text: 'text-orange-700' },
    Converted:    { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Lost:         { bg: 'bg-red-50', text: 'text-red-600' },
  };
  const cls = map[status] || map.New;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls.bg} ${cls.text}`}>
      {status}
    </span>
  );
}

/* ═══════════════ score color helper ═══════════════ */

function getScoreColor(score: number): string {
  if (score >= 90) return '#10B981';
  if (score >= 75) return '#06B6D4';
  if (score >= 60) return '#F59E0B';
  return '#F43F5E';
}

/* ═══════════════════════════════════════════════════
   Leads Dashboard Page Component
   ═══════════════════════════════════════════════════ */

export default function LeadsDashboardPage() {
  const { user } = useAuthStore();
  const { selectedCompany } = useCompanyContextStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<StatCard[]>(DEMO_STATS);
  const [sourceData, setSourceData] = useState(DEMO_SOURCE_DATA);
  const [trendData, setTrendData] = useState(DEMO_TREND_DATA);
  const [statusData, setStatusData] = useState(DEMO_STATUS_DATA);
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>(DEMO_RECENT_LEADS);
  const [hotLeads, setHotLeads] = useState<HotLead[]>(DEMO_HOT_LEADS);
  const [quickActions] = useState<QuickAction[]>(DEMO_QUICK_ACTIONS);

  const companyName = selectedCompany?.name || user?.company?.name || '3Boxes Tech';

  /* ─── fetch data ─── */
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      try {
        const headers = getAuthHeaders();
        const companyId = selectedCompany?.id;

        const recRes = await fetch(`/api/recruitment${companyId ? `?companyId=${companyId}` : ''}`, { headers });
        if (!cancelled && recRes.ok) {
          const recJson = await recRes.json();

          if (recJson.stats) {
            const s = recJson.stats;
            setStats(prev => prev.map(card => {
              switch (card.key) {
                case 'totalLeads':      return { ...card, value: s.totalLeads ?? card.value };
                case 'hotLeads':        return { ...card, value: s.hotLeads ?? card.value };
                case 'contacted':       return { ...card, value: s.contacted ?? card.value };
                case 'qualified':       return { ...card, value: s.qualified ?? card.value };
                case 'converted':       return { ...card, value: s.converted ?? card.value };
                case 'conversionRate':  return { ...card, value: s.conversionRate ?? card.value };
                default: return card;
              }
            }));
          }

          if (recJson.sourceData?.length) setSourceData(recJson.sourceData);
          if (recJson.monthlyTrend?.length) setTrendData(recJson.monthlyTrend);
          if (recJson.statusData?.length) setStatusData(recJson.statusData);
          if (recJson.recentLeads?.length) setRecentLeads(recJson.recentLeads.slice(0, 6));
          if (recJson.hotLeads?.length) setHotLeads(recJson.hotLeads.slice(0, 5));
        }

        // Also try the candidates endpoint for lead data
        const candRes = await fetch(`/api/candidates?limit=100${companyId ? `&companyId=${companyId}` : ''}`, { headers });
        if (!cancelled && candRes.ok) {
          const candJson = await candRes.json();
          if (candJson.data?.length) {
            const totalCand = candJson.total || candJson.data.length;
            setStats(prev => prev.map(card =>
              card.key === 'totalLeads' ? { ...card, value: totalCand } : card
            ));
          }
        }
      } catch {
        // Silently use demo data fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, [selectedCompany?.id, user?.company?.id]);

  /* ─── refresh handler ─── */
  const handleRefresh = () => {
    setRefreshing(true);
    setLoading(true);
  };

  /* ─── formatted date ─── */
  const today = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, []);

  /* ─── status bar colors ─── */
  const STATUS_BAR_COLORS = [
    COLORS.indigo, '#3B82F6', COLORS.cyan,
    COLORS.amber, '#F97316', COLORS.emerald, COLORS.rose,
  ];

  /* ─── render ─── */
  return (
    <div className="space-y-6 pb-8">

      {/* ═══════ Gradient Hero ═══════ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0F172A] via-[#1E3A5F] to-[#312E81] p-6 md:p-8 text-white">
        {/* Decorative blur circles */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-36 h-36 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="absolute top-1/2 right-1/4 w-24 h-24 rounded-full bg-violet-500/15 blur-xl" />
        <div className="absolute -bottom-6 right-1/3 w-20 h-20 rounded-full bg-rose-400/10 blur-lg" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Leads Dashboard</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold tracking-wide">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {companyName}
              </span>
            </div>
            <p className="text-white/60 text-sm md:text-base">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur hover:bg-white/20 transition-all text-sm font-medium disabled:opacity-50"
            >
              <FiRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="px-4 py-2 rounded-xl bg-white/15 backdrop-blur text-sm font-medium">
              3Boxes HRMS
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ Stat Cards ═══════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {loading
          ? [...Array(6)].map((_, i) => <StatSkeleton key={i} />)
          : stats.map((card) => {
              const Icon = card.icon;
              const isPositive = card.trend >= 0;
              return (
                <div key={card.key} className="thb-card thb-card-hover p-5 group transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${card.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: card.color }} />
                    </div>
                    <span
                      className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                        isPositive
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-red-50 text-red-600'
                      }`}
                    >
                      {isPositive ? <FiArrowUp className="w-3 h-3" /> : <FiArrowDown className="w-3 h-3" />}
                      {Math.abs(card.trend)}%
                    </span>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {card.suffix === '%' ? card.value.toFixed(1) : card.value.toLocaleString()}
                    {card.suffix && <span className="text-sm font-semibold text-slate-500 ml-0.5">{card.suffix}</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
                </div>
              );
            })}
      </div>

      {/* ═══════ Charts Row: Source Distribution + Lead Trend ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Source Distribution — Donut Pie Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="thb-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">Lead Source Distribution</h3>
              <span className="text-[11px] text-slate-400 font-medium">All Leads</span>
            </div>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {sourceData.map((_, index) => (
                      <Cell key={`src-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value} leads`, name]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="hidden md:flex flex-col gap-2.5 min-w-[140px]">
                {sourceData.map((item, index) => {
                  const total = sourceData.reduce((acc, s) => acc + s.value, 0);
                  const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                  return (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span className="text-slate-600 truncate flex-1">{item.name}</span>
                      <span className="text-slate-800 font-semibold">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Lead Trend — Area Chart (New Leads vs Converted) */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="thb-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">Lead Trend</h3>
              <span className="text-[11px] text-slate-400 font-medium">Last 6 Months</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="newLeadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.indigo} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={COLORS.indigo} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="convertedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="newLeads"
                  name="New Leads"
                  stroke={COLORS.indigo}
                  strokeWidth={2.5}
                  fill="url(#newLeadsGrad)"
                  dot={{ r: 4, fill: COLORS.indigo, stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: COLORS.indigo, stroke: '#fff', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="converted"
                  name="Converted"
                  stroke={COLORS.emerald}
                  strokeWidth={2.5}
                  fill="url(#convertedGrad)"
                  dot={{ r: 4, fill: COLORS.emerald, stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: COLORS.emerald, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
            {/* Legend below chart */}
            <div className="flex items-center justify-center gap-6 mt-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-1 rounded-full" style={{ backgroundColor: COLORS.indigo }} />
                <span className="text-slate-600">New Leads</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-1 rounded-full" style={{ backgroundColor: COLORS.emerald }} />
                <span className="text-slate-600">Converted</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════ Lead Status — Bar Chart ═══════ */}
      {loading ? (
        <ChartSkeleton height="h-72" />
      ) : (
        <div className="thb-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">Lead Status</h3>
            <span className="text-[11px] text-slate-400 font-medium">Pipeline Overview</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={statusData} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="status" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={48}>
                {statusData.map((_, index) => (
                  <Cell key={`status-${index}`} fill={STATUS_BAR_COLORS[index % STATUS_BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ═══════ Recent Leads Table + Hot Leads Panel ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Leads — 2 cols */}
        <div className="lg:col-span-2">
          {loading ? (
            <TableSkeleton />
          ) : (
            <div className="thb-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800">Recent Leads</h3>
                <button className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1">
                  View All <FiChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Lead Name</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Company</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Source</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Score</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Assigned To</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLeads.map((lead) => {
                      const scoreColor = getScoreColor(lead.score);
                      return (
                        <tr key={lead.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-3 font-medium text-slate-800">{lead.name}</td>
                          <td className="py-3 px-3 text-slate-600 max-w-[160px] truncate">{lead.company}</td>
                          <td className="py-3 px-3"><SourceBadge source={lead.source} /></td>
                          <td className="py-3 px-3"><LeadStatusBadge status={lead.status} /></td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${lead.score}%`, backgroundColor: scoreColor }}
                                />
                              </div>
                              <span className="text-xs font-bold" style={{ color: scoreColor }}>
                                {lead.score}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-600 text-xs">{lead.assignedTo}</td>
                          <td className="py-3 px-3 text-slate-500 text-xs whitespace-nowrap">
                            {new Date(lead.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Hot Leads Panel — 1 col */}
        <div>
          {loading ? (
            <ListSkeleton />
          ) : (
            <div className="thb-card p-5 h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-800">Hot Leads</h3>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-bold">
                    {hotLeads.length}
                  </span>
                </div>
                <FiZap className="w-4 h-4 text-rose-500" />
              </div>
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {hotLeads.map((lead) => {
                  const scoreColor = getScoreColor(lead.score);
                  return (
                    <div
                      key={lead.id}
                      className="rounded-xl border border-slate-100 p-3 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {/* Score circle */}
                        <div
                          className="flex flex-col items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
                          style={{ backgroundColor: `${scoreColor}12` }}
                        >
                          <span className="text-xs font-extrabold leading-none" style={{ color: scoreColor }}>
                            {lead.score}
                          </span>
                          <span className="text-[8px] font-semibold text-slate-400">/100</span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-xs font-semibold text-slate-800 truncate">{lead.name}</p>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mb-1.5">{lead.company}</p>

                          {/* Score bar */}
                          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${lead.score}%`, backgroundColor: scoreColor }}
                            />
                          </div>

                          {/* Source + last contact */}
                          <div className="flex items-center justify-between">
                            <SourceBadge source={lead.source} />
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <FiCalendar className="w-2.5 h-2.5" />
                              {new Date(lead.lastContact).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>

                          {/* Quick action buttons */}
                          <div className="flex items-center gap-2 mt-2">
                            <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-semibold hover:bg-indigo-100 transition-colors">
                              <FiPhoneCall className="w-2.5 h-2.5" />
                              Call
                            </button>
                            <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 text-[10px] font-semibold hover:bg-emerald-100 transition-colors">
                              <FiMail className="w-2.5 h-2.5" />
                              Email
                            </button>
                            <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-600 text-[10px] font-semibold hover:bg-amber-100 transition-colors">
                              <FiMessageSquare className="w-2.5 h-2.5" />
                              Note
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ Quick Actions ═══════ */}
      <div className="thb-card p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => window.location.href = action.href}
                className="group flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all bg-white text-center"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${action.color}12` }}
                >
                  <Icon className="w-5 h-5" style={{ color: action.color }} />
                </div>
                <span className="text-xs font-semibold text-slate-800 leading-tight">{action.label}</span>
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
