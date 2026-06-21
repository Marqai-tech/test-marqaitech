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
  FiHeart,
  FiShield,
  FiActivity,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import ModuleTips from '@/components/ModuleTips';
import ModuleWorkflow from '@/components/ModuleWorkflow';
import ModuleIntro from '@/components/ModuleIntro';

/* ── Employee Tips ── */
const employeeTips = [
  {
    title: 'Auto-Generated Employee Codes',
    description: 'Employee codes are auto-generated based on the prefix and sequence in Settings',
  },
  {
    title: 'Complete Onboarding Tasks',
    description: 'Complete all onboarding tasks before marking new hires as Active',
  },
  {
    title: 'Bulk Import from CSV',
    description: 'Use the bulk import feature to add multiple employees at once from a CSV file',
  },
  {
    title: 'Document Expiry Reminders',
    description: 'Configure document expiry reminders to stay compliant with visa and license renewals',
  },
  {
    title: 'Set Up Reporting Managers',
    description: 'Set up reporting manager relationships to enable approval workflows',
  },
];

/* ── Employee Workflow Steps ── */
const employeeWorkflowSteps = [
  { step: 1, title: 'Add Employee', description: 'Create a new employee record with basic details' },
  { step: 2, title: 'Complete Profile Details', description: 'Fill in personal information and contact details' },
  { step: 3, title: 'Assign Department & Designation', description: 'Set the employee\'s department and job title' },
  { step: 4, title: 'Set Bank Details', description: 'Configure bank account and financial information' },
  { step: 5, title: 'Configure Reporting Manager', description: 'Assign the employee\'s reporting manager for approvals' },
  { step: 6, title: 'Mark Active', description: 'Activate the employee after onboarding is complete' },
  { step: 7, title: 'Review Employee Directory', description: 'Verify all employee details in the directory' },
];

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
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
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
  salaryCurrency: 'INR',
  emergencyContactName: '',
  emergencyContactPhone: '',
  // Statutory Details
  pfNumber: '',
  pfUAN: '',
  pfNomineeName: '',
  pfNomineeRelation: '',
  pfNomineePercentage: '',
  esiNumber: '',
  esiDispensary: '',
  esiNomineeName: '',
  esiNomineeRelation: '',
  professionalTaxNumber: '',
  lwfNumber: '',
  // Overseas Details
  hasForeignCitizenship: '',
  foreignCitizenshipCountry: '',
  foreignPassportNumber: '',
  foreignPassportExpiry: '',
  hasForeignSojourn: '',
  foreignSojournCountry: '',
  foreignSojournPurpose: '',
  foreignSojournDuration: '',
  hasVisa: '',
  visaType: '',
  visaCountry: '',
  visaExpiry: '',
  hasIntlDrivingLicense: '',
  intlDrivingLicenseCountry: '',
  intlDrivingLicenseExpiry: '',
  // Previous Experience
  previousEmployer1: '',
  previousDesignation1: '',
  previousDuration1: '',
  previousReason1: '',
  previousEmployer2: '',
  previousDesignation2: '',
  previousDuration2: '',
  previousReason2: '',
  previousEmployer3: '',
  previousDesignation3: '',
  previousDuration3: '',
  previousReason3: '',
  totalExperience: '',
  // Health History Questionnaire
  bloodGroup: '',
  hasChronicIllness: '',
  chronicIllnessDetails: '',
  hasAllergies: '',
  allergyDetails: '',
  hasDisability: '',
  disabilityDetails: '',
  isOnMedication: '',
  medicationDetails: '',
  hasHadSurgery: '',
  surgeryDetails: '',
  emergencyMedicalCondition: '',
  primaryPhysicianName: '',
  primaryPhysicianPhone: '',
  healthInsuranceProvider: '',
  healthInsurancePolicyNo: '',
  // Policy Mappings
  leavePolicyId: '',
  attendancePolicyId: '',
  travelPolicyId: '',
  salaryStructureId: '',
};

/* ── Component ── */
export default function EmployeesPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'hr_admin', 'manager'].includes(user?.role || '');
  // Company scope — read from the header CompanySwitcher via context store.
  // effectiveCompanyId() returns the selected company for admins (or null for
  // "all companies"), and the user's own company for non-admins. We pass it as
  // a query param to /api/employees so the list respects the dropdown selection.
  const { effectiveCompanyId, selectedTenantId } = useCompanyContextStore();
  const scopeCompanyId = effectiveCompanyId();
  const scopeTenantId = user?.role === 'super_admin' ? selectedTenantId : undefined;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Policy dropdowns
  const [leavePolicies, setLeavePolicies] = useState<Array<{ id: string; title: string; version: string }>>([]);
  const [attendancePolicies, setAttendancePolicies] = useState<Array<{ id: string; title: string; version: string }>>([]);
  const [travelPolicies, setTravelPolicies] = useState<Array<{ id: string; title: string; version: string }>>([]);
  const [salaryStructures, setSalaryStructures] = useState<Array<{ id: string; name: string }>>([]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Horizontal form tab state
  const [formTab, setFormTab] = useState('personal');
  const formTabs = [
    { key: 'personal', label: 'Personal', icon: '👤' },
    { key: 'address', label: 'Address', icon: '📍' },
    { key: 'employment', label: 'Employment', icon: '💼' },
    { key: 'bank', label: 'Bank & Finance', icon: '🏦' },
    { key: 'statutory', label: 'Statutory', icon: '📋' },
    { key: 'emergency', label: 'Emergency', icon: '🚨' },
    { key: 'health', label: 'Health', icon: '❤️' },
    { key: 'overseas', label: 'Overseas', icon: '🌍' },
    { key: 'experience', label: 'Experience', icon: '📄' },
    { key: 'policies', label: 'Policies', icon: '🛡️' },
  ] as const;

  /* Fetch employees */
  const fetchEmployees = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (search) params.set('search', search);
      if (filterDept) params.set('departmentId', filterDept);
      if (filterStatus) params.set('status', filterStatus);
      // Scope by header dropdown selection (super_admin/tenant_admin)
      if (scopeCompanyId) params.set('companyId', scopeCompanyId);
      else if (scopeTenantId) params.set('tenantId', scopeTenantId);

      const res = await fetch(`/api/employees?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setEmployees(data.employees || []);
      setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
    } catch (err) {
      console.error('Failed to load employees from API, using empty state:', err);
      // Don't show error toast - the API has its own demo fallback
      // Only show error if we truly have no data
      setEmployees([]);
      setPagination({ page: 1, limit: 10, total: 0, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [search, filterDept, filterStatus, scopeCompanyId, scopeTenantId]);

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
      // Fetch policy dropdowns in parallel
      const [lpRes, apRes, tpRes, ssRes] = await Promise.allSettled([
        fetch('/api/policies?category=leave', { headers }),
        fetch('/api/policies?category=attendance', { headers }),
        fetch('/api/policies?category=travel', { headers }),
        fetch('/api/salary-structures', { headers }),
      ]);
      if (lpRes.status === 'fulfilled' && lpRes.value.ok) { const d = await lpRes.value.json(); setLeavePolicies(d.policies || d.data || []); }
      if (apRes.status === 'fulfilled' && apRes.value.ok) { const d = await apRes.value.json(); setAttendancePolicies(d.policies || d.data || []); }
      if (tpRes.status === 'fulfilled' && tpRes.value.ok) { const d = await tpRes.value.json(); setTravelPolicies(d.policies || d.data || []); }
      if (ssRes.status === 'fulfilled' && ssRes.value.ok) { const d = await ssRes.value.json(); setSalaryStructures(d.salaryStructures || d.data || []); }
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
  const handleOpenAddForm = () => {
    setEditingId(null);
    setForm({
      ...initialForm,
      employeeId: `EMP${String(Date.now()).slice(-6)}`,
    });
    setShowForm(true);
    setFormTab('personal');
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleOpenEditForm = (emp: Employee) => {
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
      salaryCurrency: emp.salaryCurrency || 'INR',
      emergencyContactName: emp.emergencyContactName || '',
      emergencyContactPhone: emp.emergencyContactPhone || '',
      // Health History
      bloodGroup: emp.bloodGroup || '',
      hasChronicIllness: (emp as Record<string, unknown>).hasChronicIllness as string || '',
      chronicIllnessDetails: (emp as Record<string, unknown>).chronicIllnessDetails as string || '',
      hasAllergies: (emp as Record<string, unknown>).hasAllergies as string || '',
      allergyDetails: (emp as Record<string, unknown>).allergyDetails as string || '',
      hasDisability: (emp as Record<string, unknown>).hasDisability as string || '',
      disabilityDetails: (emp as Record<string, unknown>).disabilityDetails as string || '',
      isOnMedication: (emp as Record<string, unknown>).isOnMedication as string || '',
      medicationDetails: (emp as Record<string, unknown>).medicationDetails as string || '',
      hasHadSurgery: (emp as Record<string, unknown>).hasHadSurgery as string || '',
      surgeryDetails: (emp as Record<string, unknown>).surgeryDetails as string || '',
      emergencyMedicalCondition: (emp as Record<string, unknown>).emergencyMedicalCondition as string || '',
      primaryPhysicianName: (emp as Record<string, unknown>).primaryPhysicianName as string || '',
      primaryPhysicianPhone: (emp as Record<string, unknown>).primaryPhysicianPhone as string || '',
      healthInsuranceProvider: (emp as Record<string, unknown>).healthInsuranceProvider as string || '',
      healthInsurancePolicyNo: (emp as Record<string, unknown>).healthInsurancePolicyNo as string || '',
      // Policy Mappings
      leavePolicyId: emp.leavePolicyId || '',
      attendancePolicyId: emp.attendancePolicyId || '',
      travelPolicyId: emp.travelPolicyId || '',
      salaryStructureId: emp.salaryStructureId || '',
    });
    setShowForm(true);
    setFormTab('personal');
    setDeleteConfirmId(null);
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
    setFormTab('personal');
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
      handleCancelForm();
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
      setDeleteConfirmId(null);
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
          <button onClick={handleOpenAddForm} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm shadow-sm shadow-blue-500/25 transition-colors">
            <FiPlus className="w-4 h-4" />
            Add Employee
          </button>
        )}
      </div>

      {/* Module Intro — minimized by default with hover preview (saves vertical space) */}
      <ModuleIntro
        title="Employee Management"
        subtitle="Centralized directory, lifecycle, documents, and AI insights"
        srsRef="REQ-EMP-01..15"
        icon={<FiUsers className="w-4 h-4" />}
        accent="blue"
        quickStats={
          <>
            <span><b className="text-slate-700">{employees.length}</b> total</span>
            <span><b className="text-emerald-600">{employees.filter(e => e.status === 'active').length}</b> active</span>
          </>
        }
      >
        <p>
          The Employees module is the system of record for your entire workforce — from pre-hire to alumni.
          It captures the full employee lifecycle: onboarding, transfers, promotions, separations, and
          ongoing profile changes (skills, dependents, qualifications, experience).
        </p>
        <p>
          Each employee record holds personal details, employment terms, compensation components, documents,
          and links to related modules — payroll runs, performance reviews, attendance, leave, training, and
          asset assignments. Role-based access ensures that PII is masked for non-HR users per REQ-SEC-EMP-01.
        </p>
        <p>
          Use the search bar to find employees by name, employee ID, email, department, designation, or status.
          Admins can add new employees, edit profiles, and trigger onboarding workflows. Self-service is
          available for employees to view and update their own profile.
        </p>
      </ModuleIntro>

      {/* Module Tips */}
      <ModuleTips
        moduleKey="employees"
        title="Employee Tips"
        tips={employeeTips}
        userRole={user?.role}
      />

      <ModuleWorkflow
        moduleKey="employees"
        title="How to Manage Employees"
        subtitle="Follow this workflow to set up and manage your workforce"
        steps={employeeWorkflowSteps}
        accentColor="blue"
        userRole={user?.role}
      />

      {/* Embedded Add/Edit Employee Form */}
      {showForm && (
        <div id="crud-form" className="nexus-card border-l-4 border-l-blue-500 transition-all duration-300 ease-in-out">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-nexus-text-primary">
                {editingId ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-nexus-text-muted hover:text-nexus-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Horizontal Section Tabs */}
            <div className="flex items-center gap-1 border-b border-nexus-border mb-6 overflow-x-auto pb-px -mx-1 px-1">
              {formTabs.map((tab, idx) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFormTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                    formTab === tab.key
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-nexus-text-muted hover:text-nexus-text-primary hover:border-slate-300'
                  }`}
                >
                  <span className="text-base">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-1.5 mb-6">
              {formTabs.map((tab, idx) => (
                <div
                  key={tab.key}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    formTabs.findIndex(t => t.key === formTab) >= idx ? 'bg-blue-500' : 'bg-slate-200'
                  }`}
                />
              ))}
              <span className="text-xs text-nexus-text-muted ml-2 shrink-0">
                Step {formTabs.findIndex(t => t.key === formTab) + 1} of {formTabs.length}
              </span>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Personal Information */}
              {formTab === 'personal' && (
                <div className="space-y-4">
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
                  <div className="flex justify-end pt-2">
                    <button type="button" onClick={() => setFormTab('address')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Address <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Address */}
              {formTab === 'address' && (
                <div className="space-y-4">
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
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('personal')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={() => setFormTab('employment')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Employment <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Employment Details */}
              {formTab === 'employment' && (
                <div className="space-y-4">
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
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('address')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={() => setFormTab('bank')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Bank & Finance <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Bank & Financial Details */}
              {formTab === 'bank' && (
                <div className="space-y-4">
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
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('employment')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={() => setFormTab('salary')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Salary <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Statutory Details */}
              {formTab === 'statutory' && (
                <div className="space-y-4">
                  {/* PF Details */}
                  <div>
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">Provident Fund (PF)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">PF Number</label>
                        <input type="text" value={form.pfNumber} onChange={e => updateForm('pfNumber', e.target.value)} placeholder="e.g., PF/MH/12345/678" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">UAN Number</label>
                        <input type="text" value={form.pfUAN} onChange={e => updateForm('pfUAN', e.target.value)} placeholder="12-digit UAN" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  {/* PF Nomination */}
                  <div className="pt-3 border-t border-nexus-border/50">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">PF Nomination Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Nominee Name</label>
                        <input type="text" value={form.pfNomineeName} onChange={e => updateForm('pfNomineeName', e.target.value)} placeholder="Full name of nominee" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Nominee Relationship</label>
                        <select value={form.pfNomineeRelation} onChange={e => updateForm('pfNomineeRelation', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                          <option value="">Select</option>
                          <option value="spouse">Spouse</option>
                          <option value="father">Father</option>
                          <option value="mother">Mother</option>
                          <option value="son">Son</option>
                          <option value="daughter">Daughter</option>
                          <option value="brother">Brother</option>
                          <option value="sister">Sister</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Nomination Percentage</label>
                        <input type="number" min="0" max="100" value={form.pfNomineePercentage} onChange={e => updateForm('pfNomineePercentage', e.target.value)} placeholder="e.g., 100" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  {/* ESI Details */}
                  <div className="pt-3 border-t border-nexus-border/50">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">Employee State Insurance (ESI)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">ESI Number</label>
                        <input type="text" value={form.esiNumber} onChange={e => updateForm('esiNumber', e.target.value)} placeholder="e.g., 31-00-123456-000-0001" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">ESI Dispensary</label>
                        <input type="text" value={form.esiDispensary} onChange={e => updateForm('esiDispensary', e.target.value)} placeholder="Assigned dispensary name" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  {/* ESI Nomination */}
                  <div className="pt-3 border-t border-nexus-border/50">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">ESI Nomination Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Nominee Name</label>
                        <input type="text" value={form.esiNomineeName} onChange={e => updateForm('esiNomineeName', e.target.value)} placeholder="Full name of nominee" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Nominee Relationship</label>
                        <select value={form.esiNomineeRelation} onChange={e => updateForm('esiNomineeRelation', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                          <option value="">Select</option>
                          <option value="spouse">Spouse</option>
                          <option value="father">Father</option>
                          <option value="mother">Mother</option>
                          <option value="son">Son</option>
                          <option value="daughter">Daughter</option>
                          <option value="brother">Brother</option>
                          <option value="sister">Sister</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  {/* Other Statutory */}
                  <div className="pt-3 border-t border-nexus-border/50">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">Other Statutory</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Professional Tax Number</label>
                        <input type="text" value={form.professionalTaxNumber} onChange={e => updateForm('professionalTaxNumber', e.target.value)} placeholder="PT registration number" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">LWF Number</label>
                        <input type="text" value={form.lwfNumber} onChange={e => updateForm('lwfNumber', e.target.value)} placeholder="Labour Welfare Fund number" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('bank')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={() => setFormTab('emergency')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Emergency <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Emergency Contact */}
              {formTab === 'emergency' && (
                <div className="space-y-4">
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
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('statutory')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={() => setFormTab('health')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Health <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Health History Questionnaire */}
              {formTab === 'health' && (
                <div className="space-y-4">
                  <p className="text-xs text-nexus-text-muted">Capture employee health information for workplace safety and emergency preparedness. All fields are optional and confidential.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Blood Group</label>
                      <select value={form.bloodGroup} onChange={e => updateForm('bloodGroup', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="A+">A+</option><option value="A-">A-</option>
                        <option value="B+">B+</option><option value="B-">B-</option>
                        <option value="AB+">AB+</option><option value="AB-">AB-</option>
                        <option value="O+">O+</option><option value="O-">O-</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Chronic Illness</label>
                      <select value={form.hasChronicIllness} onChange={e => updateForm('hasChronicIllness', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasChronicIllness === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Chronic Illness Details</label>
                        <input type="text" value={form.chronicIllnessDetails} onChange={e => updateForm('chronicIllnessDetails', e.target.value)} placeholder="e.g., Diabetes, Hypertension" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Known Allergies</label>
                      <select value={form.hasAllergies} onChange={e => updateForm('hasAllergies', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasAllergies === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Allergy Details</label>
                        <input type="text" value={form.allergyDetails} onChange={e => updateForm('allergyDetails', e.target.value)} placeholder="e.g., Penicillin, Peanuts, Dust" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Disability</label>
                      <select value={form.hasDisability} onChange={e => updateForm('hasDisability', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasDisability === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Disability Details</label>
                        <input type="text" value={form.disabilityDetails} onChange={e => updateForm('disabilityDetails', e.target.value)} placeholder="Nature of disability & accommodations needed" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Currently on Medication</label>
                      <select value={form.isOnMedication} onChange={e => updateForm('isOnMedication', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.isOnMedication === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Medication Details</label>
                        <input type="text" value={form.medicationDetails} onChange={e => updateForm('medicationDetails', e.target.value)} placeholder="Current medications & dosage" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Previous Surgeries</label>
                      <select value={form.hasHadSurgery} onChange={e => updateForm('hasHadSurgery', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasHadSurgery === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Surgery Details</label>
                        <input type="text" value={form.surgeryDetails} onChange={e => updateForm('surgeryDetails', e.target.value)} placeholder="Type & year of surgery" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Emergency Medical Condition</label>
                      <input type="text" value={form.emergencyMedicalCondition} onChange={e => updateForm('emergencyMedicalCondition', e.target.value)} placeholder="Any critical condition to alert medical responders (e.g., Epilepsy, Asthma)" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                  </div>

                  {/* Physician & Insurance */}
                  <div className="mt-4 pt-4 border-t border-nexus-border/50">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">Physician & Insurance</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Primary Physician Name</label>
                        <input type="text" value={form.primaryPhysicianName} onChange={e => updateForm('primaryPhysicianName', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Physician Phone</label>
                        <input type="tel" value={form.primaryPhysicianPhone} onChange={e => updateForm('primaryPhysicianPhone', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Health Insurance Provider</label>
                        <input type="text" value={form.healthInsuranceProvider} onChange={e => updateForm('healthInsuranceProvider', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Insurance Policy Number</label>
                        <input type="text" value={form.healthInsurancePolicyNo} onChange={e => updateForm('healthInsurancePolicyNo', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('emergency')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={() => setFormTab('overseas')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Overseas <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Overseas Details */}
              {formTab === 'overseas' && (
                <div className="space-y-4">
                  <p className="text-xs text-nexus-text-muted">Capture foreign citizenship, travel, visa and international driving license information. All fields are optional.</p>
                  {/* Foreign Citizenship */}
                  <div>
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">Foreign Citizenship</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Holds Foreign Citizenship?</label>
                        <select value={form.hasForeignCitizenship} onChange={e => updateForm('hasForeignCitizenship', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                          <option value="">Select</option>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </div>
                      {form.hasForeignCitizenship === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Citizenship Country</label>
                          <input type="text" value={form.foreignCitizenshipCountry} onChange={e => updateForm('foreignCitizenshipCountry', e.target.value)} placeholder="e.g., United States" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      )}
                      {form.hasForeignCitizenship === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Foreign Passport Number</label>
                          <input type="text" value={form.foreignPassportNumber} onChange={e => updateForm('foreignPassportNumber', e.target.value)} placeholder="Passport number" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      )}
                      {form.hasForeignCitizenship === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Passport Expiry Date</label>
                          <input type="date" value={form.foreignPassportExpiry} onChange={e => updateForm('foreignPassportExpiry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Foreign Sojourns */}
                  <div className="pt-3 border-t border-nexus-border/50">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">Foreign Sojourns</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Has Foreign Sojourn History?</label>
                        <select value={form.hasForeignSojourn} onChange={e => updateForm('hasForeignSojourn', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                          <option value="">Select</option>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </div>
                      {form.hasForeignSojourn === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Country of Sojourn</label>
                          <input type="text" value={form.foreignSojournCountry} onChange={e => updateForm('foreignSojournCountry', e.target.value)} placeholder="e.g., Germany" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      )}
                      {form.hasForeignSojourn === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Purpose of Sojourn</label>
                          <input type="text" value={form.foreignSojournPurpose} onChange={e => updateForm('foreignSojournPurpose', e.target.value)} placeholder="e.g., Employment, Education" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      )}
                      {form.hasForeignSojourn === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Duration</label>
                          <input type="text" value={form.foreignSojournDuration} onChange={e => updateForm('foreignSojournDuration', e.target.value)} placeholder="e.g., 2 years" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Visa Details */}
                  <div className="pt-3 border-t border-nexus-border/50">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">Visa Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Visa Available?</label>
                        <select value={form.hasVisa} onChange={e => updateForm('hasVisa', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                          <option value="">Select</option>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </div>
                      {form.hasVisa === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Visa Type</label>
                          <select value={form.visaType} onChange={e => updateForm('visaType', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                            <option value="">Select</option>
                            <option value="tourist">Tourist</option>
                            <option value="business">Business</option>
                            <option value="work">Work / Employment</option>
                            <option value="student">Student</option>
                            <option value="transit">Transit</option>
                            <option value="diplomatic">Diplomatic</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      )}
                      {form.hasVisa === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Visa Country</label>
                          <input type="text" value={form.visaCountry} onChange={e => updateForm('visaCountry', e.target.value)} placeholder="e.g., United States" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      )}
                      {form.hasVisa === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Visa Expiry Date</label>
                          <input type="date" value={form.visaExpiry} onChange={e => updateForm('visaExpiry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      )}
                    </div>
                  </div>
                  {/* International Driving License */}
                  <div className="pt-3 border-t border-nexus-border/50">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">International Driving License</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Has International Driving License?</label>
                        <select value={form.hasIntlDrivingLicense} onChange={e => updateForm('hasIntlDrivingLicense', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                          <option value="">Select</option>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </div>
                      {form.hasIntlDrivingLicense === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Issuing Country</label>
                          <input type="text" value={form.intlDrivingLicenseCountry} onChange={e => updateForm('intlDrivingLicenseCountry', e.target.value)} placeholder="e.g., India" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      )}
                      {form.hasIntlDrivingLicense === 'yes' && (
                        <div>
                          <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Expiry Date</label>
                          <input type="date" value={form.intlDrivingLicenseExpiry} onChange={e => updateForm('intlDrivingLicenseExpiry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('health')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={() => setFormTab('experience')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Experience <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Previous Experience */}
              {formTab === 'experience' && (
                <div className="space-y-4">
                  <p className="text-xs text-nexus-text-muted">Enter previous employment history. Up to 3 previous employers can be added.</p>
                  {/* Experience 1 */}
                  <div>
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">Previous Employer 1</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employer Name</label>
                        <input type="text" value={form.previousEmployer1} onChange={e => updateForm('previousEmployer1', e.target.value)} placeholder="Company name" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Designation</label>
                        <input type="text" value={form.previousDesignation1} onChange={e => updateForm('previousDesignation1', e.target.value)} placeholder="Job title" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Duration</label>
                        <input type="text" value={form.previousDuration1} onChange={e => updateForm('previousDuration1', e.target.value)} placeholder="e.g., Jan 2020 - Dec 2022" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Reason for Leaving</label>
                        <input type="text" value={form.previousReason1} onChange={e => updateForm('previousReason1', e.target.value)} placeholder="e.g., Better opportunity, Relocation" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  {/* Experience 2 */}
                  <div className="pt-3 border-t border-nexus-border/50">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">Previous Employer 2</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employer Name</label>
                        <input type="text" value={form.previousEmployer2} onChange={e => updateForm('previousEmployer2', e.target.value)} placeholder="Company name" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Designation</label>
                        <input type="text" value={form.previousDesignation2} onChange={e => updateForm('previousDesignation2', e.target.value)} placeholder="Job title" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Duration</label>
                        <input type="text" value={form.previousDuration2} onChange={e => updateForm('previousDuration2', e.target.value)} placeholder="e.g., Jun 2017 - Dec 2019" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Reason for Leaving</label>
                        <input type="text" value={form.previousReason2} onChange={e => updateForm('previousReason2', e.target.value)} placeholder="e.g., Career growth, Company closure" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  {/* Experience 3 */}
                  <div className="pt-3 border-t border-nexus-border/50">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider mb-3">Previous Employer 3</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Employer Name</label>
                        <input type="text" value={form.previousEmployer3} onChange={e => updateForm('previousEmployer3', e.target.value)} placeholder="Company name" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Designation</label>
                        <input type="text" value={form.previousDesignation3} onChange={e => updateForm('previousDesignation3', e.target.value)} placeholder="Job title" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Duration</label>
                        <input type="text" value={form.previousDuration3} onChange={e => updateForm('previousDuration3', e.target.value)} placeholder="e.g., Mar 2014 - May 2017" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Reason for Leaving</label>
                        <input type="text" value={form.previousReason3} onChange={e => updateForm('previousReason3', e.target.value)} placeholder="e.g., Relocation, Higher studies" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  {/* Total Experience */}
                  <div className="pt-3 border-t border-nexus-border/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Total Work Experience</label>
                        <input type="text" value={form.totalExperience} onChange={e => updateForm('totalExperience', e.target.value)} placeholder="e.g., 8 years 6 months" className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('overseas')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={() => setFormTab('policies')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Policies <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Policy & Structure Mappings */}
              {formTab === 'policies' && (
                <div className="space-y-4">
                  <p className="text-xs text-nexus-text-muted">Assign leave, attendance, travel policies and salary structure. Can also be configured later from the employee detail page.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Leave Policy</label>
                      <select value={form.leavePolicyId} onChange={e => updateForm('leavePolicyId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">— Not Assigned —</option>
                        {leavePolicies.map(p => <option key={p.id} value={p.id}>{p.title} (v{p.version})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Attendance Policy</label>
                      <select value={form.attendancePolicyId} onChange={e => updateForm('attendancePolicyId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">— Not Assigned —</option>
                        {attendancePolicies.map(p => <option key={p.id} value={p.id}>{p.title} (v{p.version})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Travel Policy</label>
                      <select value={form.travelPolicyId} onChange={e => updateForm('travelPolicyId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">— Not Assigned —</option>
                        {travelPolicies.map(p => <option key={p.id} value={p.id}>{p.title} (v{p.version})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-nexus-text-secondary mb-1">Salary Structure</label>
                      <select value={form.salaryStructureId} onChange={e => updateForm('salaryStructureId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">— Not Assigned —</option>
                        {salaryStructures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-nexus-border mt-4">
                    <button type="button" onClick={() => setFormTab('experience')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-nexus-border text-sm font-medium text-nexus-text-secondary hover:bg-slate-50 transition-colors">
                        Cancel
                      </button>
                      <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 shadow-sm shadow-blue-500/25 transition-colors">
                        {submitting ? 'Saving...' : editingId ? 'Update Employee' : 'Add Employee'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

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
                  const isDeleting = deleteConfirmId === emp.id;
                  return (
                    <tr key={emp.id} className={`border-b border-nexus-border/50 transition-colors ${isDeleting ? 'bg-red-50' : 'hover:bg-slate-50/50'}`}>
                      {isDeleting ? (
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                <FiTrash2 className="w-4 h-4 text-red-500" />
                              </div>
                              <span className="text-sm text-red-700 font-medium">Are you sure you want to terminate {emp.firstName} {emp.lastName}? This action can be reversed by editing the employee.</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(emp.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                                {deleting ? 'Terminating...' : 'Confirm Terminate'}
                              </button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-nexus-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
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
                                  <button onClick={() => handleOpenEditForm(emp)} className="p-2 rounded-lg text-nexus-text-muted hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Edit">
                                    <FiEdit2 className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setDeleteConfirmId(emp.id)} className="p-2 rounded-lg text-nexus-text-muted hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                    <FiTrash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </>
                      )}
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
    </div>
  );
}
