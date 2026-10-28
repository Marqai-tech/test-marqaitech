'use client';

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
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  halfDay: boolean;
  halfDaySlot: 'first_half' | 'second_half';
}

interface LeaveRequestPanelProps {
  form: LeaveFormState;
  setForm: React.Dispatch<React.SetStateAction<LeaveFormState>>;
  leaveTypes: LeaveType[];
  leaveBalances: LeaveBalance[];
  holidays: Holiday[];
  employeeId: string;
  employeeName: string;
  employeeDateOfBirth?: string | null;
  employeeDepartmentId?: string | null;
  scopeQuery: string;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  todayStr: string;
}

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

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
  }
  return count;
}

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
  const leavesOnDate = useCallback((dateStr: string | null) => {
    if (!dateStr) return [];
    return teamLeaves.filter(l => {
      const ls = new Date(l.startDate).toISOString().split('T')[0];
      const le = new Date(l.endDate).toISOString().split('T')[0];
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
                </div>
              )}
            </div>
          )}

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
                  </option>
                );
              })}
            </select>
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
                  Second Half
                </label>
              </div>
            )}
          </div>

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
              )}
            </div>
          )}

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

              return (
                <button key={i}
                  onClick={() => {
                    // Fix 2: clicking a calendar date auto-fills From/To dates
                    setSelectedCalDate(cell.date);
                    if (!form.startDate) {
                      // No start date yet → set as start date
                      setForm(p => ({ ...p, startDate: cell.date! }));
                    } else if (form.startDate && !form.endDate) {
                      // Start date set but no end → set as end date (swap if before start)
                      if (cell.date! < form.startDate) {
                        setForm(p => ({ ...p, endDate: p.startDate, startDate: cell.date! }));
                      } else {
                        setForm(p => ({ ...p, endDate: cell.date! }));
                      }
                    } else {
                      // Both dates set → reset and use clicked date as new start
                      setForm(p => ({ ...p, startDate: cell.date!, endDate: '' }));
                    }
                  }}
                  className={`aspect-square rounded-lg text-xs flex flex-col items-center justify-center relative transition-all cursor-pointer
                    ${isSelected ? 'ring-2 ring-green-500 bg-green-100' : ''}
                    ${inRange && !isSelected ? 'bg-green-50 border border-green-200' : ''}
                    ${isWeekend && !inRange && !hasApproved && !hasPending ? 'text-slate-300' : 'text-slate-700'}
                    ${isHoliday && !inRange ? 'bg-teal-50 text-teal-600' : ''}
                    ${isToday ? 'ring-1 ring-blue-400' : ''}
                    ${hasApproved && !inRange ? 'bg-red-100 text-red-700 font-bold' : ''}
                    ${hasPending && !hasApproved && !inRange ? 'bg-amber-100 text-amber-700' : ''}
                    hover:bg-slate-100`}>
                  <span className={`font-medium ${inRange ? 'text-green-700' : ''} ${hasApproved ? 'text-red-700' : ''}`}>{cell.day}</span>
                  {/* Status dots — still show for additional clarity */}
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
              const ls = new Date(l.startDate).toISOString().split('T')[0];
              const le = new Date(l.endDate).toISOString().split('T')[0];
              // Overlap check: leave starts before our end AND ends after our start
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
      </div>
    </div>
  );
}
