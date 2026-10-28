'use client';

import { FiTrendingUp } from 'react-icons/fi';
import ModuleSettingsPanel, { performanceSections } from '@/components/ModuleSettingsPanel';

/**
 * Performance Settings page — renders the general performance configuration
 * sections (Review Cycle, Appraisal Methods, Feedback & Improvement) moved
 * here from /settings in Task 56. Replaces the previous stub that had
 * non-persisted toggle buttons.
 */
export default function PerformanceSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
          <FiTrendingUp className="w-6 h-6 text-teal-500" />
          Performance Settings
        </h1>
        <p className="text-thb-text-secondary mt-1">Configure review cycles, appraisal methods, and feedback settings</p>
      </div>

      <ModuleSettingsPanel sections={performanceSections} />
    </div>
  );
}
