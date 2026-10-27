'use client';

/**
 * Approval Workflows — Task 84 (separate page)
 *
 * Owns the request-type approval chains (Regularization, WFH, Hourly
 * Permission, Gate Pass) — the multi-level approver routing, SLA windows,
 * conditional skips/auto-approvals and the per-request rule constraints.
 *
 * This was previously the "Policy Rules & Approval Workflows" tab inside
 * /attendance/settings; it is now a standalone page so policy rules
 * (/attendance/policy-rules) and approval workflows are configured in
 * separate places, as requested.
 */

import { Suspense } from 'react';
import { FiGitBranch } from 'react-icons/fi';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import WorkflowBuilderTab from '../settings/WorkflowBuilderTab';
import RegularizationReleasePanel from '@/components/attendance/RegularizationReleasePanel';

function ApprovalWorkflowsContent() {
  const { user } = useAuthStore();
  const companyId = useCompanyContextStore(s => s.effectiveCompanyId());
  // Task 161: hr_admin included — HR releases the regularization window here.
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(user?.role || '');

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <FiGitBranch className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Approval workflows are restricted to HR admins.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-teal-50">
          <FiGitBranch className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-thb-text-primary">Approval Workflows</h1>
          <p className="text-sm text-thb-text-secondary">
            Multi-level approver routing, SLA windows and rule constraints for Regularization, WFH, Hourly Permission
            and Gate Pass requests. Attendance policy rules (shifts, weekends, grace, auto-present) are configured
            separately under Attendance → Attendance Policy Rules.
          </p>
        </div>
      </div>

      {/* Task 161 — release the regularization window for all employees
          (email + in-app/mobile notifications, auto-closes at payroll cut-off) */}
      <RegularizationReleasePanel />

      <WorkflowBuilderTab companyId={companyId} />
    </div>
  );
}

export default function AttendanceApprovalWorkflowsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>}>
      <ApprovalWorkflowsContent />
    </Suspense>
  );
}
