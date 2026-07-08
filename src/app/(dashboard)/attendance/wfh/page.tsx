'use client';

import { FiHome } from 'react-icons/fi';

export default function WfhPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center shadow-xl mb-6 ring-4 ring-cyan-500/10">
        <FiHome className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-thb-text-primary mb-2">Apply WFH</h2>
      <p className="text-sm text-thb-text-secondary text-center max-w-lg leading-relaxed">
        Apply for Work From Home. Submit WFH requests, track approvals, and manage your remote work schedule. This feature is coming soon.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs text-cyan-500 bg-cyan-50 px-3 py-1.5 rounded-full">
        <FiHome className="w-3 h-3" />
        <span className="font-medium">Coming Soon</span>
      </div>
    </div>
  );
}
