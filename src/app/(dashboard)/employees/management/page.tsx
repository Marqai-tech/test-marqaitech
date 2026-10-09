'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  FiUsers, FiRefreshCw, FiDownload, FiSearch, FiUser, FiFilter,
  FiChevronRight, FiUserCheck, FiUsers as FiUsersIcon, FiArrowLeft,
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
     1. Their linked User has role: manager, admin, tenant_admin, hr_admin, super_admin
     2. They are a reporting manager for other employees (have direct reports)
  */
  const managementEmployees = useMemo(() => {
    const mgmtRoles = ['manager', 'admin', 'tenant_admin', 'hr_admin', 'super_admin'];

    // Build a set of reporting manager IDs (employees who have direct reports)
    const reportingManagerIds = new Set<string>();
    allEmployees.forEach(emp => {
      if (emp.reportingManagerId) reportingManagerIds.add(emp.reportingManagerId);
    });

    return allEmployees.filter(emp => {
      // Criterion 1: User role is management-level
      if (emp.user && mgmtRoles.includes(emp.user.role)) return true;
      // Criterion 2: Employee is a reporting manager for others
      if (reportingManagerIds.has(emp.id)) return true;
      return false;
    });
  }, [allEmployees]);

  /* ─── Get direct reports for an employee ─── */
  const getDirectReports = useCallback((empId: string): DirectReport[] => {
    return allEmployees.filter(e => e.reportingManagerId === empId).map(e => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      employeeId: e.employeeId,
    }));
  }, [allEmployees]);

  /* ─── Filtered results based on search ─── */
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return managementEmployees;
    const q = searchQuery.trim().toLowerCase();
    return managementEmployees.filter(e => {
      const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
      return fullName.includes(q) ||
             e.employeeId.toLowerCase().includes(q) ||
             (e.department?.name || '').toLowerCase().includes(q) ||
             (e.designation?.title || '').toLowerCase().includes(q) ||
             (e.email || '').toLowerCase().includes(q);
    });
  }, [managementEmployees, searchQuery]);

  /* ─── Stats ─── */
  const stats = {
    total: filtered.length,
    managers: filtered.filter(e => e.user?.role === 'manager').length,
    admins: filtered.filter(e => ['admin', 'tenant_admin', 'hr_admin', 'super_admin'].includes(e.user?.role || '')).length,
    withDirectReports: filtered.filter(e => getDirectReports(e.id).length > 0).length,
  };

  /* ─── CSV Export ─── */
  const exportCSV = () => {
    if (filtered.length === 0) { toast.error('Nothing to export'); return; }
    let csv = 'Employee Code,Name,Email,Phone,Department,Designation,Role,Direct Reports Count,Reporting Manager,Status\n';
    for (const e of filtered) {
      const name = `${e.firstName} ${e.lastName}`.trim();
      const dept = e.department?.name || '';
      const desig = e.designation?.title || '';
      const role = ROLE_LABEL[e.user?.role || ''] || 'Employee';
      const reports = getDirectReports(e.id).length;
      const mgr = e.reportingManager ? `${e.reportingManager.firstName} ${e.reportingManager.lastName}` : '';
      csv += `"${e.employeeId}","${name}","${e.email}","${e.phone || ''}","${dept}","${desig}","${role}","${reports}","${mgr}","${e.status}"\n`;
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
              Employees designated as management — reporting managers, department heads, and admin-role users.
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="thb-card p-4">
          <p className="text-xs font-medium text-thb-text-muted uppercase tracking-wide">Total Management</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.total}</p>
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
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.withDirectReports}</p>
        </div>
      </div>

      {/* Search */}
      <div className="thb-card p-4">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, employee ID, department, designation, or email…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-thb-border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
          />
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
            <p className="text-sm text-thb-text-muted">No management employees found. Employees with a management role (manager, admin, HR) or who are reporting managers for other employees will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Employee</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Department</th>
                  <th className="text-left py-3 px-4 font-semibold text-thb-text-secondary">Designation</th>
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
                          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-xs flex-shrink-0">
                            {e.firstName?.[0]}{e.lastName?.[0] || ''}
                          </div>
                          <div>
                            <p className="font-medium text-thb-text-primary">{fullName}</p>
                            <p className="text-xs text-thb-text-muted">{e.employeeId} · {e.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-thb-text-secondary">{e.department?.name || '—'}</td>
                      <td className="py-2.5 px-4 text-thb-text-secondary">{e.designation?.title || '—'}</td>
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
                        <button
                          onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                          title="View direct reports"
                        >
                          <FiChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedId === e.id ? 'rotate-90' : ''}`} />
                          Details
                        </button>
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
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-[10px]">
                      {r.firstName?.[0]}{r.lastName?.[0] || ''}
                    </div>
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
          { title: 'Who appears here?', description: 'Employees with a management role (manager, admin, HR admin) OR employees who are reporting managers for other employees. Both criteria make someone a "management" employee.' },
          { title: 'Direct Reports', description: 'Click "Details" on any employee to see the list of employees who report to them. Direct reports are determined by the reportingManagerId field on each employee record.' },
          { title: 'CSV Export', description: 'Export the management list with role, department, designation, direct report count, and reporting manager for org reviews or compliance documentation.' },
        ]}
      />
    </div>
  );
}
