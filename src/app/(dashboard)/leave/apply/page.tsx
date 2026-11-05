'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FiCalendar, FiPlus, FiX, FiClock, FiAlertCircle, FiCheck, FiArrowLeft, FiChevronRight,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import ApproverChainPreview from '@/components/ApproverChainPreview';
import TeamLeaveSidebar from '@/components/TeamLeaveSidebar';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface LeaveType { id: string; name: string; code: string; defaultDays: number; isPaid: boolean; }
interface LeaveBalance {
  id: string;
  leaveType: LeaveType;
  total: number;
  used: number;
  remaining: number;
  year: number;
}
interface Employee {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  gender?: string | null;
  employeeStatus?: string;
  dateOfJoining?: string | null;
}
interface Holiday { id: string; name: string; date: string; type: string; }

function getDaysBetween(start: string, end: string, holidaySet: Set<string>) {
  const s = new Date(start), e = new Date(end);
  let count = 0;
  const cursor = new Date(s);
  let guard = 0;
  while (cursor <= e && guard < 4000) {
    guard++;
    const dow = cursor.getUTCDay();
    const dateStr = cursor.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !holidaySet.has(dateStr)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function todayStr() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

export default function ApplyLeavePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState('');

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachmentError('');
    // Validate file types — allow images, PDF, docx
    const allowed = /\.(png|jpg|jpeg|gif|pdf|doc|docx)$/i;
    const valid: File[] = [];
    for (const f of files) {
      if (!allowed.test(f.name)) {
        setAttachmentError(`"${f.name}" is not a supported file type. Only PNG, JPG, PDF, DOC, DOCX allowed.`);
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        setAttachmentError(`"${f.name}" is too large. Maximum 5MB per file.`);
        continue;
      }
      valid.push(f);
    }
    setAttachments(prev => [...prev, ...valid]);
    e.target.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const [form, setForm] = useState({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    reason: '',
    halfDay: false,
    halfDaySlot: 'first_half' as 'first_half' | 'second_half',
  });

  const today = todayStr();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const sq = scopeQuery();
      const [empRes, ltRes, balRes, holRes] = await Promise.all([
        fetch(`/api/employees?limit=1&own=1&includePhotos=0${sq ? `&${sq}` : ''}`, { headers }),
        fetch(`/api/leave-types?limit=50${sq ? `&${sq}` : ''}`, { headers }).catch(() => null),
        fetch(`/api/leave/balance?limit=50${sq ? `&${sq}` : ''}`, { headers }).catch(() => null),
        fetch(`/api/holidays?limit=100${sq ? `&${sq}` : ''}`, { headers }).catch(() => null),
      ]);
      if (empRes.ok) {
        const empData = await empRes.json();
        const myEmp = empData.employees?.find((e: { email: string }) => e.email === user?.email) || empData.employees?.[0];
        if (myEmp) setEmployee(myEmp);
      }
      if (ltRes?.ok) {
        const ltData = await ltRes.json();
        setLeaveTypes(ltData.data || ltData.leaveTypes || []);
      }
      if (balRes?.ok) {
        const balData = await balRes.json();
        setLeaveBalances(balData.balances || balData.data || []);
      }
      if (holRes?.ok) {
        const holData = await holRes.json();
        setHolidays(holData.data || holData || []);
      }
    } catch (e) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user?.email, scopeQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Validation (only computed after submitAttempted = true) ──
  const errors: string[] = [];
  if (submitAttempted) {
    if (!form.leaveTypeId) errors.push('Leave type is required');
    if (!form.startDate) errors.push('Start date is required');
    if (!form.endDate) errors.push('End date is required');
    if (form.startDate && form.endDate && form.endDate < form.startDate) errors.push('End date cannot be before start date');
    if (!form.reason || form.reason.trim().length < 3) errors.push('Note is required (min 3 characters)');
  }

  const selectedBalance = leaveBalances.find(lb => lb.leaveType.id === form.leaveTypeId);
  const holidaySet = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
  const holidaysInRange = form.startDate && form.endDate
    ? holidays.filter(h => {
        const hd = new Date(h.date).toISOString().split('T')[0];
        return hd >= form.startDate && hd <= form.endDate;
      })
    : [];
  const workingDays = form.startDate && form.endDate ? getDaysBetween(form.startDate, form.endDate, holidaySet) : 0;
  const requestedDays = form.halfDay ? Math.max(0.5, workingDays * 0.5) : workingDays;

  const handleApply = async () => {
    setSubmitAttempted(true);
    // Re-validate
    const errs: string[] = [];
    if (!form.leaveTypeId) errs.push('Leave type is required');
    if (!form.startDate) errs.push('Start date is required');
    if (!form.endDate) errs.push('End date is required');
    if (form.startDate && form.endDate && form.endDate < form.startDate) errs.push('End date cannot be before start date');
    if (!form.reason || form.reason.trim().length < 3) errs.push('Note is required (min 3 characters)');
    if (errs.length > 0) {
      toast.error('Please fix the highlighted errors before submitting.');
      return;
    }
    if (!employee?.id) { toast.error('Employee record not found'); return; }
    if (form.startDate < today) {
      toast.error('Leave cannot be applied for past dates.');
      return;
    }
    // Balance check
    if (selectedBalance && selectedBalance.remaining === 0 && selectedBalance.leaveType.isPaid !== false) {
      toast.error(`No leave balance available for "${selectedBalance.leaveType.name}". Please choose LOP or contact HR.`);
      return;
    }
    if (selectedBalance && requestedDays > selectedBalance.remaining && selectedBalance.leaveType.isPaid !== false) {
      toast.error(`Insufficient balance. Available: ${selectedBalance.remaining} day(s). Requested: ${requestedDays} day(s).`);
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          employeeId: employee.id,
          leaveTypeId: form.leaveTypeId,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason,
          halfDay: form.halfDay,
          halfDaySlot: form.halfDay ? form.halfDaySlot : null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const d = await res.json().catch(() => ({}));
      const leaveRequestId = d.leaveRequest?.id;

      // Upload attachments if any were selected
      if (attachments.length > 0 && leaveRequestId) {
        try {
          for (const file of attachments) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('leaveRequestId', leaveRequestId);
            formData.append('fileName', file.name);
            formData.append('mimeType', file.type);
            formData.append('fileSize', String(file.size));
            formData.append('isMedical', /sick|medical/i.test(selectedBalance?.leaveType?.name || '') ? 'true' : 'false');
            await fetch('/api/leave/attachments/upload', {
              method: 'POST',
              headers: { ...(typeof window !== 'undefined' && localStorage.getItem('tb_token') ? { Authorization: `Bearer ${localStorage.getItem('tb_token')}` } : {}) },
              body: formData,
            }).catch(e => console.warn('Attachment upload failed (non-fatal):', e));
          }
        } catch (e) {
          console.warn('Attachment upload failed (non-fatal):', e);
        }
      }

      toast.success(d.days !== undefined ? `Leave request submitted (${d.days} working day(s))` : 'Leave request submitted');
      router.push('/leave');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => router.push('/leave');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <FiAlertCircle className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500 mb-3">No employee record found for your account.</p>
          <Link href="/leave" className="inline-flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700">
            <FiArrowLeft className="w-4 h-4" /> Back to Leave Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div>
        <nav className="flex items-center gap-1.5 text-sm text-slate-500 mb-2">
          <Link href="/leave" className="hover:text-green-600 transition-colors inline-flex items-center gap-1">
            <FiArrowLeft className="w-3.5 h-3.5" /> Leave
          </Link>
          <FiChevronRight className="w-3 h-3 text-slate-300" />
          <span className="text-slate-700 font-medium">Apply Leave</span>
        </nav>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FiPlus className="w-6 h-6 text-green-600" /> Apply Leave
        </h1>
        <p className="text-sm text-slate-500 mt-1">Submit a new leave request. Fields marked <span className="text-red-500">*</span> are required.</p>
      </div>

      {/* 2-column layout: form (left) + team sidebar (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

      {/* LEFT COLUMN: form (2/3) */}
      <div className="lg:col-span-2 space-y-5">

      {/* Validation error block — only shows after submit attempt */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <FiAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800 mb-1">Please fix the following:</p>
              <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Form card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 space-y-4">
          {/* Leave Type */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Leave Type <span className="text-red-500">*</span></label>
            <select
              value={form.leaveTypeId}
              onChange={e => setForm(p => ({ ...p, leaveTypeId: e.target.value }))}
              className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${submitAttempted && !form.leaveTypeId ? 'border-red-300 bg-red-50/30' : 'border-slate-200'}`}
            >
              <option value="">Select Leave Type</option>
              {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}{lt.defaultDays > 0 ? ` (${lt.defaultDays} days/yr)` : ''}</option>)}
            </select>
            {selectedBalance && (
              <p className="text-xs text-slate-500 mt-1">
                Balance: <strong className="text-emerald-600">{selectedBalance.remaining}</strong> / {selectedBalance.total} days remaining · {selectedBalance.used} used
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">From <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.startDate}
                min={today}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value, endDate: p.endDate < e.target.value ? e.target.value : p.endDate }))}
                className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${submitAttempted && !form.startDate ? 'border-red-300 bg-red-50/30' : 'border-slate-200'}`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">To <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate || today}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 ${submitAttempted && !form.endDate ? 'border-red-300 bg-red-50/30' : 'border-slate-200'}`}
              />
            </div>
          </div>

          {/* Duration info */}
          {form.startDate && form.endDate && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-100">
              <span className="text-sm text-green-700 font-medium">
                <FiClock className="w-4 h-4 inline mr-1" />
                Duration: {form.halfDay ? `${workingDays} working day(s) — 0.5 day for half day` : `${workingDays} working day(s)`}
              </span>
              {selectedBalance && (
                <span className="text-xs text-green-600 font-semibold">Remaining: {selectedBalance.remaining} days</span>
              )}
            </div>
          )}

          {/* Holidays in range */}
          {holidaysInRange.length > 0 && (
            <div className="p-3 rounded-lg bg-teal-50 border border-teal-200">
              <p className="text-xs font-semibold text-teal-800 mb-1.5"><FiCalendar className="w-3.5 h-3.5 inline mr-1" />Public Holidays in range:</p>
              <ul className="text-xs text-teal-700 space-y-0.5">
                {holidaysInRange.map(h => <li key={h.id}>• {h.name} — {new Date(h.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</li>)}
              </ul>
            </div>
          )}

          {/* Approver chain preview */}
          {form.leaveTypeId && <ApproverChainPreview module="leave" leaveTypeId={form.leaveTypeId} compact />}

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Reason / Note <span className="text-red-500">*</span></label>
            <textarea
              rows={3}
              value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-400 resize-none ${submitAttempted && (!form.reason || form.reason.trim().length < 3) ? 'border-red-300 bg-red-50/30' : 'border-slate-200'}`}
              placeholder="Provide a reason for your leave..."
            />
          </div>

          {/* Attachment upload (conditional — shown when policy requires it or always as optional) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Supporting Document
              {selectedBalance?.leaveType && (
                <span className="text-slate-400 ml-1">
                  (optional — required for sick leave {'>'} 2 days per policy)
                </span>
              )}
            </label>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 hover:border-green-300 transition-colors">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors text-xs font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.5 5.5L18 8m0 0l-2.5 2.5M18 8H9.5a3.5 3.5 0 000 7H12" /></svg>
                Choose File
                <input type="file" multiple onChange={handleAttachmentChange} className="hidden" accept=".png,.jpg,.jpeg,.gif,.pdf,.doc,.docx" />
              </label>
              {attachments.length === 0 ? (
                <p className="text-xs text-slate-400 mt-2">No file selected. PNG, JPG, PDF, DOC, DOCX (max 5MB each).</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {attachments.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-green-700 font-medium truncate flex-1">{f.name}</span>
                      <span className="text-xs text-green-500 ml-2">{(f.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => removeAttachment(i)} className="ml-2 text-red-400 hover:text-red-600">
                        <FiX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {attachmentError && <p className="text-xs text-red-500 mt-2">{attachmentError}</p>}
            </div>
          </div>

          {/* Half day */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.halfDay} onChange={e => setForm(p => ({ ...p, halfDay: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-green-500 focus:ring-green-500/20" />
            <span className="text-sm text-slate-700">Half Day Leave</span>
          </label>
          {form.halfDay && (
            <div className="ml-7 flex gap-2">
              <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${form.halfDaySlot === 'first_half' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>
                <input type="radio" checked={form.halfDaySlot === 'first_half'} onChange={() => setForm(p => ({ ...p, halfDaySlot: 'first_half' }))} className="hidden" />
                First Half
              </label>
              <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${form.halfDaySlot === 'second_half' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>
                <input type="radio" checked={form.halfDaySlot === 'second_half'} onChange={() => setForm(p => ({ ...p, halfDaySlot: 'second_half' }))} className="hidden" />
                Second Half
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button onClick={handleCancel} className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleApply} disabled={submitting} className="px-6 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors inline-flex items-center gap-2">
              {submitting ? <><FiClock className="w-4 h-4 animate-spin" /> Submitting...</> : <><FiCheck className="w-4 h-4" /> Submit Request</>}
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* RIGHT COLUMN: Team Leave Calendar sidebar */}
      <div className="lg:col-span-1">
        <TeamLeaveSidebar
          startDate={form.startDate}
          endDate={form.endDate}
          scopeQuery={scopeQuery()}
          employeeId={employee?.id}
          onDateSelect={(date) => {
            // First click → set startDate (and clear endDate so the user can pick the end).
            // Second click → if date >= startDate, set endDate. If date < startDate, make it the new startDate.
            setForm(prev => {
              if (!prev.startDate || (prev.startDate && prev.endDate)) {
                // Starting a new selection
                return { ...prev, startDate: date, endDate: '' };
              }
              // We have a startDate but no endDate yet
              if (date < prev.startDate) {
                // Clicked before start — make it the new start, keep old start as end
                return { ...prev, startDate: date, endDate: prev.startDate };
              }
              return { ...prev, endDate: date };
            });
          }}
        />
      </div>
      </div>
    </div>
  );
}
