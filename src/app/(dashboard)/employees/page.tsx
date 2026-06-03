'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUsers,
  FiPlus,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiEye,
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiFilter,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

/* ── Types ── */
interface Employee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  department?: { id: string; name: string };
  designation?: { id: string; title: string };
  branch?: { id: string; name: string } | null;
  dateOfJoining: string;
  status: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankIfscCode?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  salary?: number | null;
  salaryCurrency?: string;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

interface Department { id: string; name: string }
interface Designation { id: string; title: string }
interface Branch { id: string; name: string }

/* ── Helpers ── */
function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'nexus-badge nexus-badge-success',
    on_leave: 'nexus-badge nexus-badge-warning',
    terminated: 'nexus-badge nexus-badge-error',
    resigned: 'bg-slate-100 text-slate-600 nexus-badge',
  };
  const labels: Record<string, string> = { active: 'Active', on_leave: 'On Leave', terminated: 'Terminated', resigned: 'Resigned' };
  return { className: map[status] || 'nexus-badge nexus-badge-info', label: labels[status] || status };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ── Initial Form State ── */
const initialForm = {
  employeeId: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  maritalStatus: '',
  nationality: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  departmentId: '',
  designationId: '',
  branchId: '',
  dateOfJoining: '',
  bankName: '',
  bankAccountNo: '',
  bankIfscCode: '',
  panNumber: '',
  aadhaarNumber: '',
  salary: '',
  salaryCurrency: 'USD',
  emergencyContactName: '',
  emergencyContactPhone: '',
};

/* ── Component ── */
export default function EmployeesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* Fetch employees */
  const fetchEmployees = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (search) params.set('search', search);
      if (filterDept) params.set('departmentId', filterDept);
      if (filterStatus) params.set('status', filterStatus);

      const res = await fetch(`/api/employees?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setEmployees(data.employees || []);
      setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [search, filterDept, filterStatus]);

  /* Fetch dropdown data */
  const fetchDropdowns = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const allEmpRes = await fetch('/api/employees?limit=500', { headers });
      if (allEmpRes.ok) {
        const allData = await allEmpRes.json();
        const deptMap = new Map<string, Department>();
        const desigMap = new Map<string, Designation>();
        const branchMap = new Map<string, Branch>();
        (allData.employees || []).forEach((e: Employee) => {
          if (e.department) deptMap.set(e.department.id, e.department);
          if (e.designation) desigMap.set(e.designation.id, e.designation);
          if (e.branch) branchMap.set(e.branch.id, e.branch);
        });
        setDepartments(Array.from(deptMap.values()));
        setDesignations(Array.from(desigMap.values()));
        setBranches(Array.from(branchMap.values()));
      }
    } catch (err) {
      console.error('Failed to fetch dropdown data', err);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => fetchEmployees(1));
  }, [fetchEmployees]);

  useEffect(() => {
    queueMicrotask(() => fetchDropdowns());
  }, [fetchDropdowns]);

  /* Form handlers */
  const openAddModal = () => {
    setEditingId(null);
    setForm({
      ...initialForm,
      employeeId: `EMP${String(Date.now()).slice(-6)}`,
    });
    setShowModal(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({
      employeeId: emp.employeeId,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phone: emp.phone || '',
      dateOfBirth: emp.dateOfBirth ? emp.dateOfBirth.split('T')[0] : '',
      gender: emp.gender || '',
      maritalStatus: emp.maritalStatus || '',
      nationality: emp.nationality || '',
      address: emp.address || '',
      city: emp.city || '',
      state: emp.state || '',
      zipCode: emp.zipCode || '',
      country: emp.country || '',
      departmentId: emp.department?.id || '',
      designationId: emp.designation?.id || '',
      branchId: emp.branch?.id || '',
      dateOfJoining: emp.dateOfJoining ? emp.dateOfJoining.split('T')[0] : '',
      bankName: emp.bankName || '',
      bankAccountNo: emp.bankAccountNo || '',
      bankIfscCode: emp.bankIfscCode || '',
      panNumber: emp.panNumber || '',
      aadhaarNumber: emp.aadhaarNumber || '',
      salary: emp.salary?.toString() || '',
      salaryCurrency: emp.salaryCurrency || 'USD',
      emergencyContactName: emp.emergencyContactName || '',
      emergencyContactPhone: emp.emergencyContactPhone || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.departmentId || !form.designationId || !form.dateOfJoining) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        ...form,
        salary: form.salary ? parseFloat(form.salary) : null,
      };

      if (editingId) {
        const res = await fetch(`/api/employees/${editingId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Update failed'); }
        toast.success('Employee updated successfully');
      } else {
        const res = await fetch('/api/employees', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Create failed'); }
        toast.success('Employee created successfully');
      }
      setShowModal(false);
      fetchEmployees(pagination.page);
      fetchDropdowns();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Delete failed'); }
      toast.success('Employee terminated successfully');
      setDeleteConfirm(null);
      fetchEmployees(pagination.page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const updateForm = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text-primary flex items-center gap-2">
            <FiUsers className="w-6 h-6 text-blue-500" />
            Employees
          </h1>
          <p className="text-nexus-text-secondary mt-1">Manage your organization&apos;s workforce</p>
        </div>
        {isAdmin && (
          <button onClick={openAddModal} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Add Employee
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="nexus-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or employee ID..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-nexus-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${showFilters ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-nexus-border text-nexus-text-secondary hover:bg-slate-50'}`}
          >
            <FiFilter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 pt-3 border-t border-nexus-border">
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-nexus-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="terminated">Terminated</option>
              <option value="resigned">Resigned</option>
            </select>
            <button onClick={() => { setFilterDept(''); setFilterStatus(''); setSearch(''); }} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm text-nexus-text-secondary hover:bg-slate-50 transition-colors">
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="nexus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-nexus-border bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Designation</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Date of Joining</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-nexus-text-secondary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-nexus-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-9 h-9 bg-slate-200 rounded-full" /><div className="space-y-1"><div className="h-3 w-28 bg-slate-200 rounded" /><div className="h-2 w-20 bg-slate-200 rounded" /></div></div></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FiUsers className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                    <p className="text-nexus-text-secondary font-medium">No employees found</p>
                    <p className="text-sm text-nexus-text-muted mt-1">Try adjusting your search or filters</p>
                  </td>
                </tr>
              ) : (
                employees.map(emp => {
                  const badge = getStatusBadge(emp.status);
                  const initials = `${emp.firstName[0]}${emp.lastName[0]}`;
                  return (
                    <tr key={emp.id} className="border-b border-nexus-border/50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {emp.avatar ? (
                            <img src={emp.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {initials}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-nexus-text-primary">{emp.firstName} {emp.lastName}</p>
                            <p className="text-xs text-nexus-text-muted">{emp.employeeId} · {emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{emp.department?.name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{emp.designation?.title || '—'}</td>
                      <td className="px-4 py-3"><span className={badge.className}>{badge.label}</span></td>
                      <td className="px-4 py-3 text-sm text-nexus-text-secondary">{formatDate(emp.dateOfJoining)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => router.push(`/employees/${emp.id}`)} className="p-2 rounded-lg text-nexus-text-muted hover:text-blue-500 hover:bg-blue-50 transition-colors" title="View">
                            <FiEye className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <>
                              <button onClick={() => openEditModal(emp)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit">
                                <FiEdit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => setDeleteConfirm(emp.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-nexus-border">
            <p className="text-sm text-nexus-text-muted">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => fetchEmployees(pagination.page - 1)} disabled={pagination.page <= 1} className="p-2 rounded-lg border border-nexus-border text-nexus-text-secondary hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                const p = i + 1;
                return (
                  <button key={p} onClick={() => fetchEmployees(p)} className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${p === pagination.page ? 'bg-blue-500 text-white' : 'text-nexus-text-secondary hover:bg-slate-50'}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => fetchEmployees(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="p-2 rounded-lg border border-nexus-border text-nexus-text-secondary hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-slide-in-down" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <FiTrash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-nexus-text-primary">Terminate Employee</h3>
              <p className="text-sm text-nexus-text-secondary mt-2">This will mark the employee as terminated. This action can be reversed by editing the employee.</p>
            </div>
            <div className="flex items-center gap-3 mt-6">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={deleting} className="flex-1 px-4 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors">
                {deleting ? 'Terminating...' : 'Terminate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Employee Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full my-8 animate-slide-in-down" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-nexus-border">
              <h2 className="text-lg font-semibold text-nexus-text-primary">{editingId ? 'Edit Employee' : 'Add Employee'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
              {/* Personal Information */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">First Name *</label>
                    <input type="text" value={form.firstName} onChange={e => updateForm('firstName', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Last Name *</label>
                    <input type="text" value={form.lastName} onChange={e => updateForm('lastName', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employee ID *</label>
                    <input type="text" value={form.employeeId} onChange={e => updateForm('employeeId', e.target.value)} required disabled={!!editingId} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Email *</label>
                    <input type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Phone</label>
                    <input type="tel" value={form.phone} onChange={e => updateForm('phone', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Date of Birth</label>
                    <input type="date" value={form.dateOfBirth} onChange={e => updateForm('dateOfBirth', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Gender</label>
                    <select value={form.gender} onChange={e => updateForm('gender', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Marital Status</label>
                    <select value={form.maritalStatus} onChange={e => updateForm('maritalStatus', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="">Select</option>
                      <option value="single">Single</option>
                      <option value="married">Married</option>
                      <option value="divorced">Divorced</option>
                      <option value="widowed">Widowed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Nationality</label>
                    <input type="text" value={form.nationality} onChange={e => updateForm('nationality', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  Address
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Address</label>
                    <input type="text" value={form.address} onChange={e => updateForm('address', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">City</label>
                    <input type="text" value={form.city} onChange={e => updateForm('city', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">State</label>
                    <input type="text" value={form.state} onChange={e => updateForm('state', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">ZIP Code</label>
                    <input type="text" value={form.zipCode} onChange={e => updateForm('zipCode', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Country</label>
                    <input type="text" value={form.country} onChange={e => updateForm('country', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                </div>
              </div>

              {/* Employment Details */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Employment Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Department *</label>
                    <select value={form.departmentId} onChange={e => updateForm('departmentId', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="">Select Department</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Designation *</label>
                    <select value={form.designationId} onChange={e => updateForm('designationId', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="">Select Designation</option>
                      {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Branch</label>
                    <select value={form.branchId} onChange={e => updateForm('branchId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="">Select Branch</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Date of Joining *</label>
                    <input type="date" value={form.dateOfJoining} onChange={e => updateForm('dateOfJoining', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Bank &amp; Financial Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Bank Name</label>
                    <input type="text" value={form.bankName} onChange={e => updateForm('bankName', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Bank Account No</label>
                    <input type="text" value={form.bankAccountNo} onChange={e => updateForm('bankAccountNo', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">IFSC Code</label>
                    <input type="text" value={form.bankIfscCode} onChange={e => updateForm('bankIfscCode', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">PAN Number</label>
                    <input type="text" value={form.panNumber} onChange={e => updateForm('panNumber', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Aadhaar Number</label>
                    <input type="text" value={form.aadhaarNumber} onChange={e => updateForm('aadhaarNumber', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                </div>
              </div>

              {/* Salary */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Salary Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Salary</label>
                    <input type="number" step="0.01" value={form.salary} onChange={e => updateForm('salary', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Currency</label>
                    <select value={form.salaryCurrency} onChange={e => updateForm('salaryCurrency', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="INR">INR</option>
                      <option value="CAD">CAD</option>
                      <option value="AUD">AUD</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Emergency Contact
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Contact Name</label>
                    <input type="text" value={form.emergencyContactName} onChange={e => updateForm('emergencyContactName', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Contact Phone</label>
                    <input type="tel" value={form.emergencyContactPhone} onChange={e => updateForm('emergencyContactPhone', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-nexus-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleSubmit()} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                {submitting ? 'Saving...' : editingId ? 'Update Employee' : 'Create Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
