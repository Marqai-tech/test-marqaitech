'use client';

import { FiCalendar, FiFileText, FiSliders, FiLayers } from 'react-icons/fi';
import Link from 'next/link';
import ModuleSettingsPanel, { leaveSections } from '@/components/ModuleSettingsPanel';

/**
 * Leave Settings page — renders the general leave configuration sections
 * (Leave Year & Carry Forward, Leave Application Rules, Special Leaves &
 * Calendar) moved here from /settings in Task 56.
 *
 * The Leave Policy & Rules tabs (Policy Documents, Policy Config/Workflow,
 * Leave Type Mapping) remain at /leave/leave-policy — linked below.
 */
export default function LeaveSettingsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
          <FiCalendar className="w-6 h-6 text-green-500" />
          Leave Settings
        </h1>
        <p className="text-thb-text-secondary mt-1">Manage leave policies, carry forward rules, and special leaves</p>
      </div>

      {/* General Leave Settings (migrated from /settings > Leave tab) */}
      <ModuleSettingsPanel sections={leaveSections} />

      {/* Cross-link to Leave Policy & Rules tabs (separate page) */}
      <div className="thb-card p-5">
        <h2 className="text-base font-semibold text-thb-text-primary mb-3">Leave Policy & Rules</h2>
        <p className="text-xs text-thb-text-muted mb-4">For policy documents, approval workflow configuration, and leave type mapping — visit the Leave Policy page.</p>
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
    </div>
  );
}
