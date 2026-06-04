'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUsers,
  FiBriefcase,
  FiCalendar,
  FiDollarSign,
  FiTrendingUp,
  FiClock,
  FiArrowUp,
  FiArrowDown,
  FiUserPlus,
  FiBookOpen,
  FiCheckCircle,
  FiAlertTriangle,
  FiInfo,
  FiGift,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';

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
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function SkeletonCard() {
  return (
    <div className="nexus-card p-5 animate-pulse">
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

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between py-3 border-b border-nexus-border/50 last:border-0 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-slate-200 rounded-full" />
        <div className="space-y-1">
          <div className="h-3 w-40 bg-slate-200 rounded" />
          <div className="h-2 w-20 bg-slate-200 rounded" />
        </div>
      </div>
      <div className="h-5 w-16 bg-slate-200 rounded-full" />
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { notifications, fetchNotifications } = useNotificationStore();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [departmentDist, setDepartmentDist] = useState<DepartmentDist[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  const firstName = user?.name?.split(' ')[0] || 'User';
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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

      // Calculate attendance rate from attendance data
      let attendanceRate = 0;
      if (attendanceRes.status === 'fulfilled' && attendanceRes.value.ok) {
        const attData = await attendanceRes.value.json();
        const attRecords = attData?.attendance || [];
        const presentCount = attRecords.filter((a: { status: string }) => ['present', 'late'].includes(a.status)).length;
        attendanceRate = attRecords.length > 0 ? Math.round((presentCount / attRecords.length) * 100) : 0;
      }

      setStats({ totalEmployees, activeLeaves, openPositions, pendingPayroll, attendanceRate, trainingPrograms });

      // Department distribution from employees data
      if (empData?.employees) {
        const allEmpRes = await fetch('/api/employees?limit=1000', { headers });
        if (allEmpRes.ok) {
          const allEmpData = await allEmpRes.json();
          const deptMap: Record<string, number> = {};
          allEmpData.employees?.forEach((e: { department?: { name: string } }) => {
            const deptName = e.department?.name || 'Unknown';
            deptMap[deptName] = (deptMap[deptName] || 0) + 1;
          });
          const colors = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500'];
          const dist: DepartmentDist[] = Object.entries(deptMap).map(([name, count], i) => ({
            name,
            count,
            color: colors[i % colors.length],
          }));
          setDepartmentDist(dist);
        }
      }

      // Upcoming birthdays (from employees with DOB this month)
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

  const statCards = [
    { label: 'Total Employees', value: stats?.totalEmployees ?? 0, change: '+12%', changeType: 'up' as const, icon: <FiUsers className="w-5 h-5" />, color: 'blue' },
    { label: 'Active Leaves', value: stats?.activeLeaves ?? 0, change: '-5%', changeType: 'down' as const, icon: <FiCalendar className="w-5 h-5" />, color: 'amber' },
    { label: 'Open Positions', value: stats?.openPositions ?? 0, change: '+3', changeType: 'up' as const, icon: <FiBriefcase className="w-5 h-5" />, color: 'violet' },
    { label: 'Pending Payroll', value: stats?.pendingPayroll ?? 0, change: '+2', changeType: 'up' as const, icon: <FiDollarSign className="w-5 h-5" />, color: 'emerald' },
    { label: 'Attendance Rate', value: `${stats?.attendanceRate ?? 0}%`, change: '+2%', changeType: 'up' as const, icon: <FiClock className="w-5 h-5" />, color: 'cyan' },
    { label: 'Training Programs', value: stats?.trainingPrograms ?? 0, change: '+1', changeType: 'up' as const, icon: <FiBookOpen className="w-5 h-5" />, color: 'rose' },
  ];

  function getColorClasses(color: string) {
    const map: Record<string, { bg: string; icon: string; ring: string }> = {
      blue: { bg: 'bg-blue-50', icon: 'text-blue-500', ring: 'ring-blue-100' },
      violet: { bg: 'bg-violet-50', icon: 'text-violet-500', ring: 'ring-violet-100' },
      amber: { bg: 'bg-amber-50', icon: 'text-amber-500', ring: 'ring-amber-100' },
      emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500', ring: 'ring-emerald-100' },
      cyan: { bg: 'bg-cyan-50', icon: 'text-cyan-500', ring: 'ring-cyan-100' },
      rose: { bg: 'bg-rose-50', icon: 'text-rose-500', ring: 'ring-rose-100' },
    };
    return map[color] || map.blue;
  }

  function getActivityIcon(type: string) {
    switch (type) {
      case 'success': return <FiCheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'warning': return <FiAlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'error': return <FiAlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <FiInfo className="w-4 h-4 text-blue-500" />;
    }
  }

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

  function getNotifBadge(type: string) {
    switch (type) {
      case 'success': return 'nexus-badge nexus-badge-success';
      case 'warning': return 'nexus-badge nexus-badge-warning';
      case 'error': return 'nexus-badge nexus-badge-error';
      default: return 'nexus-badge nexus-badge-info';
    }
  }

  const maxDeptCount = Math.max(...departmentDist.map(d => d.count), 1);

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary">
            {greeting}, {firstName}!
          </h1>
          <p className="text-nexus-text-secondary mt-1">
            Here&apos;s what&apos;s happening with your organization today.
          </p>
        </div>
        <div className="text-sm text-nexus-text-muted">
          {today}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          statCards.map((stat) => {
            const colors = getColorClasses(stat.color);
            return (
              <div key={stat.label} className="nexus-card nexus-card-hover p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-nexus-text-secondary">{stat.label}</p>
                    <p className="text-2xl font-bold text-nexus-text-primary mt-1">{stat.value}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center ${colors.icon} ring-1 ${colors.ring}`}>
                    {stat.icon}
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3">
                  {stat.changeType === 'up' ? (
                    <FiArrowUp className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <FiArrowDown className="w-3.5 h-3.5 text-red-500" />
                  )}
                  <span className={`text-xs font-semibold ${stat.changeType === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {stat.change}
                  </span>
                  <span className="text-xs text-nexus-text-muted ml-1">vs last month</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 nexus-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-nexus-text-primary">Recent Activity</h2>
            <button
              onClick={() => router.push('/notifications')}
              className="text-sm text-blue-500 hover:text-blue-700 font-medium"
            >
              View all
            </button>
          </div>
          <div className="space-y-0 max-h-96 overflow-y-auto">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <FiInfo className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" />
                <p className="text-sm text-nexus-text-muted">No recent activity</p>
              </div>
            ) : (
              notifications.slice(0, 8).map((notif) => (
                <div key={notif.id} className="flex items-center justify-between py-3 border-b border-nexus-border/50 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0">
                      {getActivityIcon(notif.type)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-nexus-text-primary truncate">{notif.title}</p>
                      <p className="text-xs text-nexus-text-muted truncate">{notif.message}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    <span className={getNotifBadge(notif.type)}>{notif.category}</span>
                    <span className="text-xs text-nexus-text-muted whitespace-nowrap">{formatTimeAgo(notif.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="nexus-card p-6">
          <h2 className="text-lg font-semibold text-nexus-text-primary mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { label: 'Add Employee', icon: <FiUserPlus className="w-4 h-4" />, color: 'text-blue-500', href: '/employees' },
              { label: 'Post a Job', icon: <FiBriefcase className="w-4 h-4" />, color: 'text-violet-500', href: '/recruitment' },
              { label: 'Apply Leave', icon: <FiCalendar className="w-4 h-4" />, color: 'text-amber-500', href: '/leave' },
              { label: 'Mark Attendance', icon: <FiClock className="w-4 h-4" />, color: 'text-cyan-500', href: '/attendance' },
              { label: 'View Payroll', icon: <FiDollarSign className="w-4 h-4" />, color: 'text-emerald-500', href: '/payroll' },
              { label: 'Performance', icon: <FiTrendingUp className="w-4 h-4" />, color: 'text-rose-500', href: '/performance' },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => router.push(action.href)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-nexus-border hover:bg-slate-50 hover:border-slate-200 transition-all text-left group"
              >
                <span className={`${action.color} group-hover:scale-110 transition-transform`}>{action.icon}</span>
                <span className="text-sm font-medium text-nexus-text-primary">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Distribution */}
        <div className="nexus-card p-6">
          <h2 className="text-lg font-semibold text-nexus-text-primary mb-4">Department Distribution</h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex justify-between mb-1">
                    <div className="h-3 w-24 bg-slate-200 rounded" />
                    <div className="h-3 w-8 bg-slate-200 rounded" />
                  </div>
                  <div className="h-6 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : departmentDist.length === 0 ? (
            <div className="py-8 text-center">
              <FiUsers className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" />
              <p className="text-sm text-nexus-text-muted">No department data available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {departmentDist.map((dept) => (
                <div key={dept.name}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-nexus-text-primary">{dept.name}</span>
                    <span className="text-sm text-nexus-text-secondary">{dept.count}</span>
                  </div>
                  <div className="w-full h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${dept.color} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.max((dept.count / maxDeptCount) * 100, 8)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Birthdays */}
        <div className="nexus-card p-6">
          <h2 className="text-lg font-semibold text-nexus-text-primary mb-4">Upcoming Birthdays</h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 bg-slate-200 rounded-full" />
                  <div className="space-y-1 flex-1">
                    <div className="h-3 w-32 bg-slate-200 rounded" />
                    <div className="h-2 w-20 bg-slate-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : birthdays.length === 0 ? (
            <div className="py-8 text-center">
              <FiGift className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" />
              <p className="text-sm text-nexus-text-muted">No upcoming birthdays this month</p>
            </div>
          ) : (
            <div className="space-y-3">
              {birthdays.map((emp) => {
                const dob = emp.dateOfBirth ? new Date(emp.dateOfBirth) : null;
                const bdayStr = dob ? dob.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                const initials = `${emp.firstName[0]}${emp.lastName[0]}`;
                return (
                  <div key={emp.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-nexus-text-primary truncate">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="text-xs text-nexus-text-muted">{emp.department?.name || 'N/A'}</p>
                    </div>
                    <div className="flex items-center gap-1 text-pink-500 flex-shrink-0">
                      <FiGift className="w-4 h-4" />
                      <span className="text-xs font-medium">{bdayStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
