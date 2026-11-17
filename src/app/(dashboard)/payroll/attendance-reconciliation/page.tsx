'use client';

/**
 * Attendance Reconciliation (payroll ↔ attendance) — admin/HR report.
 *
 * For a selected month it compares the LOP days frozen on each employee's
 * Payroll row at process time against the LIVE attendance rows for the same
 * month window. A mismatch means payroll was processed before later
 * attendance changes (regularizations, HR direct updates) — the fix is to
 * correct the days in Attendance → Regularize (month view, Direct Attendance
 * Update) and then reprocess payroll for the month from Payroll → Processing.
 *
 * Data source: GET /api/payroll/attendance-reconciliation?month=YYYY-MM
 */
import { useCallback, useEffect, useState } from 'react';
import {
  FiRefreshCw, FiAlertTriangle, FiCheckCircle, FiXCircle,
  FiUsers, FiCalendar, FiDollarSign, FiSearch,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { PageBreadcrumbs, Panel, StatCard } from '@/components/dashboard/smarthr-widgets';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* Same gate as the other payroll admin pages (nav + roleAccess also deny
 * self-service roles for this path). */
const ALLOWED_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'];

interface ReconciliationRow {
  employeeId: string; // employee CODE (e.g. MARQ015)
  employeeName: string;
  payrollLopDays: number;
  liveLopDays: number;
  absentDays: number;
  halfDayDays: number;
  payrollPaidDays: number;
  match: boolean;
  payrollStatus: string;
}

interface ReconciliationResponse {
  month: string;
  rows: ReconciliationRow[];
  summary: { mismatchCount: number; checkedCount: number };
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmtDays(v: number): string {
  return String(Number((v || 0).toFixed(2)));
}

export default function AttendanceReconciliationPage() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const isAllowed = !!user?.role && ALLOWED_ROLES.includes(user.role);

  const [month, setMonth] = useState<string>(() => currentMonthKey());
  const [data, setData] = useState<ReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const fetchData = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    setLoadError('');
    try {
      const sq = scopeQuery();
      const res = await fetch(`/api/payroll/attendance-reconciliation?month=${encodeURIComponent(month)}${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load reconciliation data');
      setData(body as ReconciliationResponse);
    } catch (e: unknown) {
      setData(null);
      setLoadError(e instanceof Error ? e.message : 'Failed to load reconciliation data');
      toast.error(e instanceof Error ? e.message : 'Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, scopeQuery]);

  useEffect(() => {
    if (isAllowed) queueMicrotask(() => fetchData(true));
  }, [fetchData, isAllowed]);

  if (!isAllowed) return null;

  const rows = data?.rows || [];
  // Mismatches first (API already sorts; re-sorted defensively for rendering).
  const sortedRows = [...rows].sort((a, b) => {
    if (a.match !== b.match) return a.match ? 1 : -1;
    return a.employeeName.localeCompare(b.employeeName) || a.employeeId.localeCompare(b.employeeId);
  });
  const checkedCount = data?.summary.checkedCount ?? rows.length;
  const mismatchCount = data?.summary.mismatchCount ?? rows.filter(r => !r.match).length;
  const totalPayrollLop = rows.reduce((s, r) => s + (r.payrollLopDays || 0), 0);
  const totalLiveLop = rows.reduce((s, r) => s + (r.liveLopDays || 0), 0);

  return (
    <div className="space-y-6">
      <PageBreadcrumbs
        title="Attendance Reconciliation"
        trail={['Payroll', 'Attendance Reconciliation']}
        right={<span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-white/25 bg-white/10 text-xs font-semibold text-white">{monthLabel(month)}</span>}
      />

      {/* ── Controls ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <FiCalendar className="w-4 h-4 text-slate-400" />
          Month
          <input
            type="month"
            value={month}
            max={currentMonthKey()}
            onChange={e => setMonth(e.target.value || currentMonthKey())}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-400"
          />
        </label>
        <button
          onClick={() => fetchData(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          title="Refresh"
        >
          <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <span className="text-xs text-slate-400 sm:ml-auto">
          Payroll LOP (frozen at process time) vs live attendance for {monthLabel(month)}
        </span>
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Checked"
          value={String(checkedCount)}
          sub="Employees with a payroll row"
          icon={<FiUsers className="w-5 h-5 text-sky-600" />}
          bg="bg-sky-50"
          ring="ring-sky-100"
        />
        <StatCard
          label="Mismatched"
          value={String(mismatchCount)}
          sub="Payroll LOP ≠ attendance LOP"
          icon={mismatchCount > 0 ? <FiXCircle className="w-5 h-5 text-rose-600" /> : <FiCheckCircle className="w-5 h-5 text-emerald-600" />}
          bg={mismatchCount > 0 ? 'bg-rose-50' : 'bg-emerald-50'}
          ring={mismatchCount > 0 ? 'ring-rose-100' : 'ring-emerald-100'}
        />
        <StatCard
          label="Total Payroll LOP"
          value={fmtDays(totalPayrollLop)}
          sub="Sum of lopDays on payroll rows"
          icon={<FiDollarSign className="w-5 h-5 text-amber-600" />}
          bg="bg-amber-50"
          ring="ring-amber-100"
        />
        <StatCard
          label="Total Attendance LOP"
          value={fmtDays(totalLiveLop)}
          sub="absent + 0.5 × half-day (live)"
          icon={<FiCalendar className="w-5 h-5 text-emerald-600" />}
          bg="bg-emerald-50"
          ring="ring-emerald-100"
        />
      </div>

      {/* ── Guidance callout ── */}
      <Panel title="What a mismatch means" icon={<FiAlertTriangle className="w-4 h-4" />} accent="text-amber-600" tone="amber">
        <p className="text-sm text-slate-600">
          Mismatch means payroll was processed before later attendance changes. Fix days in{' '}
          <span className="font-semibold text-slate-800">Attendance → Regularize</span> (month view, Direct Attendance Update),
          then reprocess payroll for the month from{' '}
          <span className="font-semibold text-slate-800">Payroll → Processing</span>.
        </p>
      </Panel>

      {/* ── Report table ── */}
      <Panel title={`Reconciliation Report — ${monthLabel(month)}`} icon={<FiRefreshCw className="w-4 h-4" />} accent="text-[#3A57C4]">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading reconciliation…</div>
        ) : loadError ? (
          <div className="py-10 text-center text-sm text-slate-500">{loadError}</div>
        ) : sortedRows.length === 0 ? (
          <div className="py-10 text-center">
            <FiSearch className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No payroll rows found for {monthLabel(month)} — nothing to reconcile yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-thb-border bg-slate-50/60 text-left text-xs font-semibold text-thb-text-secondary uppercase tracking-wider">
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5 text-right">Payroll LOP</th>
                  <th className="px-3 py-2.5 text-right">Attendance LOP</th>
                  <th className="px-3 py-2.5 text-right">Absent</th>
                  <th className="px-3 py-2.5 text-right">Half-day</th>
                  <th className="px-3 py-2.5 text-right">Payroll Paid Days</th>
                  <th className="px-3 py-2.5">Payroll Status</th>
                  <th className="px-3 py-2.5">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map(r => (
                  <tr key={`${r.employeeId}-${r.payrollStatus}`} className={`transition-colors ${r.match ? 'hover:bg-slate-50/60' : 'bg-rose-50/40 hover:bg-rose-50/70'}`}>
                    <td className="px-3 py-2.5 font-medium text-thb-text-primary">{r.employeeName || '—'}</td>
                    <td className="px-3 py-2.5 text-thb-text-secondary">{r.employeeId}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-thb-text-primary">{fmtDays(r.payrollLopDays)}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${r.match ? 'text-thb-text-secondary' : 'text-rose-600'}`}>{fmtDays(r.liveLopDays)}</td>
                    <td className="px-3 py-2.5 text-right text-thb-text-secondary">{r.absentDays}</td>
                    <td className="px-3 py-2.5 text-right text-thb-text-secondary">{r.halfDayDays}</td>
                    <td className="px-3 py-2.5 text-right text-thb-text-secondary">{fmtDays(r.payrollPaidDays)}</td>
                    <td className="px-3 py-2.5 text-thb-text-secondary capitalize">{r.payrollStatus}</td>
                    <td className="px-3 py-2.5">
                      {r.match ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <FiCheckCircle className="w-3 h-3" /> Match
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <FiXCircle className="w-3 h-3" /> Mismatch
                        </span>
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
  );
}
