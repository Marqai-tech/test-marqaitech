'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FiCalendar, FiClock, FiCheck, FiX, FiAlertCircle,
  FiChevronLeft, FiChevronRight, FiSearch, FiUser,
  FiInfo, FiGift, FiAnchor, FiLoader,
} from 'react-icons/fi';
import ApproverChainPreview from '@/components/ApproverChainPreview';

/* ───────────────────────────────────────────────────────────────────────────
   Types
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Form state. The parent (leave page) owns the canonical object with the
 * base required fields (leaveTypeId, startDate, endDate, reason, halfDay,
 * halfDaySlot). The panel may attach additional UI-only fields
 * (useFloatingDay, floatingDayDate, floatingHolidays, birthdayLeave,
 * notifyEmployeeIds) — the index signature lets us read/write them without
 * changing the parent's form type.
 */
interface FormState {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  halfDay: boolean;
  halfDaySlot: 'first_half' | 'second_half';
  // Panel-extended (UI only — not currently persisted by the leave POST API)
  useFloatingDay?: boolean;
  floatingDayDate?: string;
  floatingHolidays?: string[];
  birthdayLeave?: boolean;
  notifyEmployeeIds?: string[];
  [key: string]: unknown;
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  defaultDays: number;
  isPaid: boolean;
}

interface LeaveBalance {
  id: string;
  total: number;
  used: number;
  remaining: number;
  year: number;
  leaveType: { id: string; name: string; code: string };
}

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
}

interface TeamLeave {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  halfDay?: boolean | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId?: string;
    avatar?: string | null;
  } | null;
  leaveType?: { id: string; name: string; code: string } | null;
}

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeId?: string;
  email?: string;
  avatar?: string | null;
}

interface Props {
  form: FormState;
  /** Parent's setForm accepts either a new value or an updater fn. */
  setForm: (updater: (prev: FormState) => FormState) => void;
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  holidays: Holiday[];
  employeeId: string;
  employeeName: string;
  employeeDateOfBirth: string | null;
  employeeDepartmentId: string | null;
  /** Pre-built scope query string (e.g. `tenantId=xxx&companyId=yyy`). */
  scopeQuery: string;
  onCancel: () => void;
  /** Parent's handleApply — performs all validation + toasts. */
  onSubmit: () => void;
  submitting: boolean;
  todayStr: string;
}

/* ───────────────────────────────────────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────────────────────────────────────── */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Local-day key (yyyy-mm-dd) from a Date — does NOT use toISOString to avoid
 *  timezone shifts. */
function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * CRITICAL: parse server ISO timestamps using String slice (NOT
 * `new Date(...).toISOString().split('T')[0]`) so we read the date as the
 * server wrote it — `new Date().toISOString()` shifts the date by the local
 * timezone offset and can move a leave day to the previous calendar day.
 */
function dayKey(iso: string | null | undefined) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

/** Format a leave record's date range for the self-overlap warning.
 *  e.g. "2026-11-05" → "Nov 5, 2026"
 *       "2026-11-05 to 2026-11-08" → "Nov 5 – Nov 8, 2026" */
function formatSelfRange(l: { startDate?: string | null; endDate?: string | null; halfDay?: boolean }): string {
  const s = dayKey(l.startDate);
  const e = dayKey(l.endDate);
  if (!s) return '';
  const sDate = new Date(`${s}T00:00:00`);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!e || s === e) {
    return `${fmt(sDate)}${l.halfDay ? ' (half day)' : ''}`;
  }
  const eDate = new Date(`${e}T00:00:00`);
  return `${fmt(sDate)} – ${fmt(eDate)}${l.halfDay ? ' (half day)' : ''}`;
}

function getDaysBetween(start: string, end: string, holidayDates: Set<string> = new Set()) {
  if (!start || !end) return 0;
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  let count = 0;
  const cursor = new Date(s.getTime());
  let guard = 0;
  while (cursor <= e && guard < 4000) {
    guard++;
    const dow = cursor.getDay();
    const dateStr = isoDay(cursor);
    if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function getAvatarGradient(name: string) {
  const colors = [
    'from-green-500 to-cyan-500',
    'from-teal-500 to-teal-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500',
    'from-emerald-500 to-green-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* ───────────────────────────────────────────────────────────────────────────
   Component
   ─────────────────────────────────────────────────────────────────────────── */

export default function LeaveRequestPanel({
  form,
  setForm,
  leaveTypes,
  leaveBalances,
  holidays,
  employeeId,
  employeeName,
  employeeDateOfBirth,
  employeeDepartmentId,
  scopeQuery,
  onCancel,
  onSubmit,
  submitting,
  todayStr,
}: Props) {
  /* ── Holidays as Set of yyyy-mm-dd strings ── */
  const holidayDateSet = useMemo(
    () => new Set(holidays.map((h) => dayKey(h.date))),
    [holidays],
  );
  const holidayByDate = useMemo(() => {
    const m = new Map<string, Holiday>();
    holidays.forEach((h) => m.set(dayKey(h.date), h));
    return m;
  }, [holidays]);

  /* ── Working-day calculation ── */
  const workingDays = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    return getDaysBetween(form.startDate, form.endDate, holidayDateSet);
  }, [form.startDate, form.endDate, holidayDateSet]);

  /* ── Holidays in selected range (for Floating Day options) ── */
  const holidaysInRange = useMemo(() => {
    if (!form.startDate || !form.endDate) return [];
    return holidays.filter((h) => {
      const d = dayKey(h.date);
      return d >= form.startDate! && d <= form.endDate!;
    });
  }, [form.startDate, form.endDate, holidays]);

  /* ── Birthday-in-range check ── */
  const birthdayInRange = useMemo(() => {
    if (!employeeDateOfBirth || !form.startDate || !form.endDate) return false;
    const dob = new Date(employeeDateOfBirth);
    if (isNaN(dob.getTime())) return false;
    const startD = new Date(`${form.startDate}T00:00:00`);
    const endD = new Date(`${form.endDate}T00:00:00`);
    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return false;
    // Try the year of startDate and the next year (range may cross Dec→Jan).
    const tryYear = (yr: number) => {
      const bday = new Date(yr, dob.getMonth(), dob.getDate());
      return bday >= startD && bday <= endD;
    };
    return tryYear(startD.getFullYear()) || tryYear(startD.getFullYear() + 1);
  }, [employeeDateOfBirth, form.startDate, form.endDate]);

  /* ── Selected leave balance ── */
  const selectedBalance = useMemo(() => {
    if (!form.leaveTypeId) return null;
    return leaveBalances.find((lb) => lb.leaveType.id === form.leaveTypeId) || null;
  }, [form.leaveTypeId, leaveBalances]);

  /* ── Validation errors (inline red warnings) ── */
  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!form.leaveTypeId) errs.push('Leave type is required');
    if (!form.startDate) errs.push('Start date is required');
    if (!form.endDate) errs.push('End date is required');
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      errs.push('End date cannot be before start date');
    }
    if (form.startDate && form.startDate < todayStr) {
      errs.push('Leave cannot start in the past');
    }
    if (!form.reason || form.reason.trim().length < 3) {
      errs.push('Note is required (min 3 characters)');
    }
    if (
      selectedBalance &&
      selectedBalance.remaining === 0 &&
      !/loss of pay|lop/i.test(`${selectedBalance.leaveType.name} ${selectedBalance.leaveType.code}`)
    ) {
      errs.push(`No remaining balance for ${selectedBalance.leaveType.name}`);
    }
    return errs;
  }, [form, selectedBalance, todayStr]);

  /* ── Team leaves for calendar ── */
  const [calMonth, setCalMonth] = useState(() => {
    const d = form.startDate ? new Date(`${form.startDate}T00:00:00`) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [teamLeaves, setTeamLeaves] = useState<TeamLeave[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  // Resolve the current user's REAL employee.id by calling /api/auth/me.
  // We can't rely on the `employeeId` prop because the parent page
  // (/leave/page.tsx) resolves `employee` by matching user.email against
  // the employees list — which fails for managers/admins whose Employee.email
  // differs from their User.email. This fetch guarantees we have the correct
  // id to filter self out of the team calendar.
  const [myEmployeeId, setMyEmployeeId] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    const runFetch = async () => {
      try {
        const r = await fetch('/api/auth/me', { headers: getAuthHeaders() });
        if (cancelled) return;
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        const eid = d?.employee?.id;
        if (eid) setMyEmployeeId(eid);
      } catch {
        // non-fatal — fall back to the `employeeId` prop
      }
    };
    void runFetch();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const firstDay = new Date(calMonth.year, calMonth.month, 1);
    const lastDay = new Date(calMonth.year, calMonth.month + 1, 0);
    const monthStart = isoDay(firstDay);
    const monthEnd = isoDay(lastDay);
    // CRITICAL: use fromDate/toDate (NOT startDate/endDate) and view=team
    // to bypass self-scope so employees can see their team's leaves.
    const url =
      `/api/leave?fromDate=${monthStart}&toDate=${monthEnd}&view=team&limit=200` +
      (scopeQuery ? `&${scopeQuery}` : '');
    let cancelled = false;
    const runFetch = async () => {
      setTeamLoading(true);
      try {
        const r = await fetch(url, { headers: getAuthHeaders() });
        if (cancelled) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (cancelled) return;
        // Filter OUT the current user — the right-side team calendar is
        // for seeing OTHER team members' availability, not the user's own
        // leaves. We try BOTH the `employeeId` prop AND `myEmployeeId`
        // (from /api/auth/me) because the prop can be empty for managers/
        // admins whose Employee.email doesn't match their User.email.
        const selfIds = new Set<string>();
        if (employeeId) selfIds.add(employeeId);
        if (myEmployeeId) selfIds.add(myEmployeeId);
        const list = (d.leaveRequests || []).filter((l: TeamLeave) => {
          if (!l.employee) return true;
          if (selfIds.has(l.employee.id)) return false;
          return true;
        });
        setTeamLeaves(list);
        setTeamLoading(false);
      } catch {
        if (!cancelled) {
          setTeamLeaves([]);
          setTeamLoading(false);
        }
      }
    };
    void runFetch();
    return () => { cancelled = true; };
  }, [calMonth.year, calMonth.month, scopeQuery, employeeId, myEmployeeId]);

  /* ── Map: date → leaves covering that date ── */
  const leavesByDate = useMemo(() => {
    const map = new Map<string, TeamLeave[]>();
    for (const l of teamLeaves) {
      const sd = dayKey(l.startDate);
      const ed = dayKey(l.endDate);
      if (!sd || !ed) continue;
      const cursor = new Date(`${sd}T00:00:00`);
      const end = new Date(`${ed}T00:00:00`);
      let guard = 0;
      while (cursor <= end && guard < 4000) {
        guard++;
        const k = isoDay(cursor);
        const arr = map.get(k) || [];
        arr.push(l);
        map.set(k, arr);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [teamLeaves]);

  /* ── Calendar grid (leading blanks + days) ── */
  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(calMonth.year, calMonth.month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate();
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = isoDay(new Date(calMonth.year, calMonth.month, d));
      cells.push({ date: dateStr, day: d });
    }
    return cells;
  }, [calMonth]);

  /* ── Date click handler (first click=From, second=To, third=reset) ── */
  const clickCountRef = useRef(0);
  const handleDateClick = (dateStr: string) => {
    if (!dateStr) return;
    const next = clickCountRef.current + 1;
    if (next === 1) {
      setForm((p) => ({ ...p, startDate: dateStr, endDate: dateStr }));
      clickCountRef.current = 1;
    } else if (next === 2) {
      setForm((p) => {
        const start = p.startDate;
        const newStart = dateStr < start ? dateStr : start;
        const newEnd = dateStr < start ? start : dateStr;
        return { ...p, startDate: newStart, endDate: newEnd };
      });
      clickCountRef.current = 2;
    } else {
      setForm((p) => ({ ...p, startDate: '', endDate: '' }));
      clickCountRef.current = 0;
    }
  };

  // Reset click counter if form dates were cleared externally (e.g. parent reset).
  useEffect(() => {
    if (!form.startDate && !form.endDate) clickCountRef.current = 0;
  }, [form.startDate, form.endDate]);

  /* ── Selected date events (hover/click inspector) ── */
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const selectedDateLeaves = useMemo(() => {
    if (!selectedCalDate) return [];
    return leavesByDate.get(selectedCalDate) || [];
  }, [selectedCalDate, leavesByDate]);

  /* ── Team alert: members on leave during the user's selected range ── */
  const teamOnLeaveDuringRange = useMemo(() => {
    if (!form.startDate) return [];
    const endKey = form.endDate || form.startDate;
    const result: TeamLeave[] = [];
    for (const l of teamLeaves) {
      const sd = dayKey(l.startDate);
      const ed = dayKey(l.endDate);
      if (!sd || !ed) continue;
      // Overlap check
      if (sd <= endKey && ed >= form.startDate) result.push(l);
    }
    // Dedupe by employee + status
    const seen = new Set<string>();
    return result.filter((l) => {
      const key = `${l.employee?.id || l.id}-${l.status}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [form.startDate, form.endDate, teamLeaves]);

  /* ── AI Collaborative Check (inline team-conflict warning) ── */
  const aiWarning = useMemo(() => {
    if (!form.startDate || teamOnLeaveDuringRange.length === 0) return null;
    const approvedCount = teamOnLeaveDuringRange.filter((l) => l.status === 'approved').length;
    const pendingCount = teamOnLeaveDuringRange.filter((l) => l.status === 'pending').length;
    const names = Array.from(
      new Set(
        teamOnLeaveDuringRange
          .map((l) => (l.employee ? `${l.employee.firstName} ${l.employee.lastName}`.trim() : null))
          .filter(Boolean),
      ),
    ) as string[];
    if (approvedCount > 0) {
      return (
        `${approvedCount} teammate(s) already on approved leave during your selected dates` +
        (names.length ? `: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}` : '') +
        `. Consider choosing different dates.`
      );
    }
    if (pendingCount > 0) {
      return `${pendingCount} teammate(s) have pending leave requests overlapping your selected dates. Coordinate to avoid team shortages.`;
    }
    return null;
  }, [form.startDate, teamOnLeaveDuringRange]);

  /* ── Self-overlap check — does the user already have leave on the picked dates? ── */
  // Fetches the user's OWN leaves (view=self) for the current month and
  // checks if the picked [startDate, endDate] range overlaps with any
  // existing pending/approved leave. If yes, shows a clear inline warning
  // "You already have leave on these dates" — so the user finds out BEFORE
  // hitting submit (which would return 409 "Duplicate leave request").
  const [selfLeaves, setSelfLeaves] = useState<TeamLeave[]>([]);
  useEffect(() => {
    // The /api/leave?view=self endpoint auto-filters by the authenticated
    // user's own employee record — no employeeId needed. We fetch a wide
    // date range (9 months around today) so we catch any existing leave
    // regardless of which month the user picks.
    const today = new Date();
    const fromD = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const toD = new Date(today.getFullYear(), today.getMonth() + 6, 0);
    const fromDate = isoDay(fromD);
    const toDate = isoDay(toD);
    const url =
      `/api/leave?fromDate=${fromDate}&toDate=${toDate}&view=self&limit=200` +
      (scopeQuery ? `&${scopeQuery}` : '');
    let cancelled = false;
    const runFetch = async () => {
      try {
        const r = await fetch(url, { headers: getAuthHeaders() });
        if (cancelled) return;
        if (!r.ok) { setSelfLeaves([]); return; }
        const d = await r.json();
        if (cancelled) return;
        setSelfLeaves(d.leaveRequests || []);
      } catch {
        if (!cancelled) setSelfLeaves([]);
      }
    };
    void runFetch();
    return () => { cancelled = true; };
  }, [scopeQuery]);

  // Compute overlap of the picked range with the user's own leaves
  const selfOverlapLeaves = useMemo(() => {
    if (!form.startDate || !form.endDate || selfLeaves.length === 0) return [];
    const start = new Date(`${form.startDate}T00:00:00`);
    const end = new Date(`${form.endDate}T00:00:00`);
    return selfLeaves.filter((l) => {
      if (l.status === 'cancelled' || l.status === 'rejected') return false;
      const lStart = new Date(`${dayKey(l.startDate)}T00:00:00`);
      const lEnd = new Date(`${dayKey(l.endDate)}T00:00:00`);
      // Overlap condition
      return lStart <= end && lEnd >= start;
    });
  }, [form.startDate, form.endDate, selfLeaves]);

  const hasSelfOverlap = selfOverlapLeaves.length > 0;

  /* ── Notify employees search ── */
  const [empSearch, setEmpSearch] = useState('');
  const [empResults, setEmpResults] = useState<EmployeeOption[]>([]);
  const [empSearchLoading, setEmpSearchLoading] = useState(false);

  useEffect(() => {
    if (!empSearch.trim()) {
      return;
    }
    const ctrl = new AbortController();
    const url =
      `/api/employees?limit=15&search=${encodeURIComponent(empSearch)}` +
      (scopeQuery ? `&${scopeQuery}` : '');
    // Wrap setState calls inside an async function so the React Compiler
    // does not flag them as synchronous setState-in-effect.
    const runSearch = async () => {
      setEmpSearchLoading(true);
      try {
        const r = await fetch(url, { headers: getAuthHeaders(), signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        if (!r.ok) throw new Error('failed');
        const d = await r.json();
        if (ctrl.signal.aborted) return;
        const arr: EmployeeOption[] = (d.employees || []).filter(
          (e: EmployeeOption) => e.id !== employeeId,
        );
        setEmpResults(arr);
      } catch {
        // aborted fetch or network error — leave results as-is
      } finally {
        if (!ctrl.signal.aborted) setEmpSearchLoading(false);
      }
    };
    void runSearch();
    return () => ctrl.abort();
  }, [empSearch, scopeQuery, employeeId]);

  const notifyIds = useMemo(
    () =>
      Array.isArray(form.notifyEmployeeIds)
        ? (form.notifyEmployeeIds as string[])
        : [],
    [form.notifyEmployeeIds],
  );
  const selectedNotifyEmployees = useMemo(
    () => empResults.filter((e) => notifyIds.includes(e.id)),
    [empResults, notifyIds],
  );

  const toggleNotifyEmployee = (e: EmployeeOption) => {
    setForm((p) => {
      const ids: string[] = Array.isArray(p.notifyEmployeeIds) ? p.notifyEmployeeIds : [];
      if (ids.includes(e.id)) {
        return { ...p, notifyEmployeeIds: ids.filter((id) => id !== e.id) };
      }
      return { ...p, notifyEmployeeIds: [...ids, e.id] };
    });
  };

  /* ── Floating-day toggles ── */
  const floatingHolidays: string[] = Array.isArray(form.floatingHolidays)
    ? (form.floatingHolidays as string[])
    : [];
  const toggleFloatingHoliday = (holidayId: string) => {
    setForm((p) => {
      const ids: string[] = Array.isArray(p.floatingHolidays) ? p.floatingHolidays : [];
      if (ids.includes(holidayId)) {
        return { ...p, floatingHolidays: ids.filter((id) => id !== holidayId) };
      }
      return { ...p, floatingHolidays: [...ids, holidayId] };
    });
  };
  const useFloatingDay = !!form.useFloatingDay;
  const toggleUseFloatingDay = () =>
    setForm((p) => ({ ...p, useFloatingDay: !p.useFloatingDay }));

  /* ── Birthday-leave toggle ── */
  const birthdayLeave = !!form.birthdayLeave;
  const toggleBirthdayLeave = () =>
    setForm((p) => ({ ...p, birthdayLeave: !p.birthdayLeave }));

  /* ── Submit (NO toast calls — parent handles all toasts) ── */
  const handleSubmit = () => {
    // The parent's onSubmit/handleApply performs all validation and shows
    // any toasts. We must NOT toast here to prevent duplicate toasts.
    onSubmit();
  };

  /* ── Calendar navigation ── */
  const prevMonth = () =>
    setCalMonth((p) => {
      const d = new Date(p.year, p.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const nextMonth = () =>
    setCalMonth((p) => {
      const d = new Date(p.year, p.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const isInRange = (dateStr: string) => {
    if (!form.startDate || !form.endDate) return false;
    return dateStr >= form.startDate && dateStr <= form.endDate;
  };

  /* ── Avatar helper ── */
  // Renders an actual profile photo if `avatarUrl` is a non-empty string
  // (data URL or http URL). Otherwise falls back to a colored circle with
  // the user's initials.
  const renderAvatar = (
    name: string,
    size = 'w-7 h-7',
    avatarUrl?: string | null,
  ) => {
    // Normalize — treat empty string / "null" / "undefined" as no avatar
    const url = avatarUrl && typeof avatarUrl === 'string' && avatarUrl.length > 0 ? avatarUrl : null;
    if (url) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          className={`${size} rounded-full object-cover border border-white shadow-sm flex-shrink-0`}
        />
      );
    }
    return (
      <div
        className={`${size} rounded-full bg-gradient-to-br ${getAvatarGradient(
          name,
        )} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}
        aria-hidden="true"
      >
        {getInitials(name)}
      </div>
    );
  };

  /* ───────────────────────────────────────────────────────────────────────
     Render
     ─────────────────────────────────────────────────────────────────────── */
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ─── LEFT COLUMN: Form (2/3) ─── */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-green-100 bg-green-50/50">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FiCalendar className="w-4 h-4 text-green-600" /> Apply Leave
            </h3>
            {employeeName && (
              <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                Applying as <span className="font-semibold text-slate-700">{employeeName}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close form"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 1. Leave Duration: From / To date pickers */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Leave Duration
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  From <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="date"
                  value={form.startDate || ''}
                  min={todayStr}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, startDate: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  To <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="date"
                  value={form.endDate || ''}
                  min={form.startDate || todayStr}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, endDate: e.target.value }))
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                />
              </div>
            </div>
          </div>

          {/* 2. Dynamic summary — "Requesting N working day(s) of leave" */}
          {form.startDate && form.endDate && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-100">
              <span className="text-sm text-green-700 font-medium flex items-center gap-1.5">
                <FiClock className="w-4 h-4" />
                Requesting <strong className="mx-1">{workingDays}</strong>
                working day{workingDays === 1 ? '' : 's'} of leave
              </span>
              {selectedBalance && (
                <span className="text-xs text-green-600 font-semibold whitespace-nowrap">
                  Remaining: {selectedBalance.remaining} day(s)
                </span>
              )}
            </div>
          )}

          {/* 3. Floating Day Options — always visible when dates selected */}
          {form.startDate && form.endDate && (
            <div className="p-3 rounded-lg border border-violet-200 bg-violet-50/40">
              <p className="text-xs font-semibold text-violet-800 mb-2 flex items-center gap-1.5">
                <FiAnchor className="w-3.5 h-3.5" /> Floating Day Options
              </p>
              {holidaysInRange.length > 0 ? (
                <div className="space-y-1.5">
                  {holidaysInRange.map((h) => {
                    const checked = floatingHolidays.includes(h.id);
                    return (
                      <label
                        key={h.id}
                        className="flex items-center gap-2 cursor-pointer text-xs text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFloatingHoliday(h.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-violet-500 focus:ring-violet-500/20"
                        />
                        <span>
                          Use a floating day for <strong>{h.name}</strong> ({dayKey(h.date)})
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={useFloatingDay}
                      onChange={toggleUseFloatingDay}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-violet-500 focus:ring-violet-500/20"
                    />
                    <span>Use a floating day</span>
                  </label>
                  {useFloatingDay && (
                    <input
                      type="date"
                      value={(form.floatingDayDate as string) || ''}
                      min={todayStr}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, floatingDayDate: e.target.value }))
                      }
                      className="w-full px-2.5 py-2 rounded border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/20"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. Birthday Special Leave — only when employee's birthday is in range */}
          {birthdayInRange && (
            <div className="p-3 rounded-lg border border-pink-200 bg-pink-50/40">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={birthdayLeave}
                  onChange={toggleBirthdayLeave}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-pink-500 focus:ring-pink-500/20"
                />
                <span className="flex items-center gap-1.5">
                  <FiGift className="w-3.5 h-3.5 text-pink-500" />
                  Apply Birthday Special Leave (your birthday falls in this range)
                </span>
              </label>
            </div>
          )}

          {/* 5. Leave Type dropdown — shows available balance per type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Leave Type <span className="text-red-500 font-bold">*</span>
            </label>
            <select
              value={form.leaveTypeId || ''}
              onChange={(e) =>
                setForm((p) => ({ ...p, leaveTypeId: e.target.value }))
              }
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
            >
              <option value="">Select Leave Type</option>
              {leaveTypes.map((lt) => {
                const bal = leaveBalances.find((b) => b.leaveType.id === lt.id);
                const balanceStr = bal
                  ? ` · ${bal.remaining}/${bal.total} left`
                  : ` · ${lt.defaultDays} days`;
                return (
                  <option key={lt.id} value={lt.id}>
                    {lt.name} ({lt.code}){balanceStr}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 6. Balance display: Total / Used / Remaining */}
          {selectedBalance && (
            <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-700">{selectedBalance.total}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Total</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-amber-600">{selectedBalance.used}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Used</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-600">{selectedBalance.remaining}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Remaining</p>
              </div>
            </div>
          )}

          {/* 7. Half Day checkbox + First Half / Second Half radio */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.halfDay}
                onChange={(e) =>
                  setForm((p) => ({ ...p, halfDay: e.target.checked }))
                }
                className="w-4 h-4 rounded border-slate-300 text-green-500 focus:ring-green-500/20"
              />
              <span className="text-sm text-slate-700">Half Day Leave</span>
            </label>
            {form.halfDay && (
              <div className="ml-7 mt-2 flex gap-2">
                <label
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                    form.halfDaySlot === 'first_half'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    checked={form.halfDaySlot === 'first_half'}
                    onChange={() =>
                      setForm((p) => ({ ...p, halfDaySlot: 'first_half' }))
                    }
                    className="hidden"
                  />
                  First Half
                </label>
                <label
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                    form.halfDaySlot === 'second_half'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    checked={form.halfDaySlot === 'second_half'}
                    onChange={() =>
                      setForm((p) => ({ ...p, halfDaySlot: 'second_half' }))
                    }
                    className="hidden"
                  />
                  Second Half
                </label>
              </div>
            )}
          </div>

          {/* 8. Note (required) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Note <span className="text-red-500 font-bold">*</span>
            </label>
            <textarea
              rows={3}
              value={form.reason || ''}
              onChange={(e) =>
                setForm((p) => ({ ...p, reason: e.target.value }))
              }
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 resize-none"
              placeholder="Provide a note for your leave..."
            />
            {form.reason && form.reason.trim().length < 3 && (
              <p className="mt-1 text-xs text-red-600">
                Note must be at least 3 characters.
              </p>
            )}
          </div>

          {/* 9. Notify Employees — searchable selector with avatar chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Notify Employees
            </label>
            <div className="relative">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="Search employees to notify..."
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
              />
              {empSearchLoading && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <FiLoader className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                </div>
              )}
            </div>
            {empResults.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {empResults.map((e) => {
                  const name = `${e.firstName} ${e.lastName}`.trim();
                  const isSelected = notifyIds.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggleNotifyEmployee(e)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-green-50' : ''
                      }`}
                    >
                      {renderAvatar(name, 'w-6 h-6', e.avatar)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{name}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {e.employeeId || e.email || ''}
                        </p>
                      </div>
                      {isSelected && <FiCheck className="w-3.5 h-3.5 text-green-600" />}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedNotifyEmployees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedNotifyEmployees.map((e) => {
                  const name = `${e.firstName} ${e.lastName}`.trim();
                  return (
                    <div
                      key={e.id}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-50 border border-green-200"
                    >
                      {renderAvatar(name, 'w-5 h-5', e.avatar)}
                      <span className="text-[11px] font-medium text-slate-700">{name}</span>
                      <button
                        type="button"
                        onClick={() => toggleNotifyEmployee(e)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        aria-label={`Remove ${name}`}
                      >
                        <FiX className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 9b. Self-overlap warning — user already has leave on these dates */}
          {form.startDate && form.endDate && hasSelfOverlap && (
            <div className="p-3 rounded-lg border border-red-300 bg-red-50">
              <p className="text-xs text-red-800 flex items-start gap-1.5">
                <FiAlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>You already have leave on these dates.</strong>{' '}
                  {selfOverlapLeaves.length === 1
                    ? `Existing request: ${formatSelfRange(selfOverlapLeaves[0])}.`
                    : `${selfOverlapLeaves.length} existing requests overlap with this range.`}
                  {' '}
                  Pick different dates, or cancel the existing request first.
                </span>
              </p>
              <ul className="mt-1.5 space-y-0.5 pl-5">
                {selfOverlapLeaves.slice(0, 3).map((l) => (
                  <li key={l.id} className="text-xs text-red-700">
                    • {formatSelfRange(l)} — <span className="font-medium">{l.leaveType?.name || 'Leave'}</span> ({l.status})
                  </li>
                ))}
                {selfOverlapLeaves.length > 3 && (
                  <li className="text-xs text-red-600 italic">+ {selfOverlapLeaves.length - 3} more…</li>
                )}
              </ul>
            </div>
          )}

          {/* 10. AI Collaborative Check — team-conflict warning */}
          {form.startDate && form.endDate && (
            <div
              className={`p-3 rounded-lg border ${
                aiWarning
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              {teamLoading ? (
                <p className="text-xs text-slate-600 flex items-center gap-1.5">
                  <FiLoader className="w-3 h-3 animate-spin" /> Checking team availability...
                </p>
              ) : aiWarning ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-amber-800 flex items-start gap-1.5">
                    <FiAlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Team Conflict:</strong> {aiWarning}
                    </span>
                  </p>
                  <p className="text-xs text-amber-900 font-semibold pl-5">
                    → Approval chances are lower. Consider applying for a different date.
                  </p>
                  <Link
                    href="/leave/team-calendar"
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 underline hover:text-amber-900 pl-5"
                  >
                    <FiCalendar className="w-3 h-3" /> View Team Leave Calendar
                  </Link>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                    <FiCheck className="w-3.5 h-3.5" /> No team conflicts detected — approval chances are normal.
                  </p>
                  <Link
                    href="/leave/team-calendar"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline hover:text-emerald-900 flex-shrink-0"
                  >
                    <FiCalendar className="w-3 h-3" /> Team calendar
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* 10b. Detailed team-on-leave breakdown — list each person on leave
                during the user's selected date range, with their name, the
                specific dates they're out, leave type, and status. Helps the
                user see exactly who they'd be overlapping with. */}
          {form.startDate && form.endDate && teamOnLeaveDuringRange.length > 0 && !teamLoading && (
            <div className="p-3 rounded-lg border border-amber-200 bg-white">
              <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                <FiUser className="w-3.5 h-3.5" />
                {teamOnLeaveDuringRange.length} team member(s) on leave during {form.startDate} → {form.endDate}
              </p>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {teamOnLeaveDuringRange.map((l, i) => {
                  const name = l.employee
                    ? `${l.employee.firstName} ${l.employee.lastName}`.trim()
                    : 'Unknown';
                  const lvStart = dayKey(l.startDate);
                  const lvEnd = dayKey(l.endDate);
                  // Format the leave's specific date range for the user
                  const fmt = (d: string) => {
                    const dt = new Date(`${d}T00:00:00`);
                    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  };
                  const dateRange = lvStart === lvEnd
                    ? fmt(lvStart)
                    : `${fmt(lvStart)} – ${fmt(lvEnd)}`;
                  // Highlight if the leave OVERLAPS the user's selected range
                  // (all entries here do, but show the overlap days explicitly)
                  const userStart = form.startDate!;
                  const userEnd = form.endDate || form.startDate!;
                  const overlapStart = lvStart > userStart ? lvStart : userStart;
                  const overlapEnd = lvEnd < userEnd ? lvEnd : userEnd;
                  const overlapStr = overlapStart === overlapEnd
                    ? fmt(overlapStart)
                    : `${fmt(overlapStart)} – ${fmt(overlapEnd)}`;
                  const isApproved = l.status === 'approved';
                  return (
                    <li
                      key={`${l.id || ''}-${i}`}
                      className="flex items-start gap-2 p-2 rounded-md bg-amber-50/50 border border-amber-100"
                    >
                      {renderAvatar(name, 'w-7 h-7', l.employee?.avatar)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">
                          {name}
                          <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                            {l.leaveType?.name || 'Leave'}
                          </span>
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          <span className="text-slate-500">On leave:</span>{' '}
                          <span className="font-medium text-slate-700">{dateRange}</span>
                          {l.halfDay && <span className="ml-1 italic text-slate-500">(half day)</span>}
                        </p>
                        <p className="text-[10px] text-amber-700 mt-0.5">
                          <FiAlertCircle className="w-2.5 h-2.5 inline mr-0.5" />
                          Overlaps your selection on: <strong>{overlapStr}</strong>
                        </p>
                      </div>
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                          isApproved
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {isApproved ? 'ON LEAVE' : 'PENDING'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 11. Approver Chain Preview */}
          <ApproverChainPreview
            module="leave"
            leaveTypeId={form.leaveTypeId || undefined}
            compact
          />

          {/* 12. Validation errors — inline red warnings */}
          {errors.length > 0 && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50">
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5 mb-1">
                <FiAlertCircle className="w-3.5 h-3.5" /> Please fix the following:
              </p>
              <ul className="text-xs text-red-600 space-y-0.5 ml-5 list-disc">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 13. Footer: Cancel + Request Leave */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || errors.length > 0 || hasSelfOverlap}
              className="px-6 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
            >
              {submitting ? 'Submitting...' : hasSelfOverlap ? 'Already on leave these dates' : 'Request Leave'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── RIGHT COLUMN: Team Leave Calendar (1/3) ─── */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3
                className="text-sm font-bold text-slate-900 flex items-center gap-1.5"
                title={employeeDepartmentId ? `Department ID: ${employeeDepartmentId}` : undefined}
              >
                <FiCalendar className="w-4 h-4 text-green-600" /> Team Leave Calendar
              </h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                  aria-label="Previous month"
                >
                  <FiChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-slate-700 min-w-[110px] text-center">
                  {MONTH_NAMES[calMonth.month]} {calMonth.year}
                </span>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                  aria-label="Next month"
                >
                  <FiChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
              <FiInfo className="w-3 h-3" /> Click a date to set From/To dates
            </p>
          </div>

          <div className="p-3">
            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="text-center text-[10px] font-semibold text-slate-400 py-1"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell, i) => {
                if (!cell.date) {
                  return <div key={i} className="aspect-square" aria-hidden="true" />;
                }
                const dayLeaves = leavesByDate.get(cell.date) || [];
                const hasApproved = dayLeaves.some((l) => l.status === 'approved');
                const hasPending = dayLeaves.some((l) => l.status === 'pending');
                const inRange = isInRange(cell.date);
                const isSelected = selectedCalDate === cell.date;
                const dateObj = new Date(`${cell.date}T00:00:00`);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                const isHoliday = holidayByDate.has(cell.date);

                const cellClasses: string[] = [
                  'aspect-square rounded-md text-xs flex flex-col items-center justify-center relative cursor-pointer transition-all',
                  'hover:ring-2 hover:ring-green-400/30',
                ];
                if (hasApproved) {
                  // RED background for approved team leave — shows EVEN when in user's selected range
                  cellClasses.push('bg-red-100 ring-1 ring-red-300 text-red-900');
                } else if (hasPending) {
                  cellClasses.push('bg-amber-100 ring-1 ring-amber-300 text-amber-900');
                } else if (inRange) {
                  cellClasses.push('bg-green-100 ring-1 ring-green-300 text-green-900');
                } else if (isHoliday) {
                  cellClasses.push('bg-teal-50 text-teal-700');
                } else if (isWeekend) {
                  cellClasses.push('bg-slate-50 text-slate-400');
                } else {
                  cellClasses.push('bg-white text-slate-700 hover:bg-slate-50');
                }
                if (isSelected) cellClasses.push('ring-2 ring-green-500');

                const tooltipText =
                  dayLeaves.length > 0
                    ? dayLeaves
                        .map((l) =>
                          `${l.employee?.firstName || ''} ${l.employee?.lastName || ''}`.trim() +
                          ` (${l.status})`,
                        )
                        .join(', ')
                    : isHoliday
                      ? `Holiday: ${holidayByDate.get(cell.date)?.name || ''}`
                      : '';

                return (
                  <button
                    key={i}
                    type="button"
                    title={tooltipText}
                    onClick={() => {
                      setSelectedCalDate(cell.date!);
                      handleDateClick(cell.date!);
                    }}
                    className={cellClasses.join(' ')}
                  >
                    <span className="font-medium">{cell.day}</span>
                    {dayLeaves.length > 0 && (
                      <span className="absolute bottom-0.5 flex gap-0.5">
                        {dayLeaves.slice(0, 3).map((l, idx) => (
                          <span
                            key={idx}
                            className={`w-1 h-1 rounded-full ${
                              l.status === 'approved' ? 'bg-red-500' : 'bg-amber-500'
                            }`}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-100 ring-1 ring-red-300" />
                <span>Approved</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-300" />
                <span>Pending</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-100 ring-1 ring-green-300" />
                <span>Selected</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-teal-50 ring-1 ring-teal-200" />
                <span>Holiday</span>
              </div>
            </div>
          </div>
        </div>

        {/* Selected date events — profile pic avatars */}
        {selectedCalDate && selectedDateLeaves.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <FiUser className="w-3.5 h-3.5" />
              On leave — {selectedCalDate}
            </h4>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {selectedDateLeaves.map((l, i) => {
                const name = l.employee
                  ? `${l.employee.firstName} ${l.employee.lastName}`.trim()
                  : 'Unknown';
                const badge =
                  l.status === 'approved'
                    ? 'bg-red-100 text-red-700'
                    : l.status === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-600';
                const label =
                  l.status === 'approved'
                    ? 'ON LEAVE'
                    : l.status === 'pending'
                      ? 'PENDING'
                      : (l.status || '').toUpperCase();
                return (
                  <li key={`${l.id || ''}-${i}`} className="flex items-center gap-2">
                    {renderAvatar(name, 'w-7 h-7', l.employee?.avatar)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{name}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {l.leaveType?.name || 'Leave'}
                      </p>
                    </div>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${badge}`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* The duplicate "Team Alert" yellow card with profile pics was
            removed per user request (2026-10-29) — the inline AI
            Collaborative Check warning above already covers team-conflict
            alerts without duplicating the avatar list. The "On leave" card
            above (per-day detail) remains. */}
      </div>
    </div>
  );
}
