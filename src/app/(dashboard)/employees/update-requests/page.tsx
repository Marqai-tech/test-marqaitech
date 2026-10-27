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
  FiArrowLeft, FiPlus, FiRefreshCw, FiCheck, FiX, FiInbox, FiSend, FiClock, FiCheckCircle, FiXCircle, FiChevronDown, FiUserCheck, FiZap,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getToken } from '@/lib/token-storage';

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
  // Task 139 — firstName / lastName / dateOfBirth are LOCKED for self-service
  // (direct AND request) — contact HR/Admin. Original Birthday is requestable.
  { field: 'originalBirthday', label: 'Original Birthday (birthday wishes)', category: 'Personal (approval required)' },
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

// Task 158 — human-readable view for SECTION payloads (Experience /
// Achievements / Documents / Verification / Health) on the approval cards.
const SECTION_FIELDS = new Set(['experience', 'achievements', 'documents', 'verification', 'health']);
function SectionPayloadView({ section, value, current }: { section: string; value?: string; current?: string }) {
  const pretty = (raw?: string): string => {
    if (!raw) return '—';
    try {
      const parsed = JSON.parse(raw);
      if (section === 'verification' || section === 'health') {
        const obj = section === 'verification' ? parsed : (parsed.current ?? parsed);
        return Object.entries(obj || {}).map(([k, v]) => `${k}: ${String(v ?? '—')}`).join(' | ') || '—';
      }
      const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      if (!entries.length) return 'No entries';
      return entries.map((e: Record<string, unknown>, i: number) => {
        if (section === 'experience') return `${i + 1}. ${e.company} — ${e.designation} (${String(e.startDate).slice(0, 10)} → ${e.isCurrent ? 'current' : String(e.endDate).slice(0, 10)})`;
        if (section === 'achievements') return `${i + 1}. ${e.title}${e.issuer ? ` (${e.issuer})` : ''}`;
        return `${i + 1}. ${e.name} (${e.type})`;
      }).join('\n');
    } catch { return raw.slice(0, 200); }
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5 text-xs">
      <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-[10px] text-thb-text-muted block mb-0.5">Current</span><span className="text-thb-text-secondary whitespace-pre-line line-clamp-4">{pretty(current)}</span></div>
      <div className="rounded-lg bg-teal-50/60 px-3 py-2"><span className="text-[10px] text-thb-text-muted block mb-0.5">Requested</span><span className="text-teal-800 font-medium whitespace-pre-line">{pretty(value)}</span></div>
    </div>
  );
}

function RequestCard({ r, canAct, onAct }: { r: UpdateRequest; canAct: boolean; onAct: (id: string, action: 'approve' | 'reject') => void }) {
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
          <span className={statusBadge(r.status)}>{r.status}</span>
          <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><FiChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} /></button>
        </div>
      </div>
      {SECTION_FIELDS.has(r.fieldName) ? (
        <SectionPayloadView section={r.fieldName} value={r.newValue} current={r.oldValue} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5 text-xs">
          <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-[10px] text-thb-text-muted block mb-0.5">Current</span><span className="text-thb-text-secondary break-all">{r.oldValue || '—'}</span></div>
          <div className="rounded-lg bg-teal-50/60 px-3 py-2"><span className="text-[10px] text-thb-text-muted block mb-0.5">Requested</span><span className="text-teal-800 font-medium break-all">{r.newValue || '—'}</span></div>
        </div>
      )}
      {r.reason && <p className="text-[11px] text-thb-text-muted mt-2"><span className="font-medium">Reason:</span> {r.reason}</p>}

      {open && (
        <div className="mt-3 border-t border-thb-border pt-3 space-y-1.5">
          {(r.approvalSteps || []).sort((a, b) => a.tier - b.tier).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-thb-text-secondary">Tier {s.tier} · {s.approverName || s.approverType}</span>
              <span className={s.status === 'approved' ? 'text-emerald-600' : s.status === 'rejected' ? 'text-red-500' : s.status === 'pending' ? 'text-amber-600' : 'text-slate-400'}>
                {s.status}{s.actedAt ? ` · ${new Date(s.actedAt).toLocaleDateString()}` : ''}{s.comments ? ` · "${s.comments}"` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {canAct && r.status === 'pending' && (
        <div className="flex items-center gap-2 mt-3">
          <button onClick={() => onAct(r.id, 'approve')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"><FiCheck className="w-3.5 h-3.5" /> Approve</button>
          <button onClick={() => onAct(r.id, 'reject')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100"><FiX className="w-3.5 h-3.5" /> Reject</button>
        </div>
      )}
    </div>
  );
}

// Task 139 — profile-photo approval queue (HR/Admin confirm employee photos)
function PhotoApprovals() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/employees/avatar-approvals', { headers: getAuthHeaders() });
      const data = await res.json();
      setRows(data.pending || []);
    } catch { /* keep empty */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (employeeId: string, action: 'approve' | 'reject') => {
    let comment = '';
    if (action === 'approve') comment = window.prompt('Note for the employee? (optional)') || '';
    else {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        comment = window.prompt('Rejection reason (required):') || '';
        if (comment.trim()) break;
        if (window.confirm('A rejection reason is required. Cancel?')) return;
      }
    }
    try {
      const res = await fetch('/api/employees/avatar-approvals', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId, action, comment: comment || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(`Photo ${action}d — the employee has been notified`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-thb-text-muted">Profile photos submitted by employees. Nothing goes public until you confirm — approving replaces the current photo; rejecting keeps it.</p>
      {loading ? (
        <div className="py-10 text-center text-sm text-thb-text-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-thb-text-muted">No photos waiting for approval.</div>
      ) : (
        rows.map((r) => (
          <div key={String(r.employeeId)} className="flex items-center gap-3 p-3.5 rounded-xl border border-thb-border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={String(r.pendingAvatar)} alt={String(r.name)} className="w-12 h-12 rounded-full object-cover border-2 border-amber-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-thb-text-primary truncate">{String(r.name)}{r.employeeCode ? ` · ${String(r.employeeCode)}` : ''}</p>
              <p className="text-xs text-thb-text-muted truncate">{String(r.designation || r.department || r.email || '')}</p>
              <p className="text-[11px] text-amber-600">Submitted {r.submittedAt ? new Date(String(r.submittedAt)).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'recently'}</p>
            </div>
            <button onClick={() => act(String(r.employeeId), 'approve')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">Approve</button>
            <button onClick={() => act(String(r.employeeId), 'reject')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-semibold hover:bg-red-100">Reject</button>
          </div>
        ))
      )}
    </div>
  );
}

function NewRequestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [field, setField] = useState('');
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const { user: authUser } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(authUser?.role || '');

  useEffect(() => {
    (async () => {
      try {
        // Task 139 — employees can only raise changes for THEMSELVES (the
        // picker showed every employee in the tenant). Admins keep the picker.
        if (!isAdmin) {
          const me = await fetch('/api/users/profile', { headers: getAuthHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          const emp = (me?.employee || {}) as Record<string, unknown>;
          const own = { id: String(emp.id || ''), name: `${String(emp.firstName || '')} ${String(emp.lastName || '')}`.trim() || 'My profile', code: String(emp.employeeId || '') };
          setEmployees(own.id ? [own] : []);
          setEmployeeId(own.id);
          return;
        }
        const res = await fetch('/api/employees?limit=500', { headers: getAuthHeaders() });
        const data = await res.json();
        const list = (data.employees || data.data || []) as Array<{ id: string; firstName?: string; lastName?: string; employeeId?: string }>;
        const mapped = list.map((e) => ({ id: e.id, name: `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Unnamed', code: e.employeeId || '' }));
        setEmployees(mapped);
        if (mapped.length === 1) setEmployeeId(mapped[0].id);
      } catch { /* ignore */ }
    })();
  }, []);

  const submit = async () => {
    if (!employeeId || !field || !newValue.trim()) { toast.error('Employee, field, and new value are required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/employees/update-requests', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId, fieldName: field, newValue: newValue.trim(), reason: reason || undefined }),
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
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Employee *</label>
            {isAdmin ? (
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="">Select employee…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.code ? ` · ${e.code}` : ''}</option>)}
              </select>
            ) : (
              <input type="text" value="Your own profile" disabled className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50 text-slate-500" />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Field *</label>
            <select value={field} onChange={(e) => setField(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="">Select field…</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {REQUESTABLE_FIELDS.filter((f) => f.category === g).map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">New Value *</label><input value={newValue} onChange={(e) => setNewValue(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Reason</label><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <p className="text-[10px] text-slate-400">Low-risk contact fields apply immediately. High-risk fields (personal / financial / KYC) route through the configured approval chain.</p>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t"><button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">Cancel</button><button onClick={submit} disabled={saving} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Submitting…' : 'Submit Request'}</button></div>
      </div>
    </div>
  );
}

export default function UpdateRequestsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [scope, setScope] = useState<'mine' | 'inbox' | 'all' | 'photos'>('inbox');
  const [requests, setRequests] = useState<UpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin', 'company_hr_admin'].includes(user?.role || '');

  const load = useCallback(async (s: 'mine' | 'inbox' | 'all' | 'photos') => {
    if (s === 'photos') return; // photo tab has its own data loader
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/update-requests?scope=${s}`, { headers: getAuthHeaders() });
      const data = await res.json();
      setRequests(data.requests || []);
    } catch { toast.error('Failed to load requests'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (scope !== 'photos') load(scope); }, [scope, load]);

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

  const tabs: { key: 'mine' | 'inbox' | 'all' | 'photos'; label: string; icon: React.ReactNode }[] = [
    { key: 'inbox', label: 'My Approvals', icon: <FiInbox className="w-3.5 h-3.5" /> },
    { key: 'mine', label: 'My Requests', icon: <FiSend className="w-3.5 h-3.5" /> },
    ...(isAdmin ? [{ key: 'all' as const, label: 'All Requests', icon: <FiClock className="w-3.5 h-3.5" /> }] : []),
    ...(isAdmin ? [{ key: 'photos' as const, label: 'Photo Approvals', icon: <FiUserCheck className="w-3.5 h-3.5" /> }] : []),
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

      {/* Task 139 — self-service tips */}
      {scope === 'mine' && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900 space-y-1">
          <p className="font-bold flex items-center gap-1.5"><FiZap className="w-3.5 h-3.5" /> Tips — what you can change yourself</p>
          <p><span className="font-semibold">Direct (no approval):</span> phone, personal email, addresses, emergency contacts, interests, technical skills, experience entries, achievements, family details — edit them on My Profile and they save immediately.</p>
          <p><span className="font-semibold">Needs HR/Admin approval:</span> the "Request Change" fields below (bank, KYC, gender, marital status, nationality, Original Birthday…) plus your profile photo (Employee → Update Requests → Photo Approvals is where HR confirms it).</p>
          <p><span className="font-semibold">Locked:</span> first name, last name and Date of Birth — contact HR/Admin to change these.</p>
        </div>
      )}

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setScope(t.key)} className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium ${scope === t.key ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {scope === 'photos' ? (
        <PhotoApprovals />
      ) : loading ? (
        <p className="text-sm text-thb-text-muted py-10 text-center">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="thb-card p-10 text-center">
          {scope === 'inbox' ? <FiInbox className="w-10 h-10 text-slate-300 mx-auto mb-3" /> : <FiCheckCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />}
          <p className="text-sm font-medium text-thb-text-secondary">No requests here</p>
          <p className="text-xs text-thb-text-muted mt-1">{scope === 'inbox' ? 'Nothing is waiting for your approval right now.' : 'Use "Request Change" to submit a profile update.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => <RequestCard key={r.id} r={r} canAct={scope === 'inbox'} onAct={act} />)}
        </div>
      )}

      {showNew && <NewRequestModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(scope); }} />}
    </div>
  );
}
