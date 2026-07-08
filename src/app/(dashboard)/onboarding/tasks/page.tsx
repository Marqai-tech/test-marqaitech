'use client';

import { FiCheckSquare } from 'react-icons/fi';

export default function OnboardingTasksPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl mb-6 ring-4 ring-emerald-500/10">
        <FiCheckSquare className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-thb-text-primary mb-2">Onboarding Tasks</h2>
      <p className="text-sm text-thb-text-secondary text-center max-w-lg leading-relaxed">
        Manage onboarding tasks. Assign and track tasks for new hires to ensure a smooth onboarding experience. This feature is coming soon.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-full">
        <FiCheckSquare className="w-3 h-3" />
        <span className="font-medium">Coming Soon</span>
      </div>
    </div>
  );
}
