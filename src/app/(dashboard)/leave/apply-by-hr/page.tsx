'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  FiCalendar, FiUser, FiSearch, FiPlus, FiRefreshCw,
  FiChevronDown, FiCheck, FiAlertCircle, FiClock,
  FiFileText, FiUsers,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { getDataScope } from '@/lib/roleAccess';
import { useRouter } from 'next/navigation';
import TeamLeaveSidebar from '@/components/TeamLeaveSidebar';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ── Types ── */
interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  companyId?: string;
  avatar?: string | null;
  department?: { name: string } | null;
  // BUG_128 FIX: Designation model uses 'title' not 'name'. The API returns
  // { id, title } so the frontend must read .title (was reading .name → 'No Designation').
  designation?: { id: string; title: string } | null;
  // BUG_136: probation status + dateOfJoining for paid-leave blocking.
  employeeStatus?: string | null;
  dateOfJoining?: string | null;
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

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: string;
  halfDay: boolean;
  halfDaySlot?: string | null;
  createdAt: string;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string };
  leaveType?: { id: string; name: string; code: string };
}

/* ── Task 135: attendance context (regularization dates + pending requests)
   shown beside the leave form so HR sees the full picture before applying ── */
interface AttendanceContextLite {
  regularizations: Array<{ id: string; date: string; punchType: string; status: string }>;
  pendingByType: Array<{ type: string; count: number; latestDate?: string }>;
}

export default function ApplyLeaveByHRPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);

  useEffect(() => {
    if (!user) return;
    if (getDataScope(user.role) !== 'all') {
      toast.error('This page is for HR only');
      router.replace('/home');
    }
  }, [user, router]);

  // Employee search & selection
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Leave data
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [recentRequests, setRecentRequests] = useState<LeaveRequest[]>([]);
  // Task 135 — the selected employee's regularization dates + pending requests
  const [attendanceContext, setAttendanceContext] = useState<AttendanceContextLite | null>(null);
  // Holiday calendar (for working-day duration display)
  const [holidays, setHolidays] = useState<Array<{ id: string; name: string; date: string; type: string }>>([]);

  // Form state
  const [form, setForm] = useState({
    leaveTypeId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: '',
    halfDay: false,
    halfDaySlot: 'first_half',
  });
  // Approval + notification options
  const [skipApproval, setSkipApproval] = useState(false); // auto-approve (no manager approval needed)
  const [notifySpecificPerson, setNotifySpecificPerson] = useState(false); // email only a specific person
  const [notifyEmail, setNotifyEmail] = useState(''); // email of the person to notify
  const [notifyEmployee, setNotifyEmployee] = useState<Employee | null>(null); // selected employee to notify
  const [notifySearch, setNotifySearch] = useState('');
  const [notifyResults, setNotifyResults] = useState<Employee[]>([]);
  const [notifyDropdown, setNotifyDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingLeaveData, setLoadingLeaveData] = useState(false);

  // ─── Fetch Employees ───────────────────────────
  const fetchEmployees = useCallback(async (search: string, signal?: AbortSignal) => {
    setLoadingEmployees(true);
    try {
      const sq = scopeQuery();
      const r = await fetch(`/api/employees?limit=50&includePhotos=0&excludeInactive=true&search=${encodeURIComponent(search)}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders(), signal });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setEmployees(d.employees || []);
    } catch (e: unknown) {
      if (signal?.aborted) return;
      toast.error(e instanceof Error ? e.message : 'Failed to load employees');
    } finally {
      if (!signal?.aborted) setLoadingEmployees(false);
    }
  }, [scopeQuery, selectedTenantId]);

  // Search only after the user pauses typing; avoid an initial 50-row fetch
  // and a database request for every character entered.
  useEffect(() => {
    const search = employeeSearch.trim();
    if (search.length < 2) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => { void fetchEmployees(search, controller.signal); }, 250);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [employeeSearch, fetchEmployees]);

  // ─── Fetch notify-person results (debounced) ──
  useEffect(() => {
    if (!notifySpecificPerson) return;
    const search = notifySearch.trim();
    if (search.length < 2) { setNotifyResults([]); return; }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      const sq = scopeQuery();
      fetch(`/api/employees?limit=20&includePhotos=0&excludeInactive=true&search=${encodeURIComponent(search)}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders(), signal: controller.signal })
        .then(r => r.json())
        .then(d => { setNotifyResults(d.employees || []); setNotifyDropdown(true); })
        .catch(() => {});
    }, 250);
    return () => { window.clearTimeout(timeoutId); controller.abort(); };
  }, [notifySearch, notifySpecificPerson, scopeQuery]);

  // ─── Fetch holidays once (for weekend/holiday-aware day count) ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/holidays', { headers: getAuthHeaders() });
        if (res.ok) {
          const d = await res.json();
          setHolidays(d.holidays || d.data || []);
        }
      } catch { /* non-fatal — day count just won't exclude holidays */ }
    })();
  }, []);

  // ─── Fetch Leave Types & Balances for selected employee ──────
  // BUG FIX: leave types are now fetched with the SELECTED EMPLOYEE's
  // companyId so the dropdown only shows types configured for that
  // employee's company (previously all child companies' types appeared).
  const fetchLeaveData = useCallback(async (employee: Employee) => {
    setLoadingLeaveData(true);
    try {
      const typesUrl = employee.companyId
        ? `/api/leave-types?companyId=${encodeURIComponent(employee.companyId)}`
        : '/api/leave-types';
      const [typesRes, balanceRes, requestsRes, regRes, attReqRes] = await Promise.all([
        fetch(typesUrl, { headers: getAuthHeaders() }),
        fetch(`/api/leave/balance?employeeId=${employee.id}`, { headers: getAuthHeaders() }),
        fetch(`/api/leave?employeeId=${employee.id}&limit=5`, { headers: getAuthHeaders() }),
        // Task 135 — regularization dates + pending attendance requests
        fetch(`/api/attendance/regularize?employeeId=${employee.id}&limit=50`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`/api/attendance/requests?scope=all&status=pending&limit=200`, { headers: getAuthHeaders() }).catch(() => null),
      ]);

      const typesData = await typesRes.json();
      if (typesRes.ok) setLeaveTypes(typesData.leaveTypes || typesData.data || []);
      else setLeaveTypes([]);

      const balanceData = await balanceRes.json();
      if (balanceRes.ok) {
        // A tenant can contain duplicate balance rows for the same leave type
        // (for example after a policy/employee migration). The HR proxy page
        // is a leave-type summary, so show one balance per leave type while
        // retaining the first canonical row for submissions.
        const uniqueBalances = new Map<string, LeaveBalance>();
        for (const balance of (balanceData.balances || []) as LeaveBalance[]) {
          const key = String(balance.leaveType?.name || balance.leaveType?.code || balance.leaveType?.id || '')
            .toLowerCase().replace(/\s+/g, ' ').trim();
          if (key && !uniqueBalances.has(key)) uniqueBalances.set(key, balance);
        }
        // These policy categories must be visible for every employee even
        // when the tenant has not created a balance row for them yet.
        if (!uniqueBalances.has('personal leave')) {
          uniqueBalances.set('personal leave', {
            id: 'synthetic-personal-leave', total: 0, used: 0, remaining: 0,
            year: new Date().getFullYear(),
            leaveType: { id: 'synthetic-personal-leave', name: 'Personal Leave', code: 'PL' },
          });
        }
        if (!uniqueBalances.has('loss of pay') && !uniqueBalances.has('lop')) {
          uniqueBalances.set('loss of pay', {
            id: 'synthetic-loss-of-pay', total: 0, used: 0, remaining: 0,
            year: new Date().getFullYear(),
            leaveType: { id: 'synthetic-loss-of-pay', name: 'Loss of Pay (LOP)', code: 'LOP' },
          });
        }
        setLeaveBalances(Array.from(uniqueBalances.values()));
      }

      const requestData = await requestsRes.json();
      if (requestsRes.ok) setRecentRequests(requestData.leaveRequests || []);

      // Task 135 — build the attendance context panel (best-effort)
      const ctx: AttendanceContextLite = { regularizations: [], pendingByType: [] };
      if (regRes && regRes.ok) {
        try {
          const d = await regRes.json();
          const regs = Array.isArray(d?.regularizations) ? d.regularizations : [];
          ctx.regularizations = regs.slice(0, 6).map((r: Record<string, unknown>) => ({
            id: String(r.id || ''),
            date: String(r.date || '').slice(0, 10),
            punchType: String(r.punchType || '—').replace(/_/g, ' '),
            status: String(r.status || 'pending'),
          }));
        } catch { /* non-fatal */ }
      }
      if (attReqRes && attReqRes.ok) {
        try {
          const d = await attReqRes.json();
          const reqs = (Array.isArray(d?.requests) ? d.requests : []).filter((r: Record<string, unknown>) => r.employeeId === employee.id || (r.employee as Record<string, unknown> | undefined)?.id === employee.id);
          const byType = new Map<string, { count: number; latest?: string }>();
          for (const r of reqs) {
            const key = String(r.requestType || 'OTHER').replace(/_/g, ' ');
            const cur = byType.get(key) || { count: 0 };
            cur.count += 1;
            const sd = r.startDate ? String(r.startDate).slice(0, 10) : '';
            if (sd && (!cur.latest || sd > cur.latest)) cur.latest = sd;
            byType.set(key, cur);
          }
          ctx.pendingByType = Array.from(byType.entries()).map(([type, v]) => ({ type, count: v.count, latestDate: v.latest }));
        } catch { /* non-fatal */ }
      }
      setAttendanceContext(ctx);
    } catch {
      toast.error('Failed to load leave data');
    } finally {
      setLoadingLeaveData(false);
    }
  }, []);

  // ─── Handle Employee Selection ─────────────────
  const handleSelectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setShowEmployeeDropdown(false);
    setEmployeeSearch('');
    setForm(prev => ({ ...prev, leaveTypeId: '' })); // types differ per company — reset selection
    fetchLeaveData(emp);
  };

  // ─── Calculate Days ────────────────────────────
  // BUG FIX: weekends (Sat+Sun) and configured holidays are excluded from
  // the duration — matches the server-side working-day count used for the
  // balance check and deduction.
  // BUG_132/133 FIX: half-day for a multi-day range is now disabled in the
  // UI (see checkbox below). When half-day IS checked (single day only),
  // duration = 0.5 (was 0.5 for the WHOLE multi-day range).
  const calculateDays = () => {
    if (!form.startDate || !form.endDate) return 0;
    const holidaySet = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
    const start = new Date(`${form.startDate}T00:00:00Z`);
    const end = new Date(`${form.endDate}T00:00:00Z`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    let workingDays = 0;
    const cursor = new Date(start.getTime());
    let guard = 0;
    while (cursor <= end && guard < 4000) {
      guard++;
      const dow = cursor.getUTCDay();
      const dateStr = cursor.toISOString().split('T')[0];
      if (dow !== 0 && dow !== 6 && !holidaySet.has(dateStr)) workingDays++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    // BUG_132/133: half day = 0.5 (single day only, enforced by checkbox disabled state)
    return form.halfDay ? 0.5 : workingDays;
  };

  // ─── Submit Leave on Behalf ────────────────────
  const handleSubmit = async () => {
    if (!selectedEmployee) {
      toast.error('Please select an employee first');
      return;
    }
    if (!form.leaveTypeId) {
      toast.error('Please select a leave type');
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error('Please select start and end dates');
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      toast.error('End date cannot be before start date');
      return;
    }
    // BUG_131 FIX: HR/admin CAN apply past-dated leave (per spec). Remove the past-date block.
    // (The server already allows privileged roles to apply past dates.)

    // BUG_136 FIX: block paid leave for probation employees. Probation employees
    // can only take LOP (unpaid) leave. Paid leave types are blocked per policy.
    const selectedLt = leaveTypes.find(lt => lt.id === form.leaveTypeId);
    const isProbation = (() => {
      const status = (selectedEmployee.employeeStatus || '').toLowerCase();
      if (!status.includes('probation') || !selectedEmployee.dateOfJoining) return false;
      const end = new Date(selectedEmployee.dateOfJoining);
      end.setMonth(end.getMonth() + 6);
      return end.getTime() > Date.now();
    })();
    if (isProbation && selectedLt?.isPaid) {
      toast.error(`${selectedEmployee.firstName} is on probation — paid leave is blocked during probation. Please select Loss of Pay (LOP) or an unpaid leave type.`);
      return;
    }

    // BUG_135: client-side insufficient-balance validation for HR apply.
    const selectedBalance = leaveBalances.find(b => b.leaveType.id === form.leaveTypeId);
    if (selectedBalance) {
      const holidaySet = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
      const start = new Date(`${form.startDate}T00:00:00Z`);
      const end = new Date(`${form.endDate}T00:00:00Z`);
      let workingDays = 0;
      const cursor = new Date(start.getTime());
      let guard = 0;
      while (cursor <= end && guard < 4000) { guard++; const dow = cursor.getUTCDay(); const dateStr = cursor.toISOString().split('T')[0]; if (dow !== 0 && dow !== 6 && !holidaySet.has(dateStr)) workingDays++; cursor.setUTCDate(cursor.getUTCDate() + 1); }
      const requestedDays = form.halfDay ? 0.5 : workingDays;
      const effectiveRemaining = Math.max(0, (selectedBalance.total || 0) - (selectedBalance.used || 0));
      if (effectiveRemaining === 0 && selectedBalance.total > 0) {
        toast.error(`No leave balance available for ${selectedEmployee.firstName} for "${selectedBalance.leaveType.name}". Please choose an unpaid leave type (LOP).`);
        return;
      }
      if (requestedDays > effectiveRemaining && selectedBalance.total > 0) {
        toast.error(`Insufficient leave balance for ${selectedEmployee.firstName}. Available: ${effectiveRemaining} day(s). Requested: ${requestedDays} day(s).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const r = await fetch('/api/leave', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: selectedEmployee.id,
          leaveTypeId: form.leaveTypeId,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason || `Leave applied by HR on behalf of ${selectedEmployee.firstName} ${selectedEmployee.lastName}`,
          halfDay: form.halfDay,
          halfDaySlot: form.halfDay ? form.halfDaySlot : null,
          // Approval + notification options
          skipApproval: skipApproval,
          notifyEmail: notifySpecificPerson ? (notifyEmail || notifyEmployee?.email || '') : '',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');

      const approvalNote = skipApproval ? ' (Auto-approved — approval skipped)' : (d.autoApproval?.applied ? ' (Auto-approved)' : '');
      const notifyNote = (notifySpecificPerson && (notifyEmail || notifyEmployee?.email)) ? ` — notification sent to ${notifyEmail || notifyEmployee?.email}` : '';
      toast.success(`Leave applied successfully for ${selectedEmployee.firstName} ${selectedEmployee.lastName}${approvalNote}${d.days !== undefined ? ` — ${d.days} working day(s) counted` : ''}${notifyNote}`);
      setForm({
        leaveTypeId: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        reason: '',
        halfDay: false,
        halfDaySlot: 'first_half',
      });
      // Reset approval + notification options
      setSkipApproval(false);
      setNotifySpecificPerson(false);
      setNotifyEmail('');
      setNotifyEmployee(null);
      setNotifySearch('');
      setNotifyResults([]);
      fetchLeaveData(selectedEmployee);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply leave');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Get balance for selected leave type ───────
  const selectedLeaveBalance = leaveBalances.find(b => b.leaveType.id === form.leaveTypeId);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FiUsers className="w-6 h-6 text-teal-500" />
          Apply Leave by HR
        </h1>
        <p className="text-sm text-slate-500 mt-1">Apply leave on behalf of employees · View balances · Track recent requests</p>
      </div>

      {/* Info Banner */}
      <div className="thb-card p-4 border-l-4 border-l-teal-500 bg-teal-50/30">
        <div className="flex items-start gap-3">
          <FiAlertCircle className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-teal-800">HR Proxy Application</p>
            <p className="text-xs text-teal-700 mt-1">Leave applied through this page will be recorded as submitted on behalf of the selected employee. Standard approval workflows and AI auto-approval rules will still apply.</p>
          </div>
        </div>
      </div>

      {/* Employee Selection */}
      <div className="thb-card p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <FiUsers className="w-5 h-5 text-teal-500" />
          Select Employee
        </h2>
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={employeeSearch}
            onChange={(e) => {
              const value = e.target.value;
              setEmployeeSearch(value);
              setShowEmployeeDropdown(true);
              if (value.trim().length < 2) {
                setEmployees([]);
                setLoadingEmployees(false);
              }
            }}
            onFocus={() => setShowEmployeeDropdown(true)}
            placeholder="Search by name, employee ID, or email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
          />

          {/* Employee Dropdown */}
          {showEmployeeDropdown && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
              {loadingEmployees ? (
                <div className="p-4 text-center text-sm text-slate-500">Loading...</div>
              ) : employees.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">
                  {employeeSearch.trim().length < 2 ? 'Type at least 2 characters to search employees' : 'No employees found'}
                </div>
              ) : employees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => handleSelectEmployee(emp)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-teal-50 transition-colors ${
                    selectedEmployee?.id === emp.id ? 'bg-teal-50 text-teal-700' : 'text-slate-700'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{emp.firstName} {emp.lastName}</p>
                    <p className="text-xs text-slate-400 truncate">{emp.employeeId} · {emp.department?.name || 'No Dept'} · {emp.designation?.title || 'No Desg'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Employee Card */}
        {selectedEmployee && (
          <div className="mt-4 p-4 bg-teal-50/40 border border-teal-200 rounded-lg flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {selectedEmployee.firstName[0]}{selectedEmployee.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800">{selectedEmployee.firstName} {selectedEmployee.lastName}</p>
              <p className="text-xs text-slate-500">{selectedEmployee.employeeId} · {selectedEmployee.email}</p>
              <p className="text-xs text-slate-400">{selectedEmployee.department?.name || 'No Department'} · {selectedEmployee.designation?.title || 'No Designation'}</p>
            </div>
            <button
              onClick={() => { setSelectedEmployee(null); setLeaveTypes([]); setLeaveBalances([]); setRecentRequests([]); }}
              className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Leave Application Form — shown only after employee selection */}
      {selectedEmployee && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 thb-card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <FiCalendar className="w-5 h-5 text-teal-500" />
              Apply Leave for {selectedEmployee.firstName}
            </h2>

            {loadingLeaveData ? (
              <div className="flex items-center justify-center py-12">
                <FiRefreshCw className="w-6 h-6 text-teal-500 animate-spin" />
                <span className="ml-3 text-sm text-slate-500">Loading leave data...</span>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Leave Type */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Leave Type <span className="text-red-500 font-bold">*</span></label>
                  <select
                    value={form.leaveTypeId}
                    onChange={e => setForm({ ...form, leaveTypeId: e.target.value })}
                    className="3boxes-input w-full"
                  >
                    <option value="">-- Select Leave Type --</option>
                    {leaveTypes.map(lt => (
                      <option key={lt.id} value={lt.id}>{lt.name} ({lt.code}) {lt.isPaid ? '— Paid' : '— Unpaid'}</option>
                    ))}
                  </select>
                </div>

                {/* Balance Info */}
                {selectedLeaveBalance && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-4">
                    <FiCheck className="w-4 h-4 text-blue-600" />
                    <div className="text-xs text-blue-700">
                      <span className="font-medium">{selectedLeaveBalance.leaveType.name}</span> Balance:
                      Total <strong>{selectedLeaveBalance.total}</strong> ·
                      Used <strong>{selectedLeaveBalance.used}</strong> ·
                      Remaining <strong className="text-blue-900">{selectedLeaveBalance.remaining}</strong>
                    </div>
                  </div>
                )}

                {/* Date Range */}
                {/* BUG_130 FIX: date format helper text shows DD-MMM-YYYY so day/month is unambiguous. */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Start Date <span className="text-red-500 font-bold">*</span></label>
                    {/* BUG_131 FIX: HR can select past dates — no min attribute. */}
                    <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="3boxes-input w-full" />
                    {form.startDate && <p className="text-[10px] text-slate-400 mt-0.5">{new Date(form.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">End Date <span className="text-red-500 font-bold">*</span></label>
                    <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} min={form.startDate} className="3boxes-input w-full" />
                    {form.endDate && <p className="text-[10px] text-slate-400 mt-0.5">{new Date(form.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
                  </div>
                </div>

                {/* Days Count */}
                {form.startDate && form.endDate && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2">
                    <FiClock className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-700">Duration: <strong>{calculateDays()} working day{calculateDays() !== 1 ? 's' : ''}</strong> <span className="text-xs text-slate-400">(weekends & holidays excluded)</span></span>
                  </div>
                )}

                {/* Half Day */}
                {/* BUG_123/132/133 FIX: Half Day disabled for multi-day ranges — half day only makes sense for a single day. */}
                <div className="flex items-center gap-4">
                  <label className={`flex items-center gap-2 ${(form.startDate && form.endDate && form.startDate !== form.endDate) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={form.halfDay} onChange={e => setForm({ ...form, halfDay: e.target.checked })} disabled={form.startDate && form.endDate && form.startDate !== form.endDate} className="w-4 h-4 text-teal-500 rounded border-slate-300 focus:ring-teal-500 disabled:cursor-not-allowed" />
                    <span className="text-sm text-slate-700">Half Day {form.startDate && form.endDate && form.startDate !== form.endDate && <span className="text-[10px] text-slate-400">(only for single-day leave)</span>}</span>
                  </label>
                  {form.halfDay && (
                    <select value={form.halfDaySlot} onChange={e => setForm({ ...form, halfDaySlot: e.target.value })} className="3boxes-input text-sm">
                      <option value="first_half">First Half</option>
                      <option value="second_half">Second Half</option>
                    </select>
                  )}
                </div>

                {/* Reason */}
                {/* BUG_134 FIX: max length 1000 chars + char counter. */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Reason <span className="text-[10px] text-slate-400">({form.reason.length}/1000)</span></label>
                  <textarea
                    value={form.reason}
                    onChange={e => setForm({ ...form, reason: e.target.value.slice(0, 1000) })}
                    rows={3}
                    maxLength={1000}
                    className="3boxes-input w-full resize-none"
                    placeholder="Reason for leave (optional — auto-filled if left blank)"
                  />
                </div>

                {/* ─── Approval & Notification Options ─── */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-700">Approval &amp; Notification</p>

                  {/* Skip approval checkbox */}
                  <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={skipApproval}
                      onChange={e => setSkipApproval(e.target.checked)}
                      className="w-4 h-4 mt-0.5 text-teal-500 rounded border-slate-300 focus:ring-teal-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-slate-700">Skip approval (auto-approve)</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">The leave will be approved immediately — no manager approval needed. Balance is deducted right away.</p>
                    </div>
                  </label>

                  {/* Notify specific person checkbox */}
                  <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={notifySpecificPerson}
                      onChange={e => { setNotifySpecificPerson(e.target.checked); if (!e.target.checked) { setNotifyEmail(''); setNotifyEmployee(null); setNotifySearch(''); setNotifyResults([]); } }}
                      className="w-4 h-4 mt-0.5 text-teal-500 rounded border-slate-300 focus:ring-teal-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-slate-700">Notify only a specific person</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">Send an email notification to a specific employee instead of the default approver chain.</p>
                    </div>
                  </label>

                  {/* Notify person search — shown only when notifySpecificPerson is checked */}
                  {notifySpecificPerson && (
                    <div className="ml-6 space-y-2">
                      <div className="relative">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={notifySearch}
                          onChange={(e) => { setNotifySearch(e.target.value); setNotifyDropdown(true); }}
                          onFocus={() => setNotifyDropdown(true)}
                          placeholder="Search employee to notify (name, email, or ID)..."
                          className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
                        />
                        {notifyDropdown && notifyResults.length > 0 && (
                          <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-50">
                            {notifyResults.map(emp => (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => {
                                  setNotifyEmployee(emp);
                                  setNotifyEmail(emp.email);
                                  setNotifySearch(`${emp.firstName} ${emp.lastName} (${emp.email})`);
                                  setNotifyDropdown(false);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-teal-50 transition-colors border-b border-slate-50 last:border-0"
                              >
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                  {emp.firstName[0]}{emp.lastName[0]}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-700 truncate">{emp.firstName} {emp.lastName}</p>
                                  <p className="text-[10px] text-slate-400 truncate">{emp.email}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Manual email entry fallback */}
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">Or enter an email directly:</label>
                        <input
                          type="email"
                          value={notifyEmail}
                          onChange={e => { setNotifyEmail(e.target.value); setNotifyEmployee(null); }}
                          placeholder="person@company.com"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
                        />
                      </div>
                      {notifyEmail && (
                        <p className="text-[11px] text-teal-600 flex items-center gap-1">
                          <FiCheck className="w-3 h-3" /> Notification will be sent to: <strong>{notifyEmail}</strong>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !form.leaveTypeId}
                    className="3boxes-btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiPlus className="w-4 h-4" />}
                    Apply Leave for {selectedEmployee.firstName}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar: Balances & Recent Requests */}
          <div className="space-y-6">
            {/* Leave Balances */}
            <div className="thb-card p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <FiFileText className="w-4 h-4 text-teal-500" />
                Leave Balances
              </h3>
              {leaveBalances.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No balances found</p>
              ) : (
                <div className="space-y-2.5">
                  {leaveBalances.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{b.leaveType.name}</p>
                        <p className="text-[10px] text-slate-400">Used {b.used} of {b.total}</p>
                      </div>
                      <span className={`text-sm font-bold ${b.remaining > 0 ? 'text-teal-600' : 'text-red-500'}`}>{b.remaining}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Requests */}
            <div className="thb-card p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <FiClock className="w-4 h-4 text-slate-500" />
                Recent Requests
              </h3>
              {recentRequests.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No recent requests</p>
              ) : (
                <div className="space-y-2.5">
                  {recentRequests.map(req => (
                    <div key={req.id} className="p-2.5 bg-slate-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-700">{req.leaveType?.name || 'Leave'}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          req.status === 'approved' ? 'bg-green-100 text-green-700' :
                          req.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          req.status === 'cancelled' ? 'bg-slate-100 text-slate-600' :
                          'bg-amber-100 text-amber-700'
                        }`}>{req.status}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(req.startDate)} — {fmtDate(req.endDate)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Task 135 — Attendance & Regularizations */}
            <div className="thb-card p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <FiCalendar className="w-4 h-4 text-cyan-500" />
                Attendance &amp; Regularizations
              </h3>
              {attendanceContext && attendanceContext.pendingByType.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {attendanceContext.pendingByType.map(p => (
                    <span key={p.type} className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
                      {p.type}: {p.count} pending{p.latestDate ? ` · ${p.latestDate}` : ''}
                    </span>
                  ))}
                </div>
              )}
              {!attendanceContext || attendanceContext.regularizations.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">No regularizations on record</p>
              ) : (
                <div className="space-y-2">
                  {attendanceContext.regularizations.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{r.date}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{r.punchType}</p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        r.status === 'approved' ? 'bg-green-100 text-green-700' :
                        r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        r.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{r.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Team Leave Calendar sidebar — same as Apply Leave form */}
            <TeamLeaveSidebar
              startDate={form.startDate}
              endDate={form.endDate}
              scopeQuery={scopeQuery()}
              employeeId={selectedEmployee?.id}
              onDateSelect={(date) => {
                setForm(prev => {
                  if (!prev.startDate || (prev.startDate && prev.endDate)) {
                    return { ...prev, startDate: date, endDate: '' };
                  }
                  if (date < prev.startDate) {
                    return { ...prev, startDate: date, endDate: prev.startDate };
                  }
                  return { ...prev, endDate: date };
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
