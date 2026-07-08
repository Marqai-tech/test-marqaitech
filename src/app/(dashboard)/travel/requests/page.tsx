'use client';

import { FiMap } from 'react-icons/fi';

export default function TravelRequestsPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-xl mb-6 ring-4 ring-orange-500/10">
        <FiMap className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-thb-text-primary mb-2">Travel Requests</h2>
      <p className="text-sm text-thb-text-secondary text-center max-w-lg leading-relaxed">
        Submit and manage travel requests. Plan business travel, get approvals, and track travel arrangements. This feature is coming soon.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs text-orange-500 bg-orange-50 px-3 py-1.5 rounded-full">
        <FiMap className="w-3 h-3" />
        <span className="font-medium">Coming Soon</span>
      </div>
    </div>
  );
}
