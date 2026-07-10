'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiUserCheck,
  FiArrowLeft,
  FiUser,
  FiCalendar,
  FiFileText,
  FiRefreshCw,
  FiCheckCircle,
  FiAlertCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'thb-badge thb-badge-warning',
    approved: 'thb-badge thb-badge-success',
    rejected: 'thb-badge thb-badge-error',
    cancelled: 'thb-badge thb-badge-info',
  };
  return map[status] || 'thb-badge thb-badge-info';
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
];

const DESIGNATIONS = [
  { value: 'intern', label: 'Intern' },
  { value: 'junior', label: 'Junior Engineer' },
  { value: 'engineer', label: 'Software Engineer' },
  { value: 'senior', label: 'Senior Engineer' },
  { value: 'lead', label: 'Team Lead' },
  { value: 'manager', label: 'Manager' },
  { value: 'director', label: 'Director' },
];

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
];

interface RejoinRecord {
  id: string;
  employeeName: string;
  previousCode: string;
  newCode: string;
  rejoinDate: string;
  department: string;
  status: string;
  createdAt: string;
}

const initialForm = {
  previousEmployeeId: '',
  previousEmployeeCode: '',
  previousDepartment: '',
  previousDesignation: '',
  rejoinDate: new Date().toISOString().split('T')[0],
  newDepartment: '',
  newDesignation: '',
  newEmployeeCode: '',
  employmentType: 'full_time',
  reportingManager: '',
  serviceContinuity: true,
  leaveBalanceCarryForward: true,
  gratuityContinuity: true,
  rejoinReason: '',
  hrComments: '',
};

export default function RejoinPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isAdmin = ['super_admin', 'tenant_admin', 'admin'].includes(user?.role || '');

  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [records, setRecords] = useState<RejoinRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const updateField = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handlePreviousEmployeeSelect = (employeeId: string) => {
    updateField('previousEmployeeId', employeeId);
    if (employeeId) {
      // Mock auto-fill
      updateField('previousEmployeeCode', employeeId.toUpperCase());
      updateField('previousDepartment', 'Engineering');
      updateField('previousDesignation', 'Software Engineer');
    } else {
      updateField('previousEmployeeCode', '');
      updateField('previousDepartment', '');
      updateField('previousDesignation', '');
    }
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/employees/rejoin?limit=50', { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setRecords(data.rejoins || data.data || []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const validate = (): string | null => {
    if (!form.previousEmployeeId) return 'Please select the previous employee record';
    if (!form.rejoinDate) return 'Rejoin Date is required';
    if (!form.newDepartment) return 'New Department is required';
    if (!form.newDesignation) return 'New Designation is required';
    if (!form.rejoinReason.trim() || form.rejoinReason.trim().length < 20) return 'Rejoin reason must be at least 20 characters';
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) { toast.error(error); return; }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        previousEmployeeId: form.previousEmployeeId,
        rejoinDate: form.rejoinDate,
        newDepartment: form.newDepartment,
        newDesignation: form.newDesignation,
        newEmployeeCode: form.newEmployeeCode.trim() || null,
        employmentType: form.employmentType,
        reportingManager: form.reportingManager.trim() || null,
        serviceContinuity: form.serviceContinuity,
        leaveBalanceCarryForward: form.leaveBalanceCarryForward,
        gratuityContinuity: form.gratuityContinuity,
        rejoinReason: form.rejoinReason.trim(),
        hrComments: form.hrComments.trim() || null,
      };

      const res = await fetch('/api/employees/rejoin', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit rejoin request');

      toast.success('Rejoin request submitted successfully');
      setForm(initialForm);
      fetchRecords();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit rejoin request');
    } finally {
      setSubmitting(false);
    }
  };

  const deptLabel = (v: string) => DEPARTMENTS.find(d => d.value === v)?.label || v;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/employees')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FiUserCheck className="w-6 h-6 text-emerald-500" />
            Rejoin Employee
          </h1>
          <p className="text-sm text-slate-500 mt-1">Process employee rejoining with continuity tracking for service, leaves, and gratuity</p>
        </div>
      </div>

      {/* Previous Employment */}
      <div className="thb-card p-6">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
          <FiUser className="w-5 h-5 text-slate-500" />
          Previous Employment
        </h2>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Select Past Employee *</label>
          <select value={form.previousEmployeeId} onChange={e => handlePreviousEmployeeSelect(e.target.value)} className="3boxes-input w-full max-w-md">
            <option value="">Select Previously Employed</option>
            <option value="ex-001">EX-001 — Amit Sharma (Resigned)</option>
            <option value="ex-002">EX-002 — Priya Patel (Resigned)</option>
            <option value="ex-003">EX-003 — Rahul Verma (Terminated)</option>
            <option value="ex-004">EX-004 — Kavitha Nair (Resigned)</option>
          </select>
        </div>
        {form.previousEmployeeId && (
          <div className="mt-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Previous Details</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><span className="text-slate-500">Employee Code:</span> <span className="font-medium text-slate-700">{form.previousEmployeeCode}</span></div>
              <div><span className="text-slate-500">Department:</span> <span className="font-medium text-slate-700">{form.previousDepartment}</span></div>
              <div><span className="text-slate-500">Designation:</span> <span className="font-medium text-slate-700">{form.previousDesignation}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Rejoin Details */}
      <div className="thb-card p-6">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
          <FiCalendar className="w-5 h-5 text-violet-500" />
          Rejoin Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><FiCalendar className="w-3 h-3" /> Rejoin Date *</label>
            <input type="date" value={form.rejoinDate} onChange={e => updateField('rejoinDate', e.target.value)} className="3boxes-input w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New Department *</label>
            <select value={form.newDepartment} onChange={e => updateField('newDepartment', e.target.value)} className="3boxes-input w-full">
              <option value="">Select Department</option>
              {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New Designation *</label>
            <select value={form.newDesignation} onChange={e => updateField('newDesignation', e.target.value)} className="3boxes-input w-full">
              <option value="">Select Designation</option>
              {DESIGNATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New Employee Code</label>
            <input type="text" value={form.newEmployeeCode} onChange={e => updateField('newEmployeeCode', e.target.value)} className="3boxes-input w-full" placeholder="Auto-generated if empty" />
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

      {/* Continuity */}
      <div className="thb-card p-6">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
          <FiCheckCircle className="w-5 h-5 text-emerald-500" />
          Continuity Options
        </h2>
        <div className="space-y-3">
          <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={form.serviceContinuity} onChange={e => updateField('serviceContinuity', e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5" />
            <div><strong>Service Continuity</strong><p className="text-xs text-slate-400 mt-0.5">Count previous service period towards total tenure for benefits and gratuity calculation</p></div>
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={form.leaveBalanceCarryForward} onChange={e => updateField('leaveBalanceCarryForward', e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5" />
            <div><strong>Leave Balance Carry Forward</strong><p className="text-xs text-slate-400 mt-0.5">Carry forward unused leave balance from previous employment period</p></div>
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={form.gratuityContinuity} onChange={e => updateField('gratuityContinuity', e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mt-0.5" />
            <div><strong>Gratuity Continuity</strong><p className="text-xs text-slate-400 mt-0.5">Continue gratuity accumulation from previous employment without reset</p></div>
          </label>
        </div>
        {!form.serviceContinuity && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-700">
              <FiAlertCircle className="w-4 h-4 inline mr-1" />
              Without service continuity, the employee will be treated as a new hire for tenure-based benefits and gratuity calculations.
            </p>
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="thb-card p-6">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
          <FiFileText className="w-5 h-5 text-slate-500" />
          Comments
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Rejoin Reason * <span className="font-normal text-slate-400">(min 20 chars)</span></label>
            <textarea value={form.rejoinReason} onChange={e => updateField('rejoinReason', e.target.value)} className="3boxes-input w-full" rows={3} placeholder="Describe the reason for rejoining the organization..." />
            <p className="text-[10px] text-slate-400 mt-0.5">{form.rejoinReason.length}/20 min characters</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">HR Comments</label>
            <textarea value={form.hrComments} onChange={e => updateField('hrComments', e.target.value)} className="3boxes-input w-full" rows={3} placeholder="Any additional comments from HR..." />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button onClick={() => router.push('/employees')} className="3boxes-btn-secondary flex items-center gap-2">
          <FiArrowLeft className="w-4 h-4" /> Cancel
        </button>
        <button onClick={handleSubmit} disabled={submitting} className="3boxes-btn-primary flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700">
          {submitting ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : <FiUserCheck className="w-4 h-4" />}
          {submitting ? 'Processing...' : 'Submit Rejoin Request'}
        </button>
      </div>

      {/* Rejoin Records */}
      <div className="thb-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <FiUserCheck className="w-4 h-4 text-emerald-500" />
            Rejoin Requests
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Employee</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Previous Code</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">New Code</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Rejoin Date</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Department</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12">
                  <FiUserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500">No rejoin requests yet</p>
                  <p className="text-xs text-slate-400 mt-1">Submit a rejoin request using the form above</p>
                </td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{r.employeeName}</td>
                  <td className="px-4 py-3 text-slate-600">{r.previousCode}</td>
                  <td className="px-4 py-3 text-slate-600">{r.newCode}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(r.rejoinDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{deptLabel(r.department)}</td>
                  <td className="px-4 py-3"><span className={getStatusBadge(r.status)}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
