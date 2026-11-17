'use client';

/**
 * Employee Module Dashboard — SmartHR template style
 * ─────────────────────────
 * A dedicated dashboard for the Employee module, distinct from the Employee List page.
 * Task 155: restyled to match the Employee Dashboard UI view (/dashboard) —
 * shared SmartHR widgets (PageBreadcrumbs gradient banner, Panel, StatCard,
 * MiniStatTile, QuickLinkGrid) and the royal #3A57C4 / violet #6C4FD6 /
 * orange #FF9B44 palette. Page heading renamed from "Module Dashboard" to
 * "Dashboard" so the right side pane matches the sidebar label.
 * Shows role-based content:
 *   - All Employees: Summary stats, headcount trends, department distribution, recent updates
 *   - Admin/HR: Full analytics, compliance indicators, lifecycle tracking
 *   - Manager: Team-specific view with direct reports
 *   - Employee: Personal profile summary, pending actions, team info
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUsers, FiUserPlus, FiUserCheck, FiUserX, FiUser, FiClock,
  FiTrendingUp, FiTrendingDown, FiBarChart2, FiPieChart,
  FiCalendar, FiAlertCircle, FiArrowRight, FiGrid,
  FiBriefcase, FiMapPin, FiActivity, FiCheckCircle, FiInfo,
  FiChevronRight, FiFileText, FiRefreshCw, FiSearch,
  FiMail, FiPhone, FiLayers, FiTarget, FiAward,
  FiShield, FiHeart,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { sanitizeSearch } from '@/lib/validators';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import SocialFeedsSection from '@/components/employees/SocialFeedsSection';
/* Task 155 — shared SmartHR widgets: the exact same building blocks the
   Employee Dashboard UI view (/dashboard) uses, so both pages look alike. */
import {
  PageBreadcrumbs, DateChip, Panel, StatCard, MiniStatTile,
  QuickLinkGrid, SkeletonBlock, StatSkeleton,
} from '@/components/dashboard/smarthr-widgets';

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface EmployeeStats {
  totalEmployees: number;
  activeEmployees: number;
  onLeaveEmployees: number;
  inactiveEmployees: number;
  newHiresThisMonth: number;
  exitsThisMonth: number;
  avgTenureMonths: number;
  genderRatio: { male: number; female: number; other: number };
}

interface DepartmentDist {
  name: string;
  count: number;
  color: string;
}

interface RecentUpdate {
  id: string;
  type: 'join' | 'exit' | 'transfer' | 'promotion' | 'probation_end' | 'status_change';
  employeeName: string;
  employeeId: string;
  department: string;
  date: string;
  details: string;
}

interface LifecycleMetric {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  ring: string;
  route: string;
}

interface HeadcountTrend {
  month: string;
  headcount: number;
  joins: number;
  exits: number;
}

/* QA — Tenure Overview: real distribution computed from Employee.dateOfJoining */
interface TenureBucket {
  label: string;
  count: number;
  color: string;
}

/* ── Color palette for departments ── */
const DEPT_COLORS = [
  'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-orange-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-red-500', 'bg-lime-500',
  'bg-fuchsia-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-teal-500',
];

/* ── Component ── */
export default function EmployeeDashboardPage() {
  const router = useRouter();
  const { user, hasPermission, canAccessModule } = useAuthStore();
  const userRole = user?.role || 'employee';
  const effectiveCompanyId = useCompanyContextStore(s => s.effectiveCompanyId);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);
  const selectedCompanyId = useCompanyContextStore(s => s.selectedCompanyId);
  const setSelectedCompany = useCompanyContextStore(s => s.setSelectedCompany);
  const availableCompanies = useCompanyContextStore(s => s.availableCompanies);

  const [stats, setStats] = useState<EmployeeStats | null>(null);
  // If a company is selected in the switcher but it has ZERO employees, show a
  // clear banner instead of a bare "0" — the classic "where did my employees
  // go?" confusion (the data is still there, just scoped to another company).
  const [companyScopeEmpty, setCompanyScopeEmpty] = useState(false);
  const [lifecycleCounts, setLifecycleCounts] = useState({
    onProbation: 0,
    transfers: 0,
    resignations: 0,
    terminations: 0,
    rejoins: 0,
  });
  const [departments, setDepartments] = useState<DepartmentDist[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([]);
  const [headcountTrend, setHeadcountTrend] = useState<HeadcountTrend[]>([]);
  const [tenureDist, setTenureDist] = useState<TenureBucket[]>([]);
  const [tenureCounted, setTenureCounted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'feeds' | 'analytics' | 'updates'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const todayChip = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Role-based permissions
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'hr_admin'].includes(userRole);
  const isManager = userRole === 'manager' || isAdmin;
  const canViewSalary = isAdmin;
  const canViewFullDetails = isManager;

  /* ── Data Fetching ── */
  const cidValue = selectedCompanyId;
  const tidValue = selectedTenantId;
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();

      // Fetch employee stats
      // When super_admin selects a company, also send tenantId so the API
      // resolves the correct tenant DB (employees live in the tenant DB,
      // not the platform DB).
      const cid = cidValue;
      const tid = tidValue;
      const scopeParams = new URLSearchParams();
      if (cid) scopeParams.set('companyId', cid);
      if (tid) scopeParams.set('tenantId', tid);
      const scopeQs = scopeParams.toString();
      const scopeQuery = scopeQs ? `&${scopeQs}` : '';

      // Employees are scoped to their own record by the API. A one-row page
      // is sufficient for the personal dashboard; managers/admins retain the
      // larger page needed for team and organization analytics.
      const employeeLimit = isManager ? 100 : 1;
      const allRes = await fetch(`/api/employees?limit=${employeeLimit}&page=1${scopeQuery}`, { headers });
      if (allRes.ok) {
        const allData = await allRes.json();
        const total = allData.pagination?.total || 0;

        // Detect the "empty selected company" case so we can warn the user
        setCompanyScopeEmpty(total === 0 && Boolean(cid));

        const allEmps = allData.employees || [];

        // Department distribution
        const deptMap = new Map<string, number>();
        const genderCounts = { male: 0, female: 0, other: 0 };
        let totalTenure = 0;
        let tenureCount = 0;
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let newHires = 0;
        let exits = 0;

        (allEmps as any[]).forEach((emp: any) => {
          // Department
          const deptName = emp.department?.name || 'Unassigned';
          deptMap.set(deptName, (deptMap.get(deptName) || 0) + 1);

          // Gender
          if (emp.gender === 'male') genderCounts.male++;
          else if (emp.gender === 'female') genderCounts.female++;
          else genderCounts.other++;

          // Tenure
          if (emp.dateOfJoining) {
            const joinDate = new Date(emp.dateOfJoining);
            const months = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth());
            totalTenure += months;
            tenureCount++;
            if (joinDate >= thisMonth) newHires++;
          }

          // Exits this month (terminated/resigned)
          if ((emp.status === 'terminated' || emp.status === 'resigned') && emp.updatedAt) {
            const updatedDate = new Date(emp.updatedAt);
            if (updatedDate >= thisMonth) exits++;
          }
        });

        const activeCount = allEmps.filter((e: any) => e.status === 'active').length;
        const inactiveCount = allEmps.filter((e: any) => e.status !== 'active' && e.status !== 'on_leave').length;

        // ─── QA fix: "Employees on Leave" must mirror the Leave Module ───
        // Previously this counted Employee.status === 'on_leave', which is a
        // stale snapshot that does not react to approve/cancel actions.
        // Now we ask /api/leave (onLeaveToday=1) to count DISTINCT employees
        // holding an APPROVED leave record covering today — approved leaves
        // count, cancelled/rejected don't, and only currently-employed people
        // (active/on_leave) are included. Employee.status stays as fallback.
        let leaveCount = allEmps.filter((e: any) => e.status === 'on_leave').length;
        try {
          const leaveRes = await fetch(`/api/leave?onLeaveToday=1${scopeQuery}`, { headers });
          if (leaveRes.ok) {
            const leaveData = await leaveRes.json();
            if (typeof leaveData.onLeaveToday === 'number') leaveCount = leaveData.onLeaveToday;
          }
        } catch { /* keep status-based fallback */ }

        // ─── QA fix: Tenure Overview — real distribution from joining dates ───
        // Buckets: <6m, 6-12m, 1-3y, 3y+. Same population as Avg Tenure
        // (every employee with a dateOfJoining), months clamped at 0 so
        // future-dated joining dates never produce negative tenure.
        const tBuckets = [
          { label: '0-6 months', count: 0, color: 'bg-green-100 text-green-700 border-green-200' },
          { label: '6-12 months', count: 0, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
          { label: '1-3 years', count: 0, color: 'bg-amber-100 text-amber-700 border-amber-200' },
          { label: '3+ years', count: 0, color: 'bg-teal-100 text-teal-700 border-teal-200' },
        ];
        let tCounted = 0;
        (allEmps as any[]).forEach((emp: any) => {
          if (!emp.dateOfJoining) return;
          const joinDate = new Date(emp.dateOfJoining);
          if (isNaN(joinDate.getTime())) return;
          const months = Math.max(0,
            (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth()));
          tCounted++;
          if (months < 6) tBuckets[0].count++;
          else if (months < 12) tBuckets[1].count++;
          else if (months < 36) tBuckets[2].count++;
          else tBuckets[3].count++;
        });
        setTenureDist(tBuckets);
        setTenureCounted(tCounted);

        // ─── Compute lifecycle counts from employee data + lifecycle APIs ───
        // Read probation period from settings (default 6 months = ~180 days)
        let PROBATION_PERIOD_DAYS = 180; // default 6 months
        try {
          const stored = localStorage.getItem('3boxes_hrms_settings');
          if (stored) {
            const settings = JSON.parse(stored);
            const months = Number(settings.employee_probation_period);
            if (months > 0 && months <= 24) {
              PROBATION_PERIOD_DAYS = months * 30;
            }
          }
        } catch { /* ignore */ }

        // On Probation: employees with employeeStatus='probation' OR
        // employees who joined within the probation period
        const onProbationCount = (allEmps as any[]).filter((e: any) => {
          if (e.status !== 'active') return false;
          // Check employeeStatus field first (more reliable)
          if (e.employeeStatus === 'probation') return true;
          // Fallback: check dateOfJoining
          if (!e.dateOfJoining) return false;
          const joinDate = new Date(e.dateOfJoining);
          const daysSinceJoin = Math.floor((now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
          return daysSinceJoin <= PROBATION_PERIOD_DAYS && daysSinceJoin >= 0;
        }).length;

        // Resignations & Terminations: count from employee status
        const resignationsCount = (allEmps as any[]).filter((e: any) => e.status === 'resigned').length;
        const terminationsCount = (allEmps as any[]).filter((e: any) => e.status === 'terminated').length;

        // Transfers & Rejoins: fetch counts from the respective lifecycle APIs
        // (previously these were stubs that always returned 0; now they
        // persist real records, so the counts will reflect actual submissions)
        let transfersCount = 0;
        let rejoinsCount = 0;
        if (isManager) {
          try {
            const [transferRes, rejoinRes] = await Promise.all([
              fetch(`/api/employees/transfer?limit=1${scopeQuery}`, { headers }),
              fetch(`/api/employees/rejoin?limit=1${scopeQuery}`, { headers }),
            ]);
            if (transferRes.ok) {
              const transferData = await transferRes.json();
              transfersCount = transferData.pagination?.total || transferData.transfers?.length || 0;
            }
            if (rejoinRes.ok) {
              const rejoinData = await rejoinRes.json();
              rejoinsCount = rejoinData.pagination?.total || rejoinData.rejoins?.length || 0;
            }
          } catch {
            // Lifecycle APIs may be unavailable — keep 0
          }
        }

        setLifecycleCounts({
          onProbation: onProbationCount,
          transfers: transfersCount,
          resignations: resignationsCount,
          terminations: terminationsCount,
          rejoins: rejoinsCount,
        });

        setStats({
          totalEmployees: total,
          activeEmployees: activeCount,
          onLeaveEmployees: leaveCount,
          inactiveEmployees: inactiveCount,
          newHiresThisMonth: newHires,
          exitsThisMonth: exits,
          avgTenureMonths: tenureCount > 0 ? Math.round(totalTenure / tenureCount) : 0,
          genderRatio: genderCounts,
        });

        // Build department distribution
        const sortedDepts = [...deptMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count], i) => ({
            name,
            count,
            color: DEPT_COLORS[i % DEPT_COLORS.length],
          }));
        setDepartments(sortedDepts);

        // Generate recent updates from employee data
        const updates: RecentUpdate[] = [];
        (allEmps as any[])
          .filter((e: any) => e.updatedAt)
          .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, 8)
          .forEach((emp: any) => {
            const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
            if (emp.status === 'active' && emp.dateOfJoining) {
              const joinDate = new Date(emp.dateOfJoining);
              const daysSinceJoin = Math.floor((now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysSinceJoin <= 30) {
                updates.push({
                  id: emp.id, type: 'join', employeeName: fullName, employeeId: emp.employeeId,
                  department: emp.department?.name || 'Unassigned', date: emp.dateOfJoining,
                  details: 'New employee joined',
                });
              }
            }
            if (emp.status === 'terminated') {
              updates.push({
                id: emp.id, type: 'exit', employeeName: fullName, employeeId: emp.employeeId,
                department: emp.department?.name || 'Unassigned', date: emp.updatedAt,
                details: 'Employee terminated',
              });
            } else if (emp.status === 'on_leave') {
              updates.push({
                id: emp.id, type: 'status_change', employeeName: fullName, employeeId: emp.employeeId,
                department: emp.department?.name || 'Unassigned', date: emp.updatedAt,
                details: 'Currently on leave',
              });
            }
          });
        setRecentUpdates(updates.length > 0 ? updates : generateSampleUpdates());

        // Generate headcount trend (only from real data, no random/fake)
        setHeadcountTrend(generateHeadcountTrend(allEmps, total));
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      // GOLDEN RULE: On error, show zeros/empty — NOT fake data
      setStats(getSampleStats());
      setDepartments(getSampleDepartments());
      setRecentUpdates([]);
      setHeadcountTrend([]);
      setTenureDist([]);
      setTenureCounted(0);
      setLifecycleCounts({ onProbation: 0, transfers: 0, resignations: 0, terminations: 0, rejoins: 0 });
    } finally {
      setLoading(false);
    }
  }, [cidValue, tidValue, isManager]);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  /* ── Sample Data Fallbacks ── */
  function getSampleStats(): EmployeeStats {
    return {
      totalEmployees: 0, activeEmployees: 0, onLeaveEmployees: 0, inactiveEmployees: 0,
      newHiresThisMonth: 0, exitsThisMonth: 0, avgTenureMonths: 0,
      genderRatio: { male: 0, female: 0, other: 0 },
    };
  }

  function getSampleDepartments(): DepartmentDist[] {
    return []; // No sample data - return empty; data comes from API
  }

  function generateSampleUpdates(): RecentUpdate[] {
    return [
      { id: '1', type: 'join', employeeName: 'No recent updates', employeeId: '-', department: '-', date: new Date().toISOString(), details: 'Employee data will appear here' },
    ];
  }

  function generateHeadcountTrend(emps: unknown[], totalCount: number): HeadcountTrend[] {
    // Build a real trend from employee joining dates if available
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Count joins per month for the current year
    const joinsByMonth: Record<number, number> = {};
    const exitsByMonth: Record<number, number> = {};
    (emps as any[]).forEach((emp: any) => {
      if (emp.dateOfJoining) {
        const d = new Date(emp.dateOfJoining);
        if (d.getFullYear() === currentYear) {
          joinsByMonth[d.getMonth()] = (joinsByMonth[d.getMonth()] || 0) + 1;
        }
      }
      if ((emp.status === 'terminated' || emp.status === 'resigned') && emp.updatedAt) {
        const d = new Date(emp.updatedAt);
        if (d.getFullYear() === currentYear) {
          exitsByMonth[d.getMonth()] = (exitsByMonth[d.getMonth()] || 0) + 1;
        }
      }
    });

    // Build headcount trend cumulatively
    let runningHeadcount = totalCount;
    // Back-calculate: subtract joins added in future months (relative to current)
    for (let m = currentMonth + 1; m < 12; m++) {
      runningHeadcount -= (joinsByMonth[m] || 0);
      runningHeadcount += (exitsByMonth[m] || 0);
    }
    // Ensure non-negative
    runningHeadcount = Math.max(0, runningHeadcount);

    const trend: HeadcountTrend[] = [];
    for (let m = 0; m <= currentMonth; m++) {
      const joins = joinsByMonth[m] || 0;
      const exits = exitsByMonth[m] || 0;
      runningHeadcount += joins - exits;
      runningHeadcount = Math.max(0, runningHeadcount);
      trend.push({
        month: months[m],
        headcount: runningHeadcount,
        joins,
        exits,
      });
    }
    return trend;
  }

  /* ── Lifecycle metrics ── */
  const lifecycleMetrics: LifecycleMetric[] = useMemo(() => {
    const base: LifecycleMetric[] = [
      { label: 'On Probation', count: lifecycleCounts.onProbation, icon: FiClock, color: 'text-amber-600', bgColor: 'bg-amber-50', ring: 'ring-amber-100', route: '/employees/probation' },
      { label: 'Transfers', count: lifecycleCounts.transfers, icon: FiRefreshCw, color: 'text-green-600', bgColor: 'bg-green-50', ring: 'ring-green-100', route: '/employees/transfer' },
      { label: 'Resignations', count: lifecycleCounts.resignations, icon: FiFileText, color: 'text-red-600', bgColor: 'bg-red-50', ring: 'ring-red-100', route: '/employees/resignation' },
      { label: 'Terminations', count: lifecycleCounts.terminations, icon: FiUserX, color: 'text-orange-600', bgColor: 'bg-orange-50', ring: 'ring-orange-100', route: '/employees/termination' },
    ];
    if (isAdmin) {
      base.push({ label: 'Rejoin Cases', count: lifecycleCounts.rejoins, icon: FiUserCheck, color: 'text-emerald-600', bgColor: 'bg-emerald-50', ring: 'ring-emerald-100', route: '/employees/rejoin' });
    }
    return base;
  }, [isAdmin, lifecycleCounts]);

  /* ── Update type styling ── */
  const updateTypeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }> = {
    join: { icon: FiUserPlus, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    exit: { icon: FiUserX, color: 'text-red-600', bgColor: 'bg-red-50' },
    transfer: { icon: FiRefreshCw, color: 'text-green-600', bgColor: 'bg-green-50' },
    promotion: { icon: FiAward, color: 'text-teal-600', bgColor: 'bg-teal-50' },
    probation_end: { icon: FiCheckCircle, color: 'text-amber-600', bgColor: 'bg-amber-50' },
    status_change: { icon: FiActivity, color: 'text-slate-600', bgColor: 'bg-slate-50' },
  };

  /* ── Loading State — SmartHR skeleton pattern (same as /dashboard) ── */
  if (loading) {
    return (
      <div>
        <PageBreadcrumbs title="Dashboard" trail={['Employee', 'Dashboard']} right={<DateChip value={todayChip} />} />
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <StatSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <SkeletonBlock className="h-64 rounded-2xl" />
            <SkeletonBlock className="h-64 rounded-2xl lg:col-span-2" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header — SmartHR gradient breadcrumb banner (Task 155: renamed
          from "Module Dashboard" to "Dashboard"; same band as /dashboard) ── */}
      <PageBreadcrumbs
        title="Dashboard"
        trail={['Employee', 'Dashboard']}
        right={
          <>
            <DateChip value={todayChip} />
            <button
              onClick={fetchDashboardData}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:border-slate-300 shadow-sm transition-all"
              title="Refresh data"
            >
              <FiRefreshCw className="w-4 h-4" />
            </button>
            {isAdmin && (
              <button
                onClick={() => router.push('/employees/add')}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-to-r from-[#FF9B44] to-[#FF7A3D] text-white text-sm font-semibold shadow-lg shadow-orange-500/25 hover:shadow-orange-500/45 transition-all"
              >
                <FiUserPlus className="w-4 h-4" />
                Add Employee
              </button>
            )}
          </>
        }
      />

      <div className="space-y-6">
      {/* ── Tab Navigation ── */}
      {/* Task 88: the Analytics tab is company-wide HR analytics — hidden
          from employee & manager logins per requirement ("Remove the
          Analytics section from My Dashboard in the Employee login").
          Admin / HR roles retain it. */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {[
          { key: 'overview' as const, label: 'Overview', icon: FiGrid },
          // Task 138 — Social Feeds right after the Overview.
          { key: 'feeds' as const, label: 'Social Feeds', icon: FiUsers },
          ...(isAdmin ? [{ key: 'analytics' as const, label: 'Analytics', icon: FiBarChart2 }] : []),
          { key: 'updates' as const, label: 'Updates', icon: FiActivity },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-[#3A57C4] shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          OVERVIEW TAB
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* ── "Selected company has no employees" banner ── */}
          {companyScopeEmpty && selectedCompanyId && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50">
              <FiInfo className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1 text-sm text-amber-900">
                <p className="font-semibold">No employees in “{availableCompanies?.find(c => c.id === selectedCompanyId)?.name || 'the selected company'}”</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Your dashboard is scoped to this company via the Company Switcher. Your employee data is safe — switch to “All companies” or the company that has employees to see it.
                </p>
              </div>
              <button
                onClick={() => { setCompanyScopeEmpty(false); setSelectedCompany(null); fetchDashboardData(); }}
                className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 flex-shrink-0"
              >
                Show all companies
              </button>
            </div>
          )}
          {/* ── KPI stat tiles — shared SmartHR StatCard (white card, colourful
              top accent bar, round pastel icon — same as /dashboard) ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Employees"
              value={stats?.totalEmployees ?? 0}
              sub={`${stats?.newHiresThisMonth ?? 0} new this month`}
              icon={<FiUsers className="w-5 h-5" />}
              bg="bg-[#3A57C4]/10 text-[#3A57C4]"
              ring="ring-[#3A57C4]/20"
            />
            <StatCard
              label="Active"
              value={stats?.activeEmployees ?? 0}
              sub={stats?.totalEmployees ? `${Math.round((stats.activeEmployees / stats.totalEmployees) * 100)}% of total` : '—'}
              icon={<FiUserCheck className="w-5 h-5" />}
              bg="bg-emerald-50 text-emerald-600"
              ring="ring-emerald-100"
            />
            <StatCard
              label="On Leave"
              value={stats?.onLeaveEmployees ?? 0}
              sub={stats?.totalEmployees ? `${Math.round((stats.onLeaveEmployees / stats.totalEmployees) * 100)}% of total` : '—'}
              icon={<FiClock className="w-5 h-5" />}
              bg="bg-amber-50 text-amber-600"
              ring="ring-amber-100"
            />
            <StatCard
              label="Exits This Month"
              value={stats?.exitsThisMonth ?? 0}
              sub={(stats?.newHiresThisMonth ?? 0) >= (stats?.exitsThisMonth ?? 0) ? `${stats?.newHiresThisMonth ?? 0} hires vs exits` : 'hires behind exits'}
              icon={<FiUserX className="w-5 h-5" />}
              bg="bg-rose-50 text-rose-600"
              ring="ring-rose-100"
            />
          </div>

          {/* ── Quick Actions + Department Distribution ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Actions — template pastel tiles (same pattern as /dashboard) */}
            <Panel title="Quick Actions" icon={<FiTarget className="w-4 h-4" />} accent="text-[#6C4FD6]">
              <QuickLinkGrid
                links={[
                  ...(isAdmin ? [{ label: 'Add New Employee', icon: <FiUserPlus className="w-5 h-5" />, href: '/employees/add', bg: 'from-[#10B981] to-[#14B8A6]', shadow: '' }] : []),
                  // Bug 4 fix: Employee login sees "Update Profile" instead of "View Employee List"
                  ...(isAdmin ? [{ label: 'View Employee List', icon: <FiUsers className="w-5 h-5" />, href: '/employees', bg: 'from-[#3A57C4] to-[#4C51D6]', shadow: '' }] : [{ label: 'Update Profile', icon: <FiUser className="w-5 h-5" />, href: '/my-profile', bg: 'from-[#3A57C4] to-[#4C51D6]', shadow: '' }]),
                  { label: 'Org Chart', icon: <FiLayers className="w-5 h-5" />, href: '/org-chart', bg: 'from-[#6C4FD6] to-[#3A57C4]', shadow: '' },
                  ...(isAdmin ? [
                    { label: 'Probation Tracking', icon: <FiClock className="w-5 h-5" />, href: '/employees/probation', bg: 'from-amber-400 to-orange-500', shadow: '' },
                    { label: 'Transfer Management', icon: <FiRefreshCw className="w-5 h-5" />, href: '/employees/transfer', bg: 'from-cyan-400 to-sky-500', shadow: '' },
                  ] : []),
                  ...(isManager ? [{ label: 'Resignation Portal', icon: <FiFileText className="w-5 h-5" />, href: '/employees/resignation', bg: 'from-rose-400 to-pink-500', shadow: '' }] : []),
                ]}
              />
            </Panel>

            {/* Department Distribution */}
            <div className="lg:col-span-2">
              <Panel
                title="Department Distribution"
                icon={<FiBriefcase className="w-4 h-4" />}
                accent="text-[#10B981]"
                action={<span className="text-xs text-slate-500">{departments.length} departments</span>}
              >

              {departments.length > 0 ? (
                <div className="space-y-3">
                  {departments.slice(0, 8).map((dept, idx) => {
                    const maxCount = departments[0]?.count || 1;
                    const widthPercent = (dept.count / maxCount) * 100;
                    return (
                      <div key={dept.name} className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${dept.color} flex-shrink-0`} />
                        <span className="text-xs text-slate-500 w-28 truncate flex-shrink-0">{dept.name}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${dept.color} transition-all duration-500`}
                            style={{ width: `${widthPercent}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-900 w-8 text-right flex-shrink-0">{dept.count}</span>
                      </div>
                    );
                  })}
                  {departments.length > 8 && (
                    <p className="text-xs text-slate-500 text-center mt-2">
                      +{departments.length - 8} more departments
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                  <FiBriefcase className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">No department data available</p>
                  <p className="text-xs mt-1">Add employees with department assignments to see distribution</p>
                </div>
              )}
              </Panel>
            </div>
          </div>

          {/* ── Employee Lifecycle — SmartHR mini stat tiles ── */}
          {isManager && (
            <Panel title="Employee Lifecycle" icon={<FiActivity className="w-4 h-4" />} accent="text-[#FF9B44]">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {lifecycleMetrics.map(metric => {
                  const Icon = metric.icon;
                  return (
                    <MiniStatTile
                      key={metric.label}
                      label={metric.label}
                      value={metric.count}
                      icon={<Icon className="w-4 h-4" />}
                      bg={`${metric.bgColor} ${metric.color}`}
                      ring={metric.ring}
                      href={metric.route}
                    />
                  );
                })}
              </div>
            </Panel>
          )}

          {/* ── Recent Updates Preview ── */}
          <Panel
            title="Recent Employee Updates"
            icon={<FiActivity className="w-4 h-4" />}
            accent="text-[#FFC107]"
            action={
              <button
                onClick={() => setActiveTab('updates')}
                className="flex items-center gap-1 text-xs font-semibold text-[#3A57C4] hover:text-[#2C43A3] transition-colors"
              >
                View All <FiArrowRight className="w-3 h-3" />
              </button>
            }
          >
            <div className="space-y-3">
              {recentUpdates.slice(0, 5).map((update, idx) => {
                const config = updateTypeConfig[update.type] || updateTypeConfig.status_change;
                const Icon = config.icon;
                return (
                  <div key={update.id || idx} className="flex items-start gap-3 py-2">
                    <div className={`w-8 h-8 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon className={`w-4 h-4 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{update.employeeName}</p>
                      <p className="text-xs text-slate-500">{update.details} &middot; {update.department}</p>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {update.date ? new Date(update.date).toLocaleDateString() : '—'}
                    </span>
                  </div>
                );
              })}
              {recentUpdates.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <FiActivity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No recent updates</p>
                </div>
              )}
            </div>
          </Panel>

          {/* Task 138 — Social Feeds preview right after the Overview content */}
          <SocialFeedsSection variant="compact" onViewAll={() => setActiveTab('feeds')} />
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          SOCIAL FEEDS TAB (Task 138 — right after Overview)
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'feeds' && (
        <SocialFeedsSection variant="full" />
      )}

      {/* ══════════════════════════════════════════════════════════════
          ANALYTICS TAB (admin / HR only — Task 88)
         ══════════════════════════════════════════════════════════════ */}
      {isAdmin && activeTab === 'analytics' && (
        <>
          {/* Headcount Trend */}
          <Panel title="Headcount Trend" icon={<FiTrendingUp className="w-4 h-4" />} accent="text-[#3A57C4]">
            {headcountTrend.length > 0 ? (
              <div className="space-y-3">
                {headcountTrend.map((m, idx) => {
                  const maxHC = Math.max(...headcountTrend.map(h => h.headcount), 1);
                  const barWidth = (m.headcount / maxHC) * 100;
                  return (
                    <div key={m.month} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-slate-500 w-8 flex-shrink-0">{m.month}</span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#3A57C4] to-[#6C4FD6] transition-all duration-500"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-900 w-8 text-right">{m.headcount}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 w-20 flex-shrink-0 justify-end">
                        <span className="text-emerald-600">+{m.joins}</span>
                        <span className="text-red-500">-{m.exits}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <FiBarChart2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No trend data available</p>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gender Distribution */}
            <Panel title="Gender Distribution" icon={<FiHeart className="w-4 h-4" />} accent="text-pink-500">
              {stats && (stats.genderRatio.male + stats.genderRatio.female + stats.genderRatio.other) > 0 ? (
                <div className="space-y-4">
                  {[
                    { label: 'Male', value: stats.genderRatio.male, color: 'bg-green-500', textColor: 'text-green-700' },
                    { label: 'Female', value: stats.genderRatio.female, color: 'bg-pink-500', textColor: 'text-pink-700' },
                    { label: 'Other', value: stats.genderRatio.other, color: 'bg-teal-500', textColor: 'text-teal-700' },
                  ].map(g => {
                    const total = stats.genderRatio.male + stats.genderRatio.female + stats.genderRatio.other;
                    const pct = total > 0 ? Math.round((g.value / total) * 100) : 0;
                    return (
                      <div key={g.label} className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${g.color} flex-shrink-0`} />
                        <span className="text-xs text-slate-500 w-12 flex-shrink-0">{g.label}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div className={`h-full rounded-full ${g.color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`text-xs font-semibold ${g.textColor} w-16 text-right flex-shrink-0`}>{g.value} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <FiUsers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Gender data not available</p>
                </div>
              )}
            </Panel>

            {/* Key Metrics */}
            <Panel title="Key Metrics" icon={<FiBarChart2 className="w-4 h-4" />} accent="text-emerald-500">
              <div className="grid grid-cols-2 gap-4">
                <MetricBox
                  label="Avg Tenure"
                  value={stats?.avgTenureMonths ? `${Math.floor(stats.avgTenureMonths / 12)}y ${stats.avgTenureMonths % 12}m` : '0m'}
                  icon={FiClock}
                  color="text-green-600"
                  bgColor="bg-green-50"
                />
                <MetricBox
                  label="New Hires"
                  value={stats?.newHiresThisMonth ?? 0}
                  icon={FiUserPlus}
                  color="text-emerald-600"
                  bgColor="bg-emerald-50"
                  suffix="this month"
                />
                <MetricBox
                  label="Attrition Rate"
                  value={stats && stats.totalEmployees > 0
                    ? `${((stats.exitsThisMonth / stats.totalEmployees) * 100).toFixed(1)}%`
                    : '0%'}
                  icon={FiTrendingDown}
                  color="text-red-600"
                  bgColor="bg-red-50"
                  suffix="monthly"
                />
                <MetricBox
                  label="Departments"
                  value={departments.length}
                  icon={FiBriefcase}
                  color="text-teal-600"
                  bgColor="bg-teal-50"
                />
              </div>
            </Panel>
          </div>

          {/* Tenure Distribution */}
          <Panel title="Tenure Overview" icon={<FiCalendar className="w-4 h-4" />} accent="text-teal-500">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {tenureDist.length > 0 ? tenureDist.map(t => {
                const pct = tenureCounted > 0 ? Math.round((t.count / tenureCounted) * 100) : 0;
                return (
                  <div key={t.label} className={`rounded-lg border p-4 text-center ${t.color}`}>
                    <p className="text-2xl font-bold">{t.count}</p>
                    <p className="text-xs mt-1 font-medium">{t.label}</p>
                    <p className="text-[10px] mt-0.5 opacity-70">{pct}% of workforce</p>
                  </div>
                );
              }) : (
                ['0-6 months', '6-12 months', '1-3 years', '3+ years'].map(label => (
                  <div key={label} className="rounded-lg border p-4 text-center bg-slate-50 text-slate-400 border-slate-200">
                    <p className="text-2xl font-bold">0</p>
                    <p className="text-xs mt-1 font-medium">{label}</p>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center">
              {tenureCounted > 0
                ? `Calculated from date of joining for ${tenureCounted} employee${tenureCounted === 1 ? '' : 's'} with joining dates on record.`
                : 'No employee joining dates on record yet — add employees with their date of joining to see the tenure breakdown.'}
            </p>
          </Panel>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          UPDATES TAB
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'updates' && (
        <>
          {/* Search & Filter */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(sanitizeSearch(e.target.value))}
                placeholder="Search updates by name or department..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20 focus:border-[#3A57C4] transition-all"
              />
            </div>
          </div>

          {/* Updates List — Panel-style white card, edge-to-edge rows */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-[#FFC107]/20 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <FiActivity className="w-4 h-4" />
                </span>
                All Employee Updates
              </h3>
              <span className="text-xs text-slate-500">{recentUpdates.length} updates</span>
            </div>

            <div className="divide-y divide-slate-100">
              {recentUpdates
                .filter(u =>
                  !searchQuery ||
                  u.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  u.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  u.details.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((update, idx) => {
                  const config = updateTypeConfig[update.type] || updateTypeConfig.status_change;
                  const Icon = config.icon;
                  return (
                    <div
                      key={update.id || idx}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/employees/${update.id}`)}
                    >
                      <div className={`w-9 h-9 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-4 h-4 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900 truncate">{update.employeeName}</p>
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{update.employeeId}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{update.details} &middot; {update.department}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-slate-500">
                          {update.date ? new Date(update.date).toLocaleDateString() : '—'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {update.date ? new Date(update.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
                      <FiChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    </div>
                  );
                })}
              {recentUpdates.filter(u =>
                !searchQuery ||
                u.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.department.toLowerCase().includes(searchQuery.toLowerCase())
              ).length === 0 && (
                <div className="px-5 py-12 text-center text-slate-400">
                  <FiActivity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{searchQuery ? 'No updates match your search' : 'No employee updates yet'}</p>
                  <p className="text-xs mt-1">Updates will appear as employees join, transfer, or change status</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

/* ── Sub-Components ── */
/* Task 155 — the local StatCard and QuickAction were replaced by the shared
   SmartHR widgets (StatCard / QuickLinkGrid from smarthr-widgets), so this
   page renders exactly like the Employee Dashboard UI view. */

function MetricBox({ label, value, icon, color, bgColor, suffix }: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  suffix?: string;
}) {
  const Icon = icon;
  return (
    <div className={`rounded-xl ${bgColor} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {suffix && <p className="text-xs text-slate-500 mt-0.5">{suffix}</p>}
    </div>
  );
}
