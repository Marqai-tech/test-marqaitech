'use client';

/**
 * Task 154 — My Profile ≡ Employee List → View Details.
 *
 * The user compared /employees/[id] with /my-profile and asked for ONE page:
 * "the my profile page and the employees list view pages are not the same".
 * My Profile now renders the EXACT same component as the employee list's
 * View Details page (/employees/[id]) for the logged-in user — same banner,
 * same stat cards, same tabs (Overview, Personal, Employment, Experience,
 * Achievements, Documents, Verification, Leave, Attendance, Payroll, Health,
 * Policies, Company Mapping).
 *
 * The own-employee id is resolved from /api/auth/me (which — since the
 * hero-card fix — resolves the linked Employee row for EVERY role, including
 * management logins), with /api/users/profile as fallback. Self-service roles
 * cannot open /employees/* paths, which is why the unified view is hosted on
 * the always-allowed /my-profile route and the component hides its
 * "Back to Employees" navigation in this mode.
 */

import { useEffect, useState } from 'react';
import { FiUser, FiRefreshCw, FiShield } from 'react-icons/fi';
import EmployeeDetailPage from '@/app/(dashboard)/employees/[id]/page';
import { useAuthStore } from '@/store/authStore';
import { getToken } from '@/lib/token-storage';

function getAuthHeaders(): Record<string, string> {
  const token = getToken() || (typeof window !== 'undefined' ? useAuthStore.getState().token : null);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function MyProfilePage() {
  const { user } = useAuthStore();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const resolveOwnEmployeeId = async () => {
      setLoading(true);
      setFailed(false);

      // A platform Super Admin is an account, not a tenant Employee row.
      // Show the account profile below instead of attempting an employee lookup.
      if (useAuthStore.getState().user?.role === 'super_admin') {
        if (!cancelled) setLoading(false);
        return;
      }

      // 1) Fast path — the auth store may already carry the linked employee.
      const cached = useAuthStore.getState().user as unknown as { employee?: { id?: string } } | null;
      const cachedId = cached?.employee?.id;
      if (cachedId) {
        if (!cancelled) { setEmployeeId(cachedId); setLoading(false); }
        return;
      }

      // 2) /api/auth/me — resolves the employee row for every role.
      try {
        const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          const id = data?.employee?.id || data?.user?.employee?.id || '';
          if (id) {
            if (!cancelled) { setEmployeeId(id); setLoading(false); }
            return;
          }
        }
      } catch { /* fall through */ }

      // 3) /api/users/profile fallback.
      try {
        const res = await fetch('/api/users/profile', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          const id = data?.employee?.id || data?.user?.employee?.id || '';
          if (id) {
            if (!cancelled) { setEmployeeId(id); setLoading(false); }
            return;
          }
        }
      } catch { /* fall through */ }

      if (!cancelled) { setFailed(true); setLoading(false); }
    };

    resolveOwnEmployeeId();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full border-4 border-slate-200 border-t-green-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-thb-text-secondary font-medium">Loading your profile…</p>
        </div>
      </div>
    );
  }

  if (user?.role === 'super_admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="thb-card w-full max-w-xl p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center mx-auto mb-5">
            <FiShield className="w-10 h-10" />
          </div>
          <p className="text-xl font-semibold text-thb-text-primary">{user.name || 'Super Admin'}</p>
          <p className="text-sm text-thb-text-secondary mt-1">{user.email}</p>
          <span className="inline-flex mt-4 px-3 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-semibold border border-violet-200">
            Platform Super Admin
          </span>
          <p className="text-sm text-thb-text-secondary mt-5">
            This is a platform account and is not linked to a tenant employee record.
          </p>
        </div>
      </div>
    );
  }

  if (failed || !employeeId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-5">
            <FiUser className="w-10 h-10 text-slate-300" />
          </div>
          <p className="text-lg font-semibold text-thb-text-primary mb-1">Profile unavailable</p>
          <p className="text-sm text-thb-text-secondary mb-5">
            We could not link your login to an employee record. Please contact HR if this looks wrong.
          </p>
          <button
            onClick={() => { setFailed(false); setEmployeeId(null); setLoading(true); window.location.reload(); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm"
          >
            <FiRefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // The SAME page component used by Employee List → View Details.
  return <EmployeeDetailPage selfEmployeeId={employeeId} />;
}
