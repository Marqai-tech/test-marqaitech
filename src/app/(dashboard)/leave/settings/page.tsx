'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { FiFileText, FiSliders, FiLayers, FiCheckSquare } from 'react-icons/fi';
import ModuleSettingsShell from '@/components/ModuleSettingsShell';
import { LeaveConfigurationContent } from '@/app/(dashboard)/leave/configuration/page';

/**
 * Leave Settings page
 *
 * Policy tab: cross-links to leave policy documents, configuration, approval workflows
 * Rules tab: replaced with the new 8-step Leave Configuration UI
 *   (Leave Quota → Accrual → Apply Leave → Restrictions → Holidays →
 *    Approval → Year-End Processing → Encashment)
 */
function LeaveSettingsPageContent() {
  return (
    <ModuleSettingsShell
      moduleName="Leave"
      moduleAccent="green"
      basePath="/leave/settings"
      policy={
        <div className="space-y-4">
          {/* Configuration & Approval Workflows cross-links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/leave/configuration" className="thb-card p-4 flex items-start gap-3 hover:border-green-300 hover:shadow-sm transition-all group">
              <div className="p-2 rounded-lg bg-green-50 text-green-600 flex-shrink-0">
                <FiSliders className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-thb-text-primary group-hover:text-green-700">Leave Configuration</p>
                <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">
                  8-step wizard: Leave Quota, Accrual, Apply Leave, Restrictions, Holidays, Approval, Year-End Processing, Encashment.
                </p>
              </div>
            </Link>
            <Link href="/leave/approval-workflows" className="thb-card p-4 flex items-start gap-3 hover:border-violet-300 hover:shadow-sm transition-all group">
              <div className="p-2 rounded-lg bg-violet-50 text-violet-500 flex-shrink-0">
                <FiCheckSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-thb-text-primary group-hover:text-violet-700">Approval Workflows</p>
                <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">
                  Multi-tier approver chain, workflow options and leave policy rules.
                </p>
              </div>
            </Link>
          </div>

          {/* Leave Policy Documents */}
          <div className="thb-card p-5">
            <h2 className="text-base font-semibold text-thb-text-primary mb-3">Leave Policy Documents</h2>
            <p className="text-xs text-thb-text-muted mb-4">
              The Leave Policy documents (employee-facing leave policy PDFs, holiday calendar, sandwich rule
              definitions, pro-rata rules, probation restrictions) are maintained on the dedicated Leave Policy
              page.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link href="/leave/leave-policy?tab=documents" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                <FiFileText className="w-4 h-4 text-emerald-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Policy Documents</p>
                  <p className="text-xs text-thb-text-muted">View leave policy documents</p>
                </div>
              </Link>
              <Link href="/leave/approval-workflows" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                <FiSliders className="w-4 h-4 text-amber-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Approval Workflows</p>
                  <p className="text-xs text-thb-text-muted">Multi-tier approval chain, sandwich, pro-rata</p>
                </div>
              </Link>
              <Link href="/leave/leave-policy?tab=mapping" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                <FiLayers className="w-4 h-4 text-teal-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Leave Type Mapping</p>
                  <p className="text-xs text-thb-text-muted">Map leave types to payroll components</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      }
      rules={
        /* Rules tab replaced with the new 8-step Leave Configuration UI
           (Leave Quota → Accrual → Apply Leave → Restrictions → Holidays →
            Approval → Year-End Processing → Encashment) */
        <LeaveConfigurationContent />
      }
    />
  );
}

export default function LeaveSettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-thb-text-muted">Loading Leave Settings…</div>}>
      <LeaveSettingsPageContent />
    </Suspense>
  );
}
