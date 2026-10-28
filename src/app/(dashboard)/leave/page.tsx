'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FiCalendar, FiPlus, FiCheck, FiX, FiClock,
  FiAlertCircle, FiGrid, FiFileText, FiEye,
  FiSearch, FiUserCheck, FiUserX,
  FiDownload,
  FiRefreshCw, FiDatabase,
  FiActivity, FiCoffee, FiLayers,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { sanitizeSearch } from '@/lib/validators';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { isClientDemoMode } from '@/lib/site-mode';
import ApproverChainPreview from '@/components/ApproverChainPreview';
import LeaveRequestPanel from '@/components/LeaveRequestPanel';
import { getLeaveCategory, normalizeLeaveBalances } from '@/lib/leave-balance-rules';
/* Task 156-a — shared SmartHR widgets: same gradient banner + white stat
   cards / panels as the Employee module dashboard restyle (Task 155). */
import { PageBreadcrumbs, DateChip, Panel, StatCard } from '@/components/dashboard/smarthr-widgets';

/* ── Types ── */
interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: string;
  halfDay: boolean;
  comments?: string | null;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string; avatar?: string | null; department?: { name: string } | null };
  leaveType?: { id: string; name: string; code: string };
  employeeId: string;
  leaveTypeId: string;
  // Workflow fields (added by Task 36 multi-tier approval workflow)
  currentApproverId?: string | null;
  workflowStage?: string | null;
}

interface LeaveBalance {
  id: string;
  total: number;
  used: number;
  remaining: number;
  year: number;
  leaveType: { id: string; name: string; code: string };
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  defaultDays: number;
  isPaid: boolean;
}

interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeStatus?: string;
  dateOfJoining?: string | null;
  gender?: string | null;
  leaveBalances?: LeaveBalance[];
}

function isActiveProbation(employee: Employee | null) {
  if (!employee?.employeeStatus?.toLowerCase().includes('probation') || !employee.dateOfJoining) return false;
  const end = new Date(employee.dateOfJoining);
  end.setMonth(end.getMonth() + 6);
  return end.getTime() > Date.now();
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

function getStatusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Pending' },
    approved: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Approved' },
    rejected: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Rejected' },
    cancelled: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', label: 'Cancelled' },
  };
  return map[status] || { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: status };
}

function getDaysBetween(start: string, end: string, holidayDates: Set<string> = new Set()) {
  // BUG FIX: exclude weekends (Sat+Sun) and configured holidays from the
  // displayed duration — matches the server-side working-day computation
  // that drives balance deduction.
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  let count = 0;
  const cursor = new Date(s.getTime());
  let guard = 0;
  while (cursor <= e && guard < 4000) {
    guard++;
    const dow = cursor.getUTCDay();
    const dateStr = cursor.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function getAvatarGradient(name: string) {
  const colors = [
    'from-green-500 to-cyan-500', 'from-teal-500 to-teal-500',
    'from-emerald-500 to-teal-500', 'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500', 'from-emerald-500 to-green-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const initialForm = {
  leaveTypeId: '',
  startDate: '',
  endDate: '',
  reason: '',
  halfDay: false,
  halfDaySlot: 'first_half' as 'first_half' | 'second_half',
};

/* ── Component ── */
function LeavePageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(user?.role || '');

  // Task 66: read URL params for auto-open form + self-view filtering
  const actionParam = searchParams.get('action'); // 'apply' → auto-open the form
  const viewParam = searchParams.get('view'); // 'self' → show only MY applications (even for admins)

  // Bug fix: a non-admin user can still be the assigned workflow approver for
  // a pending leave request (currentApproverId === user.id). They need to see
  // the Approve/Reject buttons in their own leave list — otherwise they only
  // get the email and can act via the action link, but the in-app leave module
  // page would show no actionable buttons.
  const canApproveLeave = (lr: any) =>
    lr?.status === 'pending' &&
    (isAdmin || lr?.currentApproverId === user?.id);
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const handleSeedData = async () => {
    try {
      setSeeding(true);
      const res = await fetch('/api/admin/seed-demo-data', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ module: 'leave' }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast.success(data.message || 'Leave demo data seeded');
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to seed');
    } finally {
      setSeeding(false);
    }
  };

  const [actionRowId, setActionRowId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approved' | 'rejected' | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actioning, setActioning] = useState(false);

  // View Leave Application (detail modal + approval history)
  const [viewTarget, setViewTarget] = useState<LeaveRequest | null>(null);
  const [viewSteps, setViewSteps] = useState<Array<{ id: string; tier: number; tierLabel: string; approverTypeLabel?: string; action: string; actionByName?: string | null; actionByEmail?: string | null; comments?: string | null; actionAt?: string | null; createdAt?: string | null }>>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const handleView = async (lr: LeaveRequest) => {
    setViewTarget(lr);
    setViewSteps([]);
    setViewLoading(true);
    try {
      const res = await fetch(`/api/leave/${lr.id}/approval-history`, { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setViewSteps(d.steps || []);
      }
    } catch { /* modal still shows the application details */ }
    finally { setViewLoading(false); }
  };

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLeaveType, setFilterLeaveType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Holidays overlay (REQ-LVE-03)
  const [holidays, setHolidays] = useState<Array<{ id: string; name: string; date: string; type: string }>>([]);
  // AI collaborative check (REQ-LVE-04)
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [aiWarningLoading, setAiWarningLoading] = useState(false);

  /* Fetch data */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const sq = scopeQuery();
      // Task 66: when view=self, add &view=self to the API call so the server
      // returns only the current user's own leave applications (even for admins).
      const viewParamStr = viewParam === 'self' ? '&view=self' : '';
      // This page uses only the signed-in user's employee profile. Ask the API
      // for that single authenticated record instead of loading the tenant's
      // full employee directory for HR users.
      const [leaveRes, empRes] = await Promise.all([
        fetch(`/api/leave?limit=100${sq ? `&${sq}` : ''}${viewParamStr}`, { headers }),
        fetch(`/api/employees?limit=1&own=1&includePhotos=0${sq ? `&${sq}` : ''}`, { headers }),
      ]);
      if (leaveRes.ok) {
        const data = await leaveRes.json();
        setLeaveRequests(data.leaveRequests || []);
      }
      if (empRes.ok) {
        const empData = await empRes.json();
        const myEmp = empData.employees?.find((e: { email: string }) => e.email === user?.email);
        const ltMap = new Map<string, LeaveType>();
        (empData.employees || []).forEach((e: Employee) => {
          e.leaveBalances?.forEach((lb: LeaveBalance) => {
            ltMap.set(lb.leaveType.id, { ...lb.leaveType, defaultDays: 0, isPaid: true });
          });
        });

        // Balances and the leave-type fallback do not depend on one another;
        // fetch them together instead of making the employee wait through two
        // database round trips in sequence.
        const balanceRequest = myEmp
          ? fetch(`/api/leave/balance?limit=50${sq ? `&${sq}` : ''}`, { headers })
          : Promise.resolve(null);
        const leaveTypesRequest = ltMap.size === 0
          ? fetch(`/api/leave-types?limit=50${sq ? `&${sq}` : ''}`, { headers }).catch(() => null)
          : Promise.resolve(null);
        const [balanceRes, ltRes] = await Promise.all([balanceRequest, leaveTypesRequest]);

        if (myEmp) {
          // The list endpoint already includes the scalar profile fields used
          // here, including gender, probation status, and date of joining.
          // Avoid a second, heavier employee-detail request for the same row.
          setEmployee(myEmp);
          const probation = isActiveProbation(myEmp);
          const balanceData = balanceRes?.ok ? await balanceRes.json() : null;
          const currentBalances = balanceData?.balances || myEmp.leaveBalances || [];
          const normalizedBalances = normalizeLeaveBalances(currentBalances as LeaveBalance[], {
            gender: myEmp.gender || balanceData?.gender,
            probation,
          });
          if (probation && !normalizedBalances.some((lb) => getLeaveCategory(lb.leaveType) === 'personal')) {
            normalizedBalances.push({ id: 'synthetic-personal-leave', leaveType: { id: 'synthetic-personal-leave', name: 'Personal Leave', code: 'PL' }, total: 0, used: 0, remaining: 0, year: new Date().getFullYear() });
          }
          setLeaveBalances(normalizedBalances);
        }
        if (ltMap.size === 0) {
          // Fetch REAL leave types from /api/leave-types on BOTH demo and live.
          // (2026-09-09 FIX: this block used to inject hardcoded FAKE ids
          // ('lt_cl', 'lt_sl', ...) on the demo site. Submitting with a fake id
          // violated LeaveRequest.leaveTypeId_fkey → "Internal server error" on
          // every employee self-service apply. Never send ids that are not real
          // LeaveType rows.)
          try {
            if (ltRes?.ok) {
              const ltData = await ltRes.json();
              const realTypes = (ltData.leaveTypes || ltData.data || []).map((lt: any) => ({
                id: lt.id,
                name: lt.name,
                code: lt.code,
                defaultDays: lt.defaultDays || 0,
                isPaid: lt.isPaid ?? true,
              }));
              setLeaveTypes(realTypes);
            } else {
              setLeaveTypes([]);
            }
          } catch {
            setLeaveTypes([]);
          }
        } else {
          setLeaveTypes(Array.from(ltMap.values()));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load leave data');
    } finally {
      setLoading(false);
    }
  }, [user?.email, scopeQuery, selectedTenantId, viewParam]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);

  // Task 66: auto-open the Apply Leave form when ?action=apply is in the URL
  useEffect(() => {
    if (actionParam === 'apply') {
      setShowForm(true);
    }
  }, [actionParam]);

  /* Holiday overlay */
  useEffect(() => {
    if (showForm) {
      const sq = scopeQuery();
      fetch(`/api/holidays${sq ? `?${sq}` : ''}`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(d => {
          const list = Array.isArray(d) ? d : (d.holidays || d.data || []);
          setHolidays(list.map((h: { id: string; name: string; date: string; type: string }) => ({ id: h.id, name: h.name, date: h.date, type: h.type })));
        })
        .catch(() => { /* non-fatal */ });
    }
  }, [showForm, scopeQuery, selectedTenantId]);

  /* AI collaborative check */
  useEffect(() => {
    if (!employee?.id || !form.startDate || !form.endDate) {
      setAiWarning(null);
      return;
    }
    setAiWarningLoading(true);
    const ctrl = new AbortController();
    const sq = scopeQuery();
    fetch(`/api/leave/collaborative-check${sq ? `?${sq}` : ''}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ employeeId: employee.id, startDate: form.startDate, endDate: form.endDate }),
      signal: ctrl.signal,
    })
      .then(r => r.json())
      .then(d => setAiWarning(d.warning || null))
      .catch(() => setAiWarning(null))
      .finally(() => setAiWarningLoading(false));
    return () => ctrl.abort();
  }, [employee?.id, form.startDate, form.endDate, scopeQuery, selectedTenantId]);

  /* Actions */
  const handleOpenApplyForm = () => {
    setForm(initialForm);
    setShowForm(true);
    setActionRowId(null);
    setAiWarning(null);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setForm(initialForm);
    setAiWarning(null);
  };

  /* Export Leave Data */
  const getExportRows = () => filteredLeaves.map(l => ({
    'Employee ID': l.employee?.employeeId || '',
    'Employee Name': l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : '',
    'Department': l.employee?.department?.name || '',
    'Leave Type': l.leaveType?.name || '',
    'Start Date': l.startDate ? new Date(l.startDate).toLocaleDateString() : '',
    'End Date': l.endDate ? new Date(l.endDate).toLocaleDateString() : '',
    'Duration (Days)': getDaysBetween(l.startDate, l.endDate),
    'Half Day': l.halfDay ? 'Yes' : 'No',
    'Status': l.status,
    'Reason': l.reason || '',
  }));

  const handleExportCSV = () => {
    const rows = getExportRows();
    if (rows.length === 0) { toast.error('No data to export'); return; }
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => headers.map(h => {
        const val = row[h as keyof typeof row];
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      }).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `leave-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  const handleExportExcel = async () => {
    const rows = getExportRows();
    if (rows.length === 0) { toast.error('No data to export'); return; }
    try {
      const token = localStorage.getItem('tb_token');
      const res = await fetch(`/api/reports/export?token=${encodeURIComponent(token || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reportType: 'leave', format: 'excel', data: rows }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `leave-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast.success('Excel exported successfully');
    } catch { toast.error('Excel export failed'); }
  };

  const handleExportPDF = async () => {
    const rows = getExportRows();
    if (rows.length === 0) { toast.error('No data to export'); return; }
    try {
      const token = localStorage.getItem('tb_token');
      const res = await fetch(`/api/reports/export?token=${encodeURIComponent(token || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reportType: 'leave', format: 'pdf', data: rows }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `leave-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast.success('PDF exported successfully');
    } catch { toast.error('PDF export failed'); }
  };

  const holidaysInRange = (() => {
    if (!form.startDate || !form.endDate) return [];
    const s = new Date(form.startDate);
    const e = new Date(form.endDate);
    return holidays.filter(h => {
      const hd = new Date(h.date);
      return hd >= s && hd <= e;
    });
  })();

  // BUG FIX: block past dates in the apply form (client-side guard — the
  // server enforces the same rule authoritatively).
  const todayStr = new Date().toLocaleDateString('en-CA');
  // SmartHR banner date chip
  const todayChip = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const handleApply = async () => {
    if (!form.leaveTypeId || !form.startDate || !form.endDate) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!employee?.id) {
      toast.error('Employee record not found');
      return;
    }
    if (form.startDate < todayStr) {
      toast.error(`Leave cannot be applied for past dates. Please select today (${todayStr}) or a future date.`);
      return;
    }
    if (form.endDate < form.startDate) {
      toast.error('End date cannot be before start date');
      return;
    }

    // ─── BUG_061/062/063: client-side balance validation ───
    // Mirrors the server-side checks in /api/leave POST. Gives instant
    // feedback without a round-trip. The server is still the source of
    // truth (re-validates on submit).
    const selectedBalance = leaveBalances.find(lb => lb.leaveType.id === form.leaveTypeId);
    if (selectedBalance) {
      // Compute requested working days (rough estimate — server will
      // compute the exact number with weekend/holiday exclusion).
      const startD = new Date(form.startDate);
      const endD = new Date(form.endDate);
      const rawDays = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const requestedDays = form.halfDay ? Math.max(0.5, rawDays * 0.5) : rawDays;

      if (selectedBalance.remaining === 0) {
        toast.error(`No leave balance available for the selected leave type ("${selectedBalance.leaveType.name}"). Please choose an unpaid leave type (LOP) or contact HR to adjust your balance.`);
        return;
      }
      if (requestedDays > selectedBalance.remaining) {
        toast.error(`Insufficient leave balance. Available balance: ${selectedBalance.remaining} day(s). Requested leave: ${requestedDays} day(s).`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: employee.id,
          leaveTypeId: form.leaveTypeId,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason,
          halfDay: form.halfDay,
          halfDaySlot: form.halfDay ? form.halfDaySlot : null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const d = await res.json().catch(() => ({}));
      toast.success(d.days !== undefined ? `Leave request submitted successfully (${d.days} working day(s) counted)` : 'Leave request submitted successfully');
      handleCancelForm();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAction = (id: string, action: 'approved' | 'rejected') => {
    setActionRowId(id);
    setActionType(action);
    setActionComment('');
    setShowForm(false);
  };

  const handleCancelAction = () => {
    setActionRowId(null);
    setActionType(null);
    setActionComment('');
  };

  const handleAction = async () => {
    if (!actionRowId || !actionType) return;
    try {
      setActioning(true);
      const res = await fetch(`/api/leave/${actionRowId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: actionType, comments: actionComment }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      toast.success(`Leave ${actionType === 'approved' ? 'approved' : 'rejected'} successfully`);
      handleCancelAction();
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActioning(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Leave cancelled');
      fetchData();
    } catch {
      toast.error('Failed to cancel leave');
    }
  };

  /* Computed stats */
  const pendingCount = leaveRequests.filter(l => l.status === 'pending').length;
  const approvedThisMonth = leaveRequests.filter(l => {
    if (l.status !== 'approved') return false;
    const d = new Date(l.startDate);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const rejectedThisMonth = leaveRequests.filter(l => {
    if (l.status !== 'rejected') return false;
    const d = new Date(l.startDate);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  /* ── Task 157 — SmartHR leaves template: Total Present = workforce minus
   * employees on approved leave covering TODAY (distinct employees). ── */
  const [workforceTotal, setWorkforceTotal] = useState<number | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const sq = scopeQuery();
        const res = await fetch(`/api/employees?limit=1&status=active${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders(), cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        setWorkforceTotal(d?.stats?.active ?? d?.stats?.total ?? d?.pagination?.total ?? 0);
      } catch { /* non-fatal — card falls back to '—' */ }
    })();
  }, [isAdmin, scopeQuery, selectedTenantId]);
  const onLeaveToday = new Set(
    leaveRequests
      .filter(l => l.status === 'approved')
      .filter(l => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return new Date(l.startDate) <= today && today <= new Date(l.endDate);
      })
      .map(l => l.employeeId)
  ).size;
  // Template header totals (employee view): sum of own balances
  const balanceTotal = leaveBalances.reduce((s, lb) => s + (isActiveProbation(employee) ? 0 : lb.total), 0);
  const balanceRemaining = leaveBalances.reduce((s, lb) => s + (isActiveProbation(employee) ? 0 : lb.remaining), 0);

  /* Filtered leaves for table */
  const filteredLeaves = leaveRequests.filter(lr => {
    if (searchQuery) {
      const name = lr.employee ? `${lr.employee.firstName} ${lr.employee.lastName}`.toLowerCase() : '';
      if (!name.includes(searchQuery.toLowerCase()) && !(lr.employee?.employeeId || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
    }
    if (filterLeaveType && lr.leaveType?.id !== filterLeaveType) return false;
    if (filterStatus && lr.status !== filterStatus) return false;
    if (dateRange.from && new Date(lr.startDate) < new Date(dateRange.from)) return false;
    if (dateRange.to && new Date(lr.endDate) > new Date(dateRange.to)) return false;
    return true;
  });

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {isActiveProbation(employee) && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-5 py-4">
          <h2 className="font-bold text-emerald-800">Probationary Employee – 6 Months</h2>
          <p className="mt-1 text-sm text-emerald-700">All leave balances, including the applicable maternity or paternity leave, are zero during probation. Loss of Pay (LOP) requests require prior approval.</p>
        </div>
      )}
      {/* ── Header — SmartHR gradient breadcrumb banner (Task 156-a) ── */}
      <PageBreadcrumbs
        title={viewParam === 'self' ? 'My Leave Applications' : 'Leave Dashboard'}
        trail={['Leave', 'Dashboard']}
        right={
          <>
            <DateChip value={todayChip} />
            <button onClick={handleExportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/15 border border-white/25 text-white hover:bg-white/25 transition-colors">
              <FiDownload className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={handleExportExcel} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/15 border border-white/25 text-white hover:bg-white/25 transition-colors">
              <FiDownload className="w-3.5 h-3.5" /> Excel
            </button>
            <button onClick={handleExportPDF} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/15 border border-white/25 text-white hover:bg-white/25 transition-colors">
              <FiDownload className="w-3.5 h-3.5" /> PDF
            </button>
            {isClientDemoMode() && (
              <button onClick={handleSeedData} disabled={seeding} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/15 border border-white/25 text-white hover:bg-white/25 disabled:opacity-50 transition-colors">
                {seeding ? <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FiDatabase className="w-3.5 h-3.5" />}
                {seeding ? 'Seeding...' : 'Seed Sample Data'}
              </button>
            )}
            <button onClick={handleOpenApplyForm} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[#FF9B44] to-[#FFC107] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-all">
              <FiPlus className="w-4 h-4" />
              Add Leave
            </button>
          </>
        }
      />

      {/* ── Stat Cards — SmartHR leaves template (Task 157): Total Present is
          workforce minus employees on approved leave covering today ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Present"
          value={isAdmin && workforceTotal != null && workforceTotal > 0 ? `${Math.max(0, workforceTotal - onLeaveToday)}/${workforceTotal}` : '—'}
          sub={isAdmin && workforceTotal != null && workforceTotal > 0 ? `${onLeaveToday} on approved leave today` : 'Present workforce today'}
          icon={<FiUserCheck className="w-5 h-5" />}
          bg="bg-[#10B981]/10 text-[#10B981]"
          ring="ring-[#10B981]/20"
        />
        <StatCard
          label="Planned Leaves"
          value={approvedThisMonth}
          sub="Approved"
          icon={<FiCalendar className="w-5 h-5" />}
          bg="bg-[#FF9B44]/10 text-[#FF9B44]"
          ring="ring-[#FF9B44]/20"
        />
        <StatCard
          label="Unplanned Leaves"
          value={rejectedThisMonth}
          sub="Rejected"
          icon={<FiUserX className="w-5 h-5" />}
          bg="bg-[#F43F5E]/10 text-[#F43F5E]"
          ring="ring-[#F43F5E]/20"
        />
        <StatCard
          label="Pending Requests"
          value={pendingCount}
          sub="Pending"
          icon={<FiClock className="w-5 h-5" />}
          bg="bg-[#3A57C4]/10 text-[#3A57C4]"
          ring="ring-[#3A57C4]/20"
        />
      </div>

      {/* ── Leave Balance Cards — SmartHR leaves-employee template (Task 157):
          big remaining number + "Remaining Leaves" subline per type ── */}
      {leaveBalances.length > 0 && (
        <Panel title="Leave Balance" icon={<FiGrid className="w-4 h-4" />} accent="text-[#10B981]" action={
          (!isAdmin || viewParam === 'self') ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 text-slate-600">Total Leaves : <strong className="text-slate-800">{balanceTotal}</strong></span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700">Total Remaining Leaves : <strong>{balanceRemaining}</strong></span>
            </div>
          ) : undefined
        }>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
          {leaveBalances.slice().sort((a, b) => {
            const order = ['casual leave', 'sick leave', 'earned leave', 'personal leave', 'loss of pay'];
            return (order.indexOf(a.leaveType?.name?.toLowerCase() || '') + 10) - (order.indexOf(b.leaveType?.name?.toLowerCase() || '') + 10);
          }).map((lb, idx) => {
            const usedPct = lb.total > 0 ? (lb.used / lb.total) * 100 : 0;
            const barColor = usedPct > 80 ? 'bg-red-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-emerald-500';
              const blocked = isActiveProbation(employee);
              const isLop = /loss of pay|lop/i.test(`${lb.leaveType.name} ${lb.leaveType.code}`);
              const accents = ['from-[#3A57C4] to-[#6C9BF5]', 'from-[#10B981] to-[#34D399]', 'from-[#FF9B44] to-[#FFC107]', 'from-[#6C4FD6] to-[#9F7AEA]'];
              const tileIcons = [FiCalendar, FiActivity, FiCoffee, FiLayers];
              const TileIcon = tileIcons[idx % tileIcons.length];
              return (
              <React.Fragment key={lb.id}>
              <div className="relative bg-white rounded-xl border border-slate-200 p-4 overflow-hidden hover:shadow-md transition-shadow">
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accents[idx % accents.length]} opacity-80`} />
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-800 truncate">{lb.leaveType.name}</h4>
                    <span className="text-[10px] font-mono text-slate-400">{lb.leaveType.code}</span>
                  </div>
                  <span className="w-10 h-10 rounded-full bg-slate-50 ring-1 ring-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                    <TileIcon className="w-5 h-5" />
                  </span>
                </div>
                <p className="text-3xl font-extrabold text-slate-900 leading-none">{blocked ? 0 : lb.remaining}</p>
                <p className="text-xs text-slate-500 mt-2">Remaining Leaves : <span className="font-bold text-slate-700">{blocked ? 0 : lb.remaining}</span></p>
                <p className="text-[11px] text-slate-400 mt-0.5">Used : {blocked ? 0 : lb.used} · Total : {blocked ? 0 : lb.total}</p>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                  <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
                </div>
              </div>
                {isLop && isActiveProbation(employee) && <p className="mt-2 text-[10px] font-semibold text-sky-600">Available for request · Prior approval required</p>}
              </React.Fragment>
            );
          })}
        </div>
        </Panel>
      )}

      {/* ── Apply Leave Form (Redesigned — LeaveRequestPanel) ── */}
      {showForm && (
        <LeaveRequestPanel
          form={form}
          setForm={setForm}
          leaveTypes={leaveTypes}
          leaveBalances={leaveBalances}
          holidays={holidays}
          employeeId={employee?.id || ''}
          employeeName={`${employee?.firstName || ''} ${employee?.lastName || ''}`.trim()}
          employeeDateOfBirth={(employee as any)?.dateOfBirth || null}
          scopeQuery={scopeQuery()}
          onCancel={handleCancelForm}
          onSubmit={handleApply}
          submitting={submitting}
          todayStr={todayStr}
        />
      )}
      <Panel
        title="Leave List"
        icon={<FiFileText className="w-4 h-4" />}
        accent="text-[#3A57C4]"
        action={
          <div className="flex items-center gap-2 flex-wrap">
              {/* Date Range */}
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600">
                <FiCalendar className="w-3.5 h-3.5 text-slate-400" />
                <input type="date" value={dateRange.from} onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))} className="border-0 p-0 text-xs w-24 focus:outline-none" placeholder="From" />
                <span>—</span>
                <input type="date" value={dateRange.to} onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))} className="border-0 p-0 text-xs w-24 focus:outline-none" placeholder="To" />
              </div>

              {/* Leave Type Filter */}
              <select value={filterLeaveType} onChange={e => setFilterLeaveType(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-green-500/20">
                <option value="">Leave Type</option>
                {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
              </select>

              {/* Status Filter */}
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-green-500/20">
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>

              {/* Search */}
              <div className="relative">
                <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(sanitizeSearch(e.target.value))} placeholder="Search employee..." className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-green-500/20" />
              </div>
          </div>
        }
      >

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Leave Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">From</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">To</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">No of Days</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 animate-pulse">
                    <td className="px-4 py-3"><div className="w-3.5 h-3.5 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-slate-200 rounded-full" /><div><div className="h-3 w-24 bg-slate-200 rounded mb-1" /><div className="h-2.5 w-16 bg-slate-100 rounded" /></div></div></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-8 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredLeaves.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <FiCalendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No leave requests found</p>
                    <p className="text-xs text-slate-400 mt-1">Apply for leave using the &quot;Add Leave&quot; button above</p>
                  </td>
                </tr>
              ) : (
                filteredLeaves.map(lr => {
                  const isActionRow = actionRowId === lr.id;
                  const fullName = lr.employee ? `${lr.employee.firstName} ${lr.employee.lastName}`.trim() : 'Unknown';
                  const dept = lr.employee?.department?.name || '—';
                  const badge = getStatusBadge(lr.status);

                  return (
                    <tr key={lr.id} className={`border-b border-slate-50 transition-colors ${isActionRow ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarGradient(fullName)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                            {fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{fullName}</p>
                            <p className="text-xs text-slate-400">{dept}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-slate-700">{lr.leaveType?.name || 'Leave'}</span>
                          {lr.halfDay && <span className="text-[10px] text-slate-400">(Half)</span>}
                          {lr.reason && (
                            <span className="relative group">
                              <FiAlertCircle className="w-3.5 h-3.5 text-green-400 cursor-help" />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-slate-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 max-w-[200px] truncate">
                                {lr.reason}
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDate(lr.startDate)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDate(lr.endDate)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 font-medium">{getDaysBetween(lr.startDate, lr.endDate)} Days</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                        {(lr as any).workflowStage && (lr as any).workflowStage !== 'final_approval' && (lr as any).workflowStage !== 'rejected' && (
                          <span className="block mt-1 text-[10px] text-slate-500 font-medium">
                            {(lr as any).workflowStage.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isActionRow && actionType ? (
                          <div className={`rounded-lg border p-3 ${actionType === 'approved' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="flex items-start gap-2 mb-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${actionType === 'approved' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                                {actionType === 'approved' ? <FiCheck className="w-3.5 h-3.5 text-emerald-500" /> : <FiX className="w-3.5 h-3.5 text-red-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-semibold text-slate-800">{actionType === 'approved' ? 'Approve' : 'Reject'} Leave</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">{lr.leaveType?.name} · {formatDate(lr.startDate)} – {formatDate(lr.endDate)}</p>
                              </div>
                            </div>
                            <textarea rows={2} value={actionComment} onChange={e => setActionComment(e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs mb-2 resize-none focus:outline-none focus:ring-1 focus:ring-green-500/20" placeholder="Add comment (optional)..." />
                            <div className="flex items-center gap-1.5">
                              <button onClick={handleAction} disabled={actioning} className={`px-2.5 py-1 text-white text-[10px] font-medium rounded disabled:opacity-50 ${actionType === 'approved' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}>
                                {actioning ? 'Processing...' : 'Confirm'}
                              </button>
                              <button onClick={handleCancelAction} className="px-2.5 py-1 border border-slate-200 text-[10px] font-medium rounded hover:bg-white">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleView(lr)} className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors" title="View Leave Application">
                              <FiEye className="w-4 h-4" />
                            </button>
                            {isAdmin && lr.status === 'pending' && (
                              <>
                                <button onClick={() => handleOpenAction(lr.id, 'approved')} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Approve">
                                  <FiCheck className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleOpenAction(lr.id, 'rejected')} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Reject">
                                  <FiX className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {/* Bug fix: non-admin ASSIGNED APPROVER (currentApproverId === me)
                                can also approve/reject from their own leave list — same buttons. */}
                            {!isAdmin && canApproveLeave(lr) && lr.employeeId !== employee?.id && (
                              <>
                                <button onClick={() => handleOpenAction(lr.id, 'approved')} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Approve (Tier)">
                                  <FiCheck className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleOpenAction(lr.id, 'rejected')} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Reject (Tier)">
                                  <FiX className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {lr.status === 'pending' && lr.employeeId === employee?.id && (
                              <button onClick={() => handleCancel(lr.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Cancel">
                                <FiX className="w-4 h-4" />
                              </button>
                            )}
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

        {/* Table Footer */}
        {filteredLeaves.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {filteredLeaves.length} of {leaveRequests.length} entries</span>
            <div className="flex items-center gap-1">
              <button className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors">Previous</button>
              <button className="px-2.5 py-1 rounded bg-[#3A57C4] text-white">1</button>
              <button className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors">Next</button>
            </div>
          </div>
        )}
      </Panel>

      {/* ─── View Leave Application Modal ─── */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50" onClick={() => setViewTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Leave Application</h3>
                <p className="text-xs text-slate-400 mt-0.5">Request ID: {viewTarget.id}</p>
              </div>
              <button onClick={() => setViewTarget(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="Close">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Application summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Employee</p>
                  {(() => {
                    const fullName = viewTarget.employee ? `${viewTarget.employee.firstName} ${viewTarget.employee.lastName}`.trim() : 'Unknown';
                    return (
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarGradient(fullName)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                          {fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{fullName}</p>
                          <p className="text-xs text-slate-400 truncate">{viewTarget.employee?.employeeId || '—'}{viewTarget.employee?.department ? ` · ${viewTarget.employee.department.name}` : ''}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Leave Type</p>
                  <p className="text-sm font-medium text-slate-800">{viewTarget.leaveType?.name || 'Leave'}</p>
                  {viewTarget.leaveType?.code && <p className="text-xs text-slate-400">{viewTarget.leaveType.code}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                  {(() => {
                    const badge = getStatusBadge(viewTarget.status);
                    return (
                      <>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.bg} ${badge.text}`}>{badge.label}</span>
                        {(viewTarget as any).workflowStage && (viewTarget as any).workflowStage !== 'final_approval' && (viewTarget as any).workflowStage !== 'rejected' && (
                          <p className="text-[10px] text-slate-500 mt-1 capitalize">{(viewTarget as any).workflowStage.replace(/_/g, ' ')}</p>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">From</p>
                  <p className="text-sm text-slate-700">{formatDate(viewTarget.startDate)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">To</p>
                  <p className="text-sm text-slate-700">{formatDate(viewTarget.endDate)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Duration</p>
                  <p className="text-sm text-slate-700">{getDaysBetween(viewTarget.startDate, viewTarget.endDate)} day(s){viewTarget.halfDay ? ' · Half day' : ''}</p>
                </div>
              </div>

              {/* Reason */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reason</p>
                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 min-h-[38px]">{viewTarget.reason || '—'}</p>
              </div>

              {/* Comments */}
              {viewTarget.comments && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Comments</p>
                  <p className="text-sm text-slate-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">{viewTarget.comments}</p>
                </div>
              )}

              {/* Approval history */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Approval History</p>
                {viewLoading ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
                    <FiRefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading approval history...
                  </div>
                ) : viewSteps.length === 0 ? (
                  <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                    No multi-tier workflow steps recorded for this request.
                    {viewTarget.status === 'approved' && ' Approved by the configured approver.'}
                    {viewTarget.status === 'pending' && ' Awaiting manager decision.'}
                  </div>
                ) : (
                  <ol className="space-y-2">
                    {viewSteps.map(step => (
                      <li key={step.id} className="flex items-start gap-3 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${step.action === 'approved' ? 'bg-emerald-100 text-emerald-600' : step.action === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-500'}`}>
                          {step.tier}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-700">
                            {step.tierLabel}
                            {step.approverTypeLabel ? <span className="font-normal text-slate-400"> · {step.approverTypeLabel}</span> : null}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {step.action ? <span className={`font-medium ${step.action === 'approved' ? 'text-emerald-600' : step.action === 'rejected' ? 'text-red-500' : 'text-slate-500'}`}>{step.action}</span> : 'pending'}
                            {step.actionByName ? ` by ${step.actionByName}` : ''}
                            {step.actionAt ? ` · ${formatDate(step.actionAt)}` : ''}
                          </p>
                          {step.comments && <p className="text-[11px] text-slate-500 mt-0.5 italic">&ldquo;{step.comments}&rdquo;</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setViewTarget(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeavePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>}>
      <LeavePageContent />
    </Suspense>
  );
}
