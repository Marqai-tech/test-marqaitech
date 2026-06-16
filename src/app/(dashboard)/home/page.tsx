'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import {
  FiHome, FiSearch, FiUsers, FiBriefcase, FiGlobe, FiStar,
  FiUserPlus, FiClock, FiCalendar, FiDollarSign, FiFolder,
  FiTrendingUp, FiBookOpen, FiLogOut, FiHeadphones,
  FiMessageCircle, FiGitBranch, FiShield, FiBarChart2,
  FiSettings, FiPackage, FiMap, FiCreditCard,
  FiWatch, FiAlertCircle, FiTruck, FiPercent, FiLayers,
  FiSliders, FiFileText, FiBell, FiZap, FiHeart, FiTarget,
  FiServer, FiArrowRight, FiChevronRight, FiCheckCircle,
  FiAward, FiGift, FiSun, FiActivity, FiPieChart,
} from 'react-icons/fi';
import { HiSparkles, HiCollection } from 'react-icons/hi';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const LEAVE_COLORS = ['#10B981', '#F59E0B', '#EF4444', '#6366F1'];

interface LeaveBalance {
  type: string;
  total: number;
  used: number;
  available: number;
  color: string;
}

interface EmployeeStat {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  change?: string;
  changeType?: 'up' | 'down' | 'neutral';
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recentPayslips, setRecentPayslips] = useState<{month: string; status: string}[]>([]);
  const [announcements, setAnnouncements] = useState<{title: string; date: string; type: string}[]>([]);

  const firstName = user?.name?.split(' ')[0] || 'User';
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';
  const userRole = user?.role || 'employee';
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin'].includes(userRole);

  // Fetch employee dashboard data
  const fetchEmployeeData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      // Fetch leave balances
      try {
        const leaveRes = await fetch('/api/leave/balance', { headers });
        if (leaveRes.ok) {
          const leaveData = await leaveRes.json();
          const balances = leaveData.balances || leaveData.leaves || [];
          if (Array.isArray(balances) && balances.length > 0) {
            setLeaveBalances(balances.slice(0, 4).map((b: {leaveType?: {name?: string}; type?: string; total?: number; used?: number; available?: number; balance?: number}, i: number) => ({
              type: b.leaveType?.name || b.type || 'Leave',
              total: b.total || 12,
              used: b.used || 0,
              available: b.available ?? b.balance ?? 12,
              color: LEAVE_COLORS[i % LEAVE_COLORS.length],
            })));
          }
        }
      } catch { /* leave data is non-critical */ }

      // Fetch attendance rate
      try {
        const attRes = await fetch('/api/attendance?limit=30', { headers });
        if (attRes.ok) {
          const attData = await attRes.json();
          const records = attData?.attendance || [];
          if (records.length > 0) {
            const present = records.filter((a: {status: string}) => ['present', 'late'].includes(a.status)).length;
            setAttendanceRate(Math.round((present / records.length) * 100));
          }
        }
      } catch { /* attendance data is non-critical */ }

      // Fetch ticket count
      try {
        const ticketRes = await fetch('/api/tickets?limit=10', { headers });
        if (ticketRes.ok) {
          const ticketData = await ticketRes.json();
          const tickets = ticketData?.tickets || [];
          const open = tickets.filter((t: {status: string}) => ['open', 'in_progress'].includes(t.status)).length;
          setOpenTickets(open);
        }
      } catch { /* ticket data is non-critical */ }

      // Set static data
      setRecentPayslips([
        { month: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), status: 'Processing' },
        { month: new Date(Date.now() - 30*24*60*60*1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), status: 'Available' },
      ]);

      setAnnouncements([
        { title: 'Company Holiday - ' + new Date().toLocaleDateString('en-US', { month: 'long' }) + ' 26th', date: '2 days ago', type: 'holiday' },
        { title: 'Team Town Hall Meeting', date: 'Tomorrow', type: 'event' },
        { title: 'New Leave Policy Update', date: 'This week', type: 'policy' },
      ]);

    } catch (error) {
      console.error('Employee dashboard fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployeeData();
  }, [fetchEmployeeData]);

  // Employee stats cards
  const employeeStats: EmployeeStat[] = useMemo(() => [
    {
      label: 'Attendance Rate',
      value: `${attendanceRate}%`,
      icon: <FiActivity className="w-5 h-5" />,
      iconBg: 'bg-emerald-50 text-emerald-600',
      change: attendanceRate >= 90 ? 'Excellent' : attendanceRate >= 75 ? 'Good' : 'Needs improvement',
      changeType: attendanceRate >= 90 ? 'up' : attendanceRate >= 75 ? 'neutral' : 'down' as const,
    },
    {
      label: 'Open Tickets',
      value: openTickets,
      icon: <FiHeadphones className="w-5 h-5" />,
      iconBg: 'bg-blue-50 text-blue-600',
      change: openTickets > 0 ? 'Pending' : 'All resolved',
      changeType: openTickets > 0 ? 'down' : 'up' as const,
    },
    {
      label: 'Leave Balance',
      value: leaveBalances.reduce((sum, l) => sum + l.available, 0) || 12,
      icon: <FiCalendar className="w-5 h-5" />,
      iconBg: 'bg-amber-50 text-amber-600',
      change: 'Days available',
      changeType: 'neutral' as const,
    },
    {
      label: 'Payslips',
      value: recentPayslips.filter(p => p.status === 'Available').length,
      icon: <FiFileText className="w-5 h-5" />,
      iconBg: 'bg-violet-50 text-violet-600',
      change: 'Ready to view',
      changeType: 'up' as const,
    },
  ], [attendanceRate, openTickets, leaveBalances, recentPayslips]);

  // Leave chart data
  const leaveChartData = useMemo(() => {
    if (leaveBalances.length === 0) {
      return [
        { name: 'Casual', available: 7, used: 5 },
        { name: 'Sick', available: 10, used: 2 },
        { name: 'Earned', available: 5, used: 7 },
      ];
    }
    return leaveBalances.map(l => ({ name: l.type, available: l.available, used: l.used }));
  }, [leaveBalances]);

  // Quick action items for employee
  const quickActions = [
    { icon: <FiCalendar className="w-6 h-6" />, label: 'Apply Leave', href: '/leave', bg: 'bg-gradient-to-br from-amber-400 to-orange-500', shadow: 'shadow-orange-500/25' },
    { icon: <FiClock className="w-6 h-6" />, label: 'Attendance', href: '/attendance', bg: 'bg-gradient-to-br from-cyan-400 to-blue-500', shadow: 'shadow-blue-500/25' },
    { icon: <FiFileText className="w-6 h-6" />, label: 'My Payslip', href: '/payroll', bg: 'bg-gradient-to-br from-emerald-400 to-green-500', shadow: 'shadow-green-500/25' },
    { icon: <FiHeadphones className="w-6 h-6" />, label: 'Helpdesk', href: '/helpdesk', bg: 'bg-gradient-to-br from-violet-400 to-purple-500', shadow: 'shadow-purple-500/25' },
    { icon: <FiUserPlus className="w-6 h-6" />, label: 'My Profile', href: '/my-profile', bg: 'bg-gradient-to-br from-pink-400 to-rose-500', shadow: 'shadow-rose-500/25' },
    { icon: <FiDollarSign className="w-6 h-6" />, label: 'Expenses', href: '/expenses', bg: 'bg-gradient-to-br from-teal-400 to-emerald-500', shadow: 'shadow-emerald-500/25' },
    { icon: <FiBookOpen className="w-6 h-6" />, label: 'Training', href: '/training', bg: 'bg-gradient-to-br from-indigo-400 to-blue-500', shadow: 'shadow-blue-500/25' },
    { icon: <FiTrendingUp className="w-6 h-6" />, label: 'Performance', href: '/performance', bg: 'bg-gradient-to-br from-rose-400 to-pink-500', shadow: 'shadow-pink-500/25' },
  ];

  return (
    <div className="space-y-6">
      {/* ===== WELCOME HERO ===== */}
      <div className="relative rounded-2xl overflow-hidden border-0 shadow-xl shadow-indigo-500/10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E3A5F] to-[#312E81]" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-violet-500/20 rounded-full blur-[80px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px]" />

        <div className="relative z-10 px-8 py-7">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Left: Greeting */}
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg ring-2 ring-white/20 text-white text-xl font-bold">
                {firstName[0]}
              </div>
              <div>
                <p className="text-blue-300/60 text-xs font-medium tracking-widest uppercase">3 Boxes HRMS</p>
                <h1 className="text-2xl font-bold text-white">
                  {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-violet-300">{firstName}</span>!
                </h1>
                <p className="text-blue-100/60 text-sm font-medium mt-0.5">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Right: Search */}
            <div className="relative max-w-md w-full">
              <FiSearch className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-blue-200" />
              <input
                placeholder="Search modules, features..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/[0.08] backdrop-blur-md border border-white/[0.15] text-white placeholder:text-blue-200/40 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:bg-white/[0.12] transition-all text-sm font-medium"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ===== STATS CARDS ROW ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-5 animate-pulse border border-slate-100 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-24 bg-slate-200 rounded" />
                  <div className="h-7 w-16 bg-slate-200 rounded" />
                </div>
                <div className="h-10 w-10 bg-slate-200 rounded-xl" />
              </div>
              <div className="h-3 w-20 bg-slate-200 rounded mt-3" />
            </div>
          ))
        ) : (
          employeeStats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center ring-1 ring-slate-100`}>
                  {stat.icon}
                </div>
              </div>
              {stat.change && (
                <div className="flex items-center gap-1 mt-2">
                  {stat.changeType === 'up' && <FiArrowRight className="w-3 h-3 text-emerald-500" />}
                  <span className={`text-xs font-medium ${
                    stat.changeType === 'up' ? 'text-emerald-600' :
                    stat.changeType === 'down' ? 'text-amber-600' : 'text-slate-500'
                  }`}>
                    {stat.change}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ===== MIDDLE ROW: Leave Balance + Quick Actions + Announcements ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leave Balance - Donut Chart */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiCalendar className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">Leave Balance</h2>
            </div>
            <button onClick={() => router.push('/leave')} className="text-xs text-blue-500 hover:text-blue-700 font-medium">View Details</button>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-32 h-32 rounded-full bg-slate-100 animate-pulse" />
            </div>
          ) : (
            <>
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={leaveChartData.map(l => ({ name: l.name, value: l.available + l.used }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {leaveChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={LEAVE_COLORS[index % LEAVE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-xl font-bold text-slate-900">{leaveBalances.reduce((sum, l) => sum + l.available, 0) || 12}</p>
                    <p className="text-[10px] text-slate-400 font-medium">Days Left</p>
                  </div>
                </div>
              </div>
              {/* Leave types legend */}
              <div className="space-y-2 mt-2">
                {leaveChartData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LEAVE_COLORS[i % LEAVE_COLORS.length] }} />
                      <span className="text-xs text-slate-600">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-400">Used: <span className="font-semibold text-slate-600">{item.used}</span></span>
                      <span className="text-[10px] text-slate-400">Avail: <span className="font-semibold text-emerald-600">{item.available}</span></span>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => router.push('/leave')} className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-orange-500/25 hover:shadow-lg transition-shadow flex items-center justify-center gap-2">
                <FiCalendar className="w-4 h-4" /> Apply Leave
              </button>
            </>
          )}
        </div>

        {/* Quick Actions Grid */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => router.push(action.href)}
                className="flex flex-col items-center gap-2 group"
              >
                <div className={`w-12 h-12 rounded-xl ${action.bg} ${action.shadow} shadow-lg flex items-center justify-center text-white group-hover:scale-110 transition-transform`}>
                  {action.icon}
                </div>
                <span className="text-[10px] font-medium text-slate-600 text-center leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Announcements & Updates */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Announcements</h2>
            <FiBell className="w-4 h-4 text-slate-400" />
          </div>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse p-3 rounded-lg bg-slate-50">
                  <div className="h-3 w-40 bg-slate-200 rounded mb-2" />
                  <div className="h-2 w-20 bg-slate-200 rounded" />
                </div>
              ))
            ) : (
              announcements.map((ann, i) => (
                <div key={i} className="p-3 rounded-lg hover:bg-slate-50 transition-colors border border-slate-50">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      ann.type === 'holiday' ? 'bg-green-100 text-green-600' :
                      ann.type === 'event' ? 'bg-blue-100 text-blue-600' :
                      'bg-amber-100 text-amber-600'
                    }`}>
                      {ann.type === 'holiday' ? <FiSun className="w-4 h-4" /> :
                       ann.type === 'event' ? <FiActivity className="w-4 h-4" /> :
                       <FiFileText className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{ann.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{ann.date}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ===== BOTTOM ROW: Attendance + Recent Payslips + Upcoming Events ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Summary */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiClock className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">This Month Attendance</h2>
            </div>
            <button onClick={() => router.push('/attendance')} className="text-xs text-blue-500 hover:text-blue-700 font-medium">View All</button>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="w-full h-32 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : (
            <>
              {/* Attendance progress ring */}
              <div className="flex items-center gap-4 mb-4">
                <div className="relative w-24 h-24 flex-shrink-0">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#F1F5F9" strokeWidth="10" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#6366F1" strokeWidth="10"
                      strokeDasharray={`${attendanceRate * 2.51} 251`}
                      strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-slate-900">{attendanceRate}%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-xs text-slate-600">Present</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-xs text-slate-600">Late</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-xs text-slate-600">Absent</span>
                  </div>
                </div>
              </div>
              <button onClick={() => router.push('/attendance')} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold shadow-md shadow-blue-500/25 hover:shadow-lg transition-shadow flex items-center justify-center gap-2">
                <FiClock className="w-4 h-4" /> Mark Attendance
              </button>
            </>
          )}
        </div>

        {/* Recent Payslips */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiDollarSign className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">Recent Payslips</h2>
            </div>
            <button onClick={() => router.push('/payroll')} className="text-xs text-blue-500 hover:text-blue-700 font-medium">View All</button>
          </div>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="animate-pulse p-4 rounded-lg bg-slate-50">
                  <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
                  <div className="h-3 w-20 bg-slate-200 rounded" />
                </div>
              ))
            ) : (
              recentPayslips.map((payslip, i) => (
                <div key={i} className="p-4 rounded-lg border border-slate-50 hover:bg-slate-50 transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      payslip.status === 'Available' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      <FiFileText className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{payslip.month}</p>
                      <p className={`text-xs font-medium ${
                        payslip.status === 'Available' ? 'text-emerald-600' : 'text-amber-600'
                      }`}>{payslip.status}</p>
                    </div>
                  </div>
                  {payslip.status === 'Available' && (
                    <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-blue-500">
                      <FiArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <button onClick={() => router.push('/payroll')} className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white text-sm font-semibold shadow-md shadow-green-500/25 hover:shadow-lg transition-shadow flex items-center justify-center gap-2">
            <FiDollarSign className="w-4 h-4" /> View Payslips
          </button>
        </div>

        {/* My Tickets / Helpdesk */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiHeadphones className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-slate-900">My Tickets</h2>
            </div>
            <button onClick={() => router.push('/helpdesk')} className="text-xs text-blue-500 hover:text-blue-700 font-medium">View All</button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50/50 border border-blue-100/50">
              <div>
                <p className="text-2xl font-bold text-blue-600">{openTickets}</p>
                <p className="text-xs text-slate-500">Open Tickets</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                <FiMessageCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-emerald-50/50 border border-emerald-100/50">
              <div>
                <p className="text-sm font-semibold text-slate-900">Need Help?</p>
                <p className="text-xs text-slate-500">Raise a support ticket</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <FiPlus className="w-5 h-5" />
              </div>
            </div>
          </div>
          <button onClick={() => router.push('/helpdesk')} className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-semibold shadow-md shadow-purple-500/25 hover:shadow-lg transition-shadow flex items-center justify-center gap-2">
            <FiHeadphones className="w-4 h-4" /> Raise a Ticket
          </button>
        </div>
      </div>

      {/* ===== MODULE SHORTCUTS GRID ===== */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">All Modules</h2>
          <button onClick={() => setSearchQuery('')} className="text-xs text-blue-500 hover:text-blue-700 font-medium">View All</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {[
            { icon: <FiHome className="w-5 h-5" />, label: 'Dashboard', href: '/dashboard', bg: 'bg-blue-50 text-blue-600' },
            { icon: <FiUsers className="w-5 h-5" />, label: 'Employees', href: '/employees', bg: 'bg-indigo-50 text-indigo-600' },
            { icon: <FiCalendar className="w-5 h-5" />, label: 'Leave', href: '/leave', bg: 'bg-amber-50 text-amber-600' },
            { icon: <FiClock className="w-5 h-5" />, label: 'Attendance', href: '/attendance', bg: 'bg-cyan-50 text-cyan-600' },
            { icon: <FiDollarSign className="w-5 h-5" />, label: 'Payroll', href: '/payroll', bg: 'bg-emerald-50 text-emerald-600' },
            { icon: <FiTrendingUp className="w-5 h-5" />, label: 'Performance', href: '/performance', bg: 'bg-rose-50 text-rose-600' },
            { icon: <FiBookOpen className="w-5 h-5" />, label: 'Training', href: '/training', bg: 'bg-violet-50 text-violet-600' },
            { icon: <FiFolder className="w-5 h-5" />, label: 'Documents', href: '/documents', bg: 'bg-slate-50 text-slate-600' },
            { icon: <FiCreditCard className="w-5 h-5" />, label: 'Expenses', href: '/expenses', bg: 'bg-orange-50 text-orange-600' },
            { icon: <FiMap className="w-5 h-5" />, label: 'Travel', href: '/travel', bg: 'bg-sky-50 text-sky-600' },
            { icon: <FiHeadphones className="w-5 h-5" />, label: 'Helpdesk', href: '/helpdesk', bg: 'bg-purple-50 text-purple-600' },
            { icon: <FiSettings className="w-5 h-5" />, label: 'Settings', href: '/settings', bg: 'bg-gray-50 text-gray-600' },
          ].filter(m => {
            const q = searchQuery.toLowerCase();
            return !q || m.label.toLowerCase().includes(q);
          }).map((mod) => (
            <button
              key={mod.label}
              onClick={() => router.push(mod.href)}
              className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-all text-left group"
            >
              <div className={`w-10 h-10 rounded-xl ${mod.bg} flex items-center justify-center group-hover:scale-110 transition-transform mb-2`}>
                {mod.icon}
              </div>
              <p className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{mod.label}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
