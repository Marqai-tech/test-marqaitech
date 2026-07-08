'use client';

import { FiRefreshCw } from 'react-icons/fi';

export default function TransferPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-xl mb-6 ring-4 ring-blue-500/10">
        <FiRefreshCw className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-thb-text-primary mb-2">Employee Transfer</h2>
      <p className="text-sm text-thb-text-secondary text-center max-w-lg leading-relaxed">
        Manage employee transfers between departments, branches, or companies within the organization. This feature is coming soon.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-full">
        <FiRefreshCw className="w-3 h-3" />
        <span className="font-medium">Coming Soon</span>
      </div>
    </div>
  );
}
