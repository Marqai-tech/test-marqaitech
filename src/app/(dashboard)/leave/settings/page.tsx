'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { FiFileText, FiSliders, FiLayers, FiCalendar } from 'react-icons/fi';
import ModuleSettingsPanel, { leaveSections } from '@/components/ModuleSettingsPanel';
import ModuleSettingsShell from '@/components/ModuleSettingsShell';
import ApproverChainPreview from '@/components/ApproverChainPreview';

/**
 * Leave Settings page — uses the shared 4-tab ModuleSettingsShell:
 *   1. Policy            → cross-links to /leave/leave-policy?tab=documents
 *   2. Rules              → ModuleSettingsPanel with leaveSections (Leave Year &
 *                           Carry Forward, Leave Application Rules, Special
 *                           Leaves & Calendar)
 *   3. Configuration      → ModuleSettingsPanel (same sections — they double as
 *                           system configuration defaults; user can edit any
 *                           setting from either tab)
 *   4. Approver Workflow  → ApproverChainPreview for module="leave"
 *
 * The shell handles URL ?tab= routing + cross-flow navigation between tabs.
 */
function LeaveSettingsContent() {
  return (
    <ModuleSettingsShell
      moduleName="Leave"
      moduleAccent="green"
      basePath="/leave/settings"
      policy={
        <div className="space-y-4">
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
              <Link href="/leave/leave-policy?tab=workflow" className="flex items-start gap-2 p-3 rounded-lg border border-thb-border hover:bg-slate-50 transition-colors">
                <FiSliders className="w-4 h-4 text-amber-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-thb-text-primary">Policy Rules & Workflow</p>
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
      configuration={<ModuleSettingsPanel sections={leaveSections} />}
      approverWorkflow={
        <div className="space-y-4">
          <div className="thb-card p-5">
            <h2 className="text-base font-semibold text-thb-text-primary">Leave Approver Chain</h2>
            <p className="text-xs text-thb-text-muted mb-4">
              The approval chain below is resolved for the currently logged-in user. Each tier is computed
              from the Leave Workflow Config (per-tenant, per-leave-type). To customize the chain, visit the
              <Link href="/leave/leave-policy?tab=workflow" className="text-green-600 hover:underline ml-1">Policy Rules</Link> tab on the Leave Policy page.
            </p>
            <ApproverChainPreview module="leave" />
          </div>
        </div>
      }
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
