'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiCalendar, FiCheckCircle, FiClock, FiXCircle, FiLoader,
  FiRefreshCw, FiInfo, FiUser, FiChevronRight,
  FiAlertCircle, FiInbox, FiPlus, FiX, FiActivity,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ───────────────────────── Types ───────────────────────── */

interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  halfDay: boolean;
  reason?: string | null;
  comments?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  currentApproverId?: string | null;
  workflowStage?: string | null;
  days?: number | null;
  leaveType?: { id: string; name: string; code: string };
  employee?: { id: string; firstName: string; lastName: string; employeeId: string };
}

interface ApprovalStep {
  id: string;
  tier: number;
  tierLabel?: string;
  approverType?: string | null;
  approverTypeLabel?: string | null;
  approverUserId?: string | null;
  action: string; // pending | approved | rejected | submitted
  actionByName?: string | null;
  actionByEmail?: string | null;
  comments?: string | null;
  actionAt?: string | null;
  createdAt?: string | null;
}

interface LeaveBalance {
  id: string;
  leaveType: { id: string; name: string; code: string };
  total: number;
  used: number;
  remaining: number;
  year: number;
}

interface EmployeeProfile {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  dateOfJoining?: string | null;
  employeeStatus?: string | null;
  employeeType?: string | null;
  department?: { name: string } | null;
  designation?: { title: string } | null;
  reportingManager?: { id: string; firstName: string; lastName: string } | null;
  leavePolicyId?: string | null;
}

type StepState = 'done' | 'current' | 'pending' | 'failed';
interface ProgressStep {
  key: string;
  title: string;
  subtitle: string;
  state: StepState;
}

/* ───────────────────────── Helpers ───────────────────────── */

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatDateShort(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateCompact(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysBetween(start: string, end: string) {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

function ticketCode(id: string, createdAt?: string | null) {
  // Build a deterministic ticket id like LR-YYMM-NNN from the leave id + created date.
  const d = createdAt ? new Date(createdAt) : new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const tail = (id || '').replace(/[^a-z0-9]/gi, '').slice(-3).toUpperCase().padStart(3, '0');
  return `LR-${yy}${mm}-${tail}`;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'approved':  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'pending':   return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'rejected':  return 'bg-red-50 text-red-700 border-red-200';
    case 'cancelled': return 'bg-slate-100 text-slate-600 border-slate-200';
    default:          return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/* ───────────────────────── Component ───────────────────────── */

export default function LeaveTrackerPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  // Reserved for future role-specific gating (currently all roles see their own tracker)
  void user;

  const [loading, setLoading] = useState(true);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('all');

  /* ── Fetch all data ── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      // Fetch leave requests (self view) + balances + /me in parallel
      const [leavesRes, balancesRes, meRes] = await Promise.all([
        fetch(`/api/leave?view=self&limit=100`, { headers }),
        fetch(`/api/leave/balance`, { headers }),
        fetch(`/api/auth/me`, { headers }),
      ]);

      const leavesData = await leavesRes.json().catch(() => ({}));
      const balancesData = await balancesRes.json().catch(() => ({}));
      const meData = await meRes.json().catch(() => ({}));

      const leaves: LeaveRequest[] = leavesData?.leaveRequests || leavesData?.leaves || [];
      setLeaveRequests(leaves);

      setBalances(balancesData?.balances || []);

      // Build the employee profile from /me + /api/employees/[id] enrichment
      let emp: EmployeeProfile | null = null;
      if (meData?.employee?.id) {
        emp = {
          id: meData.employee.id,
          employeeId: meData.employee.employeeId,
          firstName: meData.employee.firstName,
          lastName: meData.employee.lastName,
          dateOfJoining: null,
          employeeStatus: null,
          employeeType: null,
          department: meData.employee.department ? { name: meData.employee.department } : null,
          designation: meData.employee.designation ? { title: meData.employee.designation } : null,
          reportingManager: null,
          leavePolicyId: null,
        };
        // Enrich with the full record (dateOfJoining, reportingManager, employeeStatus, etc.)
        try {
          const empRes = await fetch(`/api/employees/${encodeURIComponent(meData.employee.id)}`, { headers });
          if (empRes.ok) {
            const empData = await empRes.json();
            const empRow = empData?.employee;
            if (empRow) {
              emp = {
                id: empRow.id || emp.id,
                employeeId: empRow.employeeId || emp.employeeId,
                firstName: empRow.firstName || emp.firstName,
                lastName: empRow.lastName || emp.lastName,
                dateOfJoining: empRow.dateOfJoining || null,
                employeeStatus: empRow.employeeStatus || null,
                employeeType: empRow.employeeType || null,
                department: empRow.department ? { name: empRow.department.name } : emp.department,
                designation: empRow.designation ? { title: empRow.designation.title } : emp.designation,
                reportingManager: empRow.reportingManager
                  ? {
                      id: empRow.reportingManager.id,
                      firstName: empRow.reportingManager.firstName,
                      lastName: empRow.reportingManager.lastName,
                    }
                  : emp.reportingManager,
                leavePolicyId: empRow.leavePolicyId || null,
              };
            }
          }
        } catch { /* non-fatal enrichment */ }
      }
      setEmployee(emp);

      // Fetch approval history for the most-recent pending leave (if any), else the latest leave
      const pendingLeaves = leaves
        .filter(l => l.status === 'pending')
        .sort((a, b) => new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime());
      const target = pendingLeaves[0] || leaves[0];
      if (target) {
        setHistoryLoading(true);
        try {
          const histRes = await fetch(`/api/leave/${target.id}/approval-history`, { headers });
          if (histRes.ok) {
            const histData = await histRes.json();
            setApprovalSteps(histData?.steps || []);
          } else {
            setApprovalSteps([]);
          }
        } catch { setApprovalSteps([]); }
        finally { setHistoryLoading(false); }
      } else {
        setApprovalSteps([]);
      }
    } catch (err) {
      console.error('[LeaveTracker] fetch error:', err);
      toast.error('Failed to load leave data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Derived: most-recent pending leave (the "Request in progress" hero card) ── */
  const inProgressLeave = useMemo(() => {
    const pending = leaveRequests
      .filter(l => l.status === 'pending')
      .sort((a, b) => new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime());
    return pending[0] || null;
  }, [leaveRequests]);

  /* ── Derived: 5-step progress bar state ── */
  const progressSteps: ProgressStep[] = useMemo(() => {
    if (!inProgressLeave) return [];
    const submittedAt = inProgressLeave.createdAt || inProgressLeave.startDate;
    const ruleCheckAt = submittedAt; // rule check happens at submission time (server validates policy rules)
    const firstApprovedStep = approvalSteps.find(s => s.action === 'approved');
    const currentStep = approvalSteps.find(s => s.action === 'pending' || (!s.actionAt && s.action !== 'approved' && s.action !== 'rejected'));

    const managerName =
      firstApprovedStep?.actionByName
      || currentStep?.actionByName
      || (employee?.reportingManager
        ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`.trim()
        : '')
      || 'Reporting Manager';

    const isApproved = inProgressLeave.status === 'approved';
    const isRejected = inProgressLeave.status === 'rejected';
    const isCancelled = inProgressLeave.status === 'cancelled';

    return [
      {
        key: 'submitted',
        title: 'Submitted',
        subtitle: formatDateCompact(submittedAt),
        state: 'done' as StepState,
      },
      {
        key: 'rule_check',
        title: 'Rule check passed',
        subtitle: ruleCheckAt ? formatDateCompact(ruleCheckAt) : '—',
        state: 'done' as StepState,
      },
      {
        key: 'manager_approval',
        title: 'Manager approval',
        subtitle: managerName,
        state: (isApproved ? 'done' : (isRejected || isCancelled ? 'failed' : 'current')) as StepState,
      },
      {
        key: 'balance_deduction',
        title: 'Balance deduction',
        subtitle: isApproved ? 'Completed' : 'After approval',
        state: (isApproved ? 'done' : 'pending') as StepState,
      },
      {
        key: 'sync_attendance_payroll',
        title: 'Send to attendance & payroll',
        subtitle: isApproved ? 'Auto-synced' : 'Automatic, after approval',
        state: (isApproved ? 'done' : 'pending') as StepState,
      },
    ];
  }, [inProgressLeave, approvalSteps, employee]);

  /* ── Derived: My leave summary stats ── */
  const summary = useMemo(() => {
    let taken = 0; // approved days this year
    let pending = 0; // pending days this year
    let lop = 0; // LOP days (approved leaveType code containing 'lop' or unpaid leave)
    const year = new Date().getFullYear();
    for (const l of leaveRequests) {
      const startYear = new Date(l.startDate).getFullYear();
      if (startYear !== year) continue;
      const days = (l.days || getDaysBetween(l.startDate, l.endDate)) * (l.halfDay ? 0.5 : 1);
      if (l.status === 'approved') {
        taken += days;
        const code = (l.leaveType?.code || '').toLowerCase();
        if (code.includes('lop') || code.includes('unpaid')) lop += days;
      } else if (l.status === 'pending') {
        pending += days;
      }
    }
    return { taken, pending, lop };
  }, [leaveRequests]);

  /* ── Derived: filtered table rows ── */
  const filteredLeaves = useMemo(() => {
    const list = filterStatus === 'all'
      ? leaveRequests
      : leaveRequests.filter(l => l.status === filterStatus);
    return [...list].sort((a, b) =>
      new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime()
    );
  }, [leaveRequests, filterStatus]);

  /* ── Cancel request ── */
  const handleCancel = async () => {
    if (!inProgressLeave) return;
    if (!confirm('Cancel this leave request? This cannot be undone.')) return;
    try {
      setCancelling(true);
      const res = await fetch(`/api/leave/${inProgressLeave.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to cancel');
      }
      toast.success('Leave request cancelled');
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel leave');
    } finally {
      setCancelling(false);
    }
  };

  /* ───────────────────────── Render ───────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto mb-4" />
          <p className="text-sm text-thb-text-secondary">Loading your leave tracker…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiActivity className="w-5 h-5 text-emerald-600" /> My Leave Tracker
          </h1>
          <p className="text-sm text-thb-text-secondary mt-0.5">
            Track your leave requests through the approval pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FiRefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => router.push('/leave/apply')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm shadow-sm transition-colors"
          >
            <FiPlus className="w-4 h-4" /> Apply Leave
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ───────── Left main column (2/3) ───────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* ── Request in progress card ── */}
          {inProgressLeave ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Card header */}
              <div className="flex items-start justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 to-transparent">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <FiClock className="w-3 h-3" /> Request in progress
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      {ticketCode(inProgressLeave.id, inProgressLeave.createdAt)}
                    </span>
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-thb-text-primary">
                    {inProgressLeave.leaveType?.name || 'Leave'} · {formatDateShort(inProgressLeave.startDate)}
                    {inProgressLeave.startDate !== inProgressLeave.endDate && (
                      <> – {formatDateShort(inProgressLeave.endDate)}</>
                    )}
                  </h2>
                  <p className="text-xs text-thb-text-secondary mt-0.5">
                    {(() => {
                      const days = inProgressLeave.days || getDaysBetween(inProgressLeave.startDate, inProgressLeave.endDate);
                      const half = inProgressLeave.halfDay ? 0.5 : 1;
                      return `${days * half} day${days * half === 1 ? '' : 's'}`;
                    })()}
                    {inProgressLeave.halfDay ? ' · Half day' : ''}
                    {inProgressLeave.reason ? ` · ${inProgressLeave.reason.slice(0, 60)}${inProgressLeave.reason.length > 60 ? '…' : ''}` : ''}
                  </p>
                </div>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {cancelling ? <FiLoader className="w-3.5 h-3.5 animate-spin" /> : <FiX className="w-3.5 h-3.5" />}
                  Cancel request
                </button>
              </div>

              {/* 5-step progress bar */}
              <div className="p-5">
                <div className="flex items-center">
                  {progressSteps.map((step, idx) => {
                    const isLast = idx === progressSteps.length - 1;
                    const icon = step.state === 'done'
                      ? <FiCheckCircle className="w-5 h-5 text-emerald-600" />
                      : step.state === 'current'
                        ? <FiLoader className="w-5 h-5 text-blue-600 animate-spin" />
                        : step.state === 'failed'
                          ? <FiXCircle className="w-5 h-5 text-red-500" />
                          : <FiClock className="w-5 h-5 text-slate-300" />;
                    return (
                      <React.Fragment key={step.key}>
                        <div className="flex flex-col items-center text-center flex-shrink-0" style={{ width: '120px' }}>
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-white border-2 ${
                            step.state === 'done' ? 'border-emerald-500 bg-emerald-50'
                            : step.state === 'current' ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-100'
                            : step.state === 'failed' ? 'border-red-500 bg-red-50'
                            : 'border-slate-200 bg-slate-50'
                          }`}>
                            {icon}
                          </div>
                          <p className={`mt-2 text-xs font-semibold ${
                            step.state === 'done' ? 'text-emerald-700'
                            : step.state === 'current' ? 'text-blue-700'
                            : step.state === 'failed' ? 'text-red-600'
                            : 'text-slate-400'
                          }`}>
                            {step.title}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{step.subtitle}</p>
                        </div>
                        {!isLast && (
                          <div className="flex-1 h-0.5 mx-1 -mt-7 bg-slate-200 relative">
                            <div
                              className={`absolute inset-y-0 left-0 ${
                                step.state === 'done' ? 'bg-emerald-500 w-full' : 'bg-slate-200 w-0'
                              } transition-all duration-500`}
                            />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {historyLoading && (
                  <p className="text-xs text-slate-500 mt-4 flex items-center gap-1.5">
                    <FiLoader className="w-3 h-3 animate-spin" /> Loading approval history…
                  </p>
                )}

                {!historyLoading && approvalSteps.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-100">
                    <p className="text-xs font-semibold text-thb-text-secondary uppercase tracking-wider mb-2">Approval history</p>
                    <ul className="space-y-1.5">
                      {approvalSteps.map((s) => (
                        <li key={s.id} className="text-xs flex items-start gap-2 text-thb-text-secondary">
                          <span className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full ${
                            s.action === 'approved' ? 'bg-emerald-500'
                            : s.action === 'rejected' ? 'bg-red-500'
                            : s.action === 'pending' || !s.actionAt ? 'bg-amber-500'
                            : 'bg-slate-300'
                          }`} />
                          <span>
                            <span className="font-medium text-thb-text-primary">{s.tierLabel || `Tier ${s.tier}`}</span>
                            {s.approverTypeLabel ? ` · ${s.approverTypeLabel}` : ''}
                            {s.actionByName ? ` · ${s.actionByName}` : ''}
                            {s.actionAt ? ` · ${formatDateCompact(s.actionAt)}` : (s.action === 'pending' || !s.actionAt ? ' · pending' : '')}
                            {s.comments ? ` · “${s.comments}”` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <FiInbox className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-base font-semibold text-thb-text-primary">No request in progress</h3>
              <p className="text-sm text-thb-text-secondary mt-1">
                You have no pending leave request right now. Apply for leave to start a new approval pipeline.
              </p>
              <button
                onClick={() => router.push('/leave/apply')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm transition-colors"
              >
                <FiPlus className="w-4 h-4" /> Apply Leave
              </button>
            </div>
          )}

          {/* ── Leave status table ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-thb-text-primary">Leave status</h2>
              <p className="text-xs text-thb-text-secondary mt-0.5">All your leave applications</p>
            </div>

            {/* Filter tabs */}
            <div className="px-5 pt-3 flex items-center gap-1 border-b border-slate-100 overflow-x-auto">
              {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map((s) => {
                const count = s === 'all' ? leaveRequests.length : leaveRequests.filter(l => l.status === s).length;
                const active = filterStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      active
                        ? 'border-emerald-500 text-emerald-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {s === 'all' ? 'All' : statusLabel(s)}
                    <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full ${
                      active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Request</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Type</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Dates</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Days</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Applied</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeaves.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm text-thb-text-muted">
                        No leave applications{filterStatus !== 'all' ? ` with status "${statusLabel(filterStatus)}"` : ''} yet.
                      </td>
                    </tr>
                  ) : (
                    filteredLeaves.map(l => {
                      const days = (l.days || getDaysBetween(l.startDate, l.endDate)) * (l.halfDay ? 0.5 : 1);
                      return (
                        <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 text-xs font-mono text-slate-600">
                            {ticketCode(l.id, l.createdAt)}
                          </td>
                          <td className="px-5 py-3 text-sm text-thb-text-primary">
                            {l.leaveType?.name || '—'}
                          </td>
                          <td className="px-5 py-3 text-sm text-thb-text-secondary">
                            {formatDateShort(l.startDate)}
                            {l.startDate !== l.endDate && <> – {formatDateShort(l.endDate)}</>}
                          </td>
                          <td className="px-5 py-3 text-sm text-thb-text-secondary">
                            {days}{l.halfDay ? ' (½)' : ''}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass(l.status)}`}>
                              {l.status === 'approved' && <FiCheckCircle className="w-3 h-3" />}
                              {l.status === 'pending' && <FiClock className="w-3 h-3" />}
                              {l.status === 'rejected' && <FiXCircle className="w-3 h-3" />}
                              {statusLabel(l.status)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-thb-text-muted text-right">
                            {formatDateShort(l.createdAt || l.startDate)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ───────── Right column — My leave summary (1/3) ───────── */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-violet-50/60 to-transparent">
              <h2 className="text-base font-bold text-thb-text-primary">My leave summary</h2>
              <p className="text-xs text-thb-text-secondary mt-0.5">Year {new Date().getFullYear()}</p>
            </div>

            {/* Stats */}
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                    <FiCheckCircle className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium text-thb-text-primary">Days taken</span>
                </div>
                <span className="text-lg font-bold text-emerald-700">{summary.taken}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50/60 border border-amber-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white">
                    <FiClock className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium text-thb-text-primary">Pending</span>
                </div>
                <span className="text-lg font-bold text-amber-700">{summary.pending}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-red-50/60 border border-red-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white">
                    <FiAlertCircle className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium text-thb-text-primary">LOP days</span>
                </div>
                <span className="text-lg font-bold text-red-700">{summary.lop}</span>
              </div>
            </div>

            {/* Details */}
            <div className="p-5 border-t border-slate-100 space-y-3">
              <p className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-1">Policy details</p>
              <div className="space-y-2.5">
                <DetailRow
                  icon={<FiInfo className="w-3.5 h-3.5" />}
                  label="Policy"
                  value={employee?.leavePolicyId ? 'Custom policy' : 'Standard Policy'}
                />
                <DetailRow
                  icon={<FiUser className="w-3.5 h-3.5" />}
                  label="Category"
                  value={
                    employee?.employeeType
                      ? formatCategory(employee.employeeType)
                      : '—'
                  }
                />
                <DetailRow
                  icon={<FiUser className="w-3.5 h-3.5" />}
                  label="Approver"
                  value={
                    employee?.reportingManager
                      ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`.trim()
                      : 'Not assigned'
                  }
                />
                <DetailRow
                  icon={<FiCalendar className="w-3.5 h-3.5" />}
                  label="Joining date"
                  value={employee?.dateOfJoining ? formatDateCompact(employee.dateOfJoining) : '—'}
                />
                <DetailRow
                  icon={<FiCalendar className="w-3.5 h-3.5" />}
                  label="Employee status"
                  value={employee?.employeeStatus ? statusLabel(employee.employeeStatus) : '—'}
                />
              </div>
            </div>

            {/* Balances preview */}
            {balances.length > 0 && (
              <div className="p-5 border-t border-slate-100">
                <p className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-2">Leave balances</p>
                <ul className="space-y-1.5">
                  {balances.slice(0, 5).map(b => (
                    <li key={b.id} className="flex items-center justify-between text-xs">
                      <span className="text-thb-text-secondary">{b.leaveType?.name || '—'}</span>
                      <span className="font-mono font-semibold text-thb-text-primary">
                        {b.remaining}<span className="text-slate-400 font-normal"> / {b.total}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => router.push('/leave/balance')}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  View full balance <FiChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Help card */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white flex-shrink-0">
                <FiInfo className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-thb-text-primary">How the approval flow works</h3>
                <ol className="mt-2 space-y-1 text-xs text-thb-text-secondary list-decimal list-inside">
                  <li>You submit a leave request.</li>
                  <li>System runs rule checks (balance, probation, sandwich rule).</li>
                  <li>Reporting manager approves / rejects.</li>
                  <li>On approval, leave balance is auto-deducted.</li>
                  <li>Synced to attendance & payroll automatically.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Small presentational helpers ── */

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs text-thb-text-muted">
        {icon} {label}
      </span>
      <span className="text-xs font-semibold text-thb-text-primary text-right">{value}</span>
    </div>
  );
}

function formatCategory(employmentType: string) {
  // "full_time" → "Full-time", "part_time" → "Part-time", etc.
  return employmentType
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
}
