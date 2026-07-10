'use client';

import { useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { FiUserPlus, FiArrowRight } from 'react-icons/fi';

/**
 * /employees/add — Client-side redirect to the main Employees page
 * with the dynamic add-employee form auto-opened.
 * 
 * Uses client-side navigation (router.push) instead of server-side
 * redirect() to avoid Vercel chunk loading errors.
 */
function AddEmployeeRedirectContent() {
  const router = useRouter();

  useEffect(() => {
    // Use replace to avoid building up history
    router.replace('/employees?showAddForm=true');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-500/20">
          <FiUserPlus className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-thb-text-primary mb-2">Add New Employee</h2>
        <p className="text-sm text-thb-text-secondary mb-6">
          Opening the employee creation form...
        </p>
        <div className="flex items-center justify-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <button
          onClick={() => router.replace('/employees?showAddForm=true')}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm shadow-sm transition-all"
        >
          <FiArrowRight className="w-4 h-4" />
          Go to Add Employee Form
        </button>
      </div>
    </div>
  );
}

export default function AddEmployeePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3 animate-pulse">
            <FiUserPlus className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-sm text-thb-text-secondary">Loading...</p>
        </div>
      </div>
    }>
      <AddEmployeeRedirectContent />
    </Suspense>
  );
}
