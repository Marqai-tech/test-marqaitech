'use client';

/**
 * Leave Configuration — standalone page (Task 87).
 *
 * Leave settings used to carry a "Configuration" tab (and a duplicate
 * "Approver Workflow" tab) inside the 4-tab settings shell. Per the Task 87
 * request ("keep the approver workflows and configuration in all the modules
 * separate and remove them from the current options/configurations") the
 * configuration sections now render on their own page with their own sidebar
 * entry, and Leave Settings keeps only its own Policy/Rules content.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { FiSettings, FiArrowLeft, FiCheckSquare } from 'react-icons/fi';
import ModuleSettingsPanel, { leaveSections } from '@/components/ModuleSettingsPanel';

function LeaveConfigurationContent() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
            <FiSettings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Leave Configuration</h1>
            <p className="text-sm text-thb-text-secondary">Leave year &amp; carry-forward, application rules, special leaves &amp; calendar — separate from Leave Settings</p>
          </div>
        </div>
        <Link href="/leave/settings" className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border text-thb-text-secondary rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors">
          <FiArrowLeft className="w-4 h-4" /> Leave Settings
        </Link>
      </div>

      {/* System configuration sections (same content the old Configuration tab rendered) */}
      <ModuleSettingsPanel sections={leaveSections} />

      {/* Cross-link footer: keep the module's config surfaces discoverable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/leave/settings" className="thb-card p-4 flex items-start gap-3 hover:border-green-300 hover:shadow-sm transition-all group">
          <div className="p-2 rounded-lg bg-green-50 text-green-600 flex-shrink-0">
            <FiSettings className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-thb-text-primary group-hover:text-green-700">Leave Settings</p>
            <p className="text-xs text-thb-text-secondary mt-0.5 leading-relaxed">
              Policy documents, operational rules and links to the rest of the leave configuration surfaces.
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
              Multi-tier leave approver chain, workflow options and policy rules — configured on its own page.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

export default function LeaveConfigurationPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-thb-text-muted">Loading Leave Configuration…</div>}>
      <LeaveConfigurationContent />
    </Suspense>
  );
}
