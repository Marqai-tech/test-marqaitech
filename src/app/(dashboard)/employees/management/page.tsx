'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  FiUsers, FiRefreshCw, FiDownload, FiSearch, FiUser, FiFilter,
  FiChevronRight, FiUserCheck, FiUsers as FiUsersIcon, FiArrowLeft, FiStar,
  FiEye, FiEdit2,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import ModuleTips from '@/components/ModuleTips';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface MgmtEmployee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isManagement?: boolean;
  avatar?: string | null;   // Task 87: photo URL attached by /api/employees (with embedded token)
  department?: { id: string; name: string } | null;
  designation?: { id: string; title: string } | null;
  user?: { id: string; role: string } | null;
  reportingManagerId?: string | null;
  reportingManager?: { id: string; firstName: string; lastName: string; employeeId: string } | null;
  status: string;
}

interface DirectReport {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  avatar?: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  tenant_admin: 'Tenant Admin',
  admin: 'Admin',
  hr_admin: 'HR Admin',
  manager: 'Manager',
  employee: 'Employee',
  finance_admin: 'Finance Admin',
};

export default function ManagementListPage() {
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const isAdmin = ['super_admin', 'tenant_admin', 'admin', 'hr_admin'].includes(user?.role || '');

  const [allEmployees, setAllEmployees] = useState<MgmtEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'designated' | 'role'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const sq = scopeQuery();
      const res = await fetch(`/api/employees?limit=500${sq ? `&${sq}` : ''}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllEmployees(data.employees || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load employees');
      setAllEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [scopeQuery]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  /* ─── Filter to management-level employees ───
     An employee qualifies as "management" if they meet ANY of these criteria:
     0. EXPLICIT DESIGNATION — an HR/admin ticked "Designate as Management" on
        their employee record (isManagement=true), or they were uploaded with
        "Is Management = true" in the bulk import. This is the primary source.
     1. Their linked User has role: manager, admin, tenant_admin, hr_admin, super_admin
     2. They are a reporting manager for other employees (have direct reports)

     Task 81: separated employees (terminated / resigned / inactive) are NEVER
     management and NEVER count as reportees — only currently-employed people
     (active / on_leave) are listed or counted.
  */
  const CURRENT_STATUSES = ['active', 'on_leave'];
  const currentEmployees = useMemo(
    () => allEmployees.filter(e => CURRENT_STATUSES.includes(e.status)),
    [allEmployees],
  );

  const managementEmployees = useMemo(() => {
    const mgmtRoles = ['manager', 'admin', 'tenant_admin', 'hr_admin', 'super_admin'];

    // Build a set of reporting manager IDs (employees who have direct reports)
    // from CURRENT employees only — terminated reportees no longer make someone
    // a reporting manager.
    const reportingManagerIds = new Set<string>();
    currentEmployees.forEach(emp => {
      if (emp.reportingManagerId) reportingManagerIds.add(emp.reportingManagerId);
    });

    return currentEmployees.filter(emp => {
      // Criterion 0: explicitly designated as management from the employee form / bulk upload
      if (emp.isManagement === true) return true;
      // Criterion 1: User role is management-level
      if (emp.user && mgmtRoles.includes(emp.user.role)) return true;
      // Criterion 2: Employee is a reporting manager for others
      if (reportingManagerIds.has(emp.id)) return true;
      return false;
    });
  }, [currentEmployees]);

  /* ─── Get direct reports for an employee (currently-employed only) ─── */
  const getDirectReports = useCallback((empId: string): DirectReport[] => {
    return currentEmployees.filter(e => e.reportingManagerId === empId).map(e => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      employeeId: e.employeeId,
      avatar: e.avatar,
    }));
  }, [currentEmployees]);

  /* ─── Filtered results based on source filter + search. Designated employees sort first. ─── */
  const filtered = useMemo(() => {
    let base = managementEmployees;
    if (sourceFilter === 'designated') base = base.filter(e => e.isManagement === true);
    if (sourceFilter === 'role') base = base.filter(e => e.isManagement !== true);
    if (!searchQuery.trim()) {
      return [...base].sort((a, b) => {
        if (a.isManagement !== b.isManagement) return a.isManagement ? -1 : 1;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      });
    }
    const q = searchQuery.trim().toLowerCase();
    const matched = base.filter(e => {
      const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
      return fullName.includes(q) ||
             e.employeeId.toLowerCase().includes(q) ||
             (e.department?.name || '').toLowerCase().includes(q) ||
             (e.designation?.title || '').toLowerCase().includes(q) ||
             (e.email || '').toLowerCase().includes(q);
    });
    return matched.sort((a, b) => {
      if (a.isManagement !== b.isManagement) return a.isManagement ? -1 : 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
  }, [managementEmployees, searchQuery, sourceFilter]);

  /* ─── Stats ─── */
  const stats = {
    total: filtered.length,
    designated: filtered.filter(e => e.isManagement === true).length,
    managers: filtered.filter(e => e.user?.role === 'manager').length,
    admins: filtered.filter(e => ['admin', 'tenant_admin', 'hr_admin', 'super_admin'].includes(e.user?.role || '')).length,
  };

  /* ─── CSV Export ─── */
  const exportCSV = () => {
    if (filtered.length === 0) { toast.error('Nothing to export'); return; }
    let csv = 'Employee Code,Name,Email,Phone,Department,Designation,Designated As Management,Role,Direct Reports Count,Reporting Manager,Status\n';
    for (const e of filtered) {
      const name = `${e.firstName} ${e.lastName}`.trim();
      const dept = e.department?.name || '';
      const desig = e.designation?.title || '';
      const designated = e.isManagement === true ? 'Yes' : 'No';
      const role = ROLE_LABEL[e.user?.role || ''] || 'Employee';
      const reports = getDirectReports(e.id).length;
      const mgr = e.reportingManager ? `${e.reportingManager.firstName} ${e.reportingManager.lastName}` : '';
      csv += `"${e.employeeId}","${name}","${e.email}","${e.phone || ''}","${dept}","${desig}","${designated}","${role}","${reports}","${mgr}","${e.status}"\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `management_list_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <FiUserCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thb-text-primary">Management List</h1>
            <p className="text-sm text-thb-text-secondary">
              Employees designated or selected as management — explicitly flagged from the employee list or bulk upload, plus reporting managers and admin-role users.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchEmployees} className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={exportCSV} className="inline-flex items-center gap-2 px-3 py-2 border border-thb-border rounded-lg text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
            <FiDownload className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Total Management</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.total}</p>
        </div>
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Designated</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.designated}</p>
        </div>
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Managers</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.managers}</p>
        </div>
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Admins</p>
          <p className="text-2xl font-bold text-teal-600 mt-1">{stats.admins}</p>
        </div>
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">With Direct Reports</p>
          <p className="text-2xl font-bold text-violet-600 mt-1">{filtered.filter(e => getDirectReports(e.id).length > 0).length}</p>
        </div>
      </div>

      {/* Search + Source Filter */}
      <div className="thb-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, employee ID, department, designation, or email…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-thb-border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
            />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg border border-thb-border bg-slate-50 self-stretch">
            {([['all', 'All'], ['designated', 'Designated'], ['role', 'Role-based']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSourceFilter(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  sourceFilter === key
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-thb-text-secondary hover:bg-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="thb-card overflow-hidden">
        <div className="p-4 border-b border-thb-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-thb-text-primary">Management Employees ({filtered.length})</h3>
        </div>
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin inline-block h-8 w-8 border-4 border-slate-200 border-t-emerald-500 rounded-full mb-3" />
            <p className="text-sm text-thb-text-secondary">Loading management list…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <FiUserCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-thb-text-muted">No management employees found. Tick "Designate as Management" on an employee record (Employee List → Edit → Employment tab), upload employees with "Is Management = true" in the bulk import, or assign management roles / reporting managers.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Employee</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Department</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Designation</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Designated</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Role</th>
                  <th className="text-right py-3 px-4 font-semibold text-thb-text-secondary">Direct Reports</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Reporting Manager</th>
                  <th className="text-center py-3 px-4 font-semibold text-thb-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const reports = getDirectReports(e.id);
                  const fullName = `${e.firstName} ${e.lastName}`.trim();
                  const role = e.user?.role || 'employee';
                  const roleLabel = ROLE_LABEL[role] || 'Employee';
                  const isMgmtRole = ['manager', 'admin', 'tenant_admin', 'hr_admin', 'super_admin'].includes(role);
                  const isReportingMgr = reports.length > 0;
                  return (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          {e.avatar ? (
                            <img
                              src={e.avatar}
                              alt={fullName}
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-slate-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-xs flex-shrink-0">
                              {e.firstName?.[0]}{e.lastName?.[0] || ''}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-thb-text-primary">{fullName}</p>
                            <p className="text-xs text-thb-text-muted">{e.employeeId} · {e.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-thb-text-secondary">{e.department?.name || '—'}</td>
                      <td className="py-2.5 px-4 text-thb-text-secondary">{e.designation?.title || '—'}</td>
                      <td className="py-2.5 px-4">
                        {e.isManagement === true && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200" title="Explicitly designated as management from the employee list / bulk upload">
                            <FiStar className="w-3 h-3" /> Designated
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                          isMgmtRole
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {isMgmtRole && <FiUserCheck className="w-3 h-3" />}
                          {roleLabel}
                        </span>
                        {isReportingMgr && !isMgmtRole && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 ml-1">
                            <FiUsersIcon className="w-3 h-3" /> Reporting Mgr
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          reports.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {reports.length}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-thb-text-secondary text-xs">
                        {e.reportingManager ? `${e.reportingManager.firstName} ${e.reportingManager.lastName}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          <Link
                            href={`/employees/${e.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50 rounded transition-colors"
                            title="View employee profile"
                          >
                            <FiEye className="w-3.5 h-3.5" /> View
                          </Link>
                          <Link
                            href={`/employees?editId=${e.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit employee"
                          >
                            <FiEdit2 className="w-3.5 h-3.5" /> Edit
                          </Link>
                          <button
                            onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="View direct reports"
                          >
                            <FiChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedId === e.id ? 'rotate-90' : ''}`} />
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expanded Direct Reports Panels */}
      {filtered.map(e => {
        if (expandedId !== e.id) return null;
        const reports = getDirectReports(e.id);
        return (
          <div key={`expanded-${e.id}`} className="thb-card p-5 ml-4 border-l-4 border-l-emerald-500 animate-fade-in">
            <h4 className="text-sm font-semibold text-thb-text-primary mb-3 flex items-center gap-2">
              <FiUsersIcon className="w-4 h-4 text-emerald-500" />
              Direct Reports of {e.firstName} {e.lastName} ({e.employeeId})
            </h4>
            {reports.length === 0 ? (
              <p className="text-xs text-thb-text-muted">No direct reports. Set this employee as the reporting manager for others in their profile.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {reports.map(r => (
                  <div key={r.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                    {r.avatar ? (
                      <img src={r.avatar} alt={`${r.firstName} ${r.lastName}`} className="w-6 h-6 rounded-full object-cover flex-shrink-0 border border-slate-200" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-[10px]">
                        {r.firstName?.[0]}{r.lastName?.[0] || ''}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-thb-text-primary">{r.firstName} {r.lastName}</p>
                      <p className="text-[10px] text-thb-text-muted">{r.employeeId}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <ModuleTips
        moduleKey="employees-management"
        title="Management List Tips"
        tips={[
          { title: 'Designate from the employee list', description: 'Open Employee List → Edit an employee → Employment tab → tick "Designate as Management". Designated employees appear here immediately, sorted to the top with a Designated badge.' },
          { title: 'Designate via bulk upload', description: 'In the Employees bulk import template, set the "Is Management" column to true/yes/1 for management employees. Their designation flows straight into this list.' },
          { title: 'Who else appears here?', description: 'Besides explicit designations, employees with a management role (manager, admin, HR admin) and reporting managers with direct reports are included. Use the Designated / Role-based filter to separate the two sources.' },
          { title: 'Direct Reports & CSV', description: 'Click "Details" to see who reports to each manager, and export the full list (including the Designated flag) to CSV for org reviews or compliance documentation.' },
        ]}
      />
    </div>
  );
}
