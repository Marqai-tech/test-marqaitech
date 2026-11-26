'use client';

import { useEffect, useState, useCallback, useMemo, Suspense, type ChangeEvent } from 'react';
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
// Per-date day selection: each date maps to 'full' | 'first_half' | 'second_half' | null
// (null = nothing ticked for that date = not applied). This replaces the old
// single-session segmented control with per-date checkboxes per the QA spec
// (Section 2: "Apply Leave – Day Selection Change").
type DaySelection = 'full' | 'first_half' | 'second_half' | null;
interface FormState {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  session: Session; // kept for backward-compat calc fallback
  daySelections: Record<string, DaySelection>; // key = 'YYYY-MM-DD'
  reason: string;
  fileName: string | null;
  // Relocation Leave fields (Section 9)
  relocationType: 'company_instructed' | 'voluntary' | '';
  relocatingWithFamily: boolean;
  fromLocation: string;
  toLocation: string;
  oneWayDistanceKm: string;
  // Additional application form fields (Section 4)
  contactNumber: string;
  contactAddress: string;
  handoverTo: string;
  notifyCc: string;
}

const initialForm: FormState = {
  leaveTypeId: '',
  startDate: '',
  endDate: '',
  session: 'Full day',
  daySelections: {},
  reason: '',
  fileName: null,
  relocationType: '',
  relocatingWithFamily: false,
  fromLocation: '',
  toLocation: '',
  oneWayDistanceKm: '',
  contactNumber: '',
  contactAddress: '',
  handoverTo: '',
  notifyCc: '',
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
  const [mappings, setMappings] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  // Tenant-wide Application Form Settings (from /api/leave/form-settings)
  // Controls which fields are shown/mandatory on this form. Configured once
  // by HR on the Approval Workflows page → Application Form Settings tab.
  const [formSettings, setFormSettings] = useState<any>(null);
  // BUG FIX: Employee shift info for display on the apply form (night shifts etc.)
  const [employeeShift, setEmployeeShift] = useState<any>(null);
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
        const [ltRes, empRes, balRes, holRes, ownRes, ruleRes, mapRes, polRes, fsRes] = await Promise.all([
          fetch(`/api/leave-types?limit=100`, { headers }),
          fetch(`/api/employees?limit=1&own=1&includePhotos=0${sq ? `&${sq}` : ''}`, { headers }),
          fetch(`/api/leave/balance?limit=50${sq ? `&${sq}` : ''}`, { headers }).catch(() => null),
          fetch(`/api/holidays${sq ? `?${sq}` : ''}`, { headers }).catch(() => null),
          fetch(`/api/leave?view=self&limit=100${sq ? `&${sq}` : ''}`, { headers }).catch(() => null),
          fetch(`/api/leave-policy-rules?limit=100`, { headers }).catch(() => null),
          fetch(`/api/leave-type-policy-mappings?includeInactive=1`, { headers }).catch(() => null),
          fetch(`/api/policies?category=leave&limit=100`, { headers }).catch(() => null),
          fetch(`/api/leave/form-settings`, { headers }).catch(() => null),
        ]);
        if (ruleRes?.ok) { const rd = await ruleRes.json(); setRules(rd.data || []); }
        if (mapRes?.ok) { const md = await mapRes.json(); setMappings(md.data || []); }
        if (polRes?.ok) { const pd = await polRes.json(); setPolicies(pd.policies || pd.data || []); }
        // Load tenant-wide form settings (which fields are shown/mandatory)
        if (fsRes?.ok) { const fsd = await fsRes.json(); setFormSettings(fsd.settings); }
        const ltData = await ltRes.json();
        let activeTypes = (ltData.data || []).filter((t: any) => t.status === 'active' || t.status === undefined);
        setLeaveTypes(activeTypes);
        const empData = await empRes.json();
        const myEmp = empData.employees?.find((e: any) => e.email === user?.email || e.userId === user?.id || (user?.employee?.id && e.id === user.employee.id)) || null;
        if (myEmp) setEmployee(myEmp);

        // ─── Fetch employee's assigned policies (leavePolicyIds) ───
        // The employees list API doesn't return leavePolicyIds (runtime column
        // not in Prisma schema). Fetch it separately via the policies endpoint.
        let empLeavePolicyIds: string[] = [];
        if (myEmp?.id) {
          try {
            const empPolRes = await fetch(`/api/employees/${myEmp.id}/policies`, { headers });
            if (empPolRes.ok) {
              const empPolData = await empPolRes.json();
              const empPol = empPolData.data?.employee || {};
              const raw = empPol.leavePolicyIds || empPol.leavePolicyId;
              try { empLeavePolicyIds = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : (raw ? [raw] : [])); } catch { empLeavePolicyIds = raw ? [raw] : []; }
              console.log(`[apply-leave] Employee leavePolicyIds: ${JSON.stringify(empLeavePolicyIds)}`);
            }
          } catch (e) { console.warn('[apply-leave] Failed to fetch employee policies:', e); }
        }

        // ─── Policy-based leave type filtering ───
        // Use the employee's directly-assigned policies (leavePolicyIds) to find
        // which leave types they should see. Each policy has a leaveTypeIds
        // field (JSON array of leave type IDs). Also check scope-based matching
        // and LeaveTypePolicyMapping as fallbacks.
        if (myEmp) {
          try {
            const sep = sq ? `&${sq}` : '';
            // Fetch policies with leaveTypeIds (raw SQL column, need the endpoint that returns it)
            const polRes2 = await fetch(`/api/policies?category=leave&limit=100`, { headers }).catch(() => null);
            const mapRes2 = await fetch(`/api/leave-type-policy-mappings?includeInactive=1`, { headers }).catch(() => null);

            const allowedLeaveTypeIds = new Set<string>();
            let hasPolicyFilter = false;
            const parseJson = (v: any): string[] => { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; } };

            // Source 1: Employee's directly-assigned policies (leavePolicyIds)
            // Each policy has a leaveTypeIds field containing the leave type IDs
            if (polRes2?.ok) {
              const polData = await polRes2.json();
              const policies = polData.policies || polData.data || [];

              if (empLeavePolicyIds.length > 0) {
                for (const pid of empLeavePolicyIds) {
                  const attachedPolicy = policies.find((p: any) => p.id === pid);
                  if (attachedPolicy && attachedPolicy.status === 'active') {
                    const ltIds = parseJson(attachedPolicy.leaveTypeIds);
                    if (ltIds.length > 0) {
                      hasPolicyFilter = true;
                      ltIds.forEach((id: string) => allowedLeaveTypeIds.add(id));
                      console.log(`[apply-leave] Policy ${pid} (${attachedPolicy.title}) → ${ltIds.length} leave type(s): ${ltIds.join(', ')}`);
                    }
                  }
                }
              }

              // Source 2: Scope-based policy matching (empStatus, branch, dept)
              for (const p of policies) {
                if (p.status !== 'active') continue;
                if (empLeavePolicyIds.includes(p.id)) continue; // already handled above
                const empStatuses = parseJson(p.empStatus);
                const branchIds = parseJson(p.branchIds);
                const deptIds = parseJson(p.departmentIds);
                let matches = true;
                if (empStatuses.length > 0 && !empStatuses.map((s: string) => s.toLowerCase()).includes('all')) {
                  const empStatus = (myEmp.employeeStatus || '').toLowerCase();
                  if (empStatus && !empStatuses.map((s: string) => s.toLowerCase()).includes(empStatus)) matches = false;
                }
                if (matches && branchIds.length > 0 && myEmp.branchId && !branchIds.includes(myEmp.branchId)) matches = false;
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

            // Source 3: LeaveTypePolicyMapping rows
            if (mapRes2?.ok) {
              const mapData = await mapRes2.json();
              const mappings = mapData.data || [];
              if (mappings.length > 0) {
                hasPolicyFilter = true;
                for (const m of mappings) {
                  if (m.status !== 'active') continue;
                  const empType = m.employmentType || 'all';
                  if (empType !== 'all' && myEmp.employmentType && myEmp.employmentType !== empType.replace(/-/g, '_') && myEmp.employmentType !== empType) continue;
                  if (m.branchId && myEmp.branchId !== m.branchId) continue;
                  if (m.departmentId && myEmp.departmentId !== m.departmentId) continue;
                  const gender = (m.genderApplicability || 'all').toLowerCase();
                  if (gender !== 'all' && gender !== 'both' && myEmp.gender && myEmp.gender.toLowerCase() !== gender) continue;
                  allowedLeaveTypeIds.add(m.leaveTypeId);
                }
              }
            }

            // If we found allowed leave type IDs, filter or fetch them
            if (hasPolicyFilter && allowedLeaveTypeIds.size > 0) {
              let filtered = activeTypes.filter((t: any) => allowedLeaveTypeIds.has(t.id));
              // If the API returned 0 types (company scope filtering), fetch by ID
              if (filtered.length === 0) {
                console.log('[apply-leave] API returned 0 types, fetching by ID from policy leaveTypeIds...');
                const ids = Array.from(allowedLeaveTypeIds);
                const results = await Promise.all(
                  ids.map(id => fetch(`/api/leave-types/${id}`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null))
                );
                filtered = results
                  .filter((r: any) => r && (r.status === 'active' || r.status === undefined))
                  .map((r: any) => r.leaveType || r);
                console.log(`[apply-leave] Fetched ${filtered.length} leave types by ID.`);
              }
              activeTypes = filtered;
              setLeaveTypes(activeTypes);
              console.log(`[apply-leave] Final: employee sees ${activeTypes.length} leave type(s).`);
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
        // BUG FIX: Fetch employee's shift info for display on the apply form
        // (especially important for manufacturing companies with night shifts)
        try {
          const shiftRes = await fetch(`/api/leave/my-shift`, { headers }).catch(() => null);
          if (shiftRes?.ok) {
            const shiftData = await shiftRes.json();
            setEmployeeShift(shiftData.shift || null);
          }
        } catch { /* non-fatal */ }
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

  // ─── Compute leave type info from rule + policy + mapping tables ───
  // Chain: LeaveType → LeaveTypePolicyMapping (leaveTypeId → policyRuleId) → LeavePolicyRule
  //    OR: LeaveType → Policy.leaveTypeIds → LeavePolicyRule.policyId
  // The rule has entitledDaysPerYear, advanceNoticeDays, etc.
  const parseJson = (v: any): string[] => { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; } };

  // ─── Reusable: compute entitled / taken / remaining days for ANY leave type ───
  // Used both for the selected type (below) and for each option in the dropdown
  // so we can disable zero-balance non-LOP types before the user picks them.
  // Also returns the resolved Rule object so downstream UI can read its
  // properties (advanceNoticeDays, halfDayAllowed, min/maxDaysPerRequest, etc.).
  const computeRemaining = useCallback((leaveTypeId: string): { entitled: number; taken: number; remaining: number; isLop: boolean; rule: any | null; monthTaken: number } => {
    if (!leaveTypeId) return { entitled: 0, taken: 0, remaining: 0, isLop: false, rule: null, monthTaken: 0 };
    // Path 1: LeaveType → Mapping → Rule
    const mapping = mappings.find((m: any) => m.leaveTypeId === leaveTypeId && m.status === 'active');
    const ruleViaMapping = mapping ? rules.find((r: any) => r.id === mapping.policyRuleId) : null;
    // Path 2: LeaveType → Policy.leaveTypeIds → Rule.policyId
    const policy = policies.find((p: any) => {
      if (p.status !== 'active') return false;
      const ltIds = parseJson(p.leaveTypeIds);
      return ltIds.includes(leaveTypeId);
    });
    const ruleViaPolicy = policy ? rules.find((r: any) => r.policyId === policy.id && r.status === 'active') : null;
    // Path 3: Direct rule.leaveTypeId match (fallback)
    const ruleViaLeaveType = rules.find((r: any) => r.leaveTypeId === leaveTypeId && r.status === 'active');
    const rule = ruleViaMapping || ruleViaPolicy || ruleViaLeaveType || null;

    const lt = leaveTypes.find(t => t.id === leaveTypeId);
    const bal = leaveBalances.find(b => b.leaveType.id === leaveTypeId);
    const entitled = rule?.entitledDaysPerYear || bal?.total || lt?.defaultDays || 0;

    // Helper: compute chargeable days from a single leave record
    // BUG FIX: Use getDaysBetween (excludes weekends+holidays) instead of
    // raw calendar days for null chargeableDays fallback
    const localHolidaySet = new Set(holidays.map((h: any) => new Date(h.date).toISOString().split('T')[0]));
    const daysOf = (l: any): number => {
      if (l.chargeableDays != null) return l.chargeableDays;
      if (l.halfDay) return 0.5;
      const s = new Date(l.startDate); const e = new Date(l.endDate);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        return getDaysBetween(l.startDate, l.endDate, localHolidaySet);
      }
      return 0;
    };

    // BUG FIX: Filter by current year — entitled is per-year, so taken must
    // also be per-year. Previously summed ALL years' leaves against this
    // year's quota, inflating the taken count.
    const cy = new Date().getFullYear();
    const yStart = new Date(cy, 0, 1);
    const yEnd = new Date(cy, 11, 31, 23, 59, 59);

    // Year-total taken (approved + pending, current year only)
    const taken = ownLeaves
      .filter((l: any) => l.leaveTypeId === leaveTypeId
        && (l.status === 'approved' || l.status === 'pending')
        && new Date(l.startDate) <= yEnd
        && new Date(l.endDate) >= yStart)
      .reduce((sum: number, l: any) => sum + daysOf(l), 0);

    // ─── Monthly taken: days already consumed in the CURRENT calendar month ───
    // Used for monthly credit validation (Bug 2): if the rule's creditFrequency
    // is 'Monthly' with creditDays=N, or monthlyLimit=true with monthlyMaxDays=N,
    // the employee can only use N days in the current month.
    const now = new Date();
    const cm = now.getMonth(); // 0-indexed
    const monthTaken = ownLeaves
      .filter((l: any) => {
        if (l.leaveTypeId !== leaveTypeId) return false;
        if (l.status !== 'approved' && l.status !== 'pending') return false;
        // Check if the leave's start date falls in the current calendar month.
        // We use startDate because that's when the leave is "taken" from the
        // employee's perspective. (A leave spanning month boundaries is counted
        // in its start month — matching how monthly credit is typically granted.)
        const s = new Date(l.startDate);
        return !isNaN(s.getTime()) && s.getFullYear() === cy && s.getMonth() === cm;
      })
      .reduce((sum: number, l: any) => sum + daysOf(l), 0);

    const remaining = Math.max(0, entitled - taken);
    const isLop = (lt?.code || '').toLowerCase().includes('lop') || (lt?.name || '').toLowerCase().includes('loss of pay');
    return { entitled, taken, remaining, isLop, rule, monthTaken };
  }, [mappings, rules, policies, leaveTypes, leaveBalances, ownLeaves, holidays]);

  // Selected type values (uses the reusable helper)
  const selectedTypeInfo = computeRemaining(form.leaveTypeId);
  const selectedRule = selectedTypeInfo.rule; // the actual Rule object — keeps downstream UI reading advanceNoticeDays etc. working
  const entitledDays = selectedTypeInfo.entitled;
  const takenDays = selectedTypeInfo.taken;
  const remainingDays = selectedTypeInfo.remaining;

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

  // BUG FIX: Refetch shift info when the start date changes (rotating rosters
  // may assign different shifts on different days)
  useEffect(() => {
    if (!form.startDate) return;
    const h = getAuthHeaders();
    fetch(`/api/leave/my-shift?date=${form.startDate}`, { headers: h })
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.shift ? setEmployeeShift(d.shift) : null)
      .catch(() => {});
  }, [form.startDate]);

  /* ── Per-date selection helpers (Section 2) ── */
  // Generate the list of dates in the selected range. Each date is a
  // 'YYYY-MM-DD' string. Weekly offs (Sat/Sun) and holidays are flagged
  // so the checkbox table can disable them (unless the rule allows exceptions).
  const holidaySet = useMemo(() => new Set(holidays.map((h: Holiday) => new Date(h.date).toISOString().split('T')[0])), [holidays]);

  const dateRange: Array<{ dateStr: string; dow: number; isWeekend: boolean; isHoliday: boolean; holidayName?: string }> = useMemo(() => {
    if (!form.startDate || !form.endDate) return [];
    const s = new Date(`${form.startDate}T00:00:00Z`);
    const e = new Date(`${form.endDate}T00:00:00Z`);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return [];
    const out: Array<{ dateStr: string; dow: number; isWeekend: boolean; isHoliday: boolean; holidayName?: string }> = [];
    const c = new Date(s); let guard = 0;
    while (c <= e && guard < 400) {
      guard++;
      const ds = c.toISOString().split('T')[0];
      const dow = c.getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = holidaySet.has(ds);
      const hName = isHoliday ? holidays.find(h => new Date(h.date).toISOString().split('T')[0] === ds)?.name : undefined;
      out.push({ dateStr: ds, dow, isWeekend, isHoliday, holidayName: hName });
      c.setUTCDate(c.getUTCDate() + 1);
    }
    return out;
  }, [form.startDate, form.endDate, holidaySet, holidays]);

  // Total days from per-date selections. Each 'full' = 1 day, each half = 0.5.
  const selectedDaysCount = useMemo(() => {
    return Object.values(form.daySelections).reduce((sum, sel) => {
      if (sel === 'full') return sum + 1;
      if (sel === 'first_half' || sel === 'second_half') return sum + 0.5;
      return sum;
    }, 0);
  }, [form.daySelections]);

  // Toggle a day selection. Enforces the exclusive rules:
  //   - Ticking Full day clears any halves for that date.
  //   - Ticking a half clears Full day.
  //   - Ticking both halves → auto-switch to Full day (1 day).
  const toggleDay = (dateStr: string, which: 'full' | 'first_half' | 'second_half') => {
    setForm(prev => {
      const next = { ...prev.daySelections };
      const current = next[dateStr] || null;
      if (which === 'full') {
        // Toggle full day on/off. Turning it on clears any halves.
        next[dateStr] = current === 'full' ? null : 'full';
      } else {
        // Half-day toggle
        if (current === 'full') {
          // Full is currently on — switching to a half turns off full and sets the half
          next[dateStr] = which;
        } else if (current === which) {
          // Same half clicked again → turn off
          next[dateStr] = null;
        } else if (current === null) {
          // Nothing was on — turn on this half
          next[dateStr] = which;
        } else {
          // The OTHER half is currently on. Both halves ticked → auto-switch to full day.
          next[dateStr] = 'full';
        }
      }
      return { ...prev, daySelections: next };
    });
  };

  // Auto-fill all dates as 'full' when the range changes (convenience default).
  // The employee can then un-tick or change individual dates. Only runs if no
  // selections exist yet for the new range.
  useEffect(() => {
    if (dateRange.length === 0) return;
    // If selections are empty OR the current selections don't cover any date in
    // the new range, default all working days to 'full'.
    const hasSelections = dateRange.some(d => form.daySelections[d.dateStr]);
    if (!hasSelections) {
      setForm(prev => {
        const next = { ...prev.daySelections };
        for (const d of dateRange) {
          // Skip weekends/holidays by default (the rule's Day counting setting
          // determines whether these are counted — but for the default fill,
          // we leave them un-ticked so the employee consciously decides).
          if (!d.isWeekend && !d.isHoliday) {
            next[d.dateStr] = 'full';
          }
        }
        return { ...prev, daySelections: next };
      });
    }
  }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Relocation Leave entitlement matrix (Section 9.1)
  const relocationEntitlement = useMemo(() => {
    const isRL = (selectedType?.code || '').toUpperCase().includes('RL') || (selectedType?.name || '').toLowerCase().includes('relocation');
    if (!isRL) return null;
    const dist = Number(form.oneWayDistanceKm || 0);
    const withFamily = form.relocatingWithFamily;
    const voluntary = form.relocationType === 'voluntary';
    // Voluntary relocation is capped at 2 days regardless of distance/family
    if (voluntary) return { days: 2, capped: true, reason: 'Voluntary relocation — capped at 2 days' };
    // Company-instructed: use the matrix
    const beyond1500 = dist > 1500;
    if (withFamily) return { days: beyond1500 ? 6 : 4, capped: false, reason: `With family, ${dist}km → ${beyond1500 ? 6 : 4} days` };
    return { days: beyond1500 ? 4 : 2, capped: false, reason: `Without family, ${dist}km → ${beyond1500 ? 4 : 2} days` };
  }, [selectedType, form.oneWayDistanceKm, form.relocatingWithFamily, form.relocationType]);

  /* ── Calculate days and balance preview ── */
  // Use the rule-based entitledDays/takenDays/remainingDays as the single
  // source of truth — no separate "available" calculation from LeaveBalance.
  // If per-date selections exist, use the sum of selections instead of the
  // old whole-range calculation (Section 2).
  const calc = (() => {
    if (!form.startDate || !form.endDate) return { days: 0, sandwichDays: 0, lop: 0, afterApproval: remainingDays };
    const holidaySet: Set<string> = new Set(holidays.map((h: Holiday) => new Date(h.date).toISOString().split('T')[0]));
    // Per-date selection mode (Section 2): use the sum of ticked days
    const hasDateSelections = Object.values(form.daySelections).some(v => v !== null);
    let days: number;
    if (hasDateSelections) {
      days = selectedDaysCount;
    } else {
      // Legacy fallback: whole-range calculation
      const workingDays = getDaysBetween(form.startDate, form.endDate, holidaySet);
      days = isHalfDay ? 0.5 : workingDays;
    }
    const isLopType = (selectedType?.code || '').toLowerCase().includes('lop') || (selectedType?.name || '').toLowerCase().includes('loss of pay');
    const lop = !isLopType ? Math.max(0, days - remainingDays) : 0;
    const afterApproval = isLopType ? remainingDays : Math.max(0, remainingDays - days);
    // Sandwich days = weekend/holiday days in range
    const s = new Date(`${form.startDate}T00:00:00Z`); const e = new Date(`${form.endDate}T00:00:00Z`);
    let sandwich = 0; const c = new Date(s); let g = 0;
    while (c <= e && g < 400) { g++; const dow = c.getUTCDay(); const dk = c.toISOString().split('T')[0]; if ((dow === 0 || dow === 6 || holidaySet.has(dk))) sandwich++; c.setUTCDate(c.getUTCDate() + 1); }
    return { days, sandwichDays: sandwich, lop, afterApproval };
  })();

  /* ── 11 System checks (live evaluation) ── */
  const checks: Check[] = (() => {
    const filled = !!(form.leaveTypeId && form.startDate && form.endDate && form.reason.trim());
    const out: Check[] = [];
    const push = (label: string, state: CheckState, msg?: string | null, code?: string | null) => out.push({ label, state, msg, code });

    push('Required fields filled', filled ? 'ok' : 'idle', filled ? null : 'Leave type, dates and reason are mandatory.');

    if (!selectedType || !form.startDate || !form.endDate) {
      ['Leave type allowed for employee', 'Applied early enough (notice)', 'Within minimum & maximum days', 'Half-day allowed', 'Document attached when required', 'Back-date limit', 'Service days required', 'Sufficient balance (or LOP)', 'Monthly credit limit', 'No overlap with existing leave', 'Sandwich & clubbing rules']
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

    // ─── Sufficient balance check ───
    // Three outcomes:
    //   1. LOP type → always 'ok' (unpaid, no balance limit)
    //   2. Non-LOP type with 0 remaining → 'err' (BLOCKS submission). The
    //      employee has no entitlement left for this leave type and cannot
    //      apply for it — they must pick a different type.
    //   3. Non-LOP type with some remaining but request exceeds it → 'warn'
    //      (excess days become LOP, submission still allowed)
    //   4. Non-LOP type fully covered → 'ok'
    if (selectedTypeInfo.isLop) {
      push('Sufficient balance (or LOP)', 'ok', 'Loss of Pay — no balance required.');
    } else if (remainingDays <= 0) {
      push('Sufficient balance (or LOP)', 'err',
        `0 days available for ${selectedType.name}. This leave type cannot be applied for — choose another type.`,
        'LV-E09');
    } else if (calc.lop > 0) {
      push('Sufficient balance (or LOP)', 'warn',
        `${fmtNum(remainingDays)} day(s) remaining · ${fmtNum(calc.lop)} day(s) will be LOP.`);
    } else {
      push('Sufficient balance (or LOP)', 'ok', `${fmtNum(remainingDays)} day(s) remaining.`);
    }

    // ─── Monthly credit limit check (Bug 2) ───
    // Two independent monthly limits can apply:
    //   A. creditFrequency === 'Monthly' + creditDays > 0
    //      → the rule grants creditDays per month; the employee can only use
    //        that many days in the current calendar month.
    //   B. monthlyLimit === true + monthlyMaxDays > 0
    //      → a separate monthly cap on how many days can be taken per month.
    // The TIGHTER of the two applies (if both are set). LOP types are exempt.
    if (!selectedTypeInfo.isLop && selectedRule) {
      const freq = (selectedRule.creditFrequency || 'Monthly').toLowerCase();
      const creditDays = Number(selectedRule.creditDays || 0);
      const hasMonthlyCap = selectedRule.monthlyLimit === true;
      const monthlyCapDays = Number(selectedRule.monthlyMaxDays || 0);

      // Determine the effective monthly limit
      let monthlyLimit = 0;
      let limitSource = '';
      if (freq === 'monthly' && creditDays > 0) {
        monthlyLimit = creditDays;
        limitSource = `monthly credit of ${fmtNum(creditDays)} day(s)`;
      }
      if (hasMonthlyCap && monthlyCapDays > 0) {
        if (monthlyLimit === 0 || monthlyCapDays < monthlyLimit) {
          monthlyLimit = monthlyCapDays;
          limitSource = `monthly cap of ${fmtNum(monthlyCapDays)} day(s)`;
        }
      }

      if (monthlyLimit > 0) {
        const monthName = new Date().toLocaleDateString('en-GB', { month: 'short' });
        const projected = selectedTypeInfo.monthTaken + calc.days;
        if (selectedTypeInfo.monthTaken >= monthlyLimit) {
          // Already at/over the monthly limit — block entirely
          push('Monthly credit limit', 'err',
            `You have already used ${fmtNum(selectedTypeInfo.monthTaken)} of ${fmtNum(monthlyLimit)} day(s) allowed in ${monthName}. No more ${selectedType.name} can be applied this month.`,
            'LV-E10');
        } else if (projected > monthlyLimit) {
          // This request would push over the monthly limit — block
          push('Monthly credit limit', 'err',
            `You have used ${fmtNum(selectedTypeInfo.monthTaken)} day(s) in ${monthName}. This request (${fmtNum(calc.days)} day(s)) would exceed the ${limitSource}. Remaining this month: ${fmtNum(Math.max(0, monthlyLimit - selectedTypeInfo.monthTaken))} day(s).`,
            'LV-E11');
        } else {
          push('Monthly credit limit', 'ok',
            `${fmtNum(selectedTypeInfo.monthTaken)} / ${fmtNum(monthlyLimit)} day(s) used in ${monthName} · ${fmtNum(Math.max(0, monthlyLimit - projected))} day(s) left after this request.`);
        }
      } else {
        push('Monthly credit limit', 'ok', 'No monthly limit for this leave type.');
      }
    } else if (!selectedTypeInfo.isLop) {
      push('Monthly credit limit', 'ok', 'No monthly limit configured.');
    } else {
      push('Monthly credit limit', 'ok', 'LOP — no monthly limit.');
    }

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
    // Second-line guard: even if canSubmit somehow passed (e.g. stale state),
    // block submission for non-LOP leave types with zero remaining balance.
    if (selectedType && !selectedTypeInfo.isLop && selectedTypeInfo.remaining <= 0) {
      toast.error(`Cannot apply for ${selectedType.name} — you have 0 days available. Please choose another leave type.`);
      return;
    }
    // Monthly credit guard (Bug 2): if the selected leave type has a monthly
    // credit limit (creditFrequency=Monthly+creditDays, or monthlyLimit+
    // monthlyMaxDays), block submission when the current month's usage + this
    // request would exceed the limit. LOP types are exempt.
    if (selectedType && !selectedTypeInfo.isLop && selectedRule) {
      const freq = (selectedRule.creditFrequency || 'Monthly').toLowerCase();
      const creditDays = Number(selectedRule.creditDays || 0);
      const monthlyCapDays = Number(selectedRule.monthlyMaxDays || 0);
      let monthlyLimit = 0;
      if (freq === 'monthly' && creditDays > 0) monthlyLimit = creditDays;
      if (selectedRule.monthlyLimit === true && monthlyCapDays > 0 && (monthlyLimit === 0 || monthlyCapDays < monthlyLimit)) monthlyLimit = monthlyCapDays;
      if (monthlyLimit > 0 && selectedTypeInfo.monthTaken + calc.days > monthlyLimit) {
        const monthName = new Date().toLocaleDateString('en-GB', { month: 'short' });
        toast.error(`Monthly limit exceeded for ${selectedType.name}: you have used ${fmtNum(selectedTypeInfo.monthTaken)} of ${fmtNum(monthlyLimit)} day(s) in ${monthName}. Remaining: ${fmtNum(Math.max(0, monthlyLimit - selectedTypeInfo.monthTaken))} day(s).`);
        return;
      }
    }
    if (!employee?.id) {
      toast.error('Employee record not found');
      return;
    }
    setSubmitting(true);
    try {
      // Build the per-date selections array for the API (Section 2).
      // Only include dates that have a selection (full or half).
      const daySelectionsArray = Object.entries(form.daySelections)
        .filter(([, sel]) => sel !== null)
        .map(([date, sel]) => ({ date, session: sel }));

      // Determine halfDay/halfDaySlot for backward-compat with the API's
      // existing single-date half-day logic. If there's exactly one date
      // selected and it's a half-day, send the old fields too.
      const halfDaySelections = daySelectionsArray.filter(d => d.session === 'first_half' || d.session === 'second_half');
      const isSingleHalfDay = halfDaySelections.length === 1 && daySelectionsArray.length === 1;

      const payload: any = {
        employeeId: employee.id,
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
        halfDay: isSingleHalfDay,
        halfDaySlot: isSingleHalfDay ? (halfDaySelections[0].session === 'first_half' ? 'first_half' : 'second_half') : null,
        // Per-date selections (Section 2) — the API stores this as JSON
        daySelections: daySelectionsArray,
        // Additional application form fields (Section 4)
        contactNumber: form.contactNumber || undefined,
        contactAddress: form.contactAddress || undefined,
        handoverTo: form.handoverTo || undefined,
        notifyCc: form.notifyCc || undefined,
      };

      // Relocation Leave fields (Section 9)
      if (relocationEntitlement) {
        payload.relocation = {
          type: form.relocationType,
          withFamily: form.relocatingWithFamily,
          fromLocation: form.fromLocation,
          toLocation: form.toLocation,
          oneWayDistanceKm: Number(form.oneWayDistanceKm) || 0,
          allowedDays: relocationEntitlement.days,
          voluntary: form.relocationType === 'voluntary',
        };
      }

      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
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
                    // Compute remaining for EACH option so we can disable
                    // zero-balance non-LOP types before the user picks them.
                    const info = computeRemaining(lt.id);
                    const isZeroBalance = !info.isLop && info.remaining <= 0;
                    return (
                      <option
                        key={lt.id}
                        value={lt.id}
                        disabled={isZeroBalance}
                      >
                        {lt.code} — {lt.name}
                      </option>
                    );
                  })}
                </select>
              )}
              {/* Inline warning when the selected leave type has zero balance */}
              {selectedType && !selectedTypeInfo.isLop && selectedTypeInfo.remaining <= 0 && (
                <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700">
                  <FiAlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p className="text-[12px] leading-relaxed">
                    You have <strong>0 days</strong> available for {selectedType.name}. This leave type cannot be applied for. Please choose another leave type from the dropdown, or contact HR if you believe this is incorrect.
                  </p>
                </div>
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
                  lang="en-IN"
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
                  lang="en-IN"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={e => set('endDate', e.target.value)}
                  className="w-full h-[38px] px-3 rounded-[9px] border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            </div>

            {/* BUG FIX: Show employee's shift for the selected date(s) */}
            {employeeShift && (
              <div className="flex items-center gap-2.5 p-3 bg-violet-50 border border-violet-200 rounded-lg">
                <FiClock className="w-4 h-4 text-violet-600 flex-shrink-0" />
                <div className="text-xs text-violet-800">
                  <span className="font-semibold">Your shift{form.startDate ? ` on ${form.startDate}` : ''}:</span>{' '}
                  <span className="font-bold">{employeeShift.name}</span>{' '}
                  ({employeeShift.display})
                  {employeeShift.crossMidnight && (
                    <span className="ml-1 text-amber-600 font-medium">— night shift (crosses midnight)</span>
                  )}
                  {employeeShift.breakMinutes > 0 && (
                    <span className="ml-1 text-slate-500">· break {employeeShift.breakMinutes}min</span>
                  )}
                </div>
              </div>
            )}

            {/* ─── Per-date day selection table (Section 2) ─── */}
            {/* Replaces the old Full day / First half / Second half segmented
                control. Each date in the range gets its own row with 3
                checkboxes. Full day is exclusive with halves. Both halves
                ticked = auto-switch to Full day. */}
            {dateRange.length > 0 && (
              <div>
                <label className="flex items-baseline gap-1 text-[12.5px] font-semibold text-slate-700 mb-1.5">
                  Day selection <span className="text-red-500">*</span>
                  <span className="ml-auto text-[10.5px] font-bold text-slate-400">
                    Total: {fmtNum(selectedDaysCount)} day(s)
                  </span>
                </label>
                <div className="border border-slate-200 rounded-[9px] overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold text-slate-500 uppercase tracking-wide">
                    <span>Date</span>
                    <span className="w-16 text-center">Full</span>
                    <span className="w-16 text-center">1st half</span>
                    <span className="w-16 text-center">2nd half</span>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto">
                    {dateRange.map(d => {
                      const sel = form.daySelections[d.dateStr] || null;
                      const isDisabled = d.isWeekend || d.isHoliday;
                      const dowName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.dow];
                      const dateObj = new Date(d.dateStr + 'T00:00:00');
                      const dateLabel = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                      const showHalfCheckboxes = selectedRule?.halfDayAllowed !== false;
                      return (
                        <div key={d.dateStr} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-2 px-3 py-1.5 border-b border-slate-100 last:border-b-0 items-center ${isDisabled ? 'bg-slate-50' : ''}`}>
                          <div className="min-w-0">
                            <span className={`text-[12px] font-semibold ${isDisabled ? 'text-slate-400' : 'text-slate-800'}`}>
                              {dateLabel} <span className="text-slate-400 font-normal">{dowName}</span>
                            </span>
                            {d.isHoliday && <span className="block text-[10px] text-amber-600 font-semibold">{d.holidayName || 'Holiday'}</span>}
                            {d.isWeekend && !d.isHoliday && <span className="block text-[10px] text-slate-400">Weekly off</span>}
                          </div>
                          <div className="w-16 flex justify-center">
                            <input type="checkbox" disabled={isDisabled} checked={sel === 'full'} onChange={() => toggleDay(d.dateStr, 'full')} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                          </div>
                          <div className="w-16 flex justify-center">
                            {showHalfCheckboxes && <input type="checkbox" disabled={isDisabled} checked={sel === 'first_half'} onChange={() => toggleDay(d.dateStr, 'first_half')} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />}
                          </div>
                          <div className="w-16 flex justify-center">
                            {showHalfCheckboxes && <input type="checkbox" disabled={isDisabled} checked={sel === 'second_half'} onChange={() => toggleDay(d.dateStr, 'second_half')} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                  <span className="text-sm text-emerald-700 font-semibold inline-flex items-center gap-1.5">
                    <FiClock className="w-4 h-4" /> Total: {fmtNum(selectedDaysCount)} day(s)
                  </span>
                  {selectedBalance && (
                    <span className="text-xs text-emerald-600 font-semibold">Available: {fmtNum(Math.max(0, (selectedBalance.total || 0) - (selectedBalance.used || 0)))} days</span>
                  )}
                </div>
              </div>
            )}

            {/* ─── Relocation Leave fields (Section 9) ─── */}
            {relocationEntitlement && (
              <div className="p-3 rounded-lg bg-violet-50 border border-violet-200 space-y-3">
                <p className="text-[12.5px] font-bold text-violet-800">Relocation Leave Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Relocation type *</label>
                    <select value={form.relocationType} onChange={e => set('relocationType', e.target.value as any)} className="w-full h-[34px] px-2 rounded-lg border border-slate-200 text-[12.5px] bg-white">
                      <option value="">— Select —</option>
                      <option value="company_instructed">Company-instructed</option>
                      <option value="voluntary">Voluntary</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-[12.5px] font-medium text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={form.relocatingWithFamily} onChange={e => set('relocatingWithFamily', e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-violet-600" />
                      Relocating with family
                    </label>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">From location</label>
                    <input value={form.fromLocation} onChange={e => set('fromLocation', e.target.value)} placeholder="e.g. Bangalore" className="w-full h-[34px] px-2 rounded-lg border border-slate-200 text-[12.5px]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">To location</label>
                    <input value={form.toLocation} onChange={e => set('toLocation', e.target.value)} placeholder="e.g. Mumbai" className="w-full h-[34px] px-2 rounded-lg border border-slate-200 text-[12.5px]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">One-way distance (km) *</label>
                    <input type="number" value={form.oneWayDistanceKm} onChange={e => set('oneWayDistanceKm', e.target.value)} placeholder="e.g. 850" className="w-full h-[34px] px-2 rounded-lg border border-slate-200 text-[12.5px]" />
                  </div>
                  <div className="flex items-end">
                    {form.relocationType && form.oneWayDistanceKm && (
                      <div className="text-[11.5px] font-semibold text-violet-700 bg-violet-100 rounded-lg px-2.5 py-1.5">
                        {relocationEntitlement.reason} → {relocationEntitlement.days} day(s) allowed
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Duration banner — fallback when no per-date selections */}
            {form.startDate && form.endDate && Object.values(form.daySelections).every(v => v === null) && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <span className="text-sm text-emerald-700 font-semibold inline-flex items-center gap-1.5">
                  <FiClock className="w-4 h-4" /> Duration: {fmtNum(calc.days)} day(s)
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
                  {selectedType && ((selectedType.code || '').toLowerCase().includes('sl') || (selectedType.name || '').toLowerCase().includes('sick')) ? 'Mandatory if > 3 days' : 'Optional'}
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

            {/* ─── Additional application form fields ─── */}
            {/* Shown/hidden based on tenant-wide form settings from
                /api/leave/form-settings (configured on the Approval
                Workflows page → Application Form Settings tab). */}
            {formSettings?.showContactNumber !== false && (
              <div>
                <label className="flex items-baseline gap-1 text-[12.5px] font-semibold text-slate-700 mb-1.5">
                  Contact number during leave
                  {formSettings?.mandatoryContactNumber === true && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="tel"
                  value={form.contactNumber}
                  onChange={e => set('contactNumber', e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full h-[38px] px-3 rounded-[9px] border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            )}
            {formSettings?.showHandover !== false && (
              <div>
                <label className="flex items-baseline gap-1 text-[12.5px] font-semibold text-slate-700 mb-1.5">
                  Handover to / backup person
                  {formSettings?.mandatoryHandover === true && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={form.handoverTo}
                  onChange={e => set('handoverTo', e.target.value)}
                  placeholder="e.g. Raj Patel"
                  className="w-full h-[38px] px-3 rounded-[9px] border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            )}
            {formSettings?.showContactAddress !== false && (
              <div>
                <label className="flex items-baseline gap-1 text-[12.5px] font-semibold text-slate-700 mb-1.5">
                  Contact address during leave
                  {formSettings?.mandatoryContactAddress === true && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={form.contactAddress}
                  onChange={e => set('contactAddress', e.target.value)}
                  placeholder="e.g. 123 MG Road, Pune, Maharashtra 411001"
                  className="w-full h-[38px] px-3 rounded-[9px] border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            )}
            {formSettings?.showNotifyCc !== false && (
              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 mb-1.5">
                  Notify (CC) other people <span className="text-[10.5px] font-bold text-slate-400 tracking-wider">optional</span>
                </label>
                <input
                  type="text"
                  value={form.notifyCc}
                  onChange={e => set('notifyCc', e.target.value)}
                  placeholder="e.g. hr@company.com, manager@company.com"
                  className="w-full h-[38px] px-3 rounded-[9px] border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            )}

            {/* Approver chain preview (existing component) */}
            <div className="pt-1">
              <ApproverChainPreview module="leave" leaveTypeId={form.leaveTypeId || undefined} compact />
            </div>
          </div>

          {/* Right side panel — balance preview + system checks */}
          <div className="bg-slate-50 border-t lg:border-t-0 lg:border-l border-slate-200 p-5 flex flex-col gap-3.5">
            {/* Balance preview — uses rule-based remainingDays as source of truth */}
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold text-slate-700 tracking-wide">This request impact</h3>
                {selectedType && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">{selectedType.code}</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
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
                  <p className="text-base font-extrabold text-emerald-600 leading-tight">{selectedType ? fmtNum(calc.afterApproval) : '—'}</p>
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
                  {passedCount}/{checks.length}
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
