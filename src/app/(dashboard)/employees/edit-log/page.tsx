'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FiList, FiRefreshCw, FiDownload, FiFilter, FiCheckCircle, FiXCircle,
  FiClock, FiArrowRight, FiUser, FiFileText,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import ModuleTips from '@/components/ModuleTips';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface UpdateRequest {
  id: string;
  employeeId: string;
  employee?: { id: string; firstName: string; lastName: string; employeeId: string; department?: { name: string } | null } | null;
  fieldName: string;
  fieldLabel: string;
  category: string;
  oldValue: string;
  newValue: string;
  reason: string | null;
  status: string;
  currentTier: number;
  requestedById: string;
  requestedAt: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewComments: string | null;
  appliedAt: string | null;
  documentId: string | null;
}

interface TransferAudit {
  id: string;
  action: string;
  details?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
  createdAt: string;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:    { label: 'Pending',     color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    icon: <FiClock className="w-3.5 h-3.5" /> },
  approved:   { label: 'Approved',    color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: <FiCheckCircle className="w-3.5 h-3.5" /> },
  rejected:   { label: 'Rejected',    color: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200',       icon: <FiXCircle className="w-3.5 h-3.5" /> },
  applied:    { label: 'Applied',     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: <FiCheckCircle className="w-3.5 h-3.5" /> },
};

const CATEGORY_LABEL: Record<string, string> = {
  contact: 'Contact', personal: 'Personal', employment: 'Employment', financial: 'Financial', kyc: 'KYC', system: 'System',
};

export default function EmployeeEditLogPage() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const isAdmin = ['super_admin', 'tenant_admin', 'ceo', 'admin', 'hr_admin'].includes(user?.role || '');

  const [requests, setRequests] = useState<UpdateRequest[]>([]);
  const [transferAudits, setTransferAudits] = useState<TransferAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Admins viewing the edit log should see ALL employees' requests, not
      // just their own. Without scope=all the API defaults to scope=mine and
      // the audit log appears empty for changes submitted by other employees.
      if (isAdmin) params.set('scope', 'all');
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterCategory !== 'all') params.set('category', filterCategory);
      const sq = scopeQuery();
      const url = `/api/employees/update-requests?limit=200${sq ? `&${sq}` : ''}${params.toString() ? `&${params.toString()}` : ''}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      // The API returns either { requests } or { inbox, mine, all } based on role
      const list = j.requests || j.all || j.inbox || j.mine || [];
      setRequests(list);
      const auditRes = await Promise.race([
        fetch('/api/audit?module=employees&limit=200', { headers: getAuthHeaders() }),
        new Promise<Response>(resolve => setTimeout(() => resolve(new Response(null, { status: 504 })), 4000)),
      ]);
      if (auditRes.ok) {
        const auditJson = await auditRes.json();
        const transferActions = ['CREATE_TRANSFER_REQUEST', 'APPROVE_TRANSFER_LEVEL', 'APPROVE_TRANSFER_REQUEST', 'REJECT_TRANSFER_REQUEST'];
        const auditEntries = (auditJson.data || []).filter((entry: TransferAudit) => transferActions.includes(entry.action));
        if (auditEntries.length) {
          setTransferAudits(auditEntries);
        } else {
          const transferRes = await Promise.race([
            fetch('/api/employees/transfer?limit=200', { headers: getAuthHeaders() }),
            new Promise<Response>(resolve => setTimeout(() => resolve(new Response(null, { status: 504 })), 4000)),
          ]);
          const transferJson = transferRes.ok ? await transferRes.json() : { transfers: [] };
          const derived: TransferAudit[] = (transferJson.transfers || []).flatMap((transfer: any) => {
            const entries: TransferAudit[] = [{
              id: `${transfer.id}-created`, action: 'CREATE_TRANSFER_REQUEST',
              details: `Transfer request for ${transfer.employeeName} (${transfer.employeeCode}) — ${transfer.fromDepartment} → ${transfer.toDepartment}`,
              createdAt: transfer.createdAt,
            }];
            if (transfer.status === 'approved' || transfer.status === 'rejected') entries.push({
              id: `${transfer.id}-${transfer.status}`, action: transfer.status === 'approved' ? 'APPROVE_TRANSFER_REQUEST' : 'REJECT_TRANSFER_REQUEST',
              details: transfer.status === 'approved' ? `Approved transfer for ${transfer.employeeName} (${transfer.employeeCode})` : `Rejected transfer for ${transfer.employeeName} (${transfer.employeeCode}) — ${transfer.rejectionReason || 'No reason provided'}`,
              user: transfer.approverId ? { name: transfer.approverId } : null,
              createdAt: transfer.decisionDate || transfer.updatedAt,
            });
            return entries;
          });
          setTransferAudits(derived);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load edit log');
      setRequests([]);
      setTransferAudits([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCategory, scopeQuery, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Stats — based on ALL requests (before filtering)
  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    applied: requests.filter(r => r.status === 'applied').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  };

  // BUG_064-068 FIX: Apply filters to the displayed list. Previously the
  // filter dropdowns updated state but the table still showed ALL requests.
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterCategory !== 'all' && r.category !== filterCategory) return false;
      return true;
    });
  }, [requests, filterStatus, filterCategory]);

  const exportCSV = () => {
    if (requests.length === 0) { toast.error('Nothing to export'); return; }
    let csv = 'Employee,Field,Category,Old Value,New Value,Status,Requested At,Reviewed At,Review Comments,Reason\n';
    for (const r of requests) {
      const emp = r.employee ? `${r.employee.firstName} ${r.employee.lastName} (${r.employee.employeeId})` : r.employeeId;
      csv += `"${emp}","${r.fieldLabel}","${CATEGORY_LABEL[r.category] || r.category}","${(r.oldValue || '').replace(/"/g, '""')}","${(r.newValue || '').replace(/"/g, '""')}","${r.status}","${fmtTime(r.requestedAt)}","${fmtTime(r.reviewedAt)}","${(r.reviewComments || '').replace(/"/g, '""')}","${(r.reason || '').replace(/"/g, '""')}"\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employee_edit_log_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <FiList className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Employee Info Edit Log</h1>
            <p className="text-sm text-thb-text-secondary">
              {isAdmin ? 'All employee profile-change requests — for audit, compliance, and future communication.' : 'Your profile-change requests + their approval status.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={exportCSV} className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
            <FiDownload className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="thb-card p-4"><p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Total Requests</p><p className="text-2xl font-bold text-thb-text-primary mt-1">{stats.total}</p></div>
        <div className="thb-card p-4"><p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Pending</p><p className="text-2xl font-bold text-amber-600 mt-1">{stats.pending}</p></div>
        <div className="thb-card p-4"><p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Approved</p><p className="text-2xl font-bold text-emerald-600 mt-1">{stats.approved}</p></div>
        <div className="thb-card p-4"><p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Applied</p><p className="text-2xl font-bold text-teal-600 mt-1">{stats.applied}</p></div>
        <div className="thb-card p-4"><p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Rejected</p><p className="text-2xl font-bold text-rose-600 mt-1">{stats.rejected}</p></div>
      </div>

      {/* Filters */}
      <div className="thb-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <FiFilter className="w-4 h-4 text-thb-text-muted" />
          <label className="text-xs font-medium text-thb-text-secondary">Status</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2.5 py-1.5 border border-thb-border rounded-lg text-sm bg-white">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="applied">Applied</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-thb-text-secondary">Category</label>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-2.5 py-1.5 border border-thb-border rounded-lg text-sm bg-white">
            <option value="all">All</option>
            <option value="contact">Contact</option>
            <option value="personal">Personal</option>
            <option value="employment">Employment</option>
            <option value="financial">Financial</option>
            <option value="kyc">KYC</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="thb-card overflow-hidden">
        <div className="p-4 border-b border-thb-border">
          <h3 className="text-sm font-semibold text-thb-text-primary">Edit Log ({filteredRequests.length})</h3>
        </div>
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin inline-block h-8 w-8 border-4 border-slate-200 border-t-teal-500 rounded-full mb-3" />
            <p className="text-sm text-thb-text-secondary">Loading edit log…</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-10 text-center">
            <FiList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-thb-text-muted">No records found for the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[640px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Employee</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Field</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Change</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Requested</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map(r => {
                  const meta = STATUS_META[r.status] || { label: r.status, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200', icon: <FiClock className="w-3.5 h-3.5" /> };
                  const emp = r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : r.employeeId;
                  const empCode = r.employee?.employeeId || '—';
                  const dept = r.employee?.department?.name || '—';
                  return (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-thb-text-primary">{emp}</p>
                        <p className="text-xs text-thb-text-muted">{empCode} · {dept}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-thb-text-primary">{r.fieldLabel}</p>
                        <p className="text-xs text-thb-text-muted">{CATEGORY_LABEL[r.category] || r.category}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded border border-rose-200 font-mono max-w-[180px] truncate" title={r.oldValue}>{r.oldValue || '—'}</span>
                          <FiArrowRight className="w-3 h-3 text-thb-text-muted" />
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 font-mono max-w-[180px] truncate" title={r.newValue}>{r.newValue || '—'}</span>
                        </div>
                        {r.reason && <p className="text-xs text-thb-text-muted mt-1 italic truncate max-w-[280px]" title={r.reason}>"{r.reason}"</p>}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.bg} ${meta.color}`}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-thb-text-secondary text-xs">{fmtTime(r.requestedAt)}</td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-thb-text-secondary text-xs">{fmtTime(r.reviewedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* BUG_074 FIX: Transfer Audit History is visible only to HR/Admin roles.
          Regular employees should not see other employees' transfer records. */}
      {isAdmin && (
      <div className="thb-card overflow-hidden">
        <div className="p-4 border-b border-thb-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-thb-text-primary">Transfer Audit History ({transferAudits.length})</h3>
            <p className="text-xs text-thb-text-muted mt-1">Submission, approval, and rejection actions for employee transfers.</p>
          </div>
          <FiFileText className="w-4 h-4 text-teal-600" />
        </div>
        {transferAudits.length === 0 ? (
          <div className="p-8 text-center text-sm text-thb-text-muted">No transfer audit actions found.</div>
        ) : (
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Action</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Details</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Performed By</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Date &amp; Time</th>
                </tr>
              </thead>
              <tbody>
                {transferAudits.map(audit => (
                  <tr key={audit.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2.5 px-4 font-medium text-thb-text-primary">{audit.action.replaceAll('_', ' ')}</td>
                    <td className="py-2.5 px-4 text-xs text-thb-text-secondary max-w-[420px] truncate" title={audit.details || ''}>{audit.details || '—'}</td>
                    <td className="py-2.5 px-4 text-xs text-thb-text-secondary">{audit.user?.name || audit.user?.email || 'System'}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-xs text-thb-text-secondary">{fmtTime(audit.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      <ModuleTips
        moduleKey="employees-edit-log"
        title="Edit Log Tips"
        tips={[
          { title: 'Approval Workflow', description: 'High-risk fields (name, DOB, gender, marital status, bank, KYC, employment details) require admin approval. Low-risk fields (phone, address, personal email) update directly.' },
          { title: 'Restricted Fields', description: 'Official email, employee ID, salary, joining date, and company are restricted — employees can NEVER change them via self-service. Only admin can edit these.' },
          { title: 'Future Communication', description: 'Use the CSV export to attach the audit trail to performance reviews, compliance reports, or HR communications.' },
          { title: 'Re-review', description: 'Once a request is approved or rejected, it cannot be re-reviewed. The employee can submit a new request if circumstances change.' },
        ]}
      />
    </div>
  );
}
