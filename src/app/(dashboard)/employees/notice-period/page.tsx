'use client';

/**
 * Notice Period Tracker (/employees/notice-period)
 *
 * Lists every resignation application with its live notice-period state so
 * HR / managers can see who is serving notice, who is relieving soon and
 * whose notice was waived. Data comes from GET /api/employees/resignation
 * (raw-SQL `Resignation` table). "Under notice" = approved AND last working
 * date >= today — Employee.status flips to 'resigned' at approval time, not
 * at the LWD (see src/app/api/employees/resignation/[id]/route.ts).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiClock,
  FiAlertCircle,
  FiCalendar,
  FiEye,
  FiRefreshCw,
  FiUser,
  FiFileText,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { PageBreadcrumbs, Panel, StatCard } from '@/components/dashboard/smarthr-widgets';
import { getNoticeStatusInfo, isUnderNotice, isRelievingThisWeek, type ResignationRecordLike } from '@/lib/notice-period';

const ALLOWED_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'manager'];

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface ResignationRow extends ResignationRecordLike {
  id: string;
  employeeId: string;
}

export default function NoticePeriodTrackerPage() {
  const router = useRouter();
  const userRole = useAuthStore((s) => s.user?.role) || '';
  const allowed = ALLOWED_ROLES.includes(userRole);

  const [records, setRecords] = useState<ResignationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/employees/resignation?limit=500', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load resignation records');
      setRecords((data.resignations || data.data || []) as ResignationRow[]);
    } catch (err) {
      console.error('[NoticePeriodTracker] fetch failed:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load resignation records');
      toast.error('Failed to load resignation records');
    } finally {
      setLoading(false);
    }
  }, []);

  // queueMicrotask keeps the fetch out of the synchronous effect body
  // (same pattern as the employee detail page fetch effects).
  useEffect(() => {
    queueMicrotask(() => {
      if (allowed) fetchRecords();
      else setLoading(false);
    });
  }, [allowed, fetchRecords]);

  /* ── Summary counts ── */
  const summary = useMemo(() => {
    const now = new Date();
    let underNotice = 0;
    let relievingThisWeek = 0;
    let waived = 0;
    let pending = 0;
    for (const r of records) {
      const info = getNoticeStatusInfo(r, now);
      if (isUnderNotice(r, now)) underNotice++;
      if (isRelievingThisWeek(r, now)) relievingThisWeek++;
      if (r.isNoticePeriodWaived && !info.rejected) waived++;
      if (info.pending) pending++;
    }
    return { underNotice, relievingThisWeek, waived, pending };
  }, [records]);

  /* ── Sorted rows: under-notice first (by days remaining asc), then waived,
        pending, past-LWD, rejected last ── */
  const sorted = useMemo(() => {
    const now = new Date();
    return records
      .map((r) => ({ row: r, info: getNoticeStatusInfo(r, now) }))
      .sort((a, b) => {
        if (a.info.rank !== b.info.rank) return a.info.rank - b.info.rank;
        if (a.info.daysRemaining !== b.info.daysRemaining) return a.info.daysRemaining - b.info.daysRemaining;
        return (a.row.employeeName || '').localeCompare(b.row.employeeName || '');
      });
  }, [records]);

  if (!allowed) {
    return (
      <div>
        <PageBreadcrumbs title="Notice Period Tracker" trail={['Employees', 'Notice Period Tracker']} />
        <Panel title="Notice Period Tracker" icon={<FiClock className="w-4 h-4" />}>
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <FiAlertCircle className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500">You do not have permission to view the Notice Period Tracker</p>
            <p className="text-xs text-slate-400 mt-1">This page is available to HR, admin and manager roles only</p>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <PageBreadcrumbs
        title="Notice Period Tracker"
        trail={['Employees', 'Notice Period Tracker']}
        right={
          <button
            onClick={fetchRecords}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:border-slate-300 shadow-sm transition-all"
            title="Refresh data"
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      <div className="space-y-6">
        {/* ── Summary tiles ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Under Notice Period"
            value={summary.underNotice}
            sub="Approved, serving notice"
            icon={<FiClock className="w-5 h-5" />}
            bg="bg-[#3A57C4]/10 text-[#3A57C4]"
            ring="ring-[#3A57C4]/20"
          />
          <StatCard
            label="Relieving This Week"
            value={summary.relievingThisWeek}
            sub="Last working day within 7 days"
            icon={<FiCalendar className="w-5 h-5" />}
            bg="bg-amber-50 text-amber-600"
            ring="ring-amber-100"
          />
          <StatCard
            label="Notice Waived"
            value={summary.waived}
            sub="Notice period waived by HR"
            icon={<FiFileText className="w-5 h-5" />}
            bg="bg-violet-50 text-violet-600"
            ring="ring-violet-100"
          />
          <StatCard
            label="Applied Pending"
            value={summary.pending}
            sub="Awaiting approval"
            icon={<FiUser className="w-5 h-5" />}
            bg="bg-emerald-50 text-emerald-600"
            ring="ring-emerald-100"
          />
        </div>

        {/* ── Tracker table ── */}
        <Panel
          title="Resignation Applications"
          icon={<FiClock className="w-4 h-4" />}
          accent="text-[#FF9B44]"
          action={<span className="text-xs text-slate-500">{sorted.length} record{sorted.length === 1 ? '' : 's'}</span>}
        >
          {loadError ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <FiAlertCircle className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm text-slate-500">{loadError}</p>
              <button onClick={fetchRecords} className="mt-3 text-xs font-semibold text-[#3A57C4] hover:text-[#2C43A3] transition-colors">Try again</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Employee</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Department</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Designation</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Resignation Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Notice (days)</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Last Working Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Days Remaining</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap min-w-[140px]">Progress</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={10} className="text-center py-10 text-slate-400">Loading resignation records...</td></tr>
                  ) : sorted.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-12">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <FiClock className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm font-medium text-slate-500">No resignation applications yet</p>
                        <p className="text-xs text-slate-400 mt-1">Employees who apply for resignation will appear here with their live notice period status</p>
                      </div>
                    </td></tr>
                  ) : sorted.map(({ row, info }) => (
                    <tr key={row.id} className={`hover:bg-slate-50 ${info.rejected ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{row.employeeName || 'Unknown'}</p>
                        <p className="text-xs text-slate-400">{row.employeeCode || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.department || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.designation || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(row.resignationDate)}</td>
                      <td className="px-4 py-3 text-slate-600">{Number(row.noticePeriodDays) || 0}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(row.lastWorkingDate)}</td>
                      <td className="px-4 py-3">
                        {info.approved || info.pending ? (
                          <span className={`font-semibold ${info.approved && info.daysRemaining === 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                            {info.daysRemaining} day{info.daysRemaining === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {Number(row.noticePeriodDays) > 0 && (info.approved || info.pending) ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-2 min-w-[80px] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#3A57C4] to-[#6C4FD6] transition-all duration-500"
                                style={{ width: `${info.progressPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 w-9 text-right flex-shrink-0">{info.progressPct}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={info.className}>{info.chip}</span>
                      </td>
                      <td className="px-4 py-3">
                        {row.employeeId ? (
                          <button
                            onClick={() => router.push(`/employees/${row.employeeId}`)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3A57C4] hover:text-[#2C43A3] transition-colors whitespace-nowrap"
                            title="Open employee profile"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                            View Employee
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
