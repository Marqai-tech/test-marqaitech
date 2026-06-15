'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FiArrowLeft,
  FiUser,
  FiMail,
  FiPhone,
  FiMapPin,
  FiCalendar,
  FiBriefcase,
  FiDollarSign,
  FiFileText,
  FiClock,
  FiHeart,
  FiShield,
  FiUpload,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// ─── Employee Policies Tab Component ───
function EmployeePoliciesTab({ employeeId }: { employeeId: string }) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'tenant_admin' || user?.role === 'hr_admin';
  const [policies, setPolicies] = useState<{ leave?: Record<string, unknown>; attendance?: Record<string, unknown>; travel?: Record<string, unknown>; salaryStructure?: Record<string, unknown>; leavePolicyId?: string | null; attendancePolicyId?: string | null; travelPolicyId?: string | null; salaryStructureId?: string | null } | null>(null);
  const [leavePolicies, setLeavePolicies] = useState<Array<{ id: string; title: string; version: string; effectiveDate?: string | null }>>([]);
  const [attendancePolicies, setAttendancePolicies] = useState<Array<{ id: string; title: string; version: string; effectiveDate?: string | null }>>([]);
  const [travelPolicies, setTravelPolicies] = useState<Array<{ id: string; title: string; version: string; effectiveDate?: string | null }>>([]);
  const [salaryStructures, setSalaryStructures] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    try {
      const [polRes, lpRes, apRes, tpRes, ssRes] = await Promise.allSettled([
        fetch(`/api/employees/${employeeId}/policies`, { headers: getAuthHeaders() }),
        fetch('/api/policies?category=leave', { headers: getAuthHeaders() }),
        fetch('/api/policies?category=attendance', { headers: getAuthHeaders() }),
        fetch('/api/policies?category=travel', { headers: getAuthHeaders() }),
        fetch('/api/salary-structures', { headers: getAuthHeaders() }),
      ]);
      if (polRes.status === 'fulfilled' && polRes.value.ok) { const d = await polRes.value.json(); setPolicies(d.data); }
      if (lpRes.status === 'fulfilled' && lpRes.value.ok) { const d = await lpRes.value.json(); setLeavePolicies((d.policies || d.data || [])); }
      if (apRes.status === 'fulfilled' && apRes.value.ok) { const d = await apRes.value.json(); setAttendancePolicies((d.policies || d.data || [])); }
      if (tpRes.status === 'fulfilled' && tpRes.value.ok) { const d = await tpRes.value.json(); setTravelPolicies((d.policies || d.data || [])); }
      if (ssRes.status === 'fulfilled' && ssRes.value.ok) { const d = await ssRes.value.json(); setSalaryStructures((d.salaryStructures || d.data || [])); }
    } catch { /* silently */ }
  }, [employeeId]);

  useEffect(() => { queueMicrotask(() => fetchPolicies()); }, [fetchPolicies]);

  const handleSave = async (field: string, value: string | null) => {
    setSaving(field);
    try {
      const res = await fetch(`/api/employees/${employeeId}/policies`, {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) { toast.success('Updated'); fetchPolicies(); }
      else { toast.error('Failed'); }
    } catch { toast.error('Failed'); }
    finally { setSaving(null); }
  };

  const policyDropdown = (label: string, field: string, items: Array<{ id: string; title: string; version: string; effectiveDate?: string | null }>, currentId: string | null | undefined, icon: React.ReactNode) => (
    <div className="nexus-card p-4">
      <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2">{icon}{label}</h4>
      <select
        value={currentId || ''}
        onChange={e => handleSave(field, e.target.value || null)}
        disabled={!isAdmin || saving === field}
        className="w-full px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
      >
        <option value="">— Not Assigned —</option>
        {items.map(p => <option key={p.id} value={p.id}>{p.title} (v{p.version})</option>)}
      </select>
      {currentId && items.find(p => p.id === currentId) && (
        <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-nexus-border text-xs text-nexus-text-secondary">
          <p><span className="font-medium">Title:</span> {items.find(p => p.id === currentId)?.title}</p>
          <p><span className="font-medium">Version:</span> {items.find(p => p.id === currentId)?.version}</p>
          {items.find(p => p.id === currentId)?.effectiveDate && <p><span className="font-medium">Effective:</span> {new Date(items.find(p => p.id === currentId)!.effectiveDate!).toLocaleDateString()}</p>}
        </div>
      )}
      {saving === field && <p className="text-xs text-blue-500 mt-2">Saving...</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-nexus-text-primary flex items-center gap-2"><FiShield className="w-4 h-4 text-violet-500" />Policy & Structure Mappings</h3>
      {!isAdmin && <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700">Only admins can modify policy mappings.</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {policyDropdown('Leave Policy', 'leavePolicyId', leavePolicies, policies?.leavePolicyId, <FiCalendar className="w-4 h-4 text-blue-500" />)}
        {policyDropdown('Attendance Policy', 'attendancePolicyId', attendancePolicies, policies?.attendancePolicyId, <FiClock className="w-4 h-4 text-emerald-500" />)}
        {policyDropdown('Travel Policy', 'travelPolicyId', travelPolicies, policies?.travelPolicyId, <FiBriefcase className="w-4 h-4 text-amber-500" />)}
        <div className="nexus-card p-4">
          <h4 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2"><FiDollarSign className="w-4 h-4 text-emerald-500" />Salary Structure</h4>
          <select
            value={policies?.salaryStructureId || ''}
            onChange={e => handleSave('salaryStructureId', e.target.value || null)}
            disabled={!isAdmin || saving === 'salaryStructureId'}
            className="w-full px-3 py-2 rounded-lg border border-nexus-border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
          >
            <option value="">— Not Assigned —</option>
            {salaryStructures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {saving === 'salaryStructureId' && <p className="text-xs text-blue-500 mt-2">Saving...</p>}
        </div>
      </div>
    </div>
  );
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

interface EmployeeData {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  department?: { id: string; name: string } | null;
  designation?: { id: string; title: string } | null;
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
  bloodGroup?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankIfscCode?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  salary?: number | null;
  salaryCurrency?: string;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  leaveBalances?: Array<{
    id: string;
    total: number;
    used: number;
    remaining: number;
    year: number;
    leaveType: { id: string; name: string; code: string };
  }>;
  dependents?: Array<{ id: string; name: string; relation: string; dateOfBirth?: string | null; gender?: string | null }>;
  qualifications?: Array<{ id: string; degree: string; institution: string; year: number; percentage?: number | null }>;
  experiences?: Array<{ id: string; company: string; designation: string; startDate: string; endDate?: string | null; isCurrent: boolean }>;
  skills?: Array<{ id: string; skill: string; level: string; yearsOfExp?: number | null }>;
  documents?: Array<{ id: string; name: string; type: string; fileUrl?: string | null; status: string; uploadedAt: string; expiryDate?: string | null }>;
  assetAssignments?: Array<{ id: string; status: string; assignedDate: string; asset: { id: string; name: string; assetTag: string; category: string } }>;
}

const tabs = ['Overview', 'Personal', 'Employment', 'Documents', 'Leave', 'Attendance', 'Payroll', 'Health', 'Policies'] as const;
type TabName = typeof tabs[number];

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabName>('Overview');

  const [attendance, setAttendance] = useState<Array<{ id: string; date: string; checkIn?: string | null; checkOut?: string | null; workHours?: number | null; overtime?: number | null; status: string }>>([]);
  const [payrolls, setPayrolls] = useState<Array<{ id: string; month: number; year: number; grossSalary: number; totalDeductions: number; netSalary: number; status: string; paidDate?: string | null }>>([]);
  const [leaveRequests, setLeaveRequests] = useState<Array<{ id: string; startDate: string; endDate: string; reason?: string | null; status: string; halfDay: boolean; leaveType: { name: string } }>>([]);
  const [now] = useState(() => Date.now());

  const fetchEmployee = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/employees/${id}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch employee');
      const data = await res.json();
      setEmployee(data.employee);
    } catch (err) {
      console.error('Failed to load employee details:', err);
      // Don't show error toast - the page shows a "not found" state that handles this gracefully
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchRelatedData = useCallback(async () => {
    if (!employee) return;
    try {
      const headers = getAuthHeaders();
      const [attRes, payRes, leaveRes] = await Promise.allSettled([
        fetch(`/api/attendance?employeeId=${employee.id}&limit=30`, { headers }),
        fetch(`/api/payroll?employeeId=${employee.id}&limit=12`, { headers }),
        fetch(`/api/leave?employeeId=${employee.id}&limit=20`, { headers }),
      ]);
      if (attRes.status === 'fulfilled' && attRes.value.ok) {
        const d = await attRes.value.json();
        setAttendance(d.attendance || []);
      }
      if (payRes.status === 'fulfilled' && payRes.value.ok) {
        const d = await payRes.value.json();
        setPayrolls(d.payrolls || []);
      }
      if (leaveRes.status === 'fulfilled' && leaveRes.value.ok) {
        const d = await leaveRes.value.json();
        setLeaveRequests(d.leaveRequests || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [employee]);

  useEffect(() => {
    queueMicrotask(() => fetchEmployee());
  }, [fetchEmployee]);

  useEffect(() => {
    if (employee) queueMicrotask(() => fetchRelatedData());
  }, [employee, fetchRelatedData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="nexus-card p-6 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-slate-200 rounded-full" />
            <div className="space-y-2"><div className="h-5 w-48 bg-slate-200 rounded" /><div className="h-3 w-32 bg-slate-200 rounded" /></div>
          </div>
        </div>
        <div className="nexus-card p-6 animate-pulse"><div className="h-8 bg-slate-200 rounded w-full" /></div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-12">
        <FiUser className="w-12 h-12 text-nexus-text-muted mx-auto mb-4" />
        <p className="text-nexus-text-secondary font-medium">Employee not found</p>
        <button onClick={() => router.push('/employees')} className="mt-4 text-blue-500 hover:text-blue-700 text-sm font-medium">Back to Employees</button>
      </div>
    );
  }

  const badge = getStatusBadge(employee.status);
  const initials = `${employee.firstName[0]}${employee.lastName[0]}`;
  const daysEmployed = Math.floor((now - new Date(employee.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24));
  const totalLeaveBalance = employee.leaveBalances?.reduce((sum, lb) => sum + lb.remaining, 0) || 0;
  const attendanceRate = attendance.length > 0 ? Math.round((attendance.filter(a => ['present', 'late'].includes(a.status)).length / attendance.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={() => router.push('/employees')} className="inline-flex items-center gap-2 text-sm text-nexus-text-secondary hover:text-nexus-text-primary transition-colors">
        <FiArrowLeft className="w-4 h-4" />
        Back to Employees
      </button>

      {/* Employee Header */}
      <div className="nexus-card p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {employee.avatar ? (
            <img src={employee.avatar} alt="" className="w-16 h-16 rounded-full object-cover ring-4 ring-slate-100" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold ring-4 ring-slate-100 flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-nexus-text-primary">{employee.firstName} {employee.lastName}</h1>
              <span className={badge.className}>{badge.label}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-nexus-text-secondary">
              <span className="flex items-center gap-1"><FiBriefcase className="w-3.5 h-3.5" />{employee.employeeId}</span>
              <span className="flex items-center gap-1"><FiMail className="w-3.5 h-3.5" />{employee.email}</span>
              <span>{employee.department?.name} · {employee.designation?.title}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="nexus-card">
        <div className="border-b border-nexus-border overflow-x-auto">
          <nav className="flex -mb-px">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-nexus-text-secondary hover:text-nexus-text-primary hover:border-slate-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* ── Overview Tab ── */}
          {activeTab === 'Overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <p className="text-xs font-medium text-blue-600 mb-1">Days Employed</p>
                  <p className="text-2xl font-bold text-blue-700">{daysEmployed}</p>
                  <p className="text-xs text-blue-500 mt-1">Since {formatDate(employee.dateOfJoining)}</p>
                </div>
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                  <p className="text-xs font-medium text-amber-600 mb-1">Leave Balance</p>
                  <p className="text-2xl font-bold text-amber-700">{totalLeaveBalance}</p>
                  <p className="text-xs text-amber-500 mt-1">Days remaining</p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                  <p className="text-xs font-medium text-emerald-600 mb-1">Attendance Rate</p>
                  <p className="text-2xl font-bold text-emerald-700">{attendanceRate}%</p>
                  <p className="text-xs text-emerald-500 mt-1">Last 30 days</p>
                </div>
              </div>

              {/* Quick Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="nexus-card p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-nexus-text-primary">Contact Information</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm"><FiMail className="w-4 h-4 text-nexus-text-muted" /><span className="text-nexus-text-secondary">{employee.email}</span></div>
                    <div className="flex items-center gap-2 text-sm"><FiPhone className="w-4 h-4 text-nexus-text-muted" /><span className="text-nexus-text-secondary">{employee.phone || '—'}</span></div>
                    <div className="flex items-center gap-2 text-sm"><FiMapPin className="w-4 h-4 text-nexus-text-muted" /><span className="text-nexus-text-secondary">{[employee.city, employee.state, employee.country].filter(Boolean).join(', ') || '—'}</span></div>
                  </div>
                </div>
                <div className="nexus-card p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-nexus-text-primary">Employment</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm"><FiBriefcase className="w-4 h-4 text-nexus-text-muted" /><span className="text-nexus-text-secondary">{employee.department?.name || '—'}</span></div>
                    <div className="flex items-center gap-2 text-sm"><FiUser className="w-4 h-4 text-nexus-text-muted" /><span className="text-nexus-text-secondary">{employee.designation?.title || '—'}</span></div>
                    <div className="flex items-center gap-2 text-sm"><FiCalendar className="w-4 h-4 text-nexus-text-muted" /><span className="text-nexus-text-secondary">Joined {formatDate(employee.dateOfJoining)}</span></div>
                  </div>
                </div>
              </div>

              {/* Skills */}
              {employee.skills && employee.skills.length > 0 && (
                <div className="nexus-card p-4">
                  <h3 className="text-sm font-semibold text-nexus-text-primary mb-3">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {employee.skills.map(s => (
                      <span key={s.id} className="nexus-badge nexus-badge-info">{s.skill} · {s.level}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Personal Tab ── */}
          {activeTab === 'Personal' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: 'First Name', value: employee.firstName },
                  { label: 'Last Name', value: employee.lastName },
                  { label: 'Email', value: employee.email },
                  { label: 'Phone', value: employee.phone },
                  { label: 'Date of Birth', value: formatDate(employee.dateOfBirth) },
                  { label: 'Gender', value: employee.gender },
                  { label: 'Marital Status', value: employee.maritalStatus },
                  { label: 'Nationality', value: employee.nationality },
                  { label: 'Blood Group', value: employee.bloodGroup },
                  { label: 'Address', value: employee.address },
                  { label: 'City', value: employee.city },
                  { label: 'State', value: employee.state },
                  { label: 'ZIP Code', value: employee.zipCode },
                  { label: 'Country', value: employee.country },
                ].map(field => (
                  <div key={field.label}>
                    <p className="text-xs font-medium text-nexus-text-muted mb-1">{field.label}</p>
                    <p className="text-sm font-medium text-nexus-text-primary">{field.value || '—'}</p>
                  </div>
                ))}
              </div>

              {/* Emergency Contact */}
              <div className="nexus-card p-4">
                <h3 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2"><FiHeart className="w-4 h-4 text-rose-500" />Emergency Contact</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><p className="text-xs font-medium text-nexus-text-muted mb-1">Name</p><p className="text-sm font-medium text-nexus-text-primary">{employee.emergencyContactName || '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted mb-1">Phone</p><p className="text-sm font-medium text-nexus-text-primary">{employee.emergencyContactPhone || '—'}</p></div>
                </div>
              </div>

              {/* Dependents */}
              {employee.dependents && employee.dependents.length > 0 && (
                <div className="nexus-card p-4">
                  <h3 className="text-sm font-semibold text-nexus-text-primary mb-3">Dependents</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-nexus-border"><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Name</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Relation</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">DOB</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Gender</th></tr></thead>
                      <tbody>
                        {employee.dependents.map(dep => (
                          <tr key={dep.id} className="border-b border-nexus-border/50"><td className="py-2 text-sm">{dep.name}</td><td className="py-2 text-sm text-nexus-text-secondary">{dep.relation}</td><td className="py-2 text-sm text-nexus-text-secondary">{formatDate(dep.dateOfBirth)}</td><td className="py-2 text-sm text-nexus-text-secondary">{dep.gender || '—'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Employment Tab ── */}
          {activeTab === 'Employment' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: 'Employee ID', value: employee.employeeId },
                  { label: 'Department', value: employee.department?.name },
                  { label: 'Designation', value: employee.designation?.title },
                  { label: 'Branch', value: employee.branch?.name },
                  { label: 'Date of Joining', value: formatDate(employee.dateOfJoining) },
                  { label: 'Status', value: badge.label },
                ].map(field => (
                  <div key={field.label}>
                    <p className="text-xs font-medium text-nexus-text-muted mb-1">{field.label}</p>
                    <p className="text-sm font-medium text-nexus-text-primary">{field.value || '—'}</p>
                  </div>
                ))}
              </div>

              {/* Salary Info */}
              <div className="nexus-card p-4">
                <h3 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2"><FiDollarSign className="w-4 h-4 text-emerald-500" />Salary Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><p className="text-xs font-medium text-nexus-text-muted mb-1">Salary</p><p className="text-sm font-medium text-nexus-text-primary">{employee.salary ? `${employee.salaryCurrency || 'USD'} ${employee.salary.toLocaleString()}` : '—'}</p></div>
                  <div><p className="text-xs font-medium text-nexus-text-muted mb-1">Currency</p><p className="text-sm font-medium text-nexus-text-primary">{employee.salaryCurrency || 'USD'}</p></div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="nexus-card p-4">
                <h3 className="text-sm font-semibold text-nexus-text-primary mb-3 flex items-center gap-2"><FiShield className="w-4 h-4 text-violet-500" />Bank Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { label: 'Bank Name', value: employee.bankName },
                    { label: 'Account No', value: employee.bankAccountNo },
                    { label: 'IFSC Code', value: employee.bankIfscCode },
                    { label: 'PAN Number', value: employee.panNumber },
                    { label: 'Aadhaar Number', value: employee.aadhaarNumber },
                  ].map(field => (
                    <div key={field.label}>
                      <p className="text-xs font-medium text-nexus-text-muted mb-1">{field.label}</p>
                      <p className="text-sm font-medium text-nexus-text-primary">{field.value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Experience */}
              {employee.experiences && employee.experiences.length > 0 && (
                <div className="nexus-card p-4">
                  <h3 className="text-sm font-semibold text-nexus-text-primary mb-3">Work Experience</h3>
                  <div className="space-y-3">
                    {employee.experiences.map(exp => (
                      <div key={exp.id} className="p-3 rounded-lg border border-nexus-border">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-nexus-text-primary">{exp.company}</p>
                          {exp.isCurrent && <span className="nexus-badge nexus-badge-success">Current</span>}
                        </div>
                        <p className="text-xs text-nexus-text-secondary mt-1">{exp.designation} · {formatDate(exp.startDate)} – {exp.endDate ? formatDate(exp.endDate) : 'Present'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Documents Tab ── */}
          {activeTab === 'Documents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-nexus-text-primary">Documents</h3>
                <button className="inline-flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors">
                  <FiUpload className="w-3.5 h-3.5" />
                  Upload Document
                </button>
              </div>
              {(!employee.documents || employee.documents.length === 0) ? (
                <div className="text-center py-8">
                  <FiFileText className="w-10 h-10 text-nexus-text-muted mx-auto mb-3" />
                  <p className="text-nexus-text-secondary">No documents uploaded</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-nexus-border"><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Name</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Type</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Status</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Uploaded</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Expiry</th></tr></thead>
                    <tbody>
                      {employee.documents.map(doc => (
                        <tr key={doc.id} className="border-b border-nexus-border/50">
                          <td className="py-2 text-sm font-medium text-nexus-text-primary">{doc.name}</td>
                          <td className="py-2 text-sm text-nexus-text-secondary capitalize">{doc.type.replace('_', ' ')}</td>
                          <td className="py-2"><span className="nexus-badge nexus-badge-success">{doc.status}</span></td>
                          <td className="py-2 text-sm text-nexus-text-secondary">{formatDate(doc.uploadedAt)}</td>
                          <td className="py-2 text-sm text-nexus-text-secondary">{formatDate(doc.expiryDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Leave Tab ── */}
          {activeTab === 'Leave' && (
            <div className="space-y-6">
              {/* Leave Balances */}
              {employee.leaveBalances && employee.leaveBalances.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-nexus-text-primary mb-3">Leave Balances</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {employee.leaveBalances.map(lb => (
                      <div key={lb.id} className="p-4 rounded-xl border border-nexus-border">
                        <p className="text-sm font-medium text-nexus-text-primary">{lb.leaveType.name}</p>
                        <div className="flex items-center justify-between mt-2 text-xs text-nexus-text-secondary">
                          <span>Total: {lb.total}</span>
                          <span>Used: {lb.used}</span>
                          <span>Remaining: {lb.remaining}</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${lb.total > 0 ? (lb.used / lb.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Leave History */}
              <div>
                <h3 className="text-sm font-semibold text-nexus-text-primary mb-3">Leave History</h3>
                {leaveRequests.length === 0 ? (
                  <div className="text-center py-8"><FiCalendar className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" /><p className="text-sm text-nexus-text-muted">No leave requests</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-nexus-border"><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Type</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">From</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">To</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Reason</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Status</th></tr></thead>
                      <tbody>
                        {leaveRequests.map(lr => {
                          const statusMap: Record<string, string> = { pending: 'nexus-badge nexus-badge-warning', approved: 'nexus-badge nexus-badge-success', rejected: 'nexus-badge nexus-badge-error', cancelled: 'bg-slate-100 text-slate-600 nexus-badge' };
                          return (
                            <tr key={lr.id} className="border-b border-nexus-border/50">
                              <td className="py-2 text-sm">{lr.leaveType.name}</td>
                              <td className="py-2 text-sm text-nexus-text-secondary">{formatDate(lr.startDate)}</td>
                              <td className="py-2 text-sm text-nexus-text-secondary">{formatDate(lr.endDate)}</td>
                              <td className="py-2 text-sm text-nexus-text-secondary truncate max-w-[200px]">{lr.reason || '—'}</td>
                              <td className="py-2"><span className={statusMap[lr.status] || 'nexus-badge nexus-badge-info'}>{lr.status}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Attendance Tab ── */}
          {activeTab === 'Attendance' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-nexus-text-primary">Recent Attendance</h3>
              {attendance.length === 0 ? (
                <div className="text-center py-8"><FiClock className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" /><p className="text-sm text-nexus-text-muted">No attendance records</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-nexus-border"><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Date</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Check In</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Check Out</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Work Hours</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Overtime</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Status</th></tr></thead>
                    <tbody>
                      {attendance.map(a => {
                        const statusMap: Record<string, string> = { present: 'nexus-badge nexus-badge-success', absent: 'nexus-badge nexus-badge-error', late: 'bg-orange-50 text-orange-700 nexus-badge', half_day: 'nexus-badge nexus-badge-warning', holiday: 'nexus-badge nexus-badge-info', weekend: 'bg-slate-100 text-slate-600 nexus-badge', on_leave: 'nexus-badge nexus-badge-warning' };
                        return (
                          <tr key={a.id} className="border-b border-nexus-border/50">
                            <td className="py-2 text-sm">{formatDate(a.date)}</td>
                            <td className="py-2 text-sm text-nexus-text-secondary">{a.checkIn ? formatDateTime(a.checkIn) : '—'}</td>
                            <td className="py-2 text-sm text-nexus-text-secondary">{a.checkOut ? formatDateTime(a.checkOut) : '—'}</td>
                            <td className="py-2 text-sm text-nexus-text-secondary">{a.workHours != null ? `${a.workHours}h` : '—'}</td>
                            <td className="py-2 text-sm text-nexus-text-secondary">{a.overtime != null && a.overtime > 0 ? `${a.overtime}h` : '—'}</td>
                            <td className="py-2"><span className={statusMap[a.status] || 'nexus-badge nexus-badge-info'}>{a.status.replace('_', ' ')}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Policies Tab ── */}
          {activeTab === 'Health' && (
            <div className="space-y-4">
              <div className="nexus-card p-6">
                <h3 className="text-lg font-semibold text-nexus-text-primary flex items-center gap-2 mb-2">
                  <FiHeart className="w-5 h-5 text-red-500" />
                  Health History
                </h3>
                <p className="text-xs text-nexus-text-muted mb-6">Employee health information for workplace safety and emergency preparedness.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Blood Group & Vitals */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider">Vitals & Blood</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-muted mb-1">Blood Group</label>
                        <p className="px-3 py-2 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{employee.bloodGroup || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-muted mb-1">Emergency Condition</label>
                        <p className="px-3 py-2 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{(employee as Record<string, unknown>).emergencyMedicalCondition as string || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Medical History */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider">Medical History</h4>
                    <div className="space-y-2">
                      {[
                        { label: 'Chronic Illness', value: (employee as Record<string, unknown>).hasChronicIllness as string, details: (employee as Record<string, unknown>).chronicIllnessDetails as string },
                        { label: 'Allergies', value: (employee as Record<string, unknown>).hasAllergies as string, details: (employee as Record<string, unknown>).allergyDetails as string },
                        { label: 'Disability', value: (employee as Record<string, unknown>).hasDisability as string, details: (employee as Record<string, unknown>).disabilityDetails as string },
                        { label: 'On Medication', value: (employee as Record<string, unknown>).isOnMedication as string, details: (employee as Record<string, unknown>).medicationDetails as string },
                        { label: 'Previous Surgery', value: (employee as Record<string, unknown>).hasHadSurgery as string, details: (employee as Record<string, unknown>).surgeryDetails as string },
                      ].map((item) => (
                        <div key={item.label} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-nexus-border/30">
                          <span className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${item.value === 'yes' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                          <div>
                            <p className="text-xs font-medium text-nexus-text-primary">{item.label}</p>
                            <p className="text-xs text-nexus-text-muted">{item.value === 'yes' ? `Yes — ${item.details || 'No details provided'}` : item.value === 'no' ? 'No' : '—'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Physician & Insurance */}
                  <div className="space-y-3 md:col-span-2">
                    <h4 className="text-xs font-semibold text-nexus-text-muted uppercase tracking-wider">Physician & Insurance</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-muted mb-1">Primary Physician</label>
                        <p className="px-3 py-2 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{(employee as Record<string, unknown>).primaryPhysicianName as string || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-muted mb-1">Physician Phone</label>
                        <p className="px-3 py-2 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{(employee as Record<string, unknown>).primaryPhysicianPhone as string || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-muted mb-1">Insurance Provider</label>
                        <p className="px-3 py-2 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{(employee as Record<string, unknown>).healthInsuranceProvider as string || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-nexus-text-muted mb-1">Policy Number</label>
                        <p className="px-3 py-2 text-sm text-nexus-text-primary bg-slate-50 rounded-lg border border-nexus-border/50">{(employee as Record<string, unknown>).healthInsurancePolicyNo as string || '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'Policies' && <EmployeePoliciesTab employeeId={employee.id} />}

          {/* ── Payroll Tab ── */}
          {activeTab === 'Payroll' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-nexus-text-primary">Recent Payslips</h3>
              {payrolls.length === 0 ? (
                <div className="text-center py-8"><FiDollarSign className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" /><p className="text-sm text-nexus-text-muted">No payroll records</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-nexus-border"><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Month</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Gross Salary</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Deductions</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Net Salary</th><th className="text-left py-2 text-xs font-semibold text-nexus-text-secondary">Status</th></tr></thead>
                    <tbody>
                      {payrolls.map(p => {
                        const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const statusMap: Record<string, string> = { draft: 'nexus-badge nexus-badge-warning', processed: 'nexus-badge nexus-badge-info', paid: 'nexus-badge nexus-badge-success', cancelled: 'nexus-badge nexus-badge-error' };
                        return (
                          <tr key={p.id} className="border-b border-nexus-border/50">
                            <td className="py-2 text-sm font-medium">{months[p.month]} {p.year}</td>
                            <td className="py-2 text-sm text-nexus-text-secondary">${p.grossSalary.toLocaleString()}</td>
                            <td className="py-2 text-sm text-red-500">${p.totalDeductions.toLocaleString()}</td>
                            <td className="py-2 text-sm font-medium text-emerald-600">${p.netSalary.toLocaleString()}</td>
                            <td className="py-2"><span className={statusMap[p.status] || 'nexus-badge nexus-badge-info'}>{p.status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
