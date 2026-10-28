'use client';

<<<<<<< HEAD
/**
 * LeaveRequestPanel — redesigned Apply Leave form replacing the old inline form.
 *
 * Layout (desktop): two columns
 *   LEFT:  Leave Request form (dates, floating/birthday options, leave type,
 *          half-day, note, notify employees, policy restrictions, buttons)
 *   RIGHT: Team Leave Calendar (month navigation, approved-leave dots,
 *          event list for selected date)
 *
 * Mobile: stacks vertically — form first, calendar below.
 *
 * Reuses:
 *   - /api/leave POST (submission)
 *   - /api/leave GET (team calendar data — approved leaves for the month)
 *   - /api/leave/balance (leave balances)
 *   - /api/leave-types (leave types)
 *   - /api/holidays (public holidays)
 *   - /api/employees (notify-employees search)
 *   - /api/leave/collaborative-check (AI team-conflict check)
 *   - Existing computeWorkingDays / holiday logic from parent
 *
 * No new database tables or migrations — everything uses the existing
 * LeaveRequest, LeaveType, LeaveBalance, and Holiday models.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FiCalendar, FiClock, FiCheck, FiX, FiAlertCircle, FiChevronLeft,
  FiChevronRight, FiSearch, FiUser, FiInfo, FiGift, FiAnchor,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import ApproverChainPreview from '@/components/ApproverChainPreview';

/* ── Types (mirror the parent page) ── */
interface LeaveType { id: string; name: string; code: string; defaultDays: number; isPaid: boolean; }
interface LeaveBalance { id: string; total: number; used: number; remaining: number; year: number; leaveType: { id: string; name: string; code: string; }; }
interface Holiday { id: string; name: string; date: string; type: string; }
interface Employee { id: string; employeeId: string; firstName: string; lastName: string; avatar?: string | null; }
interface TeamLeave { id: string; startDate: string; endDate: string; status: string; employee: { id: string; firstName: string; lastName: string; employeeId: string; departmentId?: string | null; }; leaveType?: { name: string; }; }

interface LeaveFormState {
=======
import { useEffect, useMemo, useRef, useState } from 'react';
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
>>>>>>> 4d958bd5 (Recreate LeaveRequestPanel with all fixes + view=team API + duplicate toast fix)
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  halfDay: boolean;
  halfDaySlot: 'first_half' | 'second_half';
<<<<<<< HEAD
}

interface LeaveRequestPanelProps {
  form: LeaveFormState;
  setForm: React.Dispatch<React.SetStateAction<LeaveFormState>>;
=======
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
>>>>>>> 4d958bd5 (Recreate LeaveRequestPanel with all fixes + view=team API + duplicate toast fix)
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  holidays: Holiday[];
  employeeId: string;
  employeeName: string;
<<<<<<< HEAD
  employeeDateOfBirth?: string | null;
  employeeDepartmentId?: string | null;
  scopeQuery: string;
  onCancel: () => void;
=======
  employeeDateOfBirth: string | null;
  employeeDepartmentId: string | null;
  /** Pre-built scope query string (e.g. `tenantId=xxx&companyId=yyy`). */
  scopeQuery: string;
  onCancel: () => void;
  /** Parent's handleApply — performs all validation + toasts. */
>>>>>>> 4d958bd5 (Recreate LeaveRequestPanel with all fixes + view=team API + duplicate toast fix)
  onSubmit: () => void;
  submitting: boolean;
  todayStr: string;
}

<<<<<<< HEAD
/* ── Helpers ── */
=======
/* ───────────────────────────────────────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────────────────────────────────────── */

>>>>>>> 4d958bd5 (Recreate LeaveRequestPanel with all fixes + view=team API + duplicate toast fix)
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

<<<<<<< HEAD
function getDaysBetween(start: string, end: string, holidayDates: Set<string> = new Set()): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 0;
  let count = 0;
  const d = new Date(s);
  while (d <= e) {
    const dow = d.getDay();
    const ds = d.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !holidayDates.has(ds)) count++;
    d.setDate(d.getDate() + 1);
=======
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
>>>>>>> 4d958bd5 (Recreate LeaveRequestPanel with all fixes + view=team API + duplicate toast fix)
  }
  return count;
}

<<<<<<< HEAD
function formatDateShort(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function getMonthName(m: number): string {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][m];
}

function getWeekdayShort(d: Date): string {
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
}

/* ── Component ── */
export default function LeaveRequestPanel({
  form, setForm, leaveTypes, leaveBalances, holidays,
  employeeId, employeeName, employeeDateOfBirth, employeeDepartmentId,
  scopeQuery, onCancel, onSubmit, submitting, todayStr,
}: LeaveRequestPanelProps) {
  // Floating day + birthday leave state
  const [floatingDays, setFloatingDays] = useState<Set<string>>(new Set());
  const [useBirthdayLeave, setUseBirthdayLeave] = useState(false);
  const [birthdayDate, setBirthdayDate] = useState<string>('');

  // Notify employees
  const [notifySearch, setNotifySearch] = useState('');
  const [notifyResults, setNotifyResults] = useState<Employee[]>([]);
  const [notifySelected, setNotifySelected] = useState<Employee[]>([]);
  const [notifyDropdownOpen, setNotifyDropdownOpen] = useState(false);
  const notifyRef = useRef<HTMLDivElement>(null);

  // Team calendar
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [teamLeaves, setTeamLeaves] = useState<TeamLeave[]>([]);
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [calLoading, setCalLoading] = useState(false);

  // AI collaborative check
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const holidaySet = useMemo(() => new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0])), [holidays]);

  // Working days in range
  const workingDays = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    return getDaysBetween(form.startDate, form.endDate, holidaySet);
  }, [form.startDate, form.endDate, holidaySet]);

  // Holidays in range
  const holidaysInRange = useMemo(() => {
    if (!form.startDate || !form.endDate) return [];
    return holidays.filter(h => {
      const hd = new Date(h.date).toISOString().split('T')[0];
      return hd >= form.startDate && hd <= form.endDate;
    });
  }, [form.startDate, form.endDate, holidays]);

  // Selected leave type balance
  const selectedBalance = useMemo(() => {
    return leaveBalances.find(lb => lb.leaveType.id === form.leaveTypeId);
  }, [leaveBalances, form.leaveTypeId]);

  // Check if employee's birthday falls in the selected range
  const birthdayInRange = useMemo(() => {
    if (!employeeDateOfBirth || !form.startDate || !form.endDate) return null;
    const dob = new Date(employeeDateOfBirth);
    const bdThisYear = new Date(calYear, dob.getMonth(), dob.getDate());
    const bdStr = bdThisYear.toISOString().split('T')[0];
    if (bdStr >= form.startDate && bdStr <= form.endDate) return bdStr;
    return null;
  }, [employeeDateOfBirth, form.startDate, form.endDate, calYear]);

  // Duration summary (accounting for floating days)
  const actualLeaveDays = useMemo(() => {
    if (workingDays === 0) return 0;
    let days = workingDays;
    // Floating days are still counted as leave days but flagged separately
    if (form.halfDay) return Math.max(0.5, days * 0.5);
    return days;
  }, [workingDays, form.halfDay]);

  // ── Fetch team leaves for calendar month ──
  const fetchTeamLeaves = useCallback(async () => {
    setCalLoading(true);
    try {
      const monthStart = new Date(calYear, calMonth, 1).toISOString().split('T')[0];
      const monthEnd = new Date(calYear, calMonth + 1, 0).toISOString().split('T')[0];
      // NOTE: the leave API uses fromDate/toDate params (not startDate/endDate)
      // for filtering. Using the wrong names silently returns ALL leaves.
      const res = await fetch(`/api/leave?fromDate=${monthStart}&toDate=${monthEnd}&limit=200${scopeQuery ? `&${scopeQuery}` : ''}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const all = data.leaveRequests || data.requests || data.data || [];
        // Filter to approved/pending only, AND same department as the logged-in
        // employee (so the calendar only shows same-team members, not everyone).
        const filtered = all
          .filter((r: TeamLeave) => r.status === 'approved' || r.status === 'pending')
          .filter((r: TeamLeave) => {
            // If we know the employee's department, only show same-department leaves.
            // If we don't know the department (e.g. super_admin without an employee
            // record), show all leaves so the calendar isn't empty.
            if (!employeeDepartmentId) return true;
            // Exclude the current employee's own leaves from the "team" view —
            // they already see their own leave in the form.
            if (r.employee.id === employeeId) return false;
            // Only show same-department team members.
            // If the leave API doesn't return departmentId, we can't filter —
            // include them (the collaborative-check API already does proper
            // department-based filtering for the Team Alert).
            return r.employee.departmentId === employeeDepartmentId || !r.employee.departmentId;
          });
        setTeamLeaves(filtered);
      }
    } catch { /* non-fatal */ }
    finally { setCalLoading(false); }
  }, [calMonth, calYear, scopeQuery, employeeDepartmentId, employeeId]);

  useEffect(() => { void fetchTeamLeaves(); }, [fetchTeamLeaves]);

  // ── AI collaborative check ──
  useEffect(() => {
    if (!employeeId || !form.startDate || !form.endDate) { setAiWarning(null); return; }
    setAiLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/leave/collaborative-check', {
          method: 'POST', headers: getAuthHeaders(),
          body: JSON.stringify({ employeeId, startDate: form.startDate, endDate: form.endDate }),
        });
        if (res.ok) { const d = await res.json(); setAiWarning(d.warning || null); }
        else { setAiWarning(null); }
      } catch { setAiWarning(null); }
      finally { setAiLoading(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [employeeId, form.startDate, form.endDate]);

  // ── Employee search for notify ──
  useEffect(() => {
    if (!notifySearch.trim() || notifySearch.length < 2) { setNotifyResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/employees?limit=10&search=${encodeURIComponent(notifySearch.trim())}${scopeQuery ? `&${scopeQuery}` : ''}`, { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          const all = data.employees || [];
          setNotifyResults(all.filter((e: Employee) => e.id !== employeeId).slice(0, 8));
        }
      } catch { /* non-fatal */ }
    }, 300);
    return () => clearTimeout(t);
  }, [notifySearch, employeeId, scopeQuery]);

  // Click-outside for notify dropdown
  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (notifyRef.current && !notifyRef.current.contains(e.target as Node)) setNotifyDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  // ── Calendar helpers ──
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const startPad = firstDay.getDay();
    const totalCells = Math.ceil((lastDay.getDate() + startPad) / 7) * 7;
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startPad + 1;
      if (dayNum < 1 || dayNum > lastDay.getDate()) {
        cells.push({ date: null, day: null });
      } else {
        const d = new Date(calYear, calMonth, dayNum);
        cells.push({ date: d.toISOString().split('T')[0], day: dayNum });
      }
    }
    return cells;
  }, [calMonth, calYear]);

  // Leaves on a specific calendar date
  // Fix: extract date string directly from the API response instead of
  // using new Date().toISOString() which can shift dates across timezones.
  const leavesOnDate = useCallback((dateStr: string | null) => {
    if (!dateStr) return [];
    return teamLeaves.filter(l => {
      // The API returns dates like "2026-10-28T00:00:00.000Z"
      // Extract just the YYYY-MM-DD part directly — no timezone conversion
      const ls = String(l.startDate).slice(0, 10);
      const le = String(l.endDate).slice(0, 10);
      return dateStr >= ls && dateStr <= le;
    });
  }, [teamLeaves]);

  // Check if a date is in the selected leave range
  const isInRange = useCallback((dateStr: string | null) => {
    if (!dateStr || !form.startDate || !form.endDate) return false;
    return dateStr >= form.startDate && dateStr <= form.endDate;
  }, [form.startDate, form.endDate]);

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  // ── Validation messages ──
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (form.startDate && form.endDate) {
      if (form.endDate < form.startDate) errs.push('End date cannot be before start date.');
      if (form.startDate < todayStr) errs.push('Leave cannot start in the past.');
    }
    if (selectedBalance && workingDays > 0) {
      if (selectedBalance.remaining === 0) errs.push(`No balance available for "${selectedBalance.leaveType.name}".`);
      else if (actualLeaveDays > selectedBalance.remaining) errs.push(`Insufficient balance: ${selectedBalance.remaining} day(s) available, ${actualLeaveDays} requested.`);
    }
    return errs;
  }, [form, selectedBalance, workingDays, actualLeaveDays, todayStr]);

  // ── Submit handler ──
  // NOTE: All validation + toasts are handled by the parent's handleApply.
  // We only append floating/birthday/notify info to the reason here, then
  // call onSubmit. This prevents duplicate toasts (one from LeaveRequestPanel
  // and one from the parent's handleApply).
  function handleSubmit() {
    // Append floating/birthday/notify info to the reason
    let enhancedReason = form.reason;
    if (floatingDays.size > 0) {
      enhancedReason += `\n[Floating days used: ${Array.from(floatingDays).join(', ')}]`;
    }
    if (useBirthdayLeave && birthdayDate) {
      enhancedReason += `\n[Birthday leave used: ${birthdayDate}]`;
    }
    if (notifySelected.length > 0) {
      enhancedReason += `\n[Notify: ${notifySelected.map(n => `${n.firstName} ${n.lastName}`).join(', ')}]`;
    }
    setForm(p => ({ ...p, reason: enhancedReason }));
    // Call parent's onSubmit after a tick so state updates
    setTimeout(() => onSubmit(), 0);
  }

  return (
    <div className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-green-100 bg-gradient-to-r from-green-50 to-emerald-50">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <FiCalendar className="w-5 h-5 text-green-600" />
          Leave Request
        </h3>
        <button onClick={onCancel} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
          <FiX className="w-5 h-5" />
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
        {/* ═══ LEFT: Form (2/3 width on desktop) ═══ */}
        <div className="lg:col-span-2 p-5 space-y-5 border-r border-slate-100">

          {/* ── Leave Duration ── */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Leave Duration</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">From Date <span className="text-red-500">*</span></label>
                <input type="date" value={form.startDate} min={todayStr}
                  onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">To Date <span className="text-red-500">*</span></label>
                <input type="date" value={form.endDate} min={form.startDate || todayStr}
                  onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
            </div>

            {/* Duration summary */}
            {form.startDate && form.endDate && workingDays > 0 && (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <div className="px-3 py-2 rounded-lg bg-green-50 border border-green-100 flex items-center gap-2">
                  <FiClock className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700 font-medium">
                    Requesting <strong>{actualLeaveDays}</strong> working day(s) of leave
                  </span>
                </div>
                {floatingDays.size > 0 && (
                  <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 flex items-center gap-2">
                    <FiAnchor className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700 font-medium">{floatingDays.size} floating day(s)</span>
                  </div>
                )}
                {useBirthdayLeave && (
                  <div className="px-3 py-2 rounded-lg bg-purple-50 border border-purple-100 flex items-center gap-2">
                    <FiGift className="w-4 h-4 text-purple-600" />
                    <span className="text-sm text-purple-700 font-medium">Birthday leave</span>
                  </div>
                )}
              </div>
            )}

            {/* Holidays in range */}
            {holidaysInRange.length > 0 && (
              <div className="mt-2 p-2.5 rounded-lg bg-teal-50 border border-teal-200">
                <p className="text-xs font-semibold text-teal-800 mb-1">
                  <FiCalendar className="w-3.5 h-3.5 inline mr-1" />Public Holidays in range:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {holidaysInRange.map(h => (
                    <span key={h.id} className="text-xs text-teal-700 bg-teal-100 px-2 py-0.5 rounded">
                      {h.name} ({formatDateShort(h.date)})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Floating Day & Birthday Leave ── */}
          {form.startDate && form.endDate && workingDays > 0 && (
            <div className="space-y-2">
              {/* Floating day — always visible (user can mark any day as floating) */}
              <div className="p-3 rounded-lg border border-blue-100 bg-blue-50/50">
                <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1">
                  <FiAnchor className="w-3.5 h-3.5" /> Floating Day Options
                </p>
                {/* If there are holidays in range, show them as floating day options */}
                {holidaysInRange.length > 0 ? (
                  <div className="space-y-1.5">
                    {holidaysInRange.map(h => {
                      const hd = new Date(h.date).toISOString().split('T')[0];
                      const checked = floatingDays.has(hd);
                      return (
                        <label key={h.id} className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                          <input type="checkbox" checked={checked}
                            onChange={() => {
                              setFloatingDays(prev => {
                                const next = new Set(prev);
                                if (next.has(hd)) next.delete(hd); else next.add(hd);
                                return next;
                              });
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500/20" />
                          Use floating day on {formatDateShort(h.date)} ({h.name})
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  /* No holidays in range — show a general floating day checkbox
                     that lets the user pick a specific date as a floating day */
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                      <input type="checkbox"
                        checked={floatingDays.size > 0}
                        onChange={(e) => {
                          if (e.target.checked && form.startDate) {
                            // Default to the start date as the floating day
                            setFloatingDays(new Set([form.startDate]));
                          } else {
                            setFloatingDays(new Set());
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500/20" />
                      Use a floating day during this leave period
                    </label>
                    {floatingDays.size > 0 && (
                      <div className="ml-6">
                        <label className="text-xs text-slate-500 block mb-1">Select floating day date:</label>
                        <input type="date" value={Array.from(floatingDays)[0] || form.startDate}
                          min={form.startDate} max={form.endDate}
                          onChange={(e) => {
                            if (e.target.value) {
                              setFloatingDays(new Set([e.target.value]));
                            }
                          }}
                          className="px-2 py-1.5 rounded border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/20" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Birthday leave option — only show if birthday falls in range */}
              {birthdayInRange && (
                <div className="p-3 rounded-lg border border-purple-100 bg-purple-50/50">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                    <input type="checkbox" checked={useBirthdayLeave}
                      onChange={() => {
                        setUseBirthdayLeave(prev => !prev);
                        setBirthdayDate(birthdayInRange);
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-purple-500 focus:ring-purple-500/20" />
                    <FiGift className="w-3.5 h-3.5 text-purple-600" />
                    Use birthday special leave on {formatDateShort(birthdayInRange)}
                  </label>
=======
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
    // Wrap setState calls inside an async function so the React Compiler
    // does not flag them as synchronous setState-in-effect (which would
    // trigger cascading renders). The async function is invoked synchronously
    // but its body runs as a microtask.
    const runFetch = async () => {
      setTeamLoading(true);
      try {
        const r = await fetch(url, { headers: getAuthHeaders() });
        if (cancelled) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (cancelled) return;
        setTeamLeaves(d.leaveRequests || []);
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
  }, [calMonth.year, calMonth.month, scopeQuery]);

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
  const renderAvatar = (name: string, size = 'w-7 h-7') => (
    <div
      className={`${size} rounded-full bg-gradient-to-br ${getAvatarGradient(
        name,
      )} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );

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
>>>>>>> 4d958bd5 (Recreate LeaveRequestPanel with all fixes + view=team API + duplicate toast fix)
                </div>
              )}
            </div>
          )}

<<<<<<< HEAD
          {/* ── Leave Type Selection ── */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Select Leave Type <span className="text-red-500">*</span></label>
            <select value={form.leaveTypeId}
              onChange={e => setForm(p => ({ ...p, leaveTypeId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400">
              <option value="">Select Leave Type</option>
              {leaveTypes.map(lt => {
                const bal = leaveBalances.find(lb => lb.leaveType.id === lt.id);
                const remaining = bal ? bal.remaining : lt.defaultDays;
                return (
                  <option key={lt.id} value={lt.id}>
                    {lt.name} ({remaining} day(s) available)
=======
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
>>>>>>> 4d958bd5 (Recreate LeaveRequestPanel with all fixes + view=team API + duplicate toast fix)
                  </option>
                );
              })}
            </select>
<<<<<<< HEAD
            {/* Balance display */}
            {selectedBalance && (
              <div className="mt-2 flex items-center gap-4 text-xs">
                <span className="text-slate-500">Total: <strong className="text-slate-700">{selectedBalance.total}</strong></span>
                <span className="text-slate-500">Used: <strong className="text-amber-600">{selectedBalance.used}</strong></span>
                <span className="text-slate-500">Remaining: <strong className={selectedBalance.remaining > 0 ? 'text-green-600' : 'text-red-600'}>{selectedBalance.remaining}</strong></span>
              </div>
            )}
          </div>

          {/* ── Half Day ── */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.halfDay}
                onChange={e => setForm(p => ({ ...p, halfDay: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-green-500 focus:ring-green-500/20" />
              <span className="text-sm text-slate-700 font-medium">Avail Half Day</span>
            </label>
            {form.halfDay && (
              <div className="ml-7 mt-2 flex gap-2">
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${form.halfDaySlot === 'first_half' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>
                  <input type="radio" checked={form.halfDaySlot === 'first_half'}
                    onChange={() => setForm(p => ({ ...p, halfDaySlot: 'first_half' }))} className="hidden" />
                  First Half
                </label>
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${form.halfDaySlot === 'second_half' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>
                  <input type="radio" checked={form.halfDaySlot === 'second_half'}
                    onChange={() => setForm(p => ({ ...p, halfDaySlot: 'second_half' }))} className="hidden" />
=======
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
>>>>>>> 4d958bd5 (Recreate LeaveRequestPanel with all fixes + view=team API + duplicate toast fix)
                  Second Half
                </label>
              </div>
            )}
          </div>

<<<<<<< HEAD
          {/* ── Leave Note ── */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Note <span className="text-red-500">*</span>
            </label>
            <textarea rows={3} value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 resize-none"
              placeholder="Provide a reason for your leave..." />
            {!form.reason.trim() && form.startDate && (
              <p className="text-xs text-red-500 mt-1">Reason is required</p>
            )}
          </div>

          {/* ── Notify Employees ── */}
          <div ref={notifyRef}>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notify Employees</label>
            <div className="relative">
              <input type="text" value={notifySearch}
                onFocus={() => setNotifyDropdownOpen(true)}
                onChange={e => { setNotifySearch(e.target.value); setNotifyDropdownOpen(true); }}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400"
                placeholder="Search employees to notify..." />
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              {notifyDropdownOpen && notifyResults.length > 0 && (
                <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {notifyResults.map(emp => (
                    <button key={emp.id} type="button"
                      onMouseDown={e => { e.preventDefault();
                        setNotifySelected(prev => [...prev, emp]);
                        setNotifySearch(''); setNotifyResults([]); setNotifyDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 border-b border-slate-100 last:border-b-0 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                        {(emp.firstName[0] + (emp.lastName[0] || '')).toUpperCase()}
                      </div>
                      <span className="flex-1 truncate">{emp.firstName} {emp.lastName}</span>
                      <FiUser className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Selected employees */}
            {notifySelected.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {notifySelected.map(emp => (
                  <span key={emp.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-xs text-green-700">
                    {emp.firstName} {emp.lastName}
                    <button type="button" onClick={() => setNotifySelected(prev => prev.filter(e => e.id !== emp.id))}
                      className="text-green-400 hover:text-red-500">
                      <FiX className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1">Notifications are sent through the existing approval workflow.</p>
          </div>

          {/* ── AI Collaborative Check ── */}
          {form.startDate && form.endDate && (
            <div className={`p-3 rounded-lg border ${aiWarning ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              {aiLoading ? (
                <p className="text-xs text-slate-600 flex items-center gap-1"><FiClock className="w-3 h-3 animate-spin" /> Checking team availability...</p>
              ) : aiWarning ? (
                <p className="text-xs text-amber-800"><FiAlertCircle className="w-3.5 h-3.5 inline mr-1" /><strong>Team Alert:</strong> {aiWarning}</p>
              ) : (
                <p className="text-xs text-emerald-700"><FiCheck className="w-3.5 h-3.5 inline mr-1" /><strong>AI Check:</strong> No team conflicts detected.</p>
=======
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
                      {renderAvatar(name, 'w-6 h-6')}
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
                      {renderAvatar(name, 'w-5 h-5')}
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

          {/* 10. AI Collaborative Check — team-conflict warning */}
          {form.startDate && form.endDate && (
            <div
              className={`p-3 rounded-lg border ${
                aiWarning
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              {teamLoading ? (
                <p className="text-xs text-slate-600 flex items-center gap-1.5">
                  <FiLoader className="w-3 h-3 animate-spin" /> Checking team availability...
                </p>
              ) : aiWarning ? (
                <p className="text-xs text-amber-800 flex items-start gap-1.5">
                  <FiAlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Team Conflict:</strong> {aiWarning}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                  <FiCheck className="w-3.5 h-3.5" /> No team conflicts detected.
                </p>
>>>>>>> 4d958bd5 (Recreate LeaveRequestPanel with all fixes + view=team API + duplicate toast fix)
              )}
            </div>
          )}

<<<<<<< HEAD
          {/* ── Approver Chain ── */}
          <ApproverChainPreview module="leave" leaveTypeId={form.leaveTypeId || undefined} compact />

          {/* ── Validation Errors ── */}
          {validationErrors.length > 0 && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              {validationErrors.map((err, i) => (
                <p key={i} className="text-xs text-red-700 flex items-start gap-1">
                  <FiAlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {err}
                </p>
              ))}
            </div>
          )}

          {/* ── Footer Actions ── */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button onClick={onCancel}
              className="px-5 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting || validationErrors.length > 0}
              className="px-6 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors flex items-center gap-2">
              {submitting ? <><FiClock className="w-4 h-4 animate-spin" /> Submitting...</> : <><FiCheck className="w-4 h-4" /> Request Leave</>}
            </button>
          </div>
        </div>

        {/* ═══ RIGHT: Team Leave Calendar (1/3 width) ═══ */}
        <div className="p-5 bg-slate-50/50">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Team Leave Calendar</h4>

          {/* Calendar header */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
              <FiChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <span className="text-sm font-semibold text-slate-700">{getMonthName(calMonth)} {calYear}</span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors">
              <FiChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((cell, i) => {
              if (!cell.date) return <div key={i} className="aspect-square" />;
              const dow = new Date(cell.date).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isHoliday = holidaySet.has(cell.date);
              const inRange = isInRange(cell.date);
              const dayLeaves = leavesOnDate(cell.date);
              const hasApproved = dayLeaves.some(l => l.status === 'approved');
              const hasPending = dayLeaves.some(l => l.status === 'pending');
              const isSelected = selectedCalDate === cell.date;
              const isToday = cell.date === todayStr;
              // Build hover tooltip: list team members on leave on this date
              const tooltip = dayLeaves.length > 0
                ? dayLeaves.map(l => `${l.employee.firstName} ${l.employee.lastName} (${l.status})`).join(', ')
                : '';

              return (
                <button key={i}
                  title={tooltip}
                  onClick={() => {
                    setSelectedCalDate(cell.date);
                    if (!form.startDate) {
                      setForm(p => ({ ...p, startDate: cell.date! }));
                    } else if (form.startDate && !form.endDate) {
                      if (cell.date! < form.startDate) {
                        setForm(p => ({ ...p, endDate: p.startDate, startDate: cell.date! }));
                      } else {
                        setForm(p => ({ ...p, endDate: cell.date! }));
                      }
                    } else {
                      setForm(p => ({ ...p, startDate: cell.date!, endDate: '' }));
                    }
                  }}
                  className={`aspect-square rounded-lg text-xs flex flex-col items-center justify-center relative transition-all cursor-pointer
                    ${isSelected ? 'ring-2 ring-green-500' : ''}
                    ${inRange ? 'bg-green-50 border border-green-200' : ''}
                    ${isWeekend && !inRange && !hasApproved && !hasPending ? 'text-slate-300' : 'text-slate-700'}
                    ${isHoliday && !inRange && !hasApproved ? 'bg-teal-50 text-teal-600' : ''}
                    ${isToday ? 'ring-1 ring-blue-400' : ''}
                    ${hasApproved ? 'bg-red-100 text-red-700 font-bold ring-1 ring-red-300' : ''}
                    ${hasPending && !hasApproved ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' : ''}
                    hover:bg-slate-100`}>
                  <span className={`font-medium ${hasApproved ? 'text-red-700' : inRange ? 'text-green-700' : ''}`}>{cell.day}</span>
                  {/* Status dots */}
                  {(hasApproved || hasPending) && (
                    <div className="absolute bottom-0.5 flex gap-0.5">
                      {hasApproved && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                      {hasPending && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" /> Team on leave</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Pending</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-50 border border-teal-300" /> Holiday</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-50 border border-green-300" /> Your leave</span>
          </div>

          {/* Selected date events — with profile pics */}
          {selectedCalDate && (
            <div className="mt-4 p-3 rounded-lg bg-white border border-slate-200">
              <p className="text-xs font-semibold text-slate-700 mb-2">
                {formatDateShort(selectedCalDate)} — {getWeekdayShort(new Date(selectedCalDate))}
              </p>
              {leavesOnDate(selectedCalDate).length > 0 ? (
                <div className="space-y-2">
                  {leavesOnDate(selectedCalDate).map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-xs">
                      {/* Profile pic / initials avatar */}
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                        {(l.employee.firstName[0] + (l.employee.lastName[0] || '')).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-700 font-medium truncate">{l.employee.firstName} {l.employee.lastName}</div>
                        {l.leaveType && <div className="text-slate-400 text-[10px]">{l.leaveType.name}</div>}
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 ${l.status === 'approved' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {l.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No team leaves on this date.</p>
              )}
              {/* Hint: click to set dates */}
              <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                Click a date to set From/To dates
              </p>
            </div>
          )}

          {/* Loading indicator */}
          {calLoading && (
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
              <FiClock className="w-3 h-3 animate-spin" /> Loading team leaves...
            </p>
          )}

          {/* ── Team Alert: shows who else is on leave during the selected dates ── */}
          {/* Appears below the calendar with profile pics of affected team members */}
          {form.startDate && (() => {
            const checkEnd = form.endDate || form.startDate;
            // Find team members on leave during the selected range
            const conflicts = teamLeaves.filter(l => {
              // Fix: use direct string slicing instead of new Date().toISOString()
              // to avoid timezone-related date shifts
              const ls = String(l.startDate).slice(0, 10);
              const le = String(l.endDate).slice(0, 10);
              return ls <= checkEnd && le >= form.startDate;
            });
            if (conflicts.length === 0) return null;
            // Deduplicate by employee ID
            const seen = new Set<string>();
            const uniqueMembers = conflicts.filter(l => {
              if (seen.has(l.employee.id)) return false;
              seen.add(l.employee.id);
              return true;
            });
            const memberNames = uniqueMembers.map(l => `${l.employee.firstName} ${l.employee.lastName}`);
            return (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-2">
                  <FiAlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-800 mb-2">
                      Team Alert
                    </p>
                    <p className="text-xs text-amber-700 mb-3">
                      Warning: {uniqueMembers.length} other member(s) of your department team are on leave during these dates ({memberNames.join(', ')}). Project delivery may be impacted.
                    </p>
                    {/* Profile picture chips of team members on leave */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {uniqueMembers.map(l => (
                        <div key={l.employee.id} className="flex items-center gap-1.5 bg-white rounded-full pl-1 pr-2.5 py-1 border border-amber-200 shadow-sm">
                          {/* Profile pic — initials avatar with gradient */}
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-400 via-amber-400 to-orange-400 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ring-2 ring-white">
                            {(l.employee.firstName[0] + (l.employee.lastName[0] || '')).toUpperCase()}
                          </div>
                          <span className="text-[11px] text-amber-900 font-medium truncate max-w-[100px]">
                            {l.employee.firstName} {l.employee.lastName}
                          </span>
                          {/* Status badge */}
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold flex-shrink-0 ${l.status === 'approved' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {l.status === 'approved' ? 'ON LEAVE' : 'PENDING'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
=======
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
              disabled={submitting || errors.length > 0}
              className="px-6 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
            >
              {submitting ? 'Submitting...' : 'Request Leave'}
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
                    {renderAvatar(name, 'w-7 h-7')}
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

        {/* Team Alert box — below calendar, shows when form.startDate is set */}
        {form.startDate && teamOnLeaveDuringRange.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-3">
            <h4 className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
              <FiAlertCircle className="w-3.5 h-3.5" />
              Team Alert — {teamOnLeaveDuringRange.length} member(s) on leave during your selected dates
            </h4>
            <ul className="space-y-1.5 max-h-60 overflow-y-auto">
              {teamOnLeaveDuringRange.map((l, i) => {
                const name = l.employee
                  ? `${l.employee.firstName} ${l.employee.lastName}`.trim()
                  : 'Unknown';
                const isApproved = l.status === 'approved';
                const badge = isApproved
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700';
                const label = isApproved ? 'ON LEAVE' : 'PENDING';
                return (
                  <li key={`${l.id || ''}-${i}`} className="flex items-center gap-2">
                    {renderAvatar(name, 'w-7 h-7')}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{name}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {dayKey(l.startDate)} → {dayKey(l.endDate)}
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
>>>>>>> 4d958bd5 (Recreate LeaveRequestPanel with all fixes + view=team API + duplicate toast fix)
      </div>
    </div>
  );
}
