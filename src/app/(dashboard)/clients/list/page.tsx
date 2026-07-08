'use client';

import { FiGlobe } from 'react-icons/fi';

export default function ClientListPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-xl mb-6 ring-4 ring-violet-500/10">
        <FiGlobe className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-thb-text-primary mb-2">Client List</h2>
      <p className="text-sm text-thb-text-secondary text-center max-w-lg leading-relaxed">
        View and manage client organizations. Track client details, contacts, and relationships. This feature is coming soon.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs text-violet-500 bg-violet-50 px-3 py-1.5 rounded-full">
        <FiGlobe className="w-3 h-3" />
        <span className="font-medium">Coming Soon</span>
      </div>
    </div>
  );
}
