'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { FiFileText, FiSliders, FiLayers, FiCheckSquare, FiList } from 'react-icons/fi';
import ModuleSettingsShell from '@/components/ModuleSettingsShell';
import { LeaveConfigurationContent } from '@/app/(dashboard)/leave/configuration/page';

/**
 * Leave Settings page
 *
 * Policy tab: cross-links to leave policy documents, configuration, approval workflows,
 *   leave types, and leave type mapping. Cleaned up on 2026-10-29 — removed the
 *   duplicate "Approval Workflows" link that appeared both in the top grid AND in
 *   the Leave Policy Documents section. Replaced it with a "Leave Types" link
 *   so admins have a single launchpad to every Leave Settings surface.
 * Rules tab: renders the 8-step Leave Configuration UI (same as /leave/configuration).
 */
function LeaveSettingsPageContent() {
  return (
    <ModuleSettingsShell
      moduleName="Leave"
      moduleAccent="green"
      basePath="/leave/settings"
      policy={
        <div className="space-y-4">
          {/* Top grid: Configuration + Approval Workflows (the two admin surfaces) */}
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

          {/* Leave Policy Documents + Leave Types + Leave Type Mapping
              (single row, no duplicates — Approval Workflows is already
              in the top grid above) */}
          <div className="thb-card p-5">
            <h2 className="text-base font-semibold text-thb-text-primary mb-3">Policy &amp; Types</h2>
            <p className="text-xs text-thb-text-muted mb-4">
              Manage leave policy documents, leave type definitions, and leave-type-to-payroll mapping.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link href="/leave/leave-policy?tab=documents" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                <FiFileText className="w-4 h-4 text-emerald-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Policy Documents</p>
                  <p className="text-xs text-thb-text-muted">Upload &amp; version leave policy PDFs</p>
                </div>
              </Link>
              <Link href="/leave/types" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                <FiList className="w-4 h-4 text-amber-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Leave Types</p>
                  <p className="text-xs text-thb-text-muted">Create, edit, deactivate leave types</p>
                </div>
              </Link>
              <Link href="/leave/leave-policy?tab=mapping" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                <FiLayers className="w-4 h-4 text-teal-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Leave Type Mapping</p>
                  <p className="text-xs text-thb-text-muted">Map leave types to policy rules</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      }
      rules={
        /* Rules tab renders the 8-step Leave Configuration UI
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
