'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { FiFileText, FiLayers, FiCheckSquare, FiList, FiSettings } from 'react-icons/fi';
import ModuleSettingsShell from '@/components/ModuleSettingsShell';

/**
 * Leave Settings page
 *
 * Policy tab: cross-links to leave policy documents, approval workflows,
 * leave types, and leave type mapping.
 *
 * The /leave/configuration page (8-step wizard) has been REMOVED — its
 * functionality is covered by /leave/types (leave type CRUD) +
 * /leave/approval-workflows (workflow config) + /leave/leave-policy
 * (policy rules). The Rules tab now shows a simple info card pointing
 * to those pages.
 */
function LeaveSettingsPageContent() {
  return (
    <ModuleSettingsShell
      moduleName="Leave"
      moduleAccent="green"
      basePath="/leave/settings"
      policy={
        <div className="space-y-4">
          {/* Top grid: Approval Workflows + Leave Types */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <Link href="/leave/types" className="thb-card p-4 flex items-start gap-3 hover:border-green-300 hover:shadow-sm transition-all group">
              <div className="p-2 rounded-lg bg-green-50 text-green-600 flex-shrink-0">
                <FiList className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-thb-text-primary group-hover:text-green-700">Leave Types</p>
                <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">
                  Create, edit, and deactivate leave types. Set quotas, carry-forward, paid/unpaid.
                </p>
              </div>
            </Link>
          </div>

          {/* Policy Documents + Leave Type Mapping */}
          <div className="thb-card p-5">
            <h2 className="text-base font-semibold text-thb-text-primary mb-3">Policy &amp; Types</h2>
            <p className="text-xs text-thb-text-muted mb-4">
              Manage leave policy documents, leave type definitions, and leave-type-to-payroll mapping.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link href="/leave/leave-policy?tab=documents" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                <FiFileText className="w-4 h-4 text-emerald-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Policy Documents</p>
                  <p className="text-xs text-thb-text-muted">Upload &amp; version leave policy PDFs</p>
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
        /* Rules tab — simple info card pointing to the relevant config pages */
        <div className="thb-card p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-4">
            <FiSettings className="w-6 h-6 text-green-600" />
          </div>
          <p className="text-sm font-medium text-thb-text-primary mb-2">Leave Rules Configuration</p>
          <p className="text-xs text-thb-text-secondary max-w-md mx-auto mb-4">
            Leave rules are configured across the following pages. Click below to manage each aspect:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/leave/types" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
              <FiList className="w-3.5 h-3.5" /> Leave Types
            </Link>
            <Link href="/leave/approval-workflows" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors">
              <FiCheckSquare className="w-3.5 h-3.5" /> Approval Workflows
            </Link>
            <Link href="/leave/leave-policy?tab=mapping" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors">
              <FiLayers className="w-3.5 h-3.5" /> Policy Rules
            </Link>
          </div>
        </div>
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
