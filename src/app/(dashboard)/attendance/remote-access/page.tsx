'use client';

/**
 * Remote Check-In Permissions — Task 108
 *
 * Employee-wise control over the REMOTE attendance channels:
 *   • Mobile check-in  — the 3Boxes HRMS mobile app (method 'mobile')
 *   • Web check-in     — the browser Check In / Break buttons (method 'web')
 *
 * Both channels work from anywhere, so they are OFF for every employee by
 * default and represent an explicit WORK-FROM-HOME PRE-APPROVAL granted by
 * admin/management. Employees without a pre-approval must mark attendance
 * on the office biometric device. The punch API enforces the same rule
 * server-side — this page is the control panel.
 */

import { useEffect, useMemo, useState } from 'react';
import { FiWifi, FiSearch, FiRefreshCw, FiInfo, FiCheckCircle, FiXCircle, FiHome, FiCalendar } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { getDataScope } from '@/lib/roleAccess';

function getAuthHeaders() {
  const token = typeof window !== 'undefined'
    ? (localStorage.getItem('tb_token') || useAuthStore.getState().token)
    : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface RemotePermissionRow {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  status?: string | null;
  department?: string | null;
  designation?: string | null;
  wfhPreApproved: boolean;
  mobileCheckInEnabled: boolean;
  webCheckInEnabled: boolean;
  holidayWeekendPunchEnabled: boolean;
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
      title={checked ? 'Enabled — click to disable' : 'Disabled — click to enable'}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[19px]' : 'translate-x-[3px]'}`} />
    </button>
  );
}

export default function RemoteCheckInPage() {
  const role = useAuthStore(s => s.user?.role || '');
  const [rows, setRows] = useState<RemotePermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [degraded, setDegraded] = useState(false);

  const allowed = getDataScope(role) === 'all';

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/attendance/remote-permissions', { headers: getAuthHeaders(), cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setRows(d.employees || []);
      setDegraded(!!d.degraded);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load remote check-in permissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const patch = async (row: RemotePermissionRow, field: 'wfhPreApproved' | 'mobileCheckInEnabled' | 'webCheckInEnabled' | 'holidayWeekendPunchEnabled', value: boolean) => {
    setSavingIds(prev => new Set(prev).add(row.id));
    // optimistic update
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, [field]: value } : r)));
    try {
      const res = await fetch('/api/attendance/remote-permissions', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId: row.id, [field]: value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to update');
      if (d.employee) setRows(prev => prev.map(r => (r.id === row.id ? { ...r, ...d.employee } : r)));
      const label = field === 'wfhPreApproved'
        ? 'WFH pre-approval'
        : field === 'mobileCheckInEnabled'
          ? 'Mobile check-in'
          : field === 'holidayWeekendPunchEnabled'
            ? 'Holiday / weekend free punch'
            : 'Web check-in';
      toast.success(`${label} ${value ? 'enabled for' : 'disabled for'} ${row.firstName} ${row.lastName}`);
    } catch (err: unknown) {
      // revert on failure
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, [field]: !value } : r)));
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      `${r.firstName} ${r.lastName}`.toLowerCase().includes(q)
      || r.employeeId?.toLowerCase().includes(q)
      || (r.department || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const enabledMobile = rows.filter(r => r.mobileCheckInEnabled).length;
  const enabledWeb = rows.filter(r => r.webCheckInEnabled).length;
  const wfhApproved = rows.filter(r => r.wfhPreApproved).length;
  const holidayOpen = rows.filter(r => r.holidayWeekendPunchEnabled).length;

  if (!allowed) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
          <FiInfo className="w-4 h-4" />
          Only administrators can manage remote check-in pre-approvals.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2">
            <FiWifi className="w-6 h-6 text-cyan-500" />
            Remote Check-In
          </h1>
          <p className="text-thb-text-secondary mt-1 text-sm">
            Employee-wise work-from-home pre-approval for mobile &amp; web check-in (including break in / break out)
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Policy explainer */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-slate-700 space-y-1.5">
        <div className="flex items-start gap-2 font-medium text-blue-900">
          <FiInfo className="w-4 h-4 mt-0.5 shrink-0" />
          Policy
        </div>
        <p>
          Mobile-app and web check-in are <strong>remote channels</strong> — they can be used from anywhere, so they are
          available <strong>only with a work-from-home pre-approval granted here by admin/management</strong>. Employees
          without a pre-approval must mark attendance using the office biometric device. Break-in and break-out follow
          the same permission. Every remote punch still records GPS coordinates, and punches recorded outside the office
          geofence (or exactly on its center — a mock-location signature) are flagged for audit in the Punch Activity Log.
        </p>
        <p>
          <strong>Holidays &amp; weekends:</strong> remote punches on a holiday or weekend are <strong>blocked by
          default</strong> — the employee must raise a <em>Holiday / Weekend Work</em> request to the admin or their
          immediate approver and have it approved first. Enable the <em>Holiday / weekend</em> toggle below to open
          holidays &amp; weekends free for a specific employee (no request needed). Biometric punches on holidays are
          always recorded, and both are highlighted to admins via notification + email alerts.
        </p>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5"><FiHome className="w-3.5 h-3.5" /> WFH pre-approved</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{wfhApproved}<span className="text-sm font-normal text-slate-400"> / {rows.length}</span></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5"><FiWifi className="w-3.5 h-3.5" /> Mobile check-in enabled</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{enabledMobile}<span className="text-sm font-normal text-slate-400"> / {rows.length}</span></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5"><FiWifi className="w-3.5 h-3.5" /> Web check-in enabled</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{enabledWeb}<span className="text-sm font-normal text-slate-400"> / {rows.length}</span></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 flex items-center gap-1.5"><FiCalendar className="w-3.5 h-3.5" /> Holiday / weekend open</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{holidayOpen}<span className="text-sm font-normal text-slate-400"> / {rows.length}</span></div>
        </div>
      </div>

      {degraded && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <FiInfo className="w-3.5 h-3.5" />
          Database upgrade pending — toggles will activate after the next deployment completes.
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, employee ID, department…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Employee</th>
                <th className="text-left px-4 py-3 font-semibold">Department</th>
                <th className="text-center px-4 py-3 font-semibold">WFH Pre-Approved</th>
                <th className="text-center px-4 py-3 font-semibold">Mobile Check-In</th>
                <th className="text-center px-4 py-3 font-semibold">Web Check-In</th>
                <th className="text-center px-4 py-3 font-semibold" title="Allow mobile/web punches on holidays & weekends without an approved Holiday Work request">Holiday / Weekend Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading employees…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No employees found.</td></tr>
              ) : filtered.map(row => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{row.firstName} {row.lastName}</div>
                    <div className="text-xs text-slate-400">{row.employeeId}{row.designation ? ` · ${row.designation}` : ''}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.department || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-2">
                      <Toggle checked={row.wfhPreApproved} disabled={savingIds.has(row.id)} onChange={() => patch(row, 'wfhPreApproved', !row.wfhPreApproved)} />
                      {row.wfhPreApproved ? <FiCheckCircle className="w-4 h-4 text-emerald-500" /> : <FiXCircle className="w-4 h-4 text-slate-300" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle checked={row.mobileCheckInEnabled} disabled={savingIds.has(row.id)} onChange={() => patch(row, 'mobileCheckInEnabled', !row.mobileCheckInEnabled)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle checked={row.webCheckInEnabled} disabled={savingIds.has(row.id)} onChange={() => patch(row, 'webCheckInEnabled', !row.webCheckInEnabled)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle checked={row.holidayWeekendPunchEnabled} disabled={savingIds.has(row.id)} onChange={() => patch(row, 'holidayWeekendPunchEnabled', !row.holidayWeekendPunchEnabled)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
