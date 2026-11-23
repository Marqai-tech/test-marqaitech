'use client';

import { useEffect, useState, useCallback, Suspense, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FiCalendar, FiPlus, FiCheck, FiX, FiClock, FiAlertCircle, FiArrowLeft,
  FiChevronRight, FiUpload, FiFileText, FiInfo, FiLoader, FiShield,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import ApproverChainPreview from '@/components/ApproverChainPreview';
import { normalizeLeaveBalances } from '@/lib/leave-balance-rules';

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getDaysBetween(start: string, end: string, holidayDates: Set<string> = new Set()) {
  const startDate = (start || '').split('T')[0]; const endDate = (end || '').split('T')[0];
  const s = new Date(`${startDate}T00:00:00Z`); const e = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  let count = 0; const cursor = new Date(s.getTime()); let guard = 0;
  while (cursor <= e && guard < 4000) {
    guard++; const dow = cursor.getUTCDay(); const dateStr = cursor.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function fmtNum(n: number) {
  if (Number.isInteger(n)) return String(n);
  return Number(n.toFixed(2)).toString();
}

function isActiveProbation(emp: { employeeStatus?: string; dateOfJoining?: string | null } | null) {
  if (!emp?.employeeStatus?.toLowerCase().includes('probation') || !emp.dateOfJoining) return false;
  const end = new Date(emp.dateOfJoining); end.setMonth(end.getMonth() + 6);
  return end.getTime() > Date.now();
}

/* Leave-type color theme (CL=emerald, SL=indigo-blue, EL=amber, C-Off=teal, ML=pink, LOP=red) */
function getLeaveTheme(code?: string, name?: string) {
  const c = (code || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (c.includes('c-off') || c.includes('coff') || c.includes('comp') || n.includes('compensatory')) return { color: '#14b8a6', soft: '#f0fdfa' };
  if (c === 'cl' || c.startsWith('cl') || n.includes('casual')) return { color: '#10b981', soft: '#ecfdf5' };
  if (c === 'sl' || c.startsWith('sl') || n.includes('sick')) return { color: '#4f6bf6', soft: '#eef2ff' };
  if (c === 'el' || c.startsWith('el') || n.includes('earned')) return { color: '#f59e0b', soft: '#fffbeb' };
  if (c === 'ml' || n.includes('maternity')) return { color: '#ec4899', soft: '#fdf2f8' };
  if (c === 'pl' || n.includes('paternity')) return { color: '#8b5cf6', soft: '#f5f3ff' };
  if (c.includes('lop') || n.includes('loss of pay')) return { color: '#ef4444', soft: '#fef2f2' };
  return { color: '#64748b', soft: '#f1f5f9' };
}

/* ── Types ── */
interface LeaveType { id: string; name: string; code: string; defaultDays: number; isPaid: boolean; }
interface LeaveBalance { id: string; total: number; used: number; remaining: number; year: number; leaveType: { id: string; name: string; code: string }; }
interface Employee {
  id: string; employeeId: string; firstName: string; lastName: string; employeeStatus?: string;
  dateOfJoining?: string | null; gender?: string | null;
  employmentType?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  leavePolicyId?: string | null;
  reportingManager?: { id: string; firstName: string; lastName: string } | null;
  leaveBalances?: LeaveBalance[];
}
interface Holiday { id: string; name: string; date: string; type?: string }

type Session = 'Full day' | 'First half' | 'Second half';
interface FormState {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  session: Session;
  reason: string;
  fileName: string | null;
}

const initialForm: FormState = {
  leaveTypeId: '',
  startDate: '',
  endDate: '',
  session: 'Full day',
  reason: '',
  fileName: null,
};

/* ── System Check type ── */
type CheckState = 'ok' | 'err' | 'warn' | 'idle';
interface Check {
  label: string;
  state: CheckState;
  msg?: string | null;
  code?: string | null;
}

/* ── Component ── */
function ApplyLeaveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);
  const selectedCompanyId = useCompanyContextStore(s => s.selectedCompanyId);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [ownLeaves, setOwnLeaves] = useState<any[]>([]);
  const [teamConflicts, setTeamConflicts] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [triedSubmit, setTriedSubmit] = useState(false);
  // User-facing warning when the employee has a leave policy attached but
  // it has no leave types configured (or the policy was deleted). Empty
  // string = no warning. Surfaced so HR/employee knows exactly what to fix
  // instead of staring at an empty dropdown.
  const [policyWarning, setPolicyWarning] = useState<string>('');

  const typeParam = searchParams.get('type');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const headers = getAuthHeaders();
        const sq = scopeQuery();
        const [ltRes, empRes, balRes, holRes, ownRes, ruleRes] = await Promise.all([
          fetch(`/api/leave-types?limit=100`, { headers }),
          fetch(`/api/employees?limit=1&own=1&includePhotos=0${sq ? `&${sq}` : ''}`, { headers }),
          fetch(`/api/leave/balance?limit=50${sq ? `&${sq}` : ''}`, { headers }).catch(() => null),
          fetch(`/api/holidays${sq ? `?${sq}` : ''}`, { headers }).catch(() => null),
          fetch(`/api/leave?view=self&limit=100${sq ? `&${sq}` : ''}`, { headers }).catch(() => null),
          fetch(`/api/leave-policy-rules?limit=100`, { headers }).catch(() => null),
        ]);
        if (ruleRes?.ok) { const rd = await ruleRes.json(); setRules(rd.data || []); }
        const ltData = await ltRes.json();
        let activeTypes = (ltData.data || []).filter((t: any) => t.status === 'active' || t.status === undefined);
        setLeaveTypes(activeTypes);
        const empData = await empRes.json();
        const myEmp = empData.employees?.find((e: any) => e.email === user?.email || e.userId === user?.id || (user?.employee?.id && e.id === user.employee.id)) || null;
        if (myEmp) setEmployee(myEmp);

        // ─── Policy-based leave type filtering ───
        // Fetch policies + mappings for this employee's company.
        // Find which policy applies to this employee (by empStatus, branch, dept).
        // Show only the leave types that are in that policy's leaveTypeIds
        // OR that have an active mapping matching the employee.
        if (myEmp) {
          try {
            const sep = sq ? `&${sq}` : '';
            const [polRes, mapRes] = await Promise.all([
              fetch(`/api/policies?category=leave&limit=100${sep ? `&${sq}` : ''}`, { headers }).catch(() => null),
              fetch(`/api/leave-type-policy-mappings?includeInactive=1${sep ? `&${sq}` : ''}`, { headers }).catch(() => null),
            ]);

            // Collect allowed leave type IDs from:
            // 1. Employee.leavePolicyId — direct attachment (set in the
            //    Employee add/edit form's "Leave Policy" dropdown). This
            //    OVERRIDES scope-based matching: if HR explicitly attached
            //    a policy to this employee, its leave types must show up
            //    regardless of empStatus / branch / dept scope filters.
            // 2. Policy.leaveTypeIds — matched by empStatus / branch / dept
            // 3. LeaveTypePolicyMapping rows where the employee matches the mapping's scope
            const allowedLeaveTypeIds = new Set<string>();
            let hasPolicyFilter = false;
            const parseJson = (v: any): string[] => { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; } };

            // Source 1: Policy table's leaveTypeIds field
            if (polRes?.ok) {
              const polData = await polRes.json();
              const policies = polData.policies || polData.data || [];

              // ─── Direct attachment: Employee.leavePolicyId ───
              // Takes priority over scope matching. If HR pinned a policy
              // to this employee in the Employee add/edit form, that
              // policy's leave types are shown regardless of scope.
              if (myEmp.leavePolicyId) {
                const attachedPolicy = policies.find((p: any) => p.id === myEmp.leavePolicyId);
                if (attachedPolicy && attachedPolicy.status === 'active') {
                  const ltIds = parseJson(attachedPolicy.leaveTypeIds);
                  if (ltIds.length > 0) {
                    hasPolicyFilter = true;
                    ltIds.forEach((id: string) => allowedLeaveTypeIds.add(id));
                    console.log(`[apply-leave] Direct policy attachment: employee.leavePolicyId=${myEmp.leavePolicyId} → ${ltIds.length} leave type(s) added (scope bypassed).`);
                  } else {
                    // Policy is attached + active but has NO leave types configured
                    // (leaveTypeIds is null/empty). This is the most common cause of
                    // "I attached a policy but the employee sees no leave types" —
                    // surface it so HR/employee knows exactly what to fix.
                    hasPolicyFilter = true; // still enforce the filter → empty dropdown
                    console.warn(`[apply-leave] Direct policy attachment: policy "${attachedPolicy.title}" (id=${myEmp.leavePolicyId}) is attached to this employee but has NO leaveTypeIds configured. HR must open Leave Setup → Policy Form → Leave Types section and pick the leave types for this policy.`);
                    setPolicyWarning(`Your leave policy "${attachedPolicy.title}" is attached but has no leave types configured. Please ask HR to open Leave Setup → Policy Form → select this policy → pick leave types in the "Leave Types" section.`);
                  }
                } else {
                  console.warn(`[apply-leave] Direct policy attachment: employee.leavePolicyId=${myEmp.leavePolicyId} not found in active leave policies (policies seen: ${policies.length}). The policy may have been deleted or deactivated.`);
                  setPolicyWarning(`Your attached leave policy could not be found (it may have been deleted or deactivated). Please ask HR to reattach a valid leave policy from the Employee profile.`);
                }
              }

              for (const p of policies) {
                if (p.status !== 'active') continue;
                // Skip the directly-attached policy here — already handled above
                if (myEmp.leavePolicyId && p.id === myEmp.leavePolicyId) continue;

                // Check if this policy applies to the employee
                // Parse scope fields from the policy (stored as JSON arrays in runtime columns)
                const empStatuses = parseJson(p.empStatus);
                const branchIds = parseJson(p.branchIds);
                const deptIds = parseJson(p.departmentIds);

                // Match: if empStatus is set, employee's status must be in it
                let matches = true;
                if (empStatuses.length > 0 && !empStatuses.map((s: string) => s.toLowerCase()).includes('all')) {
                  const empStatus = (myEmp.employeeStatus || '').toLowerCase();
                  if (empStatus && !empStatuses.map((s: string) => s.toLowerCase()).includes(empStatus)) matches = false;
                }
                // Match: if branchIds is set, employee's branch must be in it
                if (matches && branchIds.length > 0 && myEmp.branchId && !branchIds.includes(myEmp.branchId)) matches = false;
                // Match: if deptIds is set, employee's dept must be in it
                if (matches && deptIds.length > 0 && myEmp.departmentId && !deptIds.includes(myEmp.departmentId)) matches = false;

                if (matches) {
                  const ltIds = parseJson(p.leaveTypeIds);
                  if (ltIds.length > 0) {
                    hasPolicyFilter = true;
                    ltIds.forEach((id: string) => allowedLeaveTypeIds.add(id));
                  }
                }
              }
            }

            // Source 2: LeaveTypePolicyMapping rows
            if (mapRes?.ok) {
              const mapData = await mapRes.json();
              const mappings = mapData.data || [];
              if (mappings.length > 0) {
                hasPolicyFilter = true; // mappings exist → enforce them
                for (const m of mappings) {
                  if (m.status !== 'active') continue;
                  // Check if the employee matches the mapping's scope
                  const empType = m.employmentType || 'all';
                  if (empType !== 'all' && myEmp.employmentType && myEmp.employmentType !== empType.replace(/-/g, '_') && myEmp.employmentType !== empType) continue;
                  if (m.branchId && myEmp.branchId !== m.branchId) continue;
                  if (m.departmentId && myEmp.departmentId !== m.departmentId) continue;
                  const gender = (m.genderApplicability || 'all').toLowerCase();
                  if (gender !== 'all' && gender !== 'both' && myEmp.gender && myEmp.gender.toLowerCase() !== gender) continue;
                  // Employee matches → add the leave type to allowed set
                  allowedLeaveTypeIds.add(m.leaveTypeId);
                }
              }
            }

            // If we found policy/mapping data AND the employee matched at least one,
            // filter the leave types to only show allowed ones.
            // If the employee matched NONE, fall back to showing all types.
            if (hasPolicyFilter && allowedLeaveTypeIds.size > 0) {
              // First try filtering from the already-fetched types
              let filtered = activeTypes.filter((t: any) => allowedLeaveTypeIds.has(t.id));
              // If the API returned 0 types (due to company scope filtering),
              // fetch each leave type by ID directly using the [id] endpoint
              if (filtered.length === 0) {
                console.log('[apply-leave] API returned 0 types, fetching by ID from policy leaveTypeIds...');
                const ids = Array.from(allowedLeaveTypeIds);
                const results = await Promise.all(
                  ids.map(id => fetch(`/api/leave-types/${id}`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null))
                );
                filtered = results
                  .filter((r: any) => r && (r.status === 'active' || r.status === undefined))
                  .map((r: any) => r.leaveType || r);
                console.log(`[apply-leave] Fetched ${filtered.length} leave types by ID from policy.`);
              }
              activeTypes = filtered;
              setLeaveTypes(activeTypes);
              console.log(`[apply-leave] Policy filter: employee sees ${activeTypes.length} leave types (from ${allowedLeaveTypeIds.size} allowed IDs).`);
            }
          } catch (e) {
            console.warn('[apply-leave] Policy filter failed (non-fatal):', e);
          }
        }

        if (balRes?.ok) {
          const balData = await balRes.json();
          const probation = isActiveProbation(myEmp);
          const normalized = normalizeLeaveBalances(balData.balances || [], { gender: myEmp?.gender || balData?.gender, probation });
          setLeaveBalances(normalized);
        }
        if (holRes?.ok) {
          const holData = await holRes.json();
          setHolidays(holData.data || []);
        }
        if (ownRes?.ok) {
          const ownData = await ownRes.json();
          setOwnLeaves(ownData.leaveRequests || []);
        }
        // Pre-select type from URL ?type=CL
        if (typeParam) {
          const lt = activeTypes.find((t: any) => t.code === typeParam || t.id === typeParam);
          if (lt) setForm(f => ({ ...f, leaveTypeId: lt.id }));
        }
      } catch {
        toast.error('Leave data could not be loaded. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user?.email, scopeQuery, selectedTenantId, selectedCompanyId, typeParam]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      const v = value as string | null;
      // Auto-set "To" date = "From" if session becomes half-day
      if (key === 'session' && v !== 'Full day') {
        next.endDate = prev.startDate;
      }
      // Keep "To" >= "From"
      if (key === 'startDate' && typeof v === 'string' && (!prev.endDate || prev.endDate < v)) {
        next.endDate = v;
      }
      return next;
    });
  }, []);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const isHalfDay = form.session !== 'Full day';
  const selectedType = leaveTypes.find(t => t.id === form.leaveTypeId);
  const selectedBalance = leaveBalances.find(b => b.leaveType.id === form.leaveTypeId);

  // ─── Compute leave type info from rule + policy tables ───
  // When a leave type is selected, find the matching rule (entitledDaysPerYear)
  // and count how many days the employee has already taken.
  const selectedRule = rules.find((r: any) => r.leaveTypeId === form.leaveTypeId && r.status === 'active');
  const entitledDays = selectedRule?.entitledDaysPerYear || selectedBalance?.total || selectedType?.defaultDays || 0;
  const takenDays = ownLeaves
    .filter((l: any) => l.leaveTypeId === form.leaveTypeId && (l.status === 'approved' || l.status === 'pending'))
    .reduce((sum: number, l: any) => sum + (l.chargeableDays || l.days || 0), 0);
  const remainingDays = Math.max(0, entitledDays - takenDays);

  /* ── Fetch team leave conflicts when dates change ── */
  useEffect(() => {
    if (!form.startDate || !form.endDate) { setTeamConflicts([]); return; }
    const sq = scopeQuery();
    const headers = getAuthHeaders();
    // Fetch all leave requests overlapping the selected date range (excluding own rejected/cancelled)
    fetch(`/api/leave?limit=100&fromDate=${form.startDate}&toDate=${form.endDate}${sq ? `&${sq}` : ''}`, { headers })
      .then(r => r.ok ? r.json() : { leaveRequests: [] })
      .then(d => {
        const conflicts = (d.leaveRequests || [])
          .filter((l: any) => l.status === 'approved' || l.status === 'pending')
          .filter((l: any) => l.employeeId !== employee?.id && l.employee?.userId !== user?.id);
        setTeamConflicts(conflicts);
      })
      .catch(() => setTeamConflicts([]));
  }, [form.startDate, form.endDate, employee?.id, user?.id, scopeQuery]);

  /* ── Calculate days and balance preview ── */
  const calc = (() => {
    if (!form.startDate || !form.endDate) return { days: 0, sandwichDays: 0, available: 0, lop: 0, afterApproval: 0 };
    const holidaySet: Set<string> = new Set(holidays.map((h: Holiday) => new Date(h.date).toISOString().split('T')[0]));
    const workingDays = getDaysBetween(form.startDate, form.endDate, holidaySet);
    const days = isHalfDay ? 0.5 : workingDays;
    const available = selectedBalance ? Math.max(0, (selectedBalance.total || 0) - (selectedBalance.used || 0)) : (selectedType?.defaultDays || 0);
    const isLopType = (selectedType?.code || '').toLowerCase().includes('lop') || (selectedType?.name || '').toLowerCase().includes('loss of pay');
    const lop = !isLopType ? Math.max(0, days - available) : 0;
    const afterApproval = isLopType ? available : Math.max(0, available - days);
    // Sandwich days = weekend/holiday days in range
    const s = new Date(`${form.startDate}T00:00:00Z`); const e = new Date(`${form.endDate}T00:00:00Z`);
    let sandwich = 0; const c = new Date(s); let g = 0;
    while (c <= e && g < 400) { g++; const dow = c.getUTCDay(); const dk = c.toISOString().split('T')[0]; if ((dow === 0 || dow === 6 || holidaySet.has(dk))) sandwich++; c.setUTCDate(c.getUTCDate() + 1); }
    return { days, sandwichDays: sandwich, available, lop, afterApproval };
  })();

  /* ── 11 System checks (live evaluation) ── */
  const checks: Check[] = (() => {
    const filled = !!(form.leaveTypeId && form.startDate && form.endDate && form.reason.trim());
    const out: Check[] = [];
    const push = (label: string, state: CheckState, msg?: string | null, code?: string | null) => out.push({ label, state, msg, code });

    push('Required fields filled', filled ? 'ok' : 'idle', filled ? null : 'Leave type, dates and reason are mandatory.');

    if (!selectedType || !form.startDate || !form.endDate) {
      ['Leave type allowed for employee', 'Applied early enough (notice)', 'Within minimum & maximum days', 'Half-day allowed', 'Document attached when required', 'Back-date limit', 'Service days required', 'Sufficient balance (or LOP)', 'No overlap with existing leave', 'Sandwich & clubbing rules']
        .forEach(l => push(l, 'idle'));
      return out;
    }

    push('Leave type allowed for employee', 'ok', `${selectedType.name} is in your leave profile.`);

    const leadDays = Math.floor((new Date(form.startDate).getTime() - Date.now()) / 86_400_000);
    push('Applied early enough (notice)', leadDays >= 0 ? 'ok' : 'warn', leadDays >= 0 ? 'No advance notice needed.' : `Back-dated by ${Math.abs(leadDays)} day(s).`);

    if (calc.days === 0) push('Within minimum & maximum days', 'err', 'No leave day in selected dates.', 'LV-E17');
    else push('Within minimum & maximum days', 'ok', `${fmtNum(calc.days)} day(s) selected.`);

    push('Half-day allowed', isHalfDay ? 'ok' : 'ok', isHalfDay ? `${form.session} selected.` : 'Full-day request.');

    const needDoc = (selectedType.code || '').toLowerCase().includes('sl') || (selectedType.name || '').toLowerCase().includes('sick');
    push('Document attached when required', !needDoc || calc.days <= 3 || !!form.fileName ? 'ok' : 'warn',
      needDoc && calc.days > 3 ? (form.fileName ? 'Document attached.' : 'Medical certificate recommended for > 3 days.') : 'No document needed for this duration.');

    const backDays = Math.floor((Date.now() - new Date(form.startDate).getTime()) / 86_400_000);
    push('Back-date limit', backDays <= 31 ? (backDays > 0 ? 'warn' : 'ok') : 'err',
      backDays > 0 ? (backDays <= 31 ? `Back-dated by ${backDays} day(s) — allowed within 31.` : 'Beyond 31-day back-date limit.') : 'Future-dated request.',
      backDays > 31 ? 'LV-E05' : null);

    push('Service days required', 'ok', employee?.dateOfJoining ? `Service since ${new Date(employee.dateOfJoining).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}.` : 'Not applicable.');

    push('Sufficient balance (or LOP)', calc.lop === 0 ? 'ok' : 'warn',
      calc.lop === 0 ? `${fmtNum(calc.available)} day(s) available.` : `${fmtNum(calc.lop)} day(s) will be LOP.`);

    // Overlap check
    const overlap = ownLeaves.find((r: any) => (r.status === 'pending' || r.status === 'approved') &&
      !(form.endDate < (r.startDate || '').split('T')[0] || form.startDate > (r.endDate || '').split('T')[0]));
    push('No overlap with existing leave', overlap ? 'err' : 'ok', overlap ? 'You already have leave in the selected dates.' : 'No clash.', overlap ? 'LV-E07' : null);

    push('Sandwich & clubbing rules', calc.sandwichDays > 0 ? 'warn' : 'ok',
      calc.sandwichDays > 0 ? `${calc.sandwichDays} weekly-off/holiday day(s) in range.` : 'Not triggered.');

    return out;
  })();

  const passedCount = checks.filter(c => c.state === 'ok' || c.state === 'warn').length;
  const hasError = checks.some(c => c.state === 'err');
  const hasIdle = checks.some(c => c.state === 'idle');
  const canSubmit = !hasIdle && !hasError && !!form.leaveTypeId && !!form.startDate && !!form.endDate && form.reason.trim().length >= 3;

  /* ── Submit handler ── */
  const handleSubmit = async () => {
    setTriedSubmit(true);
    if (!canSubmit) {
      toast.error('Please fix the errors before submitting.');
      return;
    }
    if (!employee?.id) {
      toast.error('Employee record not found');
      return;
    }
    setSubmitting(true);
    try {
      const isHalf = form.session !== 'Full day';
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: employee.id,
          leaveTypeId: form.leaveTypeId,
          startDate: form.startDate,
          endDate: isHalf ? form.startDate : form.endDate,
          reason: form.reason.trim(),
          halfDay: isHalf,
          halfDaySlot: isHalf ? (form.session === 'First half' ? 'first_half' : 'second_half') : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to submit');
      toast.success(`Leave request submitted · manager notified`);
      router.push('/leave');
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    set('fileName', file ? file.name : null);
  };

  const managerName = employee?.reportingManager
    ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`.trim()
    : 'Reporting Manager';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — drawer-style */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => router.push('/leave')} className="w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 inline-flex items-center justify-center flex-shrink-0" aria-label="Close">
              <FiX className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-400 mb-0.5">Leave › Apply Leave</p>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Apply leave</h2>
            </div>
          </div>
        </div>

        {/* Body — 2-column drawer-style layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Left form panel */}
          <div className="p-5 lg:p-6 space-y-5">
            {/* Policy warning — shown when the employee has a leave policy
                attached but it has no leave types configured (or the policy
                was deleted). Tells HR/employee exactly what to fix. */}
            {policyWarning && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                <FiAlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-[12px] leading-relaxed">{policyWarning}</p>
              </div>
            )}
            {/* Leave type — dropdown select */}
            <div>
              <label className="flex items-baseline gap-1 text-[12.5px] font-semibold text-slate-700 mb-2">
                Leave type <span className="text-red-500">*</span>
              </label>
              {leaveTypes.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No leave types configured.</p>
              ) : (
                <select
                  value={form.leaveTypeId}
                  onChange={e => set('leaveTypeId', e.target.value)}
                  className="w-full h-[38px] px-3 rounded-[9px] border border-slate-200 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                >
                  <option value="">— Select leave type —</option>
                  {leaveTypes.map(lt => {
                    const bal = leaveBalances.find(b => b.leaveType.id === lt.id);
                    const available = bal ? Math.max(0, (bal.total || 0) - (bal.used || 0)) : lt.defaultDays || 0;
                    return (
                      <option key={lt.id} value={lt.id}>
                        {lt.code} — {lt.name} ({fmtNum(available)} avail.)
                      </option>
                    );
                  })}
                </select>
              )}
              {/* Show selected leave type info — from rule table + employee's taken leave */}
              {selectedType && (
                <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs font-extrabold px-1.5 py-0.5 rounded" style={{ color: getLeaveTheme(selectedType.code, selectedType.name).color, backgroundColor: getLeaveTheme(selectedType.code, selectedType.name).soft }}>
                      {selectedType.code}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{selectedType.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center bg-white rounded-lg p-2 border border-slate-100">
                      <p className="text-lg font-extrabold text-slate-900">{fmtNum(entitledDays)}</p>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Entitled / Year</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-2 border border-slate-100">
                      <p className="text-lg font-extrabold text-amber-600">{fmtNum(takenDays)}</p>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Taken</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-2 border border-slate-100">
                      <p className="text-lg font-extrabold text-emerald-600">{fmtNum(remainingDays)}</p>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Remaining</p>
                    </div>
                  </div>
                  {selectedRule && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      {selectedRule.advanceNoticeDays > 0 && <span>Notice: {selectedRule.advanceNoticeDays}d</span>}
                      {selectedRule.halfDayAllowed !== false && <span>Half-day: Yes</span>}
                      {selectedRule.carryForwardToNextYear && <span>Carry forward: Yes</span>}
                      {selectedRule.minDaysPerRequest > 0 && <span>Min: {selectedRule.minDaysPerRequest}d</span>}
                      {selectedRule.maxDaysPerRequest > 0 && <span>Max: {selectedRule.maxDaysPerRequest}d</span>}
                      {selectedRule.gender && selectedRule.gender !== 'both' && selectedRule.gender !== 'all' && <span>Gender: {selectedRule.gender}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* From / To dates — 2 columns */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-baseline gap-1 text-[12.5px] font-semibold text-slate-700 mb-1.5">
                  From date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => set('startDate', e.target.value)}
                  className="w-full h-[38px] px-3 rounded-[9px] border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="flex items-baseline gap-1 text-[12.5px] font-semibold text-slate-700 mb-1.5">
                  To date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  disabled={isHalfDay}
                  onChange={e => set('endDate', e.target.value)}
                  className="w-full h-[38px] px-3 rounded-[9px] border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            </div>

            {/* Session — segmented control */}
            <div>
              <label className="flex items-baseline gap-1 text-[12.5px] font-semibold text-slate-700 mb-1.5">
                Session <span className="text-[10.5px] font-bold text-slate-400 tracking-wider">NM</span>
              </label>
              <div className="inline-flex w-full bg-slate-100 border border-slate-200 rounded-[9px] p-1 gap-0.5">
                {(['Full day', 'First half', 'Second half'] as Session[]).map(s => (
                  <button
                    key={s}
                    onClick={() => set('session', s)}
                    className={`flex-1 py-2 rounded-[7px] text-[12.5px] font-semibold transition-all ${form.session === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration banner */}
            {form.startDate && form.endDate && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <span className="text-sm text-emerald-700 font-semibold inline-flex items-center gap-1.5">
                  <FiClock className="w-4 h-4" /> Duration: {fmtNum(calc.days)} day(s){isHalfDay ? ` · ${form.session}` : ''}
                </span>
                {selectedBalance && (
                  <span className="text-xs text-emerald-600 font-semibold">Available: {fmtNum(Math.max(0, (selectedBalance.total || 0) - (selectedBalance.used || 0)))} days</span>
                )}
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="flex items-baseline gap-1 text-[12.5px] font-semibold text-slate-700 mb-1.5">
                Reason <span className="text-red-500">*</span>
                <span className="ml-auto text-[10.5px] font-bold text-slate-400">({form.reason.length}/250)</span>
              </label>
              <textarea
                rows={3}
                value={form.reason}
                maxLength={250}
                onChange={e => set('reason', e.target.value)}
                placeholder="e.g. Family function in Pune"
                className="w-full px-3 py-2.5 rounded-[9px] border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 leading-relaxed"
              />
            </div>

            {/* Attachment — drag-drop style */}
            <div>
              <label className="flex items-baseline gap-1 text-[12.5px] font-semibold text-slate-700 mb-1.5">
                Attachment
                <span className="ml-1 text-[10.5px] font-bold text-slate-400 tracking-wider">
                  {selectedType && ((selectedType.code || '').toLowerCase().includes('sl') || (selectedType.name || '').toLowerCase().includes('sick')) ? 'M if > 3 days' : 'NM'}
                </span>
              </label>
              <label className={`flex items-center gap-2.5 border-[1.5px] border-dashed rounded-[10px] px-3.5 py-3 text-[12.5px] cursor-pointer transition-colors ${form.fileName ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-semibold' : 'border-slate-200 text-slate-500 hover:border-blue-400 hover:bg-blue-50'}`}>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={handleFile} />
                {form.fileName ? <FiFileText className="w-4 h-4 flex-shrink-0" /> : <FiUpload className="w-4 h-4 flex-shrink-0" />}
                <span className="truncate flex-1">{form.fileName || 'Upload medical certificate / supporting document'}</span>
                {form.fileName && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); set('fileName', null); }}
                    className="text-blue-600 text-xs font-semibold hover:underline flex-shrink-0"
                  >
                    Remove
                  </button>
                )}
              </label>
            </div>

            {/* Approver chain preview (existing component) */}
            <div className="pt-1">
              <ApproverChainPreview module="leave" leaveTypeId={form.leaveTypeId || undefined} compact />
            </div>
          </div>

          {/* Right side panel — balance preview + system checks */}
          <div className="bg-slate-50 border-t lg:border-t-0 lg:border-l border-slate-200 p-5 flex flex-col gap-3.5">
            {/* Balance preview */}
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold text-slate-700 tracking-wide">Balance preview</h3>
                {selectedType && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">{selectedType.code}</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[10.5px] text-slate-500">Available</p>
                  <p className="text-base font-extrabold text-slate-900 leading-tight">{selectedType ? fmtNum(calc.available) : '—'}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-slate-500">This request</p>
                  <p className="text-base font-extrabold text-slate-900 leading-tight">{fmtNum(calc.days)}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-slate-500">LOP</p>
                  <p className={`text-base font-extrabold leading-tight ${calc.lop > 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmtNum(calc.lop)}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-slate-500">After approval</p>
                  <p className="text-base font-extrabold text-slate-900 leading-tight">{selectedType ? fmtNum(calc.afterApproval) : '—'}</p>
                </div>
              </div>
              {calc.sandwichDays > 0 && (
                <p className="mt-2 text-[11.5px] font-semibold text-amber-700 inline-flex items-center gap-1.5">
                  <FiInfo className="w-3.5 h-3.5" /> Includes {calc.sandwichDays} sandwich day(s).
                </p>
              )}
            </div>

            {/* System checks (11 checks) */}
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold text-slate-700 tracking-wide">System checks on submit</h3>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${!hasError ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {passedCount}/11
                </span>
              </div>
              <ol className="flex flex-col gap-0.5">
                {checks.map((c, i) => {
                  const toneClasses =
                    c.state === 'ok' ? { bg: 'bg-emerald-50 text-emerald-700', icon: <FiCheck className="w-3 h-3" strokeWidth={3} />, label: 'text-slate-700' } :
                    c.state === 'err' ? { bg: 'bg-red-50 text-red-600', icon: <FiX className="w-3 h-3" strokeWidth={3} />, label: 'text-red-700' } :
                    c.state === 'warn' ? { bg: 'bg-amber-50 text-amber-700', icon: <span className="text-[10px] font-extrabold">!</span>, label: 'text-amber-700' } :
                    { bg: 'bg-slate-100 text-slate-400', icon: <span className="text-[10px] font-extrabold">{i + 1}</span>, label: 'text-slate-500' };
                  const flagged = triedSubmit && c.state === 'idle';
                  return (
                    <li
                      key={i}
                      className={`flex gap-2.5 px-1.5 py-1.5 rounded-lg ${flagged ? 'bg-orange-50 outline-1 outline outline-orange-200' : ''}`}
                    >
                      <span className={`w-[19px] h-[19px] flex-none rounded-full inline-grid place-content-center mt-0.5 ${toneClasses.bg}`}>{toneClasses.icon}</span>
                      <div className="min-w-0">
                        <div className={`text-[12.5px] font-semibold inline-flex items-center gap-1.5 flex-wrap ${toneClasses.label}`}>
                          {c.label}
                          {c.code && <code className="font-mono text-[10px] bg-red-50 text-red-600 rounded px-1 py-0.5 font-bold">{c.code}</code>}
                        </div>
                        {c.msg && c.state !== 'idle' && (
                          <p className="text-[11.5px] text-slate-500 mt-0.5">{c.msg}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* ── Mini calendar showing selected date range ── */}
            {form.startDate && (
              <MiniCalendar
                startDate={form.startDate}
                endDate={form.endDate}
                holidays={holidays}
                teamConflicts={teamConflicts}
              />
            )}

            {/* ── Team conflict section ── */}
            <TeamConflictPanel conflicts={teamConflicts} />
          </div>
        </div>

        {/* Footer — drawer-style */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50/60 flex-wrap">
          <p className="text-[12.5px] text-slate-500 inline-flex items-center gap-1.5">
            Goes to <span className="font-semibold text-slate-700">{managerName}</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border bg-amber-50 border-amber-200 text-amber-700">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/leave')}
              className="h-[38px] px-4 rounded-[9px] border border-slate-200 bg-white text-slate-700 text-[13.5px] font-semibold hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || (triedSubmit && !canSubmit)}
              className="h-[38px] px-5 rounded-[9px] bg-blue-600 hover:bg-blue-700 text-white text-[13.5px] font-semibold inline-flex items-center gap-1.5 shadow-sm shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiCheck className="w-4 h-4" />}
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApplyLeavePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" /></div>}>
      <ApplyLeaveContent />
    </Suspense>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MiniCalendar — shows the current month with selected date range
   highlighted, holidays in amber, and team-conflict days with a dot.
   ════════════════════════════════════════════════════════════════════ */
function MiniCalendar({
  startDate, endDate, holidays, teamConflicts,
}: {
  startDate: string;
  endDate: string;
  holidays: Holiday[];
  teamConflicts: any[];
}) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  // Show the month of the start date
  const viewYear = start.getFullYear();
  const viewMonth = start.getMonth();
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  // Day-of-week of the first day (0=Sun → we want Mon=0)
  const firstDow = (firstDay.getDay() + 6) % 7;

  const holidaySet = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
  // Team conflict dates: any date within a conflict leave's range
  const conflictDates = new Set<string>();
  for (const c of teamConflicts) {
    const cs = new Date(`${c.startDate}T00:00:00`);
    const ce = new Date(`${c.endDate}T00:00:00`);
    for (let d = new Date(cs); d <= ce; d.setDate(d.getDate() + 1)) {
      conflictDates.add(d.toISOString().split('T')[0]);
    }
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dowNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const cells: Array<{ day: number | null; dateStr?: string }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-xs font-bold text-slate-700 tracking-wide">{monthNames[viewMonth]} {viewYear}</h3>
        <span className="text-[10px] font-semibold text-slate-400">{holidays.filter(h => h.date.startsWith(`${viewYear}-${String(viewMonth+1).padStart(2,'0')}`)).length} holidays</span>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dowNames.map((d, i) => (
          <div key={i} className={`text-center text-[10px] font-bold ${i >= 5 ? 'text-slate-300' : 'text-slate-400'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (cell.day === null) return <div key={i} />;
          const date = new Date(`${cell.dateStr}T00:00:00`);
          const iso = cell.dateStr!;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const isHoliday = holidaySet.has(iso);
          const isSelected = date >= start && date <= end;
          const isToday = iso === new Date().toISOString().split('T')[0];
          const hasConflict = conflictDates.has(iso);
          return (
            <div
              key={i}
              className={`relative h-8 rounded-lg flex items-center justify-center text-[11px] font-semibold transition-colors cursor-default ${
                isSelected
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : isHoliday
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : isWeekend
                      ? 'bg-slate-50 text-slate-300'
                      : 'text-slate-600 hover:bg-slate-50'
              } ${isToday && !isSelected ? 'ring-1 ring-emerald-400' : ''}`}
              title={isHoliday ? holidays.find(h => h.date === iso)?.name : hasConflict ? 'Team member on leave' : ''}
            >
              {cell.day}
              {hasConflict && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
              )}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2.5 text-[10px] text-slate-500 flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Selected</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" /> Holiday</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-50" /> Weekend</span>
        <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Team on leave</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TeamConflictPanel — shows team members who have leave overlapping
   with the selected date range, with their profile pics/avatars.
   ════════════════════════════════════════════════════════════════════ */
function TeamConflictPanel({ conflicts }: { conflicts: any[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-xs font-bold text-slate-700 tracking-wide">Team conflicts</h3>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${conflicts.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {conflicts.length} on leave
        </span>
      </div>
      {conflicts.length === 0 ? (
        <div className="text-center py-4">
          <div className="w-8 h-8 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-1.5">
            <FiCheck className="w-4 h-4 text-emerald-600" strokeWidth={2.5} />
          </div>
          <p className="text-[11.5px] text-slate-500">No team members on leave during these dates.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {conflicts.slice(0, 6).map((c, i) => {
            const name = c.employee ? `${c.employee.firstName} ${c.employee.lastName}`.trim() : 'Unknown';
            const empId = c.employee?.employeeId || '';
            const avatar = c.employee?.avatar;
            const initials = name.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();
            const dateStr = c.startDate === c.endDate
              ? new Date(c.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : `${new Date(c.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(c.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            const isApproved = c.status === 'approved';
            return (
              <li key={c.id || i} className="flex items-center gap-2.5 py-1">
                {avatar ? (
                  <img src={avatar} alt={name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-slate-700 truncate">{name}</p>
                  <p className="text-[10.5px] text-slate-400">{dateStr} · {c.leaveType?.name || 'Leave'}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 ${
                  isApproved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${isApproved ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {isApproved ? 'Approved' : 'Pending'}
                </span>
              </li>
            );
          })}
          {conflicts.length > 6 && (
            <li className="text-[10px] text-slate-400 text-center pt-1">+{conflicts.length - 6} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
