'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts';
import { sanitizeSearch } from '@/lib/validators';
import { useAuthStore } from '@/store/authStore';
import { getDataScope } from '@/lib/roleAccess';
import { getToken } from '@/lib/token-storage';
import { formatHoursHm } from '@/lib/format-hours';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { isClientDemoMode } from '@/lib/site-mode';
/* Task 156-a — shared SmartHR widgets: same gradient banner + white stat
   cards / panels as the Employee module dashboard restyle (Task 155). */
import { PageBreadcrumbs, DateChip, Panel, StatCard } from '@/components/dashboard/smarthr-widgets';

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
function calculateLateBy(checkIn: string | null | undefined, shiftStartMinutes = 600): string {
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

/* Task 133: per-employee shift start (HH:mm → minutes) when the employee has
 * a roster-assigned shift; falls back to the tenant-wide cutoff otherwise. */
function parseHmMinutes(hm: string | undefined): number | null {
  if (!hm || !/^\d{1,2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function calculateBreakDuration(checkIn: string | null | undefined, checkOut: string | null | undefined, workHours: number | null | undefined, breakIn?: string | null, breakOut?: string | null): string {
  if (!checkIn || !checkOut || workHours == null) return '—';
  const breakMins = calculateEffectiveBreakMinutes(checkIn, checkOut, breakIn, breakOut);
  if (breakMins < 60) return `${breakMins}m`;
  const h = Math.floor(breakMins / 60);
  const m = breakMins % 60;
  return `${h}h ${m}m`;
}

function formatBreakMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function calculateEffectiveBreakMinutes(checkIn: string, checkOut: string, breakIn?: string | null, breakOut?: string | null): number {
  const parts = (value: string) => {
    const formatted = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(value));
    return Number(formatted.find(p => p.type === 'hour')?.value || 0) * 60 + Number(formatted.find(p => p.type === 'minute')?.value || 0);
  };
  const checkInMinutes = parts(checkIn);
  const checkOutMinutes = parts(checkOut);
  const overlapsOfficialWindow = checkInMinutes < 870 && checkOutMinutes > 810;
  if (!overlapsOfficialWindow) return 0;
  if (!breakIn || !breakOut) return 60;
  const actual = Math.max(0, Math.round((new Date(breakOut).getTime() - new Date(breakIn).getTime()) / 60000));
  return Math.max(60, actual, Math.max(0, 870 - parts(breakIn)));
}

function calculateLunchOverlapMinutes(checkIn: string, checkOut: string): number {
  const parts = (value: string) => {
    const formatted = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(value));
    return Number(formatted.find(p => p.type === 'hour')?.value || 0) * 60 + Number(formatted.find(p => p.type === 'minute')?.value || 0);
  };
  const start = parts(checkIn);
  const end = parts(checkOut);
  return Math.max(0, Math.min(end, 14 * 60 + 30) - Math.max(start, 13 * 60 + 30));
}

// Dashboard production hours use the fixed one-hour lunch rule.
function calculateProductionHours(checkIn: string | null | undefined, checkOut: string | null | undefined, breakIn?: string | null, breakOut?: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const spanMinutes = Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000));
  const effectiveBreak = calculateEffectiveBreakMinutes(checkIn, checkOut, breakIn, breakOut);
  return Math.round((Math.max(0, spanMinutes - effectiveBreak) / 60) * 100) / 100;
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
  // Task 158: third tab 'adminCalendar' — the month calendar moved out of the
  // Admin View into its own "Admin Calendar View" tab (sits between Admin View
  // and My Attendance). Both admin tabs share the same roster fetch.
  const [activeTab, setActiveTab] = useState<'admin' | 'adminCalendar' | 'self'>(isAdmin ? 'admin' : 'self');

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
  const [shiftStartMinutes, setShiftStartMinutes] = useState(600); // 10:00 company late cutoff
  // Task 133: per-employee shift overrides (roster-assigned shifts) —
  // employeeId → { start, end } HH:mm; "Late by" uses the employee's own start.
  const [shiftWindows, setShiftWindows] = useState<Record<string, { start: string; end: string }>>({});
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
  const lastBiometricSyncAtRef = useRef(0);
  const fetchAdminAttendance = useCallback(async () => {
    try {
      setAdminLoading(true);
      // Task 85: pull fresh Team Office (ETimeOffice) biometric punches before
      // rendering. The per-minute Vercel cron was demoted to a daily backstop
      // so Hobby-plan projects can deploy the shared vercel.json (per-minute
      // schedules are Pro-only and failed demo deployment validation); this
      // keeps the dashboard near-real-time whenever an admin opens it. The
      // route is admin-only and silently no-ops where sync is not configured
      // (403 on demo). Throttled to one call per minute.
      if (Date.now() - lastBiometricSyncAtRef.current > 60_000) {
        lastBiometricSyncAtRef.current = Date.now();
        try {
          await fetch('/api/attendance/biometric/sync', {
            method: 'POST',
            headers: getAuthHeaders(),
            signal: AbortSignal.timeout(6000),
          });
        } catch { /* non-fatal — roster still loads; daily cron is the backstop */ }
      }
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
      // NOTE: the roster MUST include management employees — their punches
      // (real or auto-present) are the majority of admin-view rows. Do NOT
      // add excludeManagement here; hiding management belongs to the Employee
      // List page only, not the attendance dashboard.
      const [attRes, empRes] = await Promise.all([
        fetch(`/api/attendance?${params.toString()}${sq ? `&${sq}` : ''}&includePhotos=0`, { headers: getAuthHeaders(), cache: 'no-store' }),
        fetch(`/api/employees?limit=500&status=active&includePhotos=0${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() }),
      ]);
      if (attRes.ok) {
        const data = await attRes.json();
        setAdminAttendance(data.attendance || []);
        setShiftWindows(data.shiftWindows || {});
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
        // Company rule: Late By is always measured after 10:00 AM IST.
        // Do not let legacy 09:00/09:30 policy values override this cutoff.
        setShiftStartMinutes(10 * 60);
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
      const res = await fetch(`/api/attendance?employeeId=${employee.id}&limit=100&includePhotos=0`, { headers: getAuthHeaders(), cache: 'no-store' });
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
  useEffect(() => { if (isAdmin && (activeTab === 'admin' || activeTab === 'adminCalendar')) queueMicrotask(() => fetchAdminAttendance()); }, [fetchAdminAttendance, activeTab, isAdmin]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (isAdmin && (activeTab === 'admin' || activeTab === 'adminCalendar')) void fetchAdminAttendance();
      else if (employee) void fetchAttendance();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [activeTab, employee, fetchAdminAttendance, fetchAttendance, isAdmin]);
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
    if (!isAdmin || (activeTab !== 'admin' && activeTab !== 'adminCalendar')) return;
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
          method: 'web', // Task 108: browser punch — gated by Employee.webCheckInEnabled
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
          method: 'web', // Task 108: browser punch — gated by Employee.webCheckInEnabled
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
          method: 'web', // Task 108: browser punch — gated by Employee.webCheckInEnabled
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
          method: 'web', // Task 108: browser punch — gated by Employee.webCheckInEnabled
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

  /* ── Task 108: Remote check-in permissions for the logged-in employee ──
   * Mobile/web punches are only available with a WFH pre-approval granted
   * employee-wise by admin/management (Attendance → Remote Check-In).
   * The punch API enforces this server-side; here we only hide the options
   * when the flags are known to be off so employees get a clear message
   * instead of an error toast. Unknown (null) = show buttons and let the
   * server decide. */
  const [remotePermissions, setRemotePermissions] = useState<{ wfhPreApproved: boolean; mobileCheckInEnabled: boolean; webCheckInEnabled: boolean } | null>(null);
  const webCheckInLocked = remotePermissions != null && !remotePermissions.webCheckInEnabled;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/attendance/my-summary', { headers: getAuthHeaders(), cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled && d?.remotePermissions) setRemotePermissions(d.remotePermissions);
      } catch { /* non-fatal — server still enforces */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Today's status for self view ── */
  // Use the browser's LOCAL calendar day (never toISOString of the current
  // instant — that rolls back a day in timezones ahead of UTC before 05:30)
  const todayStr = localDateKey(new Date());
  // SmartHR banner date chip
  const todayChip = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

  /* ── Task 157: admin month calendar — every day of the selected month with
   * its punch count (from monthPunchCounts) + weekend/holiday tinting. ── */
  const adminCalendarDays = useMemo(() => {
    const { month, year } = selectedMonth;
    const startPad = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: Array<{ key: string; date: number; count: number; isWeekend: boolean; holiday?: string; isCurrentMonth: boolean }> = [];
    for (let i = 0; i < startPad; i++) days.push({ key: `pad-${i}`, date: 0, count: 0, isWeekend: false, isCurrentMonth: false });
    for (let d = 1; d <= totalDays; d++) {
      const key = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dow = new Date(year, month, d).getDay();
      days.push({ key, date: d, count: monthPunchCounts.get(key) || 0, isWeekend: weekendDow.includes(dow), holiday: holidayMap.get(key), isCurrentMonth: true });
    }
    return days;
  }, [selectedMonth, monthPunchCounts, weekendDow, holidayMap]);

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
  const presentCount = attendance.reduce((sum, a) => sum + (a.status === 'half_day' ? 0.5 : (['present', 'late'].includes(a.status) ? 1 : 0)), 0);
  // Late arrivals are counted from the punch time, not final status. A
  // fourth-late row may become half_day but must still count as late.
  const lateCount = attendance.filter(a => {
    if (!a.checkIn) return false;
    const t = new Date(a.checkIn);
    return t.getHours() * 60 + t.getMinutes() > 10 * 60;
  }).length;
  const totalHours = attendance.reduce((sum, a) => sum + (calculateProductionHours(a.checkIn, a.checkOut, a.breakIn, a.breakOut) || 0), 0);
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
      // Keep every calendar date in the table. Future/unclassified dates use
      // the existing "Not Marked" presentation instead of disappearing.
      // This also guarantees complete months (28/29/30/31 rows as applicable).
      rows.push({ key: `derived-${dateKey}`, dateKey, status });
    }
    rows.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return rows;
  }, [attendance, selectedMonth, holidayMap, approvedLeaves, employee, weekendDow, todayStr]);

  /* ── Task 157: live clock for the SmartHR greeting hero (attendance-employee template) ── */
  const [nowTick, setNowTick] = useState<Date | null>(null);
  useEffect(() => {
    // Deferred first tick (not synchronous) to avoid cascading renders
    const t0 = window.setTimeout(() => setNowTick(new Date()), 0);
    const t = window.setInterval(() => setNowTick(new Date()), 15000);
    return () => { window.clearTimeout(t0); window.clearInterval(t); };
  }, []);
  const greeting = (() => {
    const h = (nowTick || new Date()).getHours();
    return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  })();
  const heroTime = nowTick
    ? `${nowTick.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}, ${nowTick.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : '';
  const heroFirstName = employee?.firstName || user?.email?.split('@')[0] || 'there';

  /* ── Task 157: template hour stats — Today / Week / Month / Overtime ── */
  const todayProduction = todayRecord
    ? (todayRecord.workHours ?? calculateProductionHours(todayRecord.checkIn, todayRecord.checkOut, todayRecord.breakIn, todayRecord.breakOut))
    : null;
  const weekHours = useMemo(() => {
    const now = new Date();
    // Week starts Monday
    const dow = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    let sum = 0;
    attendance.forEach(a => {
      const k = recordDateKey(a.date);
      const d = new Date(`${k}T00:00:00`);
      if (d >= monday) sum += calculateProductionHours(a.checkIn, a.checkOut, a.breakIn, a.breakOut) || 0;
    });
    return sum;
  }, [attendance]);

  /* ── Task 157: today timeline numbers (template duration tiles) ── */
  const todaySpanHours = (() => {
    if (!todayRecord?.checkIn) return null;
    const inT = new Date(todayRecord.checkIn).getTime();
    const outT = todayRecord.checkOut ? new Date(todayRecord.checkOut).getTime() : (nowTick ? nowTick.getTime() : inT);
    return Math.max(0, (outT - inT) / 3600000);
  })();
  const todayBreakStr = breakMinutesToday > 0
    ? `${Math.floor(breakMinutesToday / 60)}h ${String(breakMinutesToday % 60).padStart(2, '0')}m`
    : hasBreakEnded ? '0h 00m' : null;
  const todayOt = todayRecord ? calculateCompanyOvertime(todayRecord.checkOut) : 0;

  /* ── Format selected date for display ── */
  const formattedSelectedDate = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, [selectedDate]);

  /* ── Task 158: shared Attendance Records panel — rendered by BOTH the Admin
   * View tab and the new Admin Calendar View tab, so the full table markup
   * lives in exactly one place. ── */
  const adminRecordsPanel = (
    <Panel
      title="Attendance Records"
            icon={<FiUsers className="w-4 h-4" />}
            accent="text-[#3A57C4]"
            action={<span className="text-xs text-slate-500">{filteredRoster.length} employee{filteredRoster.length !== 1 ? 's' : ''} · Present {stats.totalPresent} · Absent {stats.totalAbsent} · Leave {stats.onLeave} · Late {stats.lateArrivals}</span>}
          >
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
                      // Task 133: employees with an assigned shift measure "Late by"
                      // from THEIR shift start (e.g. 11:00 for MARQ004).
                      const rowShiftStart = parseHmMinutes(shiftWindows[a?.employeeId || r.emp?.id]?.start) ?? shiftStartMinutes;
                      const lateBy = a ? calculateLateBy(a.checkIn, rowShiftStart) : '0m';
                      const productionHours = a ? (a.workHours ?? calculateProductionHours(a.checkIn, a.checkOut, a.breakIn, a.breakOut)) : null;
                      const breakDur = a?.breakMinutes != null ? formatBreakMinutes(a.breakMinutes) : (a?.checkIn && a?.checkOut ? calculateBreakDuration(a.checkIn, a.checkOut, a.workHours, a.breakIn, a.breakOut) : '—');
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
                              {productionHours != null && productionHours < 8 && <div className="mt-1 text-[11px] text-amber-700 font-medium">Below 8 hours — regularization required</div>}
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
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <button
                                  onClick={() => setDetailRecord(a)}
                                  className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700 font-medium"
                                >
                                  <FiEye className="w-3.5 h-3.5" /> View
                                </button>
                                {!isAdmin && <Link href={`/attendance/regularize?date=${encodeURIComponent(recordDateKey(a.date))}`} className="text-xs text-amber-600 hover:text-amber-700 font-medium">Regularize</Link>}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
  );

  return (
    <div className="space-y-6">
      {/* ── Header — SmartHR gradient breadcrumb banner (Task 156-a) ── */}
      <PageBreadcrumbs
        title="Attendance Dashboard"
        trail={['Attendance', 'Dashboard']}
        right={
          <>
            <DateChip value={todayChip} />
            {isClientDemoMode() && (
              <button onClick={handleSeedData} disabled={seeding} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/15 border border-white/25 text-white hover:bg-white/25 disabled:opacity-50 transition-colors">
                {seeding ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FiDatabase className="w-3.5 h-3.5" />}
                {seeding ? 'Seeding...' : 'Seed Sample Data'}
              </button>
            )}
            {/* Task 157: punch / break controls relocated to the SmartHR greeting
                hero card in the self view (attendance-employee template) — the
                banner now stays a clean title band for both views. */}
          </>
        }
      />

      {/* ── Tab Switcher (Admin View / Admin Calendar View / My Attendance) ── */}
      {isAdmin && (
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('admin')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'admin'
                ? 'bg-white text-[#3A57C4] shadow-sm'
                : 'text-thb-text-secondary hover:text-thb-text-primary'
            }`}
          >
            <FiUsers className="w-4 h-4" />
            Admin View
          </button>
          {/* Task 158: Admin Calendar View — month calendar promoted from the
              Admin View body into its own tab (between Admin View and My
              Attendance) so the day roster stays front-and-center there. */}
          <button
            onClick={() => setActiveTab('adminCalendar')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'adminCalendar'
                ? 'bg-white text-[#3A57C4] shadow-sm'
                : 'text-thb-text-secondary hover:text-thb-text-primary'
            }`}
          >
            <FiCalendar className="w-4 h-4" />
            Admin Calendar View
          </button>
          <button
            onClick={() => setActiveTab('self')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'self'
                ? 'bg-white text-[#3A57C4] shadow-sm'
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
          {/* ── Task 157 — SmartHR attendance-admin template hero:
              "Attendance Details Today" donut + breakdown rows. Same numbers
              the old 4 StatCards showed, now graphically. ── */}
          <AdminTodayHero
            rosterCount={adminEmployees.length}
            present={stats.totalPresent - stats.lateArrivals - (adminRoster.filter(r => r.status === 'half_day').length)}
            late={stats.lateArrivals}
            absent={stats.totalAbsent}
            onLeave={stats.onLeave}
            halfDay={adminRoster.filter(r => r.status === 'half_day').length}
            loading={adminLoading}
            dateLabel={formattedSelectedDate}
          />

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
                  ? 'bg-[#3A57C4] text-white border-[#3A57C4]'
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


          {/* ── Attendance Table — SmartHR Panel (Task 156-a) — shared block
              (Task 158), also rendered by the Admin Calendar View tab ── */}
          {adminRecordsPanel}

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
      {/* ── ADMIN CALENDAR VIEW (Task 158) ── */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'adminCalendar' && isAdmin && (
        <>
          {/* ── Month calendar (moved out of the Admin View): every day of the
              selected month with its punch count, weekend/holiday tinting;
              click a day to load its punches into the table below. ── */}
          <Panel
            title="Attendance Calendar"
            icon={<FiCalendar className="w-4 h-4" />}
            accent="text-[#009EFB]"
            action={
              <div className="flex items-center gap-2">
                <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                  <FiChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium text-slate-800 min-w-[140px] text-center">
                  {monthNames[selectedMonth.month]} {selectedMonth.year}
                </span>
                <button onClick={() => navigateMonth(1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                  <FiChevronRight className="w-4 h-4" />
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-xs font-semibold text-thb-text-muted py-2">{day}</div>
              ))}
              {adminCalendarDays.map((day, i) => {
                if (!day.isCurrentMonth) return <div key={`pad-${i}`} className="aspect-square" />;
                const isSelected = selectedDate === day.key;
                const isToday = day.key === todayStr;
                return (
                  <button
                    key={day.key}
                    onClick={() => setSelectedDate(day.key)}
                    title={day.holiday ? day.holiday : day.count > 0 ? `${day.count} punches` : undefined}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative transition-all hover:scale-105 ${
                      day.holiday ? 'bg-sky-50 text-sky-600' : day.isWeekend ? 'bg-slate-100 text-slate-400' : day.count > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-thb-text-muted'
                    } ${isSelected ? 'ring-2 ring-[#3A57C4] ring-offset-1' : isToday ? 'ring-1 ring-[#009EFB]/50' : ''}`}
                  >
                    <span className={`font-medium ${isSelected ? 'text-[#3A57C4]' : ''}`}>{day.date}</span>
                    {day.count > 0 && <span className="text-[8px] leading-none mt-0.5 font-bold text-emerald-600">{day.count}</span>}
                    {day.holiday && day.count === 0 && <span className="text-[8px] leading-none mt-0.5">H</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-thb-border">
              {[
                { label: 'Punches recorded', color: 'bg-emerald-100' },
                { label: 'Weekend', color: 'bg-slate-200' },
                { label: 'Holiday', color: 'bg-sky-100' },
                { label: 'Selected day', color: 'bg-white ring-1 ring-[#3A57C4]' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded ${l.color}`} />
                  <span className="text-xs text-thb-text-muted">{l.label}</span>
                </div>
              ))}
              <span className="text-[11px] text-thb-text-muted ml-auto">Click a day to view its punches below</span>
            </div>
          </Panel>

          {/* ── Punches for the selected day (shared records table) ── */}
          {adminRecordsPanel}
        </>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* ── SELF VIEW ── */}
      {/* ══════════════════════════════════════════════════ */}
      {activeTab === 'self' && (
        <>
          {/* ── Task 157 — SmartHR attendance-employee template greeting hero:
              gradient card with live clock + punch / break controls (relocated
              from the banner; identical handlers & gating). ── */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#3A57C4] via-[#4A66D6] to-[#6C4FD6] p-6 sm:p-7 text-white shadow-lg shadow-[#3A57C4]/25">
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute bottom-[-4rem] left-1/3 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">{greeting}, {heroFirstName}</h2>
                <p className="text-sm text-white/85 mt-1.5 flex items-center gap-2">
                  <FiClock className="w-4 h-4" />
                  {heroTime || new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 ring-1 ring-white/25">
                    <span className={`w-1.5 h-1.5 rounded-full ${isCheckedIn && !isCheckedOut ? 'bg-emerald-300 animate-pulse' : isCheckedOut ? 'bg-rose-300' : 'bg-white/50'}`} />
                    {todayRecord ? getStatusConfig(todayRecord.status).label : 'Not Checked In'}
                  </span>
                  {isCheckedIn && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 ring-1 ring-white/25">
                      <FiLogIn className="w-3 h-3" /> In {formatTime(todayRecord?.checkIn)}
                    </span>
                  )}
                  {isCheckedOut && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/15 ring-1 ring-white/25">
                      <FiLogOut className="w-3 h-3" /> Out {formatTime(todayRecord?.checkOut)}
                    </span>
                  )}
                </div>
              </div>
              {/* Punch controls — Task 108 gating preserved: web check-in needs
                  a WFH pre-approval; office employees use the biometric device. */}
              <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
                {webCheckInLocked ? (
                  <div className="inline-flex items-center gap-2 px-3 py-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg max-w-xs">
                    <FiInfo className="w-4 h-4 shrink-0" />
                    <span>Web check-in is not enabled for your account — please use the office biometric device.</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCheckIn}
                        disabled={checkingIn || isCheckedIn}
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                          isCheckedIn
                            ? 'bg-white/15 text-white/70 ring-1 ring-white/25 cursor-default'
                            : 'bg-white text-[#3A57C4] hover:bg-emerald-50 shadow-md hover:shadow-lg'
                        }`}
                      >
                        <FiLogIn className="w-4 h-4" />
                        {checkingIn ? 'Checking...' : isCheckedIn ? '✓ Checked In' : 'Punch In'}
                      </button>
                      <button
                        onClick={handleCheckOut}
                        disabled={checkingOut || !isCheckedIn || isCheckedOut}
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                          !isCheckedIn || isCheckedOut
                            ? 'bg-white/10 text-white/40 ring-1 ring-white/15 cursor-not-allowed'
                            : 'bg-white text-rose-600 hover:bg-rose-50 shadow-md hover:shadow-lg'
                        }`}
                      >
                        <FiLogOut className="w-4 h-4" />
                        {checkingOut ? 'Checking...' : isCheckedOut ? '✓ Checked Out' : 'Punch Out'}
                      </button>
                    </div>
                    {isCheckedIn && (
                      <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
                        <button
                          onClick={handleBreakIn}
                          disabled={breakingIn || isOnBreak || hasBreakEnded}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isOnBreak || hasBreakEnded
                              ? 'bg-white/10 text-white/40 ring-1 ring-white/15 cursor-not-allowed'
                              : 'bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25'
                          }`}
                          title="Start a lunch or tea break — break-in time + GPS will be recorded"
                        >
                          <FiCoffee className="w-3.5 h-3.5" />
                          {breakingIn ? 'Starting...' : isOnBreak ? 'On Break' : hasBreakEnded ? '✓ Break Done' : 'Break In'}
                        </button>
                        <button
                          onClick={handleBreakOut}
                          disabled={breakingOut || !isOnBreak}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            !isOnBreak
                              ? 'bg-white/10 text-white/40 ring-1 ring-white/15 cursor-not-allowed'
                              : 'bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25'
                          }`}
                          title="End the current break — break-out time + GPS will be recorded"
                        >
                          <FiCoffee className="w-3.5 h-3.5" />
                          {breakingOut ? 'Ending...' : 'Break Out'}
                        </button>
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-white/90 bg-white/10 ring-1 ring-white/20 rounded-lg cursor-pointer">
                          <input type="checkbox" checked={earlyLogoutEnabled} disabled={!isCheckedIn || isCheckedOut || earlyLogoutEnabled} onChange={e => handleEarlyLogout(e.target.checked)} className="accent-white" />
                          Half-Day / Early Checkout
                        </label>
                      </div>
                    )}
                    {gpsStatus && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-white/75">
                        <FiMapPin className="w-3.5 h-3.5 animate-pulse" /> {gpsStatus}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Missing check-out ── */}
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
          {/* ── Today's Quick Stats — SmartHR attendance-employee template cards
              (Total Hours Today/Week/Month + Overtime; Task 157) ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Hours Today"
              value={todayProduction != null ? formatHoursHm(todayProduction) : '—'}
              sub="Production hours today"
              icon={<FiClock className="w-5 h-5" />}
              bg="bg-[#3A57C4]/10 text-[#3A57C4]"
              ring="ring-[#3A57C4]/20"
            />
            <StatCard
              label="Total Hours Week"
              value={formatHoursHm(weekHours)}
              sub="This week (Mon–Sun)"
              icon={<FiCalendar className="w-5 h-5" />}
              bg="bg-[#6C4FD6]/10 text-[#6C4FD6]"
              ring="ring-[#6C4FD6]/20"
            />
            <StatCard
              label="Total Hours Month"
              value={formatHoursHm(totalHours)}
              sub={monthNames[selectedMonth.month]}
              icon={<FiGrid className="w-5 h-5" />}
              bg="bg-[#10B981]/10 text-[#10B981]"
              ring="ring-[#10B981]/20"
            />
            <StatCard
              label="Overtime this Month"
              value={formatHoursHm(totalOvertime)}
              sub="Company OT after shift hours"
              icon={<FiCheckCircle className="w-5 h-5" />}
              bg="bg-[#FF9B44]/10 text-[#FF9B44]"
              ring="ring-[#FF9B44]/20"
            />
          </div>

          {/* ── Task 157 — Today's Timeline (template duration tiles) ── */}
          <Panel
            title="Today's Timeline"
            icon={<FiClock className="w-4 h-4" />}
            accent="text-[#009EFB]"
            action={
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {hasBreakEnded && breakMinutesToday > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                    <FiCoffee className="w-3.5 h-3.5" /> Break {Math.floor(breakMinutesToday / 60)}h {breakMinutesToday % 60}m
                  </span>
                )}
                {gpsStatus && <span className="inline-flex items-center gap-1"><FiMapPin className="w-3.5 h-3.5 animate-pulse text-emerald-500" /> {gpsStatus}</span>}
              </div>
            }
          >
            {todayRecord?.checkIn ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Span', value: todaySpanHours != null ? formatHoursHm(todaySpanHours) : '—', dot: 'bg-[#3A57C4]' },
                    { label: 'Production', value: todayProduction != null ? formatHoursHm(todayProduction) : '—', dot: 'bg-[#10B981]' },
                    { label: 'Break', value: todayBreakStr ?? '—', dot: 'bg-[#FF9B44]' },
                    { label: 'Overtime', value: todayOt > 0 ? formatHoursHm(todayOt) : '0h 00m', dot: 'bg-[#6C4FD6]' },
                  ].map(tile => (
                    <div key={tile.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${tile.dot}`} />
                        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{tile.label}</p>
                      </div>
                      <p className="text-xl font-bold text-slate-900">{tile.value}</p>
                    </div>
                  ))}
                </div>
                {/* Timeline bar — in-office span with the break window carved out */}
                <div className="mt-5">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                    <span>{formatTime(todayRecord.checkIn)}</span>
                    <span>Now / Punch out</span>
                    <span>{todayRecord.checkOut ? formatTime(todayRecord.checkOut) : '—'}</span>
                  </div>
                  <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden">
                    {(() => {
                      const inMin = new Date(todayRecord.checkIn).getHours() * 60 + new Date(todayRecord.checkIn).getMinutes();
                      const outMin = todayRecord.checkOut
                        ? new Date(todayRecord.checkOut).getHours() * 60 + new Date(todayRecord.checkOut).getMinutes()
                        : (nowTick ? nowTick.getHours() * 60 + nowTick.getMinutes() : inMin);
                      const windowStart = Math.max(0, Math.min(inMin, 1439));
                      const windowEnd = Math.max(windowStart + 1, Math.min(outMin, 1439));
                      const span = windowEnd - windowStart;
                      let breakLeftPct: number | null = null;
                      let breakWidthPct = 0;
                      if (todayRecord.breakIn) {
                        const bIn = new Date(todayRecord.breakIn);
                        const bOut = todayRecord.breakOut ? new Date(todayRecord.breakOut) : (nowTick || bIn);
                        const bInMin = Math.max(windowStart, bIn.getHours() * 60 + bIn.getMinutes());
                        const bOutMin = Math.min(windowEnd, bOut.getHours() * 60 + bOut.getMinutes());
                        if (bOutMin > bInMin) {
                          breakLeftPct = ((bInMin - windowStart) / span) * 100;
                          breakWidthPct = Math.min(100 - breakLeftPct, ((bOutMin - bInMin) / span) * 100);
                        }
                      }
                      return (
                        <>
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#3A57C4] to-[#10B981]"
                            style={{ width: '100%' }}
                          />
                          {breakLeftPct != null && breakWidthPct > 0 && (
                            <div
                              className="absolute inset-y-0 bg-amber-400"
                              style={{ left: `${breakLeftPct}%`, width: `${breakWidthPct}%` }}
                              title="Break"
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-[#3A57C4] to-[#10B981]" /> In office</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Break</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 py-4">
                <FiClock className="w-8 h-8 text-slate-200" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">No punches yet today</p>
                  <p className="text-xs text-thb-text-muted">Your timeline appears here after you punch in{webCheckInLocked ? ' — use the office biometric device' : ''}.</p>
                </div>
              </div>
            )}
          </Panel>

          {/* ── View Toggle ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                onClick={() => setViewMode('calendar')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'calendar'
                    ? 'bg-white text-[#3A57C4] shadow-sm'
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
                    ? 'bg-white text-[#3A57C4] shadow-sm'
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

          {/* Task 159 fix: sidebar (Monthly Summary / Quick Info / Quick Links)
              collapsed below the main column on many laptops (viewport < lg
              1024px — e.g. 125–150% zoom). Two-column layout now starts at md
              (768px) and the main column is overflow-hardened with min-w-0. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* ── Calendar View — SmartHR Panel (Task 156-a) ── */}
            {viewMode === 'calendar' && (
              <div className="md:col-span-2 min-w-0">
              <Panel
                title="Monthly Calendar"
                icon={<FiCalendar className="w-4 h-4" />}
                accent="text-[#009EFB]"
                action={
                  <div className="flex items-center gap-2">
                    <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium text-slate-800 min-w-[140px] text-center">
                      {monthNames[selectedMonth.month]} {selectedMonth.year}
                    </span>
                    <button onClick={() => navigateMonth(1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                      <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                }
              >

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
              </Panel>
              </div>
            )}

            {/* ── Table View — SmartHR Panel (Task 156-a) ── */}
            {viewMode === 'table' && (
              <div className="md:col-span-2 min-w-0">
              <Panel title="Attendance Records" icon={<FiList className="w-4 h-4" />} accent="text-[#3A57C4]">
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-thb-border bg-slate-50/90 backdrop-blur-sm">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Check In</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Check Out</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Break</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Late By</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Overtime</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">Prod. Hours</th>
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
                            <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-200 rounded" /></td>
                          </tr>
                        ))
                      ) : selfTableRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center">
                            <FiClock className="w-10 h-10 text-thb-text-muted mx-auto mb-3" />
                            <p className="text-thb-text-secondary font-medium">No attendance records</p>
                            <p className="text-sm text-thb-text-muted mt-1">Check in to start tracking your attendance</p>
                          </td>
                        </tr>
                      ) : (
                        selfTableRows.map(row => {
                          const a = row.record;
                          const statusConfig = getStatusConfig(row.status || 'not_marked');
                          const productionHours = a ? (a.workHours ?? calculateProductionHours(a.checkIn, a.checkOut, a.breakIn, a.breakOut)) : null;
                          const lowHours = productionHours != null && productionHours < 8;
                          return (
                            <tr key={row.key} className="border-b border-thb-border/50 hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-thb-text-primary">{a ? formatDate(a.date) : new Date(`${row.dateKey}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor}`} />
                                  {statusConfig.label}
                                </span>
                                {lowHours && <div className="mt-1 text-[11px] text-amber-700 font-medium">Below 8 hours — <Link href={`/attendance/regularize?date=${encodeURIComponent(row.dateKey)}`} className="underline">Apply for regularization</Link></div>}
                              </td>
                              <td className="px-4 py-3 text-sm text-thb-text-secondary">{a ? formatTime(a.checkIn) : '—'}</td>
                              <td className="px-4 py-3 text-sm text-thb-text-secondary">{a ? formatTime(a.checkOut) : '—'}</td>
                              <td className="px-4 py-3 text-sm text-thb-text-secondary">{a?.breakMinutes != null ? formatBreakMinutes(a.breakMinutes) : (a?.checkIn && a?.checkOut ? calculateBreakDuration(a.checkIn, a.checkOut, a.workHours, a.breakIn, a.breakOut) : '—')}</td>
                              <td className="px-4 py-3">
                                {(() => {
                                  const rowShiftStart = parseHmMinutes(shiftWindows[a?.employeeId || employee?.id || '']?.start) ?? shiftStartMinutes;
                                  const lateBy = a ? calculateLateBy(a.checkIn, rowShiftStart) : '0m';
                                  return (
                                    <span className={`text-sm font-medium ${lateBy !== '0m' ? 'text-red-600' : 'text-thb-text-muted'}`}>
                                      {lateBy !== '0m' ? lateBy : '—'}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-3 text-sm text-thb-text-secondary">{a && calculateCompanyOvertime(a.checkOut) > 0 ? formatHoursHm(calculateCompanyOvertime(a.checkOut)) : '—'}</td>
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
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
              </div>
            )}

            {/* ── Sidebar ── */}
            <div className="space-y-4">
              <Panel title="Monthly Summary" icon={<FiClock className="w-4 h-4" />} accent="text-[#10B981]">
                <div className="space-y-4">
                  <SummaryRow label="Present Days" value={`${presentCount}`} color="text-emerald-600" barBg="bg-emerald-100" barFill="bg-emerald-500" pct={Math.min(100, (presentCount / 22) * 100)} />
                  <SummaryRow label="Late Arrivals" value={`${lateCount}`} color="text-amber-600" barBg="bg-amber-100" barFill="bg-amber-500" pct={Math.min(100, (lateCount / 22) * 100)} />
                  <SummaryRow label="Total Hours" value={formatHoursHm(totalHours)} color="text-green-600" barBg="bg-green-100" barFill="bg-green-500" pct={Math.min(100, (totalHours / 176) * 100)} />
                  <SummaryRow label="Overtime" value={formatHoursHm(totalOvertime)} color="text-teal-600" barBg="bg-teal-100" barFill="bg-teal-500" pct={Math.min(100, totalOvertime > 0 ? (totalOvertime / 20) * 100 : 0)} />
                </div>
              </Panel>

              <Panel title="Quick Info" icon={<FiInfo className="w-4 h-4" />} accent="text-[#FF9B44]">
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
              </Panel>

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
              <DetailField label="Late By" value={(() => { const dEmpId = detailRecord.employee?.id || (detailRecord as { employeeId?: string }).employeeId || ''; const dStart = parseHmMinutes(shiftWindows[dEmpId]?.start) ?? shiftStartMinutes; const lb = calculateLateBy(detailRecord.checkIn, dStart); return lb !== '0m' ? `Late by ${lb}` : 'On time'; })()} />
              <DetailField label="Break" value={detailRecord.breakMinutes != null ? formatBreakMinutes(detailRecord.breakMinutes) : calculateBreakDuration(detailRecord.checkIn, detailRecord.checkOut, detailRecord.workHours, detailRecord.breakIn, detailRecord.breakOut)} />
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

/* Task 156-a — the local StatCard was replaced by the shared SmartHR StatCard
   from '@/components/dashboard/smarthr-widgets' (same as /employees/dashboard). */

/* ── Task 157 — SmartHR attendance-admin template hero: "Attendance Details
   Today" with a donut chart + per-status breakdown rows (mirrors the
   template's Present / Late Login / Uninformed / Permission / Absent list). ── */
function AdminTodayHero({ rosterCount, present, late, absent, onLeave, halfDay, loading, dateLabel }: {
  rosterCount: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  halfDay: number;
  loading: boolean;
  dateLabel: string;
}) {
  const rows = [
    { label: 'Present', value: present, color: '#10B981', text: 'text-emerald-600', bar: 'bg-emerald-500' },
    { label: 'Late Login', value: late, color: '#FF9B44', text: 'text-orange-500', bar: 'bg-orange-400' },
    { label: 'Absent', value: absent, color: '#F43F5E', text: 'text-rose-600', bar: 'bg-rose-500' },
    { label: 'On Leave', value: onLeave, color: '#3A57C4', text: 'text-[#3A57C4]', bar: 'bg-[#3A57C4]' },
    { label: 'Half Day', value: halfDay, color: '#6C4FD6', text: 'text-violet-600', bar: 'bg-violet-500' },
  ];
  const chartData = rows.filter(r => r.value > 0).map(r => ({ name: r.label, value: r.value, color: r.color }));
  const denom = Math.max(1, rosterCount || rows.reduce((s, r) => s + r.value, 0));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
        {/* Left — donut + headline */}
        <div className="flex items-center gap-5">
          <div className="relative w-[190px] h-[190px] shrink-0">
            {loading ? (
              <div className="w-full h-full rounded-full bg-slate-100 animate-pulse" />
            ) : chartData.length === 0 ? (
              <div className="w-full h-full rounded-full border-[18px] border-slate-100 flex items-center justify-center">
                <span className="text-[10px] text-slate-400 text-center">No data<br />for this day</span>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="94%" paddingAngle={2} strokeWidth={0}>
                      {chartData.map(d => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <ReTooltip
                      formatter={(value) => [`${Number(value)} employee${Number(value) !== 1 ? 's' : ''}`, 'Employees']}
                      contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-extrabold text-slate-900">{present + late + halfDay}</span>
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Present today</span>
                </div>
              </>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">Attendance Details Today</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Data from the {rosterCount} active employee{rosterCount !== 1 ? 's' : ''} for {dateLabel}
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-100">
              <FiUsers className="w-3.5 h-3.5 text-[#3A57C4]" />
              <span className="text-[11px] font-semibold text-slate-600">{rosterCount - (present + late + absent + onLeave + halfDay)} not marked</span>
            </div>
          </div>
        </div>

        {/* Right — breakdown rows (template list) */}
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.label} className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-sm text-slate-600 w-24 shrink-0">{r.label}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${r.bar} transition-all duration-500`}
                  style={{ width: `${Math.min(100, (r.value / denom) * 100)}%` }}
                />
              </div>
              <span className={`text-sm font-bold w-8 text-right ${r.text}`}>{String(r.value).padStart(2, '0')}</span>
            </div>
          ))}
        </div>
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

