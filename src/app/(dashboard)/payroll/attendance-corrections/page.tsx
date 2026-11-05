'use client';

/**
 * Payroll — Attendance Corrections
 *
 * One place for the payroll manager to streamline attendance irregularities
 * before processing payroll:
 *   1. Manual Punch / Correction — single-employee apply (JSON API)
 *   2. Excel Upload — bulk .xlsx apply (multipart API)
 *   3. Audit Trail — every applied punch, with before/after snapshots
 *
 * Every apply notifies Admin/HR (payroll.attendance_corrected event) and is
 * written to the AttendanceAuditLog (action: 'payroll_correction').
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  FiActivity, FiCheckCircle, FiChevronDown, FiChevronUp, FiEye,
  FiInfo, FiRefreshCw, FiUploadCloud, FiUserCheck,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { PageBreadcrumbs, Panel, StatCard } from '@/components/dashboard/smarthr-widgets';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import { attendanceDayKeyOf } from '@/lib/timezone-utils';

const ALLOWED_ROLES = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'];
const STATUS_OPTIONS = [
  { value: 'auto', label: 'Auto (default by punches)' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'half_day', label: 'Half Day' },
  { value: 'absent', label: 'Absent' },
  { value: 'on_leave', label: 'On Leave' },
];

function getAuthHeaders(json = true): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

interface EmployeeOption {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
}

interface CorrectionResult {
  row: number;
  employeeCode: string;
  date: string;
  ok: boolean;
  error?: string;
}

interface ApplyResponse {
  applied: number;
  failed: number;
  notified: boolean;
  results?: CorrectionResult[];
  error?: string;
}

interface AuditSnapshot {
  status?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workHours?: number | null;
  notes?: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  employee?: { firstName: string; lastName: string; employeeId: string } | null;
  beforeData: AuditSnapshot | null;
  afterData: AuditSnapshot | null;
  changedBy: string;
  reason: string | null;
  createdAt: string;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function snapshotLabel(s: AuditSnapshot | null): string {
  if (!s || Object.keys(s).length === 0) return 'New row';
  const parts: string[] = [];
  if (s.status) parts.push(`status: ${s.status}`);
  if (s.checkIn) parts.push(`in: ${String(s.checkIn).slice(11, 16)} IST`);
  if (s.checkOut) parts.push(`out: ${String(s.checkOut).slice(11, 16)} IST`);
  if (s.workHours != null) parts.push(`${s.workHours}h`);
  if (s.notes) parts.push(`notes: ${s.notes}`);
  return parts.length ? parts.join(' · ') : JSON.stringify(s);
}

export default function AttendanceCorrectionsPage() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const isAllowed = Boolean(user && ALLOWED_ROLES.includes(user.role));

  // ── Employees (Section 1) ──
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [form, setForm] = useState({ employeeCode: '', date: '', checkIn: '', checkOut: '', status: 'auto', note: '', reason: '' });
  const [applying, setApplying] = useState(false);
  const [manualResult, setManualResult] = useState<ApplyResponse | null>(null);

  // ── Excel upload (Section 2) ──
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadReason, setUploadReason] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ApplyResponse | null>(null);

  // ── Audit trail (Section 3) ──
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    try {
      const sq = scopeQuery();
      const res = await fetch(`/api/employees?limit=500&excludeInactive=true${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch {
      // Silent — the select simply stays empty.
    }
  }, [scopeQuery]);

  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const res = await fetch('/api/payroll/attendance-corrections?includeMass=1', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      } else {
        toast.error('Failed to load the audit trail');
      }
    } catch {
      toast.error('Failed to load the audit trail');
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAllowed) return;
    queueMicrotask(() => {
      fetchEmployees();
      fetchLogs();
    });
  }, [isAllowed, fetchEmployees, fetchLogs]);

  // ── Section 1: manual punch / correction ──
  const applyManual = async () => {
    if (!form.employeeCode) { toast.error('Select an employee'); return; }
    if (!form.date) { toast.error('Pick the attendance date'); return; }
    if (!form.reason.trim()) { toast.error('A reason is required for the audit trail'); return; }
    setApplying(true);
    setManualResult(null);
    try {
      const res = await fetch('/api/payroll/attendance-corrections', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeCode: form.employeeCode,
          date: form.date,
          checkIn: form.checkIn || null,
          checkOut: form.checkOut || null,
          status: form.status === 'auto' ? undefined : form.status,
          note: form.note.trim() || undefined,
          reason: form.reason.trim(),
        }),
      });
      const data: ApplyResponse = await res.json().catch(() => ({ applied: 0, failed: 0, notified: false, error: 'Unexpected response' }));
      if (res.ok && data.applied > 0) {
        toast.success(`Applied ${data.applied} row(s) — Admin/HR notified`);
        setForm(f => ({ ...f, checkIn: '', checkOut: '', status: 'auto', note: '' }));
      } else {
        toast.error(data.error || `Nothing applied — ${data.failed || 0} row(s) failed`);
      }
      setManualResult(data);
      fetchLogs();
    } catch {
      toast.error('Failed to apply the correction');
    } finally {
      setApplying(false);
    }
  };

  // ── Section 2: Excel upload ──
  const applyUpload = async () => {
    if (!uploadFile) { toast.error('Choose an .xlsx file'); return; }
    if (!uploadReason.trim()) { toast.error('A reason is required for the audit trail'); return; }
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('reason', uploadReason.trim());
      const res = await fetch('/api/payroll/attendance-corrections', {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: fd,
      });
      const data: ApplyResponse = await res.json().catch(() => ({ applied: 0, failed: 0, notified: false, error: 'Unexpected response' }));
      if (res.ok && data.applied > 0) {
        toast.success(`Applied ${data.applied} row(s) — Admin/HR notified`);
        setUploadFile(null);
        setUploadReason('');
      } else {
        toast.error(data.error || `Nothing applied — ${data.failed || 0} row(s) failed`);
      }
      setUploadResult(data);
      fetchLogs();
    } catch {
      toast.error('Failed to upload the file');
    } finally {
      setUploading(false);
    }
  };

  // ── Stats (from audit timestamps) ──
  const todayKey = attendanceDayKeyOf(new Date());
  const appliedToday = logs.filter(l => attendanceDayKeyOf(new Date(l.createdAt)) === todayKey).length;

  if (!user) return null;
  if (!isAllowed) {
    return (
      <div className="space-y-6">
        <PageBreadcrumbs title="Attendance Corrections" trail={['Payroll', 'Attendance Corrections']} />
        <Panel title="Attendance Corrections" icon={<FiUserCheck className="w-4 h-4" />}>
          <p className="text-sm text-thb-text-secondary">You do not have permission to view this page. Payroll managers, HR and admins can apply attendance corrections here.</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageBreadcrumbs
        title="Attendance Corrections"
        trail={['Payroll', 'Attendance Corrections']}
        right={
          <button onClick={fetchLogs} className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/15 border border-white/25 text-white hover:bg-white/25 transition-colors" title="Refresh audit trail">
            <FiRefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <FiInfo className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <p>Every apply emails Admin/HR and is written to the audit trail below.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard label="Applied Today" value={appliedToday} sub="Corrections applied today (IST)" icon={<FiCheckCircle className="w-5 h-5" />} bg="bg-[#10B981]/10 text-[#10B981]" ring="ring-[#10B981]/20" />
        <StatCard label="Audit Entries" value={logs.length} sub="Latest 200 shown below" icon={<FiActivity className="w-5 h-5" />} bg="bg-[#3A57C4]/10 text-[#3A57C4]" ring="ring-[#3A57C4]/20" />
      </div>

      {/* ── Section 1: Manual Punch / Correction ── */}
      <Panel title="Manual Punch / Correction" icon={<FiUserCheck className="w-4 h-4" />} accent="text-[#3A57C4]">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-thb-text-secondary">Employee *</label>
            <select
              value={form.employeeCode}
              onChange={(e) => setForm(f => ({ ...f, employeeCode: e.target.value }))}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-thb-border bg-white focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/30"
            >
              <option value="">Select employee…</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.employeeId}>{emp.firstName} {emp.lastName} ({emp.employeeId})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-thb-text-secondary">Date (IST business day) *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-thb-border bg-white focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-thb-text-secondary">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-thb-border bg-white focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/30"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-thb-text-secondary">Check In (HH:mm)</label>
            <input
              type="time"
              value={form.checkIn}
              onChange={(e) => setForm(f => ({ ...f, checkIn: e.target.value }))}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-thb-border bg-white focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-thb-text-secondary">Check Out (HH:mm)</label>
            <input
              type="time"
              value={form.checkOut}
              onChange={(e) => setForm(f => ({ ...f, checkOut: e.target.value }))}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-thb-border bg-white focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-thb-text-secondary">Note</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Optional note stored with the row"
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-thb-border bg-white focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/30"
            />
          </div>
          <div className="xl:col-span-2">
            <label className="text-xs font-medium text-thb-text-secondary">Reason *</label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Biometric missed — verified with shift supervisor"
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-thb-border bg-white focus:outline-none focus:ring-2 focus:ring-[#3A57C4]/30"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={applyManual}
              disabled={applying}
              className="w-full md:w-auto px-5 py-2.5 rounded-lg bg-[#3A57C4] text-white text-sm font-semibold hover:bg-[#324ab0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {applying ? 'Applying…' : 'Apply Correction'}
            </button>
          </div>
        </div>

        {manualResult && (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${manualResult.applied > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            <p className="font-semibold">
              {manualResult.applied > 0 ? `Applied ${manualResult.applied} row(s)` : 'Nothing applied'}
              {manualResult.failed > 0 ? ` · ${manualResult.failed} failed` : ''}
              {manualResult.notified ? ' · Admin/HR notified' : ''}
            </p>
            {manualResult.results?.filter(r => !r.ok).map((r, i) => (
              <p key={i} className="mt-1 text-xs">Row {r.row} ({r.employeeCode || '—'} {r.date}): {r.error}</p>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Section 2: Excel Upload ── */}
      <Panel title="Excel Upload" icon={<FiUploadCloud className="w-4 h-4" />} accent="text-[#6C4FD6]">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-thb-text-secondary">Attendance file (.xlsx) *</label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="mt-1 w-full text-sm text-thb-text-secondary file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-[#6C4FD6]/10 file:text-[#6C4FD6] file:text-sm file:font-medium"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-thb-text-secondary">Reason *</label>
            <input
              type="text"
              value={uploadReason}
              onChange={(e) => setUploadReason(e.target.value)}
              placeholder="e.g. March punch regularisation — approved by HR"
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-thb-border bg-white focus:outline-none focus:ring-2 focus:ring-[#6C4FD6]/30"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={applyUpload}
              disabled={uploading}
              className="w-full md:w-auto px-5 py-2.5 rounded-lg bg-[#6C4FD6] text-white text-sm font-semibold hover:bg-[#5b41c2] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? 'Uploading…' : 'Upload & Apply'}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-thb-text-secondary">
          Accepted columns: Employee Code, Date (YYYY-MM-DD), Check In (HH:mm), Check Out (HH:mm), Status, Note. Unknown codes or invalid rows are reported below without blocking the rest.
        </p>

        {uploadResult && (
          <div className="mt-4 space-y-3">
            <div className={`rounded-xl border px-4 py-3 text-sm ${uploadResult.applied > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
              <p className="font-semibold">
                {uploadResult.applied > 0 ? `Applied ${uploadResult.applied} row(s)` : 'Nothing applied'}
                {uploadResult.failed > 0 ? ` · ${uploadResult.failed} failed` : ''}
                {uploadResult.notified ? ' · Admin/HR notified' : ''}
              </p>
            </div>
            {uploadResult.results && uploadResult.results.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-thb-border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs text-thb-text-secondary uppercase tracking-wide">
                      <th className="px-4 py-2">Row</th>
                      <th className="px-4 py-2">Employee Code</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.results.map((r, i) => (
                      <tr key={i} className="border-t border-thb-border hover:bg-slate-50/50">
                        <td className="px-4 py-2 text-thb-text-secondary">{r.row}</td>
                        <td className="px-4 py-2 font-medium text-thb-text-primary">{r.employeeCode || '—'}</td>
                        <td className="px-4 py-2 text-thb-text-secondary">{r.date || '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded ${r.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {r.ok ? 'Applied' : 'Failed'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-rose-600">{r.error || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* ── Section 3: Audit Trail ── */}
      <Panel
        title="Audit Trail"
        icon={<FiEye className="w-4 h-4" />}
        accent="text-[#10B981]"
        action={
          <button onClick={fetchLogs} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 transition-colors">
            <FiRefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      >
        {logsLoading ? (
          <p className="text-sm text-thb-text-secondary py-4">Loading audit trail…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-thb-text-secondary py-4">No corrections recorded yet. Applied punches (manual, Excel and month-view bulk updates) will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-thb-text-secondary uppercase tracking-wide">
                  <th className="px-4 py-2">Timestamp</th>
                  <th className="px-4 py-2">Employee</th>
                  <th className="px-4 py-2">Employee Code</th>
                  <th className="px-4 py-2">Changed By</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Note Preview</th>
                  <th className="px-4 py-2 text-right">View</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const expanded = expandedLogId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <tr className="border-t border-thb-border hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-thb-text-secondary whitespace-nowrap">{fmtDateTime(log.createdAt)}</td>
                        <td className="px-4 py-3 font-medium text-thb-text-primary">
                          {log.employee ? `${log.employee.firstName} ${log.employee.lastName}` : '—'}
                          <span className="ml-2 text-xs font-normal text-thb-text-muted uppercase">{log.action.replace(/_/g, ' ')}</span>
                        </td>
                        <td className="px-4 py-3 text-thb-text-secondary">{log.employee?.employeeId || '—'}</td>
                        <td className="px-4 py-3 text-thb-text-secondary">{log.changedBy}</td>
                        <td className="px-4 py-3 text-thb-text-secondary max-w-[220px] truncate" title={log.reason || ''}>{log.reason || '—'}</td>
                        <td className="px-4 py-3 text-thb-text-secondary max-w-[260px] truncate" title={log.afterData?.notes || ''}>
                          {log.afterData?.notes || log.beforeData?.notes || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setExpandedLogId(expanded ? null : log.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#3A57C4] hover:underline"
                          >
                            {expanded ? 'Hide' : 'View'} {expanded ? <FiChevronUp className="w-3.5 h-3.5" /> : <FiChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t border-thb-border bg-slate-50/70">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs font-semibold text-thb-text-secondary uppercase tracking-wide mb-1">Before</p>
                                <pre className="text-xs bg-white border border-thb-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(log.beforeData ?? {}, null, 2)}</pre>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-thb-text-secondary uppercase tracking-wide mb-1">After</p>
                                <pre className="text-xs bg-white border border-thb-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(log.afterData ?? {}, null, 2)}</pre>
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-thb-text-muted">Before: {snapshotLabel(log.beforeData)} · After: {snapshotLabel(log.afterData)}</p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
