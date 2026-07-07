'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  FiShield,
  FiActivity,
  FiGrid,
  FiList,
  FiMoreVertical,
  FiMail,
  FiPhone,
  FiCalendar,
  FiUserCheck,
  FiUserX,
  FiUserPlus,
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
    active: 'thb-badge thb-badge-success',
    on_leave: 'thb-badge thb-badge-warning',
    terminated: 'thb-badge thb-badge-error',
    resigned: 'bg-slate-100 text-slate-600 thb-badge',
  };
  const labels: Record<string, string> = { active: 'Active', on_leave: 'On Leave', terminated: 'Terminated', resigned: 'Resigned' };
  return { className: map[status] || 'thb-badge thb-badge-info', label: labels[status] || status };
}

function getStatusDotColor(status: string) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500',
    on_leave: 'bg-amber-500',
    terminated: 'bg-red-500',
    resigned: 'bg-slate-400',
  };
  return map[status] || 'bg-blue-500';
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getAvatarColor(name: string) {
  const colors = [
    'from-blue-500 to-cyan-500',
    'from-violet-500 to-purple-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500',
    'from-indigo-500 to-blue-500',
    'from-teal-500 to-green-500',
    'from-red-500 to-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
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
  companyId: '',
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

/* ── Sample Employee Data (fallback when API returns empty) ── */
const SAMPLE_EMPLOYEES: Employee[] = [
  { id: 'demo-1', employeeId: 'EMP-001', firstName: 'Rajesh', lastName: 'Kumar', email: 'rajesh.kumar@3boxeshrms.com', phone: '+91 98765 43210', avatar: null, department: { id: 'd1', name: 'Engineering' }, designation: { id: 'des1', title: 'Senior Developer' }, branch: { id: 'b1', name: 'Bangalore HQ' }, dateOfJoining: '2024-03-15', status: 'active', dateOfBirth: '1990-05-20', gender: 'male', maritalStatus: 'married', nationality: 'Indian', address: '123 MG Road', city: 'Bangalore', state: 'Karnataka', zipCode: '560001', country: 'India', bankName: 'HDFC Bank', bankAccountNo: '1234567890', bankIfscCode: 'HDFC0001234', panNumber: 'ABCPK1234A', aadhaarNumber: '1234 5678 9012', salary: 1500000, salaryCurrency: 'INR', emergencyContactName: 'Priya Kumar', emergencyContactPhone: '+91 98765 43211' },
  { id: 'demo-2', employeeId: 'EMP-002', firstName: 'Priya', lastName: 'Sharma', email: 'priya.sharma@3boxeshrms.com', phone: '+91 87654 32109', avatar: null, department: { id: 'd2', name: 'Product' }, designation: { id: 'des2', title: 'Product Manager' }, branch: { id: 'b1', name: 'Bangalore HQ' }, dateOfJoining: '2023-08-01', status: 'active', dateOfBirth: '1992-11-14', gender: 'female', maritalStatus: 'single', nationality: 'Indian', address: '456 Brigade Road', city: 'Bangalore', state: 'Karnataka', zipCode: '560025', country: 'India', salary: 1800000, salaryCurrency: 'INR', emergencyContactName: 'Ravi Sharma', emergencyContactPhone: '+91 87654 32108' },
  { id: 'demo-3', employeeId: 'EMP-003', firstName: 'Arjun', lastName: 'Menon', email: 'arjun.menon@3boxeshrms.com', phone: '+91 76543 21098', avatar: null, department: { id: 'd3', name: 'Design' }, designation: { id: 'des3', title: 'UX Designer' }, branch: { id: 'b2', name: 'Mumbai Office' }, dateOfJoining: '2025-01-10', status: 'active', dateOfBirth: '1994-07-25', gender: 'male', maritalStatus: 'single', nationality: 'Indian', address: '789 Link Road', city: 'Mumbai', state: 'Maharashtra', zipCode: '400053', country: 'India', salary: 1200000, salaryCurrency: 'INR' },
  { id: 'demo-4', employeeId: 'EMP-004', firstName: 'Meera', lastName: 'Joshi', email: 'meera.joshi@3boxeshrms.com', phone: '+91 65432 10987', avatar: null, department: { id: 'd4', name: 'Analytics' }, designation: { id: 'des4', title: 'Data Analyst' }, branch: { id: 'b1', name: 'Bangalore HQ' }, dateOfJoining: '2025-02-20', status: 'active', dateOfBirth: '1996-03-12', gender: 'female', maritalStatus: 'single', nationality: 'Indian', salary: 1000000, salaryCurrency: 'INR' },
  { id: 'demo-5', employeeId: 'EMP-005', firstName: 'Vikram', lastName: 'Patel', email: 'vikram.patel@3boxeshrms.com', phone: '+91 54321 09876', avatar: null, department: { id: 'd1', name: 'Engineering' }, designation: { id: 'des5', title: 'Tech Lead' }, branch: { id: 'b1', name: 'Bangalore HQ' }, dateOfJoining: '2022-06-15', status: 'active', dateOfBirth: '1988-09-30', gender: 'male', maritalStatus: 'married', nationality: 'Indian', salary: 2200000, salaryCurrency: 'INR' },
  { id: 'demo-6', employeeId: 'EMP-006', firstName: 'Sneha', lastName: 'Kulkarni', email: 'sneha.k@3boxeshrms.com', phone: '+91 43210 98765', avatar: null, department: { id: 'd5', name: 'Human Resources' }, designation: { id: 'des6', title: 'HR Manager' }, branch: { id: 'b2', name: 'Mumbai Office' }, dateOfJoining: '2023-01-05', status: 'on_leave', dateOfBirth: '1991-12-08', gender: 'female', maritalStatus: 'married', nationality: 'Indian', salary: 1400000, salaryCurrency: 'INR' },
  { id: 'demo-7', employeeId: 'EMP-007', firstName: 'Karthik', lastName: 'Iyer', email: 'karthik.i@3boxeshrms.com', phone: '+91 32109 87654', avatar: null, department: { id: 'd1', name: 'Engineering' }, designation: { id: 'des7', title: 'Frontend Developer' }, branch: { id: 'b3', name: 'Hyderabad Office' }, dateOfJoining: '2024-09-01', status: 'active', dateOfBirth: '1995-04-17', gender: 'male', maritalStatus: 'single', nationality: 'Indian', salary: 900000, salaryCurrency: 'INR' },
  { id: 'demo-8', employeeId: 'EMP-008', firstName: 'Anita', lastName: 'Desai', email: 'anita.desai@3boxeshrms.com', phone: '+91 21098 76543', avatar: null, department: { id: 'd2', name: 'Product' }, designation: { id: 'des8', title: 'Associate PM' }, branch: { id: 'b1', name: 'Bangalore HQ' }, dateOfJoining: '2025-04-12', status: 'active', dateOfBirth: '1997-08-22', gender: 'female', maritalStatus: 'single', nationality: 'Indian', salary: 800000, salaryCurrency: 'INR' },
  { id: 'demo-9', employeeId: 'EMP-009', firstName: 'Rahul', lastName: 'Reddy', email: 'rahul.reddy@3boxeshrms.com', phone: '+91 10987 65432', avatar: null, department: { id: 'd4', name: 'Analytics' }, designation: { id: 'des9', title: 'Senior Analyst' }, branch: { id: 'b3', name: 'Hyderabad Office' }, dateOfJoining: '2024-01-20', status: 'active', dateOfBirth: '1993-06-05', gender: 'male', maritalStatus: 'married', nationality: 'Indian', salary: 1600000, salaryCurrency: 'INR' },
  { id: 'demo-10', employeeId: 'EMP-010', firstName: 'Deepa', lastName: 'Nair', email: 'deepa.nair@3boxeshrms.com', phone: '+91 09876 54321', avatar: null, department: { id: 'd5', name: 'Human Resources' }, designation: { id: 'des10', title: 'Recruiter' }, branch: { id: 'b1', name: 'Bangalore HQ' }, dateOfJoining: '2025-05-01', status: 'active', dateOfBirth: '1998-01-15', gender: 'female', maritalStatus: 'single', nationality: 'Indian', salary: 600000, salaryCurrency: 'INR' },
  { id: 'demo-11', employeeId: 'EMP-011', firstName: 'Suresh', lastName: 'Babu', email: 'suresh.babu@3boxeshrms.com', phone: '+91 88776 65544', avatar: null, department: { id: 'd1', name: 'Engineering' }, designation: { id: 'des1', title: 'Senior Developer' }, branch: { id: 'b4', name: 'Chennai Office' }, dateOfJoining: '2023-11-01', status: 'resigned', dateOfBirth: '1991-10-10', gender: 'male', maritalStatus: 'married', nationality: 'Indian', salary: 1300000, salaryCurrency: 'INR' },
  { id: 'demo-12', employeeId: 'EMP-012', firstName: 'Lakshmi', lastName: 'Venkat', email: 'lakshmi.v@3boxeshrms.com', phone: '+91 77665 54433', avatar: null, department: { id: 'd6', name: 'Finance' }, designation: { id: 'des11', title: 'Accountant' }, branch: { id: 'b1', name: 'Bangalore HQ' }, dateOfJoining: '2024-07-15', status: 'terminated', dateOfBirth: '1989-02-28', gender: 'female', maritalStatus: 'married', nationality: 'Indian', salary: 700000, salaryCurrency: 'INR' },
];

/* ── Component ── */
export default function EmployeesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editIdFromUrl = searchParams.get('editId');
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin'].includes(user?.role || '');
  const { effectiveCompanyId, selectedTenantId, availableCompanies } = useCompanyContextStore();
  const scopeCompanyId = effectiveCompanyId();
  const scopeTenantId = user?.role === 'super_admin' ? selectedTenantId : undefined;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterDesignation, setFilterDesignation] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [leavePolicies, setLeavePolicies] = useState<Array<{ id: string; title: string; version: string }>>([]);
  const [attendancePolicies, setAttendancePolicies] = useState<Array<{ id: string; title: string; version: string }>>([]);
  const [travelPolicies, setTravelPolicies] = useState<Array<{ id: string; title: string; version: string }>>([]);
  const [salaryStructures, setSalaryStructures] = useState<Array<{ id: string; name: string }>>([]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Row selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);

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

  // Stats calculations
  const stats = {
    total: allEmployees.length,
    active: allEmployees.filter(e => e.status === 'active').length,
    inactive: allEmployees.filter(e => e.status !== 'active').length,
    newJoiners: allEmployees.filter(e => {
      if (!e.dateOfJoining) return false;
      const joinDate = new Date(e.dateOfJoining);
      const now = new Date();
      const monthDiff = (now.getFullYear() - joinDate.getFullYear()) * 12 + now.getMonth() - joinDate.getMonth();
      return monthDiff <= 1;
    }).length,
  };

  /* Close action menu on outside click */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setActionMenuOpen(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* Fetch employees */
  const fetchEmployees = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (search) params.set('search', search);
      if (filterDept) params.set('departmentId', filterDept);
      if (filterStatus) params.set('status', filterStatus);
      if (scopeCompanyId) params.set('companyId', scopeCompanyId);
      else if (scopeTenantId) params.set('tenantId', scopeTenantId);

      const res = await fetch(`/api/employees?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const fetched = data.employees || [];
      if (fetched.length === 0) {
        // Use sample data as fallback when API returns empty
        setEmployees(SAMPLE_EMPLOYEES.slice(0, 10));
        setPagination({ page: 1, limit: 10, total: SAMPLE_EMPLOYEES.length, totalPages: Math.ceil(SAMPLE_EMPLOYEES.length / 10) });
      } else {
        setEmployees(fetched);
        setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
      }
    } catch (err) {
      console.error('Failed to load employees from API, using sample data:', err);
      setEmployees(SAMPLE_EMPLOYEES.slice(0, 10));
      setPagination({ page: 1, limit: 10, total: SAMPLE_EMPLOYEES.length, totalPages: Math.ceil(SAMPLE_EMPLOYEES.length / 10) });
    } finally {
      setLoading(false);
    }
  }, [search, filterDept, filterStatus, scopeCompanyId, scopeTenantId]);

  /* Fetch all employees for stats */
  const fetchAllEmployees = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (scopeCompanyId) params.set('companyId', scopeCompanyId);
      else if (scopeTenantId) params.set('tenantId', scopeTenantId);
      const res = await fetch(`/api/employees?${params}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const fetched = data.employees || [];
        if (fetched.length === 0) {
          setAllEmployees(SAMPLE_EMPLOYEES);
        } else {
          setAllEmployees(fetched);
        }
      } else {
        setAllEmployees(SAMPLE_EMPLOYEES);
      }
    } catch {
      setAllEmployees(SAMPLE_EMPLOYEES);
    }
  }, [scopeCompanyId, scopeTenantId]);

  /* Fetch dropdown data */
  const fetchDropdowns = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const allEmpRes = await fetch('/api/employees?limit=500', { headers });
      if (allEmpRes.ok) {
        const allData = await allEmpRes.json();
        const emps = allData.employees || [];
        const sourceList = emps.length > 0 ? emps : SAMPLE_EMPLOYEES;
        const deptMap = new Map<string, Department>();
        const desigMap = new Map<string, Designation>();
        const branchMap = new Map<string, Branch>();
        sourceList.forEach((e: Employee) => {
          if (e.department) deptMap.set(e.department.id, e.department);
          if (e.designation) desigMap.set(e.designation.id, e.designation);
          if (e.branch) branchMap.set(e.branch.id, e.branch);
        });
        setDepartments(Array.from(deptMap.values()));
        setDesignations(Array.from(desigMap.values()));
        setBranches(Array.from(branchMap.values()));
      } else {
        // Fallback: extract dropdowns from sample data
        const deptMap = new Map<string, Department>();
        const desigMap = new Map<string, Designation>();
        const branchMap = new Map<string, Branch>();
        SAMPLE_EMPLOYEES.forEach((e: Employee) => {
          if (e.department) deptMap.set(e.department.id, e.department);
          if (e.designation) desigMap.set(e.designation.id, e.designation);
          if (e.branch) branchMap.set(e.branch.id, e.branch);
        });
        setDepartments(Array.from(deptMap.values()));
        setDesignations(Array.from(desigMap.values()));
        setBranches(Array.from(branchMap.values()));
      }
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

  useEffect(() => {
    queueMicrotask(() => fetchAllEmployees());
  }, [fetchAllEmployees]);

  /* Handle editId from URL (navigated from employee view page Edit button) */
  useEffect(() => {
    if (!editIdFromUrl) return;
    const fetchAndOpenEdit = async () => {
      try {
        const res = await fetch(`/api/employees/${editIdFromUrl}`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const emp = data.employee;
        if (!emp) return;
        // Build form from fetched employee
        setEditingId(emp.id);
        setForm({
          employeeId: emp.employeeId || '',
          firstName: emp.firstName || '',
          lastName: emp.lastName || '',
          email: emp.email || '',
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
          companyId: emp.companyId || emp.company?.id || '',
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
          leavePolicyId: emp.leavePolicyId || '',
          attendancePolicyId: emp.attendancePolicyId || '',
          travelPolicyId: emp.travelPolicyId || '',
          salaryStructureId: emp.salaryStructureId || '',
          // Statutory
          pfNumber: (emp as Record<string, unknown>).pfNumber as string || '',
          pfUAN: (emp as Record<string, unknown>).pfUAN as string || '',
          pfNomineeName: (emp as Record<string, unknown>).pfNomineeName as string || '',
          pfNomineeRelation: (emp as Record<string, unknown>).pfNomineeRelation as string || '',
          pfNomineePercentage: (emp as Record<string, unknown>).pfNomineePercentage as string || '',
          esiNumber: (emp as Record<string, unknown>).esiNumber as string || '',
          esiDispensary: (emp as Record<string, unknown>).esiDispensary as string || '',
          esiNomineeName: (emp as Record<string, unknown>).esiNomineeName as string || '',
          esiNomineeRelation: (emp as Record<string, unknown>).esiNomineeRelation as string || '',
          professionalTaxNumber: (emp as Record<string, unknown>).professionalTaxNumber as string || '',
          lwfNumber: (emp as Record<string, unknown>).lwfNumber as string || '',
          // Overseas
          hasForeignCitizenship: (emp as Record<string, unknown>).hasForeignCitizenship as string || '',
          foreignCitizenshipCountry: (emp as Record<string, unknown>).foreignCitizenshipCountry as string || '',
          foreignPassportNumber: (emp as Record<string, unknown>).foreignPassportNumber as string || '',
          foreignPassportExpiry: (emp as Record<string, unknown>).foreignPassportExpiry as string || '',
          hasForeignSojourn: (emp as Record<string, unknown>).hasForeignSojourn as string || '',
          foreignSojournCountry: (emp as Record<string, unknown>).foreignSojournCountry as string || '',
          foreignSojournPurpose: (emp as Record<string, unknown>).foreignSojournPurpose as string || '',
          foreignSojournDuration: (emp as Record<string, unknown>).foreignSojournDuration as string || '',
          hasVisa: (emp as Record<string, unknown>).hasVisa as string || '',
          visaType: (emp as Record<string, unknown>).visaType as string || '',
          visaCountry: (emp as Record<string, unknown>).visaCountry as string || '',
          visaExpiry: (emp as Record<string, unknown>).visaExpiry as string || '',
          hasIntlDrivingLicense: (emp as Record<string, unknown>).hasIntlDrivingLicense as string || '',
          intlDrivingLicenseCountry: (emp as Record<string, unknown>).intlDrivingLicenseCountry as string || '',
          intlDrivingLicenseExpiry: (emp as Record<string, unknown>).intlDrivingLicenseExpiry as string || '',
          // Experience
          previousEmployer1: (emp as Record<string, unknown>).previousEmployer1 as string || '',
          previousDesignation1: (emp as Record<string, unknown>).previousDesignation1 as string || '',
          previousDuration1: (emp as Record<string, unknown>).previousDuration1 as string || '',
          previousReason1: (emp as Record<string, unknown>).previousReason1 as string || '',
          previousEmployer2: (emp as Record<string, unknown>).previousEmployer2 as string || '',
          previousDesignation2: (emp as Record<string, unknown>).previousDesignation2 as string || '',
          previousDuration2: (emp as Record<string, unknown>).previousDuration2 as string || '',
          previousReason2: (emp as Record<string, unknown>).previousReason2 as string || '',
          previousEmployer3: (emp as Record<string, unknown>).previousEmployer3 as string || '',
          previousDesignation3: (emp as Record<string, unknown>).previousDesignation3 as string || '',
          previousDuration3: (emp as Record<string, unknown>).previousDuration3 as string || '',
          previousReason3: (emp as Record<string, unknown>).previousReason3 as string || '',
          totalExperience: (emp as Record<string, unknown>).totalExperience as string || '',
        });
        setShowForm(true);
        setFormTab('personal');
        setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      } catch (err) {
        console.error('Failed to load employee for editing:', err);
      }
    };
    fetchAndOpenEdit();
  }, [editIdFromUrl]);

  /* Read employee code settings from localStorage */
  const getEmployeeCodeSettings = useCallback(() => {
    try {
      const stored = localStorage.getItem('3boxes_hrms_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        return {
          autoGeneration: settings.employee_code_auto_generation !== false,
          prefix: settings.employee_code_prefix || 'EMP',
          sequence: settings.employee_code_sequence || 1001,
        };
      }
    } catch { /* ignore */ }
    return { autoGeneration: true, prefix: 'EMP', sequence: 1001 };
  }, []);

  /* Generate the next employee code based on settings */
  const generateNextEmployeeCode = useCallback(() => {
    const settings = getEmployeeCodeSettings();
    if (!settings.autoGeneration) return ''; // Manual mode — leave empty for user to fill
    // Use prefix + timestamp-based unique suffix to avoid collisions
    const ts = String(Date.now()).slice(-6);
    return `${settings.prefix}${ts}`;
  }, [getEmployeeCodeSettings]);

  /* Form handlers */
  const handleOpenAddForm = () => {
    setEditingId(null);
    const settings = getEmployeeCodeSettings();
    setForm({
      ...initialForm,
      employeeId: settings.autoGeneration ? generateNextEmployeeCode() : '',
      companyId: scopeCompanyId || '',
    });
    setShowForm(true);
    setFormTab('personal');
    setDeleteConfirmId(null);
    setActionMenuOpen(null);
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
      companyId: (emp as Record<string, unknown>).companyId as string || '',
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
      leavePolicyId: emp.leavePolicyId || '',
      attendancePolicyId: emp.attendancePolicyId || '',
      travelPolicyId: emp.travelPolicyId || '',
      salaryStructureId: emp.salaryStructureId || '',
    });
    setShowForm(true);
    setFormTab('personal');
    setDeleteConfirmId(null);
    setActionMenuOpen(null);
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
    // Enhanced validation: show exactly which required fields are missing
    const missingFields: string[] = [];
    const settings = getEmployeeCodeSettings();
    if (settings.autoGeneration && !form.employeeId) missingFields.push('Employee ID');
    if (!settings.autoGeneration && !form.employeeId) missingFields.push('Employee ID');
    if (!form.firstName) missingFields.push('First Name');
    if (!form.lastName) missingFields.push('Last Name');
    if (!form.email) missingFields.push('Email');
    if (!form.departmentId) missingFields.push('Department');
    if (!form.designationId) missingFields.push('Designation');
    if (!form.dateOfJoining) missingFields.push('Date of Joining');
    if (missingFields.length > 0) {
      toast.error(`Missing required fields: ${missingFields.join(', ')}`, { duration: 5000 });
      // Auto-navigate to the tab that contains the first missing field
      const personalFields = ['Employee ID', 'First Name', 'Last Name', 'Email'];
      const employmentFields = ['Department', 'Designation', 'Date of Joining'];
      if (personalFields.includes(missingFields[0])) setFormTab('personal');
      else if (employmentFields.includes(missingFields[0])) setFormTab('employment');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        ...form,
        salary: form.salary ? parseFloat(form.salary) : null,
        companyId: form.companyId || scopeCompanyId || null,
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
      fetchAllEmployees();
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
      setActionMenuOpen(null);
      fetchEmployees(pagination.page);
      fetchAllEmployees();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const updateForm = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  /* Bulk selection */
  const toggleSelectAll = () => {
    if (selectedIds.size === employees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map(e => e.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-thb-text-primary flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-sm">
              <FiUsers className="w-5 h-5 text-white" />
            </div>
            Employees
          </h1>
          <p className="text-thb-text-secondary mt-1 ml-[46px]">Manage your organization&apos;s workforce</p>
        </div>
        {isAdmin && (
          <button onClick={handleOpenAddForm} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium text-sm shadow-sm shadow-emerald-600/25 transition-all duration-200 hover:shadow-md hover:shadow-emerald-600/20">
            <FiPlus className="w-4 h-4" />
            Add Employee
          </button>
        )}
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Employees */}
        <div className="thb-card p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-[3rem] group-hover:from-blue-500/15 transition-colors" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Total Employees</p>
              <p className="text-3xl font-bold text-thb-text-primary mt-2">{stats.total}</p>
              <p className="text-xs text-thb-text-muted mt-1">Across all departments</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <FiUsers className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Active */}
        <div className="thb-card p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-[3rem] group-hover:from-emerald-500/15 transition-colors" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Active</p>
              <p className="text-3xl font-bold text-emerald-600 mt-2">{stats.active}</p>
              <p className="text-xs text-thb-text-muted mt-1">Currently working</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <FiUserCheck className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>

        {/* Inactive */}
        <div className="thb-card p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-red-500/10 to-transparent rounded-bl-[3rem] group-hover:from-red-500/15 transition-colors" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Inactive</p>
              <p className="text-3xl font-bold text-red-500 mt-2">{stats.inactive}</p>
              <p className="text-xs text-thb-text-muted mt-1">On leave / exited</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-red-500/10 flex items-center justify-center">
              <FiUserX className="w-5 h-5 text-red-500" />
            </div>
          </div>
        </div>

        {/* New Joiners */}
        <div className="thb-card p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-violet-500/10 to-transparent rounded-bl-[3rem] group-hover:from-violet-500/15 transition-colors" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider">New Joiners</p>
              <p className="text-3xl font-bold text-violet-600 mt-2">{stats.newJoiners}</p>
              <p className="text-xs text-thb-text-muted mt-1">Joined this month</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <FiUserPlus className="w-5 h-5 text-violet-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Module Intro */}
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

      {/* ── Add/Edit Employee Form ── */}
      {showForm && (
        <div id="crud-form" className="thb-card border-l-4 border-l-blue-500 transition-all duration-300 ease-in-out">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-thb-text-primary">
                {editingId ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button onClick={handleCancelForm} className="p-2 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Horizontal Section Tabs */}
            <div className="flex items-center gap-1 border-b border-thb-border mb-6 overflow-x-auto pb-px -mx-1 px-1">
              {formTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFormTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                    formTab === tab.key
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-thb-text-muted hover:text-thb-text-primary hover:border-slate-300'
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
              <span className="text-xs text-thb-text-muted ml-2 shrink-0">
                Step {formTabs.findIndex(t => t.key === formTab) + 1} of {formTabs.length}
              </span>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Personal Information */}
              {formTab === 'personal' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">First Name *</label>
                      <input type="text" value={form.firstName} onChange={e => updateForm('firstName', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Last Name *</label>
                      <input type="text" value={form.lastName} onChange={e => updateForm('lastName', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                        Employee ID *
                        {getEmployeeCodeSettings().autoGeneration && !editingId && (
                          <span className="ml-1.5 text-[10px] font-normal text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">Auto-generated</span>
                        )}
                        {!getEmployeeCodeSettings().autoGeneration && !editingId && (
                          <span className="ml-1.5 text-[10px] font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Manual</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={form.employeeId}
                        onChange={e => updateForm('employeeId', e.target.value)}
                        required
                        disabled={!!editingId || (getEmployeeCodeSettings().autoGeneration && !editingId)}
                        placeholder={getEmployeeCodeSettings().autoGeneration ? 'Auto-generated on save' : 'Enter employee ID'}
                        className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Email *</label>
                      <input type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Phone</label>
                      <input type="tel" value={form.phone} onChange={e => updateForm('phone', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Date of Birth</label>
                      <input type="date" value={form.dateOfBirth} onChange={e => updateForm('dateOfBirth', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Gender</label>
                      <select value={form.gender} onChange={e => updateForm('gender', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Marital Status</label>
                      <select value={form.maritalStatus} onChange={e => updateForm('maritalStatus', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="single">Single</option>
                        <option value="married">Married</option>
                        <option value="divorced">Divorced</option>
                        <option value="widowed">Widowed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nationality</label>
                      <input type="text" value={form.nationality} onChange={e => updateForm('nationality', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
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
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Address</label>
                      <input type="text" value={form.address} onChange={e => updateForm('address', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">City</label>
                      <input type="text" value={form.city} onChange={e => updateForm('city', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">State</label>
                      <input type="text" value={form.state} onChange={e => updateForm('state', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">ZIP Code</label>
                      <input type="text" value={form.zipCode} onChange={e => updateForm('zipCode', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Country</label>
                      <input type="text" value={form.country} onChange={e => updateForm('country', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('personal')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
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
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">
                        Company *
                        {availableCompanies.length > 1 && (
                          <span className="ml-1 text-[10px] font-normal text-thb-text-muted">({availableCompanies.length} companies)</span>
                        )}
                      </label>
                      <select
                        value={form.companyId}
                        onChange={e => updateForm('companyId', e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      >
                        <option value="">Select Company</option>
                        {availableCompanies.map(c => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</option>)}
                      </select>
                      {availableCompanies.length <= 1 && form.companyId && (
                        <p className="text-[10px] text-thb-text-muted mt-1">Auto-assigned to your company</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Department *</label>
                      <select value={form.departmentId} onChange={e => updateForm('departmentId', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select Department</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Designation *</label>
                      <select value={form.designationId} onChange={e => updateForm('designationId', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select Designation</option>
                        {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Branch</label>
                      <select value={form.branchId} onChange={e => updateForm('branchId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select Branch</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Date of Joining *</label>
                      <input type="date" value={form.dateOfJoining} onChange={e => updateForm('dateOfJoining', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('address')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
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
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Bank Name</label>
                      <input type="text" value={form.bankName} onChange={e => updateForm('bankName', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Bank Account No</label>
                      <input type="text" value={form.bankAccountNo} onChange={e => updateForm('bankAccountNo', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">IFSC Code</label>
                      <input type="text" value={form.bankIfscCode} onChange={e => updateForm('bankIfscCode', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">PAN Number</label>
                      <input type="text" value={form.panNumber} onChange={e => updateForm('panNumber', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Aadhaar Number</label>
                      <input type="text" value={form.aadhaarNumber} onChange={e => updateForm('aadhaarNumber', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('employment')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={() => setFormTab('statutory')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Statutory <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Statutory Details */}
              {formTab === 'statutory' && (
                <div className="space-y-4">
                  {/* PF Details */}
                  <div>
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Provident Fund (PF)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">PF Number</label>
                        <input type="text" value={form.pfNumber} onChange={e => updateForm('pfNumber', e.target.value)} placeholder="e.g., PF/MH/12345/678" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">UAN Number</label>
                        <input type="text" value={form.pfUAN} onChange={e => updateForm('pfUAN', e.target.value)} placeholder="12-digit UAN" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  {/* PF Nomination */}
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">PF Nomination Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nominee Name</label>
                        <input type="text" value={form.pfNomineeName} onChange={e => updateForm('pfNomineeName', e.target.value)} placeholder="Full name of nominee" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nominee Relationship</label>
                        <select value={form.pfNomineeRelation} onChange={e => updateForm('pfNomineeRelation', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
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
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nomination Percentage</label>
                        <input type="number" min="0" max="100" value={form.pfNomineePercentage} onChange={e => updateForm('pfNomineePercentage', e.target.value)} placeholder="e.g., 100" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  {/* ESI Details */}
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Employee State Insurance (ESI)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">ESI Number</label>
                        <input type="text" value={form.esiNumber} onChange={e => updateForm('esiNumber', e.target.value)} placeholder="e.g., 31-00-123456-000-0001" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">ESI Dispensary</label>
                        <input type="text" value={form.esiDispensary} onChange={e => updateForm('esiDispensary', e.target.value)} placeholder="Assigned dispensary name" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  {/* ESI Nomination */}
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">ESI Nomination Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nominee Name</label>
                        <input type="text" value={form.esiNomineeName} onChange={e => updateForm('esiNomineeName', e.target.value)} placeholder="Full name of nominee" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Nominee Relationship</label>
                        <select value={form.esiNomineeRelation} onChange={e => updateForm('esiNomineeRelation', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
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
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Other Statutory</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Professional Tax Number</label>
                        <input type="text" value={form.professionalTaxNumber} onChange={e => updateForm('professionalTaxNumber', e.target.value)} placeholder="PT registration number" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">LWF Number</label>
                        <input type="text" value={form.lwfNumber} onChange={e => updateForm('lwfNumber', e.target.value)} placeholder="Labour Welfare Fund number" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('bank')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Emergency Contact Name</label>
                      <input type="text" value={form.emergencyContactName} onChange={e => updateForm('emergencyContactName', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Emergency Contact Phone</label>
                      <input type="tel" value={form.emergencyContactPhone} onChange={e => updateForm('emergencyContactPhone', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('statutory')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
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
                  <p className="text-xs text-thb-text-muted">Capture employee health information for workplace safety and emergency preparedness. All fields are optional and confidential.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Blood Group</label>
                      <select value={form.bloodGroup} onChange={e => updateForm('bloodGroup', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="A+">A+</option><option value="A-">A-</option>
                        <option value="B+">B+</option><option value="B-">B-</option>
                        <option value="AB+">AB+</option><option value="AB-">AB-</option>
                        <option value="O+">O+</option><option value="O-">O-</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Has Chronic Illness?</label>
                      <select value={form.hasChronicIllness} onChange={e => updateForm('hasChronicIllness', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasChronicIllness === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Chronic Illness Details</label>
                        <input type="text" value={form.chronicIllnessDetails} onChange={e => updateForm('chronicIllnessDetails', e.target.value)} placeholder="Describe the condition" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Has Allergies?</label>
                      <select value={form.hasAllergies} onChange={e => updateForm('hasAllergies', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasAllergies === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Allergy Details</label>
                        <input type="text" value={form.allergyDetails} onChange={e => updateForm('allergyDetails', e.target.value)} placeholder="List allergies" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Has Disability?</label>
                      <select value={form.hasDisability} onChange={e => updateForm('hasDisability', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasDisability === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Disability Details</label>
                        <input type="text" value={form.disabilityDetails} onChange={e => updateForm('disabilityDetails', e.target.value)} placeholder="Nature of disability" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">On Medication?</label>
                      <select value={form.isOnMedication} onChange={e => updateForm('isOnMedication', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.isOnMedication === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Medication Details</label>
                        <input type="text" value={form.medicationDetails} onChange={e => updateForm('medicationDetails', e.target.value)} placeholder="Current medications" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Has Had Surgery?</label>
                      <select value={form.hasHadSurgery} onChange={e => updateForm('hasHadSurgery', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasHadSurgery === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Surgery Details</label>
                        <input type="text" value={form.surgeryDetails} onChange={e => updateForm('surgeryDetails', e.target.value)} placeholder="Surgery details" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Emergency Medical & Insurance</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Emergency Medical Condition</label>
                        <input type="text" value={form.emergencyMedicalCondition} onChange={e => updateForm('emergencyMedicalCondition', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Primary Physician Name</label>
                        <input type="text" value={form.primaryPhysicianName} onChange={e => updateForm('primaryPhysicianName', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Primary Physician Phone</label>
                        <input type="tel" value={form.primaryPhysicianPhone} onChange={e => updateForm('primaryPhysicianPhone', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Health Insurance Provider</label>
                        <input type="text" value={form.healthInsuranceProvider} onChange={e => updateForm('healthInsuranceProvider', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Health Insurance Policy No</label>
                        <input type="text" value={form.healthInsurancePolicyNo} onChange={e => updateForm('healthInsurancePolicyNo', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('emergency')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
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
                  <p className="text-xs text-thb-text-muted">Applicable for employees with foreign citizenship, travel history, or international work assignments.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Foreign Citizenship?</label>
                      <select value={form.hasForeignCitizenship} onChange={e => updateForm('hasForeignCitizenship', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasForeignCitizenship === 'yes' && (
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Citizenship Country</label>
                        <input type="text" value={form.foreignCitizenshipCountry} onChange={e => updateForm('foreignCitizenshipCountry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Foreign Passport Number</label>
                      <input type="text" value={form.foreignPassportNumber} onChange={e => updateForm('foreignPassportNumber', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Foreign Passport Expiry</label>
                      <input type="date" value={form.foreignPassportExpiry} onChange={e => updateForm('foreignPassportExpiry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Foreign Sojourn?</label>
                      <select value={form.hasForeignSojourn} onChange={e => updateForm('hasForeignSojourn', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasForeignSojourn === 'yes' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Sojourn Country</label>
                          <input type="text" value={form.foreignSojournCountry} onChange={e => updateForm('foreignSojournCountry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Sojourn Purpose</label>
                          <input type="text" value={form.foreignSojournPurpose} onChange={e => updateForm('foreignSojournPurpose', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Sojourn Duration</label>
                          <input type="text" value={form.foreignSojournDuration} onChange={e => updateForm('foreignSojournDuration', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Has Visa?</label>
                      <select value={form.hasVisa} onChange={e => updateForm('hasVisa', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasVisa === 'yes' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Visa Type</label>
                          <input type="text" value={form.visaType} onChange={e => updateForm('visaType', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Visa Country</label>
                          <input type="text" value={form.visaCountry} onChange={e => updateForm('visaCountry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">Visa Expiry</label>
                          <input type="date" value={form.visaExpiry} onChange={e => updateForm('visaExpiry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Intl Driving License?</label>
                      <select value={form.hasIntlDrivingLicense} onChange={e => updateForm('hasIntlDrivingLicense', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select</option>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    {form.hasIntlDrivingLicense === 'yes' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">License Country</label>
                          <input type="text" value={form.intlDrivingLicenseCountry} onChange={e => updateForm('intlDrivingLicenseCountry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-thb-text-secondary mb-1">License Expiry</label>
                          <input type="date" value={form.intlDrivingLicenseExpiry} onChange={e => updateForm('intlDrivingLicenseExpiry', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('health')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
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
                  <div>
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Experience 1</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Previous Employer</label>
                        <input type="text" value={form.previousEmployer1} onChange={e => updateForm('previousEmployer1', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Designation</label>
                        <input type="text" value={form.previousDesignation1} onChange={e => updateForm('previousDesignation1', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Duration</label>
                        <input type="text" value={form.previousDuration1} onChange={e => updateForm('previousDuration1', e.target.value)} placeholder="e.g., 2 years" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Reason for Leaving</label>
                        <input type="text" value={form.previousReason1} onChange={e => updateForm('previousReason1', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Experience 2</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Previous Employer</label>
                        <input type="text" value={form.previousEmployer2} onChange={e => updateForm('previousEmployer2', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Designation</label>
                        <input type="text" value={form.previousDesignation2} onChange={e => updateForm('previousDesignation2', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Duration</label>
                        <input type="text" value={form.previousDuration2} onChange={e => updateForm('previousDuration2', e.target.value)} placeholder="e.g., 2 years" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Reason for Leaving</label>
                        <input type="text" value={form.previousReason2} onChange={e => updateForm('previousReason2', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-thb-border/50">
                    <h4 className="text-xs font-semibold text-thb-text-muted uppercase tracking-wider mb-3">Experience 3</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Previous Employer</label>
                        <input type="text" value={form.previousEmployer3} onChange={e => updateForm('previousEmployer3', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Designation</label>
                        <input type="text" value={form.previousDesignation3} onChange={e => updateForm('previousDesignation3', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Duration</label>
                        <input type="text" value={form.previousDuration3} onChange={e => updateForm('previousDuration3', e.target.value)} placeholder="e.g., 2 years" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Reason for Leaving</label>
                        <input type="text" value={form.previousReason3} onChange={e => updateForm('previousReason3', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-thb-border/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-thb-text-secondary mb-1">Total Experience</label>
                        <input type="text" value={form.totalExperience} onChange={e => updateForm('totalExperience', e.target.value)} placeholder="e.g., 5 years" className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => setFormTab('overseas')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button type="button" onClick={() => setFormTab('policies')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 shadow-sm transition-colors">
                      Next: Policies <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Policy Mappings */}
              {formTab === 'policies' && (
                <div className="space-y-4">
                  <p className="text-xs text-thb-text-muted">Assign organizational policies to this employee. These can be updated later from the employee profile.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Leave Policy</label>
                      <select value={form.leavePolicyId} onChange={e => updateForm('leavePolicyId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select Leave Policy</option>
                        {leavePolicies.map(p => <option key={p.id} value={p.id}>{p.title} {p.version ? `(v${p.version})` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Attendance Policy</label>
                      <select value={form.attendancePolicyId} onChange={e => updateForm('attendancePolicyId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select Attendance Policy</option>
                        {attendancePolicies.map(p => <option key={p.id} value={p.id}>{p.title} {p.version ? `(v${p.version})` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Travel Policy</label>
                      <select value={form.travelPolicyId} onChange={e => updateForm('travelPolicyId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select Travel Policy</option>
                        {travelPolicies.map(p => <option key={p.id} value={p.id}>{p.title} {p.version ? `(v${p.version})` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-thb-text-secondary mb-1">Salary Structure</label>
                      <select value={form.salaryStructureId} onChange={e => updateForm('salaryStructureId', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-thb-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                        <option value="">Select Salary Structure</option>
                        {salaryStructures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-thb-border mt-4">
                    <button type="button" onClick={() => setFormTab('experience')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
                      <FiChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={handleCancelForm} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm font-medium text-thb-text-secondary hover:bg-slate-50 transition-colors">
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

      {/* ── Filter Bar ── */}
      <div className="thb-card p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* Search */}
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-thb-text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or employee ID..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-thb-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          {/* Department Filter */}
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-thb-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 min-w-[160px]"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {/* Designation Filter */}
          <select
            value={filterDesignation}
            onChange={e => setFilterDesignation(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-thb-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 min-w-[160px]"
          >
            <option value="">All Designations</option>
            {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>

          {/* More Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${showFilters ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-thb-border text-thb-text-secondary hover:bg-slate-50'}`}
          >
            <FiFilter className="w-4 h-4" />
            More
          </button>
        </div>

        {/* Extended Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 pt-3 border-t border-thb-border">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2.5 rounded-lg border border-thb-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="terminated">Terminated</option>
              <option value="resigned">Resigned</option>
            </select>
            <button onClick={() => { setFilterDept(''); setFilterDesignation(''); setFilterStatus(''); setSearch(''); }} className="px-4 py-2.5 rounded-lg border border-thb-border text-sm text-thb-text-secondary hover:bg-slate-50 transition-colors">
              Clear All Filters
            </button>
          </div>
        )}

        {/* Active filter indicators */}
        {(filterDept || filterDesignation || filterStatus || search) && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-thb-border">
            <span className="text-xs text-thb-text-muted">Active filters:</span>
            {search && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                Search: &ldquo;{search}&rdquo;
                <button onClick={() => setSearch('')} className="hover:text-blue-900"><FiX className="w-3 h-3" /></button>
              </span>
            )}
            {filterDept && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-medium">
                Dept: {departments.find(d => d.id === filterDept)?.name}
                <button onClick={() => setFilterDept('')} className="hover:text-violet-900"><FiX className="w-3 h-3" /></button>
              </span>
            )}
            {filterDesignation && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                Role: {designations.find(d => d.id === filterDesignation)?.title}
                <button onClick={() => setFilterDesignation('')} className="hover:text-amber-900"><FiX className="w-3 h-3" /></button>
              </span>
            )}
            {filterStatus && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                Status: {filterStatus.replace('_', ' ')}
                <button onClick={() => setFilterStatus('')} className="hover:text-emerald-900"><FiX className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── View Mode Toggle & Bulk Actions ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
              <span className="text-sm font-medium text-blue-700">{selectedIds.size} selected</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-blue-500 hover:text-blue-700"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          )}
          {pagination.total > 0 && (
            <span className="text-sm text-thb-text-muted">
              Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} employees
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-thb-text-secondary hover:bg-slate-50 border border-thb-border'}`}
            title="List View"
          >
            <FiList className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-blue-500 text-white shadow-sm' : 'bg-white text-thb-text-secondary hover:bg-slate-50 border border-thb-border'}`}
            title="Grid View"
          >
            <FiGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Table (List View) ── */}
      {viewMode === 'list' ? (
      <div className="thb-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-thb-border bg-slate-50/80">
                <th className="text-left px-4 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={employees.length > 0 && selectedIds.size === employees.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Emp ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider hidden lg:table-cell">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider hidden sm:table-cell">Designation</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider hidden xl:table-cell">Joining Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-thb-text-muted uppercase tracking-wider w-16">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-thb-border/50 animate-pulse">
                    <td className="px-4 py-3"><div className="w-4 h-4 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-200 rounded font-mono" /></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-9 h-9 bg-slate-200 rounded-full" /><div className="space-y-1"><div className="h-3 w-28 bg-slate-200 rounded" /><div className="h-2 w-20 bg-slate-200 rounded" /></div></div></td>
                    <td className="px-4 py-3 hidden md:table-cell"><div className="h-3 w-32 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3 hidden sm:table-cell"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3 hidden xl:table-cell"><div className="h-3 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-6 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                        <FiUsers className="w-8 h-8 text-thb-text-muted" />
                      </div>
                      <p className="text-thb-text-secondary font-medium text-base">No employees found</p>
                      <p className="text-sm text-thb-text-muted mt-1">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                employees.map(emp => {
                  const badge = getStatusBadge(emp.status);
                  const dotColor = getStatusDotColor(emp.status);
                  const initials = `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase();
                  const avatarGradient = getAvatarColor(`${emp.firstName} ${emp.lastName}`);
                  const isDeleting = deleteConfirmId === emp.id;
                  const isSelected = selectedIds.has(emp.id);
                  return (
                    <tr key={emp.id} className={`border-b border-thb-border/50 transition-colors ${isDeleting ? 'bg-red-50/80' : isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50/50'}`}>
                      {isDeleting ? (
                        <td colSpan={9} className="px-4 py-3">
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
                              <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-thb-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(emp.id)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-mono font-medium text-thb-text-secondary bg-slate-100 px-2 py-0.5 rounded">
                              {emp.employeeId}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {emp.avatar ? (
                                <img src={emp.avatar} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm flex-shrink-0" />
                              ) : (
                                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm`}>
                                  {initials}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-thb-text-primary truncate">{emp.firstName} {emp.lastName}</p>
                                <p className="text-xs text-thb-text-muted truncate">{emp.department?.name || 'No Department'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="flex items-center gap-1.5 text-sm text-thb-text-secondary truncate">
                              <FiMail className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                              <span className="truncate">{emp.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <div className="flex items-center gap-1.5 text-sm text-thb-text-secondary">
                              <FiPhone className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                              <span>{emp.phone || '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-sm text-thb-text-secondary">{emp.designation?.title || '—'}</span>
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <div className="flex items-center gap-1.5 text-sm text-thb-text-secondary">
                              <FiCalendar className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                              <span>{formatDate(emp.dateOfJoining)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 ${badge.className}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end relative" ref={actionMenuOpen === emp.id ? actionMenuRef : null}>
                              <button
                                onClick={() => setActionMenuOpen(actionMenuOpen === emp.id ? null : emp.id)}
                                className="p-1.5 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors"
                                title="Actions"
                              >
                                <FiMoreVertical className="w-4 h-4" />
                              </button>
                              {actionMenuOpen === emp.id && (
                                <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-thb-border shadow-lg py-1.5 z-50 animate-fade-in">
                                  <button
                                    onClick={() => { router.push(`/employees/${emp.id}`); setActionMenuOpen(null); }}
                                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-thb-text-secondary hover:bg-slate-50 hover:text-blue-600 transition-colors"
                                  >
                                    <FiEye className="w-4 h-4" /> View Details
                                  </button>
                                  {isAdmin && (
                                    <>
                                      <button
                                        onClick={() => { handleOpenEditForm(emp); setActionMenuOpen(null); }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-thb-text-secondary hover:bg-slate-50 hover:text-amber-600 transition-colors"
                                      >
                                        <FiEdit2 className="w-4 h-4" /> Edit Employee
                                      </button>
                                      <div className="my-1 border-t border-thb-border" />
                                      <button
                                        onClick={() => { setDeleteConfirmId(emp.id); setActionMenuOpen(null); }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                      >
                                        <FiTrash2 className="w-4 h-4" /> Terminate
                                      </button>
                                    </>
                                  )}
                                </div>
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-thb-border bg-slate-50/50">
            <p className="text-sm text-thb-text-muted">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => fetchEmployees(pagination.page - 1)} disabled={pagination.page <= 1} className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                const p = i + 1;
                return (
                  <button key={p} onClick={() => fetchEmployees(p)} className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${p === pagination.page ? 'bg-blue-500 text-white shadow-sm' : 'text-thb-text-secondary hover:bg-white border border-thb-border'}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => fetchEmployees(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      ) : (
      /* ── Grid View ── */
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {employees.length === 0 ? (
          <div className="col-span-full text-center py-16">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <FiUsers className="w-8 h-8 text-thb-text-muted" />
              </div>
              <p className="text-thb-text-secondary font-medium">No employees found</p>
              <p className="text-sm text-thb-text-muted mt-1">Try adjusting your search or filters</p>
            </div>
          </div>
        ) : (
          employees.map(emp => {
            const statusBadge = getStatusBadge(emp.status);
            const dotColor = getStatusDotColor(emp.status);
            const initials = `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase();
            const avatarGradient = getAvatarColor(`${emp.firstName} ${emp.lastName}`);
            const isDeleting = deleteConfirmId === emp.id;
            return (
              <div key={emp.id} className={`thb-card overflow-hidden group transition-all duration-200 ${isDeleting ? 'ring-2 ring-red-300' : 'hover:shadow-lg'}`}>
                {isDeleting ? (
                  <div className="p-5 text-center space-y-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto">
                      <FiTrash2 className="w-5 h-5 text-red-500" />
                    </div>
                    <p className="text-sm text-red-700 font-medium">Terminate {emp.firstName}?</p>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleDelete(emp.id)} disabled={deleting} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors">
                        {deleting ? 'Wait...' : 'Confirm'}
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="px-3 py-1.5 border border-thb-border text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Card Header with Avatar */}
                    <div className="p-5 pb-3">
                      <div className="flex items-start gap-3.5">
                        {emp.avatar ? (
                          <img src={emp.avatar} alt={`${emp.firstName} ${emp.lastName}`} className="w-12 h-12 rounded-full object-cover ring-2 ring-white shadow-sm flex-shrink-0" />
                        ) : (
                          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm`}>
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-thb-text-primary text-sm truncate">
                            {emp.firstName} {emp.lastName}
                          </h3>
                          <span className="text-[11px] font-mono font-medium text-thb-text-muted bg-slate-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                            {emp.employeeId}
                          </span>
                        </div>
                        {/* Quick Action Menu */}
                        <div className="relative" ref={actionMenuOpen === emp.id ? actionMenuRef : null}>
                          <button
                            onClick={() => setActionMenuOpen(actionMenuOpen === emp.id ? null : emp.id)}
                            className="p-1 rounded-lg text-thb-text-muted hover:text-thb-text-primary hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <FiMoreVertical className="w-4 h-4" />
                          </button>
                          {actionMenuOpen === emp.id && (
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl border border-thb-border shadow-lg py-1.5 z-50 animate-fade-in">
                              <button
                                onClick={() => { router.push(`/employees/${emp.id}`); setActionMenuOpen(null); }}
                                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-thb-text-secondary hover:bg-slate-50 hover:text-blue-600 transition-colors"
                              >
                                <FiEye className="w-4 h-4" /> View
                              </button>
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => { handleOpenEditForm(emp); setActionMenuOpen(null); }}
                                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-thb-text-secondary hover:bg-slate-50 hover:text-amber-600 transition-colors"
                                  >
                                    <FiEdit2 className="w-4 h-4" /> Edit
                                  </button>
                                  <div className="my-1 border-t border-thb-border" />
                                  <button
                                    onClick={() => { setDeleteConfirmId(emp.id); setActionMenuOpen(null); }}
                                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    <FiTrash2 className="w-4 h-4" /> Terminate
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Details */}
                    <div className="px-5 pb-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-thb-text-secondary">
                        <FiMail className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                      {emp.designation && (
                        <div className="flex items-center gap-2 text-xs text-thb-text-secondary">
                          <FiShield className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                          <span className="truncate">{emp.designation.title}</span>
                        </div>
                      )}
                      {emp.department && (
                        <div className="flex items-center gap-2 text-xs text-thb-text-secondary">
                          <FiActivity className="w-3.5 h-3.5 text-thb-text-muted flex-shrink-0" />
                          <span className="truncate">{emp.department.name}</span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="px-5 py-3 border-t border-thb-border bg-slate-50/50 flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1.5 ${statusBadge.className}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                        {statusBadge.label}
                      </span>
                      <span className="text-[11px] text-thb-text-muted">
                        Joined {formatDate(emp.dateOfJoining)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      )}

      {/* Pagination for Grid View */}
      {viewMode === 'grid' && pagination.totalPages > 1 && (
        <div className="thb-card">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm text-thb-text-muted">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => fetchEmployees(pagination.page - 1)} disabled={pagination.page <= 1} className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                const p = i + 1;
                return (
                  <button key={p} onClick={() => fetchEmployees(p)} className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${p === pagination.page ? 'bg-blue-500 text-white shadow-sm' : 'text-thb-text-secondary hover:bg-slate-50 border border-thb-border'}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => fetchEmployees(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="p-2 rounded-lg border border-thb-border text-thb-text-secondary hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <FiChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
