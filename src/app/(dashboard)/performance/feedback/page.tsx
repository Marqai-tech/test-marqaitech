'use client';

import { FiMessageCircle } from 'react-icons/fi';

export default function FeedbackPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-xl mb-6 ring-4 ring-amber-500/10">
        <FiMessageCircle className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-thb-text-primary mb-2">360 Feedback</h2>
      <p className="text-sm text-thb-text-secondary text-center max-w-lg leading-relaxed">
        Manage 360-degree feedback. Collect feedback from peers, managers, and direct reports for comprehensive evaluations. This feature is coming soon.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs text-amber-500 bg-amber-50 px-3 py-1.5 rounded-full">
        <FiMessageCircle className="w-3 h-3" />
        <span className="font-medium">Coming Soon</span>
      </div>
    </div>
  );
}
