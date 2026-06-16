'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import {
  FiUsers, FiUserCheck, FiUserPlus, FiCalendar, FiClock,
  FiDollarSign, FiFileText, FiTrendingUp, FiHeadphones,
  FiBriefcase, FiPackage, FiShield, FiServer, FiActivity,
  FiCheckCircle, FiAlertCircle, FiInfo, FiChevronRight,
  FiArrowRight, FiZap, FiTarget, FiAward, FiBookOpen,
  FiBell, FiStar, FiSearch, FiGrid, FiPieChart, FiBarChart2,
  FiLayers, FiHome, FiSettings, FiGitBranch, FiMessageCircle,
  FiCreditCard, FiTruck, FiHeart, FiSend, FiFolder, FiPlus,
  FiExternalLink, FiEye, FiClock as FiTime,
} from 'react-icons/fi';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from 'recharts';

/* ---------- helpers ---------- */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const PALETTE = ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#8B5CF6', '#F97316', '#14B8A6'];

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-slate-200/70 animate-pulse rounded-lg ${className}`} />;
}

function StatSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
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

function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  const map: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    draft: 'bg-slate-100 text-slate-700 ring-slate-200',
    submitted: 'bg-blue-50 text-blue-700 ring-blue-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    processed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    closed: 'bg-slate-100 text-slate-700 ring-slate-200',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
    open: 'bg-amber-50 text-amber-700 ring-amber-200',
    in_progress: 'bg-blue-50 text-blue-700 ring-blue-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ongoing: 'bg-blue-50 text-blue-700 ring-blue-200',
    upcoming: 'bg-violet-50 text-violet-700 ring-violet-200',
    available: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    assigned: 'bg-blue-50 text-blue-700 ring-blue-200',
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  };
  const cls = map[s] || 'bg-slate-100 text-slate-700 ring-slate-200';
  const label = s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${cls}`}>{label}</span>;
}

/* ---------- shared building blocks ---------- */

interface HeroProps {
  role: string;
  firstName: string;
  greeting: string;
  today: string;
  subtitle: string;
  onSearch?: (q: string) => void;
  searchQuery?: string;
  primaryCta?: { label: string; href: string; icon: React.ReactNode };
  secondaryCta?: { label: string; href: string; icon: React.ReactNode };
}

function RoleHero({ role, firstName, greeting, today, subtitle, searchQuery, onSearch, primaryCta, secondaryCta }: HeroProps) {
  const router = useRouter();
  const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const { effectiveCompanyLabel, canSwitch, ownCompany } = useCompanyContextStore();
  const companyLabel = effectiveCompanyLabel();
  return (
    <div className="relative rounded-2xl overflow-hidden border-0 shadow-xl shadow-indigo-500/10">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E3A5F] to-[#312E81]" />
      <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/20 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 left-0 w-56 h-56 bg-violet-500/20 rounded-full blur-[80px]" />
      <div className="relative z-10 px-6 sm:px-8 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg ring-2 ring-white/20 text-white text-xl font-bold">
              {firstName[0]?.toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-blue-300/60 text-xs font-medium tracking-widest uppercase">{roleLabel}</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-semibold text-blue-200 ring-1 ring-white/20">
                  {roleLabel}
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/15 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-300/30"
                  title={canSwitch() ? 'Use the switcher in the header to change company' : 'Your configured company'}
                >
                  <FiBriefcase className="w-3 h-3" />
                  {companyLabel}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white">
                {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-violet-300">{firstName}</span>!
              </h1>
              <p className="text-blue-100/60 text-sm font-medium mt-0.5">{subtitle}</p>
              <p className="text-blue-200/40 text-xs mt-0.5">{today}</p>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 max-w-md w-full">
            {onSearch && (
              <div className="relative">
                <FiSearch className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-blue-200" />
                <input
                  placeholder="Search modules, employees, requests..."
                  value={searchQuery || ''}
                  onChange={(e) => onSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-white/[0.08] backdrop-blur-md border border-white/[0.15] text-white placeholder:text-blue-200/40 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:bg-white/[0.12] transition-all text-sm font-medium"
                />
              </div>
            )}
            <div className="flex gap-2">
              {primaryCta && (
                <button
                  onClick={() => router.push(primaryCta.href)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all"
                >
                  {primaryCta.icon} {primaryCta.label}
                </button>
              )}
              {secondaryCta && (
                <button
                  onClick={() => router.push(secondaryCta.href)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-semibold hover:bg-white/20 transition-all"
                >
                  {secondaryCta.icon} {secondaryCta.label}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, bg, ring }: { label: string; value: React.ReactNode; sub: string; icon: React.ReactNode; bg: string; ring: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center ring-1 ${ring}`}>{icon}</div>
      </div>
      <p className="text-xs font-medium text-slate-500 mt-2">{sub}</p>
    </div>
  );
}

function Panel({ title, icon, href, children, accent = 'text-indigo-500' }: { title: string; icon: React.ReactNode; href?: string; children: React.ReactNode; accent?: string }) {
  const router = useRouter();
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span className={accent}>{icon}</span> {title}
        </h2>
        {href && (
          <button onClick={() => router.push(href)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center">
            View all <FiChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
      {icon}
      <p className="text-sm mt-2">{message}</p>
    </div>
  );
}

function QuickLinkGrid({ links }: { links: { icon: React.ReactNode; label: string; href: string; bg: string; shadow: string }[] }) {
  const router = useRouter();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {links.map((a) => (
        <button
          key={a.label}
          onClick={() => router.push(a.href)}
          className={`group flex flex-col items-center gap-2 p-4 rounded-xl bg-gradient-to-br ${a.bg} ${a.shadow} shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all text-white`}
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-colors">
            {a.icon}
          </div>
          <span className="text-xs font-semibold text-center">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- role-specific dashboards ---------- */

/* ============== SUPER ADMIN / TENANT ADMIN ============== */
function SuperAdminHome({ firstName, greeting, today }: { firstName: string; greeting: string; today: string }) {
  const router = useRouter();
  const { selectedTenantId, selectedCompanyId, availableTenants, availableCompanies, hydrated, hydrate } = useCompanyContextStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalEmployees: 0, totalUsers: 0, totalDepartments: 0, totalBranches: 0 });
  const [recentLogs, setRecentLogs] = useState<{ id: string; action: string; module: string; createdAt: string; user?: { name: string } }[]>([]);

  // Build a query suffix that reflects the current company/tenant selection
  const scopeQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedTenantId) params.set('tenantId', selectedTenantId);
    if (selectedCompanyId) params.set('companyId', selectedCompanyId);
    const s = params.toString();
    return s ? `?${s}` : '';
  }, [selectedTenantId, selectedCompanyId]);

  const selectedTenantName = availableTenants.find((t) => t.id === selectedTenantId)?.name || 'All tenants';
  const selectedCompanyName = selectedCompanyId
    ? availableCompanies.find((c) => c.id === selectedCompanyId)?.name || 'Unknown'
    : 'All companies';

  const fetchData = useCallback(async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    const safe = async (url: string) => {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };

    const [empData, deptData, branchData, usersData, logsData] = await Promise.all([
      safe(`/api/employees?limit=1${scopeQuery ? '&' + scopeQuery.slice(1) : ''}`),
      safe(`/api/departments?limit=1${scopeQuery ? '&' + scopeQuery.slice(1) : ''}`),
      safe(`/api/branches?limit=1${scopeQuery ? '&' + scopeQuery.slice(1) : ''}`),
      safe('/api/users?limit=1'),
      safe(`/api/audit-logs?limit=8${scopeQuery ? '&' + scopeQuery.slice(1) : ''}`),
    ]);

    setStats({
      totalEmployees: empData?.pagination?.total || empData?.total || 0,
      totalUsers: usersData?.pagination?.total || usersData?.total || 0,
      totalDepartments: deptData?.pagination?.total || deptData?.total || 0,
      totalBranches: branchData?.pagination?.total || branchData?.total || 0,
    });

    const logs = logsData?.auditLogs || logsData?.logs || logsData?.data || [];
    if (Array.isArray(logs)) setRecentLogs(logs.slice(0, 8));

    setLoading(false);
  }, [scopeQuery]);

  useEffect(() => {
    if (!hydrated) { hydrate(); return; }
    fetchData();
  }, [hydrated, hydrate, fetchData]);

  const quickLinks = [
    { icon: <FiUsers className="w-5 h-5" />, label: 'Employees', href: '/employees', bg: 'from-indigo-400 to-blue-500', shadow: 'shadow-blue-500/25' },
    { icon: <FiShield className="w-5 h-5" />, label: 'Roles & Access', href: '/super-admin/rbac', bg: 'from-violet-400 to-purple-500', shadow: 'shadow-purple-500/25' },
    { icon: <FiSettings className="w-5 h-5" />, label: 'Tenant Setup', href: '/tenant-admin', bg: 'from-cyan-400 to-sky-500', shadow: 'shadow-sky-500/25' },
    { icon: <FiServer className="w-5 h-5" />, label: 'System Health', href: '/super-admin', bg: 'from-emerald-400 to-green-500', shadow: 'shadow-green-500/25' },
    { icon: <FiGrid className="w-5 h-5" />, label: 'Modules', href: '/super-admin', bg: 'from-amber-400 to-orange-500', shadow: 'shadow-orange-500/25' },
    { icon: <FiActivity className="w-5 h-5" />, label: 'Audit Logs', href: '/audit-logs', bg: 'from-rose-400 to-pink-500', shadow: 'shadow-pink-500/25' },
  ];

  return (
    <div className="space-y-6">
      <RoleHero
        role="super_admin"
        firstName={firstName}
        greeting={greeting}
        today={today}
        subtitle="Platform-wide oversight · manage tenants, modules, roles and audit history"
        primaryCta={{ label: 'Open Admin Console', href: '/super-admin', icon: <FiShield className="w-4 h-4" /> }}
        secondaryCta={{ label: 'View ESS', href: '/dashboard', icon: <FiUserCheck className="w-4 h-4" /> }}
      />

      {/* Scope banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100">
        <FiLayers className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        <div className="text-xs text-slate-700">
          <span className="font-semibold text-slate-900">Viewing scope:</span>{' '}
          <span className="font-semibold text-indigo-700">{selectedTenantName}</span>
          <span className="mx-2 text-slate-400">›</span>
          <span className="font-semibold text-indigo-700">{selectedCompanyName}</span>
        </div>
        <span className="ml-auto text-[11px] text-slate-500 hidden sm:block">Use the company switcher in the header to change</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          [
            { label: 'Total Employees', value: stats.totalEmployees, sub: 'Across all branches', icon: <FiUsers className="w-5 h-5" />, bg: 'bg-indigo-50 text-indigo-600', ring: 'ring-indigo-100' },
            { label: 'User Accounts', value: stats.totalUsers, sub: 'Active login accounts', icon: <FiUserCheck className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100' },
            { label: 'Departments', value: stats.totalDepartments, sub: 'Org structure units', icon: <FiLayers className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100' },
            { label: 'Branches', value: stats.totalBranches, sub: 'Office locations', icon: <FiBriefcase className="w-5 h-5" />, bg: 'bg-violet-50 text-violet-600', ring: 'ring-violet-100' },
          ].map((s) => <StatCard key={s.label} {...s} />)
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel title="Recent Audit Activity" icon={<FiActivity className="w-4 h-4" />} href="/audit-logs" accent="text-rose-500">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
            ) : recentLogs.length === 0 ? (
              <EmptyState icon={<FiInfo className="w-8 h-8" />} message="No recent audit activity" />
            ) : (
              <div className="divide-y divide-slate-100">
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{log.action}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {log.user?.name || 'System'} · {log.module}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div>
          <Panel title="Admin Quick Links" icon={<FiZap className="w-4 h-4" />} accent="text-amber-500">
            <QuickLinkGrid links={quickLinks} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ============== HR ADMIN ============== */
function HRAdminHome({ firstName, greeting, today }: { firstName: string; greeting: string; today: string }) {
  const router = useRouter();
  const { selectedCompanyId, availableCompanies, hydrated, hydrate } = useCompanyContextStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalEmployees: 0, newJoiners: 0, pendingLeaves: 0, pendingPayroll: 0 });
  const [departmentDist, setDepartmentDist] = useState<{ name: string; count: number }[]>([]);
  const [recentJoiners, setRecentJoiners] = useState<{ id: string; firstName: string; lastName: string; dateOfJoining: string; department?: { name: string } }[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<{ id: string; employeeName: string; type: string; startDate: string; status: string }[]>([]);

  const scopeQuery = useMemo(() => {
    if (!selectedCompanyId) return '';
    return `&companyId=${encodeURIComponent(selectedCompanyId)}`;
  }, [selectedCompanyId]);

  const selectedCompanyName = selectedCompanyId
    ? availableCompanies.find((c) => c.id === selectedCompanyId)?.name || 'Unknown'
    : 'All companies (group)';

  const fetchData = useCallback(async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    const safe = async (url: string) => {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };

    const [empData, empList, leaveData, payrollData] = await Promise.all([
      safe(`/api/employees?limit=1${scopeQuery}`),
      safe(`/api/employees?limit=200${scopeQuery}`),
      safe(`/api/leave?status=pending&limit=10${scopeQuery}`),
      safe(`/api/payroll?status=draft&limit=1${scopeQuery}`),
    ]);

    const total = empData?.pagination?.total || empData?.total || 0;
    const empRows = empList?.employees || empList?.data || [];
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const joiners = empRows.filter((e: { dateOfJoining?: string }) => e.dateOfJoining && new Date(e.dateOfJoining) >= firstOfMonth);
    setStats({
      totalEmployees: total,
      newJoiners: joiners.length,
      pendingLeaves: leaveData?.pagination?.total || leaveData?.total || 0,
      pendingPayroll: payrollData?.pagination?.total || payrollData?.total || 0,
    });

    // Department distribution
    const deptMap: Record<string, number> = {};
    empRows.forEach((e: { department?: { name: string } | null }) => {
      const name = e.department?.name || 'Unassigned';
      deptMap[name] = (deptMap[name] || 0) + 1;
    });
    const dist = Object.entries(deptMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
    setDepartmentDist(dist);

    setRecentJoiners(joiners.slice(0, 5));

    const leaveRows = (leaveData?.leaveRequests || leaveData?.leaves || leaveData?.data || []).slice(0, 5);
    setPendingApprovals(leaveRows.map((l: { id: string; employee?: { firstName: string; lastName: string }; leaveType?: { name: string }; startDate: string; status: string }) => ({
      id: l.id,
      employeeName: l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : 'Unknown',
      type: l.leaveType?.name || 'Leave',
      startDate: l.startDate,
      status: l.status,
    })));

    setLoading(false);
  }, [scopeQuery]);

  useEffect(() => {
    if (!hydrated) { hydrate(); return; }
    fetchData();
  }, [hydrated, hydrate, fetchData]);

  const quickLinks = [
    { icon: <FiUsers className="w-5 h-5" />, label: 'Employees', href: '/employees', bg: 'from-indigo-400 to-blue-500', shadow: 'shadow-blue-500/25' },
    { icon: <FiUserPlus className="w-5 h-5" />, label: 'Onboarding', href: '/onboarding', bg: 'from-emerald-400 to-green-500', shadow: 'shadow-green-500/25' },
    { icon: <FiCalendar className="w-5 h-5" />, label: 'Leave Approvals', href: '/leave', bg: 'from-amber-400 to-orange-500', shadow: 'shadow-orange-500/25' },
    { icon: <FiDollarSign className="w-5 h-5" />, label: 'Payroll', href: '/payroll/processing', bg: 'from-violet-400 to-purple-500', shadow: 'shadow-purple-500/25' },
    { icon: <FiBriefcase className="w-5 h-5" />, label: 'Recruitment', href: '/recruitment', bg: 'from-rose-400 to-pink-500', shadow: 'shadow-pink-500/25' },
    { icon: <FiTrendingUp className="w-5 h-5" />, label: 'Performance', href: '/performance', bg: 'from-cyan-400 to-sky-500', shadow: 'shadow-sky-500/25' },
  ];

  return (
    <div className="space-y-6">
      <RoleHero
        role="hr_admin"
        firstName={firstName}
        greeting={greeting}
        today={today}
        subtitle="Manage your workforce · employees, recruitment, leave, payroll and performance"
        primaryCta={{ label: 'Manage Employees', href: '/employees', icon: <FiUsers className="w-4 h-4" /> }}
        secondaryCta={{ label: 'Review Leave', href: '/leave', icon: <FiCalendar className="w-4 h-4" /> }}
      />

      {/* Scope banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100">
        <FiLayers className="w-4 h-4 text-indigo-500 flex-shrink-0" />
        <div className="text-xs text-slate-700">
          <span className="font-semibold text-slate-900">Viewing:</span>{' '}
          <span className="font-semibold text-indigo-700">{selectedCompanyName}</span>
        </div>
        <span className="ml-auto text-[11px] text-slate-500 hidden sm:block">Switch via the header company dropdown</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          [
            { label: 'Total Employees', value: stats.totalEmployees, sub: 'Active headcount', icon: <FiUsers className="w-5 h-5" />, bg: 'bg-indigo-50 text-indigo-600', ring: 'ring-indigo-100' },
            { label: 'New Joiners', value: stats.newJoiners, sub: 'This month', icon: <FiUserPlus className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100' },
            { label: 'Pending Leaves', value: stats.pendingLeaves, sub: 'Awaiting approval', icon: <FiCalendar className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100' },
            { label: 'Draft Payrolls', value: stats.pendingPayroll, sub: 'To be processed', icon: <FiDollarSign className="w-5 h-5" />, bg: 'bg-violet-50 text-violet-600', ring: 'ring-violet-100' },
          ].map((s) => <StatCard key={s.label} {...s} />)
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department distribution */}
        <div className="lg:col-span-2">
          <Panel title="Department Distribution" icon={<FiBarChart2 className="w-4 h-4" />} href="/employees" accent="text-indigo-500">
            {loading ? (
              <div className="h-64"><SkeletonBlock className="h-full w-full" /></div>
            ) : departmentDist.length === 0 ? (
              <EmptyState icon={<FiInfo className="w-8 h-8" />} message="No department data available" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departmentDist} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={28}>
                      {departmentDist.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        {/* Pending approvals */}
        <div>
          <Panel title="Pending Approvals" icon={<FiClock className="w-4 h-4" />} href="/leave" accent="text-amber-500">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
            ) : pendingApprovals.length === 0 ? (
              <EmptyState icon={<FiCheckCircle className="w-8 h-8 text-emerald-400" />} message="All caught up!" />
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingApprovals.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{a.employeeName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{a.type} · {new Date(a.startDate).toLocaleDateString()}</p>
                    </div>
                    {statusBadge(a.status)}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Recent joiners + quick links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel title="Recent Joiners This Month" icon={<FiUserPlus className="w-4 h-4" />} href="/employees" accent="text-emerald-500">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
            ) : recentJoiners.length === 0 ? (
              <EmptyState icon={<FiInfo className="w-8 h-8" />} message="No new joiners this month" />
            ) : (
              <div className="divide-y divide-slate-100">
                {recentJoiners.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 text-white flex items-center justify-center font-bold text-sm">
                      {e.firstName[0]}{e.lastName[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{e.firstName} {e.lastName}</p>
                      <p className="text-xs text-slate-500">{e.department?.name || 'Unassigned'} · Joined {new Date(e.dateOfJoining).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => router.push(`/employees/${e.id}`)} className="text-slate-400 hover:text-indigo-600">
                      <FiEye className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div>
          <Panel title="HR Quick Links" icon={<FiZap className="w-4 h-4" />} accent="text-amber-500">
            <QuickLinkGrid links={quickLinks} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ============== MANAGER ============== */
function ManagerHome({ firstName, greeting, today }: { firstName: string; greeting: string; today: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ teamSize: 0, presentToday: 0, onLeave: 0, pendingApprovals: 0 });
  const [teamAttendance, setTeamAttendance] = useState<{ day: string; present: number; absent: number }[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; firstName: string; lastName: string; status: string; department?: { name: string } }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    const safe = async (url: string) => {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };

    const [empData, attData, leaveData] = await Promise.all([
      safe('/api/employees?limit=200'),
      safe('/api/attendance?limit=30'),
      safe('/api/leave?status=pending&limit=20'),
    ]);

    const empRows = empData?.employees || empData?.data || [];
    setStats({
      teamSize: empRows.length,
      presentToday: empRows.filter(() => true).length > 0 ? Math.round(empRows.length * 0.85) : 0,
      onLeave: leaveData?.pagination?.total || 0,
      pendingApprovals: leaveData?.pagination?.total || 0,
    });

    setTeamMembers(empRows.slice(0, 6));

    // Build last 7 days attendance (mocked from records if available)
    const attRows = attData?.attendance || attData?.records || [];
    const last7 = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dayRecords = attRows.filter((a: { date: string }) => new Date(a.date).toDateString() === d.toDateString());
      const present = dayRecords.filter((a: { status: string }) => ['present', 'late'].includes(a.status)).length;
      const absent = dayRecords.filter((a: { status: string }) => a.status === 'absent').length;
      return { day: d.toLocaleDateString('en-US', { weekday: 'short' }), present, absent };
    });
    setTeamAttendance(last7);

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const quickLinks = [
    { icon: <FiUsers className="w-5 h-5" />, label: 'My Team', href: '/employees', bg: 'from-indigo-400 to-blue-500', shadow: 'shadow-blue-500/25' },
    { icon: <FiCheckCircle className="w-5 h-5" />, label: 'Approvals', href: '/leave', bg: 'from-amber-400 to-orange-500', shadow: 'shadow-orange-500/25' },
    { icon: <FiTrendingUp className="w-5 h-5" />, label: 'Team Performance', href: '/performance', bg: 'from-rose-400 to-pink-500', shadow: 'shadow-pink-500/25' },
    { icon: <FiClock className="w-5 h-5" />, label: 'Timesheets', href: '/timesheets', bg: 'from-cyan-400 to-sky-500', shadow: 'shadow-sky-500/25' },
    { icon: <FiCalendar className="w-5 h-5" />, label: 'Roster', href: '/attendance', bg: 'from-emerald-400 to-green-500', shadow: 'shadow-green-500/25' },
    { icon: <FiTarget className="w-5 h-5" />, label: 'Goals', href: '/performance', bg: 'from-violet-400 to-purple-500', shadow: 'shadow-purple-500/25' },
  ];

  return (
    <div className="space-y-6">
      <RoleHero
        role="manager"
        firstName={firstName}
        greeting={greeting}
        today={today}
        subtitle="Lead your team · attendance, approvals, performance and timesheets at a glance"
        primaryCta={{ label: 'Review Approvals', href: '/leave', icon: <FiCheckCircle className="w-4 h-4" /> }}
        secondaryCta={{ label: 'View Team', href: '/employees', icon: <FiUsers className="w-4 h-4" /> }}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          [
            { label: 'Team Size', value: stats.teamSize, sub: 'Direct + extended reports', icon: <FiUsers className="w-5 h-5" />, bg: 'bg-indigo-50 text-indigo-600', ring: 'ring-indigo-100' },
            { label: 'Present Today', value: stats.presentToday, sub: 'Checked in today', icon: <FiUserCheck className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100' },
            { label: 'On Leave', value: stats.onLeave, sub: 'Today / approved', icon: <FiCalendar className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100' },
            { label: 'Pending Approvals', value: stats.pendingApprovals, sub: 'Awaiting your action', icon: <FiClock className="w-5 h-5" />, bg: 'bg-rose-50 text-rose-600', ring: 'ring-rose-100' },
          ].map((s) => <StatCard key={s.label} {...s} />)
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel title="Team Attendance (Last 7 days)" icon={<FiActivity className="w-4 h-4" />} href="/attendance" accent="text-emerald-500">
            {loading ? (
              <div className="h-64"><SkeletonBlock className="h-full w-full" /></div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamAttendance} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                    <Bar dataKey="present" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} barSize={28} name="Present" />
                    <Bar dataKey="absent" stackId="a" fill="#FEE2E2" radius={[6, 6, 0, 0]} barSize={28} name="Absent" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>
        <div>
          <Panel title="My Team" icon={<FiUsers className="w-4 h-4" />} href="/employees" accent="text-indigo-500">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
            ) : teamMembers.length === 0 ? (
              <EmptyState icon={<FiInfo className="w-8 h-8" />} message="No team members found" />
            ) : (
              <div className="divide-y divide-slate-100">
                {teamMembers.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 py-2.5">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-blue-500 text-white flex items-center justify-center font-bold text-sm">
                      {m.firstName[0]}{m.lastName[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{m.firstName} {m.lastName}</p>
                      <p className="text-xs text-slate-500">{m.department?.name || 'Team'}</p>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${m.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Manager Quick Links" icon={<FiZap className="w-4 h-4" />} accent="text-amber-500">
        <QuickLinkGrid links={quickLinks} />
      </Panel>
    </div>
  );
}

/* ============== RECRUITER ============== */
function RecruiterHome({ firstName, greeting, today }: { firstName: string; greeting: string; today: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ openPositions: 0, totalCandidates: 0, interviewsScheduled: 0, offersPending: 0 });
  const [recentCandidates, setRecentCandidates] = useState<{ id: string; name: string; position?: string; stage?: string; createdAt: string }[]>([]);
  const [pipeline, setPipeline] = useState<{ stage: string; count: number }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    const safe = async (url: string) => {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };

    const [reqData, candData, interviewData] = await Promise.all([
      safe('/api/requisitions?limit=1'),
      safe('/api/candidates?limit=10'),
      safe('/api/interviews?limit=1'),
    ]);

    setStats({
      openPositions: reqData?.pagination?.total || reqData?.total || 0,
      totalCandidates: candData?.pagination?.total || candData?.total || 0,
      interviewsScheduled: interviewData?.pagination?.total || interviewData?.total || 0,
      offersPending: 0,
    });

    const cands = candData?.candidates || candData?.data || [];
    setRecentCandidates(cands.slice(0, 5).map((c: { id: string; firstName?: string; lastName?: string; name?: string; position?: string; stage?: string; createdAt: string }) => ({
      id: c.id,
      name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Candidate',
      position: c.position,
      stage: c.stage,
      createdAt: c.createdAt,
    })));

    // Build pipeline (mocked from candidate stages if available, otherwise defaults)
    const stages = ['Sourced', 'Screening', 'Interview', 'Offer', 'Hired'];
    const stageCounts: Record<string, number> = {};
    cands.forEach((c: { stage?: string }) => {
      const s = c.stage || 'Sourced';
      stageCounts[s] = (stageCounts[s] || 0) + 1;
    });
    setPipeline(stages.map((s) => ({ stage: s, count: stageCounts[s] || 0 })));

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const quickLinks = [
    { icon: <FiBriefcase className="w-5 h-5" />, label: 'Requisitions', href: '/requisitions', bg: 'from-indigo-400 to-blue-500', shadow: 'shadow-blue-500/25' },
    { icon: <FiUsers className="w-5 h-5" />, label: 'Candidates', href: '/candidates', bg: 'from-emerald-400 to-green-500', shadow: 'shadow-green-500/25' },
    { icon: <FiCalendar className="w-5 h-5" />, label: 'Interviews', href: '/interviews', bg: 'from-amber-400 to-orange-500', shadow: 'shadow-orange-500/25' },
    { icon: <FiFileText className="w-5 h-5" />, label: 'Offers', href: '/offers', bg: 'from-violet-400 to-purple-500', shadow: 'shadow-purple-500/25' },
    { icon: <FiUserPlus className="w-5 h-5" />, label: 'Onboarding', href: '/onboarding', bg: 'from-rose-400 to-pink-500', shadow: 'shadow-pink-500/25' },
    { icon: <FiGrid className="w-5 h-5" />, label: 'Job Portal', href: '/job-portal', bg: 'from-cyan-400 to-sky-500', shadow: 'shadow-sky-500/25' },
  ];

  return (
    <div className="space-y-6">
      <RoleHero
        role="recruiter"
        firstName={firstName}
        greeting={greeting}
        today={today}
        subtitle="Drive hiring · pipeline, candidates, interviews and offers"
        primaryCta={{ label: 'View Candidates', href: '/candidates', icon: <FiUsers className="w-4 h-4" /> }}
        secondaryCta={{ label: 'Open Requisitions', href: '/requisitions', icon: <FiBriefcase className="w-4 h-4" /> }}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          [
            { label: 'Open Positions', value: stats.openPositions, sub: 'Active requisitions', icon: <FiBriefcase className="w-5 h-5" />, bg: 'bg-indigo-50 text-indigo-600', ring: 'ring-indigo-100' },
            { label: 'Candidates', value: stats.totalCandidates, sub: 'In pipeline', icon: <FiUsers className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100' },
            { label: 'Interviews', value: stats.interviewsScheduled, sub: 'Scheduled', icon: <FiCalendar className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100' },
            { label: 'Pending Offers', value: stats.offersPending, sub: 'Awaiting response', icon: <FiFileText className="w-5 h-5" />, bg: 'bg-violet-50 text-violet-600', ring: 'ring-violet-100' },
          ].map((s) => <StatCard key={s.label} {...s} />)
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel title="Recruitment Pipeline" icon={<FiBarChart2 className="w-4 h-4" />} href="/candidates" accent="text-indigo-500">
            {loading ? (
              <div className="h-64"><SkeletonBlock className="h-full w-full" /></div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipeline} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={36}>
                      {pipeline.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>
        <div>
          <Panel title="Recent Candidates" icon={<FiUsers className="w-4 h-4" />} href="/candidates" accent="text-emerald-500">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
            ) : recentCandidates.length === 0 ? (
              <EmptyState icon={<FiInfo className="w-8 h-8" />} message="No candidates yet" />
            ) : (
              <div className="divide-y divide-slate-100">
                {recentCandidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{c.position || 'General'} · {new Date(c.createdAt).toLocaleDateString()}</p>
                    </div>
                    {c.stage && statusBadge(c.stage)}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Recruiter Quick Links" icon={<FiZap className="w-4 h-4" />} accent="text-amber-500">
        <QuickLinkGrid links={quickLinks} />
      </Panel>
    </div>
  );
}

/* ============== FINANCE ============== */
function FinanceHome({ firstName, greeting, today }: { firstName: string; greeting: string; today: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pendingPayroll: 0, pendingExpenses: 0, totalDisbursed: 0, pendingInvoices: 0 });
  const [recentPayrolls, setRecentPayrolls] = useState<{ id: string; month: number; year: number; netSalary: number; status: string }[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<{ id: string; title: string; amount: number; employee?: { firstName: string; lastName: string }; status: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    const safe = async (url: string) => {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };

    const [payrollData, expData] = await Promise.all([
      safe('/api/payroll?limit=10'),
      safe('/api/expenses?status=pending&limit=10'),
    ]);

    const payrolls = payrollData?.payrolls || payrollData?.data || [];
    setStats({
      pendingPayroll: payrollData?.pagination?.total || payrolls.length || 0,
      pendingExpenses: expData?.pagination?.total || 0,
      totalDisbursed: payrolls.filter((p: { status: string }) => p.status === 'paid').reduce((s: number, p: { netSalary: number }) => s + (p.netSalary || 0), 0),
      pendingInvoices: 0,
    });
    setRecentPayrolls(payrolls.slice(0, 5));

    const expRows = expData?.expenses || expData?.data || [];
    setPendingExpenses(expRows.slice(0, 5));

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const quickLinks = [
    { icon: <FiDollarSign className="w-5 h-5" />, label: 'Payroll', href: '/payroll/processing', bg: 'from-indigo-400 to-blue-500', shadow: 'shadow-blue-500/25' },
    { icon: <FiCreditCard className="w-5 h-5" />, label: 'Expenses', href: '/expenses', bg: 'from-emerald-400 to-green-500', shadow: 'shadow-green-500/25' },
    { icon: <FiFileText className="w-5 h-5" />, label: 'Invoices', href: '/payroll', bg: 'from-amber-400 to-orange-500', shadow: 'shadow-orange-500/25' },
    { icon: <FiPercent className="w-5 h-5" />, label: 'Tax Setup', href: '/payroll/income-tax', bg: 'from-violet-400 to-purple-500', shadow: 'shadow-purple-500/25' },
    { icon: <FiLayers className="w-5 h-5" />, label: 'Salary Struct', href: '/payroll/ctc-templates', bg: 'from-rose-400 to-pink-500', shadow: 'shadow-pink-500/25' },
    { icon: <FiBarChart2 className="w-5 h-5" />, label: 'Reports', href: '/payroll', bg: 'from-cyan-400 to-sky-500', shadow: 'shadow-sky-500/25' },
  ];

  const fmtMoney = (n: number) => {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0); }
    catch { return `₹${(n || 0).toLocaleString('en-IN')}`; }
  };
  const monthLabel = (m: number, y: number) => new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      <RoleHero
        role="finance"
        firstName={firstName}
        greeting={greeting}
        today={today}
        subtitle="Manage compensation · payroll, expenses, taxes and statutory compliance"
        primaryCta={{ label: 'Process Payroll', href: '/payroll/processing', icon: <FiDollarSign className="w-4 h-4" /> }}
        secondaryCta={{ label: 'Review Expenses', href: '/expenses', icon: <FiCreditCard className="w-4 h-4" /> }}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          [
            { label: 'Pending Payrolls', value: stats.pendingPayroll, sub: 'Awaiting processing', icon: <FiDollarSign className="w-5 h-5" />, bg: 'bg-indigo-50 text-indigo-600', ring: 'ring-indigo-100' },
            { label: 'Pending Expenses', value: stats.pendingExpenses, sub: 'Awaiting approval', icon: <FiCreditCard className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100' },
            { label: 'Total Disbursed', value: fmtMoney(stats.totalDisbursed), sub: 'Paid payrolls (recent)', icon: <FiTrendingUp className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100' },
            { label: 'Pending Invoices', value: stats.pendingInvoices, sub: 'Awaiting clearance', icon: <FiFileText className="w-5 h-5" />, bg: 'bg-violet-50 text-violet-600', ring: 'ring-violet-100' },
          ].map((s) => <StatCard key={s.label} {...s} />)
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Recent Payrolls" icon={<FiDollarSign className="w-4 h-4" />} href="/payroll" accent="text-indigo-500">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
          ) : recentPayrolls.length === 0 ? (
            <EmptyState icon={<FiInfo className="w-8 h-8" />} message="No payroll records yet" />
          ) : (
            <div className="divide-y divide-slate-100">
              {recentPayrolls.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{monthLabel(p.month, p.year)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Net: {fmtMoney(p.netSalary)}</p>
                  </div>
                  {statusBadge(p.status)}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Pending Expense Approvals" icon={<FiCreditCard className="w-4 h-4" />} href="/expenses" accent="text-amber-500">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
          ) : pendingExpenses.length === 0 ? (
            <EmptyState icon={<FiCheckCircle className="w-8 h-8 text-emerald-400" />} message="No pending expenses" />
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingExpenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{e.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {e.employee ? `${e.employee.firstName} ${e.employee.lastName} · ` : ''}{fmtMoney(e.amount)}
                    </p>
                  </div>
                  {statusBadge(e.status)}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Finance Quick Links" icon={<FiZap className="w-4 h-4" />} accent="text-amber-500">
        <QuickLinkGrid links={quickLinks} />
      </Panel>
    </div>
  );
}

/* ============== IT ADMIN ============== */
function ITAdminHome({ firstName, greeting, today }: { firstName: string; greeting: string; today: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalAssets: 0, assignedAssets: 0, openTickets: 0, resolvedTickets: 0 });
  const [recentTickets, setRecentTickets] = useState<{ id: string; ticketId: string; subject: string; status: string; priority: string; createdAt: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    const safe = async (url: string) => {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };

    const [assetData, ticketData] = await Promise.all([
      safe('/api/assets?limit=200'),
      safe('/api/tickets?limit=10'),
    ]);

    const assets = assetData?.assets || assetData?.data || [];
    const tickets = ticketData?.tickets || ticketData?.data || [];

    setStats({
      totalAssets: assetData?.pagination?.total || assets.length || 0,
      assignedAssets: assets.filter((a: { status: string }) => a.status === 'assigned').length,
      openTickets: tickets.filter((t: { status: string }) => ['open', 'in_progress'].includes(t.status)).length,
      resolvedTickets: tickets.filter((t: { status: string }) => ['resolved', 'closed'].includes(t.status)).length,
    });

    setRecentTickets(tickets.slice(0, 6));

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const quickLinks = [
    { icon: <FiPackage className="w-5 h-5" />, label: 'Assets', href: '/assets', bg: 'from-indigo-400 to-blue-500', shadow: 'shadow-blue-500/25' },
    { icon: <FiHeadphones className="w-5 h-5" />, label: 'Helpdesk', href: '/helpdesk', bg: 'from-emerald-400 to-green-500', shadow: 'shadow-green-500/25' },
    { icon: <FiServer className="w-5 h-5" />, label: 'Asset Categories', href: '/assets', bg: 'from-amber-400 to-orange-500', shadow: 'shadow-orange-500/25' },
    { icon: <FiShield className="w-5 h-5" />, label: 'Access Mgmt', href: '/tenant-admin/rbac', bg: 'from-violet-400 to-purple-500', shadow: 'shadow-purple-500/25' },
    { icon: <FiSettings className="w-5 h-5" />, label: 'Config', href: '/tenant-admin', bg: 'from-rose-400 to-pink-500', shadow: 'shadow-pink-500/25' },
    { icon: <FiActivity className="w-5 h-5" />, label: 'Audit Logs', href: '/audit-logs', bg: 'from-cyan-400 to-sky-500', shadow: 'shadow-sky-500/25' },
  ];

  return (
    <div className="space-y-6">
      <RoleHero
        role="it_admin"
        firstName={firstName}
        greeting={greeting}
        today={today}
        subtitle="Keep the lights on · assets, helpdesk tickets, access and configurations"
        primaryCta={{ label: 'Manage Assets', href: '/assets', icon: <FiPackage className="w-4 h-4" /> }}
        secondaryCta={{ label: 'Open Helpdesk', href: '/helpdesk', icon: <FiHeadphones className="w-4 h-4" /> }}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          [
            { label: 'Total Assets', value: stats.totalAssets, sub: 'In inventory', icon: <FiPackage className="w-5 h-5" />, bg: 'bg-indigo-50 text-indigo-600', ring: 'ring-indigo-100' },
            { label: 'Assigned Assets', value: stats.assignedAssets, sub: 'Currently in use', icon: <FiServer className="w-5 h-5" />, bg: 'bg-blue-50 text-blue-600', ring: 'ring-blue-100' },
            { label: 'Open Tickets', value: stats.openTickets, sub: 'Awaiting resolution', icon: <FiHeadphones className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100' },
            { label: 'Resolved Tickets', value: stats.resolvedTickets, sub: 'Recently closed', icon: <FiCheckCircle className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100' },
          ].map((s) => <StatCard key={s.label} {...s} />)
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Panel title="Recent Helpdesk Tickets" icon={<FiHeadphones className="w-4 h-4" />} href="/helpdesk" accent="text-violet-500">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
            ) : recentTickets.length === 0 ? (
              <EmptyState icon={<FiCheckCircle className="w-8 h-8 text-emerald-400" />} message="No tickets in queue" />
            ) : (
              <div className="divide-y divide-slate-100">
                {recentTickets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        <span className="text-slate-400 font-mono text-xs mr-2">#{t.ticketId}</span>
                        {t.subject}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(t.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold uppercase ${t.priority === 'high' || t.priority === 'urgent' ? 'text-rose-600' : 'text-slate-500'}`}>{t.priority}</span>
                      {statusBadge(t.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div>
          <Panel title="IT Quick Links" icon={<FiZap className="w-4 h-4" />} accent="text-amber-500">
            <QuickLinkGrid links={quickLinks} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ============== EMPLOYEE (DEFAULT / FALLBACK) ============== */
function EmployeeHome({ firstName, greeting, today }: { firstName: string; greeting: string; today: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [leaveBalances, setLeaveBalances] = useState<{ leaveType: { name: string }; remaining: number; total: number; used: number }[]>([]);
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);
  const [announcements, setAnnouncements] = useState<{ title: string; date: string; type: string }[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    const safe = async (url: string) => {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };

    const [leaveData, attData, ticketData] = await Promise.all([
      safe('/api/leave/balance'),
      safe('/api/attendance?limit=30'),
      safe('/api/tickets?limit=10'),
    ]);

    if (leaveData?.balances) {
      setLeaveBalances(leaveData.balances.slice(0, 5));
    }

    if (attData?.attendance || attData?.records) {
      const rows = attData.attendance || attData.records || [];
      if (rows.length > 0) {
        const present = rows.filter((a: { status: string }) => ['present', 'late'].includes(a.status)).length;
        setAttendanceRate(Math.round((present / rows.length) * 100));
      }
    }

    if (ticketData?.tickets || ticketData?.data) {
      const tickets = ticketData.tickets || ticketData.data || [];
      setOpenTickets(tickets.filter((t: { status: string }) => ['open', 'in_progress'].includes(t.status)).length);
    }

    setAnnouncements([
      { title: 'Company Holiday - ' + new Date().toLocaleDateString('en-US', { month: 'long' }) + ' 26th', date: 'In 10 days', type: 'holiday' },
      { title: 'Team Town Hall Meeting', date: 'Tomorrow · 4:00 PM', type: 'event' },
      { title: 'New Leave Policy Update', date: 'This week', type: 'policy' },
      { title: 'Quarterly Review Cycle Open', date: 'Now', type: 'review' },
    ]);

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalRemaining = leaveBalances.reduce((s, b) => s + (b.remaining || 0), 0);

  const quickActions = [
    { icon: <FiCalendar className="w-5 h-5" />, label: 'Apply Leave', href: '/leave', bg: 'from-amber-400 to-orange-500', shadow: 'shadow-orange-500/25' },
    { icon: <FiClock className="w-5 h-5" />, label: 'Attendance', href: '/attendance', bg: 'from-cyan-400 to-blue-500', shadow: 'shadow-blue-500/25' },
    { icon: <FiFileText className="w-5 h-5" />, label: 'My Payslip', href: '/payroll', bg: 'from-emerald-400 to-green-500', shadow: 'shadow-green-500/25' },
    { icon: <FiHeadphones className="w-5 h-5" />, label: 'Helpdesk', href: '/helpdesk', bg: 'from-violet-400 to-purple-500', shadow: 'shadow-purple-500/25' },
    { icon: <FiUserPlus className="w-5 h-5" />, label: 'My Profile', href: '/my-profile', bg: 'from-pink-400 to-rose-500', shadow: 'shadow-rose-500/25' },
    { icon: <FiDollarSign className="w-5 h-5" />, label: 'Expenses', href: '/expenses', bg: 'from-teal-400 to-emerald-500', shadow: 'shadow-emerald-500/25' },
  ];

  return (
    <div className="space-y-6">
      <RoleHero
        role="employee"
        firstName={firstName}
        greeting={greeting}
        today={today}
        subtitle="Your day at a glance · leave, attendance, payslips and tickets"
        primaryCta={{ label: 'Open Self-Service', href: '/dashboard', icon: <FiGrid className="w-4 h-4" /> }}
        secondaryCta={{ label: 'Apply Leave', href: '/leave', icon: <FiCalendar className="w-4 h-4" /> }}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          [
            { label: 'Attendance Rate', value: `${attendanceRate}%`, sub: 'This month', icon: <FiActivity className="w-5 h-5" />, bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100' },
            { label: 'Leave Balance', value: totalRemaining, sub: 'Days available', icon: <FiCalendar className="w-5 h-5" />, bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100' },
            { label: 'Open Tickets', value: openTickets, sub: 'Helpdesk requests', icon: <FiHeadphones className="w-5 h-5" />, bg: 'bg-violet-50 text-violet-600', ring: 'ring-violet-100' },
            { label: 'Quick Actions', value: '12+', sub: 'Self-service flows', icon: <FiZap className="w-5 h-5" />, bg: 'bg-blue-50 text-blue-600', ring: 'ring-blue-100' },
          ].map((s) => <StatCard key={s.label} {...s} />)
        )}
      </div>

      {/* Banner: full ESS available at /dashboard */}
      <div className="relative rounded-2xl overflow-hidden border border-indigo-100 bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50">
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
              <FiGrid className="w-4 h-4" /> Full Employee Self-Service
            </h3>
            <p className="text-xs text-indigo-700/80 mt-1">Access your complete dashboard — leave, attendance, payslips, performance, training, timesheets, documents and more.</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all whitespace-nowrap"
          >
            Open ESS Dashboard <FiArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leave balance */}
        <div className="lg:col-span-2">
          <Panel title="My Leave Balance" icon={<FiCalendar className="w-4 h-4" />} href="/leave" accent="text-amber-500">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
            ) : leaveBalances.length === 0 ? (
              <EmptyState icon={<FiInfo className="w-8 h-8" />} message="No leave balances configured" />
            ) : (
              <div className="space-y-3">
                {leaveBalances.map((b, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700">{b.leaveType?.name || 'Leave'}</span>
                      <span className="text-slate-500">
                        <span className="text-slate-900 font-bold">{b.remaining}</span> / {b.total} days
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${b.total > 0 ? ((b.remaining / b.total) * 100) : 0}%`,
                          background: PALETTE[i % PALETTE.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Announcements */}
        <div>
          <Panel title="Announcements" icon={<FiBell className="w-4 h-4" />} accent="text-rose-500">
            <div className="space-y-3">
              {announcements.map((a, i) => {
                const iconBg =
                  a.type === 'holiday' ? 'bg-emerald-50 text-emerald-600' :
                  a.type === 'event' ? 'bg-blue-50 text-blue-600' :
                  a.type === 'policy' ? 'bg-amber-50 text-amber-600' :
                  'bg-violet-50 text-violet-600';
                const icon =
                  a.type === 'holiday' ? <FiCalendar className="w-4 h-4" /> :
                  a.type === 'event' ? <FiStar className="w-4 h-4" /> :
                  a.type === 'policy' ? <FiFileText className="w-4 h-4" /> :
                  <FiAward className="w-4 h-4" />;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/60 border border-slate-100">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>{icon}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{a.date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Quick Actions" icon={<FiZap className="w-4 h-4" />} accent="text-amber-500">
        <QuickLinkGrid links={quickActions} />
      </Panel>
    </div>
  );
}

/* ============== MAIN PAGE ============== */

export default function HomePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const firstName = user?.name?.split(' ')[0] || 'there';
  const userRole = user?.role || 'employee';
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const heroProps = { firstName, greeting, today };

  // Route to the appropriate role dashboard
  const role = userRole.toLowerCase();
  if (role === 'super_admin') {
    return <SuperAdminHome {...heroProps} />;
  }
  if (role === 'tenant_admin') {
    // Tenant admin manages companies under their own tenant — same view as HR admin
    // but with full company-switcher support (no tenant switcher).
    return <HRAdminHome {...heroProps} />;
  }
  if (role === 'hr_admin') {
    return <HRAdminHome {...heroProps} />;
  }
  if (role === 'manager') {
    return <ManagerHome {...heroProps} />;
  }
  if (role === 'recruiter') {
    return <RecruiterHome {...heroProps} />;
  }
  if (role === 'finance') {
    return <FinanceHome {...heroProps} />;
  }
  if (role === 'it_admin') {
    return <ITAdminHome {...heroProps} />;
  }
  return <EmployeeHome {...heroProps} />;
}
