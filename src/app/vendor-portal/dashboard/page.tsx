'use client';

/**
 * Vendor Portal Dashboard — /vendor-portal/dashboard
 * (mock screens 08, 09, 10)
 *
 * Vendor ADMIN — "BGV Cases": filter tabs (Unassigned / All / Assigned /
 * In Progress / Submitted / Rework / Closed) + search by candidate or case
 * ID + Assign modal (employee picker with active-case workload, due date,
 * instructions, conflict-safe).
 *
 * Vendor EMPLOYEE — "My Cases": ONLY their assigned cases with tabs
 * (Assigned / In Progress / Rework / Submitted / Closed) and Open Case.
 * The server enforces the same visibility rules as this UI.
 *
 * Admins also get a Team link (management page at /vendor-portal/team).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiShield, FiRefreshCw, FiLoader, FiAlertCircle, FiUserPlus, FiClock,
  FiCheckCircle, FiFileText, FiUsers, FiSearch, FiChevronRight, FiX, FiInfo, FiSettings,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface BgvRequest {
  id: string;
  candidateEmail: string;
  candidateName?: string;
  status: string;
  caseNumber?: string;
  vendorName?: string;
  dueDate?: string;
  version?: number;
  createdAt: string;
  assignedVendorUserId?: string;
  assigneeName?: string;
  assigneeEmail?: string;
  reworkReason?: string | null;
  reworkDueDate?: string | null;
  checks?: Array<{ id: string; checkType: string; checkLabel?: string; status: string; result?: string }>;
  reports?: Array<{ id: string; version: number; status: string; hrDecision?: string | null }>;
}

interface VendorStaff {
  id: string; name: string; email: string; role: string; status: string; activeCases?: number;
}

const STATUS_LABELS: Record<string, string> = {
  awaiting_assignment: 'Awaiting Assignment',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  awaiting_information: 'Awaiting Info',
  submitted_for_hr_review: 'Submitted for Review',
  rework_required: 'Rework Required',
  approved_by_hr: 'Approved',
  rejected_by_hr: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  awaiting_assignment: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-blue-100 text-blue-800',
  awaiting_information: 'bg-amber-100 text-amber-800',
  submitted_for_hr_review: 'bg-violet-100 text-violet-800',
  rework_required: 'bg-orange-100 text-orange-800',
  approved_by_hr: 'bg-emerald-100 text-emerald-800',
  rejected_by_hr: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-100 text-slate-600',
};

export default function VendorDashboardPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<BgvRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendorInfo, setVendorInfo] = useState<{ vendorCompanyId: string; role: string; vendorUserId?: string } | null>(null);
  const [tab, setTab] = useState('unassigned');
  const [search, setSearch] = useState('');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor/requests', { headers: getAuthHeaders() });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `Failed (${res.status})`); }
      const data = await res.json();
      setRequests(data.requests || []);
      setVendorInfo({ vendorCompanyId: data.vendorCompanyId, role: data.role, vendorUserId: data.vendorUserId });
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => void fetchRequests()); }, [fetchRequests]);

  const isAdmin = vendorInfo?.role === 'vendor_admin';

  const TABS = isAdmin
    ? [
        { key: 'unassigned', label: 'Unassigned' },
        { key: 'all', label: 'All Cases' },
        { key: 'assigned', label: 'Assigned' },
        { key: 'in_progress', label: 'In Progress' },
        { key: 'submitted', label: 'Submitted' },
        { key: 'rework', label: 'Rework' },
        { key: 'closed', label: 'Closed' },
      ]
    : [
        { key: 'assigned', label: 'Assigned' },
        { key: 'in_progress', label: 'In Progress' },
        { key: 'rework', label: 'Rework' },
        { key: 'submitted', label: 'Submitted' },
        { key: 'closed', label: 'Closed' },
      ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      const matchQ = !q ||
        r.candidateName?.toLowerCase().includes(q) ||
        r.candidateEmail?.toLowerCase().includes(q) ||
        r.caseNumber?.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q);
      const matchT =
        tab === 'all' ? true :
        tab === 'unassigned' ? r.status === 'awaiting_assignment' :
        tab === 'assigned' ? r.status === 'assigned' :
        tab === 'in_progress' ? r.status === 'in_progress' :
        tab === 'submitted' ? r.status === 'submitted_for_hr_review' || r.status === 'awaiting_information' :
        tab === 'rework' ? r.status === 'rework_required' :
        tab === 'closed' ? ['approved_by_hr', 'rejected_by_hr', 'cancelled'].includes(r.status) : true;
      return matchQ && matchT;
    });
  }, [requests, search, tab]);

  const unassignedCount = requests.filter((r) => r.status === 'awaiting_assignment').length;

  const openCase = (r: BgvRequest) => {
    if (r.status === 'awaiting_assignment') {
      if (isAdmin) toast.error('Assign this case to an investigator first.');
      return;
    }
    router.push(`/vendor-portal/requests/${r.id}`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3"><FiShield className="h-6 w-6" /> {isAdmin ? 'Vendor Dashboard' : 'My Cases'}</h1>
            <p className="text-slate-300 mt-1 text-sm">
              {isAdmin ? 'BGV cases for your company — assign investigators and monitor progress.' : 'Only cases assigned to you appear here.'}
            </p>
          </div>
          <nav className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={() => router.push('/vendor-portal/team')} className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg inline-flex items-center gap-2">
                <FiUsers className="h-4 w-4" /> Team
              </button>
            )}
            <button onClick={fetchRequests} disabled={loading} className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg inline-flex items-center gap-2">
              <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </nav>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Unassigned" value={requests.filter(r => r.status === 'awaiting_assignment').length} color="text-amber-600" icon={<FiClock className="h-5 w-5" />} />
          <StatCard label="In Progress" value={requests.filter(r => ['assigned', 'in_progress', 'rework_required'].includes(r.status)).length} color="text-blue-600" icon={<FiUsers className="h-5 w-5" />} />
          <StatCard label="Submitted" value={requests.filter(r => ['submitted_for_hr_review', 'awaiting_information'].includes(r.status)).length} color="text-violet-600" icon={<FiFileText className="h-5 w-5" />} />
          <StatCard label="Completed" value={requests.filter(r => ['approved_by_hr', 'rejected_by_hr'].includes(r.status)).length} color="text-emerald-600" icon={<FiCheckCircle className="h-5 w-5" />} />
        </div>

        {/* Tabs + search */}
        <div className="bg-white border rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const count = t.key === 'unassigned' ? unassignedCount : undefined;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    tab === t.key ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {t.label}{count ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>
          <div className="relative md:ml-auto md:w-72">
            <FiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidate / case ID…"
              className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" aria-label="Search cases" />
          </div>
        </div>

        {error ? (
          <div className="bg-white border rounded-xl p-10 text-center">
            <FiAlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">{error}</p>
            <button onClick={fetchRequests} className="mt-3 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">Retry</button>
          </div>
        ) : loading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 bg-white border rounded-xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border rounded-xl p-12 text-center">
            <FiShield className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">
              {tab === 'unassigned' ? 'No unassigned cases — new HR requests appear here.' : 'No cases in this view.'}
            </p>
            {!isAdmin && <p className="text-xs text-slate-400 mt-1">Empty state means no cases are assigned to you yet.</p>}
          </div>
        ) : (
          <div className="bg-white border rounded-xl overflow-hidden overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Candidate</th>
                  <th className="text-left px-4 py-3 font-medium">Case ID</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Due Date</th>
                  <th className="text-left px-4 py-3 font-medium">{isAdmin ? 'Investigator' : 'Progress'}</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-800">{r.candidateName || 'Unknown candidate'}</p>
                      <p className="text-xs text-slate-400">{r.candidateEmail}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs text-slate-600">{r.caseNumber || r.id}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-700'}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                      {r.status === 'rework_required' && r.reworkReason && (
                        <p className="text-[11px] text-orange-600 mt-1 max-w-[220px] truncate" title={r.reworkReason}>HR: {r.reworkReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 text-xs">{r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="px-4 py-3.5">
                      {isAdmin ? (
                        <span className="text-xs text-slate-600">{r.assigneeName || <span className="text-slate-400">Unassigned</span>}</span>
                      ) : (
                        <div className="w-28">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-teal-500 rounded-full" style={{ width: `${r.checks?.length ? Math.round((r.checks.filter(c => c.status === 'completed').length / r.checks.length) * 100) : 0}%` }} />
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">{r.checks?.filter(c => c.status === 'completed').length || 0}/{r.checks?.length || 0} checks</p>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {r.status === 'awaiting_assignment' && isAdmin ? (
                        <AssignButton request={r} vendorCompanyId={vendorInfo!.vendorCompanyId} onDone={fetchRequests} />
                      ) : r.status === 'awaiting_assignment' ? (
                        <span className="text-xs text-slate-400 inline-flex items-center gap-1"><FiInfo /> Awaiting admin</span>
                      ) : (
                        <button onClick={() => openCase(r)} className="inline-flex items-center gap-1.5 border border-teal-600 text-teal-700 hover:bg-teal-600 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                          Open Case <FiChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-400 flex items-center gap-1.5"><FiInfo /> An unassigned case is visible to admins only — ordinary employees never see it until it is assigned to them.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── Assign button + modal (screen 09) ─────────────────────────── */
function AssignButton({ request, vendorCompanyId, onDone }: {
  request: BgvRequest; vendorCompanyId: string; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<VendorStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [dueDate, setDueDate] = useState(request.dueDate ? new Date(request.dueDate).toISOString().slice(0, 10) : '');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => { (async () => { if (cancelled) return;
    setStaffLoading(true);
    fetch(`/api/vendors/${vendorCompanyId}/users`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setStaff((d.users || []).filter((u: VendorStaff) => u.role === 'vendor_employee' && u.status === 'active')))
      .catch(() => { if (!cancelled) setStaff([]); })
      .finally(() => { if (!cancelled) setStaffLoading(false); }); })(); });
    return () => { cancelled = true; };
  }, [open, vendorCompanyId]);

  const assign = async () => {
    if (!selectedId) { toast.error('Select an employee to assign'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/vendor/requests/${request.id}/assign`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ vendorUserId: selectedId, reason: 'Initial assignment', dueDate: dueDate || undefined, instructions: instructions || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Assignment failed');
      toast.success(d.message || 'Case assigned.');
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : 'Assignment failed');
    } finally { setBusy(false); }
  };

  const selected = staff.find((s) => s.id === selectedId);

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors">
        <FiUserPlus className="w-3.5 h-3.5" /> Assign
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3.5 border-b flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><FiShield className="h-4 w-4 text-teal-600" /> Assign BGV Case</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close"><FiX /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-slate-500">Candidate</p><p className="font-medium">{request.candidateName || request.candidateEmail}</p></div>
                <div><p className="text-xs text-slate-500">Case ID</p><p className="font-medium font-mono">{request.caseNumber || request.id}</p></div>
                <div className="col-span-2"><p className="text-xs text-slate-500">Checks requested</p><p className="text-xs text-slate-600">{(request.checks || []).map((c) => c.checkLabel || c.checkType).join(', ') || '—'}</p></div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Assign to employee *</label>
                {staffLoading ? (
                  <div className="text-xs text-slate-500 flex items-center gap-2 py-1.5"><FiLoader className="h-3.5 w-3.5 animate-spin" /> Loading employees…</div>
                ) : staff.length === 0 ? (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                    No active employees in your vendor company yet. Use <b>Team → Invite Employee</b>, wait for them to activate, then return here to assign.
                  </div>
                ) : (
                  <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="w-full text-sm border rounded-md px-2.5 py-2 bg-white">
                    <option value="">Select employee…</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.email}) · {s.activeCases ?? 0} active case{(s.activeCases ?? 0) === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-slate-400 mt-1">Only active employees of your vendor company can take cases.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Due date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full text-sm border rounded-md px-2.5 py-2" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Instructions (optional)</label>
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2}
                  placeholder="e.g. Please complete all checks (Identity, Education, Employment) and upload supporting evidence."
                  className="w-full text-sm border rounded-md px-3 py-2" />
              </div>
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={busy} className="px-3.5 py-2 text-sm border rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={assign} disabled={busy || !selectedId}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-2">
                {busy ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiCheckCircle className="h-4 w-4" />} Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-lg p-3.5">
      <div className="flex items-center gap-2.5">
        {icon}
        <div>
          <div className={`text-xl font-bold ${color}`}>{value}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
        </div>
      </div>
    </div>
  );
}
