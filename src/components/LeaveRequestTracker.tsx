'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  FiCheckCircle, FiClock, FiXCircle, FiLoader,
  FiX, FiInbox, FiInfo, FiActivity,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

/* ───────────────────────── Types ───────────────────────── */

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  halfDay: boolean;
  reason?: string | null;
  createdAt?: string | null;
  leaveType?: { id: string; name: string; code: string };
}

interface ApprovalStep {
  id: string;
  tier: number;
  tierLabel?: string;
  approverType?: string | null;
  approverTypeLabel?: string | null;
  action: string;
  actionByName?: string | null;
  actionByEmail?: string | null;
  comments?: string | null;
  actionAt?: string | null;
  createdAt?: string | null;
}

interface EmployeeProfile {
  id: string;
  reportingManager?: { id: string; firstName: string; lastName: string } | null;
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
  const d = createdAt ? new Date(createdAt) : new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const tail = (id || '').replace(/[^a-z0-9]/gi, '').slice(-3).toUpperCase().padStart(3, '0');
  return `LR-${yy}${mm}-${tail}`;
}

/* ───────────────────────── Component ───────────────────────── */

/**
 * LeaveRequestTracker — embedded inside the Leave Dashboard's "My Leave" tab.
 *
 * Shows the most-recent PENDING leave as a "Request in progress" hero card with
 * a 5-step progress pipeline (Submitted → Rule check → Manager approval →
 * Balance deduction → Sync to attendance & payroll), the live approval history
 * (tier label + approver + action + date), and a Cancel request button.
 *
 * Props:
 *   leaveRequests — the user's own leave requests (already filtered to self)
 *   employee — the authenticated employee profile (for manager name fallback)
 *   onCancelled — optional callback fired after a successful cancel (so the
 *                 parent dashboard can re-fetch)
 */
export default function LeaveRequestTracker({
  leaveRequests,
  employee,
  onCancelled,
}: {
  leaveRequests: LeaveRequest[];
  employee: EmployeeProfile | null;
  onCancelled?: () => void;
}) {
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  /* ── Most-recent pending leave (the "Request in progress" hero card) ── */
  const inProgressLeave = useMemo(() => {
    const pending = leaveRequests
      .filter(l => l.status === 'pending')
      .sort((a, b) => new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime());
    return pending[0] || null;
  }, [leaveRequests]);

  /* ── Fetch approval history for the in-progress leave (or latest leave) ── */
  const fetchHistory = useCallback(async () => {
    if (!inProgressLeave) {
      setApprovalSteps([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/leave/${inProgressLeave.id}/approval-history`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setApprovalSteps(data?.steps || []);
      } else {
        setApprovalSteps([]);
      }
    } catch {
      setApprovalSteps([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [inProgressLeave]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  /* ── 5-step progress bar state ── */
  const progressSteps: ProgressStep[] = useMemo(() => {
    if (!inProgressLeave) return [];
    const submittedAt = inProgressLeave.createdAt || inProgressLeave.startDate;
    const ruleCheckAt = submittedAt;
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
      // Re-fetch approval history (will become empty) + notify parent
      fetchHistory();
      onCancelled?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel leave');
    } finally {
      setCancelling(false);
    }
  };

  /* ───────────────────────── Render ───────────────────────── */

  // Empty state — no pending request
  if (!inProgressLeave) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <FiActivity className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-thb-text-primary">Leave request tracker</h3>
        </div>
        <div className="text-center py-4">
          <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-2">
            <FiInbox className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-thb-text-primary">No request in progress</p>
          <p className="text-xs text-thb-text-secondary mt-1">
            Apply for leave to start a new approval pipeline.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 to-transparent">
        <div>
          <div className="flex items-center gap-2">
            <FiActivity className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-thb-text-primary">Leave request tracker</h3>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
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
              const days = getDaysBetween(inProgressLeave.startDate, inProgressLeave.endDate);
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
        <div className="flex items-center overflow-x-auto">
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
                  <div className="flex-1 h-0.5 mx-1 -mt-7 bg-slate-200 relative min-w-[20px]">
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

        {!historyLoading && approvalSteps.length === 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-500">
            <FiInfo className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              This request is awaiting workflow setup. Approval steps will appear here once the
              workflow engine assigns tiers.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
