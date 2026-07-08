'use client';

import { FiFileText } from 'react-icons/fi';

export default function ResignationPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-20">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-xl mb-6 ring-4 ring-blue-500/10">
        <FiFileText className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-thb-text-primary mb-2">Resignation Management</h2>
      <p className="text-sm text-thb-text-secondary text-center max-w-lg leading-relaxed">
        Manage employee resignations. Process resignation requests, track notice periods, and initiate exit workflows. This feature is coming soon.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-full">
        <FiFileText className="w-3 h-3" />
        <span className="font-medium">Coming Soon</span>
      </div>
    </div>
  );
}
