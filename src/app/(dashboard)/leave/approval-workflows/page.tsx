'use client';

/**
 * Leave Approval Workflows — standalone page (Task 87).
 *
 * The leave approval workflow editor used to live inside the Leave Policy
 * page's "Policy Rules & Approval Workflow" tab (and as a preview tab inside
 * Leave Settings). Per the Task 87 request ("keep the approver workflows and
 * configuration in all the modules separate and remove them from the current
 * options/configurations") it now has its own page + sidebar entry, mirroring
 * the attendance module's /attendance/approval-workflows page.
 */

import { Suspense } from 'react';
import LeaveApprovalWorkflowConfig from '@/components/LeaveApprovalWorkflowConfig';

function LeaveApprovalWorkflowsContent() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary">Leave Approval Workflows</h1>
          <p className="text-sm text-thb-text-secondary mt-1">
            Multi-tier approver routing, workflow options and leave policy rules — separate from Leave Settings.
          </p>
        </div>
      </div>
      <LeaveApprovalWorkflowConfig />
    </div>
  );
}

export default function LeaveApprovalWorkflowsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-thb-text-muted">Loading Leave Approval Workflows…</div>}>
      <LeaveApprovalWorkflowsContent />
    </Suspense>
  );
}
