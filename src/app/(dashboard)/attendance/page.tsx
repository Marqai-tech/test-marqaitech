'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiClock,
  FiLogIn,
  FiLogOut,
  FiCalendar,
  FiMapPin,
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';

/* ── Attendance Tips ── */
const attendanceTips = [
  {
    title: 'Configure Shift Timings First',
    description: 'Configure shift timings and overtime rules in Settings before tracking attendance',
  },
  {
    title: 'Use Geofencing',
    description: 'Use the Geofencing feature to ensure employees clock in from approved locations',
  },
  {
    title: 'Customize Thresholds',
    description: 'Late arrival and early departure thresholds can be customized in Attendance Settings',
  },
  {
    title: 'Bulk Import from Biometric',
    description: 'Import attendance data from biometric devices using the bulk import feature',
  },
  {
    title: 'Review Weekly Reports',
    description: 'Review the Attendance Report weekly to identify patterns of absenteeism',
  },
];

/* ── Attendance Workflow Steps ── */
const attendanceWorkflowSteps = [
  { step: 1, title: 'Configure Shift Timings', description: 'Set up work shift schedules and grace periods' },
  { step: 2, title: 'Set Overtime Rules', description: 'Define overtime thresholds and calculation rules' },
  { step: 3, title: 'Employee Checks In', description: 'Employee clocks in at the start of the work day' },
  { step: 4, title: 'Employee Checks Out', description: 'Employee clocks out at the end of the work day' },
  { step: 5, title: 'Auto-Calculate Work Hours', description: 'System calculates total hours and overtime automatically' },
  { step: 6, title: 'Review Monthly Summary', description: 'Review attendance summary for the month' },
  { step: 7, title: 'Generate Attendance Report', description: 'Export attendance data for payroll and compliance' },
];

/* ── Types ── */
interface AttendanceRecord {
  id: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workHours?: number | null;
  overtime?: number | null;
  status: string;
  notes?: string | null;
  location?: string | null;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    present: 'nexus-badge nexus-badge-success',
    absent: 'nexus-badge nexus-badge-error',
    late: 'bg-orange-50 text-orange-700 nexus-badge',
    half_day: 'nexus-badge nexus-badge-warning',
    holiday: 'nexus-badge nexus-badge-info',
    weekend: 'bg-slate-100 text-slate-600 nexus-badge',
    on_leave: 'nexus-badge nexus-badge-warning',
  };
  const labels: Record<string, string> = {
    present: 'Present', absent: 'Absent', late: 'Late', half_day: 'Half Day',
    holiday: 'Holiday', weekend: 'Weekend', on_leave: 'On Leave',
  };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function getDayStatusColor(status: string) {
  const map: Record<string, string> = {
    present: 'bg-emerald-500 text-white',
    absent: 'bg-red-500 text-white',
    late: 'bg-orange-400 text-white',
    half_day: 'bg-amber-400 text-white',
    holiday: 'bg-blue-400 text-white',
    weekend: 'bg-slate-200 text-slate-500',
    on_leave: 'bg-amber-400 text-white',
  };
  return map[status] || 'bg-slate-100 text-slate-400';
}

/* ── Component ── */
export default function AttendancePage() {
  const { user } = useAuthStore();

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  });

  /* Find current user's employee record */
  const fetchEmployee = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?limit=500', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const myEmp = data.employees?.find((e: { email: string }) => e.email === user?.email);
        if (myEmp) setEmployee(myEmp);
      }
    } catch { /* ignore */ }
  }, [user?.email]);

  /* Fetch attendance data */
  const fetchAttendance = useCallback(async () => {
    if (!employee) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/attendance?employeeId=${employee.id}&limit=50`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAttendance(data.attendance || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, [employee]);

  useEffect(() => { queueMicrotask(() => fetchEmployee()); }, [fetchEmployee]);
  useEffect(() => { if (employee) queueMicrotask(() => fetchAttendance()); }, [employee, fetchAttendance]);

  /* Check In */
  const handleCheckIn = async () => {
    if (!employee) return;
    try {
      setCheckingIn(true);
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId: employee.id, action: 'checkin' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Checked in successfully!');
      fetchAttendance();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  /* Check Out */
  const handleCheckOut = async () => {
    if (!employee) return;
    try {
      setCheckingOut(true);
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId: employee.id, action: 'checkout' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Checked out successfully!');
      fetchAttendance();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Check-out failed');
    } finally {
      setCheckingOut(false);
    }
  };

  /* Today's status */
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRecord = attendance.find(a => {
    const d = new Date(a.date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });

  const isCheckedIn = !!todayRecord?.checkIn;
  const isCheckedOut = !!todayRecord?.checkOut;

  /* Calendar data for selected month */
  const getCalendarDays = () => {
    const { month, year } = selectedMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();
    const days: Array<{ date: number; status: string | null; isCurrentMonth: boolean }> = [];

    // Padding before
    for (let i = 0; i < startPad; i++) {
      days.push({ date: 0, status: null, isCurrentMonth: false });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = new Date(year, month, d).toISOString().split('T')[0];
      const record = attendance.find(a => {
        const aDate = new Date(a.date).toISOString().split('T')[0];
        return aDate === dateStr;
      });
      days.push({ date: d, status: record?.status || null, isCurrentMonth: true });
    }

    return days;
  };

  const calendarDays = getCalendarDays();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const navigateMonth = (dir: -1 | 1) => {
    setSelectedMonth(prev => {
      let { month, year } = prev;
      month += dir;
      if (month > 11) { month = 0; year++; }
      if (month < 0) { month = 11; year--; }
      return { month, year };
    });
  };

  /* Stats */
  const presentCount = attendance.filter(a => ['present', 'late'].includes(a.status)).length;
  const lateCount = attendance.filter(a => a.status === 'late').length;
  const totalHours = attendance.reduce((sum, a) => sum + (a.workHours || 0), 0);
  const totalOvertime = attendance.reduce((sum, a) => sum + (a.overtime || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiClock className="w-6 h-6 text-cyan-500" />
            Attendance
          </h1>
          <p className="text-nexus-text-secondary mt-1">Track your daily attendance and work hours</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckIn}
            disabled={checkingIn || isCheckedIn}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
              isCheckedIn
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/25'
            }`}
          >
            <FiLogIn className="w-4 h-4" />
            {checkingIn ? 'Checking...' : isCheckedIn ? 'Checked In' : 'Check In'}
          </button>
          <button
            onClick={handleCheckOut}
            disabled={checkingOut || !isCheckedIn || isCheckedOut}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
              !isCheckedIn || isCheckedOut
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-500/25'
            }`}
          >
            <FiLogOut className="w-4 h-4" />
            {checkingOut ? 'Checking...' : isCheckedOut ? 'Checked Out' : 'Check Out'}
          </button>
        </div>
      </div>

      {/* Module Tips */}
      <ModuleTips
        moduleKey="attendance"
        title="Attendance Tips"
        tips={attendanceTips}
        userRole={user?.role}
      />

      <ModuleWorkflow
        moduleKey="attendance"
        title="How to Track Attendance"
        subtitle="Follow this workflow to set up and monitor attendance"
        steps={attendanceWorkflowSteps}
        accentColor="cyan"
        userRole={user?.role}
      />

      {/* Today's Status Card */}
      <div className="nexus-card p-6">
        <h2 className="text-sm font-semibold text-nexus-text-primary mb-4">Today&apos;s Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
            <p className="text-xs font-medium text-blue-600 mb-1">Check In</p>
            <p className="text-lg font-bold text-blue-700">{todayRecord?.checkIn ? formatTime(todayRecord.checkIn) : '—'}</p>
          </div>
          <div className="p-4 rounded-xl bg-red-50 border border-red-100">
            <p className="text-xs font-medium text-red-600 mb-1">Check Out</p>
            <p className="text-lg font-bold text-red-700">{todayRecord?.checkOut ? formatTime(todayRecord.checkOut) : '—'}</p>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
            <p className="text-xs font-medium text-emerald-600 mb-1">Work Hours</p>
            <p className="text-lg font-bold text-emerald-700">{todayRecord?.workHours != null ? `${todayRecord.workHours}h` : '—'}</p>
          </div>
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
            <p className="text-xs font-medium text-amber-600 mb-1">Status</p>
            <p className="text-lg font-bold text-amber-700">{todayRecord ? getStatusBadge(todayRecord.status).label : 'Not Checked In'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Calendar */}
        <div className="lg:col-span-2 nexus-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-nexus-text-primary">Monthly Calendar</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded-lg border border-nexus-border text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                <FiChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-nexus-text-primary min-w-[140px] text-center">
                {monthNames[selectedMonth.month]} {selectedMonth.year}
              </span>
              <button onClick={() => navigateMonth(1)} className="p-1.5 rounded-lg border border-nexus-border text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-semibold text-nexus-text-muted py-2">{day}</div>
            ))}
            {calendarDays.map((day, i) => {
              if (!day.isCurrentMonth) return <div key={`pad-${i}`} className="aspect-square" />;
              const isToday = day.date === today.getDate() && selectedMonth.month === today.getMonth() && selectedMonth.year === today.getFullYear();
              return (
                <div
                  key={day.date}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative ${
                    day.status ? getDayStatusColor(day.status) : 'bg-slate-50 text-nexus-text-muted'
                  } ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                >
                  <span className="font-medium">{day.date}</span>
                  {day.status && <span className="text-[8px] leading-none mt-0.5 opacity-80">{day.status === 'present' ? 'P' : day.status === 'late' ? 'L' : day.status === 'absent' ? 'A' : day.status === 'holiday' ? 'H' : day.status === 'weekend' ? 'W' : day.status === 'half_day' ? 'HD' : day.status === 'on_leave' ? 'LV' : ''}</span>}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-nexus-border">
            {[
              { label: 'Present', color: 'bg-emerald-500' },
              { label: 'Late', color: 'bg-orange-400' },
              { label: 'Absent', color: 'bg-red-500' },
              { label: 'Half Day', color: 'bg-amber-400' },
              { label: 'Holiday', color: 'bg-blue-400' },
              { label: 'Weekend', color: 'bg-slate-200' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded ${l.color}`} />
                <span className="text-xs text-nexus-text-muted">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats Sidebar */}
        <div className="space-y-4">
          <div className="nexus-card p-6">
            <h3 className="text-sm font-semibold text-nexus-text-primary mb-4">Monthly Summary</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-nexus-text-secondary">Present Days</span>
                <span className="text-sm font-semibold text-emerald-600">{presentCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-nexus-text-secondary">Late Arrivals</span>
                <span className="text-sm font-semibold text-orange-600">{lateCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-nexus-text-secondary">Total Hours</span>
                <span className="text-sm font-semibold text-blue-600">{totalHours.toFixed(1)}h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-nexus-text-secondary">Overtime</span>
                <span className="text-sm font-semibold text-violet-600">{totalOvertime.toFixed(1)}h</span>
              </div>
            </div>
          </div>

          <div className="nexus-card p-6">
            <h3 className="text-sm font-semibold text-nexus-text-primary mb-3">Quick Info</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <FiCalendar className="w-4 h-4 text-nexus-text-muted" />
                <span className="text-nexus-text-secondary">Current Month: </span>
                <span className="font-medium text-nexus-text-primary">{monthNames[selectedMonth.month]}</span>
              </div>
              {employee && (
                <div className="flex items-center gap-2 text-sm">
                  <FiMapPin className="w-4 h-4 text-nexus-text-muted" />
                  <span className="text-nexus-text-secondary">Employee: </span>
                  <span className="font-medium text-nexus-text-primary">{employee.firstName} {employee.lastName}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Records Table */}
      <div className="nexus-card overflow-hidden">
        <div className="p-6 border-b border-nexus-border">
          <h2 className="text-sm font-semibold text-nexus-text-primary">Attendance Records</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Check In</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Check Out</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Work Hours</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Overtime</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                  </tr>
                ))
              ) : attendance.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FiClock className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No attendance records</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Check in to start tracking your attendance</p>
                  </td>
                </tr>
              ) : (
                attendance.map(a => {
                  const badge = getStatusBadge(a.status);
                  return (
                    <tr key={a.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-nexus-text-primary">{formatDate(a.date)}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatTime(a.checkIn)}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatTime(a.checkOut)}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{a.workHours != null ? `${a.workHours}h` : '—'}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{a.overtime != null && a.overtime > 0 ? `${a.overtime}h` : '—'}</td>
                      <td className="px-4 py-3"><span className={badge.className}>{badge.label}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
