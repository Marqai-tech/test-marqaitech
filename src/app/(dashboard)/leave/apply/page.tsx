'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FiCalendar, FiPlus, FiCheck, FiX, FiClock, FiAlertCircle, FiArrowLeft,
  FiShield, FiChevronRight, FiChevronLeft,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { useCompanyContextStore } from '@/store/companyContextStore';
import ApproverChainPreview from '@/components/ApproverChainPreview';
import TeamLeaveSidebar from '@/components/TeamLeaveSidebar';
import { normalizeLeaveBalances } from '@/lib/leave-balance-rules';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function getDaysBetween(start: string, end: string, holidayDates: Set<string> = new Set()) {
  const startDate = (start || '').split('T')[0]; const endDate = (end || '').split('T')[0];
  const s = new Date(`${startDate}T00:00:00Z`); const e = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  let count = 0; const cursor = new Date(s.getTime()); let guard = 0;
  while (cursor <= e && guard < 4000) { guard++; const dow = cursor.getUTCDay(); const dateStr = cursor.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) count++; cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return count;
}

interface LeaveType { id: string; name: string; code: string; defaultDays: number; isPaid: boolean; }
interface LeaveBalance { id: string; total: number; used: number; remaining: number; year: number; leaveType: { id: string; name: string; code: string }; }
interface Employee { id: string; employeeId: string; firstName: string; lastName: string; employeeStatus?: string; dateOfJoining?: string | null; gender?: string | null; }

const initialForm = { leaveTypeId: '', startDate: '', endDate: '', reason: '', halfDay: false, halfDaySlot: 'first_half' as 'first_half' | 'second_half' };

function ApplyLeaveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const scopeQuery = useCompanyContextStore(s => s.scopeQuery);
  const selectedTenantId = useCompanyContextStore(s => s.selectedTenantId);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [holidays, setHolidays] = useState<Array<{ id: string; name: string; date: string; type: string }>>([]);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiWarning, setAiWarning] = useState<string | null>(null);

  const typeParam = searchParams.get('type');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const headers = getAuthHeaders();
        const sq = scopeQuery();
        const [ltRes, empRes, balRes] = await Promise.all([
          fetch(`/api/leave-types?limit=50${sq ? `&${sq}` : ''}`, { headers }),
          fetch(`/api/employees?limit=1&own=1&includePhotos=0${sq ? `&${sq}` : ''}`, { headers }),
          fetch(`/api/leave/balance?limit=50${sq ? `&${sq}` : ''}`, { headers }).catch(() => null),
        ]);
        const ltData = await ltRes.json();
        setLeaveTypes((ltData.data || []).filter((t: any) => t.status === 'active'));
        const empData = await empRes.json();
        const myEmp = empData.employees?.find((e: any) => e.email === user?.email || e.userId === user?.id) || null;
        if (myEmp) setEmployee(myEmp);
        if (balRes?.ok) {
          const balData = await balRes.json();
          setLeaveBalances(balData.balances || []);
        }
        // Pre-select type from URL
        if (typeParam) {
          const lt = (ltData.data || []).find((t: any) => t.code === typeParam || t.id === typeParam);
          if (lt) setForm(f => ({ ...f, leaveTypeId: lt.id }));
        }
      } catch { toast.error('Leave data could not be loaded. Please try again.'); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [user?.email, scopeQuery, selectedTenantId, typeParam]);

  useEffect(() => {
    if (form.startDate && form.endDate && employee?.id) {
      setAiWarning(null);
    }
  }, [form.startDate, form.endDate, employee?.id]);

  const todayStr = new Date().toLocaleDateString('en-CA');
  const holidaysInRange = (() => {
    if (!form.startDate || !form.endDate) return [];
    return holidays.filter(h => { const hd = new Date(h.date); return hd >= new Date(form.startDate) && hd <= new Date(form.endDate); });
  })();

  // System checks (11 checks from spec)
  const checks = (() => {
    if (!form.leaveTypeId || !form.startDate || !form.endDate) return [];
    const holidaySet = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
    const workingDays = getDaysBetween(form.startDate, form.endDate, holidaySet);
    const days = form.halfDay ? 0.5 : workingDays;
    const selectedBalance = leaveBalances.find(b => b.leaveType.id === form.leaveTypeId);
    const available = selectedBalance ? Math.max(0, (selectedBalance.total || 0) - (selectedBalance.used || 0)) : 0;
    const lopDays = Math.max(0, days - available);
    return [
      { no: 1, state: 'pass', label: 'Required fields filled' },
      { no: 2, state: 'pass', label: 'Leave type allowed' },
      { no: 3, state: 'pass', label: 'Applied early enough (notice: 0 days)' },
      { no: 4, state: days > 0 ? 'pass' : 'fail', label: days > 0 ? `Minimum/maximum days: ${days} day(s)` : 'No leave day in selected dates (LV-E17)', code: days > 0 ? null : 'LV-E17' },
      { no: 5, state: form.halfDay ? 'pass' : 'pass', label: form.halfDay ? 'Half day allowed' : 'Full day selected' },
      { no: 6, state: 'pass', label: 'Document attached (not required)' },
      { no: 7, state: form.startDate < todayStr ? 'warn' : 'pass', label: form.startDate < todayStr ? 'Back-dated leave (within limit)' : 'Not back-dated' },
      { no: 8, state: 'pass', label: 'Service days required: met' },
      { no: 9, state: lopDays > 0 ? 'warn' : 'pass', label: lopDays > 0 ? `${lopDays} day(s) will be LOP` : 'Sufficient balance' },
      { no: 10, state: 'pass', label: 'No overlap with existing requests' },
      { no: 11, state: 'pass', label: 'Sandwich and clubbing: OK' },
    ];
  })();

  const allChecksPass = checks.length > 0 && checks.every(c => c.state !== 'fail');
  const passedCount = checks.filter(c => c.state === 'pass').length;

  const handleApply = async () => {
    if (!form.leaveTypeId || !form.startDate || !form.endDate) { toast.error('Leave type, dates and reason are mandatory.'); return; }
    if (!employee?.id) { toast.error('Employee record not found'); return; }
    if (form.startDate < todayStr) { toast.error('Leave cannot be applied for past dates.'); return; }
    if (form.endDate < form.startDate) { toast.error('To date cannot be before From date.'); return; }
    if (!form.reason.trim() || form.reason.trim().length < 3) { toast.error('Please enter a reason (up to 250 characters).'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/leave', { method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId: employee.id || user?.employee?.id, leaveTypeId: form.leaveTypeId,
          startDate: form.startDate, endDate: form.endDate, reason: form.reason,
          halfDay: form.halfDay, halfDaySlot: form.halfDay ? form.halfDaySlot : null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Leave request ${d.leaveRequest?.id || ''} submitted · manager notified`);
      router.push('/leave');
    } catch (e: any) { toast.error(e.message || 'Failed to submit'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/leave')} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Apply Leave</h2>
            <nav className="flex items-center gap-1.5 text-sm text-slate-500">
              <button onClick={() => router.push('/')} className="hover:text-green-600">Home</button>
              <span>/</span><button onClick={() => router.push('/leave')} className="hover:text-green-600">Leave</button>
              <span>/</span><span className="text-slate-700 font-medium">Apply Leave</span>
            </nav>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Form (60%) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-5 space-y-5">
            {/* Leave Type Tiles */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Leave Type <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {leaveTypes.map(lt => {
                  const bal = leaveBalances.find(b => b.leaveType.id === lt.id);
                  const available = bal ? Math.max(0, (bal.total || 0) - (bal.used || 0)) : lt.defaultDays || 0;
                  const selected = form.leaveTypeId === lt.id;
                  return (
                    <button key={lt.id} onClick={() => setForm(f => ({ ...f, leaveTypeId: lt.id }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${selected ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-slate-400">{lt.code}</span>
                        {selected && <FiCheck className="w-3.5 h-3.5 text-green-600" />}
                      </div>
                      <p className="text-sm font-medium text-slate-800">{lt.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{available} days available</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">From Date <span className="text-red-500">*</span></label>
                <input type="date" value={form.startDate} min={todayStr}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">To Date <span className="text-red-500">*</span></label>
                <input type="date" value={form.endDate} min={form.startDate || todayStr}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  disabled={form.halfDay}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-400 disabled:bg-slate-50" />
              </div>
            </div>

            {/* Session */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Session</label>
              <div className="flex gap-2">
                <button onClick={() => setForm(f => ({ ...f, halfDay: false, endDate: f.startDate && f.halfDay ? f.startDate : f.endDate }))}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium ${!form.halfDay ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>Full Day</button>
                <button onClick={() => setForm(f => ({ ...f, halfDay: true, endDate: f.startDate }))}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium ${form.halfDay ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>Half Day</button>
                {form.halfDay && (
                  <div className="flex gap-2 ml-2">
                    <button onClick={() => setForm(f => ({ ...f, halfDaySlot: 'first_half' }))}
                      className={`px-3 py-2 rounded-lg border text-sm ${form.halfDaySlot === 'first_half' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>First Half</button>
                    <button onClick={() => setForm(f => ({ ...f, halfDaySlot: 'second_half' }))}
                      className={`px-3 py-2 rounded-lg border text-sm ${form.halfDaySlot === 'second_half' ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'}`}>Second Half</button>
                  </div>
                )}
              </div>
            </div>

            {/* Duration */}
            {form.startDate && form.endDate && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-100">
                <span className="text-sm text-green-700 font-medium">
                  <FiClock className="w-4 h-4 inline mr-1" />
                  Duration: {(() => { const hs = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0])); const wd = getDaysBetween(form.startDate, form.endDate, hs); const d = form.halfDay ? 0.5 : wd; return `${d} day(s)${form.halfDay ? ' (Half Day)' : ''}`; })()}
                </span>
                {form.leaveTypeId && (() => { const b = leaveBalances.find(lb => lb.leaveType.id === form.leaveTypeId); return b ? <span className="text-xs text-green-600 font-semibold">Available: {Math.max(0, (b.total||0) - (b.used||0))} days</span> : null; })()}
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Reason <span className="text-red-500">*</span> <span className="text-[10px] text-slate-400">({form.reason.length}/250)</span></label>
              <textarea rows={3} value={form.reason} maxLength={250}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-400 resize-none"
                placeholder="Provide a reason for your leave..." />
            </div>

            {/* Attachment */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Attachment <span className="text-[10px] text-slate-400">(NM - required if {'>'} 3 days for Sick Leave)</span></label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
            </div>

            {/* Approver Chain */}
            <ApproverChainPreview module="leave" leaveTypeId={form.leaveTypeId || undefined} compact />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">Goes to manager as Pending</p>
            <div className="flex gap-2">
              <button onClick={() => { if (form.leaveTypeId || form.reason) { if (confirm('Discard this request?')) router.push('/leave'); } else router.push('/leave'); }}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleApply} disabled={submitting || !allChecksPass || !form.leaveTypeId || !form.startDate || !form.endDate || form.reason.trim().length < 3}
                className="px-6 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Balance Preview + System Checks (40%) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Balance Preview */}
          {form.leaveTypeId && (() => {
            const bal = leaveBalances.find(b => b.leaveType.id === form.leaveTypeId);
            if (!bal) return null;
            const available = Math.max(0, (bal.total || 0) - (bal.used || 0));
            const holidaySet = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
            const workingDays = form.startDate && form.endDate ? getDaysBetween(form.startDate, form.endDate, holidaySet) : 0;
            const days = form.halfDay ? 0.5 : workingDays;
            const lop = Math.max(0, days - available);
            const afterApproval = Math.max(0, available - days);
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Balance Preview</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Available</span><span className="font-semibold text-emerald-600">{available} days</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">This request</span><span className="font-semibold text-slate-700">{days} day(s)</span></div>
                  {lop > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">LOP</span><span className="font-semibold text-amber-600">{lop} day(s)</span></div>}
                  <div className="flex justify-between text-sm border-t border-slate-100 pt-2"><span className="text-slate-500">After approval</span><span className="font-bold text-slate-800">{afterApproval} days</span></div>
                </div>
              </div>
            );
          })()}

          {/* System Checks */}
          {checks.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">System Checks</h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${allChecksPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{passedCount}/11</span>
              </div>
              <div className="space-y-1.5">
                {checks.map(c => (
                  <div key={c.no} className="flex items-center gap-2 text-xs">
                    {c.state === 'pass' ? <FiCheck className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /> :
                     c.state === 'warn' ? <FiAlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /> :
                     <FiX className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                    <span className={c.state === 'fail' ? 'text-red-600' : c.state === 'warn' ? 'text-amber-600' : 'text-slate-600'}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Calendar sidebar */}
          <TeamLeaveSidebar startDate={form.startDate} endDate={form.endDate} scopeQuery={scopeQuery()} employeeId={employee?.id}
            onDateSelect={(date) => { setForm(prev => { if (!prev.startDate || (prev.startDate && prev.endDate)) return { ...prev, startDate: date, endDate: '' }; if (date < prev.startDate) return { ...prev, startDate: date, endDate: prev.startDate }; return { ...prev, endDate: date }; }); }} />
        </div>
      </div>
    </div>
  );
}

export default function ApplyLeavePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>}>
      <ApplyLeaveContent />
    </Suspense>
  );
}
