'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FiClock,
  FiLogIn,
  FiLogOut,
  FiCalendar,
  FiMapPin,
  FiChevronLeft,
  FiChevronRight,
  FiCpu,
  FiCheckSquare,
  FiMap,
  FiAlertTriangle,
  FiShield,
  FiList,
  FiSearch,
  FiCheckCircle,
  FiXCircle,
  FiAlertCircle,
  FiUserCheck,
  FiEye,
  FiUsers,
  FiFilter,
  FiGrid,
  FiRefreshCw,
  FiDatabase,
  FiCoffee,
  FiInfo,
} from 'react-icons/fi';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { sanitizeSearch } from '@/lib/validators';
import { useAuthStore } from '@/store/authStore';
import { getDataScope } from '@/lib/roleAccess';
import { getToken } from '@/lib/token-storage';
import { formatHoursHm } from '@/lib/format-hours';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { isClientDemoMode } from '@/lib/site-mode';

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
  employeeId?: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workHours?: number | null;
  overtime?: number | null;
  status: string;
  notes?: string | null;
  location?: string | null;
  // Task 57: break + GPS fields (returned by /api/attendance/punch)
  breakIn?: string | null;
  breakOut?: string | null;
  breakMinutes?: number | null;
  punchMethod?: string | null;
  earlyLogout?: boolean;
  checkInGpsLat?: number | null;
  checkInGpsLng?: number | null;
  checkInGpsLabel?: string | null;
  checkOutGpsLat?: number | null;
  checkOutGpsLng?: number | null;
  checkOutGpsLabel?: string | null;
  breakInGpsLabel?: string | null;
  breakOutGpsLabel?: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    avatar?: string | null;
  } | null;
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
  const token = getToken() || (typeof window !== 'undefined' ? useAuthStore.getState().token : null);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(d: string | null | undefined) {
  if (!d) return '—';
  // Task 69: explicitly use 12-hour format with AM/PM for clarity.
  // The browser's toLocaleTimeString converts from UTC to the browser's
  // local timezone (e.g., IST) automatically — so the displayed time
  // matches the employee's actual local check-in time.
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

function getStatusConfig(status: string) {
  const configs: Record<string, { label: string; dotColor: string; bgColor: string; textColor: string }> = {
    present: { label: 'Present', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
    absent: { label: 'Absent', dotColor: 'bg-red-500', bgColor: 'bg-red-50', textColor: 'text-red-700' },
    // "Present (Late)" — user request: checked in after shift start is still a
    // present day, flagged with the lateness ("Late by 42 mins" shown separately)
    late: { label: 'Present (Late)', dotColor: 'bg-amber-500', bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
    on_leave: { label: 'On Leave', dotColor: 'bg-green-500', bgColor: 'bg-green-50', textColor: 'text-green-700' },
    half_day: { label: 'Half Day', dotColor: 'bg-teal-500', bgColor: 'bg-teal-50', textColor: 'text-teal-700' },
    holiday: { label: 'Holiday', dotColor: 'bg-sky-500', bgColor: 'bg-sky-50', textColor: 'text-sky-700' },
    weekend: { label: 'Weekend', dotColor: 'bg-slate-400', bgColor: 'bg-slate-50', textColor: 'text-slate-600' },
    not_marked: { label: 'Not Marked', dotColor: 'bg-slate-300', bgColor: 'bg-slate-50', textColor: 'text-slate-500' },
  };
  return configs[status] || { label: status, dotColor: 'bg-gray-400', bgColor: 'bg-gray-50', textColor: 'text-gray-600' };
}

function getDayStatusColor(status: string) {
  const map: Record<string, string> = {
    present: 'bg-emerald-500 text-white',
    absent: 'bg-red-500 text-white',
    late: 'bg-orange-400 text-white',
    half_day: 'bg-amber-400 text-white',
    // Distinct sky tone so weekends (slate) and holidays (sky) are clearly
    // different from leave (green) in the calendar
    holiday: 'bg-sky-400 text-white',
    weekend: 'bg-slate-200 text-slate-500',
    on_leave: 'bg-green-400 text-white',
  };
  return map[status] || 'bg-slate-100 text-slate-400';
}

function getInitials(firstName?: string, lastName?: string) {
  const f = firstName?.charAt(0)?.toUpperCase() || '';
  const l = lastName?.charAt(0)?.toUpperCase() || '';
  return f + l || '?';
}

/* ── Timezone-safe date helpers ──
 * Attendance rows are stored at UTC midnight for the employee's LOCAL
 * calendar day. Calendar/table keys are built from LOCAL date parts —
 * NEVER from `new Date(y, m, d).toISOString()`, which converts local
 * midnight back a day in timezones ahead of UTC and was the ROOT CAUSE
 * of check-ins appearing on the wrong calendar day (15/09 → 16/09). */
export function pad2(n: number) { return String(n).padStart(2, '0'); }
export function localDateKey(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function recordDateKey(v: string) {
  const raw = String(v || '');
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw.split('T')[0];
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return d.toISOString().slice(0, 10);
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/* Derive the status of a day that has NO attendance record:
 * weekend → configured weekend days; holiday → tenant holiday calendar;
 * on_leave → an approved leave covers the day; absent → past working day
 * with no punch and no leave. Today/future working days are unmarked. */
function deriveDayStatus(params: {
  dateKey: string;
  dayOfWeek: number;
  holidaySet: Map<string, string>;
  onLeave: boolean;
  weekendDow: number[];
  todayKey: string;
}): string | null {
  const { dateKey, dayOfWeek, holidaySet, onLeave, weekendDow, todayKey } = params;
  if (weekendDow.includes(dayOfWeek)) return 'weekend';
  if (holidaySet.has(dateKey)) return 'holiday';
  if (onLeave) return 'on_leave';
  if (dateKey < todayKey) return 'absent';
  return null;
}

/* Does an approved leave for empId cover dateKey? */
function isOnLeave(leaves: Array<{ employeeId: string; startDate: string; endDate: string }>, empId: string, dateKey: string) {
  return leaves.some(l => l.employeeId === empId && recordDateKey(l.startDate) <= dateKey && dateKey <= recordDateKey(l.endDate));
}

/* Late-by measured from the configured shift START (policy), e.g.
 * Shift 9:00 · Check-in 9:42 → "42m". Falls back to a 09:00 shift. */
function calculateLateBy(checkIn: string | null | undefined, shiftStartMinutes = 540): string {
  if (!checkIn) return '0m';
  const checkInTime = new Date(checkIn);
  if (isNaN(checkInTime.getTime())) return '0m';
  const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
  const diffMins = checkInMinutes - shiftStartMinutes;
  if (diffMins <= 0) return '0m';
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m`;
}

function calculateBreakDuration(checkIn: string | null | undefined, checkOut: string | null | undefined, workHours: number | null | undefined): string {
  if (!checkIn || !checkOut || workHours == null) return '—';
  const totalMs = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  const totalHours = totalMs / (1000 * 60 * 60);
  const breakHours = totalHours - workHours;
  if (breakHours <= 0) return '0m';
  const breakMins = Math.round(breakHours * 60);
  if (breakMins < 60) return `${breakMins}m`;
  const h = Math.floor(breakMins / 60);
  const m = breakMins % 60;
  return `${h}h ${m}m`;
}

// Dashboard production hours use the fixed one-hour lunch rule.
function calculateProductionHours(checkIn: string | null | undefined, checkOut: string | null | undefined): number | null {
  if (!checkIn || !checkOut) return null;
  const spanMinutes = Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000));
  return Math.round((Math.max(0, spanMinutes - 60) / 60) * 100) / 100;
}

function calculateCompanyOvertime(checkOut: string | null | undefined): number {
  if (!checkOut) return 0;
  const end = new Date(checkOut);
  const cutoff = new Date(end);
  cutoff.setHours(18, 30, 0, 0);
  return Math.max(0, Math.round((end.getTime() - cutoff.getTime()) / 60000) / 60);
}

/* ── Sample Attendance Data removed — data comes from API only ── */

/* ── Component ── */
export default function AttendancePage() {
  const { user } = useAuthStore();
  // tenant_admin is an admin-level role everywhere else in the app (navData,
  // regularize page) — include it so Tenant Admins get the Admin View roster
  // with the Present/Absent/Late/On-Leaves counters.
  const isAdmin = getDataScope(user?.role || '') === 'all';
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);

  /* ── Active tab ── */
  const [activeTab, setActiveTab] = useState<'admin' | 'self'>(isAdmin ? 'admin' : 'self');

  /* ── Admin view state ── */
  const [adminAttendance, setAdminAttendance] = useState<AttendanceRecord[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  /* ── Derivation data: employees roster, holidays, weekends, shift & leaves ── */
  const [adminEmployees, setAdminEmployees] = useState<Array<{ id: string; firstName: string; lastName: string; employeeId: string }>>([]);
  const [holidayMap, setHolidayMap] = useState<Map<string, string>>(new Map());
  const [weekendDow, setWeekendDow] = useState<number[]>([0, 6]); // Sun + Sat default
  const [shiftStartMinutes, setShiftStartMinutes] = useState(570); // 09:30 default
  const [approvedLeaves, setApprovedLeaves] = useState<Array<{ employeeId: string; startDate: string; endDate: string }>>([]);

  /* ── Self view state ── */
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [seeding, setSeeding] = useState(false);
  // Task 57: break + GPS state
  const [breakingIn, setBreakingIn] = useState(false);
  const [breakingOut, setBreakingOut] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const handleSeedData = async () => {
    try {
      setSeeding(true);
      const res = await fetch('/api/admin/seed-demo-data', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ module: 'attendance' }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast.success(data.message || 'Attendance demo data seeded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to seed');
    } finally {
      setSeeding(false);
    }
  };
  const [checkingOut, setCheckingOut] = useState(false);
  const [earlyLogout, setEarlyLogout] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  });
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('calendar');

  /* Task 84: per-day punch counts for the current month — powers the
   * "Recent days" strip so admins can see at a glance WHICH days have
   * punches and jump straight to them (weekend/holiday days show zero
   * punches by design, which previously read as "logs missing"). */
  const [monthPunchCounts, setMonthPunchCounts] = useState<Map<string, number>>(new Map());

  /* ── Detail modal ── */
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null);

  /* ── Fetch admin attendance (all employees for selected date) + roster ── */
  const fetchAdminAttendance = useCallback(async () => {
    try {
      setAdminLoading(true);
      // Task 82: Auto-present for management — before reading the roster, ask
      // the server to create/fill auto-present rows for the selected day.
      // No-op when the toggle is off in Attendance Settings; real punches,
      // approved leave, weekends and holidays are never overwritten.
      if (selectedDate <= localDateKey(new Date())) {
        try {
          const syncRes = await fetch('/api/attendance/auto-present', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ date: selectedDate, tzOffset: new Date().getTimezoneOffset(), todayKey: localDateKey(new Date()) }),
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json().catch(() => null);
            if ((syncData?.created || 0) + (syncData?.updated || 0) > 0) {
              toast.success(syncData?.message || 'Management auto-present applied');
            }
          }
        } catch { /* non-fatal — the roster still loads */ }
      }
      const params = new URLSearchParams({
        date: selectedDate,
        limit: '200',
      });
      const sq = scopeQuery();
      // Records for the selected date AND the full active-employee roster —
      // the roster lets us derive Absent / On Leave / Weekend / Holiday for
      // employees who have NO attendance row (previously they were invisible
      // and the admin counts stayed at 0).
      const [attRes, empRes] = await Promise.all([
        fetch(`/api/attendance?${params.toString()}${sq ? `&${sq}` : ''}&includePhotos=0`, { headers: getAuthHeaders() }),
        fetch(`/api/employees?limit=500&status=active&includePhotos=0${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() }),
      ]);
      if (attRes.ok) {
        const data = await attRes.json();
        setAdminAttendance(data.attendance || []);
      } else {
        setAdminAttendance([]);
      }
      if (empRes.ok) {
        const eData = await empRes.json();
        const rows = eData.employees || eData.data || [];
        setAdminEmployees(rows.map((e: { id: string; firstName: string; lastName: string; employeeId: string }) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName, employeeId: e.employeeId })));
      } else {
        setAdminEmployees([]);
      }
    } catch (err) {
      console.error(err);
      setAdminAttendance([]);
    } finally {
      setAdminLoading(false);
    }
  }, [selectedDate, scopeQuery, selectedTenantId]);

  /* ── Fetch org context: shift policy (late threshold + weekend days) + holidays ── */
  const fetchOrgContext = useCallback(async () => {
    const sq = scopeQuery();
    const [policyRes, holidayRes] = await Promise.all([
      fetch(`/api/attendance-policy-config${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() }).catch(() => null),
      fetch(`/api/holidays?year=${selectedMonth.year}&limit=200${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() }).catch(() => null),
    ]);
    if (policyRes?.ok) {
      try {
        const d = await policyRes.json();
        const cfg = d.config || {};
        if (typeof cfg.shiftStartDefault === 'string' && /^\d{1,2}:\d{2}$/.test(cfg.shiftStartDefault)) {
          const [h, m] = cfg.shiftStartDefault.split(':').map(Number);
          setShiftStartMinutes(h * 60 + m);
        }
        if (Array.isArray(d.weekendDays) && d.weekendDays.length > 0) {
          setWeekendDow(d.weekendDays.map((n: number) => Number(n)));
        }
      } catch { /* defaults stay */ }
    }
    if (holidayRes?.ok) {
      try {
        const d = await holidayRes.json();
        const rows = d.data || d.holidays || [];
        const map = new Map<string, string>();
        rows.forEach((h: { date: string; name?: string }) => { map.set(recordDateKey(h.date), h.name || 'Holiday'); });
        setHolidayMap(map);
      } catch { /* keep previous */ }
    }
  }, [scopeQuery, selectedTenantId, selectedMonth.year]);

  /* ── Fetch approved leaves (company-wide for admins, own for employees) ── */
  const fetchApprovedLeaves = useCallback(async () => {
    try {
      const sq = scopeQuery();
      const fromDate = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
      const toDate = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const res = await fetch(`/api/leave?status=approved&fromDate=${fromDate}&toDate=${toDate}&limit=500${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const d = await res.json();
      const rows = d.leaveRequests || d.leaves || [];
      setApprovedLeaves(rows.map((r: { employeeId: string; startDate: string; endDate: string }) => ({ employeeId: r.employeeId, startDate: r.startDate, endDate: r.endDate })));
    } catch { /* keep previous */ }
  }, [scopeQuery, selectedTenantId, selectedMonth.month, selectedMonth.year]);

  /* ── Find current user's employee record ── */
  const fetchEmployee = useCallback(async () => {
    try {
      // First: use the employee info from auth store if available (most reliable)
      if (user?.employee?.id) {
        setEmployee({
          id: user.employee.id,
          employeeId: user.employee.employeeId,
          firstName: user.employee.firstName,
          lastName: user.employee.lastName,
          email: user.email,
        });
        return;
      }
      // Task 83: admins must ALSO fall through to the API lookup.
      // The login response never includes user.employee, so the previous
      // `if (isAdmin) return;` early-exit left `employee` null for every
      // admin — the My Attendance tab (calendar, table, stats) then showed
      // zero logs forever, and Check In/Out errored with "Employee record
      // not found". Admins who are also employees (e.g. HR manager MARQ001)
      // now resolve their record by email/userId below. Admins without an
      // employee row simply find no match and stay in the empty state.
      const sq = scopeQuery();
      const employeeLimit = getDataScope(user?.role || '') === 'self' ? 1 : 500;
      const res = await fetch(`/api/employees?limit=${employeeLimit}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const myEmp = data.employees?.find((e: { email: string; userId?: string }) =>
          e.email === user?.email || e.userId === user?.id
        );
        if (myEmp) setEmployee(myEmp);
        else setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('fetchEmployee error:', err);
      setLoading(false);
    }
  }, [user?.email, user?.id, user?.role, user?.employee, isAdmin, scopeQuery, selectedTenantId]);

  /* ── Fetch self attendance ── */
  const fetchAttendance = useCallback(async () => {
    if (!employee) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/attendance?employeeId=${employee.id}&limit=100&includePhotos=0`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const fetched = data.attendance || [];
        setAttendance(fetched);
      } else {
        setAttendance([]);
      }
    } catch (err) {
      console.error(err);
      setAttendance([]);
    } finally {
      setLoading(false);
    }
  }, [employee]);

  /* ── Effects ── */
  useEffect(() => { queueMicrotask(() => fetchEmployee()); }, [fetchEmployee]);
  useEffect(() => { if (employee) queueMicrotask(() => fetchAttendance()); }, [employee, fetchAttendance]);
  useEffect(() => { if (isAdmin && activeTab === 'admin') queueMicrotask(() => fetchAdminAttendance()); }, [fetchAdminAttendance, activeTab, isAdmin]);
  // Load the attendance record first. Policy/holiday and approved-leave data
  // enrich the calendar but are not needed to render the main table or punch
  // controls, so defer them until the browser has painted the primary view.
  useEffect(() => {
    const timer = window.setTimeout(() => fetchOrgContext(), 250);
    return () => window.clearTimeout(timer);
  }, [fetchOrgContext]);
  useEffect(() => {
    const timer = window.setTimeout(() => fetchApprovedLeaves(), 350);
    return () => window.clearTimeout(timer);
  }, [fetchApprovedLeaves]);

  /* Task 84: month-window punch counts for the Recent-days strip. Counted
   * for TODAY's month (the strip always shows the last 7 calendar days);
   * re-counted when the selected date changes so a fresh check-in shows up
   * after the next navigation/refresh. */
  useEffect(() => {
    if (!isAdmin || activeTab !== 'admin') return;
    (async () => {
      try {
        const now = new Date();
        const m = now.getMonth() + 1;
        const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const sq = scopeQuery();
        const res = await fetch(
          `/api/attendance?startDate=${now.getFullYear()}-${pad2(m)}-01&endDate=${now.getFullYear()}-${pad2(m)}-${pad2(last)}&limit=10000${sq ? `&${sq}` : ''}`,
          { headers: getAuthHeaders() }
        );
        if (!res.ok) return;
        const d = await res.json();
        const counts = new Map<string, number>();
        (d.attendance || []).forEach((r: AttendanceRecord) => {
          if (!r.checkIn && !r.checkOut) return;
          const k = recordDateKey(r.date);
          counts.set(k, (counts.get(k) || 0) + 1);
        });
        setMonthPunchCounts(counts);
      } catch { /* non-fatal — the strip just shows zero counts */ }
    })();
  }, [isAdmin, activeTab, scopeQuery, selectedTenantId, selectedDate]);

  /* ── Task 57: GPS capture helper ──
   * Uses navigator.geolocation.getCurrentPosition to grab lat/lng/accuracy
   * before every punch (check-in / check-out / break-in / break-out). If
   * the user denies location or the browser doesn't support it, we proceed
   * without GPS — the punch is still recorded (gps=null) and a toast warns
   * the user. The /api/attendance/punch endpoint accepts gps as optional.
   *
   * Task 59: after capturing coordinates, also reverse-geocode to a
   * human-readable area name (e.g. "Koramangala, Bengaluru, IN") using
   * BigDataCloud's free client-side endpoint. The label is stored on the
   * Attendance + PunchEvent rows so the punch-log report shows the area
   * name instead of raw lat/lng coordinates.
   */
  const captureGps = async (): Promise<{ lat: number; lng: number; accuracy: number; label?: string } | null> => {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      setGpsStatus('Capturing GPS…');
      const timeout = setTimeout(() => {
        setGpsStatus(null);
        resolve(null); // timeout — proceed without GPS
      }, 8000);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          clearTimeout(timeout);
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;
          // Reverse-geocode to an area name (best-effort — non-blocking on failure)
          let label: string | undefined;
          try {
            setGpsStatus('Resolving area…');
            const { reverseGeocode } = await import('@/lib/reverse-geocode');
            label = (await reverseGeocode(lat, lng)) || undefined;
          } catch { /* best-effort */ }
          setGpsStatus(null);
          resolve({ lat, lng, accuracy, label });
        },
        (err) => {
          clearTimeout(timeout);
          setGpsStatus(null);
          // Permission denied / unavailable — proceed without GPS
          console.warn('[GPS] capture failed:', err.message);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 },
      );
    });
  };

  /* ── Check In ── */
  const handleCheckIn = async () => {
    if (!employee) {
      toast.error('Employee record not found. Please ensure your profile is set up.');
      return;
    }
    try {
      setCheckingIn(true);
      const now = new Date();
      const gps = await captureGps();
      if (!gps) throw new Error('Location access is required to check in/check out. Please enable location access and try again.');
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: employee.id,
          action: 'checkin',
          date: localDateKey(now),
          localTime: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`, utcTimestamp: now.toISOString(),
          gps,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Checked in successfully!' + (gps?.label ? ` (${gps.label})` : gps ? ` (${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})` : ''));
      await fetchAttendance();
      if (isAdmin) await fetchAdminAttendance();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  /* ── Check Out ── */
  const handleCheckOut = async () => {
    if (!employee) {
      toast.error('Employee record not found. Please ensure your profile is set up.');
      return;
    }
    try {
      setCheckingOut(true);
      const now = new Date();
      const gps = await captureGps();
      if (!gps) throw new Error('Location access is required to check in/check out. Please enable location access and try again.');
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: employee.id,
          action: 'checkout',
          date: localDateKey(now),
          localTime: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`, utcTimestamp: now.toISOString(),
          gps,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Checked out successfully!' + (gps?.label ? ` (${gps.label})` : gps ? ` (${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})` : ''));
      await fetchAttendance();
      if (isAdmin) await fetchAdminAttendance();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Check-out failed');
    } finally {
      setCheckingOut(false);
    }
  };

  const handleEarlyLogout = async (checked: boolean) => {
    if (!checked || !employee || !isCheckedIn || isCheckedOut) return;
    try {
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId: employee.id, action: 'set_early_logout', date: localDateKey(new Date()), localTime: `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not enable Early Logout');
      setEarlyLogout(true);
      toast.success('Half-Day Leave / Early Checkout enabled. Your next punch will be Check-Out.');
      await fetchAttendance();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not enable Early Logout');
    }
  };

  /* ── Task 57: Break In (start lunch/tea break) ── */
  const handleBreakIn = async () => {
    if (!employee) return;
    try {
      setBreakingIn(true);
      const now = new Date();
      const gps = await captureGps();
      if (!gps) toast('Location unavailable — break recorded without GPS', { icon: '⚠️' });
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: employee.id,
          action: 'breakin',
          date: localDateKey(now),
          localTime: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`, utcTimestamp: now.toISOString(),
          gps,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Break started' + (gps?.label ? ` (${gps.label})` : gps ? ` (${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})` : ''));
      await fetchAttendance();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Break-in failed');
    } finally {
      setBreakingIn(false);
    }
  };

  /* ── Task 57: Break Out (end lunch/tea break) ── */
  const handleBreakOut = async () => {
    if (!employee) return;
    try {
      setBreakingOut(true);
      const now = new Date();
      const gps = await captureGps();
      if (!gps) toast('Location unavailable — break recorded without GPS', { icon: '⚠️' });
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: employee.id,
          action: 'breakout',
          date: localDateKey(now),
          localTime: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`, utcTimestamp: now.toISOString(),
          gps,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success('Break ended' + (gps?.label ? ` (${gps.label})` : gps ? ` (${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})` : ''));
      await fetchAttendance();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Break-out failed');
    } finally {
      setBreakingOut(false);
    }
  };

  /* ── Today's status for self view ── */
  // Use the browser's LOCAL calendar day (never toISOString of the current
  // instant — that rolls back a day in timezones ahead of UTC before 05:30)
  const todayStr = localDateKey(new Date());
  const todayRecord = attendance.find(a => recordDateKey(a.date) === todayStr);
  const isCheckedIn = !!todayRecord?.checkIn;
  const isCheckedOut = !!todayRecord?.checkOut;
  // Task 57: break state derived from today's record
  const isOnBreak = !!todayRecord?.breakIn && !todayRecord?.breakOut;
  const hasBreakEnded = !!todayRecord?.breakIn && !!todayRecord?.breakOut;
  const earlyLogoutEnabled = earlyLogout || !!todayRecord?.earlyLogout;
  const breakMinutesToday = todayRecord?.breakMinutes ?? 0;

  /* ── Leaves covering the selected admin date (per-employee) ── */
  const adminLeaveEmpIds = useMemo(() => {
    const set = new Set<string>();
    approvedLeaves.forEach(l => {
      if (recordDateKey(l.startDate) <= selectedDate && selectedDate <= recordDateKey(l.endDate)) set.add(l.employeeId);
    });
    return set;
  }, [approvedLeaves, selectedDate]);

  /* ── Admin roster: EVERY active employee with a derived status for the date ── */
  const adminRoster = useMemo(() => {
    const byEmp = new Map<string, AttendanceRecord>();
    adminAttendance.forEach(a => {
      const id = a.employee?.id || a.employeeId;
      if (id && !byEmp.has(id)) byEmp.set(id, a);
    });
    const selectedDow = new Date(`${selectedDate}T00:00:00`).getDay();
    return adminEmployees.map(emp => {
      const record = byEmp.get(emp.id);
      if (record?.checkIn && (!record.status || record.status === 'absent')) {
        return { key: emp.id, emp, record, status: record.status === 'late' ? 'late' : 'present' };
      }
      const derived = record ? null : deriveDayStatus({
        dateKey: selectedDate,
        dayOfWeek: selectedDow,
        holidaySet: holidayMap,
        onLeave: adminLeaveEmpIds.has(emp.id),
        weekendDow,
        todayKey: todayStr,
      });
      const status = record?.status || derived || '';
      return { key: emp.id, emp, record, status };
    });
  }, [adminAttendance, adminEmployees, holidayMap, adminLeaveEmpIds, weekendDow, selectedDate, todayStr]);

  /* ── Filter roster by search ── */
  const filteredRoster = useMemo(() => {
    if (!searchQuery) return adminRoster;
    const q = searchQuery.toLowerCase();
    return adminRoster.filter(r =>
      r.emp.firstName?.toLowerCase().includes(q) ||
      r.emp.lastName?.toLowerCase().includes(q) ||
      r.emp.employeeId?.toLowerCase().includes(q)
    );
  }, [adminRoster, searchQuery]);

  /* ── Admin stats — computed over the FULL roster (records + derived rows) ── */
  const stats = useMemo(() => {
    let present = 0, late = 0, absent = 0, onLeave = 0, halfDay = 0;
    adminRoster.forEach(r => {
      const s = r.status;
      if (!s) return;
      if (s === 'present') present++;
      else if (s === 'late') late++;
      else if (s === 'absent') absent++;
      else if (s === 'on_leave') onLeave++;
      else if (s === 'half_day') halfDay++;
    });
    return {
      totalPresent: present + late + halfDay, // Present (incl. late & half-day)
      totalAbsent: absent,
      lateArrivals: late,
      onLeave,
    };
  }, [adminRoster]);

  /* ── Task 84: Recent-days strip data (last 7 calendar days) + selected-day
   * context so an empty table on a weekend/holiday explains itself instead
   * of looking like missing data. ── */
  const recentDays = useMemo(() => {
    const out: Array<{ key: string; label: string; count: number; kind: 'weekend' | 'holiday' | 'punches' | 'empty'; holiday?: string }> = [];
    const base = new Date();
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      const key = localDateKey(d);
      const dow = d.getDay();
      const count = monthPunchCounts.get(key) || 0;
      const holiday = holidayMap.get(key);
      out.push({
        key,
        label: `${weekday[dow]} ${d.getDate()}`,
        count,
        kind: weekendDow.includes(dow) ? 'weekend' : holiday ? 'holiday' : count > 0 ? 'punches' : 'empty',
        holiday,
      });
    }
    return out;
  }, [monthPunchCounts, weekendDow, holidayMap]);

  const selectedIsWeekend = weekendDow.includes(new Date(`${selectedDate}T00:00:00`).getDay());
  const selectedHolidayName = holidayMap.get(selectedDate);
  const selectedHasRecords = adminAttendance.length > 0;

  /* ── Calendar data for selected month ──
   * Keys are built from LOCAL date parts (timezone-safe); days without a
   * punch are derived as weekend / holiday / on-leave / absent. */
  const getCalendarDays = () => {
    const { month, year } = selectedMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const days: Array<{ date: number; status: string | null; isCurrentMonth: boolean; title?: string }> = [];
    for (let i = 0; i < startPad; i++) {
      days.push({ date: 0, status: null, isCurrentMonth: false });
    }
    for (let d = 1; d <= totalDays; d++) {
      // LOCAL date key — never toISOString() of a local-midnight Date (shifts
      // the day back in UTC and mis-mapped records to the NEXT calendar day)
      const dateKey = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dayOfWeek = new Date(year, month, d).getDay();
      const record = attendance.find(a => recordDateKey(a.date) === dateKey);
      const derived = record ? null : deriveDayStatus({
        dateKey,
        dayOfWeek,
        holidaySet: holidayMap,
        onLeave: employee ? isOnLeave(approvedLeaves, employee.id, dateKey) : false,
        weekendDow,
        todayKey: todayStr,
      });
      const status = record?.status || derived || null;
      const holidayName = holidayMap.get(dateKey);
      const title = holidayName ? `${holidayName}` : status ? getStatusConfig(status).label : undefined;
      days.push({ date: d, status, isCurrentMonth: true, title });
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

  /* ── Self view stats ── */
  const presentCount = attendance.filter(a => ['present', 'late'].includes(a.status)).length;
  const lateCount = attendance.filter(a => a.status === 'late').length;
  const totalHours = attendance.reduce((sum, a) => sum + (calculateProductionHours(a.checkIn, a.checkOut) || 0), 0);
  const totalOvertime = attendance.reduce((sum, a) => sum + calculateCompanyOvertime(a.checkOut), 0);

  /* ── Self table rows: real records + derived month days (weekend/holiday/leave/absent) ── */
  const selfTableRows = useMemo(() => {
    const rows: Array<{ key: string; dateKey: string; record?: AttendanceRecord; status: string | null }> = [];
    const seen = new Set<string>();
    attendance.forEach(a => {
      const k = recordDateKey(a.date);
      rows.push({ key: a.id, dateKey: k, record: a, status: a.status });
      seen.add(k);
    });
    const { month, year } = selectedMonth;
    const now = new Date();
    const isCurrentMonthView = month === now.getMonth() && year === now.getFullYear();
    const totalDays = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= totalDays; d++) {
      const dateKey = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      if (seen.has(dateKey)) continue;
      const dayOfWeek = new Date(year, month, d).getDay();
      const status = deriveDayStatus({
        dateKey,
        dayOfWeek,
        holidaySet: holidayMap,
        onLeave: employee ? isOnLeave(approvedLeaves, employee.id, dateKey) : false,
        weekendDow,
        todayKey: todayStr,
      });
      // Past working days only get an "absent" derivation for the CURRENT month
      // (older months would otherwise mark every pre-joining day absent)
      if (!status || (status === 'absent' && !isCurrentMonthView)) continue;
      rows.push({ key: `derived-${dateKey}`, dateKey, status });
    }
    rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return rows;
  }, [attendance, selectedMonth, holidayMap, approvedLeaves, employee, weekendDow, todayStr]);

  /* ── Format selected date for display ── */
  const formattedSelectedDate = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, [selectedDate]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiClock className="w-6 h-6 text-cyan-500" />
            Attendance
          </h1>
          <p className="text-thb-text-secondary mt-1">Track & manage employee attendance</p>
        </div>
        <div className="flex items-center gap-2">
          {isClientDemoMode() && (
          <button onClick={handleSeedData} disabled={seeding} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors">
            {seeding ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FiDatabase className="w-3.5 h-3.5" />}
            {seeding ? 'Seeding...' : 'Seed Sample Data'}
          </button>
          )}
          {/* Check In / Out buttons — always available */}
          <button
            onClick={handleCheckIn}
            disabled={checkingIn || isCheckedIn}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
              isCheckedIn
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default'
                : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/25 hover:shadow-md'
            }`}
          >
            <FiLogIn className="w-4 h-4" />
            {checkingIn ? 'Checking...' : isCheckedIn ? '✓ Checked In' : 'Check In'}
          </button>
          <button
            onClick={handleCheckOut}
            disabled={checkingOut || !isCheckedIn || isCheckedOut}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
              !isCheckedIn || isCheckedOut
                ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'bg-rose-500 text-white hover:bg-rose-600 shadow-sm shadow-rose-500/25 hover:shadow-md'
            }`}
          >
            <FiLogOut className="w-4 h-4" />
            {checkingOut ? 'Checking...' : isCheckedOut ? '✓ Checked Out' : 'Check Out'}
          </button>
          <label className="inline-flex items-center gap-2 px-3 py-2 text-xs text-slate-700 border border-slate-200 rounded-lg bg-white">
            <input type="checkbox" checked={earlyLogoutEnabled} disabled={!isCheckedIn || isCheckedOut || earlyLogoutEnabled} onChange={e => handleEarlyLogout(e.target.checked)} />
            Half-Day Leave / Early Checkout
          </label>
          {/* Task 57: Break In / Break Out buttons (self-service lunch/tea break) */}
          {isCheckedIn && !isCheckedOut && (
            <>
              <button
                onClick={handleBreakIn}
                disabled={breakingIn || isOnBreak || hasBreakEnded}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                  isOnBreak || hasBreakEnded
                    ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/25 hover:shadow-md'
                }`}
                title="Start a lunch or tea break — break-in time + GPS will be recorded"
              >
                <FiCoffee className="w-4 h-4" />
                {breakingIn ? 'Starting...' : isOnBreak ? 'On Break' : hasBreakEnded ? '✓ Break Done' : 'Break In'}
              </button>
              <button
                onClick={handleBreakOut}
                disabled={breakingOut || !isOnBreak}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
                  !isOnBreak
                    ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-teal-500 text-white hover:bg-teal-600 shadow-sm shadow-teal-500/25 hover:shadow-md'
                }`}
                title="End the current break — break-out time + GPS will be recorded"
              >
                <FiCoffee className="w-4 h-4" />
                {breakingOut ? 'Ending...' : 'Break Out'}
              </button>
            </>
          )}
          {/* GPS status indicator while capturing */}
          {gpsStatus && (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500">
              <FiMapPin className="w-3.5 h-3.5 animate-pulse text-emerald-500" />
              {gpsStatus}
            </span>
          )}
          {/* Show today's break duration if break ended */}
          {hasBreakEnded && breakMinutesToday > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-amber-700 bg-amber-50 rounded-lg border border-amber-200">
              <FiCoffee className="w-3.5 h-3.5" />
              Break: {Math.floor(breakMinutesToday / 60)}h {breakMinutesToday % 60}m
            </span>
          )}
        </div>
      </div>

      {/* ── Tab Switcher (Admin / Self View) ── */}
      {isAdmin && (
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('admin')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'admin'
                ? 'bg-white text-thb-text-primary shadow-sm'
                : 'text-thb-text-secondary hover:text-thb-text-primary'
            }`}
          >
            <FiUsers className="w-4 h-4" />
            Admin View
          </button>
          <button
            onClick={() => setActiveTab('self')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'self'
                ? 'bg-white text-thb-text-primary shadow-sm'
                : 'text-thb-text-secondary hover:text-thb-text-primary'
            }`}
          >
            <FiUserCheck className="w-4 h-4" />
            My Attendance
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* ── ADMIN VIEW ── */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'admin' && isAdmin && (
        <>
          {/* ── Stats Row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<FiCheckCircle className="w-5 h-5" />}
              label="Total Present"
              value={stats.totalPresent}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
              accent="border-l-emerald-500"
            />
            <StatCard
              icon={<FiXCircle className="w-5 h-5" />}
              label="Total Absent"
              value={stats.totalAbsent}
              iconBg="bg-red-100"
              iconColor="text-red-600"
              accent="border-l-red-500"
            />
            <StatCard
              icon={<FiAlertCircle className="w-5 h-5" />}
              label="Late Arrivals"
              value={stats.lateArrivals}
              iconBg="bg-amber-100"
              iconColor="text-amber-600"
              accent="border-l-amber-500"
            />
            <StatCard
              icon={<FiCalendar className="w-5 h-5" />}
              label="On Leave"
              value={stats.onLeave}
              iconBg="bg-green-100"
              iconColor="text-green-600"
              accent="border-l-green-500"
            />
          </div>

          {/* ── Filter Bar ── */}
          <div className="thb-card p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {/* Date picker */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <FiCalendar className="w-4 h-4 text-thb-text-secondary" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="px-3 py-2 text-sm border border-thb-border rounded-lg bg-white text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                />
              </div>

              {/* Department filter */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <FiFilter className="w-4 h-4 text-thb-text-secondary" />
                <select
                  value={selectedDepartment}
                  onChange={e => setSelectedDepartment(e.target.value)}
                  className="px-3 py-2 text-sm border border-thb-border rounded-lg bg-white text-thb-text-primary focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all min-w-[150px]"
                >
                  <option value="all">All Departments</option>
                  <option value="engineering">Engineering</option>
                  <option value="hr">Human Resources</option>
                  <option value="finance">Finance</option>
                  <option value="sales">Sales</option>
                  <option value="marketing">Marketing</option>
                  <option value="operations">Operations</option>
                </select>
              </div>

              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <FiSearch className="w-4 h-4 text-thb-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(sanitizeSearch(e.target.value))}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-thb-border rounded-lg bg-white text-thb-text-primary placeholder:text-thb-text-muted focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                />
              </div>

              {/* Date display */}
              <div className="text-sm text-thb-text-secondary flex-shrink-0 hidden md:block">
                {formattedSelectedDate}
              </div>

              {/* Refresh */}
              <button
                onClick={() => fetchAdminAttendance()}
                className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 hover:text-thb-text-primary transition-colors flex-shrink-0"
                title="Refresh"
              >
                <FiRefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Task 84: selected-day context banner — explains an empty table ── */}
          {!adminLoading && !selectedHasRecords && (
            <div className="thb-card p-4 border-l-4 border-l-sky-400 bg-sky-50/40">
              <div className="flex items-start gap-3">
                <FiInfo className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">
                    {selectedHolidayName
                      ? `Holiday — ${selectedHolidayName}`
                      : selectedIsWeekend
                        ? 'Weekend — no punches expected'
                        : 'No punches recorded yet'}
                  </p>
                  <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">
                    {selectedHolidayName
                      ? `${formattedSelectedDate} is a holiday, so regular in/out punches are not expected. Pick a working day below to view its punches.`
                      : selectedIsWeekend
                        ? `${formattedSelectedDate} is a non-working day, so there are no in/out punches to show. Use the recent-days chips below to jump to a day with punches.`
                        : `No attendance records exist for ${formattedSelectedDate} yet — punches appear here as employees check in. Use the recent-days chips below to open a day that already has punches.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Task 84: Recent days strip — jump straight to a day with punches ── */}
          <div className="thb-card p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-thb-text-secondary uppercase tracking-wider mr-1">Recent days</span>
              {recentDays.map(d => {
                const isSelected = selectedDate === d.key;
                const chipCls = isSelected
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : d.kind === 'punches'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : d.kind === 'weekend' || d.kind === 'holiday'
                      ? 'bg-slate-100 text-slate-500 border-thb-border hover:bg-slate-200/60'
                      : 'bg-white text-slate-500 border-thb-border hover:bg-slate-50';
                const sub = d.kind === 'weekend' ? 'Weekend' : d.kind === 'holiday' ? (d.holiday || 'Holiday') : d.count > 0 ? `${d.count} punch${d.count !== 1 ? 'es' : ''}` : 'No punches';
                return (
                  <button
                    key={d.key}
                    onClick={() => setSelectedDate(d.key)}
                    title={`${d.label} — ${sub}`}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${chipCls}`}
                  >
                    <span className="font-semibold">{d.label}</span>
                    <span className={`ml-1.5 text-[10px] ${isSelected ? 'text-white/85' : 'opacity-75'}`}>· {sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Attendance Table ── */}
          <div className="thb-card overflow-hidden">
            <div className="px-6 py-4 border-b border-thb-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-thb-text-primary">Attendance Records</h2>
                <p className="text-xs text-thb-text-muted mt-0.5">{filteredRoster.length} employee{filteredRoster.length !== 1 ? 's' : ''} · Present {stats.totalPresent} · Absent {stats.totalAbsent} · Leave {stats.onLeave} · Late {stats.lateArrivals}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-thb-border bg-slate-50/60">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Employee</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Check In</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Check Out</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Break</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Late By</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Prod. Hours</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adminLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-thb-border/50 animate-pulse">
                        <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-slate-200" /><div className="space-y-1.5"><div className="h-3 w-24 bg-slate-200 rounded" /><div className="h-2 w-16 bg-slate-100 rounded" /></div></div></td>
                        <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-14 bg-slate-200 rounded" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-14 bg-slate-200 rounded" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-10 bg-slate-200 rounded" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-10 bg-slate-200 rounded" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-10 bg-slate-200 rounded" /></td>
                        <td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td>
                      </tr>
                    ))
                  ) : filteredRoster.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center">
                        <FiUsers className="w-12 h-12 text-thb-text-muted mx-auto mb-3" />
                        <p className="text-thb-text-secondary font-medium">No employees match the current filters</p>
                        <p className="text-sm text-thb-text-muted mt-1">No active employees found for {formattedSelectedDate}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredRoster.map(r => {
                      const a = r.record;
                      const statusValue = r.status || 'not_marked';
                      const statusConfig = getStatusConfig(statusValue);
                      const lateBy = a ? calculateLateBy(a.checkIn, shiftStartMinutes) : '0m';
                      const productionHours = a ? calculateProductionHours(a.checkIn, a.checkOut) : null;
                      const breakDur = a?.checkIn && a?.checkOut ? '1h' : '—';
                      return (
                        <tr key={r.key} className="border-b border-thb-border/50 hover:bg-slate-50/80 transition-colors group">
                          {/* Employee */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {getInitials(r.emp.firstName, r.emp.lastName)}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-thb-text-primary">
                                  {r.emp.firstName || 'Unknown'} {r.emp.lastName || ''}
                                </p>
                                <p className="text-xs text-thb-text-muted">
                                  {r.emp.employeeId || '—'}
                                </p>
                              </div>
                            </div>
                          </td>
                          {/* Status */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor}`} />
                              {statusConfig.label}
                            </span>
                          </td>
                          {/* Check In */}
                          <td className="px-4 py-3 text-sm text-thb-text-secondary">{a ? formatTime(a.checkIn) : '—'}</td>
                          {/* Check Out */}
                          <td className="px-4 py-3 text-sm text-thb-text-secondary">{a ? formatTime(a.checkOut) : '—'}</td>
                          {/* Break */}
                          <td className="px-4 py-3 text-sm text-thb-text-secondary">{breakDur}</td>
                          {/* Late By */}
                          <td className="px-4 py-3">
                            <span className={`text-sm font-medium ${lateBy !== '0m' ? 'text-red-600' : 'text-thb-text-muted'}`}>
                              {lateBy !== '0m' ? lateBy : '—'}
                            </span>
                          </td>
                          {/* Production Hours */}
                          <td className="px-4 py-3">
                            <span className={`text-sm font-medium ${
                              productionHours != null
                                ? productionHours >= 8
                                  ? 'text-emerald-600'
                                  : 'text-amber-600'
                                : 'text-thb-text-muted'
                            }`}>
                              {productionHours != null ? formatHoursHm(productionHours) : '—'}
                            </span>
                          </td>
                          {/* Actions */}
                          <td className="px-4 py-3">
                            {a && (
                              <button
                                onClick={() => setDetailRecord(a)}
                                className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <FiEye className="w-3.5 h-3.5" />
                                View
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Quick Links (admin only) ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <QuickLink href="/attendance/requests" icon={<FiCheckSquare className="w-4 h-4" />} label="Requests" sub="Reg/WFH/Permission/Pass" color="teal" />
            <QuickLink href="/attendance/biometric" icon={<FiCpu className="w-4 h-4" />} label="Biometric" sub="Devices & enrollments" color="violet" />
            <QuickLink href="/attendance/geofence" icon={<FiMap className="w-4 h-4" />} label="Geofencing" sub="Office perimeters" color="emerald" />
            <QuickLink href="/attendance/regularize" icon={<FiAlertTriangle className="w-4 h-4" />} label="Regularize" sub="Missed punch fix" color="amber" />
            <QuickLink href="/attendance/overtime" icon={<FiClock className="w-4 h-4" />} label="Overtime" sub="OT + comp-off" color="rose" />
            <QuickLink href="/attendance/settings?tab=workflows" icon={<FiShield className="w-4 h-4" />} label="Workflows & Rules" sub="Approval builder" color="violet" />
          </div>

          {/* ── Module Tips & Workflow ── */}
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
        </>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* ── SELF VIEW ── */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'self' && (
        <>
          {/* ── Today's Quick Stats ── */}
          {todayRecord?.checkIn && !todayRecord.checkOut && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800" role="alert">
              <FiAlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">Missing check-out</p>
                <p className="text-sm">You have not checked out for today. Please complete your check-out.</p>
                <Link href="/attendance" className="mt-1 inline-block text-xs font-semibold text-amber-700 underline">Go to check-out</Link>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<FiLogIn className="w-5 h-5" />}
              label="Check In"
              value={todayRecord?.checkIn ? formatTime(todayRecord.checkIn) : '—'}
              iconBg="bg-green-100"
              iconColor="text-green-600"
              accent="border-l-green-500"
              isText
            />
            <StatCard
              icon={<FiLogOut className="w-5 h-5" />}
              label="Check Out"
              value={todayRecord?.checkOut ? formatTime(todayRecord.checkOut) : '—'}
              iconBg="bg-red-100"
              iconColor="text-red-600"
              accent="border-l-red-500"
              isText
            />
            <StatCard
              icon={<FiClock className="w-5 h-5" />}
              label="Work Hours"
              value={todayRecord && calculateProductionHours(todayRecord.checkIn, todayRecord.checkOut) != null ? formatHoursHm(calculateProductionHours(todayRecord.checkIn, todayRecord.checkOut) as number) : '—'}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
              accent="border-l-emerald-500"
              isText
            />
            <StatCard
              icon={<FiCheckCircle className="w-5 h-5" />}
              label="Status"
              value={todayRecord ? getStatusConfig(todayRecord.status).label : 'Not Checked In'}
              iconBg="bg-amber-100"
              iconColor="text-amber-600"
              accent="border-l-amber-500"
              isText
            />
          </div>

          {/* ── View Toggle ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                onClick={() => setViewMode('calendar')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'calendar'
                    ? 'bg-white text-thb-text-primary shadow-sm'
                    : 'text-thb-text-secondary hover:text-thb-text-primary'
                }`}
              >
                <FiCalendar className="w-3.5 h-3.5" />
                Calendar
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-thb-text-primary shadow-sm'
                    : 'text-thb-text-secondary hover:text-thb-text-primary'
                }`}
              >
                <FiGrid className="w-3.5 h-3.5" />
                Table
              </button>
            </div>

            {/* Monthly Summary Mini */}
            <div className="hidden sm:flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {presentCount} Present
              </span>
              <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {lateCount} Present (Late)
              </span>
              <span className="flex items-center gap-1.5 text-green-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {formatHoursHm(totalHours)} Total
              </span>
              <span className="flex items-center gap-1.5 text-teal-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                {formatHoursHm(totalOvertime)} OT
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Calendar View ── */}
            {viewMode === 'calendar' && (
              <div className="lg:col-span-2 thb-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-thb-text-primary">Monthly Calendar</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium text-thb-text-primary min-w-[140px] text-center">
                      {monthNames[selectedMonth.month]} {selectedMonth.year}
                    </span>
                    <button onClick={() => navigateMonth(1)} className="p-1.5 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-xs font-semibold text-thb-text-muted py-2">{day}</div>
                  ))}
                  {calendarDays.map((day, i) => {
                    if (!day.isCurrentMonth) return <div key={`pad-${i}`} className="aspect-square" />;
                    const today = new Date();
                    const isToday = day.date === today.getDate() && selectedMonth.month === today.getMonth() && selectedMonth.year === today.getFullYear();
                    return (
                      <div
                        key={day.date}
                        className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative transition-transform hover:scale-105 ${
                          day.status ? getDayStatusColor(day.status) : 'bg-slate-50 text-thb-text-muted'
                        } ${isToday ? 'ring-2 ring-cyan-500 ring-offset-1' : ''}`}
                      >
                        <span className="font-medium">{day.date}</span>
                        {day.status && (
                          <span className="text-[8px] leading-none mt-0.5 opacity-80" title={day.title}>
                            {day.status === 'present' ? 'P' : day.status === 'late' ? 'PL' : day.status === 'absent' ? 'A' : day.status === 'holiday' ? 'H' : day.status === 'weekend' ? 'W' : day.status === 'half_day' ? 'HD' : day.status === 'on_leave' ? 'LV' : ''}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-thb-border">
                  {[
                    { label: 'Present', color: 'bg-emerald-500' },
                    { label: 'Present (Late)', color: 'bg-orange-400' },
                    { label: 'Absent', color: 'bg-red-500' },
                    { label: 'Half Day', color: 'bg-amber-400' },
                    { label: 'On Leave', color: 'bg-green-400' },
                    { label: 'Holiday', color: 'bg-sky-400' },
                    { label: 'Weekend', color: 'bg-slate-200' },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <span className={`w-3 h-3 rounded ${l.color}`} />
                      <span className="text-xs text-thb-text-muted">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Table View ── */}
            {viewMode === 'table' && (
              <div className="lg:col-span-2 thb-card overflow-hidden">
                <div className="px-6 py-4 border-b border-thb-border">
                  <h2 className="text-sm font-semibold text-thb-text-primary">Attendance Records</h2>
                </div>
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-thb-border bg-slate-50/90 backdrop-blur-sm">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Check In</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Check Out</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Hours</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">OT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b border-thb-border/50 animate-pulse">
                            <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                            <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                          </tr>
                        ))
                      ) : selfTableRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center">
                            <FiClock className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
                            <p className="text-thb-text-secondary font-medium">No attendance records</p>
                            <p className="text-sm text-thb-text-muted mt-1">Check in to start tracking your attendance</p>
                          </td>
                        </tr>
                      ) : (
                        selfTableRows.map(row => {
                          const a = row.record;
                          const statusConfig = getStatusConfig(row.status || 'not_marked');
                          return (
                            <tr key={row.key} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-thb-text-primary">{a ? formatDate(a.date) : new Date(`${row.dateKey}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor}`} />
                                  {statusConfig.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-thb-text-secondary">{a ? formatTime(a.checkIn) : '—'}</td>
                              <td className="px-4 py-3 text-sm text-thb-text-secondary">{a ? formatTime(a.checkOut) : '—'}</td>
                              <td className="px-4 py-3 text-sm text-thb-text-secondary">{a && calculateProductionHours(a.checkIn, a.checkOut) != null ? formatHoursHm(calculateProductionHours(a.checkIn, a.checkOut) as number) : '—'}</td>
                              <td className="px-4 py-3 text-sm text-thb-text-secondary">{a && calculateCompanyOvertime(a.checkOut) > 0 ? formatHoursHm(calculateCompanyOvertime(a.checkOut)) : '—'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Sidebar ── */}
            <div className="space-y-4">
              <div className="thb-card p-6">
                <h3 className="text-sm font-semibold text-thb-text-primary mb-4">Monthly Summary</h3>
                <div className="space-y-4">
                  <SummaryRow label="Present Days" value={`${presentCount}`} color="text-emerald-600" barBg="bg-emerald-100" barFill="bg-emerald-500" pct={Math.min(100, (presentCount / 22) * 100)} />
                  <SummaryRow label="Late Arrivals" value={`${lateCount}`} color="text-amber-600" barBg="bg-amber-100" barFill="bg-amber-500" pct={Math.min(100, (lateCount / 22) * 100)} />
                  <SummaryRow label="Total Hours" value={formatHoursHm(totalHours)} color="text-green-600" barBg="bg-green-100" barFill="bg-green-500" pct={Math.min(100, (totalHours / 176) * 100)} />
                  <SummaryRow label="Overtime" value={formatHoursHm(totalOvertime)} color="text-teal-600" barBg="bg-teal-100" barFill="bg-teal-500" pct={Math.min(100, totalOvertime > 0 ? (totalOvertime / 20) * 100 : 0)} />
                </div>
              </div>

              <div className="thb-card p-6">
                <h3 className="text-sm font-semibold text-thb-text-primary mb-3">Quick Info</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FiCalendar className="w-4 h-4 text-thb-text-muted" />
                    <span className="text-thb-text-secondary">Current Month: </span>
                    <span className="font-medium text-thb-text-primary">{monthNames[selectedMonth.month]}</span>
                  </div>
                  {employee && (
                    <div className="flex items-center gap-2 text-sm">
                      <FiMapPin className="w-4 h-4 text-thb-text-muted" />
                      <span className="text-thb-text-secondary">Employee: </span>
                      <span className="font-medium text-thb-text-primary">{employee.firstName} {employee.lastName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Links for self view */}
              <div className="thb-card p-4">
                <h3 className="text-xs font-semibold text-thb-text-secondary uppercase tracking-wider mb-3">Quick Links</h3>
                <div className="space-y-1.5">
                  <QuickLinkSmall href="/attendance/regularize" icon={<FiAlertTriangle className="w-3.5 h-3.5" />} label="Regularize" color="text-amber-600" />
                  <QuickLinkSmall href="/attendance/permission" icon={<FiClock className="w-3.5 h-3.5" />} label="Permission" color="text-green-600" />
                  <QuickLinkSmall href="/attendance/gatepass" icon={<FiList className="w-3.5 h-3.5" />} label="Gatepass" color="text-cyan-600" />
                  <QuickLinkSmall href="/attendance/comp-off" icon={<FiCalendar className="w-3.5 h-3.5" />} label="Comp-Off" color="text-emerald-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Module Tips & Workflow (self view) */}
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
        </>
      )}

      {/* ── Detail Modal ── */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetailRecord(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-thb-text-primary">Attendance Detail</h3>
              <button onClick={() => setDetailRecord(null)} className="p-1 rounded-lg hover:bg-slate-100 transition-colors text-thb-text-secondary">
                <FiChevronLeft className="w-5 h-5" />
              </button>
            </div>

            {/* Employee Info */}
            {detailRecord.employee && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-white text-sm font-bold">
                  {getInitials(detailRecord.employee.firstName, detailRecord.employee.lastName)}
                </div>
                <div>
                  <p className="font-medium text-thb-text-primary">{detailRecord.employee.firstName} {detailRecord.employee.lastName}</p>
                  <p className="text-xs text-thb-text-muted">{detailRecord.employee.employeeId}</p>
                </div>
              </div>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3">
              <DetailField label="Date" value={formatDate(detailRecord.date)} />
              <DetailField label="Status" value={getStatusConfig(detailRecord.status).label} />
              <DetailField label="Check In" value={formatTime(detailRecord.checkIn)} />
              <DetailField label="Check Out" value={formatTime(detailRecord.checkOut)} />
              <DetailField label="Work Hours" value={formatHoursHm(detailRecord.workHours)} />
              <DetailField label="Overtime" value={detailRecord.overtime != null && detailRecord.overtime > 0 ? formatHoursHm(detailRecord.overtime) : '—'} />
              <DetailField label="Late By" value={calculateLateBy(detailRecord.checkIn, shiftStartMinutes) !== '0m' ? `Late by ${calculateLateBy(detailRecord.checkIn, shiftStartMinutes)}` : 'On time'} />
              <DetailField label="Break" value={calculateBreakDuration(detailRecord.checkIn, detailRecord.checkOut, detailRecord.workHours)} />
            </div>

            {detailRecord.location && (
              <div className="flex items-center gap-2 text-sm text-thb-text-secondary p-2 rounded-lg bg-slate-50">
                <FiMapPin className="w-4 h-4 text-thb-text-muted flex-shrink-0" />
                <span>{detailRecord.location}</span>
              </div>
            )}

            {detailRecord.notes && (
              <div className="p-2 rounded-lg bg-slate-50">
                <p className="text-xs text-thb-text-muted mb-1">Notes</p>
                <p className="text-sm text-thb-text-secondary">{detailRecord.notes}</p>
              </div>
            )}

            <button
              onClick={() => setDetailRecord(null)}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-thb-text-secondary font-medium text-sm hover:bg-slate-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ icon, label, value, iconBg, iconColor, accent, isText }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  iconBg: string;
  iconColor: string;
  accent: string;
  isText?: boolean;
}) {
  return (
    <div className={`thb-card-hover p-4 border-l-4 ${accent} flex items-center gap-4`}>
      <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center ${iconColor} flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-thb-text-secondary truncate">{label}</p>
        <p className={`text-xl font-bold text-thb-text-primary ${isText ? 'text-lg' : ''}`}>
          {isText ? value : value}
        </p>
      </div>
    </div>
  );
}

/* ── Summary Row with Progress Bar ── */
function SummaryRow({ label, value, color, barBg, barFill, pct }: {
  label: string;
  value: string;
  color: string;
  barBg: string;
  barFill: string;
  pct: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-thb-text-secondary">{label}</span>
        <span className={`text-sm font-semibold ${color}`}>{value}</span>
      </div>
      <div className={`h-1.5 rounded-full ${barBg} overflow-hidden`}>
        <div
          className={`h-full rounded-full ${barFill} transition-all duration-500`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

/* ── Detail Field ── */
function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-slate-50">
      <p className="text-xs text-thb-text-muted mb-0.5">{label}</p>
      <p className="text-sm font-medium text-thb-text-primary">{value}</p>
    </div>
  );
}

/* ── Quick Link Card ── */
function QuickLink({ href, icon, label, sub, color }: {
  href: string; icon: React.ReactNode; label: string; sub: string; color: string;
}) {
  const colorMap: Record<string, string> = {
    teal: 'border-teal-200 hover:border-teal-300 hover:bg-teal-50 text-teal-600',
    violet: 'border-teal-200 hover:border-teal-300 hover:bg-teal-50 text-teal-600',
    emerald: 'border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 text-emerald-600',
    amber: 'border-amber-200 hover:border-amber-300 hover:bg-amber-50 text-amber-600',
    blue: 'border-green-200 hover:border-green-300 hover:bg-green-50 text-green-600',
    cyan: 'border-cyan-200 hover:border-cyan-300 hover:bg-cyan-50 text-cyan-600',
    rose: 'border-rose-200 hover:border-rose-300 hover:bg-rose-50 text-rose-600',
  };
  return (
    <Link
      href={href}
      className={`flex flex-col gap-1 p-3 rounded-xl border ${colorMap[color] || colorMap.violet} transition-colors group`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-thb-text-primary">{label}</span>
      </div>
      <span className="text-[10px] text-thb-text-muted">{sub}</span>
    </Link>
  );
}

/* ── Small Quick Link ── */
function QuickLinkSmall({ href, icon, label, color }: {
  href: string; icon: React.ReactNode; label: string; color: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors group"
    >
      <span className={color}>{icon}</span>
      <span className="text-sm text-thb-text-secondary group-hover:text-thb-text-primary transition-colors">{label}</span>
    </Link>
  );
}

