'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUserPlus,
  FiUser,
  FiMail,
  FiPhone,
  FiCalendar,
  FiBriefcase,
  FiDollarSign,
  FiCreditCard,
  FiRefreshCw,
  FiArrowLeft,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const DEPARTMENTS = [
  { value: 'engineering', label: 'Engineering' },
  { value: 'product', label: 'Product' },
  { value: 'design', label: 'Design' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'sales', label: 'Sales' },
  { value: 'hr', label: 'Human Resources' },
  { value: 'finance', label: 'Finance' },
  { value: 'operations', label: 'Operations' },
  { value: 'support', label: 'Customer Support' },
  { value: 'legal', label: 'Legal' },
];

const DESIGNATIONS = [
  { value: 'intern', label: 'Intern' },
  { value: 'junior', label: 'Junior Engineer' },
  { value: 'engineer', label: 'Software Engineer' },
  { value: 'senior', label: 'Senior Engineer' },
  { value: 'lead', label: 'Team Lead' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior_manager', label: 'Senior Manager' },
  { value: 'director', label: 'Director' },
  { value: 'vp', label: 'Vice President' },
  { value: 'c_level', label: 'C-Level Executive' },
];

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
];

const PAY_MODES = [
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
];

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: 'male',
  employeeCode: '',
  department: '',
  designation: '',
  dateOfJoining: new Date().toISOString().split('T')[0],
  employmentType: 'full_time',
  reportingManager: '',
  ctc: '',
  basicSalary: '',
  payMode: 'bank',
  bankAccountNo: '',
  bankName: '',
  ifscCode: '',
};

export default function AddEmployeePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin'].includes(user?.role || '');

  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const validate = (): string | null => {
    if (!form.firstName.trim()) return 'First Name is required';
    if (!form.lastName.trim()) return 'Last Name is required';
    if (!form.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Invalid email format';
    if (!form.department) return 'Department is required';
    if (!form.designation) return 'Designation is required';
    if (!form.dateOfJoining) return 'Date of Joining is required';
    if (form.ctc && Number(form.ctc) < 0) return 'CTC cannot be negative';
    if (form.basicSalary && Number(form.basicSalary) < 0) return 'Basic Salary cannot be negative';
    if (form.payMode === 'bank') {
      if (!form.bankAccountNo.trim()) return 'Bank Account Number is required for bank transfer';
      if (!form.bankName.trim()) return 'Bank Name is required for bank transfer';
      if (!form.ifscCode.trim()) return 'IFSC Code is required for bank transfer';
    }
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender,
        employeeCode: form.employeeCode.trim() || undefined,
        department: form.department,
        designation: form.designation,
        dateOfJoining: form.dateOfJoining,
        employmentType: form.employmentType,
        reportingManager: form.reportingManager.trim() || null,
        ctc: form.ctc ? Number(form.ctc) : null,
        basicSalary: form.basicSalary ? Number(form.basicSalary) : null,
        payMode: form.payMode,
        bankAccountNo: form.bankAccountNo.trim() || null,
        bankName: form.bankName.trim() || null,
        ifscCode: form.ifscCode.trim() || null,
      };

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add employee');

      toast.success('Employee added successfully');
      router.push('/employees');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add employee');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <FiUserPlus className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">You do not have permission to add employees.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/employees')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FiUserPlus className="w-6 h-6 text-emerald-500" />
            Add New Employee
          </h1>
          <p className="text-sm text-slate-500 mt-1">Create a new employee record with personal, employment, and compensation details</p>
        </div>
      </div>

      {/* Personal Information */}
      <div className="thb-card p-6">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
          <FiUser className="w-5 h-5 text-cyan-500" />
          Personal Information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">First Name *</label>
            <input type="text" value={form.firstName} onChange={e => updateField('firstName', e.target.value)} className="3boxes-input w-full" placeholder="Enter first name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Last Name *</label>
            <input type="text" value={form.lastName} onChange={e => updateField('lastName', e.target.value)} className="3boxes-input w-full" placeholder="Enter last name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><FiMail className="w-3 h-3" /> Email *</label>
            <input type="email" value={form.email} onChange={e => updateField('email', e.target.value)} className="3boxes-input w-full" placeholder="employee@company.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><FiPhone className="w-3 h-3" /> Phone</label>
            <input type="tel" value={form.phone} onChange={e => updateField('phone', e.target.value)} className="3boxes-input w-full" placeholder="+91 9876543210" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><FiCalendar className="w-3 h-3" /> Date of Birth</label>
            <input type="date" value={form.dateOfBirth} onChange={e => updateField('dateOfBirth', e.target.value)} className="3boxes-input w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Gender</label>
            <select value={form.gender} onChange={e => updateField('gender', e.target.value)} className="3boxes-input w-full">
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employment Details */}
      <div className="thb-card p-6">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
          <FiBriefcase className="w-5 h-5 text-violet-500" />
          Employment Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Employee Code</label>
            <input type="text" value={form.employeeCode} onChange={e => updateField('employeeCode', e.target.value)} className="3boxes-input w-full" placeholder="Auto-generated if left empty" />
            <p className="text-[10px] text-slate-400 mt-0.5">Leave empty for auto-generation</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Department *</label>
            <select value={form.department} onChange={e => updateField('department', e.target.value)} className="3boxes-input w-full">
              <option value="">Select Department</option>
              {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Designation *</label>
            <select value={form.designation} onChange={e => updateField('designation', e.target.value)} className="3boxes-input w-full">
              <option value="">Select Designation</option>
              {DESIGNATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><FiCalendar className="w-3 h-3" /> Date of Joining *</label>
            <input type="date" value={form.dateOfJoining} onChange={e => updateField('dateOfJoining', e.target.value)} className="3boxes-input w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Employment Type</label>
            <select value={form.employmentType} onChange={e => updateField('employmentType', e.target.value)} className="3boxes-input w-full">
              {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Reporting Manager</label>
            <input type="text" value={form.reportingManager} onChange={e => updateField('reportingManager', e.target.value)} className="3boxes-input w-full" placeholder="Enter manager name" />
          </div>
        </div>
      </div>

      {/* Compensation */}
      <div className="thb-card p-6">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
          <FiDollarSign className="w-5 h-5 text-emerald-500" />
          Compensation & Banking
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">CTC (Annual)</label>
            <input type="number" value={form.ctc} onChange={e => updateField('ctc', e.target.value)} className="3boxes-input w-full" placeholder="0.00" min="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Basic Salary (Monthly)</label>
            <input type="number" value={form.basicSalary} onChange={e => updateField('basicSalary', e.target.value)} className="3boxes-input w-full" placeholder="0.00" min="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Pay Mode</label>
            <select value={form.payMode} onChange={e => updateField('payMode', e.target.value)} className="3boxes-input w-full">
              {PAY_MODES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {form.payMode === 'bank' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><FiCreditCard className="w-3 h-3" /> Bank Account Number *</label>
              <input type="text" value={form.bankAccountNo} onChange={e => updateField('bankAccountNo', e.target.value)} className="3boxes-input w-full" placeholder="Enter account number" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bank Name *</label>
              <input type="text" value={form.bankName} onChange={e => updateField('bankName', e.target.value)} className="3boxes-input w-full" placeholder="Enter bank name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">IFSC Code *</label>
              <input type="text" value={form.ifscCode} onChange={e => updateField('ifscCode', e.target.value)} className="3boxes-input w-full" placeholder="Enter IFSC code" />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button onClick={() => router.push('/employees')} className="3boxes-btn-secondary flex items-center gap-2">
          <FiArrowLeft className="w-4 h-4" /> Cancel
        </button>
        <button onClick={handleSubmit} disabled={submitting} className="3boxes-btn-primary flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700">
          {submitting ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiUserPlus className="w-4 h-4" />}
          {submitting ? 'Adding Employee...' : 'Add Employee'}
        </button>
      </div>
    </div>
  );
}
