'use client';

import Link from 'next/link';
import { FiDollarSign, FiEdit3 } from 'react-icons/fi';
import ModuleSettingsPanel, { payrollSections } from '@/components/ModuleSettingsPanel';

/**
 * Payroll Settings page — renders the general payroll configuration sections
 * (Pay Schedule, Overtime & Calculation, Tax & Compliance, Advanced) moved
 * here from /settings in Task 56.
 *
 * Salary structure settings remain at /payroll/salary-settings — linked below.
 */
export default function PayrollSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
          <FiDollarSign className="w-6 h-6 text-emerald-500" />
          Payroll Settings
        </h1>
        <p className="text-thb-text-secondary mt-1">Configure payroll processing, tax, and calculation rules</p>
      </div>

      {/* General Payroll Settings (migrated from /settings > Payroll tab) */}
      <ModuleSettingsPanel sections={payrollSections} />

      {/* Cross-link to Salary Structure settings (separate page) */}
      <div className="thb-card p-5">
        <h2 className="text-base font-semibold text-thb-text-primary mb-3">Salary Structure Settings</h2>
        <p className="text-xs text-thb-text-muted mb-4">For salary components, earning/deduction structure, and per-employee salary type defaults — visit the Salary Settings page.</p>
        <Link href="/payroll/salary-settings" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors">
          <FiEdit3 className="w-4 h-4" />
          Open Salary Structure Settings
        </Link>
      </div>
    </div>
  );
}
