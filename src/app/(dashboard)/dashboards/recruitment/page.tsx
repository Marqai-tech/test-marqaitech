'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import {
  FiBriefcase, FiFileText, FiCalendar, FiClock,
  FiUserCheck, FiTrendingUp, FiPieChart,
  FiPlus, FiUsers, FiEye, FiLayers, FiSend,
  FiBarChart2, FiChevronRight, FiVideo, FiPhone,
  FiMapPin, FiStar, FiUserPlus, FiGrid, FiSettings,
} from 'react-icons/fi';
import ModuleDashboardShell, { DashboardTabConfig } from '@/components/ModuleDashboardShell';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
/* Task 156-b — shared SmartHR widgets so this module dashboard matches the
   SmartHR design system (same banner / stat cards / panels as /dashboard). */
import {
  Panel, StatCard, StatSkeleton,
} from '@/components/dashboard/smarthr-widgets';

/* ═══════════════ helpers ═══════════════ */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Pretty-print an application source value for charts. */
function sourceLabel(source: string | null | undefined): string {
  if (!source) return 'Other';
  const map: Record<string, string> = {
    linkedin: 'LinkedIn', naukri: 'Naukri', referral: 'Referral', website: 'Website',
    indeed: 'Indeed', campus: 'Campus', portal: 'Portal', other: 'Other',
  };
  const key = source.toLowerCase();
  if (map[key]) return map[key];
  return source.charAt(0).toUpperCase() + source.slice(1);
}

const COLORS = {
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

/* ═══════════════ initial state — ALL data comes live from /api/recruitment ═══════════════
   GOLDEN RULE: no demo/sample values anywhere. Stats start at 0, charts at empty,
   and are overwritten exclusively by real tenant API data. */

const INITIAL_STATS = [
  { key: 'openPositions', label: 'Open Positions', value: 0, trend: 0, icon: FiBriefcase, color: COLORS.indigo },
  { key: 'totalApplications', label: 'Total Applications', value: 0, trend: 0, icon: FiFileText, color: COLORS.emerald },
  { key: 'interviewsScheduled', label: 'Interviews Scheduled', value: 0, trend: 0, icon: FiCalendar, color: COLORS.amber },
  { key: 'offersPending', label: 'Offers Pending', value: 0, trend: 0, icon: FiClock, color: COLORS.pink },
  { key: 'hiresThisMonth', label: 'Hires This Month', value: 0, trend: 0, icon: FiUserCheck, color: COLORS.cyan },
  { key: 'avgTimeToHire', label: 'Avg Time-to-Hire', value: 0, trend: 0, suffix: ' days', icon: FiTrendingUp, color: COLORS.violet },
];

/* Task 156-b — rotating SmartHR pastel accents for the KPI row
   (royal → emerald → orange → rose → info → violet), keyed by stat key. */
const STAT_ACCENTS: Record<string, { bg: string; ring: string }> = {
  openPositions:       { bg: 'bg-[#3A57C4]/10 text-[#3A57C4]', ring: 'ring-[#3A57C4]/20' },
  totalApplications:   { bg: 'bg-[#10B981]/10 text-[#10B981]', ring: 'ring-[#10B981]/20' },
  interviewsScheduled: { bg: 'bg-[#FF9B44]/15 text-[#FF9B44]', ring: 'ring-[#FF9B44]/20' },
  offersPending:       { bg: 'bg-[#F43F5E]/10 text-[#F43F5E]', ring: 'ring-[#F43F5E]/20' },
  hiresThisMonth:      { bg: 'bg-[#009EFB]/10 text-[#009EFB]', ring: 'ring-[#009EFB]/20' },
  avgTimeToHire:       { bg: 'bg-[#6C4FD6]/10 text-[#6C4FD6]', ring: 'ring-[#6C4FD6]/20' },
};

const QUICK_ACTIONS = [
  { label: 'Post New Job', icon: FiPlus, color: COLORS.indigo, href: '/recruitment' },
  { label: 'Schedule Interview', icon: FiCalendar, color: COLORS.emerald, href: '/recruitment' },
  { label: 'Review Applications', icon: FiEye, color: COLORS.amber, href: '/recruitment' },
  { label: 'Talent Pool', icon: FiUsers, color: COLORS.pink, href: '/recruitment' },
  { label: 'Offer Management', icon: FiSend, color: COLORS.cyan, href: '/offers' },
  { label: 'Analytics', icon: FiBarChart2, color: COLORS.violet, href: '/recruitment/analytics' },
];

/* ═══════════════ types ═══════════════ */

/* Renamed StatItem (Task 156-b) — the shared StatCard widget is imported above. */
interface StatItem {
  key: string;
  label: string;
  value: number;
  trend: number;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface Application {
  id: string;
  candidate: string;
  role: string;
  source: string;
  status: string;
  appliedDate: string;
}

interface Interview {
  id: string;
  date: string;
  time: string;
  candidate: string;
  interviewer: string;
  type: string;
}

interface QuickAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href: string;
}

/* ═══════════════ skeletons ═══════════════ */

/* Task 156-b — local StatSkeleton removed in favour of the shared widget.
   Chart / table / list skeletons restyled to the SmartHR white card look. */

function ChartSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className={`bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse ${height}`}>
      <div className="w-36 h-5 rounded bg-slate-200 mb-4" />
      <div className="flex-1 rounded bg-slate-50" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
      <div className="w-40 h-5 rounded bg-slate-200 mb-4" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 mb-3">
          <div className="w-28 h-4 rounded bg-slate-100" />
          <div className="w-24 h-4 rounded bg-slate-50" />
          <div className="w-16 h-5 rounded-full bg-slate-100" />
          <div className="w-20 h-4 rounded bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
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
      <p className="font-semibold text-thb-text-primary mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-thb-text-secondary" style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

/* ═══════════════ source badge ═══════════════ */

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    LinkedIn: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
    Naukri:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    Referral: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    Direct:   { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    Campus:   { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' },
  };
  const cls = map[source] || { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls.bg} ${cls.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cls.dot}`} />
      {source}
    </span>
  );
}

/* ═══════════════ application status badge ═══════════════ */

function AppStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    New:         { bg: 'bg-slate-50', text: 'text-slate-600' },
    Screening:   { bg: 'bg-green-50', text: 'text-green-700' },
    Shortlisted: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
    Interview:   { bg: 'bg-amber-50', text: 'text-amber-700' },
    'Offer Sent':{ bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Rejected:    { bg: 'bg-red-50', text: 'text-red-600' },
    Hired:       { bg: 'bg-green-50', text: 'text-green-700' },
  };
  const cls = map[status] || map.New;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cls.bg} ${cls.text}`}>
      {status}
    </span>
  );
}

/* ═══════════════ interview type badge ═══════════════ */

function InterviewTypeBadge({ type }: { type: string }) {
  const map: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
    Technical:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: FiLayers },
    Behavioral: { bg: 'bg-pink-50', text: 'text-pink-700', icon: FiStar },
    Video:      { bg: 'bg-cyan-50', text: 'text-cyan-700', icon: FiVideo },
    Phone:      { bg: 'bg-amber-50', text: 'text-amber-700', icon: FiPhone },
    Panel:      { bg: 'bg-teal-50', text: 'text-teal-700', icon: FiUsers },
  };
  const cfg = map[type] || { bg: 'bg-slate-50', text: 'text-slate-600', icon: FiMapPin };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon className="w-3 h-3" />
      {type}
    </span>
  );
}

/* ── Placeholder Tabs ── */

const recruitmentTabs: DashboardTabConfig[] = [
  { label: 'Overview', key: 'overview', icon: <FiGrid className="w-4 h-4" /> },
  { label: 'Reports', key: 'reports', icon: <FiFileText className="w-4 h-4" />, isNew: true },
  { label: 'Settings', key: 'settings', icon: <FiSettings className="w-4 h-4" />, isNew: true },
];

function RecruitmentReportsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg mb-4">
        <FiFileText className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Reports & Analytics</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md mb-4">
        Hiring analytics, pipeline reports, and recruitment metrics
      </p>
      <a href="/recruitment/reports" className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors">
        <FiBarChart2 className="w-4 h-4" /> Go to Reports
      </a>
    </div>
  );
}

function RecruitmentSettingsPlaceholder() {
  return (
    <div className="flex flex-col items-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-lg mb-4">
        <FiSettings className="w-7 h-7 text-white" />
      </div>
      <h3 className="text-lg font-bold text-thb-text-primary mb-1">Settings & Configuration</h3>
      <p className="text-sm text-thb-text-secondary text-center max-w-md mb-4">
        Configure hiring workflows, approval chains, and recruitment preferences
      </p>
      <a href="/recruitment/settings" className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors">
        <FiSettings className="w-4 h-4" /> Go to Settings
      </a>
    </div>
  );
}

function RecruitmentPageContent() {
  return (
    <ModuleDashboardShell
      moduleKey="recruitment"
      moduleLabel="Recruitment"
      title="Recruitment Dashboard"
      trail={['Recruitment', 'Dashboard']}
      moduleIcon={<FiUserPlus className="w-5 h-5 text-white" />}
      gradientColor="from-teal-500 to-teal-600"
      tabs={recruitmentTabs}
      overviewContent={<RecruitmentContent />}
      children={{
        reports: <RecruitmentReportsPlaceholder />,
        settings: <RecruitmentSettingsPlaceholder />,
      }}
    />
  );
}

export default function RecruitmentDashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>}>
      <RecruitmentPageContent />
    </Suspense>
  );
}

/* ── Recruitment Content ── */

function RecruitmentContent() {
  const { user } = useAuthStore();
  const { selectedCompany } = useCompanyContextStore();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatItem[]>(INITIAL_STATS.map(s => ({ ...s })));
  const [pipelineData, setPipelineData] = useState<Array<{ stage: string; count: number }>>([]);
  const [sourceData, setSourceData] = useState<Array<{ name: string; value: number }>>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<Array<{ month: string; applications: number }>>([]);
  const [recentApplications, setRecentApplications] = useState<Application[]>([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState<Interview[]>([]);
  const [quickActions] = useState<QuickAction[]>(QUICK_ACTIONS);

  const companyName = selectedCompany?.name || user?.company?.name || '3Boxes Tech';

  /* ─── fetch data ─── */
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const headers = getAuthHeaders();
        const companyId = selectedCompany?.id;

        // Fetch recruitment dashboard data
        const recRes = await fetch(`/api/recruitment${companyId ? `?companyId=${companyId}` : ''}`, { headers });
        if (!cancelled && recRes.ok) {
          const recJson = await recRes.json();

          // Map recruitment stats
          if (recJson.stats) {
            setStats(prev => prev.map(card => {
              const s = recJson.stats;
              switch (card.key) {
                case 'openPositions':     return { ...card, value: s.openPositions ?? card.value };
                case 'totalApplications': return { ...card, value: s.totalApplications ?? card.value };
                case 'interviewsScheduled': return { ...card, value: s.interviewsScheduled ?? card.value };
                case 'offersPending':     return { ...card, value: s.offersPending ?? card.value };
                case 'hiresThisMonth':    return { ...card, value: s.hiresThisMonth ?? card.value };
                case 'avgTimeToHire':     return { ...card, value: s.avgTimeToHire ?? 0 };
                default: return card;
              }
            }));
          }

          // Overwrite unconditionally — empty API data must clear stale values
          setPipelineData((recJson.pipelineData || []).map((p: { stage: string; count: number }) => ({ stage: p.stage, count: p.count })));
          setSourceData((recJson.sourceData || []).map((s: { source: string; count: number }) => ({ name: sourceLabel(s.source), value: s.count })));
          setMonthlyTrend((recJson.monthlyTrend || []).map((m: { month: string; applications: number }) => ({ month: m.month, applications: m.applications })));
          setRecentApplications((recJson.recentApplications || []).slice(0, 5).map((a: Record<string, unknown>) => ({
            id: String(a.id),
            candidate: String(a.candidateName || 'Unknown'),
            role: String(a.jobTitle || '—'),
            source: String(a.source || 'other'),
            status: String(a.status || 'applied'),
            appliedDate: a.appliedDate ? String(a.appliedDate) : '',
          })));
          setUpcomingInterviews((recJson.upcomingInterviews || []).slice(0, 5).map((iv: Record<string, unknown>) => ({
            id: String(iv.id),
            date: iv.date ? String(iv.date) : '',
            time: String(iv.time || ''),
            candidate: String(iv.candidateName || 'Candidate'),
            interviewer: String(iv.interviewer || '—'),
            type: String(iv.type || 'Interview'),
          })));
        }
      } catch {
        // Keep zeros / empty lists — never fall back to sample data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [selectedCompany?.id, user?.company?.id]);

  /* ─── pipeline conversion rates ─── */
  const pipelineConversion = useMemo(() => {
    if (!pipelineData.length) return [];
    const top = pipelineData[0].count;
    return pipelineData.map(stage => ({
      ...stage,
      rate: top > 0 ? Math.round((stage.count / top) * 100) : 0,
    }));
  }, [pipelineData]);

  /* ─── render ─── */
  return (
    <div className="space-y-6 pb-8">

      {/* Task 156 — header actions (moved from the old in-content banner; the shell now renders the SmartHR banner) */}
      <div className="flex items-center justify-between gap-2 flex-wrap -mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {companyName}
          </span>
          <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 shadow-sm">
            Q1 2026
          </span>
        </div>
      </div>

      {/* ═══════ Stat Cards — shared SmartHR StatCard (Task 156-b) ═══════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {loading
          ? [...Array(6)].map((_, i) => <StatSkeleton key={i} />)
          : stats.map((card) => {
              const Icon = card.icon;
              const isPositive = card.trend >= 0;
              const accent = STAT_ACCENTS[card.key] || STAT_ACCENTS.openPositions;
              return (
                <StatCard
                  key={card.key}
                  label={card.label}
                  value={`${card.value.toLocaleString()}${card.suffix || ''}`}
                  sub={`${isPositive ? '+' : '-'}${Math.abs(card.trend)}% trend`}
                  icon={<Icon className="w-5 h-5" />}
                  bg={accent.bg}
                  ring={accent.ring}
                />
              );
            })}
      </div>

      {/* ═══════ Charts Row 1: Pipeline + Source ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recruitment Pipeline — Funnel Bar Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <Panel
            title="Recruitment Pipeline"
            icon={<FiBarChart2 className="w-4 h-4" />}
            accent="text-[#3A57C4]"
            action={<span className="text-[11px] text-slate-400 font-medium">Current Quarter</span>}
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={pipelineConversion} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={48}>
                  {pipelineConversion.map((_, index) => {
                    const funnelColors = [COLORS.indigo, COLORS.cyan, COLORS.amber, COLORS.pink, COLORS.emerald];
                    return <Cell key={`pipe-${index}`} fill={funnelColors[index % funnelColors.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Conversion rate indicators */}
            <div className="flex items-center justify-between mt-3 px-2">
              {pipelineConversion.map((stage, index) => (
                <div key={stage.stage} className="text-center flex-1">
                  <p className="text-[10px] font-bold" style={{ color: [COLORS.indigo, COLORS.cyan, COLORS.amber, COLORS.pink, COLORS.emerald][index % 5] }}>
                    {stage.rate}%
                  </p>
                  <p className="text-[9px] text-thb-text-muted">{stage.stage}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Source Distribution — Pie Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <Panel
            title="Source Distribution"
            icon={<FiPieChart className="w-4 h-4" />}
            accent="text-[#009EFB]"
            action={<span className="text-[11px] text-slate-400 font-medium">All Applications</span>}
          >
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {sourceData.map((_, index) => (
                      <Cell key={`src-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value} apps`, name]}
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
                      <span className="text-thb-text-secondary truncate flex-1">{item.name}</span>
                      <span className="text-thb-text-primary font-semibold">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
        )}
      </div>

      {/* ═══════ Monthly Applications Trend — Area Chart ═══════ */}
      {loading ? (
        <ChartSkeleton />
      ) : (
        <Panel
          title="Monthly Applications Trend"
          icon={<FiTrendingUp className="w-4 h-4" />}
          accent="text-[#6C4FD6]"
          action={<span className="text-[11px] text-slate-400 font-medium">Last 6 Months</span>}
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyTrend} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="appTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.indigo} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={COLORS.indigo} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="applications"
                name="Applications"
                stroke={COLORS.indigo}
                strokeWidth={2.5}
                fill="url(#appTrendGrad)"
                dot={{ r: 4, fill: COLORS.indigo, stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: COLORS.indigo, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      )}

      {/* ═══════ Recent Applications + Upcoming Interviews ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Applications — 2 cols */}
        <div className="lg:col-span-2">
          {loading ? (
            <TableSkeleton />
          ) : (
            <Panel
              title="Recent Applications"
              icon={<FiFileText className="w-4 h-4" />}
              accent="text-[#10B981]"
              action={
                <button className="text-xs text-[#3A57C4] font-semibold hover:underline flex items-center gap-1">
                  View All <FiChevronRight className="w-3 h-3" />
                </button>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-thb-border">
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-thb-text-muted uppercase tracking-wider">Candidate</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-thb-text-muted uppercase tracking-wider">Role</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-thb-text-muted uppercase tracking-wider">Source</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-thb-text-muted uppercase tracking-wider">Status</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-semibold text-thb-text-muted uppercase tracking-wider">Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentApplications.map((app) => (
                      <tr key={app.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-3 font-medium text-thb-text-primary">{app.candidate}</td>
                        <td className="py-3 px-3 text-thb-text-secondary max-w-[180px] truncate">{app.role}</td>
                        <td className="py-3 px-3"><SourceBadge source={app.source} /></td>
                        <td className="py-3 px-3"><AppStatusBadge status={app.status} /></td>
                        <td className="py-3 px-3 text-thb-text-secondary text-xs whitespace-nowrap">
                          {new Date(app.appliedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>

        {/* Upcoming Interviews — 1 col */}
        <div>
          {loading ? (
            <ListSkeleton />
          ) : (
            <Panel
              title="Upcoming Interviews"
              icon={<FiCalendar className="w-4 h-4" />}
              accent="text-[#FF9B44]"
              action={
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#10B981]/10 text-[#10B981] text-[10px] font-bold">
                  {upcomingInterviews.length}
                </span>
              }
            >
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {upcomingInterviews.map((interview) => {
                  const dateObj = new Date(interview.date);
                  const dayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  return (
                    <div
                      key={interview.id}
                      className="rounded-xl border border-slate-100 p-3 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {/* Date indicator */}
                        <div className="flex flex-col items-center justify-center w-11 h-11 rounded-lg bg-emerald-50 flex-shrink-0">
                          <span className="text-[10px] font-bold text-emerald-600 leading-none">
                            {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                          <span className="text-sm font-extrabold text-emerald-700 leading-tight">
                            {dateObj.getDate()}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-xs font-semibold text-thb-text-primary truncate">{interview.candidate}</p>
                            <InterviewTypeBadge type={interview.type} />
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-thb-text-secondary">
                            <FiClock className="w-3 h-3 flex-shrink-0" />
                            <span>{dayLabel} · {interview.time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-thb-text-muted mt-0.5">
                            <FiUsers className="w-3 h-3 flex-shrink-0" />
                            <span>{interview.interviewer}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* ═══════ Quick Actions ═══════ */}
      <Panel title="Quick Actions" icon={<FiGrid className="w-4 h-4" />} accent="text-[#FFC107]">
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
                <span className="text-xs font-semibold text-thb-text-primary leading-tight">{action.label}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* ═══════ Footer ═══════ */}
      <div className="text-center text-[11px] text-thb-text-muted pt-2">
        Powered by <span className="font-bold text-thb-text-secondary">3Boxes HRMS</span>
      </div>
    </div>
  );
}
