'use client';

import { FiUpload, FiRefreshCw, FiUsers } from 'react-icons/fi';
import BulkImportTab from '@/components/BulkImportTab';
import ModuleTips from '@/components/ModuleTips';

/**
 * Bulk Import page — moved here from /settings (Governance > Settings &
 * Configuration) in Task 60. Bulk Import is employee-data-centric (it
 * imports employees, designations, departments, branches, etc.) so it
 * belongs under the Employee module.
 *
 * Old URL /settings?tab=import should redirect here — see the redirect
 * logic in /settings/page.tsx (Task 60).
 */
export default function EmployeeBulkImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
          <FiUpload className="w-6 h-6 text-emerald-500" />
          Bulk Import
        </h1>
        <p className="text-thb-text-secondary mt-1">Upload Excel sheets to import master data for initial setup — employees, designations, departments, branches, leave types, shifts, holidays, and more.</p>
      </div>

      <BulkImportTab module="employees" />

      <ModuleTips
        moduleKey="employees-bulk-import"
        title="Bulk Import Tips"
        tips={[
          { title: 'Use the Template', description: 'Download the Excel template for each entity type to ensure your column headers match exactly what the importer expects.' },
          { title: 'Small Batches First', description: 'Import 5–10 rows first to validate the format. Once successful, scale up to the full file.' },
          { title: 'Idempotent Re-runs', description: 'Re-importing the same rows is safe — the importer updates existing records by their employee code / external ID instead of duplicating them.' },
          { title: 'Data Validation', description: 'Emails must be unique. Departments / designations / branches must exist before importing employees that reference them.' },
        ]}
      />
    </div>
  );
}
