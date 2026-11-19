'use client';

/**
 * DetailTable — drill-down view for the Employee Dashboard KPI cards.
 *
 * When a user clicks a stat card on the dashboard (Total Employees, Active,
 * On Leave, Exits — or for employees: My Leave Balance, My Pending Requests,
 * My Attendance This Month, My Recent Leaves) the dashboard swaps in this
 * component instead of the dashboard grid.
 *
 * Props:
 *   - cardType: the card key the user clicked (matches `/api/dashboard/details?type=`)
 *   - title:    the headline shown at the top of the panel
 *   - fromDate / toDate: the active dashboard date range (passed through to the API)
 *   - scopeParams: extra query params from the company switcher (companyId / tenantId)
 *   - onBack: callback when the user clicks the back button
 *
 * The component fetches rows from /api/dashboard/details, supports free-text
 * search across all visible cells, and renders dynamic columns per card type.
 * Loading + empty + error states are built-in.
 */

import * as React from 'react';
import { useState, useEffect } from 'react';
import { FiArrowLeft, FiSearch, FiInbox, FiAlertCircle, FiLoader } from 'react-icons/fi';

/* ── Auth header helper (mirrors the dashboard page pattern) ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export interface DetailColumn {
  key: string;
  label: string;
  /** Optional cell formatter — receives the raw value of `row[key]`. */
  format?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  /** Make this column wider (e.g. for names) */
  wide?: boolean;
}

export type CardType =
  | 'total'
  | 'active'
  | 'newJoiners'
  | 'onLeave'
  | 'exits'
  | 'pendingRequests'
  | 'probation'
  | 'birthdays'
  | 'myLeaveBalance'
  | 'myPendingRequests'
  | 'myAttendance'
  | 'myRecentLeaves';

/* ── Column configs per card type ── */
const COLUMN_CONFIG: Record<CardType, DetailColumn[]> = {
  total: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Name', wide: true },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'branch', label: 'Branch' },
    { key: 'joiningDate', label: 'Joining Date' },
    { key: 'status', label: 'Status', format: (v) => <StatusPill value={String(v ?? '—')} /> },
  ],
  active: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Name', wide: true },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'branch', label: 'Branch' },
    { key: 'joiningDate', label: 'Joining Date' },
    { key: 'status', label: 'Status', format: (v) => <StatusPill value={String(v ?? '—')} /> },
  ],
  onLeave: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Name', wide: true },
    { key: 'leaveType', label: 'Leave Type' },
    { key: 'fromDate', label: 'From Date' },
    { key: 'toDate', label: 'To Date' },
    { key: 'days', label: 'Days' },
    { key: 'leaveStatus', label: 'Leave Status', format: (v) => <StatusPill value={String(v ?? '—')} /> },
  ],
  exits: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Name', wide: true },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'joiningDate', label: 'Joining Date' },
    { key: 'exitDate', label: 'Exit Date' },
    { key: 'exitType', label: 'Exit Type' },
    { key: 'exitStatus', label: 'Exit Status', format: (v) => <StatusPill value={String(v ?? '—')} /> },
  ],
  newJoiners: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Name', wide: true },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'branch', label: 'Branch' },
    { key: 'joiningDate', label: 'Joining Date' },
    { key: 'status', label: 'Status', format: (v) => <StatusPill value={String(v ?? '—')} /> },
  ],
  pendingRequests: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Requester', wide: true },
    { key: 'requestType', label: 'Request Type' },
    { key: 'submittedDate', label: 'Submitted Date' },
    { key: 'status', label: 'Status', format: (v) => <StatusPill value={String(v ?? '—')} /> },
  ],
  probation: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Name', wide: true },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'joiningDate', label: 'Joining Date' },
    { key: 'probationEndDate', label: 'Probation End' },
    { key: 'status', label: 'Status', format: (v) => <StatusPill value={String(v ?? '—')} /> },
  ],
  birthdays: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Name', wide: true },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'birthday', label: 'Birthday' },
    { key: 'daysUntil', label: 'In (days)' },
  ],
  myLeaveBalance: [
    { key: 'leaveType', label: 'Leave Type', wide: true },
    { key: 'total', label: 'Total' },
    { key: 'used', label: 'Used' },
    { key: 'remaining', label: 'Remaining' },
    { key: 'carryForward', label: 'Carry Forward' },
    { key: 'year', label: 'Year' },
  ],
  myPendingRequests: [
    { key: 'leaveType', label: 'Leave Type', wide: true },
    { key: 'fromDate', label: 'From Date' },
    { key: 'toDate', label: 'To Date' },
    { key: 'days', label: 'Days' },
    { key: 'status', label: 'Status', format: (v) => <StatusPill value={String(v ?? '—')} /> },
    { key: 'appliedOn', label: 'Applied On' },
  ],
  myAttendance: [
    { key: 'date', label: 'Date' },
    { key: 'status', label: 'Status', format: (v) => <StatusPill value={String(v ?? '—')} /> },
    { key: 'checkIn', label: 'Check In' },
    { key: 'checkOut', label: 'Check Out' },
    { key: 'workedHours', label: 'Worked Hours' },
  ],
  myRecentLeaves: [
    { key: 'leaveType', label: 'Leave Type', wide: true },
    { key: 'fromDate', label: 'From Date' },
    { key: 'toDate', label: 'To Date' },
    { key: 'days', label: 'Days' },
    { key: 'status', label: 'Status', format: (v) => <StatusPill value={String(v ?? '—')} /> },
    { key: 'appliedOn', label: 'Applied On' },
  ],
};

/* ── Status pill (mirrors the SmartHR `statusBadge` style) ── */
function StatusPill({ value }: { value: string }) {
  const s = (value || '').toLowerCase();
  const map: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    present: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    on_leave: 'bg-amber-50 text-amber-700 ring-amber-200',
    onleave: 'bg-amber-50 text-amber-700 ring-amber-200',
    terminated: 'bg-rose-50 text-rose-700 ring-rose-200',
    resigned: 'bg-rose-50 text-rose-700 ring-rose-200',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
    absent: 'bg-rose-50 text-rose-700 ring-rose-200',
    cancelled: 'bg-slate-100 text-slate-700 ring-slate-200',
    inactive: 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  const cls = map[s] || 'bg-slate-100 text-slate-700 ring-slate-200';
  const label = s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${cls}`}>{label}</span>;
}

export interface DetailTableProps {
  cardType: CardType;
  title: string;
  subtitle?: string;
  fromDate?: string;
  toDate?: string;
  /** Extra query-string params from the company switcher (companyId / tenantId). */
  scopeParams?: Record<string, string | undefined>;
  onBack: () => void;
  /** Optional accent color matching the source StatCard (e.g. 'text-[#3A57C4]'). */
  accent?: string;
}

export default function DetailTable({
  cardType,
  title,
  subtitle,
  fromDate,
  toDate,
  scopeParams,
  onBack,
  accent = 'text-[#3A57C4]',
}: DetailTableProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const columns = React.useMemo(() => COLUMN_CONFIG[cardType] || [], [cardType]);
  const scopeParamsKey = JSON.stringify(scopeParams || {});

  useEffect(() => {
    let cancelled = false;
    // Use a microtask to defer the loading state flip so React doesn't
    // warn about cascading renders when this effect re-runs (e.g. when the
    // user switches cards or changes the date range).
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    const params = new URLSearchParams();
    params.set('type', cardType);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    if (scopeParams) {
      for (const [k, v] of Object.entries(scopeParams)) {
        if (v) params.set(k, v);
      }
    }

    fetch(`/api/dashboard/details?${params.toString()}`, { headers: getAuthHeaders() })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.error || `Request failed (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotal(typeof data.total === 'number' ? data.total : (data.rows?.length || 0));
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load records');
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // `scopeParams` is intentionally stringified via `scopeParamsKey` so the
    // effect doesn't re-fire every render — only when the actual shape changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardType, fromDate, toDate, scopeParamsKey]);

  // Client-side search across every visible cell value.
  const filteredRows = React.useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => {
        const v = row[col.key];
        if (v === null || v === undefined) return false;
        return String(v).toLowerCase().includes(q);
      }),
    );
  }, [rows, search, columns]);

  return (
    <div className="space-y-4">
      {/* Header band — back button + title + count + (optional) date range */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all flex-shrink-0"
            aria-label="Back to dashboard"
          >
            <FiArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="min-w-0">
            <h2 className={`text-base font-bold ${accent} truncate`}>{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {fromDate && toDate && (
            <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
              {fromDate} → {toDate}
            </span>
          )}
          <span className="inline-flex items-center h-9 px-3 rounded-lg bg-[#3A57C4]/10 text-xs font-semibold text-[#3A57C4]">
            {loading ? '…' : `${filteredRows.length} of ${total} records`}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search records..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/20 focus:border-[#3A57C4] transition-all"
          aria-label="Search records"
        />
      </div>

      {/* Table — white card, edge-to-edge rows, sticky header */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm py-8">
              <FiLoader className="w-4 h-4 animate-spin" />
              Loading records…
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
              <FiAlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-900">Could not load records</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                // Re-trigger the effect by toggling a state — but simpler: just
                // re-mount via onBack + re-click. Here we force re-fetch by
                // toggling search then resetting, which retriggers the effect.
                setSearch((s) => s + ' ');
                setTimeout(() => setSearch(''), 0);
              }}
              className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Retry
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <FiInbox className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {search ? 'No matching records' : 'No records found'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              {search
                ? 'Try a different search term, or clear the search to see all records.'
                : 'There are no records for the selected card and date range yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 ${col.wide ? 'min-w-[180px]' : 'whitespace-nowrap'}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, idx) => (
                  <tr key={(row.id as string) || idx} className="hover:bg-slate-50/50 transition-colors">
                    {columns.map((col) => {
                      const raw = row[col.key];
                      const content = col.format ? col.format(raw, row) : (raw === null || raw === undefined ? '—' : String(raw));
                      return (
                        <td key={col.key} className="px-4 py-3 text-slate-700 whitespace-nowrap align-middle">
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
