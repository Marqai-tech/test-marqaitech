'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiUsers,
  FiDownload,
  FiFilter,
  FiEye,
  FiClock,
} from 'react-icons/fi';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';

/* ── Types ── */
interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  department?: { name: string };
  designation?: { title: string };
  avatar?: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  status: string;
  checkIn?: string | null;
  checkOut?: string | null;
}

interface DayStatus {
  date: number;
  status: string;
  record?: AttendanceRecord;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getDayColor(status: string) {
  const colors: Record<string, string> = {
    present: 'bg-emerald-500',
    absent: 'bg-red-500',
    late: 'bg-orange-400',
    half_day: 'bg-amber-400',
    holiday: 'bg-green-400',
    weekend: 'bg-slate-200',
    on_leave: 'bg-teal-400',
    '': 'bg-slate-100',
  };
  return colors[status] || 'bg-slate-100';
}

function getDayLabel(status: string) {
  const labels: Record<string, string> = {
    present: 'P',
    absent: 'A',
    late: 'L',
    half_day: 'H',
    holiday: 'Hd',
    weekend: 'W',
    on_leave: 'Lv',
    '': '-',
  };
  return labels[status] || '-';
}

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

/* Task 83: month-safe date key for an attendance row.
 * Rows are stored either at UTC midnight of the local calendar day
 * (`YYYY-MM-DDT00:00:00.000Z`) or at IST midnight (`…+05:30` = previous day
 * 18:30 UTC). UTC-midnight rows map directly from their ISO date; anything
 * else is converted to the IST calendar date. Mapping by DAY-OF-MONTH ONLY
 * (the old code) pulled September records into the October grid. */
function recordDateKey(v: string): string {
  const raw = String(v || '');
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw.split('T')[0];
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return d.toISOString().slice(0, 10);
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/* Compact 12-hour time for the day cells, e.g. "9:02a" / "6:15p". */
function fmtCellTime(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' AM', 'a').replace(' PM', 'p').replace(':00', '');
}

/* Full time for tooltips, e.g. "09:02 AM". */
function fmtTitleTime(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function getMonthName(month: number) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month];
}

/* ── Component ── */
export default function MusterRollPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const effectiveCompanyId = useCompanyContextStore(s => s.effectiveCompanyId);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'tenant_admin' || user?.role === 'admin';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Map<string, Map<string, AttendanceRecord>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  });
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  /* Fetch employees based on role */
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(`/api/employees?${scopeQuery}limit=500`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        let filteredEmployees = data.employees || [];

        // Role-based filtering
        if (!isAdmin) {
          // Regular employees see only themselves
          filteredEmployees = filteredEmployees.filter((e: Employee) => e.email === user?.email);
        }

        // Department filter
        if (departmentFilter) {
          filteredEmployees = filteredEmployees.filter((e: Employee) =>
            e.department?.name === departmentFilter
          );
        }

        setEmployees(filteredEmployees);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load employees');
    }
  }, [user?.email, isAdmin, departmentFilter]);

  /* Fetch attendance for all employees — Task 83: the API now honours
   * employeeIds + startDate/endDate, and rows are keyed by their FULL
   * calendar date (not day-of-month) so only the selected month's records
   * land in the grid. */
  const fetchAttendance = useCallback(async () => {
    if (employees.length === 0) return;

    try {
      const employeeIds = employees.map(e => e.id);
      const monthNum = selectedMonth.month + 1;
      const lastDay = getDaysInMonth(selectedMonth.month, selectedMonth.year);
      const startDate = `${selectedMonth.year}-${pad2(monthNum)}-01`;
      const endDate = `${selectedMonth.year}-${pad2(monthNum)}-${pad2(lastDay)}`;

      const res = await fetch(
        `/api/attendance?employeeIds=${encodeURIComponent(employeeIds.join(','))}&startDate=${startDate}&endDate=${endDate}&limit=10000`,
        { headers: getAuthHeaders() }
      );

      if (res.ok) {
        const data = await res.json();
        const records: AttendanceRecord[] = data.attendance || [];
        const monthPrefix = `${selectedMonth.year}-${pad2(monthNum)}-`;

        // Build map: employeeId -> dateKey -> record
        const map = new Map<string, Map<string, AttendanceRecord>>();
        records.forEach(record => {
          const key = recordDateKey(record.date);
          if (!key.startsWith(monthPrefix)) return; // never mix months
          if (!map.has(record.employeeId)) {
            map.set(record.employeeId, new Map());
          }
          map.get(record.employeeId)!.set(key, record);
        });

        setAttendanceMap(map);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load attendance data');
    }
  }, [employees, selectedMonth]);
  const cid = effectiveCompanyId();
  const scopeQuery = cid ? `companyId=${cid}&` : '';


  useEffect(() => {
    queueMicrotask(() => fetchEmployees());
  }, [fetchEmployees]);

  useEffect(() => {
    if (employees.length > 0) {
      queueMicrotask(() => fetchAttendance());
    }
  }, [employees, fetchAttendance]);

  useEffect(() => {
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  }, [selectedMonth, departmentFilter, statusFilter]);

  /* Navigation */
  const prevMonth = () => {
    setSelectedMonth(prev => {
      const month = prev.month === 0 ? 11 : prev.month - 1;
      const year = prev.month === 0 ? prev.year - 1 : prev.year;
      return { month, year };
    });
  };

  const nextMonth = () => {
    setSelectedMonth(prev => {
      const month = prev.month === 11 ? 0 : prev.month + 1;
      const year = prev.month === 11 ? prev.year + 1 : prev.year;
      return { month, year };
    });
  };

  const daysInMonth = getDaysInMonth(selectedMonth.month, selectedMonth.year);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  /* Get unique departments for filter */
  const departments = Array.from(new Set(employees.map(e => e.department?.name).filter(Boolean)));

  /* Task 83: employees shown in the grid — statusFilter narrows the rows to
   * employees who have at least one day of that status in the month. */
  const visibleEmployees = statusFilter
    ? employees.filter(emp => {
        const days = attendanceMap.get(emp.id);
        if (!days) return statusFilter === 'absent'; // no rows at all → only absent matches
        let matched = false;
        days.forEach(rec => { if (rec.status === statusFilter) matched = true; });
        return matched;
      })
    : employees;

  /* Calculate statistics */
  const calculateStats = (empId: string) => {
    const empAttendance = attendanceMap.get(empId);
    if (!empAttendance) return { present: 0, absent: 0, late: 0, leave: 0 };

    let present = 0, absent = 0, late = 0, leave = 0;
    empAttendance.forEach(record => {
      if (record.status === 'present') present++;
      else if (record.status === 'absent') absent++;
      else if (record.status === 'late') late++;
      else if (record.status === 'on_leave') leave++;
    });

    return { present, absent, late, leave };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiCalendar className="w-6 h-6 text-green-500" />
            Muster Roll
          </h1>
          <p className="text-nexus-text-secondary mt-1">
            {isAdmin ? 'View attendance for all employees' : 'View your attendance record'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-sm">
            <FiDownload className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="nexus-card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Month Navigation */}
          <div className="flex items-center gap-2 flex-1">
            <button
              onClick={prevMonth}
              className="p-2 rounded-lg border border-nexus-border hover:bg-slate-50 transition-colors"
            >
              <FiChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-lg font-semibold min-w-[200px] text-center">
              {getMonthName(selectedMonth.month)} {selectedMonth.year}
            </div>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg border border-nexus-border hover:bg-slate-50 transition-colors"
            >
              <FiChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Filters */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <FiFilter className="w-5 h-5 text-nexus-text-muted" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20"
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20"
              >
                <option value="">All Status</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="nexus-card p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-emerald-500 rounded"></div>
            <span>Present</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-500 rounded"></div>
            <span>Absent</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-orange-400 rounded"></div>
            <span>Late</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-amber-400 rounded"></div>
            <span>Half Day</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-teal-400 rounded"></div>
            <span>On Leave</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-slate-200 rounded"></div>
            <span>Weekend/Holiday</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-nexus-text-muted">
            <span>Each cell shows the status colour code with the punch In – Out times (hover for details).</span>
          </div>
        </div>
      </div>

      {/* Muster Roll Grid */}
      {loading ? (
        <div className="nexus-card p-12 text-center">
          <FiClock className="w-12 h-12 mx-auto mb-4 text-nexus-text-muted animate-pulse" />
          <p className="text-nexus-text-secondary">Loading muster roll...</p>
        </div>
      ) : employees.length === 0 ? (
        <div className="nexus-card p-12 text-center">
          <FiUsers className="w-12 h-12 mx-auto mb-4 text-nexus-text-muted" />
          <p className="text-nexus-text-secondary">No employees found</p>
        </div>
      ) : (
        <div className="nexus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-nexus-border">
                  <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider min-w-[200px]">
                    Employee
                  </th>
                  {days.map(day => (
                    <th key={day} className="px-2 py-3 text-center text-xs font-semibold text-nexus-text-secondary min-w-[52px]">
                      {day}
                    </th>
                  ))}
                  <th className="sticky right-0 bg-slate-50 px-4 py-3 text-center text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider min-w-[200px]">
                    Summary
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map(emp => {
                  const stats = calculateStats(emp.id);
                  const empAttendance = attendanceMap.get(emp.id);
                  const initials = `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase();

                  return (
                    <tr key={emp.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50">
                      <td className="sticky left-0 bg-white px-4 py-3">
                        <div className="flex items-center gap-3">
                          {emp.avatar ? (
                            <img src={emp.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold">
                              {initials}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-nexus-text-primary">{emp.firstName} {emp.lastName}</p>
                            <p className="text-xs text-nexus-text-muted">{emp.employeeId}</p>
                          </div>
                        </div>
                      </td>
                      {days.map(day => {
                        // Task 83: look up by FULL calendar date key — the old
                        // day-of-month lookup mixed other months' records in.
                        const dateKey = `${selectedMonth.year}-${pad2(selectedMonth.month + 1)}-${pad2(day)}`;
                        const record = empAttendance?.get(dateKey);
                        const status = record?.status || '';
                        const color = getDayColor(status);
                        const label = getDayLabel(status);
                        const inTime = fmtCellTime(record?.checkIn);
                        const outTime = fmtCellTime(record?.checkOut);
                        const hasTimes = !!(inTime || outTime);
                        const tooltip = record
                          ? `${getMonthName(selectedMonth.month)} ${day}: ${status || '—'}${record.checkIn ? ` · In ${fmtTitleTime(record.checkIn)}` : ''}${record.checkOut ? ` · Out ${fmtTitleTime(record.checkOut)}` : ''}`
                          : `${getMonthName(selectedMonth.month)} ${day}: no record`;

                        return (
                          <td key={day} className="px-1 py-2">
                            <div
                              title={tooltip}
                              className={`w-11 rounded flex flex-col items-center justify-center py-1 cursor-pointer hover:opacity-90 transition-opacity ${color} ${hasTimes ? 'h-12' : 'h-8'}`}
                            >
                              <span className="text-[11px] font-bold text-white leading-none">{label}</span>
                              {hasTimes && (
                                <span className="mt-0.5 text-[8px] leading-none text-white/95 whitespace-nowrap">
                                  {inTime || '—'}{outTime ? ` – ${outTime}` : ''}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="sticky right-0 bg-white px-4 py-3">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                            <span>{stats.present}P</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-red-500 rounded"></div>
                            <span>{stats.absent}A</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-orange-400 rounded"></div>
                            <span>{stats.late}L</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-teal-400 rounded"></div>
                            <span>{stats.leave}Lv</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {employees.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="nexus-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-nexus-text-muted">Total Employees</p>
                <p className="text-2xl font-bold text-nexus-text-primary">{visibleEmployees.length}</p>
              </div>
              <FiUsers className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="nexus-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-nexus-text-muted">Average Present</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {visibleEmployees.length > 0
                    ? Math.round(visibleEmployees.reduce((sum, emp) => sum + calculateStats(emp.id).present, 0) / visibleEmployees.length)
                    : 0}
                  days
                </p>
              </div>
              <FiCalendar className="w-8 h-8 text-emerald-500" />
            </div>
          </div>
          <div className="nexus-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-nexus-text-muted">Average Absent</p>
                <p className="text-2xl font-bold text-red-600">
                  {visibleEmployees.length > 0
                    ? Math.round(visibleEmployees.reduce((sum, emp) => sum + calculateStats(emp.id).absent, 0) / visibleEmployees.length)
                    : 0}
                  days
                </p>
              </div>
              <FiCalendar className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <div className="nexus-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-nexus-text-muted">Attendance Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {visibleEmployees.length > 0
                    ? Math.round(
                        (visibleEmployees.reduce((sum, emp) => sum + calculateStats(emp.id).present, 0) /
                          (visibleEmployees.length * daysInMonth)) * 100
                      )
                    : 0}
                  %
                </p>
              </div>
              <FiCalendar className="w-8 h-8 text-green-500" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
