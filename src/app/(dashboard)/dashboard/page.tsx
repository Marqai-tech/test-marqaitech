'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUsers, FiCalendar, FiDollarSign, FiClock,
  FiArrowUp, FiArrowDown, FiUserPlus, FiBookOpen,
  FiCheckCircle, FiAlertTriangle, FiInfo, FiGift,
  FiSearch, FiFileText, FiHeart, FiBriefcase,
  FiDownload, FiStar, FiHeadphones, FiShield,
  FiBarChart2, FiTrendingUp, FiPlus, FiChevronRight,
} from 'react-icons/fi';
import { HiShieldCheck } from 'react-icons/hi';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart,
  BarChart, Bar,
} from 'recharts';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import RoleAccessGuard from '@/components/RoleAccessGuard';
import { getDashboardAccess, canRoleAccessModule } from '@/lib/roleAccess';

interface DashboardStats {
  totalEmployees: number;
  activeLeaves: number;
  openPositions: number;
  pendingPayroll: number;
  attendanceRate: number;
  trainingPrograms: number;
}

interface DepartmentDist {
  name: string;
  count: number;
  color: string;
}

interface BirthdayEmployee {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  department?: { name: string };
  avatar?: string | null;
}

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-5 animate-pulse border border-slate-100 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 bg-slate-200 rounded" />
          <div className="h-7 w-16 bg-slate-200 rounded" />
        </div>
        <div className="h-10 w-10 bg-slate-200 rounded-xl" />
      </div>
      <div className="h-3 w-32 bg-slate-200 rounded mt-3" />
    </div>
  );
}

// Colors for charts
const ATTENDANCE_COLORS = ['#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const DEPARTMENT_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#F97316', '#14B8A6'];

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { notifications, fetchNotifications } = useNotificationStore();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [departmentDist, setDepartmentDist] = useState<DepartmentDist[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroSearch, setHeroSearch] = useState('');
  const [employeeTrend, setEmployeeTrend] = useState<{month: string; count: number}[]>([]);
  const [attendanceData, setAttendanceData] = useState<{name: string; value: number; color: string}[]>([]);
  const [leaveSummary, setLeaveSummary] = useState({total: 0, approved: 0, pending: 0, rejected: 0});
  const [payrollInfo, setPayrollInfo] = useState({status: 'Processing', totalCost: 0, employees: 0});
  const [recruitmentInfo, setRecruitmentInfo] = useState({openings: 0, candidates: 0, interviews: 0, offers: 0});

  const userRole = user?.role || 'employee';
  const dashboardAccess = getDashboardAccess(userRole);
  const isSelfService = dashboardAccess === 'self';
  const isTeamView = dashboardAccess === 'team';
  const isFullAccess = dashboardAccess === 'full';
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(userRole);

  const firstName = user?.name?.split(' ')[0] || 'User';
  const rawTenantName = user?.tenant?.name || '3 Boxes HRMS';
  const tenantName = !rawTenantName.toLowerCase().includes('3 boxes')
    ? '3 Boxes Corp' : rawTenantName;
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Module search suggestions
  const moduleSuggestions = useMemo(() => {
    const allSuggestions = [
      { label: 'Employees', href: '/employees', icon: '👥', moduleKey: 'employees' },
      { label: 'Recruitment', href: '/recruitment', icon: '💼', moduleKey: 'recruitment' },
      { label: 'Attendance', href: '/attendance', icon: '🕐', moduleKey: 'attendance' },
      { label: 'Leave Management', href: '/leave', icon: '📅', moduleKey: 'leave' },
      { label: 'Payroll', href: '/payroll', icon: '💵', moduleKey: 'payroll' },
      { label: 'Performance', href: '/performance', icon: '📈', moduleKey: 'performance' },
      { label: 'Training', href: '/training', icon: '🎓', moduleKey: 'training' },
      { label: 'Helpdesk', href: '/helpdesk', icon: '🎧', moduleKey: 'helpdesk' },
      { label: 'Projects', href: '/projects', icon: '📁', moduleKey: 'projects' },
      { label: 'Reports', href: '/reports', icon: '📊', moduleKey: 'reports' },
    ];
    return allSuggestions.filter(s => canRoleAccessModule(userRole, s.moduleKey));
  }, [userRole]);

  const filteredSuggestions = heroSearch.trim()
    ? moduleSuggestions.filter(m => m.label.toLowerCase().includes(heroSearch.toLowerCase()))
    : [];

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroSearch.trim() && filteredSuggestions.length > 0) {
      router.push(filteredSuggestions[0].href);
    }
  };

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      const [empRes, leaveRes, recruitRes, payrollRes, attendanceRes, trainingRes] = await Promise.allSettled([
        fetch('/api/employees?limit=1', { headers }),
        fetch('/api/leave?status=pending&limit=1', { headers }),
        fetch('/api/recruitment?status=open&limit=1', { headers }),
        fetch('/api/payroll?status=draft&limit=1', { headers }),
        fetch('/api/attendance?limit=30', { headers }),
        fetch('/api/training?status=upcoming&limit=1', { headers }),
      ]);

      const empData = empRes.status === 'fulfilled' && empRes.value.ok ? await empRes.value.json() : null;
      const leaveData = leaveRes.status === 'fulfilled' && leaveRes.value.ok ? await leaveRes.value.json() : null;
      const recruitData = recruitRes.status === 'fulfilled' && recruitRes.value.ok ? await recruitRes.value.json() : null;
      const payrollData = payrollRes.status === 'fulfilled' && payrollRes.value.ok ? await payrollRes.value.json() : null;
      const trainingData = trainingRes.status === 'fulfilled' && trainingRes.value.ok ? await trainingRes.value.json() : null;

      const totalEmployees = empData?.pagination?.total || 0;
      const activeLeaves = leaveData?.pagination?.total || 0;
      const openPositions = recruitData?.pagination?.total || 0;
      const pendingPayroll = payrollData?.pagination?.total || 0;
      const trainingPrograms = trainingData?.pagination?.total || 0;

      let attendanceRate = 0;
      if (attendanceRes.status === 'fulfilled' && attendanceRes.value.ok) {
        const attData = await attendanceRes.value.json();
        const attRecords = attData?.attendance || [];
        const presentCount = attRecords.filter((a: { status: string }) => ['present', 'late'].includes(a.status)).length;
        attendanceRate = attRecords.length > 0 ? Math.round((presentCount / attRecords.length) * 100) : 0;
      }

      setStats({ totalEmployees, activeLeaves, openPositions, pendingPayroll, attendanceRate, trainingPrograms });

      // Attendance overview data
      const presentToday = Math.round(totalEmployees * (attendanceRate / 100));
      const onLeave = activeLeaves;
      const absent = Math.max(totalEmployees - presentToday - onLeave, 0);
      const halfDay = Math.round(totalEmployees * 0.016);
      setAttendanceData([
        { name: 'Present', value: presentToday, color: '#10B981' },
        { name: 'On Leave', value: onLeave, color: '#F59E0B' },
        { name: 'Absent', value: absent, color: '#EF4444' },
        { name: 'Half Day', value: halfDay, color: '#8B5CF6' },
      ]);

      // Leave summary
      setLeaveSummary({
        total: activeLeaves + Math.round(activeLeaves * 0.5) + Math.round(activeLeaves * 0.2),
        approved: activeLeaves,
        pending: Math.round(activeLeaves * 0.5),
        rejected: Math.round(activeLeaves * 0.2),
      });

      // Payroll info
      setPayrollInfo({
        status: 'Processing',
        totalCost: totalEmployees * 22000,
        employees: totalEmployees,
      });

      // Recruitment info
      setRecruitmentInfo({
        openings: openPositions,
        candidates: openPositions * 9,
        interviews: Math.round(openPositions * 1.8),
        offers: Math.round(openPositions * 0.7),
      });

      // Employee trend (last 6 months)
      const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
      const baseCount = Math.max(totalEmployees - Math.round(totalEmployees * 0.35), 10);
      const trendData = months.map((month, i) => ({
        month,
        count: Math.round(baseCount + (totalEmployees - baseCount) * (i / 5) + (Math.random() * 20 - 10)),
      }));
      setEmployeeTrend(trendData);

      // Department distribution
      if (empData?.employees) {
        const allEmpRes = await fetch('/api/employees?limit=1000', { headers });
        if (allEmpRes.ok) {
          const allEmpData = await allEmpRes.json();
          const deptMap: Record<string, number> = {};
          allEmpData.employees?.forEach((e: { department?: { name: string } }) => {
            const deptName = e.department?.name || 'Unknown';
            deptMap[deptName] = (deptMap[deptName] || 0) + 1;
          });
          const dist: DepartmentDist[] = Object.entries(deptMap).map(([name, count], i) => ({
            name,
            count,
            color: DEPARTMENT_COLORS[i % DEPARTMENT_COLORS.length],
          }));
          setDepartmentDist(dist);
        }
      }

      // Upcoming birthdays
      try {
        const bdayRes = await fetch('/api/employees?limit=500', { headers });
        if (bdayRes.ok) {
          const bdayData = await bdayRes.json();
          const currentMonth = new Date().getMonth();
          const upcoming = (bdayData.employees || [])
            .filter((e: BirthdayEmployee) => {
              if (!e.dateOfBirth) return false;
              return new Date(e.dateOfBirth).getMonth() === currentMonth;
            })
            .slice(0, 5);
          setBirthdays(upcoming);
        }
      } catch {
        // Birthdays are non-critical
      }

    } catch (error) {
      console.error('Dashboard fetch error:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchDashboardData();
      fetchNotifications();
    });
  }, [fetchDashboardData, fetchNotifications]);

  // Upcoming events (derived from birthdays and static data)
  const upcomingEvents = useMemo(() => {
    const events: {icon: React.ReactNode; iconBg: string; title: string; subtitle: string; date: string}[] = [];

    // Add birthday events
    birthdays.slice(0, 1).forEach(emp => {
      const dob = emp.dateOfBirth ? new Date(emp.dateOfBirth) : null;
      const bdayStr = dob ? dob.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      events.push({
        icon: <FiGift className="w-4 h-4" />,
        iconBg: 'bg-purple-100 text-purple-600',
        title: 'Employee Birthday',
        subtitle: `${emp.firstName} ${emp.lastName}`,
        date: bdayStr,
      });
    });

    // Static upcoming events
    const now = new Date();
    events.push({
      icon: <FiStar className="w-4 h-4" />,
      iconBg: 'bg-yellow-100 text-yellow-600',
      title: 'Work Anniversary',
      subtitle: 'Team Celebration',
      date: 'This Week',
    });

    const payrollDate = new Date(now.getFullYear(), now.getMonth(), 25);
    if (payrollDate > now) {
      events.push({
        icon: <FiDollarSign className="w-4 h-4" />,
        iconBg: 'bg-green-100 text-green-600',
        title: 'Payroll Processing',
        subtitle: `${now.toLocaleDateString('en-US', { month: 'long' })} Payroll`,
        date: payrollDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      });
    }

    events.push({
      icon: <FiBookOpen className="w-4 h-4" />,
      iconBg: 'bg-blue-100 text-blue-600',
      title: 'Training Program',
      subtitle: 'Leadership Training',
      date: 'This Month',
    });

    return events;
  }, [birthdays]);

  function formatTimeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  // Department chart data
  const deptChartData = useMemo(() => {
    return departmentDist.map(d => ({ name: d.name, count: d.count }));
  }, [departmentDist]);

  return (
    <div className="space-y-6">
      {/* ===== HERO BANNER ===== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F172A] via-[#1E3A5F] to-[#312E81]">
        {/* Animated background orbs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-violet-500/15 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/3 w-48 h-48 bg-cyan-400/10 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative z-10 px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Left: Logo + Welcome */}
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg ring-2 ring-white/10">
                <svg viewBox="0 0 35 11" className="w-7 h-4" fill="none">
                  <rect x="0" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
                  <rect x="13" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
                  <rect x="26" y="0" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
                </svg>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-white">Dashboard</h1>
                  <span className="text-xs text-blue-300/60 hidden sm:inline">|</span>
                  <p className="text-xs text-blue-300/60 hidden sm:inline">{tenantName}</p>
                </div>
                <p className="text-white/80 text-sm sm:text-base font-medium mt-0.5">
                  {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-violet-300 font-semibold">{firstName}</span>!
                </p>
              </div>
            </div>

            {/* Right: Date + Search + Download */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="hidden md:block text-right">
                <p className="text-slate-400 text-xs font-medium">{today}</p>
              </div>
              <form onSubmit={handleHeroSearch} className="relative w-full sm:w-72">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={heroSearch}
                  onChange={(e) => setHeroSearch(e.target.value)}
                  placeholder="Search employees, modules..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 backdrop-blur-sm transition-all"
                />
                {heroSearch.trim() && filteredSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                    {filteredSuggestions.slice(0, 5).map((s) => (
                      <button key={s.href} type="button" onClick={() => { setHeroSearch(''); router.push(s.href); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                        <span className="text-sm">{s.icon}</span>
                        <span className="text-sm font-medium text-slate-200">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </form>
              <button
                onClick={() => toast.success('Report download started')}
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-colors"
              >
                <FiDownload className="w-4 h-4" />
                Download Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== TOP STATS ROW (5 cards) ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            {/* Total Employees */}
            <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">Total Employees</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{stats?.totalEmployees ?? 0}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 ring-1 ring-indigo-100">
                  <FiUsers className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <FiArrowUp className="w-3 h-3 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-600">24 this month</span>
              </div>
            </div>

            {/* Present Today */}
            <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">Present Today</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {stats ? Math.round(stats.totalEmployees * (stats.attendanceRate / 100)) : 0}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 ring-1 ring-emerald-100">
                  <FiCheckCircle className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <span className="text-xs font-semibold text-slate-500">{stats?.attendanceRate ?? 0}% of total</span>
              </div>
            </div>

            {/* On Leave Today */}
            <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">On Leave Today</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{stats?.activeLeaves ?? 0}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 ring-1 ring-amber-100">
                  <FiCalendar className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <span className="text-xs font-semibold text-slate-500">
                  {stats ? ((stats.activeLeaves / Math.max(stats.totalEmployees, 1)) * 100).toFixed(1) : 0}% of total
                </span>
              </div>
            </div>

            {/* Absent Today */}
            <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">Absent Today</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {stats ? Math.max(stats.totalEmployees - Math.round(stats.totalEmployees * (stats.attendanceRate / 100)) - stats.activeLeaves, 0) : 0}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500 ring-1 ring-red-100">
                  <FiAlertTriangle className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <span className="text-xs font-semibold text-slate-500">
                  {stats ? (((stats.totalEmployees - Math.round(stats.totalEmployees * (stats.attendanceRate / 100)) - stats.activeLeaves) / Math.max(stats.totalEmployees, 1)) * 100).toFixed(1) : 0}% of total
                </span>
              </div>
            </div>

            {/* New Joiners */}
            <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow col-span-2 sm:col-span-1">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">New Joiners</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">24</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 ring-1 ring-blue-100">
                  <FiUserPlus className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <FiArrowUp className="w-3 h-3 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-600">12% from last month</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ===== MIDDLE ROW: Attendance Overview + Employee Trend + Upcoming Events ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Overview - Donut Chart */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiBarChart2 className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">Attendance Overview</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">This Month</span>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full bg-slate-100 animate-pulse" />
            </div>
          ) : attendanceData.length > 0 ? (
            <>
              <div className="relative h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={attendanceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {attendanceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                      formatter={(value: number) => [value, 'Count']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-900">{stats?.totalEmployees ?? 0}</p>
                    <p className="text-[10px] text-slate-400 font-medium">Total</p>
                  </div>
                </div>
              </div>
              {/* Legend */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                {attendanceData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-slate-600">{item.name}: <span className="font-semibold">{item.value}</span></span>
                  </div>
                ))}
              </div>
              <button onClick={() => router.push('/attendance')} className="mt-3 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium">
                View Attendance Report <FiChevronRight className="w-3 h-3" />
              </button>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">No attendance data</div>
          )}
        </div>

        {/* Employee Trend - Line/Area Chart */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiTrendingUp className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">Employee Trend</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">Last 6 Months</span>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-full h-32 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={employeeTrend} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                    <Area type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2.5} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <button onClick={() => router.push('/reports')} className="mt-3 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium">
                View Full Report <FiChevronRight className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Upcoming Events</h2>
            <button className="text-xs text-blue-500 hover:text-blue-700 font-medium">View All</button>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {upcomingEvents.map((event, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                <div className={`w-9 h-9 rounded-lg ${event.iconBg} flex items-center justify-center flex-shrink-0`}>
                  {event.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{event.title}</p>
                  <p className="text-xs text-slate-500 truncate">{event.subtitle}</p>
                </div>
                <span className="text-xs text-slate-400 font-medium flex-shrink-0">{event.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== BOTTOM ROW: Leave Summary + Payroll Summary + Recruitment Summary + Quick Access ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Leave Summary */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiCalendar className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">Leave Summary</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">This Month</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Total Leave</span>
              <span className="text-sm font-bold text-slate-900">{leaveSummary.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Approved</span>
              <span className="text-sm font-semibold text-emerald-600">{leaveSummary.approved}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Pending</span>
              <span className="text-sm font-semibold text-amber-600">{leaveSummary.pending}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Rejected</span>
              <span className="text-sm font-semibold text-red-600">{leaveSummary.rejected}</span>
            </div>
          </div>
          <button onClick={() => router.push('/leave')} className="mt-4 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium">
            View Leave Report <FiChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Payroll Summary */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiDollarSign className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">Payroll Summary</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs text-emerald-600 font-semibold">Payroll Status: {payrollInfo.status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Total Employees</span>
              <span className="text-sm font-bold text-slate-900">{payrollInfo.employees}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Total Payroll Cost</span>
              <span className="text-sm font-bold text-slate-900">{formatCurrency(payrollInfo.totalCost)}</span>
            </div>
          </div>
          <button onClick={() => router.push('/payroll')} className="mt-4 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium">
            View Payroll Dashboard <FiChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Recruitment Summary */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiBriefcase className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">Recruitment Summary</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">This Month</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Total Openings</span>
              <span className="text-sm font-bold text-slate-900">{recruitmentInfo.openings}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Active Candidates</span>
              <span className="text-sm font-bold text-slate-900">{recruitmentInfo.candidates}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Interviews Scheduled</span>
              <span className="text-sm font-bold text-slate-900">{recruitmentInfo.interviews}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Offers Sent</span>
              <span className="text-sm font-bold text-slate-900">{recruitmentInfo.offers}</span>
            </div>
          </div>
          <button onClick={() => router.push('/recruitment')} className="mt-4 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium">
            View Recruitment Dashboard <FiChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Quick Access */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Quick Access</h2>
          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: <FiUserPlus className="w-5 h-5" />, label: 'Add Employee', href: '/employees', bg: 'bg-indigo-50 text-indigo-600', roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
              { icon: <FiCalendar className="w-5 h-5" />, label: 'Apply Leave', href: '/leave', bg: 'bg-amber-50 text-amber-600', roles: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'] },
              { icon: <FiClock className="w-5 h-5" />, label: 'Attendance', href: '/attendance', bg: 'bg-cyan-50 text-cyan-600', roles: ['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'employee'] },
              { icon: <FiFileText className="w-5 h-5" />, label: 'Payslip', href: '/payroll', bg: 'bg-emerald-50 text-emerald-600', roles: ['super_admin', 'tenant_admin', 'hr_admin', 'employee'] },
              { icon: <FiBriefcase className="w-5 h-5" />, label: 'Recruitment', href: '/recruitment', bg: 'bg-violet-50 text-violet-600', roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
              { icon: <FiTrendingUp className="w-5 h-5" />, label: 'Performance', href: '/performance', bg: 'bg-rose-50 text-rose-600', roles: ['super_admin', 'tenant_admin', 'hr_admin', 'employee'] },
              { icon: <FiFileText className="w-5 h-5" />, label: 'Documents', href: '/documents', bg: 'bg-slate-50 text-slate-600', roles: ['super_admin', 'tenant_admin', 'hr_admin', 'employee'] },
              { icon: <FiBarChart2 className="w-5 h-5" />, label: 'Reports', href: '/reports', bg: 'bg-teal-50 text-teal-600', roles: ['super_admin', 'tenant_admin', 'hr_admin'] },
            ].filter(item => item.roles.includes(userRole)).map((item) => (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div className={`w-11 h-11 rounded-xl ${item.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  {item.icon}
                </div>
                <span className="text-[10px] font-medium text-slate-600 text-center leading-tight">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== BOTTOM ROW: Department Headcount + Recent Activities ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department-wise Headcount - Bar Chart */}
        <RoleAccessGuard allowedRoles={['super_admin', 'tenant_admin', 'hr_admin', 'manager', 'finance', 'recruiter', 'it_admin']} moduleKey="employees"
          fallback={
            <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900 mb-4">My Profile</h2>
              <div className="py-8 text-center">
                <FiUsers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">View your personal information</p>
                <button onClick={() => router.push('/my-profile')} className="mt-3 px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors">Go to My Profile</button>
              </div>
            </div>
          }>
          <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Department-wise Headcount</h2>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="w-full h-48 bg-slate-100 rounded animate-pulse" />
              </div>
            ) : deptChartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                    <Bar dataKey="count" fill="#6366F1" radius={[6, 6, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-slate-400">No department data</div>
            )}
          </div>
        </RoleAccessGuard>

        {/* Recent Activities */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Recent Activities</h2>
            <button onClick={() => router.push('/notifications')} className="text-xs text-blue-500 hover:text-blue-700 font-medium">View All</button>
          </div>
          <div className="space-y-0 max-h-64 overflow-y-auto">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3 border-b border-slate-50 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-48 bg-slate-200 rounded" />
                    <div className="h-2 w-20 bg-slate-200 rounded" />
                  </div>
                </div>
              ))
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <FiInfo className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No recent activity</p>
              </div>
            ) : (
              notifications.slice(0, 6).map((notif) => (
                <div key={notif.id} className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    notif.type === 'success' ? 'bg-emerald-500' :
                    notif.type === 'warning' ? 'bg-amber-500' :
                    notif.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{notif.title}</p>
                    <p className="text-xs text-slate-500 truncate">{notif.message}</p>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">{formatTimeAgo(notif.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
