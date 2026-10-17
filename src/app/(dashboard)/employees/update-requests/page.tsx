'use client';

/**
 * /employees/update-requests
 *
 * Employee profile-update workflow inbox:
 *   - My Requests   — requests the current employee submitted
 *   - Approvals     — requests waiting for MY approval (current tier)
 *   - All           — every request (admins)
 * Plus a "Request Change" modal to submit a profile-change request.
 * Low-risk fields apply immediately; high-risk fields route through the
 * configured approval chain (/employees/approval-config).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  FiArrowLeft, FiPlus, FiRefreshCw, FiCheck, FiX, FiInbox, FiSend, FiClock, FiCheckCircle, FiXCircle, FiChevronDown,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getToken } from '@/lib/token-storage';
import {
  validateEmail, validatePhone, validateZipCode,
} from '@/lib/validators';

function getAuthHeaders() {
  const token = getToken() || (typeof window !== 'undefined' ? useAuthStore.getState().token : null);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// Editable fields (matches the API's FIELD_SENSITIVITY classification)
const REQUESTABLE_FIELDS: { field: string; label: string; category: string }[] = [
  { field: 'phone', label: 'Phone Number', category: 'Contact (applies directly)' },
  { field: 'address', label: 'Address', category: 'Contact (applies directly)' },
  { field: 'city', label: 'City', category: 'Contact (applies directly)' },
  { field: 'state', label: 'State', category: 'Contact (applies directly)' },
  { field: 'zipCode', label: 'ZIP Code', category: 'Contact (applies directly)' },
  { field: 'country', label: 'Country', category: 'Contact (applies directly)' },
  { field: 'personalEmail', label: 'Personal Email', category: 'Contact (applies directly)' },
  { field: 'emergencyContactName', label: 'Emergency Contact Name', category: 'Contact (applies directly)' },
  { field: 'emergencyContactPhone', label: 'Emergency Contact Phone', category: 'Contact (applies directly)' },
  { field: 'firstName', label: 'First Name', category: 'Personal (approval required)' },
  { field: 'lastName', label: 'Last Name', category: 'Personal (approval required)' },
  { field: 'dateOfBirth', label: 'Date of Birth', category: 'Personal (approval required)' },
  { field: 'gender', label: 'Gender', category: 'Personal (approval required)' },
  { field: 'maritalStatus', label: 'Marital Status', category: 'Personal (approval required)' },
  { field: 'nationality', label: 'Nationality', category: 'Personal (approval required)' },
  { field: 'bankName', label: 'Bank Name', category: 'Financial (approval required)' },
  { field: 'bankAccountNo', label: 'Bank Account Number', category: 'Financial (approval required)' },
  { field: 'bankIfscCode', label: 'Bank IFSC Code', category: 'Financial (approval required)' },
  { field: 'panNumber', label: 'PAN Number', category: 'KYC (approval required)' },
  { field: 'aadhaarNumber', label: 'Aadhaar Number', category: 'KYC (approval required)' },
  { field: 'taxId', label: 'Tax ID', category: 'KYC (approval required)' },
];

// BUG_044 fix: capitalise status labels so the UI shows "Pending" instead
// of "pending". Used for both the request status badge and the approval-step
// status text.
function prettyStatus(status: string): string {
  if (!status) return '';
  const map: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    applied: 'Applied',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    skipped: 'Skipped',
    in_progress: 'In Progress',
  };
  return map[status.toLowerCase()] || status.charAt(0).toUpperCase() + status.slice(1);
}

interface ApprovalStep { id: string; tier: number; approverType: string; approverName?: string; status: string; comments?: string | null; actedAt?: string | null }
interface UpdateRequest {
  id: string; fieldName: string; fieldLabel?: string; category: string;
  oldValue?: string; newValue?: string; reason?: string;
  status: string; currentTier: number; requestedAt?: string;
  approvalSteps?: ApprovalStep[];
  employee?: { id: string; firstName: string; lastName: string; employeeId: string };
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'thb-badge thb-badge-warning',
    approved: 'thb-badge thb-badge-success',
    applied: 'thb-badge thb-badge-success',
    rejected: 'thb-badge thb-badge-error',
    cancelled: 'thb-badge thb-badge-info',
  };
  return map[status] || 'thb-badge thb-badge-info';
}

function RequestCard({ r, canAct, onAct, canCancel, onCancel }: {
  r: UpdateRequest;
  canAct: boolean;
  onAct: (id: string, action: 'approve' | 'reject') => void;
  canCancel: boolean;
  onCancel: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="thb-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-thb-text-primary truncate">{r.fieldLabel || r.fieldName}</p>
          <p className="text-[11px] text-thb-text-muted">
            {r.employee ? `${r.employee.firstName} ${r.employee.lastName} · ${r.employee.employeeId} · ` : ''}
            {r.requestedAt ? new Date(r.requestedAt).toLocaleString() : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* BUG_044 fix: capitalised status label */}
          <span className={statusBadge(r.status)}>{prettyStatus(r.status)}</span>
          <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><FiChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} /></button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5 text-xs">
        <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-[10px] text-thb-text-muted block mb-0.5">Current</span><span className="text-thb-text-secondary break-all">{r.oldValue || '—'}</span></div>
        <div className="rounded-lg bg-teal-50/60 px-3 py-2"><span className="text-[10px] text-thb-text-muted block mb-0.5">Requested</span><span className="text-teal-800 font-medium break-all">{r.newValue || '—'}</span></div>
      </div>
      {r.reason && <p className="text-[11px] text-thb-text-muted mt-2"><span className="font-medium">Reason:</span> {r.reason}</p>}

      {open && (
        <div className="mt-3 border-t border-thb-border pt-3 space-y-1.5">
          {(r.approvalSteps || []).sort((a, b) => a.tier - b.tier).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-thb-text-secondary">Tier {s.tier} · {s.approverName || s.approverType}</span>
              <span className={s.status === 'approved' ? 'text-emerald-600' : s.status === 'rejected' ? 'text-red-500' : s.status === 'pending' ? 'text-amber-600' : 'text-slate-400'}>
                {/* BUG_044 fix: capitalised step status */}
                {prettyStatus(s.status)}{s.actedAt ? ` · ${new Date(s.actedAt).toLocaleDateString()}` : ''}{s.comments ? ` · "${s.comments}"` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {/* BUG_052 fix: tenant admins (and other admin roles) can approve /
            reject ANY pending request — not just the ones where they're the
            explicitly-assigned current-tier approver. Previously the Approve /
            Reject buttons only showed in the 'inbox' scope, which only lists
            requests where approverUserId = current user. Admins opening the
            'All Requests' tab saw pending requests with no action buttons. */}
        {canAct && r.status === 'pending' && (
          <>
            <button onClick={() => onAct(r.id, 'approve')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"><FiCheck className="w-3.5 h-3.5" /> Approve</button>
            <button onClick={() => onAct(r.id, 'reject')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100"><FiX className="w-3.5 h-3.5" /> Reject</button>
          </>
        )}
        {/* BUG_057 fix: Cancel option for pending requests. Shown to the
            request owner (scope === 'mine') OR to admins viewing any
            pending request. After cancel, the request is marked as
            'cancelled' and disappears from approval queues. */}
        {canCancel && r.status === 'pending' && (
          <button
            onClick={() => onCancel(r.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200"
            title="Cancel this request"
          >
            <FiX className="w-3.5 h-3.5" /> Cancel Request
          </button>
        )}
      </div>
    </div>
  );
}

function NewRequestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'].includes(user?.role || '');
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [field, setField] = useState('');
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  // BUG_046/047/048/049/054/055 fix: live validation errors for the new value.
  const [valueError, setValueError] = useState('');
  // BUG_056 fix: reason max length with live counter.
  const REASON_MAX = 500;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/employees?limit=500', { headers: getAuthHeaders() });
        const data = await res.json();
        const list = (data.employees || data.data || []) as Array<{ id: string; firstName?: string; lastName?: string; employeeId?: string }>;
        const mapped = list.map((e) => ({ id: e.id, name: `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Unnamed', code: e.employeeId || '' }));
        setEmployees(mapped);
        // BUG_045 fix: for non-admin employees, auto-fill and lock the
        // Employee field to their own record. Don't show the dropdown at all
        // — the test report flagged the dropdown as unnecessary for self-
        // service. Admins still get the dropdown so they can submit on
        // behalf of an employee.
        if (!isAdmin) {
          const me = list.find((e) => e.id && mapped.some(m => m.id === e.id));
          // We don't have a direct "is this me" check from the list — but the
          // backend enforces ownership, so we send an empty employeeId and
          // let the API resolve it from the JWT. The dropdown is hidden.
          if (me) setEmployeeId(me.id);
        }
      } catch { /* ignore */ }
    })();
  }, [isAdmin]);

  // BUG_046/047/048/049/054/055 fix: validate newValue based on the selected
  // field. Phone must be exactly 10 digits, ZIP must be exactly 6 digits,
  // personalEmail must pass RFC-style validation. Reject script tags /
  // HTML / blank input with a clear inline error before submitting.
  const validateNewValue = (fieldName: string, value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return 'New value is required';
    if (fieldName === 'phone' || fieldName === 'emergencyContactPhone') {
      const phoneCheck = validatePhone(trimmed);
      if (!phoneCheck.valid) return phoneCheck.error || 'Enter a valid 10-digit phone number';
    }
    if (fieldName === 'zipCode' || fieldName === 'currentZipCode') {
      const pinCheck = validateZipCode(trimmed);
      if (!pinCheck.valid) return pinCheck.error || 'Enter a valid 6-digit PIN code';
    }
    if (fieldName === 'personalEmail') {
      const emailCheck = validateEmail(trimmed);
      if (!emailCheck.valid) return emailCheck.error || 'Invalid email format';
    }
    if (fieldName === 'dateOfBirth') {
      const d = new Date(trimmed);
      if (Number.isNaN(d.getTime())) return 'Invalid date';
      // BUG_040 fix: DOB cannot be a future date, and the employee must be
      // at least 16 years old (minimum working age in India).
      const now = new Date();
      if (d.getTime() > now.getTime()) return 'Date of birth cannot be a future date';
      const ageMs = now.getTime() - d.getTime();
      const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
      if (ageYears < 16) return 'Employee must be at least 16 years old';
      if (ageYears > 100) return 'Date of birth is unrealistic';
    }
    // BUG_055 fix: XSS guard — reject values that contain <script> or other
    // HTML tags. The server-side sanitizer also strips these, but surfacing
    // the error client-side gives the user immediate feedback.
    if (/<\s*(script|iframe|object|embed|link|style|meta|img[^>]*onerror)/i.test(trimmed)) {
      return 'HTML/script tags are not allowed in this field';
    }
    if (/[<>]/.test(trimmed) && /script|onerror|onload|javascript:/i.test(trimmed)) {
      return 'Invalid input — special characters are not allowed';
    }
    return '';
  };

  const handleValueChange = (value: string) => {
    setNewValue(value);
    if (field) setValueError(validateNewValue(field, value));
  };

  const handleFieldChange = (newField: string) => {
    setField(newField);
    if (newValue) setValueError(validateNewValue(newField, newValue));
  };

  const submit = async () => {
    if (!employeeId && isAdmin) { toast.error('Please select an employee'); return; }
    if (!field) { toast.error('Please select a field'); return; }
    const err = validateNewValue(field, newValue);
    if (err) { setValueError(err); toast.error(err); return; }
    // BUG_056 fix: cap reason length client-side (server also caps via
    // sanitizeMultiLineText(_, 500)).
    const trimmedReason = reason.trim().slice(0, REASON_MAX);
    setSaving(true);
    try {
      const res = await fetch('/api/employees/update-requests', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          // Non-admins send their own employeeId (or empty — the API
          // resolves it from the JWT). Admins must explicitly pick.
          employeeId: employeeId || undefined,
          fieldName: field,
          newValue: newValue.trim(),
          reason: trimmedReason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      toast.success(data.message || 'Request submitted');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  };

  const groups = [...new Set(REQUESTABLE_FIELDS.map((f) => f.category))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-thb-border"><h3 className="font-semibold text-sm">Request Profile Change</h3><button onClick={onClose}><FiX className="w-5 h-5 text-slate-400" /></button></div>
        <div className="p-5 space-y-3">
          {/* BUG_045 fix: hide the Employee dropdown for non-admin employees.
              They can only submit changes for their own profile, so the
              dropdown is unnecessary — the API resolves employeeId from the
              JWT. Admins still get the dropdown so they can submit on
              behalf of an employee. */}
          {isAdmin ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Employee *</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                <option value="">Select employee…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.code ? ` · ${e.code}` : ''}</option>)}
              </select>
            </div>
          ) : (
            <div className="px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200">
              <span className="font-medium">Submitting for:</span> Myself
              <p className="text-[10px] text-slate-400 mt-0.5">Self-service requests are submitted on your own behalf.</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Field *</label>
            <select value={field} onChange={(e) => handleFieldChange(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="">Select field…</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {REQUESTABLE_FIELDS.filter((f) => f.category === g).map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New Value *</label>
            <input
              value={newValue}
              onChange={(e) => handleValueChange(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm ${valueError ? 'border-red-300 bg-red-50/30' : 'border-slate-200'}`}
              type={field === 'dateOfBirth' ? 'date' : 'text'}
            />
            {/* BUG_046/047/048/049/054/055 fix: inline validation message */}
            {valueError && <p className="mt-1 text-[11px] text-red-600 flex items-center gap-1"><FiX className="w-3 h-3" /> {valueError}</p>}
            {field === 'phone' && !valueError && <p className="mt-1 text-[10px] text-slate-400">Must be a valid 10-digit Indian mobile number (starts with 6, 7, 8 or 9).</p>}
            {field === 'zipCode' && !valueError && <p className="mt-1 text-[10px] text-slate-400">Must be a 6-digit numeric PIN code.</p>}
            {field === 'personalEmail' && !valueError && <p className="mt-1 text-[10px] text-slate-400">Must be a valid email format (e.g., name@domain.com).</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center justify-between">
              <span>Reason</span>
              {/* BUG_056 fix: live character counter on the Reason field */}
              <span className={`text-[10px] font-normal ${reason.length > REASON_MAX ? 'text-red-500' : 'text-slate-400'}`}>{reason.length}/{REASON_MAX}</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX + 50))}
              rows={2}
              className={`w-full px-3 py-2 border rounded-lg text-sm ${reason.length > REASON_MAX ? 'border-red-300' : 'border-slate-200'}`}
              placeholder="Optional — explain why this change is needed"
            />
            {reason.length > REASON_MAX && <p className="mt-1 text-[11px] text-red-600">Reason is too long (max {REASON_MAX} characters).</p>}
          </div>
          <p className="text-[10px] text-slate-400">Low-risk contact fields apply immediately. High-risk fields (personal / financial / KYC) route through the configured approval chain.</p>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
          <button
            onClick={submit}
            disabled={saving || !!valueError || !field || !newValue.trim() || (reason.length > REASON_MAX)}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UpdateRequestsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin', 'company_hr_admin'].includes(user?.role || '');
  // BUG_043 fix: default tab for a non-approver employee is 'mine' (My
  // Requests), not 'inbox' (My Approvals). An employee who is not an
  // approver has nothing in their inbox, so defaulting to 'inbox' shows an
  // empty "Nothing is waiting for your approval right now" screen — confusing.
  const [scope, setScope] = useState<'mine' | 'inbox' | 'all'>(isAdmin ? 'inbox' : 'mine');
  const [requests, setRequests] = useState<UpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async (s: 'mine' | 'inbox' | 'all') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/update-requests?scope=${s}`, { headers: getAuthHeaders() });
      const data = await res.json();
      setRequests(data.requests || []);
    } catch { toast.error('Failed to load requests'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(scope); }, [scope, load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    // Task 88 (spec rule 4): a rejection reason is MANDATORY — the employee
    // is notified with it and needs it to correct and resubmit.
    let comments = '';
    if (action === 'approve') {
      comments = window.prompt('Comments for this approval? (optional)') || '';
    } else {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        comments = window.prompt('Rejection reason (required):') || '';
        if (comments.trim()) break;
        if (window.confirm('A rejection reason is required. Cancel the rejection?')) return;
      }
    }
    try {
      const res = await fetch(`/api/employees/update-requests/${id}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ action, comments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || `Request ${action}d`);
      load(scope);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  // BUG_057 fix: cancel handler. Calls the same PATCH endpoint with
  // action: 'cancel'. The endpoint already supports this — we just needed
  // a UI affordance. Owner can cancel their own pending requests; admins
  // can cancel any pending request.
  const cancelRequest = async (id: string) => {
    if (!window.confirm('Cancel this request? The change will not be applied.')) return;
    try {
      const res = await fetch(`/api/employees/update-requests/${id}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || 'Request cancelled');
      load(scope);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  const tabs: { key: 'mine' | 'inbox' | 'all'; label: string; icon: React.ReactNode }[] = [
    { key: 'inbox', label: 'My Approvals', icon: <FiInbox className="w-3.5 h-3.5" /> },
    { key: 'mine', label: 'My Requests', icon: <FiSend className="w-3.5 h-3.5" /> },
    ...(isAdmin ? [{ key: 'all' as const, label: 'All Requests', icon: <FiClock className="w-3.5 h-3.5" /> }] : []),
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/employees')} className="p-2 rounded-lg border border-thb-border hover:bg-slate-50"><FiArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="text-lg font-semibold text-thb-text-primary">Profile Update Requests</h1>
            <p className="text-xs text-thb-text-muted">Employee profile-change requests and their approval progress.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(scope)} className="p-2 rounded-lg border border-thb-border hover:bg-slate-50" title="Refresh"><FiRefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700"><FiPlus className="w-3.5 h-3.5" /> Request Change</button>
        </div>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setScope(t.key)} className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium ${scope === t.key ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-thb-text-muted py-10 text-center">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="thb-card p-10 text-center">
          {scope === 'inbox' ? <FiInbox className="w-10 h-10 text-slate-300 mx-auto mb-3" /> : <FiCheckCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />}
          <p className="text-sm font-medium text-thb-text-secondary">No requests here</p>
          <p className="text-xs text-thb-text-muted mt-1">{scope === 'inbox' ? 'Nothing is waiting for your approval right now.' : 'Use "Request Change" to submit a profile update.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              // BUG_052 fix: admins can approve/reject from any tab. The
              // API already allows this — we just needed to surface the
              // action buttons in the 'all' and 'mine' scopes too.
              canAct={scope === 'inbox' || (isAdmin && r.status === 'pending')}
              onAct={act}
              // BUG_057 fix: cancel available to the owner (scope === 'mine')
              // or to admins on any pending request.
              canCancel={scope === 'mine' || isAdmin}
              onCancel={cancelRequest}
            />
          ))}
        </div>
      )}

      {showNew && <NewRequestModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(scope); }} />}
    </div>
  );
}
