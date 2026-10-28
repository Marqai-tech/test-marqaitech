'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { FiFileText, FiSliders, FiLayers, FiCheckSquare } from 'react-icons/fi';
import ModuleSettingsPanel, { leaveSections } from '@/components/ModuleSettingsPanel';
import ModuleSettingsShell from '@/components/ModuleSettingsShell';

/**
 * Leave Settings page — Task 87 structure.
 *
 * Per the Task 87 request ("keep the approver workflows and configuration in
 * all the modules separate and remove them from the current
 * options/configurations"), this page no longer embeds a Configuration tab or
 * an Approver Workflow tab. It keeps only:
 *   1. Policy → cross-links to /leave/leave-policy?tab=documents
 *   2. Rules  → ModuleSettingsPanel with leaveSections (Leave Year &
 *               Carry Forward, Leave Application Rules, Special Leaves &
 *               Calendar)
 *
 * The separated surfaces now live on their own pages (each with its own
 * sidebar entry):
 *   - Leave Configuration   → /leave/configuration
 *   - Approval Workflows    → /leave/approval-workflows
 *
 * The shell renders only the tabs whose content is provided.
 */
function LeaveSettingsContent() {
  return (
    <ModuleSettingsShell
      moduleName="Leave"
      moduleAccent="green"
      basePath="/leave/settings"
      policy={
        <div className="space-y-4">
          {/* Task 87: Configuration & Approval Workflows are separate pages now */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/leave/configuration" className="thb-card p-4 flex items-start gap-3 hover:border-green-300 hover:shadow-sm transition-all group">
              <div className="p-2 rounded-lg bg-green-50 text-green-600 flex-shrink-0">
                <FiSliders className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-thb-text-primary group-hover:text-green-700">Leave Configuration</p>
                <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">
                  Leave year &amp; carry-forward, leave application rules, special leaves &amp; calendar — moved to its own page.
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
                  Multi-tier approver chain, workflow options and leave policy rules — moved to its own page.
                </p>
              </div>
            </Link>
          </div>
          <div className="thb-card p-5">
            <h2 className="text-base font-semibold text-thb-text-primary mb-3">Leave Policy Documents</h2>
            <p className="text-xs text-thb-text-muted mb-4">
              The Leave Policy documents (employee-facing leave policy PDFs, holiday calendar, sandwich rule
              definitions, pro-rata rules, probation restrictions) are maintained on the dedicated Leave Policy
              page. Use the links below to view or edit them.
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
          <ModuleSettingsPanel sections={leaveSections} />
        </div>
      }
      rules={<ModuleSettingsPanel sections={leaveSections} />}
    />
  );
}

export default function LeaveSettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-thb-text-muted">Loading Leave Settings…</div>}>
      <LeaveSettingsContent />
    </Suspense>
  );
}
