'use client';

import { FiCalendar } from 'react-icons/fi';

export default function ApplyLeavePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-xl mb-6 ring-4 ring-teal-500/10">
        <FiCalendar className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-thb-text-primary mb-2">Apply Leave</h2>
      <p className="text-sm text-thb-text-secondary text-center max-w-lg leading-relaxed">
        Apply for leave. Select leave type, duration, and submit your leave request for approval. This feature is coming soon.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs text-teal-500 bg-teal-50 px-3 py-1.5 rounded-full">
        <FiCalendar className="w-3 h-3" />
        <span className="font-medium">Coming Soon</span>
      </div>
    </div>
  );
}
